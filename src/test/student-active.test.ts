import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Enabling and disabling a student, end to end on the server.
 *
 * Disabling must free the agenda: future scheduled lessons are removed, a manual
 * cancellation is preserved (the recurrence must never resurrect it) and the
 * marker moves back so the slots can be regenerated later. Enabling tops the
 * weekly fixed slots up again. The balance and the history are never touched.
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

let active = true;
let lessonRows: LessonRow[] = [];
let slotRows: SlotRow[] = [];
let slotMarkerUpdates: Array<{ owner: string; student: string; marker: string }> = [];
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
        if (text.startsWith("SELECT active FROM students"))
          return [[{ active: active ? 1 : 0 }], []];
        if (text.startsWith("UPDATE students SET")) {
          active = Boolean(params[6]);
          return [{ affectedRows: 1 }, []];
        }
        if (text.startsWith("SELECT weekday, start_time FROM student_slots")) return [[], []];
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
        if (text.startsWith("UPDATE student_slots SET last_generated")) {
          slotMarkerUpdates.push({
            owner: String(params[1]),
            student: String(params[2]),
            marker: String(params[0]),
          });
          return [{ affectedRows: 1 }, []];
        }
        if (text.includes("FROM student_slots")) return [slotRows.map((r) => ({ ...r })), []];
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
    _validate: (input: unknown) => {
      id: string;
      active: boolean | null;
    };
    _handler: (args: { data: unknown }) => Promise<{
      created: number;
      conflicts: Array<{ studentName: string; date: string; time: string; reason: string }>;
    }>;
  };
};

const TODAY = "2026-11-25"; // Wednesday

const student = (over: Record<string, unknown> = {}) => ({
  id: "student-1",
  name: "Beto Ruiz",
  type: "fijo",
  pay: null,
  phone: null,
  category: null,
  courtSide: null,
  slots: [] as Array<{ weekday: number; time: string }>,
  active: true,
  ...over,
});

const update = (d: ReturnType<typeof student>) => data.updateStudent._handler({ data: d });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  findSessionUser.mockReset();
  findSessionUser.mockResolvedValue({ id: "owner-1", email: "profe@padel.com" });
  active = true;
  lessonRows = [];
  slotRows = [];
  slotMarkerUpdates = [];
  sqlLog.length = 0;
});

describe("disabling a student", () => {
  it("removes only future scheduled lessons and keeps history and manual cancellations", async () => {
    active = true;
    lessonRows = [
      {
        id: "past",
        student_id: "student-1",
        lesson_date: "2026-11-24",
        start_time: "17:00",
        status: "presente",
      },
      {
        id: "today",
        student_id: "student-1",
        lesson_date: TODAY,
        start_time: "17:00",
        status: "programada",
      },
      {
        id: "tomorrow",
        student_id: "student-1",
        lesson_date: "2026-11-26",
        start_time: "17:00",
        status: "programada",
      },
      {
        id: "confirmed",
        student_id: "student-1",
        lesson_date: "2026-11-27",
        start_time: "17:00",
        status: "confirmado",
      },
      {
        id: "manual",
        student_id: "student-1",
        lesson_date: "2026-11-27",
        start_time: "18:00",
        status: "cancelada",
      },
      {
        id: "other",
        student_id: "student-2",
        lesson_date: "2026-11-26",
        start_time: "17:00",
        status: "programada",
      },
    ];

    await update(student({ active: false }));

    expect(active).toBe(false);
    expect(lessonRows.map((row) => row.id).sort()).toEqual(
      ["manual", "other", "past", "today"].sort(),
    );
  });

  it("moves the slot marker back one day so the schedule can come back", async () => {
    active = true;

    await update(student({ active: false }));

    expect(slotMarkerUpdates).toEqual([
      { owner: "owner-1", student: "student-1", marker: "2026-11-24" },
    ]);
  });

  it("never touches the balance", async () => {
    active = true;

    await update(student({ active: false }));

    expect(sqlLog.some((call) => call.sql.toLowerCase().includes("balance"))).toBe(false);
  });

  it("keeps a disabled student disabled when the payload omits the flag", async () => {
    active = false;

    await update(student({ active: null }));

    expect(active).toBe(false);
  });
});

describe("enabling a student", () => {
  it("tops the fixed slots up again from today", async () => {
    active = false;
    slotRows = [
      { id: "student-1", name: "Beto Ruiz", weekday: 5, start_time: "17:00", last_generated: null },
    ];

    await update(student({ active: true, slots: [{ weekday: 5, time: "17:00" }] }));

    expect(active).toBe(true);
    // Fridays inside the 28-day horizon: 11-27, 12-04, 12-11 and 12-18.
    expect(lessonRows.map((row) => row.lesson_date)).toEqual([
      "2026-11-27",
      "2026-12-04",
      "2026-12-11",
      "2026-12-18",
    ]);
    expect(sqlLog.some((call) => call.sql.toLowerCase().includes("balance"))).toBe(false);
  });

  it("reads only active students when materializing", async () => {
    active = false;
    slotRows = [
      { id: "student-1", name: "Beto Ruiz", weekday: 5, start_time: "17:00", last_generated: null },
    ];

    await update(student({ active: true, slots: [{ weekday: 5, time: "17:00" }] }));

    const series = sqlLog.filter((call) => call.sql.includes("FROM student_slots"));
    expect(series.some((call) => call.sql.includes("s.active = 1"))).toBe(true);
  });

  it("reports the conflicts when a reactivated slot is already full", async () => {
    active = false;
    slotRows = [
      { id: "student-1", name: "Beto Ruiz", weekday: 5, start_time: "17:00", last_generated: null },
    ];
    for (let i = 0; i < 4; i += 1) {
      lessonRows.push({
        id: `other-${i}`,
        student_id: `other-${i}`,
        lesson_date: "2026-11-27",
        start_time: "17:00",
        status: "programada",
      });
    }

    const result = await update(student({ active: true, slots: [{ weekday: 5, time: "17:00" }] }));

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      studentName: "Beto Ruiz",
      date: "2026-11-27",
      time: "17:00",
      reason: "full",
    });
  });
});

describe("the update payload", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("parses the active flag and defaults to no change when it is absent", () => {
    expect(data.updateStudent._validate(student({ id, active: false })).active).toBe(false);
    expect(data.updateStudent._validate(student({ id, active: true })).active).toBe(true);
    expect(data.updateStudent._validate(student({ id, active: undefined })).active).toBeNull();
  });
});
