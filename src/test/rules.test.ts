import { describe, expect, it } from "vitest";
import { MAX_STUDENTS_PER_LESSON, balanceDelta, canAddToLesson, slots, validSettings } from "@/lib/rules";

describe("lesson capacity", () => {
  it("allows up to four students in the same slot", () => {
    expect(MAX_STUDENTS_PER_LESSON).toBe(4);
    expect(canAddToLesson(0)).toBe(true);
    expect(canAddToLesson(3)).toBe(true);
    expect(canAddToLesson(4)).toBe(false);
    expect(canAddToLesson(5)).toBe(false);
  });

  it("rejects a nonsensical count instead of allowing it", () => {
    expect(canAddToLesson(-1)).toBe(false);
    expect(canAddToLesson(1.5)).toBe(false);
  });
});

describe("balanceDelta", () => {
  it("deducts one class when a lesson is attended", () => {
    expect(balanceDelta("programada", "presente")).toBe(-1);
  });

  it("deducts one class when the student is marked absent", () => {
    expect(balanceDelta("programada", "ausente")).toBe(-1);
  });

  it("does not deduct twice when switching present to absent", () => {
    expect(balanceDelta("presente", "ausente")).toBe(0);
    expect(balanceDelta("ausente", "presente")).toBe(0);
  });

  it("gives the class back when attendance is undone", () => {
    expect(balanceDelta("presente", "programada")).toBe(1);
    expect(balanceDelta("ausente", "programada")).toBe(1);
  });

  it("gives the class back when an attended lesson is cancelled", () => {
    expect(balanceDelta("presente", "cancelada")).toBe(1);
  });

  it("does not move the balance for an untouched lesson", () => {
    expect(balanceDelta("programada", "programada")).toBe(0);
    expect(balanceDelta("cancelada", "cancelada")).toBe(0);
  });
});

describe("slots", () => {
  it("builds evenly spaced slots inside the configured window", () => {
    expect(slots({ startHour: 8, endHour: 11, blockMin: 60 })).toEqual(["08:00", "09:00", "10:00"]);
  });

  it("never emits a slot that would run past the closing hour", () => {
    expect(slots({ startHour: 8, endHour: 9, blockMin: 90 })).toEqual([]);
  });

  it("returns nothing for invalid settings", () => {
    expect(slots({ startHour: 20, endHour: 10, blockMin: 60 })).toEqual([]);
    expect(slots({ startHour: 8, endHour: 22, blockMin: 10 })).toEqual([]);
  });
});

describe("validSettings", () => {
  it("accepts a sane configuration", () => {
    expect(validSettings({ startHour: 8, endHour: 22, blockMin: 60 })).toBe(true);
  });

  it("rejects a block longer than the window", () => {
    expect(validSettings({ startHour: 22, endHour: 23, blockMin: 120 })).toBe(false);
  });

  it("rejects non integer values", () => {
    expect(validSettings({ startHour: 8.5, endHour: 22, blockMin: 60 })).toBe(false);
  });

  it("accepts a break inside the window, aligned to the grid", () => {
    expect(validSettings({ startHour: 8, endHour: 17, blockMin: 60, breakStart: 12, breakEnd: 14 })).toBe(true);
  });

  it("rejects a half-configured break", () => {
    expect(validSettings({ startHour: 8, endHour: 17, blockMin: 60, breakStart: 12, breakEnd: null })).toBe(false);
    expect(validSettings({ startHour: 8, endHour: 17, blockMin: 60, breakStart: null, breakEnd: 14 })).toBe(false);
  });

  it("rejects a break that leaves the window or is empty", () => {
    expect(validSettings({ startHour: 8, endHour: 17, blockMin: 60, breakStart: 8, breakEnd: 14 })).toBe(false);
    expect(validSettings({ startHour: 8, endHour: 17, blockMin: 60, breakStart: 12, breakEnd: 17 })).toBe(false);
    expect(validSettings({ startHour: 8, endHour: 17, blockMin: 60, breakStart: 14, breakEnd: 14 })).toBe(false);
    expect(validSettings({ startHour: 8, endHour: 17, blockMin: 60, breakStart: 13, breakEnd: 12 })).toBe(false);
  });

  it("rejects a break that does not fall on a block boundary", () => {
    // With 90 minute blocks from 08:00 the boundaries are 08:00, 09:30, 11:00...
    expect(validSettings({ startHour: 8, endHour: 14, blockMin: 90, breakStart: 11, breakEnd: 12 })).toBe(false);
  });
});

describe("slots with a break", () => {
  it("skips the blocks that fall inside the break", () => {
    expect(slots({ startHour: 8, endHour: 17, blockMin: 60, breakStart: 12, breakEnd: 14 })).toEqual([
      "08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00",
    ]);
  });

  it("keeps the grid intact when there is no break", () => {
    expect(slots({ startHour: 8, endHour: 12, blockMin: 60, breakStart: null, breakEnd: null })).toEqual([
      "08:00", "09:00", "10:00", "11:00",
    ]);
  });

  it("splits a half hour grid around an aligned break", () => {
    expect(slots({ startHour: 8, endHour: 14, blockMin: 30, breakStart: 12, breakEnd: 13 })).toEqual([
      "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30",
    ]);
  });
});
