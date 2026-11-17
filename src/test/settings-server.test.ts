import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Saving the working hours is the other half of the weekly schedule: the server
 * validates the new day against the fixed slots themselves and materializes them
 * inside the same transaction. Same technique as recurring-schedule: the real
 * handler runs against a mocked database.
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
  saveSettings: {
    _validate: (input: unknown) => unknown;
    _handler: (args: { data: unknown }) => Promise<{ created: number; conflicts: unknown[] }>;
  };
};

type FixedRow = {
  name: string;
  start_time: string;
  weekday: number;
  last_generated: string | null;
};

let fixed: FixedRow[] = [];
let lessonTimes: string[] = [];
let activeInSlot = 0;

const upserts: unknown[][] = [];
const lessonInserts: unknown[][] = [];

function wireDatabase() {
  execute.mockImplementation(async (sql: string) => {
    if (String(sql).startsWith("SELECT start_hour")) return [[], []];
    return [[], []];
  });

  connectionExecute.mockImplementation(async (sql: string, params: unknown[]) => {
    if (String(sql).includes("SELECT DISTINCT s.name")) {
      return [fixed.map((row) => ({ name: row.name, time: row.start_time })), []];
    }
    if (String(sql).includes("FROM student_slots")) return [fixed, []];
    if (String(sql).startsWith("SELECT start_time FROM lessons")) {
      return [lessonTimes.map((start_time) => ({ start_time })), []];
    }
    if (String(sql).includes("INSERT INTO court_settings")) {
      upserts.push(params);
      return [{ affectedRows: 1 }, []];
    }
    if (String(sql).startsWith("SELECT COUNT(*)")) return [[{ n: activeInSlot }], []];
    if (String(sql).startsWith("SELECT id FROM lessons WHERE owner_id = ? AND student_id"))
      return [[], []];
    if (String(sql).startsWith("INSERT INTO lessons")) {
      lessonInserts.push(params);
      return [{ affectedRows: 1 }, []];
    }
    if (String(sql).startsWith("UPDATE student_slots SET last_generated"))
      return [{ affectedRows: 1 }, []];
    return [[], []];
  });
}

const day = (endHour: number) => ({
  startHour: 8,
  endHour,
  blockMin: 60,
  breakStart: null,
  breakEnd: null,
});

const save = (endHour: number) => data.saveSettings._handler({ data: day(endHour) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T12:00:00"));
  execute.mockReset();
  connectionExecute.mockReset();
  findSessionUser.mockReset();
  findSessionUser.mockResolvedValue({ id: "owner-1", email: "profe@padel.com" });
  fixed = [];
  lessonTimes = [];
  activeInSlot = 0;
  upserts.length = 0;
  lessonInserts.length = 0;
  wireDatabase();
});

describe("saving the working hours", () => {
  it("refuses a day that would leave a fixed slot out, naming the student", async () => {
    fixed = [{ name: "Beto", start_time: "17:00", weekday: 5, last_generated: null }];

    await expect(save(17)).rejects.toThrow(
      "Beto tiene horario fijo fuera de la jornada configurada: 17:00.",
    );

    expect(upserts).toHaveLength(0);
    expect(lessonInserts).toHaveLength(0);
  });

  it("still refuses when an already generated class falls outside", async () => {
    lessonTimes = ["17:00"];

    await expect(save(17)).rejects.toThrow(
      "Los nuevos bloques dejarían clases existentes fuera de la agenda.",
    );
    expect(upserts).toHaveLength(0);
  });

  it("books the fixed slots of the new day in the same transaction", async () => {
    fixed = [{ name: "Beto", start_time: "17:00", weekday: 5, last_generated: null }];

    const result = await save(18);

    expect(upserts).toHaveLength(1);
    expect(result.created).toBe(4);
    expect(lessonInserts.map((p) => p[2])).toEqual([
      "2026-10-30",
      "2026-11-06",
      "2026-11-13",
      "2026-11-20",
    ]);
    expect(lessonInserts[0]?.[3]).toBe("17:00");
  });

  it("keeps the save when a block is full, returning the conflict instead", async () => {
    fixed = [{ name: "Beto", start_time: "17:00", weekday: 5, last_generated: null }];
    activeInSlot = 4;

    const result = await save(18);

    expect(upserts).toHaveLength(1);
    expect(result.created).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      studentName: "Beto",
      time: "17:00",
      reason: "full",
    });
  });

  it("validates the break against the same rules as the screen", () => {
    expect(() => data.saveSettings._validate({ ...day(17), breakStart: 12, breakEnd: 17 })).toThrow(
      "Revisá las horas: el corte tiene que entrar en la jornada y caer en un bloque.",
    );
  });
});
