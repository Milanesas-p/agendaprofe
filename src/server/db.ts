import mysql from "mysql2/promise";
import { loadEnvFile } from "node:process";

let pool: mysql.Pool | undefined;
let envLoaded = false;

/**
 * Loads the repository `.env` when the process environment has no DB config.
 * Existing environment variables always win, so a real deployment that injects
 * its own values is never overridden by a stray file.
 */
function ensureEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  if (process.env["DB_PASSWORD"] !== undefined) return;
  try {
    loadEnvFile(".env");
  } catch {
    // No .env present: rely on the real environment.
  }
}

/**
 * Lazily created connection pool. Server-only: never import this from client code.
 *
 * `dateStrings` keeps DATE columns as "YYYY-MM-DD", which is the format the
 * client already stores and compares, so no timezone conversion happens.
 */
export function db(): mysql.Pool {
  if (!pool) {
    ensureEnv();
    const password = process.env["DB_PASSWORD"];
    if (password === undefined) {
      throw new Error("Missing DB_PASSWORD. Add the MySQL credentials to .env.");
    }
    pool = mysql.createPool({
      host: process.env["DB_HOST"] ?? "127.0.0.1",
      port: Number(process.env["DB_PORT"] ?? 3306),
      user: process.env["DB_USER"] ?? "padel",
      password,
      database: process.env["DB_NAME"] ?? "padel",
      waitForConnections: true,
      connectionLimit: 10,
      dateStrings: true,
    });
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
