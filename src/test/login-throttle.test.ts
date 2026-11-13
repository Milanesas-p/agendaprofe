import { describe, expect, it } from "vitest";

import { LOGIN_MAX_FAILURES, LOGIN_WINDOW_MINUTES, nextFailures } from "@/lib/login-throttle";

describe("login throttling policy", () => {
  it("counts a failure without locking before the limit", () => {
    expect(nextFailures({ failures: 3, stale: false })).toEqual({ failures: 4, lock: false });
  });

  it("locks the account on the fifth failure", () => {
    expect(nextFailures({ failures: LOGIN_MAX_FAILURES - 1, stale: false })).toEqual({
      failures: LOGIN_MAX_FAILURES,
      lock: true,
    });
  });

  it("starts the streak over when the stored one is older than the window", () => {
    expect(nextFailures({ failures: LOGIN_MAX_FAILURES, stale: true })).toEqual({ failures: 1, lock: false });
  });

  it("does not extend an expired lock with a stale streak", () => {
    expect(nextFailures({ failures: 0, stale: true })).toEqual({ failures: 1, lock: false });
  });

  it("keeps the window at fifteen minutes", () => {
    expect(LOGIN_WINDOW_MINUTES).toBe(15);
  });
});
