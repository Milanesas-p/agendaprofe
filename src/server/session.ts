import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "ppm_session";

/** 30 days, in seconds: the value handed to MySQL's DATE_ADD. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Opaque, URL-safe token used as the cookie value. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is persisted, so the cookie value itself is never stored. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
