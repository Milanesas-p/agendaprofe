import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server side of pause/reactivate (S2, S3, S4, S8): reactivating with
 * `slots: []` must DELETE the stored series and book nothing (no
 * resurrection), reactivating with new slots in the same save must materialize
 * them from today, disabling must keep slots/history/balance, and a rejected
 * update must leave every row untouched.
 */

const { findSessionUser } = vi.hoisted(() => ({ findSessionUser: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      validator: (fn: unknown) => {
        (chain as Record<string, unknown>)["_validate"] = fn;
        return chain;
      },
      handler: (fn: unknown) => {
        (chain as Record<string, unknown>)["_handler"] = fn;
        return chain;
      },
    };
    return chain;
  },
}));

vi.mock("@/server/session-user", () => ({ findSessionUser }));

type LessonRow = {
  id: string;
  student_id: string;
  lesson_date: string;
  start_time: string;
  status: string;
};

type SlotRow = {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  last_generated: string | null;
};

const STUDENT_ID = "student-1";
let active = true;
let exists = true;
let lessonRows: LessonRow[] = [];
let slotRows: SlotRow[] = [];
const sqlLog: Array<{ sql: string; params: unknown[] }> = [];

vi.mock("@/server/db", () => ({
  db: () => ({
    execute: async (sql: string, params: unknown[]) => {
      sqlLog.push({ sql: String(sql), params });
      return [[], []];
    },
    getConnection: async () => ({
      query: async () => [[], []],
      execute: async (sql: string, params: unknown[]) => {
        const text = String(sql).replace(/\s+/g, " ").trim();
        sqlLog.push({ sql: text, params });
        if (text.startsWith("SELECT active FROM students")) {
          if (!exists || params[0] !== STUDENT_ID) return [[], []];
          return [[{ active: active ? 1 : 0 }], []];
        }
        if (text.startsWith("UPDATE students SET")) {
          active = Boolean(params[6]);
          return [{ affectedRows: 1 }, []];
        }
        if (text.startsWith("SELECT weekday, start_time FROM student_slots"))
          return [slotRows.map((r) => ({ weekday: r.weekday, start_time: r.start_time })), []];
        if (text.startsWith("DELETE FROM student_slots")) {
          const weekday = Number(params[2]);
          const time = String(params[3]);
          slotRows = slotRows.filter((r) => !(r.weekday === weekday && r.start_time === time));
          return [{ affectedRows: 1 }, []];
        }
        if (text.startsWith("INSERT INTO student_slots")) {
          slotRows.push({
            id: STUDENT_ID,
            name: "Beto Ruiz",
            weekday: Number(params[3]),
            start_time: String(params[4]),
            last_generated: null,
          });
          return [{ affectedRows: 1 }, []];
        }
        if (text.startsWith("UPDATE student_slots SET last_generated")) {
          const marker = String(params[0]);
          if (text.includes("AND weekday = ? AND start_time = ?")) {
            const weekday = Number(params[3]);
            const time = String(params[4]);
            for (const r of slotRows)
              if (r.weekday === weekday && r.start_time === time) r.last_generated = marker;
          } else {
            for (const r of slotRows) r.last_generated = marker;
          }
          return [{ affectedRows: 1 }, []];
        }
        if (text.includes("FROM student_slots sl")) return [slotRows.map((r) => ({ ...r })), []];
        if (text.startsWith("SELECT id FROM lessons WHERE owner_id = ? AND student_id = ?")) {
          const found = lessonRows.some(
            (row) =>
              row.student_id === params[1] &&
              row.lesson_date === params[2] &&
              row.start_time === params[3],
          );
          return [found ? [{ id: "x" }] : [], []];
        }
        if (text.startsWith("SELECT COUNT(*)")) {
          const key = String(params[1]);
          const count = lessonRows.filter(
            (row) => `${row.lesson_date}#${row.start_time}` === key,
          ).length;
          return [[{ n: count }], []];
        }
        if (text.startsWith("INSERT INTO lessons")) {
          lessonRows.push({
            id: String(params[0]),
            student_id: String(params[4]),
            lesson_date: String(params[2]),
            start_time: String(params[3]),
            status: "programada",
          });
          return [{ affectedRows: 1 }, []];
        }
        if (text.startsWith("DELETE FROM lessons")) {
          const today = String(params[2]);
          lessonRows = lessonRows.filter(
            (row) =>
              !(
                row.student_id === params[1] &&
                row.lesson_date > today &&
                (row.status === "programada" || row.status === "confirmado")
              ),
          );
          return [{ affectedRows: 1 }, []];
        }
        return [[], []];
      },
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  }),
}));

const data = (await import("@/server/data")) as unknown as {
  updateStudent: {
    _validate: (input: unknown) => Record<string, unknown>;
    _handler: (args: { data: unknown }) => Promise<{
      created: number;
      conflicts: Array<Record<string, string>>;
    }>;
  };
};

const { activePayload } = await import("@/lib/students");

const payload = (over: Record<string, unknown> = {}) => ({
  id: STUDENT_ID,
  name: "Beto Ruiz",
  type: "fijo",
  pay: null,
  phone: null,
  category: null,
  courtSide: null,
  slots: [] as Array<{ weekday: number; time: string }>,
  active: true as boolean | null,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T12:00:00")); // Wednesday
  findSessionUser.mockReset();
  findSessionUser.mockResolvedValue({ id: "owner-1", email: "profe@padel.com" });
  active = true;
  exists = true;
  lessonRows = [];
  slotRows = [];
  sqlLog.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("server reactivation with slots: [] (S4)", () => {
  it("deletes the stored series and books nothing", async () => {
    active = false;
    slotRows = [
      { id: STUDENT_ID, name: "Beto Ruiz", weekday: 3, start_time: "09:00", last_generated: "2026-11-24" },
    ];

    const result = await data.updateStudent._handler({ data: payload({ slots: [] }) });

    expect(result).toEqual({ created: 0, conflicts: [] });
    expect(slotRows).toEqual([]);
    expect(sqlLog.some((c) => c.sql.startsWith("DELETE FROM student_slots"))).toBe(true);
    expect(sqlLog.some((c) => c.sql.startsWith("INSERT INTO lessons"))).toBe(false);
    expect(lessonRows).toEqual([]);
    expect(sqlLog.some((c) => c.sql.startsWith("UPDATE student_slots"))).toBe(false);
  });
});

describe("server reactivation with new slots in the same save (S4)", () => {
  it("materializes the new schedule from today", async () => {
    active = false;
    slotRows = [];

    const result = await data.updateStudent._handler({
      data: payload({ slots: [{ weekday: 5, time: "17:00" }] }),
    });

    expect(result.created).toBe(4);
    expect(result.conflicts).toEqual([]);
    expect(lessonRows.map((r) => r.lesson_date)).toEqual([
      "2026-11-27",
      "2026-12-04",
      "2026-12-11",
      "2026-12-18",
    ]);
    expect(slotRows).toEqual([
      { id: STUDENT_ID, name: "Beto Ruiz", weekday: 5, start_time: "17:00", last_generated: "2026-12-18" },
    ]);
    expect(sqlLog.some((c) => c.sql.toLowerCase().includes("balance"))).toBe(false);
    expect(sqlLog.some((c) => c.sql.includes("s.active = 1"))).toBe(true);
  });
});

describe("disabling on the server (S2/S8)", () => {
  it("keeps the weekly slots, frees future classes and preserves history", async () => {
    active = true;
    slotRows = [
      { id: STUDENT_ID, name: "Beto Ruiz", weekday: 5, start_time: "17:00", last_generated: "2026-11-20" },
    ];
    lessonRows = [
      { id: "past", student_id: STUDENT_ID, lesson_date: "2026-11-24", start_time: "17:00", status: "presente" },
      { id: "today", student_id: STUDENT_ID, lesson_date: "2026-11-25", start_time: "17:00", status: "programada" },
      { id: "tomorrow", student_id: STUDENT_ID, lesson_date: "2026-11-26", start_time: "17:00", status: "programada" },
      { id: "confirmed", student_id: STUDENT_ID, lesson_date: "2026-11-27", start_time: "17:00", status: "confirmado" },
      { id: "manual", student_id: STUDENT_ID, lesson_date: "2026-11-27", start_time: "18:00", status: "cancelada" },
      { id: "other", student_id: "student-2", lesson_date: "2026-11-26", start_time: "17:00", status: "programada" },
    ];

    await data.updateStudent._handler({
      data: payload({ active: false, slots: [{ weekday: 5, time: "17:00" }] }),
    });

    expect(slotRows).toEqual([
      { id: STUDENT_ID, name: "Beto Ruiz", weekday: 5, start_time: "17:00", last_generated: "2026-11-24" },
    ]);
    expect(
      sqlLog.some(
        (c) =>
          c.sql.startsWith("DELETE FROM student_slots") ||
          c.sql.startsWith("INSERT INTO student_slots"),
      ),
    ).toBe(false);
    expect(lessonRows.map((r) => r.id).sort()).toEqual(["manual", "other", "past", "today"].sort());
    expect(sqlLog.some((c) => c.sql.toLowerCase().includes("balance"))).toBe(false);
  });
});

describe("rejected update invariant (S8)", () => {
  it("leaves every row untouched when the student does not exist", async () => {
    active = true;
    exists = false;
    slotRows = [
      { id: STUDENT_ID, name: "Beto Ruiz", weekday: 5, start_time: "17:00", last_generated: "2026-11-20" },
    ];
    lessonRows = [
      { id: "l1", student_id: STUDENT_ID, lesson_date: "2026-11-26", start_time: "17:00", status: "programada" },
    ];
    const before = JSON.stringify({ slotRows, lessonRows, active });

    await expect(data.updateStudent._handler({ data: payload() })).rejects.toThrow(
      "Ese alumno no existe.",
    );

    expect(JSON.stringify({ slotRows, lessonRows, active })).toBe(before);
    expect(sqlLog.every((c) => !/^(INSERT|DELETE|UPDATE)/i.test(c.sql))).toBe(true);
  });
});

describe("payload contract (activePayload → updateStudent)", () => {
  it("carries exactly the fields the validator expects", () => {
    const s = {
      id: "x",
      name: "Beto Ruiz",
      type: "fijo" as const,
      pay: null,
      phone: null,
      category: null,
      courtSide: null,
      slots: [{ weekday: 5, time: "17:00" }],
      balance: 2,
      active: false,
    };

    const out = activePayload(s, true);
    expect(Object.keys(out).sort()).toEqual([
      "active", "category", "courtSide", "name", "pay", "phone", "slots", "type",
    ]);

    const validated = data.updateStudent._validate({
      id: "11111111-1111-4111-8111-111111111111",
      ...out,
    });
    expect(Object.keys(validated).sort()).toEqual([
      "active", "category", "courtSide", "id", "name", "pay", "phone", "slots", "type",
    ]);
    expect(validated["slots"]).toEqual([{ weekday: 5, time: "17:00" }]);
    expect(validated["active"]).toBe(true);
  });
});
