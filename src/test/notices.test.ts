import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTICE_TEMPLATE,
  dayLabel,
  fillTemplate,
  nextDays,
  upcomingNotices,
} from "@/lib/notices";

describe("nextDays", () => {
  it("returns tomorrow and the two days after it", () => {
    expect(nextDays("2026-10-30", 3)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("rolls over the end of the year", () => {
    expect(nextDays("2026-12-30", 3)).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("dayLabel", () => {
  it("reads as the teacher says it", () => {
    expect(dayLabel("2026-10-30")).toBe("viernes 30/10");
    expect(dayLabel("2026-11-02")).toBe("lunes 02/11");
  });
});

describe("fillTemplate", () => {
  const values = { nombre: "Maxi Salas", dia: "viernes 30/10", hora: "13:00" };

  it("replaces the three variables", () => {
    expect(fillTemplate(DEFAULT_NOTICE_TEMPLATE, values)).toBe(
      "Buenas Maxi Salas! Te recuerdo tu clase del viernes 30/10 a las 13:00. Confirmame por favor.",
    );
  });

  it("accepts the accented [día] too", () => {
    expect(fillTemplate("Hola [nombre], nos vemos el [día].", values)).toBe("Hola Maxi Salas, nos vemos el viernes 30/10.");
  });

  it("repeats a variable that appears more than once", () => {
    expect(fillTemplate("[hora] y solo [hora]", values)).toBe("13:00 y solo 13:00");
  });

  it("leaves unknown brackets and plain text alone", () => {
    expect(fillTemplate("Hola [nombre], traé [paleta].", values)).toBe("Hola Maxi Salas, traé [paleta].");
  });
});

describe("upcomingNotices", () => {
  const students = [
    { id: "s1", name: "Maxi Salas", phone: "5492302666351", balance: 0 },
    { id: "s2", name: "Pepe Mujica", phone: null, balance: 3 },
  ];
  const lesson = (id: string, date: string, start: string, studentId: string, status = "programada") => ({
    id,
    date,
    start,
    studentId,
    status,
  });

  it("keeps only the next three days, sorted by day and time", () => {
    const notices = upcomingNotices(
      [
        lesson("a", "2026-10-30", "09:00", "s1"),
        lesson("b", "2026-11-03", "09:00", "s1"),
        lesson("c", "2026-11-01", "08:00", "s2"),
        lesson("d", "2026-10-31", "15:00", "s2"),
        lesson("e", "2026-10-31", "13:00", "s1"),
      ],
      students,
      "2026-10-30",
    );

    expect(notices.map((n) => `${n.date} ${n.start} ${n.student.name}`)).toEqual([
      "2026-10-31 13:00 Maxi Salas",
      "2026-10-31 15:00 Pepe Mujica",
      "2026-11-01 08:00 Pepe Mujica",
    ]);
  });

  it("skips a cancelled class", () => {
    const notices = upcomingNotices([lesson("a", "2026-10-31", "09:00", "s1", "cancelada")], students, "2026-10-30");
    expect(notices).toEqual([]);
  });

  it("keeps a student without a phone so the teacher sees the gap", () => {
    const notices = upcomingNotices([lesson("a", "2026-10-31", "09:00", "s2")], students, "2026-10-30");
    expect(notices).toHaveLength(1);
    expect(notices[0]?.student.phone).toBeNull();
  });
});
