import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The balance API has to accept a monthly batch (4 or 8) and still refuse a
 * no-op or an absurd number, so a typo never wrecks a student's balance. The
 * server function wrapper is the only piece that cannot run outside TanStack.
 */

const { execute, findSessionUser } = vi.hoisted(() => ({
  execute: vi.fn(),
  findSessionUser: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain: Record<string, unknown> = {
      validator: (fn: unknown) => {
        chain["_validate"] = fn;
        return chain;
      },
      handler: (fn: unknown) => {
        chain["_handler"] = fn;
        return chain;
      },
    };
    return chain;
  },
}));

vi.mock("@/server/db", () => ({ db: () => ({ execute }) }));
vi.mock("@/server/session-user", () => ({ findSessionUser }));

const { adjustBalance } = (await import("@/server/data")) as unknown as {
  adjustBalance: {
    _validate: (input: unknown) => { id: string; delta: number };
    _handler: (args: { data: unknown }) => Promise<void>;
  };
};

const id = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  execute.mockReset();
  findSessionUser.mockReset();
  findSessionUser.mockResolvedValue({ id: "owner-1", email: "profe@padel.com" });
  execute.mockResolvedValue([{ affectedRows: 1 }, []]);
});

describe("balance adjustments", () => {
  it("accepts one class and a monthly top-up of four or eight", () => {
    expect(adjustBalance._validate({ id, delta: 1 })).toEqual({ id, delta: 1 });
    expect(adjustBalance._validate({ id, delta: 4 })).toEqual({ id, delta: 4 });
    expect(adjustBalance._validate({ id, delta: 8 })).toEqual({ id, delta: 8 });
    expect(adjustBalance._validate({ id, delta: -8 })).toEqual({ id, delta: -8 });
  });

  it("refuses a no-op and anything beyond one batch", () => {
    expect(() => adjustBalance._validate({ id, delta: 0 })).toThrow("Ajuste inválido.");
    expect(() => adjustBalance._validate({ id, delta: 21 })).toThrow("Ajuste inválido.");
    expect(() => adjustBalance._validate({ id, delta: -21 })).toThrow("Ajuste inválido.");
  });

  it("adds the whole batch with one owner-scoped update", async () => {
    await adjustBalance._handler({ data: { id, delta: 8 } });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      "UPDATE students SET balance = balance + ? WHERE id = ? AND owner_id = ?",
      [8, id, "owner-1"],
    );
  });
});
