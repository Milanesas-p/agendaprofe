import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Saving the working hours, end to end on the server: one connection, one
 * transaction, idempotent top-up and the lock ordering the capacity rule needs.
 *
 * Stateful database mock: last_generated updates are applied and lesson rows
 * accumulate, so saving twice and rolling back are observable.
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

type FixedRow = {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  last_generated: string | null;
};

let fixed: FixedRow[] = [];
let lessonRows: Array<{ student_id: string; lesson_date: string; start_time: string }> = [];
let failInsertAt: number | null = null; // 1-based: the INSERT that creates row n-th throws

const lifecycle = { getConnections: 0, begins: 0, commits: 0, rollbacks: 0 };
const sqlLog: Array<{ sql: string; params: unknown[]; onConnection: boolean }> = [];

vi.mock("@/server/db", () => ({
  db: () => ({
    execute: async (sql: string, params: unknown[]) => {
      sqlLog.push({ sql, params, onConnection: false });
      return [[], []];
    },
    getConnection: async () => {
      lifecycle.getConnections += 1;
      return {
        query: async (sql: string, params: unknown[]) => {
          sqlLog.push({ sql, params, onConnection: true });
          return [[], []];
        },
        execute: async (sql: string, params: unknown[]) => {
          sqlLog.push({ sql, params, onConnection: true });
          const text = String(sql);
          if (text.startsWith("SELECT DISTINCT s.name"))
            return [fixed.map((r) => ({ name: r.name, time: r.start_time })), []];
          if (text.includes("FROM student_slots")) return [fixed.map((r) => ({ ...r })), []];
          if (text.startsWith("SELECT start_time FROM lessons"))
            return [lessonRows.map((r) => ({ start_time: r.start_time })), []];
          if (text.startsWith("SELECT id FROM lessons WHERE owner_id = ? AND student_id"))
            return [
              lessonRows.some(
                (r) =>
                  r.student_id === params[1] &&
                  r.lesson_date === params[2] &&
                  r.start_time === params[3],
              )
                ? [{ id: "x" }]
                : [],
              [],
            ];
          if (text.startsWith("SELECT COUNT(*)")) {
            const key = String(params[1]);
            const n = lessonRows.filter((r) => `${r.lesson_date}#${r.start_time}` === key).length;
            return [[{ n }], []];
          }
          if (text.startsWith("INSERT INTO lessons")) {
            if (failInsertAt !== null && lessonRows.length + 1 >= failInsertAt) {
              throw Object.assign(new Error("boom"), { code: "ER_TEST" });
            }
            lessonRows.push({
              student_id: String(params[4]),
              lesson_date: String(params[2]),
              start_time: String(params[3]),
            });
            return [{ affectedRows: 1 }, []];
          }
          if (text.startsWith("UPDATE student_slots SET last_generated")) {
            const row = fixed.find(
              (r) =>
                r.id === params[2] && r.weekday === Number(params[3]) && r.start_time === params[4],
            );
            if (row) row.last_generated = String(params[0]);
            return [{ affectedRows: 1 }, []];
          }
          if (text.includes("INSERT INTO court_settings")) return [{ affectedRows: 1 }, []];
          return [[], []];
        },
        beginTransaction: async () => {
          lifecycle.begins += 1;
        },
        commit: async () => {
          lifecycle.commits += 1;
        },
        rollback: async () => {
          lifecycle.rollbacks += 1;
        },
        release: () => {},
      };
    },
  }),
}));

const data = (await import("@/server/data")) as unknown as {
  saveSettings: {
    _handler: (args: {
      data: unknown;
    }) => Promise<{ created: number; conflicts: Array<{ reason?: string }> }>;
  };
};

const day: import("@/lib/rules").SlotRules = {
  startHour: 8,
  endHour: 18,
  blockMin: 60,
  breakStart: null,
  breakEnd: null,
};
const save = (d: typeof day) => data.saveSettings._handler({ data: d });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T12:00:00"));
  findSessionUser.mockReset();
  findSessionUser.mockResolvedValue({ id: "owner-1", email: "profe@padel.com" });
  fixed = [];
  lessonRows = [];
  failInsertAt = null;
  lifecycle.getConnections = 0;
  lifecycle.begins = 0;
  lifecycle.commits = 0;
  lifecycle.rollbacks = 0;
  sqlLog.length = 0;
});

describe("saving the hours: transaction shape", () => {
  it("runs validation, the upsert and the top-up on one connection and one transaction", async () => {
    fixed = [{ id: "s1", name: "Beto", weekday: 5, start_time: "17:00", last_generated: null }];

    const result = await save(day);

    expect(result.created).toBe(4);
    expect(lifecycle.getConnections).toBe(1);
    expect(lifecycle.begins).toBe(1);
    expect(lifecycle.commits).toBe(1);
    expect(lifecycle.rollbacks).toBe(0);
    // The series read must happen on the transaction's connection, not the pool.
    const seriesRead = sqlLog.find((c) => c.sql.includes("FROM student_slots"));
    expect(seriesRead?.onConnection).toBe(true);
  });

  it("rolls back the whole save when materializing throws mid-way", async () => {
    fixed = [{ id: "s1", name: "Beto", weekday: 5, start_time: "17:00", last_generated: null }];
    failInsertAt = 2; // first lesson created, second one fails

    await expect(save(day)).rejects.toThrow("boom");

    expect(lifecycle.commits).toBe(0);
    expect(lifecycle.rollbacks).toBe(1);
    // The settings upsert happened inside the same doomed transaction.
    expect(sqlLog.some((c) => c.sql.includes("court_settings"))).toBe(true);
  });
});

describe("saving the hours: idempotence and monotonic marker", () => {
  it("creates nothing when the same day is saved twice", async () => {
    fixed = [{ id: "s1", name: "Beto", weekday: 5, start_time: "17:00", last_generated: null }];

    const first = await save(day);
    const firstRows = lessonRows.length;
    const firstDates = lessonRows.map((r) => `${r.lesson_date}#${r.start_time}#${r.student_id}`);

    const second = await save(day);

    expect(first.created).toBe(4);
    expect(second.created).toBe(0);
    expect(lessonRows.length).toBe(firstRows);
    expect(new Set(firstDates).size).toBe(firstDates.length);
  });

  it("never moves last_generated backwards", async () => {
    fixed = [
      { id: "s1", name: "Beto", weekday: 5, start_time: "17:00", last_generated: "2026-11-06" },
    ];

    await save(day);

    expect(fixed[0]!.last_generated).toBe("2026-11-20");
    await save(day);
    expect(fixed[0]!.last_generated).toBe("2026-11-20");
  });

  it("keeps a moved occurrence from being recreated after a save", async () => {
    fixed = [{ id: "s1", name: "Beto", weekday: 5, start_time: "17:00", last_generated: null }];
    await save(day);
    // The teacher moved the 2026-11-06 occurrence and the series advanced past it.
    lessonRows = lessonRows.filter((r) => r.lesson_date !== "2026-11-06");
    fixed[0]!.last_generated = "2026-11-13";

    const again = await save(day);

    expect(again.created).toBe(0);
    expect(lessonRows.some((r) => r.lesson_date === "2026-11-06")).toBe(false);
  });
});

describe("saving the hours: capacity lock ordering", () => {
  it("takes the FOR UPDATE count before each insert of that block", async () => {
    fixed = [{ id: "s1", name: "Beto", weekday: 5, start_time: "17:00", last_generated: null }];
    await save(day);

    for (const date of ["2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20"]) {
      const lock = sqlLog.findIndex(
        (c) => c.sql.startsWith("SELECT COUNT(*)") && c.params[1] === `${date}#17:00`,
      );
      const insert = sqlLog.findIndex(
        (c) => c.sql.startsWith("INSERT INTO lessons") && c.params[2] === date,
      );
      expect(lock).toBeGreaterThanOrEqual(0);
      expect(insert).toBeGreaterThan(lock);
    }
  });

  it("counts active rows by slot_key before deciding the block is full", async () => {
    fixed = [{ id: "s1", name: "Beto", weekday: 5, start_time: "17:00", last_generated: null }];
    // Four other students already in the Friday 17:00 block: Beto cannot enter.
    for (let i = 0; i < 4; i += 1) {
      lessonRows.push({ student_id: `other-${i}`, lesson_date: "2026-10-30", start_time: "17:00" });
    }

    const result = await save(day);

    expect(result.created).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      studentName: "Beto",
      time: "17:00",
      reason: "full",
    });
    expect(lifecycle.commits).toBe(1); // the save itself still succeeds
  });
});

describe("saving the hours: fixed-slot validation", () => {
  it("rejects a day over a break hour even though the slot never generated a lesson", async () => {
    const withBreak = { ...day, endHour: 12, breakStart: 10, breakEnd: 11 }; // blocks: 08,09,11
    fixed = [{ id: "s1", name: "Beto", weekday: 5, start_time: "10:00", last_generated: null }];

    await expect(save(withBreak)).rejects.toThrow(
      "Beto tiene horario fijo fuera de la jornada configurada: 10:00.",
    );
    expect(sqlLog.some((c) => c.sql.includes("court_settings"))).toBe(false);
  });

  it("accepts the hour right after the break", async () => {
    const withBreak = { ...day, endHour: 12, breakStart: 10, breakEnd: 11 };
    fixed = [{ id: "s1", name: "Beto", weekday: 5, start_time: "11:00", last_generated: null }];

    const result = await save(withBreak);
    expect(result.conflicts).toHaveLength(0);
  });

  it("names both students when two fixed slots share the missing hour", async () => {
    const narrow = { ...day, endHour: 17 };
    fixed = [
      { id: "s1", name: "Beto", weekday: 5, start_time: "17:00", last_generated: null },
      { id: "s2", name: "Caro", weekday: 3, start_time: "17:00", last_generated: null },
    ];

    await expect(save(narrow)).rejects.toThrow(
      "Beto y Caro tienen horario fijo fuera de la jornada configurada: 17:00.",
    );
  });
});
