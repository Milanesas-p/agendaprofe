import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-side rules for the weekly slot and for moving one occurrence.
 * Same technique as lesson-cap: the real handlers run against a mocked database.
 */

const { execute, connectionExecute, findSessionUser } = vi.hoisted(() => ({
  execute: vi.fn(),
  connectionExecute: vi.fn(),
  findSessionUser: vi.fn(),
}));

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

vi.mock("@/server/db", () => ({
  db: () => ({
    execute,
    getConnection: async () => ({
      query: async () => [[], []],
      execute: connectionExecute,
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  }),
}));

vi.mock("@/server/session-user", () => ({ findSessionUser }));

const data = (await import("@/server/data")) as unknown as {
  materializeRecurring: {
    _handler: (args: { data: unknown }) => Promise<{ created: number; conflicts: unknown[] }>;
  };
  moveLesson: { _handler: (args: { data: unknown }) => Promise<void> };
};

type Series = {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  last_generated: string | null;
};

let series: Series[] = [];
let existingDates: string[] = [];
let activeInSlot = 0;
let lessonRow: Record<string, unknown> | null = null;
let duplicateRow: unknown[] = [];

const inserts: unknown[][] = [];
const lastDateUpdates: unknown[][] = [];

function wireDatabase() {
  execute.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT start_hour")) return [[], []];
    if (sql.includes("FROM student_slots")) return [series, []];
    return [[], []];
  });

  connectionExecute.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes("FROM student_slots")) return [series, []];
    // The move duplicate check is the only one that filters by status and id.
    if (sql.includes("AND status <> 'cancelada'")) return [duplicateRow, []];
    if (sql.startsWith("SELECT id FROM lessons WHERE owner_id = ? AND student_id")) {
      return [existingDates.includes(String(params[2])) ? [{ id: "x" }] : [], []];
    }
    if (sql.startsWith("SELECT COUNT(*)")) return [[{ n: activeInSlot }], []];
    if (sql.startsWith("INSERT INTO lessons")) {
      inserts.push(params);
      return [{ affectedRows: 1 }, []];
    }
    if (sql.startsWith("UPDATE student_slots SET last_generated")) {
      lastDateUpdates.push(params);
      return [{ affectedRows: 1 }, []];
    }
    if (sql.startsWith("SELECT lesson_date, start_time, student_id, status"))
      return [lessonRow ? [lessonRow] : [], []];
    if (sql.includes("moved_from_date")) return [{ affectedRows: 1 }, []];
    return [[], []];
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T12:00:00"));
  execute.mockReset();
  connectionExecute.mockReset();
  findSessionUser.mockReset();
  findSessionUser.mockResolvedValue({ id: "owner-1", email: "profe@padel.com" });
  series = [];
  existingDates = [];
  activeInSlot = 0;
  lessonRow = null;
  duplicateRow = [];
  inserts.length = 0;
  lastDateUpdates.length = 0;
  wireDatabase();
});

describe("materializeRecurring", () => {
  const friday = (lastDate: string | null = null): Series => ({
    id: "s1",
    name: "Ana",
    weekday: 5,
    start_time: "14:00",
    last_generated: lastDate,
  });

  it("books every Friday of the next four weeks", async () => {
    series = [friday()];

    const result = await data.materializeRecurring._handler({ data: {} });

    expect(result.created).toBe(4);
    expect(inserts.map((p) => p[2])).toEqual([
      "2026-10-30",
      "2026-11-06",
      "2026-11-13",
      "2026-11-20",
    ]);
    expect(lastDateUpdates[0]?.[0]).toBe("2026-11-20");
  });

  it("never recreates a date that already has a row, moved or cancelled", async () => {
    series = [friday()];
    existingDates = ["2026-10-30"];

    const result = await data.materializeRecurring._handler({ data: {} });

    expect(result.created).toBe(3);
    expect(inserts.map((p) => p[2])).toEqual(["2026-11-06", "2026-11-13", "2026-11-20"]);
  });

  it("starts after the last resolved date, so a move cannot be undone by a top-up", async () => {
    series = [friday("2026-11-13")];

    const result = await data.materializeRecurring._handler({ data: {} });

    expect(result.created).toBe(1);
    expect(inserts.map((p) => p[2])).toEqual(["2026-11-20"]);
  });

  it("reports a full slot instead of swallowing it, and does not advance past it", async () => {
    series = [friday()];
    activeInSlot = 4;

    const result = await data.materializeRecurring._handler({ data: {} });

    expect(result.created).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      studentName: "Ana",
      date: "2026-10-30",
      time: "14:00",
      reason: "full",
    });
    expect(lastDateUpdates).toHaveLength(0);
  });

  it("says a slot was left out by the workday, not that its block was full", async () => {
    // The workday ends at 21:00, so a 23:00 fixed slot has no block at all.
    series = [{ id: "s2", name: "Beto", weekday: 5, start_time: "23:00", last_generated: null }];

    const result = await data.materializeRecurring._handler({ data: {} });

    expect(inserts).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      studentName: "Beto",
      time: "23:00",
      reason: "outside-blocks",
    });
  });

  it("ignores students without a weekly slot", async () => {
    series = [];

    const result = await data.materializeRecurring._handler({ data: {} });

    expect(result).toEqual({ created: 0, conflicts: [] });
    expect(inserts).toHaveLength(0);
  });

  it("only books the slots of fixed students", async () => {
    await data.materializeRecurring._handler({ data: {} });

    const [sql] =
      connectionExecute.mock.calls.find(([text]) => String(text).includes("FROM student_slots")) ??
      [];
    expect(String(sql)).toContain("s.type = 'fijo'");
  });
});

describe("moveLesson", () => {
  const move = (date = "2026-10-29", start = "15:00") =>
    data.moveLesson._handler({ data: { id: "11111111-1111-1111-1111-111111111111", date, start } });

  beforeEach(() => {
    lessonRow = {
      lesson_date: "2026-10-30",
      start_time: "14:00",
      student_id: "stu-1",
      status: "programada",
    };
  });

  it("relocates the occurrence to another day and time", async () => {
    await expect(move()).resolves.toBeUndefined();
    const update = connectionExecute.mock.calls.find(([sql]) =>
      String(sql).includes("moved_from_date"),
    );
    const sql = String(update?.[0]);
    // The origin is captured before the new date and time overwrite it.
    expect(sql.indexOf("moved_from_date = lesson_date")).toBeLessThan(
      sql.indexOf("lesson_date = ?"),
    );
    expect(update?.[1]).toEqual([
      "2026-10-29",
      "15:00",
      "11111111-1111-1111-1111-111111111111",
      "owner-1",
    ]);
  });

  it("refuses to move a lesson that was already marked", async () => {
    lessonRow = {
      lesson_date: "2026-10-30",
      start_time: "14:00",
      student_id: "stu-1",
      status: "presente",
    };
    await expect(move()).rejects.toThrow("Primero deshacé la asistencia para poder moverla.");
  });

  it("refuses a target slot that is already full", async () => {
    activeInSlot = 4;
    await expect(move()).rejects.toThrow("Esa clase ya tiene 4 alumnos.");
  });

  it("refuses a slot where the student already has a class", async () => {
    duplicateRow = [{ id: "other" }];
    await expect(move()).rejects.toThrow("Ese alumno ya está en ese horario.");
  });

  it("refuses a slot outside the configured blocks", async () => {
    await expect(move("2026-10-29", "23:30")).rejects.toThrow(
      "Horario fuera de los bloques configurados.",
    );
  });
});
