import { createServerFn } from "@tanstack/react-start";
import { normalizeEmail, validatePassword } from "../lib/credentials";
import { createAccount, resetAccountPassword } from "./accounts";
import { db } from "./db";
import { findSessionUser, type Role } from "./session-user";

/**
 * Operator panel: the only place that touches accounts other than the signed-in
 * one. It manages accounts, never their students or classes — the owner_id
 * isolation stays exactly as it is.
 *
 * Every handler proves the caller is an admin before writing anything.
 */

export type AdminAccount = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  students: number;
  /** Classes in the last 30 days, enough to see whether the account is in use. */
  lessons30: number;
  /** Best effort: a logout deletes the session row. */
  lastLogin: string | null;
};

const FORBIDDEN = "No tenés permiso para ver esta pantalla.";
const SELF_SUSPEND = "No podés suspender tu propia cuenta.";
const MISSING = "Esa cuenta no existe.";

async function requireAdmin() {
  const user = await findSessionUser();
  if (!user || user.role !== "admin") throw new Error(FORBIDDEN);
  return user;
}

function accountName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  return name.length > 0 ? name.slice(0, 120) : undefined;
}

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  active: number;
  students: number;
  lessons30: number;
  last_login: string | null;
};

const LIST_ACCOUNTS = `SELECT u.id, u.email, u.display_name, u.role, u.active,
  (SELECT COUNT(*) FROM students s WHERE s.owner_id = u.id) AS students,
  (SELECT COUNT(*) FROM lessons l WHERE l.owner_id = u.id AND l.lesson_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS lessons30,
  (SELECT MAX(x.created_at) FROM sessions x WHERE x.user_id = u.id) AS last_login
  FROM users u ORDER BY u.created_at`;

export const listAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminAccount[]> => {
    await requireAdmin();
    const [rows] = await db().execute(LIST_ACCOUNTS);
    return (rows as UserRow[]).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.display_name,
      role: row.role,
      active: Number(row.active) === 1,
      students: Number(row.students) || 0,
      lessons30: Number(row.lessons30) || 0,
      lastLogin: row.last_login ?? null,
    }));
  },
);

/** Creates a teacher account with an initial password chosen by the operator. */
export const createTeacher = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    return {
      email: normalizeEmail(raw["email"]),
      password: validatePassword(raw["password"]),
      name: accountName(raw["name"]),
    };
  })
  .handler(async ({ data }): Promise<{ id: string; email: string }> => {
    await requireAdmin();
    const account = await createAccount(data.email, data.password, data.name);
    return { id: account.id, email: account.email };
  });

/** Replaces the password and revokes every open session of that account. */
export const resetTeacherPassword = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { email: normalizeEmail(raw["email"]), password: validatePassword(raw["password"]) };
  })
  .handler(async ({ data }): Promise<null> => {
    await requireAdmin();
    await resetAccountPassword(data.email, data.password);
    return null;
  });

/**
 * Suspends or reactivates an account. Suspending also deletes its sessions, so
 * the teacher is out immediately instead of on the next cookie expiry.
 */
export const setTeacherActive = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const id = raw["id"];
    const active = raw["active"];
    if (typeof id !== "string" || id.length === 0) throw new Error("Cuenta inválida.");
    if (typeof active !== "boolean") throw new Error("Cuenta inválida.");
    return { id, active };
  })
  .handler(async ({ data }): Promise<null> => {
    const admin = await requireAdmin();
    if (!data.active && data.id === admin.id) throw new Error(SELF_SUSPEND);

    const [result] = await db().execute("UPDATE users SET active = ? WHERE id = ?", [
      data.active ? 1 : 0,
      data.id,
    ]);
    if (!(result as { affectedRows?: number }).affectedRows) throw new Error(MISSING);
    if (!data.active) await db().execute("DELETE FROM sessions WHERE user_id = ?", [data.id]);
    return null;
  });
