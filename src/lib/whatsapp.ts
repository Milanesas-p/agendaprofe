/**
 * WhatsApp reminder link.
 *
 * The teacher taps once on the student of a class and lands in the chat with the
 * text already written; sending is always their decision. Nothing is stored: the
 * link is built from the phone that is already saved and the time of the class.
 */

import { withCountryCode } from "@/lib/phone";

const WA_BASE = "https://wa.me/";

/** The reminder the teacher sends, with the time of that class block. */
export function reminderText(start: string): string {
  return `Buenas! Te recuerdo tu clase de las ${start}. Confirmame por favor.`;
}

/**
 * Builds `wa.me/<digits>?text=<message>`, or null when there is no phone.
 *
 * `wa.me` wants plain digits without a plus, which is how phones are stored. A row
 * saved before the country code was completed still gets it here, as a safety net.
 */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (digits === "") return null;
  return `${WA_BASE}${withCountryCode(digits)}?text=${encodeURIComponent(text)}`;
}
