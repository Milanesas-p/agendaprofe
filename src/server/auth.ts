import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { normalizeEmail, validatePassword } from "../lib/credentials";
import { db } from "./db";
import { verifyPassword } from "./password";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, hashSessionToken, newSessionToken } from "./session";
import { findSessionUser, type AuthUser } from "./session-user";

export type { AuthUser };

type Credentials = { email: string; password: string };

type UserRow = { id: string; email: string; display_name: string | null; password_hash: string; tour_done_at: string | null };

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

export const loginUser = createServerFn({ method: "POST" })
  .validator(readCredentials)
  .handler(async ({ data }): Promise<AuthUser> => {
    const [rows] = await db().execute("SELECT id, email, display_name, password_hash, tour_done_at FROM users WHERE email = ?", [
      data.email,
    ]);
    const row = (rows as UserRow[])[0];
    if (!row || !(await verifyPassword(data.password, row.password_hash))) {
      throw new Error("Correo o contraseña incorrectos.");
    }
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
