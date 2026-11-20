import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The operator panel is the only place that touches other accounts, so every
 * endpoint has to prove the caller is an admin BEFORE writing anything, and a
 * suspension must cut the open sessions of that account.
 */

const { execute, findSessionUser, createAccount, resetAccountPassword } = vi.hoisted(() => ({
  execute: vi.fn(),
  findSessionUser: vi.fn(),
  createAccount: vi.fn(),
  resetAccountPassword: vi.fn(),
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

vi.mock("@/server/db", () => ({ db: () => ({ execute }) }));
vi.mock("@/server/session-user", () => ({ findSessionUser }));
vi.mock("@/server/accounts", () => ({ createAccount, resetAccountPassword }));

type Handler<T = unknown, R = unknown> = { _handler: (ctx: { data: T }) => Promise<R> };

const { createTeacher, listAccounts, resetTeacherPassword, setTeacherActive } = (await import(
  "@/server/admin"
)) as unknown as {
  createTeacher: Handler<{ email: string; password: string; name?: string }, { id: string; email: string }>;
  listAccounts: Handler<undefined, Array<Record<string, unknown>>>;
  resetTeacherPassword: Handler<{ email: string; password: string }, unknown>;
  setTeacherActive: Handler<{ id: string; active: boolean }, unknown>;
};

const FORBIDDEN = "No tenés permiso para ver esta pantalla.";
const admin = { id: "admin-1", email: "duenio@padel.com", name: null, role: "admin", tourDone: true };

beforeEach(() => {
  execute.mockReset();
  findSessionUser.mockReset();
  createAccount.mockReset();
  resetAccountPassword.mockReset();
  findSessionUser.mockResolvedValue(admin);
  execute.mockResolvedValue([[], []]);
});

describe("admin gate", () => {
  it("refuses every endpoint to a teacher", async () => {
    findSessionUser.mockResolvedValue({ ...admin, role: "profe" });

    await expect(listAccounts._handler({ data: undefined })).rejects.toThrow(FORBIDDEN);
    await expect(createTeacher._handler({ data: { email: "nuevo@padel.com", password: "clave1234" } })).rejects.toThrow(
      FORBIDDEN,
    );
    await expect(resetTeacherPassword._handler({ data: { email: "nuevo@padel.com", password: "clave1234" } })).rejects.toThrow(
      FORBIDDEN,
    );
    await expect(setTeacherActive._handler({ data: { id: "user-2", active: false } })).rejects.toThrow(FORBIDDEN);

    expect(execute).not.toHaveBeenCalled();
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("refuses when there is no session", async () => {
    findSessionUser.mockResolvedValue(null);

    await expect(listAccounts._handler({ data: undefined })).rejects.toThrow(FORBIDDEN);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("listAccounts", () => {
  it("returns each account with its usage and last sign-in", async () => {
    execute.mockResolvedValueOnce([
      [
        {
          id: "user-1",
          email: "profe@padel.com",
          display_name: "Eze",
          role: "profe",
          active: 1,
          students: 62,
          lessons30: 18,
          last_login: "2026-11-20 10:00:00",
        },
        {
          id: "admin-1",
          email: "duenio@padel.com",
          display_name: null,
          role: "admin",
          active: 0,
          students: 0,
          lessons30: 0,
          last_login: null,
        },
      ],
      [],
    ]);

    await expect(listAccounts._handler({ data: undefined })).resolves.toEqual([
      {
        id: "user-1",
        email: "profe@padel.com",
        name: "Eze",
        role: "profe",
        active: true,
        students: 62,
        lessons30: 18,
        lastLogin: "2026-11-20 10:00:00",
      },
      {
        id: "admin-1",
        email: "duenio@padel.com",
        name: null,
        role: "admin",
        active: false,
        students: 0,
        lessons30: 0,
        lastLogin: null,
      },
    ]);

    const [sql] = execute.mock.calls[0] as [string];
    expect(sql).toContain("FROM users u");
    expect(sql).toContain("COUNT(*)");
  });
});

describe("createTeacher", () => {
  const validateCreate = (input: unknown) =>
    (createTeacher as unknown as { _validate: (value: unknown) => { email: string; password: string; name?: string } })
      ._validate(input);

  it("creates the account through the shared account module", async () => {
    createAccount.mockResolvedValue({ id: "user-2", email: "nuevo@padel.com", name: "Nuevo" });

    const data = validateCreate({ email: " Nuevo@Padel.com ", password: "clave1234", name: " Nuevo " });

    await expect(createTeacher._handler({ data })).resolves.toEqual({ id: "user-2", email: "nuevo@padel.com" });

    expect(createAccount).toHaveBeenCalledWith("nuevo@padel.com", "clave1234", "Nuevo");
  });

  it("rejects an invalid password before touching the database", async () => {
    expect(() => validateCreate({ email: "nuevo@padel.com", password: "corta" })).toThrow(
      "La contraseña necesita al menos 8 caracteres.",
    );
    expect(createAccount).not.toHaveBeenCalled();
  });
});

describe("setTeacherActive", () => {
  it("revokes the open sessions when the account is suspended", async () => {
    execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await setTeacherActive._handler({ data: { id: "user-2", active: false } });

    const statements = execute.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain("UPDATE users SET active = ?");
    expect(statements.some((sql) => sql.startsWith("DELETE FROM sessions"))).toBe(true);
  });

  it("does not touch the sessions when the account is reactivated", async () => {
    execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await setTeacherActive._handler({ data: { id: "user-2", active: true } });

    const statements = execute.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.startsWith("DELETE FROM sessions"))).toBe(false);
  });

  it("refuses to suspend the admin's own account", async () => {
    await expect(setTeacherActive._handler({ data: { id: "admin-1", active: false } })).rejects.toThrow(
      "No podés suspender tu propia cuenta.",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports an account that does not exist", async () => {
    execute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

    await expect(setTeacherActive._handler({ data: { id: "nadie", active: false } })).rejects.toThrow(
      "Esa cuenta no existe.",
    );
  });
});

describe("resetTeacherPassword", () => {
  it("delegates to the account module, which also revokes sessions", async () => {
    resetAccountPassword.mockResolvedValue({ id: "user-2", email: "profe@padel.com", name: null });

    await expect(
      resetTeacherPassword._handler({ data: { email: "profe@padel.com", password: "nuevaClave1" } }),
    ).resolves.toBeNull();

    expect(resetAccountPassword).toHaveBeenCalledWith("profe@padel.com", "nuevaClave1");
  });
});
