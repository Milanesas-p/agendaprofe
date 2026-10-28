/**
 * Credential rules shared by the login server function and the account CLI.
 *
 * Pure module on purpose: no framework, database or Node-only imports, so both
 * the bundled server code and a plain `node scripts/*.ts` process can use it.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL_ERROR = "Ingresá un correo válido.";
export const PASSWORD_ERROR = "La contraseña necesita al menos 8 caracteres.";

/** Trims and lowercases an email, throwing when it cannot be a valid address. */
export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error(EMAIL_ERROR);
  const email = value.trim().toLowerCase();
  if (email.length < 5 || email.length > 255 || !EMAIL_PATTERN.test(email)) {
    throw new Error(EMAIL_ERROR);
  }
  return email;
}

/**
 * Rejects passwords the login form could never produce. The value is returned
 * untouched: trimming would silently change what the user typed.
 */
export function validatePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 200) {
    throw new Error(PASSWORD_ERROR);
  }
  return value;
}
