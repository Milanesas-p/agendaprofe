import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import type { PoolConnection } from "mysql2/promise";
import { findSessionUser } from "./session-user";
import { db } from "./db";
import { balanceDelta, canAddToLesson, slots, validSettings, MAX_STUDENTS_PER_LESSON, type ClassStatus } from "@/lib/rules";
import { normalizePhone } from "@/lib/phone";

export type StudentDto = {
  id: string;
  name: string;
  type: "fijo" | "rotativo";
  pay: "mensual" | "semanal";
  phone: string | null;
  balance: number;
};

export type LessonDto = {
  id: string;
  date: string;
  start: string;
  studentId: string;
  status: ClassStatus;
};

export type SettingsDto = { startHour: number; endHour: number; blockMin: number };

export type Snapshot = { students: StudentDto[]; lessons: LessonDto[]; settings: SettingsDto };

const DEFAULT_SETTINGS: SettingsDto = { startHour: 8, endHour: 22, blockMin: 60 };

const STATUSES: readonly ClassStatus[] = ["programada", "presente", "ausente", "cancelada"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Every query is scoped by the session user; the client never supplies an owner. */
async function requireUserId(): Promise<string> {
  const user = await findSessionUser();
  if (!user) throw new Error("Iniciá sesión para guardar tus cambios.");
  return user.id;
}

async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
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

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`Dato inválido: ${field}.`);
  return value;
}

function rowId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-fA-F-]{36}$/.test(value)) throw new Error("Identificador inválido.");
  return value;
}

async function readSettings(ownerId: string): Promise<SettingsDto> {
  const [rows] = await db().execute(
    "SELECT start_hour, end_hour, block_min FROM court_settings WHERE owner_id = ?",
    [ownerId],
  );
  const row = (rows as Array<{ start_hour: number; end_hour: number; block_min: number }>)[0];
  if (!row) return DEFAULT_SETTINGS;
  return { startHour: row.start_hour, endHour: row.end_hour, blockMin: row.block_min };
}

export const getSnapshot = createServerFn({ method: "GET" }).handler(async (): Promise<Snapshot> => {
  const ownerId = await requireUserId();
  const [studentRows] = await db().execute(
    "SELECT id, name, type, pay, phone, balance FROM students WHERE owner_id = ? ORDER BY name",
    [ownerId],
  );
  const [lessonRows] = await db().execute(
    "SELECT id, lesson_date, start_time, student_id, status FROM lessons WHERE owner_id = ? ORDER BY lesson_date, start_time",
    [ownerId],
  );
  const students = (studentRows as Array<StudentDto>).map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    pay: s.pay,
    phone: s.phone ?? null,
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
      balance: integer(raw["balance"], "clases pagadas"),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    const ownerId = await requireUserId();
    const id = randomUUID();
    await db().execute(
      "INSERT INTO students (id, owner_id, name, type, pay, phone, balance) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, ownerId, data.name, data.type, data.pay, data.phone, data.balance],
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
    };
  })
  .handler(async ({ data }): Promise<void> => {
    const ownerId = await requireUserId();
    // The balance is deliberately not touchable here: it only moves through
    // attendance or an explicit +/- adjustment.
    const [result] = await db().execute(
      "UPDATE students SET name = ?, type = ?, pay = ?, phone = ? WHERE id = ? AND owner_id = ?",
      [data.name, data.type, data.pay, data.phone, data.id, ownerId],
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
      // FOR UPDATE keeps two concurrent adds from both seeing a free fifth place.
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

export const saveSettings = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const settings: SettingsDto = {
      startHour: integer(raw["startHour"], "hora de inicio"),
      endHour: integer(raw["endHour"], "hora de fin"),
      blockMin: integer(raw["blockMin"], "duración"),
    };
    if (!validSettings(settings)) throw new Error("Revisá las horas y la duración: entre 15 y 240 minutos.");
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
        `INSERT INTO court_settings (owner_id, start_hour, end_hour, block_min) VALUES (?, ?, ?, ?) AS incoming
         ON DUPLICATE KEY UPDATE start_hour = incoming.start_hour, end_hour = incoming.end_hour, block_min = incoming.block_min`,
        [ownerId, data.startHour, data.endHour, data.blockMin],
      );
    });
  });
