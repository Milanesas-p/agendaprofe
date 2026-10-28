/**
 * Phone handling for students.
 *
 * Stored as digits only: the number exists so the teacher can message a student
 * on WhatsApp later, and `wa.me` wants plain digits without separators or a
 * leading plus.
 */

const MIN_DIGITS = 6;
const MAX_DIGITS = 20;

export const PHONE_DIGITS_ERROR = "El teléfono tiene que tener entre 6 y 20 dígitos.";
export const PHONE_FORMAT_ERROR = "El teléfono tiene que tener números.";

/** Returns digits only, or null when there is no phone. Throws on unusable input. */
export function normalizePhone(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(PHONE_FORMAT_ERROR);

  const trimmed = value.trim();
  if (trimmed === "") return null;

  // Letters mean the teacher typed something that is not a phone; punctuation and
  // separators alone just mean "no phone".
  if (/[A-Za-z]/.test(trimmed)) throw new Error(PHONE_FORMAT_ERROR);

  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length === 0) return null;
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) throw new Error(PHONE_DIGITS_ERROR);

  return digits;
}
