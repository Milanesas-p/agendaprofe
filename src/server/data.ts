import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import type { PoolConnection } from "mysql2/promise";
import { findSessionUser } from "./session-user";
import { db } from "./db";
import { balanceDelta, canAddToLesson, slots, validSettings, MAX_STUDENTS_PER_LESSON, type ClassStatus } from "@/lib/rules";
import { normalizePhone } from "@/lib/phone";
import { datesToGenerate } from "@/lib/recurrence";
import { CATEGORIES, COURT_SIDES, type Category, type CourtSide } from "@/lib/player";

export type StudentDto = {
  id: string;
  name: string;
  type: "fijo" | "rotativo";
  pay: "mensual" | "semanal";
  phone: string | null;
  /** Padel category and court side, or null when the teacher did not set them. */
  category: Category | null;
  courtSide: CourtSide | null;
  /** Weekly fixed slot, or null when the student has none. 0 = Sunday. */
  recurringWeekday: number | null;
  recurringTime: string | null;
  balance: number;
};

/** A weekly occurrence that could not be created, so the teacher can react. */
export type RecurringConflict = { studentId: string; studentName: string; date: string; time: string };

export type MaterializeResult = { created: number; conflicts: RecurringConflict[] };

export type LessonDto = {
  id: string;
  date: string;
  start: string;
  studentId: string;
  status: ClassStatus;
};

export type SettingsDto = {
  startHour: number;
  endHour: number;
  blockMin: number;
  /** Optional daily break, both sides together or both null. */
  breakStart: number | null;
  breakEnd: number | null;
};

export type Snapshot = { students: StudentDto[]; lessons: LessonDto[]; settings: SettingsDto };

const DEFAULT_SETTINGS: SettingsDto = { startHour: 8, endHour: 22, blockMin: 60, breakStart: null, breakEnd: null };

const STATUSES: readonly ClassStatus[] = ["programada", "presente", "ausente", "cancelada"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Every query is scoped by the session user; the client never supplies an owner. */
async function requireUserId(): Promise<string> {
  const user = await findSessionUser();
  if (!user) throw new Error("Iniciá sesión para guardar tus cambios.");
  return user.id;
}

/**
 * Runs `work` in a transaction pinned to REPEATABLE READ.
 *
 * The capacity checks count a block and then write, so two concurrent requests
 * could both see a free place. A populated block is protected by the record locks
 * a `FOR UPDATE` takes on its rows, but an empty block has no rows to lock: only
 * REPEATABLE READ gap locks stop a concurrent insert there. Pinning the level per
 * transaction keeps that guarantee from depending on the server or session
 * default, and `SET TRANSACTION` (not `SESSION`) cannot leak into another
 * transaction borrowed from the same pooled connection.
 */
async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await db().getConnection();
  try {
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    const code = (error as { code?: string }).code;
    // Two saves crossing on the same block end in a deadlock or a lock wait
    // timeout. The rollback already happened, so nothing was written and retrying
    // is safe: say that in Spanish instead of leaking the driver error.
    if (code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT") {
      throw new Error("No se pudo guardar: hubo dos cambios al mismo tiempo. Probá de nuevo.");
    }
    throw error;
  } finally {
    connection.release();
  }
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Dato inválido: ${field}.`);
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) throw new Error(`Dato inválido: ${field}.`);
  return trimmed;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`Dato inválido: ${field}.`);
  return value as T;
}

/** Optional whole hour: a missing value means "no break", not zero. */
function optionalInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  return integer(value, field);
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`Dato inválido: ${field}.`);
  return value;
}

/**
 * Reads the optional weekly slot. Weekday and time go together: either both are
 * present or the student has no fixed schedule.
 */
function recurringSlot(input: Record<string, unknown>): { weekday: number | null; time: string | null } {
  const weekday = input["recurringWeekday"];
  const time = input["recurringTime"];
  const noWeekday = weekday === null || weekday === undefined;
  const noTime = time === null || time === undefined;

  if (noWeekday && noTime) return { weekday: null, time: null };
  if (noWeekday || noTime) throw new Error("El horario fijo necesita día y hora.");
  if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error("Día de la semana inválido.");
  }
  if (typeof time !== "string" || !TIME_PATTERN.test(time)) throw new Error("Horario inválido.");
  return { weekday, time };
}

/**
 * Reads the optional player profile. A missing value clears it; anything present
 * must belong to the closed set the column's CHECK also enforces.
 */
function playerProfile(input: Record<string, unknown>): { category: Category | null; courtSide: CourtSide | null } {
  const category = input["category"];
  const courtSide = input["courtSide"];
  return {
    category: category === null || category === undefined ? null : oneOf(category, CATEGORIES, "categoría"),
    courtSide: courtSide === null || courtSide === undefined ? null : oneOf(courtSide, COURT_SIDES, "posición"),
  };
}

function rowId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-fA-F-]{36}$/.test(value)) throw new Error("Identificador inválido.");
  return value;
}

async function readSettings(ownerId: string): Promise<SettingsDto> {
  const [rows] = await db().execute(
    "SELECT start_hour, end_hour, block_min, break_start, break_end FROM court_settings WHERE owner_id = ?",
    [ownerId],
  );
  const row = (rows as Array<{ start_hour: number; end_hour: number; block_min: number; break_start: number | null; break_end: number | null }>)[0];
  if (!row) return DEFAULT_SETTINGS;
  return {
    startHour: row.start_hour,
    endHour: row.end_hour,
    blockMin: row.block_min,
    breakStart: row.break_start ?? null,
    breakEnd: row.break_end ?? null,
  };
}

/**
 * A `students` row exactly as MySQL returns it. Kept separate from `StudentDto`
 * so the snake_case to camelCase step is explicit: reading the wrong key used to
 * turn a saved value into `undefined` and then into `null` on the client.
 */
type RawStudentRow = {
  id: string;
  name: string;
  type: StudentDto["type"];
  pay: StudentDto["pay"];
  phone: string | null;
  category: Category | null;
  court_side: CourtSide | null;
  recurring_weekday: number | null;
  recurring_time: string | null;
  balance: number;
};

export const getSnapshot = createServerFn({ method: "GET" }).handler(async (): Promise<Snapshot> => {
  const ownerId = await requireUserId();
  const [studentRows] = await db().execute(
    "SELECT id, name, type, pay, phone, category, court_side, recurring_weekday, recurring_time, balance FROM students WHERE owner_id = ? ORDER BY name",
    [ownerId],
  );
  const [lessonRows] = await db().execute(
    "SELECT id, lesson_date, start_time, student_id, status FROM lessons WHERE owner_id = ? ORDER BY lesson_date, start_time",
    [ownerId],
  );
  const students = (studentRows as RawStudentRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    pay: s.pay,
    phone: s.phone ?? null,
    category: (s.category ?? null) as Category | null,
    courtSide: (s.court_side ?? null) as CourtSide | null,
    recurringWeekday: s.recurring_weekday === null || s.recurring_weekday === undefined ? null : Number(s.recurring_weekday),
    recurringTime: s.recurring_time ?? null,
    balance: Number(s.balance),
  }));
  const lessons = (
    lessonRows as Array<{ id: string; lesson_date: string; start_time: string; student_id: string; status: ClassStatus }>
  ).map((l) => ({
    id: l.id,
    date: l.lesson_date,
    start: l.start_time,
    studentId: l.student_id,
    status: l.status,
  }));
  return { students, lessons, settings: await readSettings(ownerId) };
});

export const addStudent = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    return {
      name: text(raw["name"], "nombre", 120),
      type: oneOf(raw["type"], ["fijo", "rotativo"] as const, "tipo"),
      pay: oneOf(raw["pay"], ["mensual", "semanal"] as const, "modalidad de pago"),
      phone: normalizePhone(raw["phone"]),
      ...playerProfile(raw),
      ...recurringSlot(raw),
      balance: integer(raw["balance"], "clases pagadas"),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    const ownerId = await requireUserId();
    const id = randomUUID();
    await db().execute(
      "INSERT INTO students (id, owner_id, name, type, pay, phone, category, court_side, recurring_weekday, recurring_time, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, ownerId, data.name, data.type, data.pay, data.phone, data.category, data.courtSide, data.weekday, data.time, data.balance],
    );
    return id;
  });

export const updateStudent = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    return {
      id: rowId(raw["id"]),
      name: text(raw["name"], "nombre", 120),
      type: oneOf(raw["type"], ["fijo", "rotativo"] as const, "tipo"),
      pay: oneOf(raw["pay"], ["mensual", "semanal"] as const, "modalidad de pago"),
      phone: normalizePhone(raw["phone"]),
      ...playerProfile(raw),
      ...recurringSlot(raw),
    };
  })
  .handler(async ({ data }): Promise<void> => {
    const ownerId = await requireUserId();
    // The balance is deliberately not touchable here: it only moves through
    // attendance or an explicit +/- adjustment. Changing the weekly slot is not
    // retroactive: occurrences already created stay where they are.
    const [result] = await db().execute(
      "UPDATE students SET name = ?, type = ?, pay = ?, phone = ?, category = ?, court_side = ?, recurring_weekday = ?, recurring_time = ? WHERE id = ? AND owner_id = ?",
      [data.name, data.type, data.pay, data.phone, data.category, data.courtSide, data.weekday, data.time, data.id, ownerId],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) throw new Error("Ese alumno no existe.");
  });

export const adjustBalance = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const delta = integer(raw["delta"], "ajuste");
    if (delta !== 1 && delta !== -1) throw new Error("Ajuste inválido.");
    return { id: rowId(raw["id"]), delta };
  })
  .handler(async ({ data }): Promise<void> => {
    const ownerId = await requireUserId();
    const [result] = await db().execute(
      "UPDATE students SET balance = balance + ? WHERE id = ? AND owner_id = ?",
      [data.delta, data.id, ownerId],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) throw new Error("Ese alumno no existe.");
  });

export const addLesson = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const date = raw["date"];
    const start = raw["start"];
    if (typeof date !== "string" || !DATE_PATTERN.test(date)) throw new Error("Fecha inválida.");
    if (typeof start !== "string" || !TIME_PATTERN.test(start)) throw new Error("Horario inválido.");
    return { date, start, studentId: rowId(raw["studentId"]) };
  })
  .handler(async ({ data }): Promise<string> => {
    const ownerId = await requireUserId();
    const settings = await readSettings(ownerId);
    if (!slots(settings).includes(data.start)) {
      throw new Error("Horario fuera de los bloques configurados.");
    }
    const id = randomUUID();
    // Same value the generated `slot_key` column computes for an active row.
    const slotKey = `${data.date}#${data.start}`;

    await withTransaction(async (connection) => {
      // Cancelled rows have a NULL slot_key, so this counts only active students.
      // FOR UPDATE makes this a locking read: on a populated block it holds record
      // locks on the rows it counted, and on an empty block REPEATABLE READ gap
      // locks stop the concurrent insert. A plain COUNT would read a snapshot, so
      // two requests could both count three and each write a fourth and a fifth.
      const [rows] = await connection.execute(
        "SELECT COUNT(*) AS n FROM lessons WHERE owner_id = ? AND slot_key = ? FOR UPDATE",
        [ownerId, slotKey],
      );
      const active = Number((rows as Array<{ n: number }>)[0]?.n ?? 0);
      if (!canAddToLesson(active)) {
        throw new Error(`Esta clase ya tiene ${MAX_STUDENTS_PER_LESSON} alumnos.`);
      }

      try {
        // The composite FK (student_id, owner_id) rejects a student from another
        // owner; the unique key rejects the same student twice in this slot.
        await connection.execute(
          "INSERT INTO lessons (id, owner_id, lesson_date, start_time, student_id) VALUES (?, ?, ?, ?, ?)",
          [id, ownerId, data.date, data.start, data.studentId],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
          throw new Error("Ese alumno ya está en esta clase.");
        }
        throw error;
      }
    });

    return id;
  });

export const setLessonStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { id: rowId(raw["id"]), status: oneOf(raw["status"], STATUSES, "estado") };
  })
  .handler(async ({ data }): Promise<void> => {
    const ownerId = await requireUserId();
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        "SELECT status, student_id FROM lessons WHERE id = ? AND owner_id = ? FOR UPDATE",
        [data.id, ownerId],
      );
      const row = (rows as Array<{ status: ClassStatus; student_id: string }>)[0];
      if (!row) throw new Error("Esa clase no existe.");

      const delta = balanceDelta(row.status, data.status);
      await connection.execute("UPDATE lessons SET status = ? WHERE id = ? AND owner_id = ?", [
        data.status,
        data.id,
        ownerId,
      ]);
      if (delta !== 0) {
        await connection.execute(
          "UPDATE students SET balance = balance + ? WHERE id = ? AND owner_id = ?",
          [delta, row.student_id, ownerId],
        );
      }
    });
  });

/**
 * Tops up every student's weekly slot up to the horizon.
 *
 * Idempotent and monotonic: it only looks at dates after each student's
 * `recurring_last_date`, so an occurrence the teacher already moved or cancelled
 * is never recreated. A slot that is already full stops that student's top-up and
 * is reported, never swallowed.
 */
export const materializeRecurring = createServerFn({ method: "POST" }).handler(
  async (): Promise<MaterializeResult> => {
    const ownerId = await requireUserId();
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const allowed = slots(await readSettings(ownerId));

    const [rows] = await db().execute(
      "SELECT id, name, recurring_weekday, recurring_time, recurring_last_date FROM students WHERE owner_id = ? AND recurring_weekday IS NOT NULL",
      [ownerId],
    );
    const series = rows as Array<{
      id: string;
      name: string;
      recurring_weekday: number;
      recurring_time: string;
      recurring_last_date: string | null;
    }>;
    if (series.length === 0) return { created: 0, conflicts: [] };

    let created = 0;
    const conflicts: RecurringConflict[] = [];

    await withTransaction(async (connection) => {
      for (const student of series) {
        const weekday = Number(student.recurring_weekday);
        const time = student.recurring_time;

        if (!allowed.includes(time)) {
          // The blocks were reconfigured under the series; report instead of guessing.
          conflicts.push({ studentId: student.id, studentName: student.name, date: today, time });
          continue;
        }

        let resolved: string | null = null;
        for (const date of datesToGenerate(weekday, student.recurring_last_date, today)) {
          // Any row means this occurrence was already handled, moved or cancelled.
          const [existing] = await connection.execute(
            "SELECT id FROM lessons WHERE owner_id = ? AND student_id = ? AND lesson_date = ? AND start_time = ?",
            [ownerId, student.id, date, time],
          );
          if ((existing as unknown[]).length > 0) {
            resolved = date;
            continue;
          }

          const [countRows] = await connection.execute(
            "SELECT COUNT(*) AS n FROM lessons WHERE owner_id = ? AND slot_key = ? FOR UPDATE",
            [ownerId, `${date}#${time}`],
          );
          const active = Number((countRows as Array<{ n: number }>)[0]?.n ?? 0);
          if (!canAddToLesson(active)) {
            // Stop here so the week stays pending and the warning repeats.
            conflicts.push({ studentId: student.id, studentName: student.name, date, time });
            break;
          }

          await connection.execute(
            "INSERT INTO lessons (id, owner_id, lesson_date, start_time, student_id) VALUES (?, ?, ?, ?, ?)",
            [randomUUID(), ownerId, date, time, student.id],
          );
          created += 1;
          resolved = date;
        }

        if (resolved && resolved !== student.recurring_last_date) {
          await connection.execute(
            "UPDATE students SET recurring_last_date = ? WHERE id = ? AND owner_id = ?",
            [resolved, student.id, ownerId],
          );
        }
      }
    });

    return { created, conflicts };
  },
);

/**
 * Relocates one occurrence. The original slot is genuinely released, so another
 * student can take it; the weekly series and the balance are untouched.
 */
export const moveLesson = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const date = raw["date"];
    const start = raw["start"];
    if (typeof date !== "string" || !DATE_PATTERN.test(date)) throw new Error("Fecha inválida.");
    if (typeof start !== "string" || !TIME_PATTERN.test(start)) throw new Error("Horario inválido.");
    return { id: rowId(raw["id"]), date, start };
  })
  .handler(async ({ data }): Promise<void> => {
    const ownerId = await requireUserId();
    const allowed = slots(await readSettings(ownerId));
    if (!allowed.includes(data.start)) throw new Error("Horario fuera de los bloques configurados.");

    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        "SELECT lesson_date, start_time, student_id, status FROM lessons WHERE id = ? AND owner_id = ? FOR UPDATE",
        [data.id, ownerId],
      );
      const lesson = (rows as Array<{ lesson_date: string; start_time: string; student_id: string; status: ClassStatus }>)[0];
      if (!lesson) throw new Error("Esa clase no existe.");
      if (lesson.status !== "programada") {
        throw new Error("Primero deshacé la asistencia para poder moverla.");
      }
      if (lesson.lesson_date === data.date && lesson.start_time === data.start) return;

      // Locking read of the destination block, so two concurrent moves cannot both
      // see room for one more. It runs before the snapshot reads below on purpose:
      // acquiring the lock first makes them see the rows a concurrent transaction
      // just committed instead of a stale snapshot.
      const [countRows] = await connection.execute(
        "SELECT COUNT(*) AS n FROM lessons WHERE owner_id = ? AND slot_key = ? FOR UPDATE",
        [ownerId, `${data.date}#${data.start}`],
      );
      const active = Number((countRows as Array<{ n: number }>)[0]?.n ?? 0);
      if (!canAddToLesson(active)) {
        throw new Error(`Esa clase ya tiene ${MAX_STUDENTS_PER_LESSON} alumnos.`);
      }

      const [duplicate] = await connection.execute(
        "SELECT id FROM lessons WHERE owner_id = ? AND student_id = ? AND lesson_date = ? AND start_time = ? AND status <> 'cancelada' AND id <> ?",
        [ownerId, lesson.student_id, data.date, data.start, data.id],
      );
      if ((duplicate as unknown[]).length > 0) throw new Error("Ese alumno ya está en ese horario.");

      await connection.execute(
        "UPDATE lessons SET lesson_date = ?, start_time = ? WHERE id = ? AND owner_id = ?",
        [data.date, data.start, data.id, ownerId],
      );
    });
  });

/** The teacher's own display name, shown in the app header. */
export const updateProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { name: text(raw["name"], "nombre", 120) };
  })
  .handler(async ({ data }): Promise<void> => {
    const ownerId = await requireUserId();
    await db().execute("UPDATE users SET display_name = ? WHERE id = ?", [data.name, ownerId]);
  });

export const saveSettings = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const breakStart = optionalInteger(raw["breakStart"], "inicio del corte");
    const breakEnd = optionalInteger(raw["breakEnd"], "fin del corte");
    const settings: SettingsDto = {
      startHour: integer(raw["startHour"], "hora de inicio"),
      endHour: integer(raw["endHour"], "hora de fin"),
      blockMin: integer(raw["blockMin"], "duración"),
      breakStart,
      breakEnd,
    };
    if (!validSettings(settings)) throw new Error("Revisá las horas: el corte tiene que entrar en la jornada y caer en un bloque.");
    return settings;
  })
  .handler(async ({ data }): Promise<void> => {
    const ownerId = await requireUserId();
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        "SELECT start_time FROM lessons WHERE owner_id = ? AND status <> 'cancelada'",
        [ownerId],
      );
      const allowed = slots(data);
      const orphan = (rows as Array<{ start_time: string }>).find((l) => !allowed.includes(l.start_time));
      if (orphan) {
        throw new Error("Los nuevos bloques dejarían clases existentes fuera de la agenda.");
      }
      await connection.execute(
        `INSERT INTO court_settings (owner_id, start_hour, end_hour, block_min, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?) AS incoming
         ON DUPLICATE KEY UPDATE start_hour = incoming.start_hour, end_hour = incoming.end_hour, block_min = incoming.block_min,
           break_start = incoming.break_start, break_end = incoming.break_end`,
        [ownerId, data.startHour, data.endHour, data.blockMin, data.breakStart, data.breakEnd],
      );
    });
  });
