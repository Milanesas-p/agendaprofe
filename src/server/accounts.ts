import { randomUUID } from "node:crypto";

import { normalizeEmail, validatePassword } from "../lib/credentials.ts";
import { db } from "./db.ts";
import { hashPassword } from "./password.ts";

/**
 * Account lifecycle used by the command line tools.
 *
 * Registration was removed from the app on purpose: accounts are provisioned by
 * whoever runs the system, after the interested teacher gets in touch. This module
 * is the only place that creates users or replaces their password.
 *
 * Relative imports carry the `.ts` extension because these modules are also run
 * directly by Node (`node scripts/create-account.ts`), which does not resolve
 * extensionless specifiers. Vite resolves them the same way.
 */

export type Account = { id: string; email: string; name: string | null };

type UserRow = { id: string; email: string; display_name: string | null };

/** Looks an account up by email, or null. Validates the address first. */
export async function findAccount(rawEmail: unknown): Promise<Account | null> {
  const email = normalizeEmail(rawEmail);
  const [rows] = await db().execute("SELECT id, email, display_name FROM users WHERE email = ?", [email]);
  const row = (rows as UserRow[])[0];
  return row ? { id: row.id, email: row.email, name: row.display_name ?? null } : null;
}

/** Creates a user with a scrypt hash. Throws on an invalid or already used email. */
export async function createAccount(rawEmail: unknown, rawPassword: unknown, rawName?: unknown): Promise<Account> {
  const email = normalizeEmail(rawEmail);
  const password = validatePassword(rawPassword);
  const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim().slice(0, 120) : null;
  const id = randomUUID();
  const passwordHash = await hashPassword(password);

  try {
    await db().execute("INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)", [
      id,
      email,
      passwordHash,
      name,
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new Error("Ese correo ya está registrado.");
    }
    throw error;
  }

  return { id, email, name };
}

/**
 * Replaces a password and revokes every open session for that user, so a
 * forgotten (or leaked) password cannot be paired with an already issued cookie.
 */
export async function resetAccountPassword(rawEmail: unknown, rawPassword: unknown): Promise<Account> {
  const email = normalizeEmail(rawEmail);
  const password = validatePassword(rawPassword);

  const account = await findAccount(email);
  if (!account) throw new Error("No existe una cuenta con ese correo.");

  const passwordHash = await hashPassword(password);
  await db().execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, account.id]);
  await db().execute("DELETE FROM sessions WHERE user_id = ?", [account.id]);

  return account;
}
