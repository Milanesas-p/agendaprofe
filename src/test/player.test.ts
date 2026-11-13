import { describe, expect, it } from "vitest";
import { CATEGORIES, COURT_SIDES, courtSideLabel, profileLabel } from "@/lib/player";

describe("player profile", () => {
  it("lists the categories from first to eighth", () => {
    expect(CATEGORIES).toEqual([
      "1ra",
      "2da",
      "3ra",
      "4ta",
      "5ta",
      "6ta firme",
      "6ta",
      "7ma firme",
      "7ma",
      "8va firme",
      "8va",
    ]);
  });

  it("labels every court side the way the teacher reads it", () => {
    expect(COURT_SIDES.map(courtSideLabel)).toEqual(["Drive", "Revés", "Indistinto"]);
  });

  it("joins what is set and skips what is not", () => {
    expect(profileLabel({ category: "4ta", courtSide: "reves" })).toBe("4ta · Revés");
    expect(profileLabel({ category: "4ta", courtSide: null })).toBe("4ta");
    expect(profileLabel({ category: null, courtSide: "drive" })).toBe("Drive");
    expect(profileLabel({ category: null, courtSide: null })).toBe("");
  });
});
