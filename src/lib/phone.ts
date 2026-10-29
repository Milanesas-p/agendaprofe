/**
 * Phone handling for students.
 *
 * Stored as digits only, in international format, because the number exists so
 * the teacher can open the student's WhatsApp chat: `wa.me` wants plain digits
 * without separators or a leading plus.
 *
 * A number without a country code is taken as Argentine and completed, so the
 * teacher never has to type `549`. A student from another country is written with
 * their own code and left exactly as it came.
 */

const MIN_DIGITS = 6;
const MAX_DIGITS = 20;
/** A local Argentine number: area code plus subscriber number, no country code. */
const LOCAL_DIGITS = 10;
const AR_COUNTRY_CODE = "54";
const AR_MOBILE_PREFIX = "549";

export const PHONE_DIGITS_ERROR = "El teléfono tiene que tener entre 6 y 20 dígitos.";
export const PHONE_FORMAT_ERROR = "El teléfono tiene que tener números.";

/**
 * Completes a digits-only phone with the country code when it does not carry one.
 *
 * - `549...` is already right.
 * - `54...` is Argentine but missing the mobile 9, so the 9 is inserted.
 * - more than ten digits means another country wrote its code: leave it alone.
 * - anything shorter is a local Argentine number: prefix `549`.
 */
export function withCountryCode(digits: string): string {
  if (digits.startsWith(AR_MOBILE_PREFIX)) return digits;
  if (digits.startsWith(AR_COUNTRY_CODE)) return `${AR_MOBILE_PREFIX}${digits.slice(AR_COUNTRY_CODE.length)}`;
  if (digits.length > LOCAL_DIGITS) return digits;
  return `${AR_MOBILE_PREFIX}${digits}`;
}

/** Returns digits only, or null when there is no phone. Throws on unusable input. */
export function normalizePhone(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(PHONE_FORMAT_ERROR);

  const trimmed = value.trim();
  if (trimmed === "") return null;

  // Letters mean the teacher typed something that is not a phone; punctuation and
  // separators alone just mean "no phone".
  if (/[A-Za-z]/.test(trimmed)) throw new Error(PHONE_FORMAT_ERROR);

  const digits = trimmed.replace(/[^0-9]/g, "").replace(/^0+/, "");
  if (digits.length === 0) return null;
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) throw new Error(PHONE_DIGITS_ERROR);

  return withCountryCode(digits);
}
