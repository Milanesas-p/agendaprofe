/**
 * Login throttling policy. Pure on purpose: the database supplies the two flags
 * (`failures`, `stale`) so the clock that decides is MySQL's, not Node's.
 */

/** Consecutive failures that park the account. */
export const LOGIN_MAX_FAILURES = 5;

/** How long a streak counts, and how long the account stays parked. */
export const LOGIN_WINDOW_MINUTES = 15;

export type FailureState = {
  /** Failures already stored for this account. */
  failures: number;
  /** The stored streak is older than the window, so it no longer counts. */
  stale: boolean;
};

export type FailureOutcome = {
  /** Streak to store. */
  failures: number;
  /** Whether this failure parks the account. */
  lock: boolean;
};

export function nextFailures({ failures, stale }: FailureState): FailureOutcome {
  const count = stale ? 1 : failures + 1;
  return { failures: count, lock: count >= LOGIN_MAX_FAILURES };
}
