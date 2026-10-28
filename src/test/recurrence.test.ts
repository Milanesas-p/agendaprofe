import { describe, expect, it } from "vitest";

import { HORIZON_DAYS, datesToGenerate, nextOccurrences } from "@/lib/recurrence";

const FRIDAY = 5;
const WEDNESDAY_2026_10_28 = "2026-10-28";
const PLUS_4_WEEKS = "2026-11-25";

describe("nextOccurrences", () => {
  it("returns every matching weekday inside the window", () => {
    expect(nextOccurrences(FRIDAY, WEDNESDAY_2026_10_28, PLUS_4_WEEKS)).toEqual([
      "2026-10-30",
      "2026-11-06",
      "2026-11-13",
      "2026-11-20",
    ]);
  });

  it("includes the start date when it already matches", () => {
    expect(nextOccurrences(FRIDAY, "2026-10-30", "2026-11-06")).toEqual(["2026-10-30", "2026-11-06"]);
  });

  it("returns nothing for an empty or inverted window", () => {
    expect(nextOccurrences(FRIDAY, PLUS_4_WEEKS, WEDNESDAY_2026_10_28)).toEqual([]);
    expect(nextOccurrences(FRIDAY, "2026-10-31", "2026-10-30")).toEqual([]);
  });

  it("returns nothing for a weekday that does not exist", () => {
    for (const bad of [-1, 7, 2.5, Number.NaN]) {
      expect(nextOccurrences(bad, WEDNESDAY_2026_10_28, PLUS_4_WEEKS), String(bad)).toEqual([]);
    }
  });
});

describe("datesToGenerate", () => {
  it("starts from today when nothing was generated yet", () => {
    expect(datesToGenerate(FRIDAY, null, WEDNESDAY_2026_10_28)).toEqual([
      "2026-10-30",
      "2026-11-06",
      "2026-11-13",
      "2026-11-20",
    ]);
  });

  it("never revisits a date that was already resolved", () => {
    expect(datesToGenerate(FRIDAY, "2026-11-13", WEDNESDAY_2026_10_28)).toEqual(["2026-11-20"]);
  });

  it("does not generate today again", () => {
    expect(datesToGenerate(FRIDAY, WEDNESDAY_2026_10_28, WEDNESDAY_2026_10_28)).toEqual([
      "2026-10-30",
      "2026-11-06",
      "2026-11-13",
      "2026-11-20",
    ]);
  });

  it("returns nothing when the horizon is already covered", () => {
    expect(datesToGenerate(FRIDAY, "2026-12-01", WEDNESDAY_2026_10_28)).toEqual([]);
  });

  it("looks exactly four weeks ahead", () => {
    expect(HORIZON_DAYS).toBe(28);
    const generated = datesToGenerate(FRIDAY, null, WEDNESDAY_2026_10_28);
    expect(generated.at(-1)).toBe("2026-11-20");
    expect(generated.every((d) => d <= PLUS_4_WEEKS)).toBe(true);
  });
});
