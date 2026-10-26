import { describe, it, expect } from "vitest";
import { slots, validSettings } from "@/lib/store";
describe("court block validation", () => {
  it("rejects an end before opening", () => expect(validSettings({startHour:22,endHour:8,blockMin:60})).toBe(false));
  it("rejects zero duration rather than looping", () => expect(slots({startHour:8,endHour:22,blockMin:0})).toEqual([]));
  it("includes only complete 60 minute blocks from 8 to 22", () => { const result=slots({startHour:8,endHour:22,blockMin:60}); expect(result).toHaveLength(14); expect(result[0]).toBe("08:00"); expect(result.at(-1)).toBe("21:00"); });
});