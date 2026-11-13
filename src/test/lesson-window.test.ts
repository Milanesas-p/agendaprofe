import { describe, expect, it } from "vitest";

import {
  LESSON_WINDOW_FUTURE_DAYS,
  LESSON_WINDOW_NOTE,
  LESSON_WINDOW_PAST_DAYS,
  windowEndISO,
  windowStartISO,
} from "@/lib/lesson-window";

describe("lesson window", () => {
  it("looks back six months", () => {
    expect(LESSON_WINDOW_PAST_DAYS).toBe(180);
  });

  it("still carries the recurring horizon ahead", () => {
    expect(LESSON_WINDOW_FUTURE_DAYS).toBeGreaterThanOrEqual(28);
  });

  it("starts the window on the local day six months back", () => {
    expect(windowStartISO(new Date(2026, 10, 13))).toBe("2026-05-17");
  });

  it("crosses a month and a year without skipping a day", () => {
    expect(windowStartISO(new Date(2026, 1, 15))).toBe("2025-08-19");
  });

  it("tells the teacher which period the summary counts", () => {
    expect(LESSON_WINDOW_NOTE).toBe("Tomadas y ausencias de los últimos 6 meses.");
  });

  it("ends the window four months ahead, crossing the year", () => {
    expect(windowEndISO(new Date(2026, 10, 13))).toBe("2027-03-13");
  });
});
