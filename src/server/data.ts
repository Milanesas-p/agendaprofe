import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import type { PoolConnection } from "mysql2/promise";
import { findSessionUser } from "./session-user";
import { db } from "./db";
import {
  balanceDelta,
  canAddToLesson,
  fixedSlotsOutsideBlocks,
  outsideBlocksMessage,
  slots,
  validSettings,
  MAX_STUDENTS_PER_LESSON,
  type ClassStatus,
  type FixedSlot,
} from "@/lib/rules";
import { normalizePhone } from "@/lib/phone";
import { datesToGenerate, addIsoDays, type StudentSlot } from "@/lib/recurrence";
import { LESSON_WINDOW_FUTURE_DAYS, LESSON_WINDOW_PAST_DAYS } from "@/lib/lesson-window";
import { CATEGORIES, COURT_SIDES, type Category, type CourtSide } from "@/lib/player";
import { PAY_MODES, type PayMode } from "@/lib/pay";
import { isStudentId } from "@/lib/import";

export type StudentDto = {
  id: string;
  name: string;
  type: "fijo" | "rotativo";
  /** Null when the teacher did not decide the mode yet. */
  pay: PayMode | null;
  phone: string | null;
  /** Player profile, or null when the teacher did not set it. */
  category: Category | null;
  courtSide: CourtSide | null;
  /** Weekly slots; a `fijo` gets every one booked and a `rotativo` keeps them habitual. */
  slots: StudentSlot[];
  balance: number;
  /** False while the student is paused (e.g. summer): no new classes are booked. */
  active: boolean;
};

/** A weekly occurrence that could not be created, so the teacher can react. */
export type RecurringConflict = {
  studentId: string;
  studentName: string;
  date: string;
  time: string;
  /** Why it was skipped: the block is full, or the workday no longer has that time. */
  reason: "full" | "outside-blocks";
};

export type MaterializeResult = { created: number; conflicts: RecurringConflict[] };

export type LessonDto = {
  id: string;
  date: string;
  start: string;
  studentId: string;
  status: ClassStatus;
  /** True once the teacher sent this class' WhatsApp reminder. */
  notified: boolean;
  /** Original slot when the teacher moved it, or null. */
  movedFrom: { date: string; start: string } | null;
};

export type SettingsDto = {
  startHour: number;
  endHour: number;
  blockMin: number;
  /** Optional daily break, both sides together or both null. */
  breakStart: number | null;
  breakEnd: number | null;
  /** Bulk notice template; null means the client uses the factory one. */
  noticeTemplate: string | null;
};

export type Snapshot = { students: StudentDto[]; lessons: LessonDto[]; settings: SettingsDto };

const DEFAULT_SETTINGS: SettingsDto = {
  startHour: 8,
  endHour: 22,
  blockMin: 60,
  breakStart: null,
  breakEnd: null,
  noticeTemplate: null,
};

const STATUSES: readonly ClassStatus[] = [
  "programada",
  "confirmado",
  "presente",
  "ausente",
  "cancelada",
];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
/** Mirrors the column width, so MySQL never silently truncates a template. */
const NOTICE_TEMPLATE_MAX = 400;

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
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw new Error(`Dato inválido: ${field}.`);
  return value as T;
}

/** Optional payment mode: NULL means the teacher left it undecided. */
function payMode(value: unknown): PayMode | null {
  if (value === null || value === undefined || value === "") return null;
  return oneOf(value, PAY_MODES, "modalidad de pago");
}

/** Optional whole hour: a missing value means "no break", not zero. */
function optionalInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  return integer(value, field);
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new Error(`Dato inválido: ${field}.`);
  return value;
}

/**
 * Reads the weekly slots. A student may have several; duplicates are collapsed and
 * the list is sorted so the sheet and the screen always read the same order.
 */
function slotsOf(input: Record<string, unknown>): { slots: StudentSlot[] } {
  const raw = input["slots"];
  if (raw === undefined || raw === null) return { slots: [] };
  if (!Array.isArray(raw)) throw new Error("Horarios inválidos.");

  const seen = new Set<string>();
  const slots: StudentSlot[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") throw new Error("Horario inválido.");
    const slot = item as Record<string, unknown>;
    const weekday = slot["weekday"];
    const time = slot["time"];
    if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new Error("Día de la semana inválido.");
    }
    if (typeof time !== "string" || !TIME_PATTERN.test(time)) throw new Error("Horario inválido.");
    const key = `${weekday}#${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ weekday, time });
  }

  return { slots: slots.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time)) };
}

/**
 * Makes the stored slots match `slots`: existing rows stay (they carry their
 * generation marker), removed ones go, and only missing ones are inserted.
 */
async function syncSlots(
  connection: PoolConnection,
  ownerId: string,
  studentId: string,
  slots: readonly StudentSlot[],
): Promise<void> {
  const [rows] = await connection.execute(
    "SELECT weekday, start_time FROM student_slots WHERE owner_id = ? AND student_id = ?",
    [ownerId, studentId],
  );
  const existing = new Map(
    (rows as Array<{ weekday: number; start_time: string }>).map((row) => [
      `${Number(row.weekday)}#${row.start_time}`,
      row,
    ]),
  );
  const wanted = new Set(slots.map((slot) => `${slot.weekday}#${slot.time}`));

  for (const [key, row] of existing) {
    if (wanted.has(key)) continue;
    await connection.execute(
      "DELETE FROM student_slots WHERE owner_id = ? AND student_id = ? AND weekday = ? AND start_time = ?",
      [ownerId, studentId, Number(row.weekday), row.start_time],
    );
  }
  for (const slot of slots) {
    if (existing.has(`${slot.weekday}#${slot.time}`)) continue;
    await connection.execute(
      "INSERT INTO student_slots (id, owner_id, student_id, weekday, start_time) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), ownerId, studentId, slot.weekday, slot.time],
    );
  }
}

/**
 * Reads the optional player profile. A missing value clears it; anything present
 * must belong to the closed set the column's CHECK also enforces.
 */
function playerProfile(input: Record<string, unknown>): {
  category: Category | null;
  courtSide: CourtSide | null;
} {
  const category = input["category"];
  const courtSide = input["courtSide"];
  return {
    category:
      category === null || category === undefined ? null : oneOf(category, CATEGORIES, "categoría"),
    courtSide:
      courtSide === null || courtSide === undefined
        ? null
        : oneOf(courtSide, COURT_SIDES, "posición"),
  };
}

function rowId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-fA-F-]{36}$/.test(value))
    throw new Error("Identificador inválido.");
  return value;
}

/** The id of a student a row updates, or null when the row creates a new one. */
function optionalStudentId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !isStudentId(value)) throw new Error("Identificador inválido.");
  return value;
}

async function readSettings(ownerId: string): Promise<SettingsDto> {
  const [rows] = await db().execute(
    "SELECT start_hour, end_hour, block_min, break_start, break_end, notice_template FROM court_settings WHERE owner_id = ?",
    [ownerId],
  );
  const row = (
    rows as Array<{
      start_hour: number;
      end_hour: number;
      block_min: number;
      break_start: number | null;
      break_end: number | null;
      notice_template: string | null;
    }>
  )[0];
  if (!row) return DEFAULT_SETTINGS;
  return {
    startHour: row.start_hour,
    endHour: row.end_hour,
    blockMin: row.block_min,
    breakStart: row.break_start ?? null,
    breakEnd: row.break_end ?? null,
    noticeTemplate: row.notice_template ?? null,
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
  balance: number;
  active: number | boolean;
};

export const getSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<Snapshot> => {
    const ownerId = await requireUserId();
    const [studentRows] = await db().execute(
      "SELECT id, name, type, pay, phone, category, court_side, balance, active FROM students WHERE owner_id = ? ORDER BY name",
      [ownerId],
    );
    const [slotRows] = await db().execute(
      "SELECT student_id, weekday, start_time FROM student_slots WHERE owner_id = ? ORDER BY weekday, start_time",
      [ownerId],
    );
    const slotsByStudent = new Map<string, StudentSlot[]>();
    for (const row of slotRows as Array<{
      student_id: string;
      weekday: number;
      start_time: string;
    }>) {
      const list = slotsByStudent.get(row.student_id) ?? [];
      list.push({ weekday: Number(row.weekday), time: row.start_time });
      slotsByStudent.set(row.student_id, list);
    }
    const [lessonRows] = await db().execute(
      `SELECT id, lesson_date, start_time, student_id, status, notified_at IS NOT NULL AS notified,
        moved_from_date, moved_from_start
      FROM lessons WHERE owner_id = ?
        AND lesson_date BETWEEN DATE_SUB(CURDATE(), INTERVAL ? DAY) AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
      ORDER BY lesson_date, start_time`,
      [ownerId, LESSON_WINDOW_PAST_DAYS, LESSON_WINDOW_FUTURE_DAYS],
    );
    const students = (studentRows as RawStudentRow[]).map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      pay: s.pay,
      phone: s.phone ?? null,
      category: (s.category ?? null) as Category | null,
      courtSide: (s.court_side ?? null) as CourtSide | null,
      slots: slotsByStudent.get(s.id) ?? [],
      balance: Number(s.balance),
      active: Boolean(Number(s.active)),
    }));
    const lessons = (
      lessonRows as Array<{
        id: string;
        lesson_date: string;
        start_time: string;
        student_id: string;
        status: ClassStatus;
        notified: number | boolean;
        moved_from_date: string | null;
        moved_from_start: string | null;
      }>
    ).map((l) => ({
      id: l.id,
      date: l.lesson_date,
      start: l.start_time,
      studentId: l.student_id,
      status: l.status,
      notified: Boolean(Number(l.notified)),
      movedFrom:
        l.moved_from_date && l.moved_from_start
          ? { date: l.moved_from_date, start: l.moved_from_start }
          : null,
    }));
    return { students, lessons, settings: await readSettings(ownerId) };
  },
);

export const addStudent = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    return {
      name: text(raw["name"], "nombre", 120),
      type: oneOf(raw["type"], ["fijo", "rotativo"] as const, "tipo"),
      pay: payMode(raw["pay"]),
      phone: normalizePhone(raw["phone"]),
      ...playerProfile(raw),
      ...slotsOf(raw),
      balance: integer(raw["balance"], "clases pagadas"),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    const ownerId = await requireUserId();
    const id = randomUUID();
    await withTransaction(async (connection) => {
      await connection.execute(
        "INSERT INTO students (id, owner_id, name, type, pay, phone, category, court_side, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          ownerId,
          data.name,
          data.type,
          data.pay,
          data.phone,
          data.category,
          data.courtSide,
          data.balance,
        ],
      );
      await syncSlots(connection, ownerId, id, data.slots);
    });
    return id;
  });

export const updateStudent = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const active = raw["active"];
    if (active !== undefined && active !== null && typeof active !== "boolean")
      throw new Error("Dato inválido: estado del alumno.");
    return {
      id: rowId(raw["id"]),
      name: text(raw["name"], "nombre", 120),
      type: oneOf(raw["type"], ["fijo", "rotativo"] as const, "tipo"),
      pay: payMode(raw["pay"]),
      phone: normalizePhone(raw["phone"]),
      ...playerProfile(raw),
      ...slotsOf(raw),
      /** Null means "leave the current state alone". */
      active: (active ?? null) as boolean | null,
    };
  })
  .handler(async ({ data }): Promise<MaterializeResult> => {
    const ownerId = await requireUserId();
    const today = localToday();
    // The balance is deliberately not touchable here: it only moves through
    // attendance or an explicit +/- adjustment. Changing the weekly slots is not
    // retroactive: occurrences already created stay where they are.
    return withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        "SELECT active FROM students WHERE id = ? AND owner_id = ? FOR UPDATE",
        [data.id, ownerId],
      );
      const current = (rows as Array<{ active: number | boolean }>)[0];
      if (!current) throw new Error("Ese alumno no existe.");
      const wasActive = Boolean(Number(current.active));
      const nextActive = data.active ?? wasActive;

      const [result] = await connection.execute(
        "UPDATE students SET name = ?, type = ?, pay = ?, phone = ?, category = ?, court_side = ?, active = ? WHERE id = ? AND owner_id = ?",
        [
          data.name,
          data.type,
          data.pay,
          data.phone,
          data.category,
          data.courtSide,
          nextActive ? 1 : 0,
          data.id,
          ownerId,
        ],
      );
      if ((result as { affectedRows: number }).affectedRows === 0)
        throw new Error("Ese alumno no existe.");
      await syncSlots(connection, ownerId, data.id, data.slots);

      if (wasActive && !nextActive) {
        // Future occurrences are plans, not history: remove the ones still
        // scheduled so the slot is released. A manual cancellation is kept, so
        // the recurrence never resurrects a class the teacher cancelled on purpose.
        await connection.execute(
          "DELETE FROM lessons WHERE owner_id = ? AND student_id = ? AND lesson_date > ? AND status IN ('programada', 'confirmado')",
          [ownerId, data.id, today],
        );
        // The marker goes back one day, so enabling later books the schedule again.
        await connection.execute(
          "UPDATE student_slots SET last_generated = ? WHERE owner_id = ? AND student_id = ?",
          [addIsoDays(today, -1), ownerId, data.id],
        );
        return { created: 0, conflicts: [] };
      }
      if (!wasActive && nextActive) {
        // Coming back: fill the fixed slots in the same transaction, honouring the
        // capacity rule. The conflicts go back to the client so the teacher sees
        // which reactivated slot could not be booked.
        const allowed = slots(await readSettings(ownerId));
        return materializeOn(connection, ownerId, allowed, today);
      }
      return { created: 0, conflicts: [] };
    });
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
    if ((result as { affectedRows: number }).affectedRows === 0)
      throw new Error("Ese alumno no existe.");
  });

export const addLesson = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const date = raw["date"];
    const start = raw["start"];
    if (typeof date !== "string" || !DATE_PATTERN.test(date)) throw new Error("Fecha inválida.");
    if (typeof start !== "string" || !TIME_PATTERN.test(start))
      throw new Error("Horario inválido.");
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
          "INSERT INTO lessons (id, owner_id, lesson_date, start_time, student_id, slot_key) VALUES (?, ?, ?, ?, ?, ?)",
          [id, ownerId, data.date, data.start, data.studentId, slotKey],
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
      // The slot key is written here instead of coming from a generated column:
      // MariaDB rejects conditional expressions in GENERATED ALWAYS AS (IF and CASE
      // both fail with error 1901). A cancelled class stores NULL so the unique key
      // (owner, slot_key, student) only guards active bookings.
      await connection.execute(
        "UPDATE lessons SET status = ?, slot_key = CASE WHEN ? = 'cancelada' THEN NULL ELSE CONCAT(lesson_date, '#', start_time) END WHERE id = ? AND owner_id = ?",
        [data.status, data.status, data.id, ownerId],
      );
      if (delta !== 0) {
        await connection.execute(
          "UPDATE students SET balance = balance + ? WHERE id = ? AND owner_id = ?",
          [delta, row.student_id, ownerId],
        );
      }
    });
  });

/**
 * Remembers whether the teacher already told this student about this class on
 * WhatsApp. Owner scoped, and it never touches attendance or the balance.
 */
export const setLessonNotified = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    if (typeof raw["notified"] !== "boolean") throw new Error("Estado inválido.");
    return { id: rowId(raw["id"]), notified: raw["notified"] };
  })
  .handler(async ({ data }): Promise<void> => {
    const ownerId = await requireUserId();
    const [result] = await db().execute(
      "UPDATE lessons SET notified_at = IF(?, NOW(), NULL) WHERE id = ? AND owner_id = ?",
      [data.notified ? 1 : 0, data.id, ownerId],
    );
    if (!(result as { affectedRows?: number }).affectedRows)
      throw new Error("Esa clase no existe.");
  });

/** Today's local calendar date as `YYYY-MM-DD`, the floor for every top-up. */
function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

type FixedSeriesRow = {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  last_generated: string | null;
};

/**
 * Tops up every fixed student's weekly slots up to the horizon, inside the
 * caller's transaction.
 *
 * Idempotent and monotonic: it only looks at dates after each slot's
 * `last_generated`, so an occurrence the teacher already moved or cancelled
 * is never recreated. Only `fijo` slots are booked; a `rotativo` keeps its slots
 * as habitual times and is never booked automatically. A slot that is already full
 * stops that series and is reported, never swallowed.
 *
 * It reads its own series through the given connection, so saving the working
 * hours can run this exact top-up atomically with the new day.
 */
async function materializeOn(
  connection: PoolConnection,
  ownerId: string,
  allowed: string[],
  today: string,
): Promise<MaterializeResult> {
  const [rows] = await connection.execute(
    `SELECT s.id, s.name, sl.weekday, sl.start_time, sl.last_generated
       FROM student_slots sl
       JOIN students s ON s.id = sl.student_id AND s.owner_id = sl.owner_id
      WHERE sl.owner_id = ? AND s.type = 'fijo' AND s.active = 1
      ORDER BY s.name, sl.weekday, sl.start_time`,
    [ownerId],
  );
  const series = rows as FixedSeriesRow[];
  if (series.length === 0) return { created: 0, conflicts: [] };

  let created = 0;
  const conflicts: RecurringConflict[] = [];

  for (const slot of series) {
    const weekday = Number(slot.weekday);
    const time = slot.start_time;

    if (!allowed.includes(time)) {
      // The blocks were reconfigured under the series; report instead of guessing.
      conflicts.push({
        studentId: slot.id,
        studentName: slot.name,
        date: today,
        time,
        reason: "outside-blocks",
      });
      continue;
    }

    let resolved: string | null = null;
    for (const date of datesToGenerate(weekday, slot.last_generated, today)) {
      // Any row means this occurrence was already handled, moved or cancelled.
      const [existing] = await connection.execute(
        "SELECT id FROM lessons WHERE owner_id = ? AND student_id = ? AND lesson_date = ? AND start_time = ?",
        [ownerId, slot.id, date, time],
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
        conflicts.push({ studentId: slot.id, studentName: slot.name, date, time, reason: "full" });
        break;
      }

      try {
        await connection.execute(
          "INSERT INTO lessons (id, owner_id, lesson_date, start_time, student_id, slot_key) VALUES (?, ?, ?, ?, ?, ?)",
          [randomUUID(), ownerId, date, time, slot.id, `${date}#${time}`],
        );
        created += 1;
      } catch (error) {
        // A concurrent transaction committed this occurrence after our snapshot:
        // the unique key caught it, so the class is already booked, not a failure.
        if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
      }
      resolved = date;
    }

    if (resolved && resolved !== slot.last_generated) {
      await connection.execute(
        "UPDATE student_slots SET last_generated = ? WHERE owner_id = ? AND student_id = ? AND weekday = ? AND start_time = ?",
        [resolved, ownerId, slot.id, weekday, time],
      );
    }
  }

  return { created, conflicts };
}

export const materializeRecurring = createServerFn({ method: "POST" }).handler(
  async (): Promise<MaterializeResult> => {
    const ownerId = await requireUserId();
    const allowed = slots(await readSettings(ownerId));
    const today = localToday();
    return withTransaction((connection) => materializeOn(connection, ownerId, allowed, today));
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
    if (typeof start !== "string" || !TIME_PATTERN.test(start))
      throw new Error("Horario inválido.");
    return { id: rowId(raw["id"]), date, start };
  })
  .handler(async ({ data }): Promise<void> => {
    const ownerId = await requireUserId();
    const allowed = slots(await readSettings(ownerId));
    if (!allowed.includes(data.start))
      throw new Error("Horario fuera de los bloques configurados.");

    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        "SELECT lesson_date, start_time, student_id, status FROM lessons WHERE id = ? AND owner_id = ? FOR UPDATE",
        [data.id, ownerId],
      );
      const lesson = (
        rows as Array<{
          lesson_date: string;
          start_time: string;
          student_id: string;
          status: ClassStatus;
        }>
      )[0];
      if (!lesson) throw new Error("Esa clase no existe.");
      if (lesson.status !== "programada" && lesson.status !== "confirmado") {
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
      if ((duplicate as unknown[]).length > 0)
        throw new Error("Ese alumno ya está en ese horario.");

      // MySQL applies the assignments left to right, so the origin is captured
      // before the new date and time overwrite it. The slot key follows the new
      // slot: it is maintained by the app, since MariaDB cannot compute it.
      await connection.execute(
        `UPDATE lessons
            SET moved_from_date = lesson_date, moved_from_start = start_time,
                lesson_date = ?, start_time = ?, slot_key = CONCAT(?, '#', ?),
                notified_at = NULL
          WHERE id = ? AND owner_id = ?`,
        [data.date, data.start, data.date, data.start, data.id, ownerId],
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
    const settings = {
      startHour: integer(raw["startHour"], "hora de inicio"),
      endHour: integer(raw["endHour"], "hora de fin"),
      blockMin: integer(raw["blockMin"], "duración"),
      breakStart,
      breakEnd,
    };
    if (!validSettings(settings))
      throw new Error(
        "Revisá las horas: el corte tiene que entrar en la jornada y caer en un bloque.",
      );
    return settings;
  })
  .handler(async ({ data }): Promise<MaterializeResult> => {
    const ownerId = await requireUserId();
    const today = localToday();
    return withTransaction(async (connection) => {
      const allowed = slots(data);

      const [rows] = await connection.execute(
        "SELECT start_time FROM lessons WHERE owner_id = ? AND status <> 'cancelada'",
        [ownerId],
      );
      const orphan = (rows as Array<{ start_time: string }>).find(
        (l) => !allowed.includes(l.start_time),
      );
      if (orphan) {
        throw new Error("Los nuevos bloques dejarían clases existentes fuera de la agenda.");
      }

      // The source of truth, not the generated rows: a fixed slot with no lesson
      // yet is exactly the one a narrower day would strand forever.
      const [fixedRows] = await connection.execute(
        `SELECT DISTINCT s.name AS name, sl.start_time AS time
           FROM student_slots sl
           JOIN students s ON s.id = sl.student_id AND s.owner_id = sl.owner_id
          WHERE sl.owner_id = ? AND s.type = 'fijo' AND s.active = 1`,
        [ownerId],
      );
      const outside = fixedSlotsOutsideBlocks(data, fixedRows as FixedSlot[]);
      if (outside.length > 0) throw new Error(outsideBlocksMessage(outside));

      await connection.execute(
        `INSERT INTO court_settings (owner_id, start_hour, end_hour, block_min, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?) AS incoming
         ON DUPLICATE KEY UPDATE start_hour = incoming.start_hour, end_hour = incoming.end_hour, block_min = incoming.block_min,
           break_start = incoming.break_start, break_end = incoming.break_end`,
        [ownerId, data.startHour, data.endHour, data.blockMin, data.breakStart, data.breakEnd],
      );

      // Widening the day is what brings a fixed slot back inside the blocks: book
      // it in this same transaction, so the new day is never saved half-applied.
      return materializeOn(connection, ownerId, allowed, today);
    });
  });

/**
 * Creates or updates many students in one transaction, all owned by the session user.
 *
 * A row that carries a student id updates that student; a row without one creates a
 * new student. The rows were already validated and previewed on the client; this
 * repeats the same field checks so a hand-made request cannot skip them. The balance
 * and the already booked lessons are never part of the import.
 */
export const importStudents = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const list = raw["students"];
    if (!Array.isArray(list) || list.length === 0) throw new Error("No hay alumnos para importar.");
    if (list.length > 200) throw new Error("Importá hasta 200 alumnos por vez.");
    const students = list.map((item) => {
      const student = (item ?? {}) as Record<string, unknown>;
      return {
        id: optionalStudentId(student["id"]),
        name: text(student["name"], "nombre", 120),
        type: oneOf(student["type"], ["fijo", "rotativo"] as const, "tipo"),
        pay: payMode(student["pay"]),
        phone: normalizePhone(student["phone"]),
        ...playerProfile(student),
        ...slotsOf(student),
      };
    });
    // MySQL compares ids case-insensitively, so the duplicate check has to as well.
    const keys = students
      .map((student) => student.id?.toLowerCase())
      .filter((id) => id !== undefined);
    if (new Set(keys).size !== keys.length)
      throw new Error("Hay alumnos repetidos en la plantilla.");
    return { students };
  })
  .handler(async ({ data }): Promise<number> => {
    const ownerId = await requireUserId();
    await withTransaction(async (connection) => {
      const hasUpdates = data.students.some((student) => student.id !== null);
      if (hasUpdates) {
        // One lookup instead of a SELECT per row; an id of another owner never updates.
        const [rows] = await connection.execute("SELECT id FROM students WHERE owner_id = ?", [
          ownerId,
        ]);
        const owned = new Set((rows as Array<{ id: string }>).map((row) => row.id));
        for (const student of data.students) {
          if (student.id !== null && !owned.has(student.id)) {
            throw new Error("Ese alumno ya no existe. Volvé a descargar la plantilla.");
          }
        }
      }

      for (const student of data.students) {
        if (student.id !== null) {
          await connection.execute(
            `UPDATE students SET name = ?, type = ?, pay = ?, phone = ?, category = ?, court_side = ?
             WHERE id = ? AND owner_id = ?`,
            [
              student.name,
              student.type,
              student.pay,
              student.phone,
              student.category,
              student.courtSide,
              student.id,
              ownerId,
            ],
          );
          await syncSlots(connection, ownerId, student.id, student.slots);
        } else {
          const id = randomUUID();
          await connection.execute(
            "INSERT INTO students (id, owner_id, name, type, pay, phone, category, court_side, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
            [
              id,
              ownerId,
              student.name,
              student.type,
              student.pay,
              student.phone,
              student.category,
              student.courtSide,
            ],
          );
          await syncSlots(connection, ownerId, id, student.slots);
        }
      }
    });
    return data.students.length;
  });

/**
 * The bulk notice template. An empty template clears it, so the client falls back
 * to the factory text; the column is NULL rather than "" for the same reason.
 */
export const saveNoticeTemplate = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const value = raw["template"];
    if (value !== null && typeof value !== "string")
      throw new Error("La plantilla del aviso no es válida.");
    const template = (value ?? "").trim();
    if (template.length > NOTICE_TEMPLATE_MAX) {
      throw new Error(`La plantilla no puede pasar de ${NOTICE_TEMPLATE_MAX} caracteres.`);
    }
    return { template: template === "" ? null : template };
  })
  .handler(async ({ data }): Promise<string | null> => {
    const ownerId = await requireUserId();
    await db().execute(
      `INSERT INTO court_settings (owner_id, notice_template) VALUES (?, ?) AS incoming
       ON DUPLICATE KEY UPDATE notice_template = incoming.notice_template`,
      [ownerId, data.template],
    );
    return data.template;
  });
