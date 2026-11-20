import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A suspended account must be out on both ends: it cannot start a session, and a
 * cookie that is already open stops resolving. The role travels with the user so
 * the shell can show the operator panel only to an admin.
 */

const { execute, getCookie, setCookie } = vi.hoisted(() => ({
  execute: vi.fn(),
  getCookie: vi.fn(),
  setCookie: vi.fn(),
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

vi.mock("@tanstack/react-start/server", () => ({ getCookie, setCookie, deleteCookie: vi.fn() }));

vi.mock("@/server/db", () => ({ db: () => ({ execute }) }));

import { hashPassword } from "@/server/password";

const { loginUser } = (await import("@/server/auth")) as unknown as {
  loginUser: { _handler: (ctx: { data: { email: string; password: string } }) => Promise<{ role: string }> };
};
const { findSessionUser } = await import("@/server/session-user");

const SUSPENDED_MESSAGE = "Esta cuenta está suspendida.";

let stored: string;

beforeEach(async () => {
  execute.mockReset();
  getCookie.mockReset();
  setCookie.mockReset();
  stored = await hashPassword("claveBuena1");
});

function userRow(extra: Record<string, unknown> = {}) {
  return [
    [
      {
        id: "user-1",
        email: "profe@padel.com",
        display_name: null,
        password_hash: stored,
        tour_done_at: null,
        failed_logins: 0,
        locked: 0,
        stale: 0,
        active: 1,
        role: "profe",
        ...extra,
      },
    ],
    [],
  ];
}

describe("suspended accounts", () => {
  it("refuses the login before checking the password", async () => {
    execute.mockResolvedValueOnce(userRow({ active: 0 }));

    await expect(
      loginUser._handler({ data: { email: "profe@padel.com", password: "claveBuena1" } }),
    ).rejects.toThrow(SUSPENDED_MESSAGE);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls.some(([sql]) => String(sql).startsWith("INSERT INTO sessions"))).toBe(false);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("keeps working for an active account", async () => {
    execute.mockResolvedValueOnce(userRow());

    await expect(
      loginUser._handler({ data: { email: "profe@padel.com", password: "claveBuena1" } }),
    ).resolves.toEqual(
      expect.objectContaining({ id: "user-1", role: "profe" }),
    );
  });
});

describe("role", () => {
  it("travels with the signed-in user", async () => {
    execute.mockResolvedValueOnce(userRow({ role: "admin" }));

    await expect(
      loginUser._handler({ data: { email: "profe@padel.com", password: "claveBuena1" } }),
    ).resolves.toEqual(expect.objectContaining({ role: "admin" }));
  });

  it("resolves from the session, ignoring an inactive account", async () => {
    getCookie.mockReturnValue("token-1");
    execute.mockResolvedValueOnce([[{ id: "user-1", email: "profe@padel.com", name: null, role: "admin", tourDone: 1 }], []]);

    await expect(findSessionUser()).resolves.toEqual({
      id: "user-1",
      email: "profe@padel.com",
      name: null,
      role: "admin",
      tourDone: true,
    });

    const [sql] = execute.mock.calls[0] as [string];
    expect(sql).toContain("u.active = 1");
  });
});
