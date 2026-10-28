/**
 * Scheduling rules shared by the browser and the server.
 *
 * They live here so the client cannot accept a slot the server rejects (or the
 * other way around). Pure functions only: safe to import from either side.
 */

export type SlotRules = { startHour: number; endHour: number; blockMin: number };

export type ClassStatus = "programada" | "presente" | "ausente" | "cancelada";

export const validSettings = (s: SlotRules): boolean =>
  Number.isInteger(s.startHour) &&
  Number.isInteger(s.endHour) &&
  Number.isInteger(s.blockMin) &&
  s.startHour >= 0 &&
  s.startHour <= 23 &&
  s.endHour > s.startHour &&
  s.endHour <= 24 &&
  s.blockMin >= 15 &&
  s.blockMin <= 240 &&
  s.blockMin <= (s.endHour - s.startHour) * 60;

export function slots(s: SlotRules): string[] {
  if (!validSettings(s)) return [];
  const out: string[] = [];
  for (let m = s.startHour * 60; m + s.blockMin <= s.endHour * 60; m += s.blockMin) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** A lesson (one time slot) holds at most this many students. */
export const MAX_STUDENTS_PER_LESSON = 4;

/**
 * Whether another student still fits in a slot that already holds
 * `activeStudents` non-cancelled students. The server enforces this; the client
 * uses it to hide the "add student" button.
 */
export const canAddToLesson = (activeStudents: number): boolean =>
  Number.isInteger(activeStudents) && activeStudents >= 0 && activeStudents < MAX_STUDENTS_PER_LESSON;

/** A lesson consumes one class only once it was attended or marked absent. */
export const usedClass = (status: ClassStatus): number =>
  status === "presente" || status === "ausente" ? 1 : 0;

/**
 * Balance change when a lesson moves from `previous` to `next`.
 * Negative means one class is deducted. Idempotent for present<->absent.
 */
export const balanceDelta = (previous: ClassStatus, next: ClassStatus): number =>
  usedClass(previous) - usedClass(next);
