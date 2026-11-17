/**
 * Scheduling rules shared by the browser and the server.
 *
 * They live here so the client cannot accept a slot the server rejects (or the
 * other way around). Pure functions only: safe to import from either side.
 */

export type SlotRules = {
  startHour: number;
  endHour: number;
  blockMin: number;
  /** Optional break: the app works from `startHour` to `endHour` minus this gap. */
  breakStart?: number | null;
  breakEnd?: number | null;
};

export type ClassStatus = "programada" | "confirmado" | "presente" | "ausente" | "cancelada";

/**
 * A break is only valid when it sits inside the working window on a block
 * boundary, so the slot grid keeps its rhythm on both sides of the gap.
 */
const validBreak = (s: SlotRules): boolean => {
  const from = s.breakStart ?? null;
  const to = s.breakEnd ?? null;
  if (from === null && to === null) return true;
  if (from === null || to === null) return false;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
  if (from <= s.startHour || to >= s.endHour || to <= from) return false;
  const onGrid = (hour: number) => ((hour - s.startHour) * 60) % s.blockMin === 0;
  return onGrid(from) && onGrid(to);
};

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
  s.blockMin <= (s.endHour - s.startHour) * 60 &&
  validBreak(s);

export function slots(s: SlotRules): string[] {
  if (!validSettings(s)) return [];
  const out: string[] = [];
  const from = s.breakStart ?? null;
  const to = s.breakEnd ?? null;
  for (let m = s.startHour * 60; m + s.blockMin <= s.endHour * 60; m += s.blockMin) {
    // A block that touches the break at all does not exist that day.
    if (from !== null && to !== null && m < to * 60 && m + s.blockMin > from * 60) continue;
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** A lesson (one time slot) holds at most this many students. */
export const MAX_STUDENTS_PER_LESSON = 4;

/** One fixed weekly slot, as the schedule has to see it: whose it is, at what time. */
export type FixedSlot = { name: string; time: string };

/**
 * The fixed slots the given workday cannot place.
 *
 * Compared against the source of truth (the student's own weekly slot), never
 * against generated lessons: a slot can be pending and still be impossible, which
 * is exactly the state that used to hide the problem.
 */
export function fixedSlotsOutsideBlocks(s: SlotRules, fixed: readonly FixedSlot[]): FixedSlot[] {
  const allowed = slots(s);
  return fixed.filter((slot) => !allowed.includes(slot.time));
}

/** Names the students a workday would leave out, with the times that have no block. */
export function outsideBlocksMessage(outside: readonly FixedSlot[]): string {
  const names = [...new Set(outside.map((slot) => slot.name))];
  const times = [...new Set(outside.map((slot) => slot.time))].sort();
  const who =
    names.length === 1
      ? names[0]!
      : names.length === 2
        ? `${names[0]} y ${names[1]}`
        : `${names[0]}, ${names[1]} y ${names.length - 2} más`;
  const verb = names.length === 1 ? "tiene" : "tienen";
  return `${who} ${verb} horario fijo fuera de la jornada configurada: ${times.join(", ")}.`;
}

/**
 * Whether another student still fits in a slot that already holds
 * `activeStudents` non-cancelled students. The server enforces this; the client
 * uses it to hide the "add student" button.
 */
export const canAddToLesson = (activeStudents: number): boolean =>
  Number.isInteger(activeStudents) && activeStudents >= 0 && activeStudents < MAX_STUDENTS_PER_LESSON;

/**
 * A lesson consumes one class only once it was attended or marked absent.
 * "confirmado" is the student saying they will come: still no class spent.
 */
export const usedClass = (status: ClassStatus): number =>
  status === "presente" || status === "ausente" ? 1 : 0;

/**
 * Balance change when a lesson moves from `previous` to `next`.
 * Negative means one class is deducted. Idempotent for present<->absent.
 */
export const balanceDelta = (previous: ClassStatus, next: ClassStatus): number =>
  usedClass(previous) - usedClass(next);
