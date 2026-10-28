import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/server/db.ts", () => ({ db: () => ({ execute }) }));

import { createAccount, findAccount, resetAccountPassword } from "@/server/accounts";
import { verifyPassword } from "@/server/password";

beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue([{ affectedRows: 1 }, []]);
});

describe("findAccount", () => {
  it("normalizes the email before querying", async () => {
    execute.mockResolvedValueOnce([[{ id: "user-1", email: "profe@padel.com" }], []]);

    await expect(findAccount("  Profe@Padel.COM ")).resolves.toEqual({
      id: "user-1",
      email: "profe@padel.com",
    });
    expect((execute.mock.calls[0]?.[1] as unknown[])[0]).toBe("profe@padel.com");
  });

  it("returns null when there is no account", async () => {
    execute.mockResolvedValueOnce([[], []]);
    await expect(findAccount("nadie@padel.com")).resolves.toBeNull();
  });
});

describe("createAccount", () => {
  it("stores a scrypt hash, never the plain password", async () => {
    const account = await createAccount("  Profe@Padel.COM ", "secreto123");

    expect(account.email).toBe("profe@padel.com");
    expect(account.id).toMatch(/^[0-9a-f-]{36}$/);

    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO users");
    expect(params[0]).toBe(account.id);
    expect(params[1]).toBe("profe@padel.com");
    expect(params[2]).not.toBe("secreto123");
    expect(await verifyPassword("secreto123", params[2] as string)).toBe(true);
  });

  it("reports a duplicate email instead of leaking the driver error", async () => {
    execute.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));

    await expect(createAccount("profe@padel.com", "secreto123")).rejects.toThrow(
      "Ese correo ya está registrado.",
    );
  });

  it("validates before touching the database", async () => {
    await expect(createAccount("no-es-mail", "secreto123")).rejects.toThrow("Ingresá un correo válido.");
    await expect(createAccount("profe@padel.com", "corta")).rejects.toThrow(
      "La contraseña necesita al menos 8 caracteres.",
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("resetAccountPassword", () => {
  it("replaces the hash and revokes every open session for that user", async () => {
    execute.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT") ? [[{ id: "user-1", email: "profe@padel.com" }], []] : [{ affectedRows: 1 }, []],
    );

    const account = await resetAccountPassword("profe@padel.com", "nuevaClave1");

    expect(account).toEqual({ id: "user-1", email: "profe@padel.com" });

    const statements = execute.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.startsWith("UPDATE users SET password_hash"))).toBe(true);
    expect(statements.some((sql) => sql.startsWith("DELETE FROM sessions"))).toBe(true);

    const update = execute.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE users"));
    expect(await verifyPassword("nuevaClave1", (update?.[1] as unknown[])[0] as string)).toBe(true);
  });

  it("refuses an email that has no account and writes nothing", async () => {
    execute.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT") ? [[], []] : [{ affectedRows: 1 }, []],
    );

    await expect(resetAccountPassword("nadie@padel.com", "nuevaClave1")).rejects.toThrow(
      "No existe una cuenta con ese correo.",
    );
    expect(execute.mock.calls.every(([sql]) => String(sql).startsWith("SELECT"))).toBe(true);
  });
});
