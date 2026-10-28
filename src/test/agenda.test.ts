import { describe, expect, it } from "vitest";
import { matchesStudent, weekStartFor } from "@/lib/agenda";

describe("agenda navigation", () => {
  it("starts the week on Monday for a Wednesday", () => expect(weekStartFor("2026-10-28")).toBe("2026-10-26"));
  it("keeps Sunday in its preceding week across months", () => expect(weekStartFor("2026-11-01")).toBe("2026-10-26"));
});
describe("student search", () => {
  it("matches accented names without requiring accents or case", () => expect(matchesStudent("María Pérez", " maria ")).toBe(true));
  it("excludes a different student", () => expect(matchesStudent("María Pérez", "Juan")).toBe(false));
});