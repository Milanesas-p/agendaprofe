import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { db } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, hashSessionToken, newSessionToken } from "./session";
import { findSessionUser, type AuthUser } from "./session-user";

export type { AuthUser };

type Credentials = { email: string; password: string };

type UserRow = { id: string; email: string; password_hash: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error("Ingresá un correo válido.");
  const email = value.trim().toLowerCase();
  if (email.length < 5 || email.length > 255 || !EMAIL_PATTERN.test(email)) {
    throw new Error("Ingresá un correo válido.");
  }
  return email;
}

function cleanPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 200) {
    throw new Error("La contraseña necesita al menos 8 caracteres.");
  }
  return value;
}

function readCredentials(input: unknown): Credentials {
  const raw = (input ?? {}) as Record<string, unknown>;
  return { email: cleanEmail(raw["email"]), password: cleanPassword(raw["password"]) };
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

export const registerUser = createServerFn({ method: "POST" })
  .validator(readCredentials)
  .handler(async ({ data }): Promise<AuthUser> => {
    const id = randomUUID();
    const passwordHash = await hashPassword(data.password);
    try {
      await db().execute("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)", [
        id,
        data.email,
        passwordHash,
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
        throw new Error("Ese correo ya está registrado.");
      }
      throw error;
    }
    await startSession(id);
    return { id, email: data.email };
  });

export const loginUser = createServerFn({ method: "POST" })
  .validator(readCredentials)
  .handler(async ({ data }): Promise<AuthUser> => {
    const [rows] = await db().execute("SELECT id, email, password_hash FROM users WHERE email = ?", [
      data.email,
    ]);
    const row = (rows as UserRow[])[0];
    if (!row || !(await verifyPassword(data.password, row.password_hash))) {
      throw new Error("Correo o contraseña incorrectos.");
    }
    await startSession(row.id);
    return { id: row.id, email: row.email };
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
