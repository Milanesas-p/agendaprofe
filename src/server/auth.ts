import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { normalizeEmail, validatePassword } from "../lib/credentials";
import { LOGIN_WINDOW_MINUTES, nextFailures } from "../lib/login-throttle";
import { db } from "./db";
import { verifyPassword } from "./password";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, hashSessionToken, newSessionToken } from "./session";
import { findSessionUser, type AuthUser } from "./session-user";

export type { AuthUser };

type Credentials = { email: string; password: string };

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  password_hash: string;
  tour_done_at: string | null;
  failed_logins: number;
  /** 1 when MySQL says the account is still parked. */
  locked: number;
  /** 1 when the stored streak is older than the window and no longer counts. */
  stale: number;
};

const WRONG_CREDENTIALS = "Correo o contraseña incorrectos.";
const TOO_MANY_ATTEMPTS = "Demasiados intentos. Esperá unos minutos y volvé a probar.";

function readCredentials(input: unknown): Credentials {
  const raw = (input ?? {}) as Record<string, unknown>;
  return { email: normalizeEmail(raw["email"]), password: validatePassword(raw["password"]) };
}

async function startSession(userId: string): Promise<void> {
  const token = newSessionToken();
  await db().execute(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))",
    [hashSessionToken(token), userId, SESSION_TTL_SECONDS],
  );
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * The lock and the streak age are decided by MySQL's clock: the app and the
 * database do not have to share a timezone for the throttle to be right.
 */
const READ_USER = `SELECT id, email, display_name, password_hash, tour_done_at,
  failed_logins,
  (locked_until IS NOT NULL AND locked_until > NOW()) AS locked,
  (last_failed_at IS NULL OR last_failed_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)) AS stale
  FROM users WHERE email = ?`;

/** Registers a failed attempt and parks the account when the streak hits the limit. */
async function registerFailure(row: UserRow): Promise<void> {
  const { failures, lock } = nextFailures({ failures: Number(row.failed_logins) || 0, stale: Number(row.stale) === 1 });
  await db().execute(
    "UPDATE users SET failed_logins = ?, last_failed_at = NOW(), locked_until = IF(?, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL) WHERE id = ?",
    [failures, lock ? 1 : 0, LOGIN_WINDOW_MINUTES, row.id],
  );
}

/** Clears the streak, but only when there is something to clear. */
async function clearFailures(userId: string): Promise<void> {
  await db().execute(
    "UPDATE users SET failed_logins = 0, last_failed_at = NULL, locked_until = NULL WHERE id = ? AND (failed_logins <> 0 OR last_failed_at IS NOT NULL OR locked_until IS NOT NULL)",
    [userId],
  );
}

export const loginUser = createServerFn({ method: "POST" })
  .validator(readCredentials)
  .handler(async ({ data }): Promise<AuthUser> => {
    const [rows] = await db().execute(READ_USER, [LOGIN_WINDOW_MINUTES, data.email]);
    const row = (rows as UserRow[])[0];
    // Parked accounts are refused before spending a scrypt verification.
    if (row && Number(row.locked) === 1) throw new Error(TOO_MANY_ATTEMPTS);
    if (!row || !(await verifyPassword(data.password, row.password_hash))) {
      if (row) await registerFailure(row);
      throw new Error(WRONG_CREDENTIALS);
    }
    await clearFailures(row.id);
    await startSession(row.id);
    return { id: row.id, email: row.email, name: row.display_name ?? null, tourDone: row.tour_done_at !== null };
  });

export const logoutUser = createServerFn({ method: "POST" }).handler(async (): Promise<null> => {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await db().execute("DELETE FROM sessions WHERE token_hash = ?", [hashSessionToken(token)]);
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return null;
});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthUser | null> => findSessionUser(),
);

/**
 * Marks the welcome tour as done. It never moves backwards: the first completion
 * wins, so a retried request cannot make the tour show up again.
 */
export const completeTour = createServerFn({ method: "POST" }).handler(async (): Promise<void> => {
  const user = await findSessionUser();
  if (!user) throw new Error("Iniciá sesión para guardar tus cambios.");
  await db().execute("UPDATE users SET tour_done_at = COALESCE(tour_done_at, NOW()) WHERE id = ?", [user.id]);
});
