import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, setCookie } = vi.hoisted(() => ({ execute: vi.fn(), setCookie: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      validator: (fn: unknown) => { (chain as Record<string, unknown>)["_validate"] = fn; return chain; },
      handler: (fn: unknown) => { (chain as Record<string, unknown>)["_handler"] = fn; return chain; },
    };
    return chain;
  },
}));

vi.mock("@tanstack/react-start/server", () => ({
  setCookie,
  getCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock("@/server/db", () => ({ db: () => ({ execute }) }));

import { hashPassword } from "@/server/password";

const { loginUser } = (await import("@/server/auth")) as unknown as {
  loginUser: { _handler: (ctx: { data: { email: string; password: string } }) => Promise<unknown> };
};

const LOCKED_MESSAGE = "Demasiados intentos. Esperá unos minutos y volvé a probar.";
const WRONG_MESSAGE = "Correo o contraseña incorrectos.";

let stored: string;

beforeEach(async () => {
  execute.mockReset();
  setCookie.mockReset();
  stored = await hashPassword("claveBuena1");
});

function userRow(extra: Record<string, unknown>) {
  return [
    [{ id: "user-1", email: "profe@padel.com", display_name: null, password_hash: stored, tour_done_at: null, ...extra }],
    [],
  ];
}

describe("login throttling", () => {
  it("refuses a parked account before checking the password", async () => {
    execute.mockResolvedValueOnce(userRow({ failed_logins: 5, locked: 1, stale: 0 }));

    await expect(loginUser._handler({ data: { email: "profe@padel.com", password: "claveBuena1" } })).rejects.toThrow(
      LOCKED_MESSAGE,
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("parks the account on the fifth failure using MySQL's clock", async () => {
    execute.mockResolvedValueOnce(userRow({ failed_logins: 4, locked: 0, stale: 0 }));
    execute.mockResolvedValue([{ affectedRows: 1 }, []]);

    await expect(loginUser._handler({ data: { email: "profe@padel.com", password: "claveMala1" } })).rejects.toThrow(
      WRONG_MESSAGE,
    );

    const [sql, params] = execute.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain("DATE_ADD(NOW(), INTERVAL ? MINUTE)");
    expect(params).toEqual([5, 1, 15, "user-1"]);
  });

  it("keeps counting without parking before the limit", async () => {
    execute.mockResolvedValueOnce(userRow({ failed_logins: 2, locked: 0, stale: 0 }));
    execute.mockResolvedValue([{ affectedRows: 1 }, []]);

    await expect(loginUser._handler({ data: { email: "profe@padel.com", password: "claveMala1" } })).rejects.toThrow(
      WRONG_MESSAGE,
    );

    expect((execute.mock.calls[1]?.[1] as unknown[]).slice(0, 2)).toEqual([3, 0]);
  });

  it("starts the streak over when the stored one expired", async () => {
    execute.mockResolvedValueOnce(userRow({ failed_logins: 9, locked: 0, stale: 1 }));
    execute.mockResolvedValue([{ affectedRows: 1 }, []]);

    await expect(loginUser._handler({ data: { email: "profe@padel.com", password: "claveMala1" } })).rejects.toThrow(
      WRONG_MESSAGE,
    );

    expect((execute.mock.calls[1]?.[1] as unknown[]).slice(0, 2)).toEqual([1, 0]);
  });

  it("resets the streak after a good password", async () => {
    execute.mockResolvedValueOnce(userRow({ failed_logins: 3, locked: 0, stale: 0 }));
    execute.mockResolvedValue([{ affectedRows: 1 }, []]);

    await loginUser._handler({ data: { email: "profe@padel.com", password: "claveBuena1" } });

    const statements = execute.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.startsWith("UPDATE users SET failed_logins = 0"))).toBe(true);
    expect(statements.some((sql) => sql.startsWith("INSERT INTO sessions"))).toBe(true);
    expect(setCookie).toHaveBeenCalled();
  });

  it("asks MySQL for the lock and the stale window", async () => {
    execute.mockResolvedValueOnce([[], []]);

    await expect(loginUser._handler({ data: { email: "nadie@padel.com", password: "claveMala1" } })).rejects.toThrow(
      WRONG_MESSAGE,
    );

    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("locked_until > NOW()");
    expect(sql).toContain("DATE_SUB(NOW(), INTERVAL ? MINUTE)");
    expect(params[0]).toBe(15);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
