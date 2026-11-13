/**
 * How much lesson history the snapshot carries. Older rows stay in the database:
 * the summary reports this window and the agenda refuses to walk before it, so the
 * app never shows an empty month that looks like lost data.
 */
export const LESSON_WINDOW_PAST_DAYS = 180;

/**
 * Ahead of today. Recurring lessons materialize up to `HORIZON_DAYS` (28), so this
 * leaves room for classes booked or moved by hand.
 */
export const LESSON_WINDOW_FUTURE_DAYS = 120;

/** Read by the summary so the screen says which period it is counting. */
export const LESSON_WINDOW_NOTE = "Tomadas y ausencias de los últimos 6 meses.";

/** First day the snapshot carries, as the local ISO day. */
export function windowStartISO(today: Date): string {
  return shiftDaysISO(today, -LESSON_WINDOW_PAST_DAYS);
}

/** Last day the snapshot carries: the agenda stops here too. */
export function windowEndISO(today: Date): string {
  return shiftDaysISO(today, LESSON_WINDOW_FUTURE_DAYS);
}

function shiftDaysISO(today: Date, days: number): string {
  const shifted = new Date(today);
  shifted.setDate(shifted.getDate() + days);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
}
