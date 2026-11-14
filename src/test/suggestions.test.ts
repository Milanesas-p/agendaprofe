import { describe, expect, it } from "vitest";

import type { ClassStatus } from "@/lib/rules";
import { suggestionReason, suggestionsFor } from "@/lib/suggestions";

// 2026-11-14 is a Saturday. The target slot is the following Tuesday at 09:00,
// so the relevant history is the previous Tuesdays at the same hour.
const TODAY = "2026-11-14";
const TARGET = "2026-11-17";

const student = (id: string, name: string, type: "fijo" | "rotativo" = "rotativo") => ({ id, name, type });
const lesson = (date: string, studentId: string, start = "09:00", status: ClassStatus = "presente") => ({
  date,
  start,
  studentId,
  status,
});

const suggest = (
  students: { id: string; name: string; type: "fijo" | "rotativo" }[],
  lessons: { date: string; start: string; studentId: string; status: ClassStatus }[],
  target = TARGET,
) => suggestionsFor({ date: target, start: "09:00", students, lessons, todayISO: TODAY });

describe("suggestions for a slot", () => {
  it("suggests a rotativo who attended that weekday and time last week", () => {
    const out = suggest([student("s1", "Juan Gómez")], [lesson("2026-11-10", "s1")]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ studentId: "s1", name: "Juan Gómez", lastAttended: "2026-11-10", attended: 1 });
  });

  it("never suggests a fixed student, because recurrence already books them", () => {
    const out = suggest([student("s1", "Juan Gómez", "fijo")], [lesson("2026-11-10", "s1")]);

    expect(out).toEqual([]);
  });

  it("skips a student already booked in that slot", () => {
    const out = suggest(
      [student("s1", "Juan Gómez")],
      [lesson("2026-11-10", "s1"), lesson(TARGET, "s1", "09:00", "programada")],
    );

    expect(out).toEqual([]);
  });

  it("skips a student whose cancelled row already sits in that slot", () => {
    const out = suggest(
      [student("s1", "Juan Gómez")],
      [lesson("2026-11-10", "s1"), lesson(TARGET, "s1", "09:00", "cancelada")],
    );

    expect(out).toEqual([]);
  });

  it("skips a student who was absent the last time they had that slot", () => {
    const out = suggest(
      [student("s1", "Juan Gómez")],
      [lesson("2026-11-03", "s1"), lesson("2026-11-10", "s1", "09:00", "ausente")],
    );

    expect(out).toEqual([]);
  });

  it("only reads history from that same weekday and time", () => {
    const out = suggest(
      [student("s1", "Juan Gómez"), student("s2", "Ana Díaz")],
      [
        lesson("2026-11-10", "s1", "10:00"),
        lesson("2026-11-11", "s2", "09:00"),
      ],
    );

    expect(out).toEqual([]);
  });

  it("still suggests for today, but never for a past day", () => {
    const today = suggest([student("s1", "Juan Gómez")], [lesson("2026-11-07", "s1")], TODAY);
    const past = suggest([student("s1", "Juan Gómez")], [lesson("2026-11-06", "s1")], "2026-11-13");

    expect(today).toHaveLength(1);
    expect(past).toEqual([]);
  });

  it("ignores attendance older than four weeks", () => {
    const out = suggest([student("s1", "Juan Gómez")], [lesson("2026-10-13", "s1")]);

    expect(out).toEqual([]);
  });

  it("ranks by how often the student came, newest first, then by name", () => {
    const out = suggest(
      [student("s1", "Beto Ruiz"), student("s2", "Ana Díaz"), student("s3", "Carla Paz"), student("s4", "Dario Gil")],
      [
        lesson("2026-11-10", "s1"),
        lesson("2026-11-10", "s2"),
        lesson("2026-11-03", "s2"),
        lesson("2026-11-03", "s3"),
        lesson("2026-10-27", "s3"),
        lesson("2026-10-27", "s4"),
        lesson("2026-10-20", "s4"),
      ],
    );

    // Ana came twice and most recently, then Carla, then Dario, then Beto.
    expect(out.map((s) => s.name)).toEqual(["Ana Díaz", "Carla Paz", "Dario Gil", "Beto Ruiz"]);
  });

  it("returns nothing for a day without a valid date", () => {
    expect(suggest([student("s1", "Juan Gómez")], [lesson("2026-11-10", "s1")], "")).toEqual([]);
  });
});

describe("suggestion reason", () => {
  it("says when the student last came", () => {
    expect(suggestionReason({ habitual: false, lastAttended: "2026-11-10", attended: 1 })).toBe("Vino el 10/11");
  });

  it("adds how many of the last four they came to", () => {
    expect(suggestionReason({ habitual: false, lastAttended: "2026-11-10", attended: 2 })).toBe("Vino el 10/11 · 2 de 4");
  });

  it("says the student comes at this time when the slot is habitual", () => {
    expect(suggestionReason({ habitual: true, lastAttended: null, attended: 0 })).toBe("Viene este horario");
  });
});

describe("habitual slots", () => {
  const withSlots = (id: string, name: string, slots: { weekday: number; time: string }[]) => ({
    id,
    name,
    type: "rotativo" as const,
    slots,
  });

  it("suggests a rotativo whose habitual slot matches, even without history", () => {
    const out = suggest([withSlots("s1", "Juan Gómez", [{ weekday: 2, time: "09:00" }])], []);

    expect(out).toEqual([
      { studentId: "s1", name: "Juan Gómez", habitual: true, lastAttended: null, attended: 0 },
    ]);
  });

  it("ignores a habitual slot on another day or time", () => {
    expect(suggest([withSlots("s1", "Juan", [{ weekday: 3, time: "09:00" }])], [])).toEqual([]);
    expect(suggest([withSlots("s1", "Juan", [{ weekday: 2, time: "10:00" }])], [])).toEqual([]);
  });

  it("ranks a declared slot above one inferred from history", () => {
    const out = suggest(
      [withSlots("s1", "Historial", []), withSlots("s2", "Habitual", [{ weekday: 2, time: "09:00" }])],
      [lesson("2026-11-10", "s1")],
    );

    expect(out.map((s) => s.name)).toEqual(["Habitual", "Historial"]);
  });

  it("still never suggests a fixed student, even with a matching slot", () => {
    const fixed = { id: "s1", name: "Juan", type: "fijo" as const, slots: [{ weekday: 2, time: "09:00" }] };

    expect(suggest([fixed], [])).toEqual([]);
  });
});
