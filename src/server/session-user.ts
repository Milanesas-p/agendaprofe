import { getCookie } from "@tanstack/react-start/server";
import { db } from "./db";
import { SESSION_COOKIE, hashSessionToken } from "./session";

export type Role = "profe" | "admin";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  /** Only an admin sees the operator panel. */
  role: Role;
  /** False until the welcome tour is done. */
  tourDone: boolean;
};

/**
 * Resolves the signed-in user from the session cookie. A suspended account stops
 * resolving here, so an open cookie dies on the next request instead of waiting
 * for it to expire.
 * Server-only module: never import it from browser code.
 */
export async function findSessionUser(): Promise<AuthUser | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const [rows] = await db().execute(
    "SELECT u.id, u.email, u.display_name AS name, u.role, u.tour_done_at IS NOT NULL AS tourDone FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.active = 1",
    [hashSessionToken(token)],
  );
  const row = (rows as Array<Omit<AuthUser, "tourDone"> & { tourDone: number }>)[0];
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, tourDone: Number(row.tourDone) === 1 };
}
