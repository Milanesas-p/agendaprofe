import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";

/**
 * Hashes a password with scrypt and a random per-password salt.
 * Stored format: `scrypt$<saltHex>$<keyHex>`.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = (await scrypt(plain, salt, KEY_LENGTH)) as Buffer;
  return `${PREFIX}$${salt.toString("hex")}$${key.toString("hex")}`;
}

/**
 * Constant-time verification. Returns false for malformed stored values
 * instead of throwing, so a corrupted row cannot escalate into a 500.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [prefix, saltHex, keyHex] = stored.split("$");
  if (prefix !== PREFIX || !saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;

  const actual = (await scrypt(plain, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(actual, expected);
}
