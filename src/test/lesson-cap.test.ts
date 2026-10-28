import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The cap has to be enforced by the API, not only by hiding the button. These
 * tests run the real `addLesson` handler against a mocked database, because the
 * server function wrapper is the only thing that cannot run outside TanStack.
 */

const { execute, connectionExecute, findSessionUser } = vi.hoisted(() => ({
  execute: vi.fn(),
  connectionExecute: vi.fn(),
  findSessionUser: vi.fn(),
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
      execute: connectionExecute,
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  }),
}));

vi.mock("@/server/session-user", () => ({ findSessionUser }));

const { addLesson } = (await import("@/server/data")) as unknown as {
  addLesson: { _handler: (args: { data: unknown }) => Promise<string> };
};

const book = (studentId = "11111111-1111-1111-1111-111111111111") =>
  addLesson._handler({ data: { date: "2026-11-02", start: "09:00", studentId } });

beforeEach(() => {
  execute.mockReset();
  connectionExecute.mockReset();
  findSessionUser.mockReset();
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
