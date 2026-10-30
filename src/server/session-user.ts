import { getCookie } from "@tanstack/react-start/server";
import { db } from "./db";
import { SESSION_COOKIE, hashSessionToken } from "./session";

export type AuthUser = { id: string; email: string; name: string | null; /** False until the welcome tour is done. */ tourDone: boolean };

/**
 * Resolves the signed-in user from the session cookie.
 * Server-only module: never import it from browser code.
 */
export async function findSessionUser(): Promise<AuthUser | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const [rows] = await db().execute(
    "SELECT u.id, u.email, u.display_name AS name, u.tour_done_at IS NOT NULL AS tourDone FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > NOW()",
    [hashSessionToken(token)],
  );
  const row = (rows as Array<Omit<AuthUser, "tourDone"> & { tourDone: number }>)[0];
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, tourDone: Number(row.tourDone) === 1 };
}
