import { describe, expect, it } from "vitest";

import type { ClassStatus } from "@/lib/rules";
import { studentHistory } from "@/lib/history";

const TODAY = "2026-11-17";

const lesson = (
  id: string,
  date: string,
  status: ClassStatus,
  studentId = "s1",
  start = "09:00",
) => ({
  id,
  date,
  start,
  studentId,
  status,
});

const history = (lessons: ReturnType<typeof lesson>[], studentId = "s1", limit?: number) =>
  studentHistory({
    lessons,
    studentId,
    todayISO: TODAY,
    ...(limit === undefined ? {} : { limit }),
  });

describe("student history", () => {
  it("counts what the student attended, missed and cancelled", () => {
    const out = history([
      lesson("l1", "2026-11-10", "presente"),
      lesson("l2", "2026-11-03", "presente"),
      lesson("l3", "2026-10-27", "ausente"),
      lesson("l4", "2026-10-20", "cancelada"),
    ]);

    expect(out.counts).toEqual({ present: 2, absent: 1, cancelled: 1 });
    expect(out.entries).toHaveLength(4);
  });

  it("lists the most recent class first", () => {
    const out = history([
      lesson("l1", "2026-10-20", "ausente"),
      lesson("l2", "2026-11-10", "presente"),
      lesson("l3", "2026-11-03", "presente"),
    ]);

    expect(out.entries.map((e) => e.date)).toEqual(["2026-11-10", "2026-11-03", "2026-10-20"]);
    expect(out.entries[0]?.status).toBe("presente");
  });

  it("breaks a same-day tie by the later hour first", () => {
    const out = history([
      lesson("l1", "2026-11-10", "presente", "s1", "09:00"),
      lesson("l2", "2026-11-10", "ausente", "s1", "16:00"),
    ]);

    expect(out.entries.map((e) => e.start)).toEqual(["16:00", "09:00"]);
  });

  it("keeps the list short and says how many older classes are left out", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      lesson(`l${i}`, `2026-10-${String(i + 1).padStart(2, "0")}`, "presente"),
    );

    const out = history(many, "s1", 5);

    expect(out.entries).toHaveLength(5);
    expect(out.hidden).toBe(6);
    expect(out.counts.present).toBe(11);
  });

  it("leaves out classes that have not happened yet", () => {
    const out = history([
      lesson("l1", "2026-11-10", "presente"),
      lesson("l2", TODAY, "programada"),
      lesson("l3", "2026-11-20", "programada"),
    ]);

    expect(out.entries.map((e) => e.id)).toEqual(["l2", "l1"]);
    expect(out.counts.present).toBe(1);
  });

  it("ignores every other student", () => {
    const out = history([
      lesson("l1", "2026-11-10", "presente"),
      lesson("l2", "2026-11-10", "ausente", "s2"),
      lesson("l3", "2026-11-10", "presente", "s3"),
    ]);

    expect(out.entries).toHaveLength(1);
    expect(out.counts).toEqual({ present: 1, absent: 0, cancelled: 0 });
  });

  it("returns an empty history for a student without classes", () => {
    const out = history([lesson("l1", "2026-11-10", "presente", "s9")]);

    expect(out).toEqual({
      counts: { present: 0, absent: 0, cancelled: 0 },
      entries: [],
      hidden: 0,
    });
  });
});
