/**
 * Weekly recurrence for a student's fixed slot.
 *
 * Date math is done in UTC on `YYYY-MM-DD` strings so it never depends on the
 * machine timezone: a Friday is a Friday regardless of where the server runs.
 *
 * Pure module: safe to import from the browser and the server, and the only
 * place that decides which dates a recurrence produces.
 */

/** How far ahead a fixed slot is kept booked. Four weeks matches a monthly payment. */
export const HORIZON_DAYS = 28;

/** 0 = Sunday … 6 = Saturday, matching `Date.getUTCDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** One weekly slot of a student: a weekday and a `HH:MM` start. */
export type StudentSlot = { weekday: number; time: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const parse = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

const toIso = (date: Date): string => date.toISOString().slice(0, 10);

const validWeekday = (weekday: number): boolean =>
  Number.isInteger(weekday) && weekday >= 0 && weekday <= 6;

/** Adds days to a `YYYY-MM-DD` string. */
export function addIsoDays(iso: string, days: number): string {
  const date = parse(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** Every date inside `[fromISO, untilISO]` that falls on `weekday`, inclusive. */
export function nextOccurrences(weekday: number, fromISO: string, untilISO: string): string[] {
  if (!validWeekday(weekday) || !DATE.test(fromISO) || !DATE.test(untilISO)) return [];
  if (fromISO > untilISO) return [];

  const out: string[] = [];
  let cursor = fromISO;
  // Skip ahead to the first matching weekday without walking day by day.
  const offset = (weekday - parse(cursor).getUTCDay() + 7) % 7;
  cursor = addIsoDays(cursor, offset);

  while (cursor <= untilISO) {
    out.push(cursor);
    cursor = addIsoDays(cursor, 7);
  }
  return out;
}

/**
 * The occurrences a top-up should still create.
 *
 * Generation is monotonic: it only looks at dates strictly after
 * `lastGeneratedISO`, so an occurrence the teacher moved or cancelled is never
 * recreated behind their back. `todayISO` is a floor, so a stale or missing
 * marker can never book past dates.
 */
export function datesToGenerate(
  weekday: number,
  lastGeneratedISO: string | null,
  todayISO: string,
): string[] {
  if (!validWeekday(weekday) || !DATE.test(todayISO)) return [];

  const from = lastGeneratedISO && DATE.test(lastGeneratedISO)
    ? (addIsoDays(lastGeneratedISO, 1) > todayISO ? addIsoDays(lastGeneratedISO, 1) : todayISO)
    : todayISO;

  return nextOccurrences(weekday, from, addIsoDays(todayISO, HORIZON_DAYS));
}
