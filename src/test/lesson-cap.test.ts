import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The cap has to be enforced by the API, not only by hiding the button. These
 * tests run the real `addLesson` handler against a mocked database, because the
 * server function wrapper is the only thing that cannot run outside TanStack.
 */

const { execute, connectionExecute, findSessionUser, calls } = vi.hoisted(() => ({
  execute: vi.fn(),
  connectionExecute: vi.fn(),
  findSessionUser: vi.fn(),
  calls: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      validator: (fn: unknown) => { (chain as Record<string, unknown>)["_validate"] = fn; return chain; },
      handler: (fn: unknown) => { (chain as Record<string, unknown>)["_handler"] = fn; return chain; },
    };
    return chain;
  },
}));

vi.mock("@/server/db", () => ({
  db: () => ({
    execute,
    getConnection: async () => ({
      query: async (sql: string) => {
        calls.push(String(sql));
        return [[], []];
      },
      execute: connectionExecute,
      beginTransaction: async () => {
        calls.push("BEGIN");
      },
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  }),
}));

vi.mock("@/server/session-user", () => ({ findSessionUser }));

const { addLesson, moveLesson, materializeRecurring, setLessonStatus } = (await import(
  "@/server/data"
)) as unknown as {
  addLesson: { _handler: (args: { data: unknown }) => Promise<string> };
  moveLesson: { _handler: (args: { data: unknown }) => Promise<void> };
  materializeRecurring: { _handler: () => Promise<unknown> };
  setLessonStatus: { _handler: (args: { data: unknown }) => Promise<void> };
};

const book = (studentId = "11111111-1111-1111-1111-111111111111") =>
  addLesson._handler({ data: { date: "2026-11-02", start: "09:00", studentId } });

const countQueries = () =>
  connectionExecute.mock.calls.map((call) => String(call[0])).filter((sql) => sql.includes("COUNT(*)"));

beforeEach(() => {
  execute.mockReset();
  connectionExecute.mockReset();
  findSessionUser.mockReset();
  calls.length = 0;
  findSessionUser.mockResolvedValue({ id: "owner-1", email: "profe@padel.com" });
  // readSettings finds no row, so the default 08:00-22:00 blocks apply.
  execute.mockResolvedValue([[], []]);
  connectionExecute.mockResolvedValue([{ affectedRows: 1 }, []]);
});

describe("addLesson capacity", () => {
  it("accepts a fourth student in the same slot", async () => {
    connectionExecute.mockResolvedValueOnce([[{ n: 3 }], []]);
    await expect(book()).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects the fifth student without inserting anything", async () => {
    connectionExecute.mockResolvedValueOnce([[{ n: 4 }], []]);

    await expect(book()).rejects.toThrow("Esta clase ya tiene 4 alumnos.");
    expect(connectionExecute).toHaveBeenCalledTimes(1);
    expect(String(connectionExecute.mock.calls[0]?.[0])).toContain("COUNT(*)");
  });

  it("explains that the student is already in the class", async () => {
    connectionExecute
      .mockResolvedValueOnce([[{ n: 1 }], []])
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));

    await expect(book()).rejects.toThrow("Ese alumno ya está en esta clase.");
  });

  it("refuses a slot outside the configured blocks before touching the database", async () => {
    await expect(
      addLesson._handler({
        data: { date: "2026-11-02", start: "23:30", studentId: "11111111-1111-1111-1111-111111111111" },
      }),
    ).rejects.toThrow("Horario fuera de los bloques configurados.");
    expect(connectionExecute).not.toHaveBeenCalled();
  });
});

/**
 * A plain `SELECT COUNT(*)` reads a snapshot: two concurrent requests both see
 * three students and both write a fourth and a fifth. `FOR UPDATE` turns it into
 * a locking read, so every path that counts a slot and then writes must use it.
 */
describe("capacity counts are locking reads", () => {
  it("locks the slot when booking", async () => {
    connectionExecute.mockResolvedValueOnce([[{ n: 0 }], []]);
    await book();

    expect(countQueries().every((sql) => sql.includes("FOR UPDATE"))).toBe(true);
  });

  it("locks the destination slot when moving a lesson", async () => {
    connectionExecute
      .mockResolvedValueOnce([
        [{ lesson_date: "2026-11-02", start_time: "09:00", student_id: "student-1", status: "programada" }],
        [],
      ])
      .mockResolvedValueOnce([[{ n: 1 }], []])
      .mockResolvedValueOnce([[], []]);

    await moveLesson._handler({
      data: { id: "22222222-2222-2222-2222-222222222222", date: "2026-11-03", start: "10:00" },
    });

    expect(countQueries().every((sql) => sql.includes("FOR UPDATE"))).toBe(true);
  });

  it("rejects the fifth student when moving into a full block", async () => {
    connectionExecute
      .mockResolvedValueOnce([
        [{ lesson_date: "2026-11-02", start_time: "09:00", student_id: "student-1", status: "programada" }],
        [],
      ])
      .mockResolvedValueOnce([[{ n: 4 }], []]);

    await expect(
      moveLesson._handler({
        data: { id: "22222222-2222-2222-2222-222222222222", date: "2026-11-03", start: "10:00" },
      }),
    ).rejects.toThrow("Esa clase ya tiene 4 alumnos.");
    expect(connectionExecute).toHaveBeenCalledTimes(2);
  });

  it("returns early on a no-op move without locking the slot", async () => {
    connectionExecute.mockResolvedValueOnce([
      [{ lesson_date: "2026-11-03", start_time: "10:00", student_id: "student-1", status: "programada" }],
      [],
    ]);

    await moveLesson._handler({
      data: { id: "22222222-2222-2222-2222-222222222222", date: "2026-11-03", start: "10:00" },
    });

    expect(countQueries()).toEqual([]);
  });

  it("counts the destination before the duplicate check, so the lock comes first", async () => {
    connectionExecute
      .mockResolvedValueOnce([
        [{ lesson_date: "2026-11-02", start_time: "09:00", student_id: "student-1", status: "programada" }],
        [],
      ])
      .mockResolvedValueOnce([[{ n: 1 }], []])
      .mockResolvedValueOnce([[], []]);

    await moveLesson._handler({
      data: { id: "22222222-2222-2222-2222-222222222222", date: "2026-11-03", start: "10:00" },
    });

    const statements = connectionExecute.mock.calls.map((call) => String(call[0]));
    const lock = statements.findIndex((sql) => sql.includes("COUNT(*)"));
    const duplicate = statements.findIndex((sql) => sql.includes("student_id = ? AND lesson_date = ?"));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(duplicate);
  });

  it("locks the slot while generating recurring lessons", async () => {
    execute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([
        [
          {
            id: "student-1",
            name: "Ana",
            recurring_weekday: 5,
            recurring_time: "14:00",
            recurring_last_date: null,
          },
        ],
        [],
      ]);
    connectionExecute.mockResolvedValue([[], []]);

    await materializeRecurring._handler();

    expect(countQueries().every((sql) => sql.includes("FOR UPDATE"))).toBe(true);
  });
});

/**
 * Two saves crossing each other are retryable: MySQL already rolled the
 * transaction back, so nothing was written. The teacher should read a sentence
 * they can act on, not a driver error in English.
 */
describe("contention errors", () => {
  const message = "No se pudo guardar: hubo dos cambios al mismo tiempo. Probá de nuevo.";

  it("turns a deadlock into a message the teacher can act on", async () => {
    connectionExecute.mockRejectedValueOnce(
      Object.assign(new Error("Deadlock found when trying to get lock"), { code: "ER_LOCK_DEADLOCK" }),
    );

    await expect(book()).rejects.toThrow(message);
  });

  it("turns a lock wait timeout into the same message", async () => {
    connectionExecute.mockRejectedValueOnce(
      Object.assign(new Error("Lock wait timeout exceeded"), { code: "ER_LOCK_WAIT_TIMEOUT" }),
    );

    await expect(book()).rejects.toThrow(message);
  });

  it("lets unrelated database errors through untouched", async () => {
    connectionExecute.mockRejectedValueOnce(Object.assign(new Error("Table is gone"), { code: "ER_NO_SUCH_TABLE" }));

    await expect(book()).rejects.toThrow("Table is gone");
  });
});

/**
 * The empty-slot race is only stopped by REPEATABLE READ gap locks: with a block
 * that has no rows yet there is nothing to take a record lock on. The level is
 * pinned per transaction so a server or session default cannot silently weaken it.
 */
describe("transaction isolation", () => {
  it("pins REPEATABLE READ before starting the transaction", async () => {
    connectionExecute.mockResolvedValueOnce([[{ n: 0 }], []]);
    await book();

    expect(calls[0]).toContain("REPEATABLE READ");
    expect(calls[1]).toBe("BEGIN");
  });
});

/**
 * The app writes `slot_key` itself: MariaDB refuses conditional expressions in a
 * generated column, so the database can no longer compute it. The invariant is the
 * same one the unique key relies on: an active row carries `date#time`, a cancelled
 * row carries NULL.
 */
describe("slot key is written by the app", () => {
  const insertParams = () => {
    const call = connectionExecute.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO lessons"));
    return (call?.[1] ?? []) as unknown[];
  };

  it("stores date#time when booking a class", async () => {
    connectionExecute.mockResolvedValueOnce([[{ n: 0 }], []]);
    await book();

    expect(String(connectionExecute.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO lessons"))?.[0])).toContain(
      "slot_key",
    );
    expect(insertParams()[5]).toBe("2026-11-02#09:00");
  });

  it("frees the slot when the class is cancelled", async () => {
    connectionExecute
      .mockResolvedValueOnce([[{ status: "programada", student_id: "student-1" }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await setLessonStatus._handler({ data: { id: "33333333-3333-3333-3333-333333333333", status: "cancelada" } });

    const update = connectionExecute.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE lessons SET status"));
    expect(String(update?.[0])).toContain("slot_key = CASE WHEN ? = 'cancelada' THEN NULL");
    expect((update?.[1] as unknown[])[1]).toBe("cancelada");
  });

  it("keeps the slot occupied for any other status", async () => {
    connectionExecute
      .mockResolvedValueOnce([[{ status: "confirmado", student_id: "student-1" }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await setLessonStatus._handler({ data: { id: "33333333-3333-3333-3333-333333333333", status: "presente" } });

    const update = connectionExecute.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE lessons SET status"));
    expect((update?.[1] as unknown[])[1]).toBe("presente");
  });

  it("moves the slot key to the destination when a class is moved", async () => {
    connectionExecute
      .mockResolvedValueOnce([
        [{ lesson_date: "2026-11-02", start_time: "09:00", student_id: "student-1", status: "programada" }],
        [],
      ])
      .mockResolvedValueOnce([[{ n: 1 }], []])
      .mockResolvedValueOnce([[], []]);

    await moveLesson._handler({
      data: { id: "22222222-2222-2222-2222-222222222222", date: "2026-11-03", start: "10:00" },
    });

    const update = connectionExecute.mock.calls.find(([sql]) => String(sql).includes("slot_key = CONCAT(?, '#', ?)"));
    expect(String(update?.[0])).toContain("slot_key = CONCAT(?, '#', ?)");
    expect((update?.[1] as unknown[]).slice(2, 4)).toEqual(["2026-11-03", "10:00"]);
  });
});