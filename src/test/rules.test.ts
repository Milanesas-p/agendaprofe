import { describe, expect, it } from "vitest";
import { balanceDelta, slots, validSettings } from "@/lib/rules";

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
});
