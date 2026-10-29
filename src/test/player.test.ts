import { describe, expect, it } from "vitest";
import { CATEGORIES, COURT_SIDES, courtSideLabel } from "@/lib/player";

describe("player profile", () => {
  it("lists the categories from first to eighth", () => {
    expect(CATEGORIES).toEqual(["1ra", "2da", "3ra", "4ta", "5ta", "6ta", "7ma", "8va"]);
  });

  it("labels every court side the way the teacher reads it", () => {
    expect(COURT_SIDES.map(courtSideLabel)).toEqual(["Drive", "Revés", "Indistinto"]);
  });
});
