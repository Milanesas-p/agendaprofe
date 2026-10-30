/**
 * Bulk WhatsApp notices.
 *
 * Pure functions only, shared by the browser and the tests: which classes fall in
 * the window, how a day reads, and how the teacher's template turns into the text
 * of one message. The link itself comes from `whatsappLink`.
 */

import { WEEKDAYS } from "@/lib/agenda";

/** How many days ahead the notices screen looks, starting tomorrow. */
export const NOTICE_DAYS = 3;

export const DEFAULT_NOTICE_TEMPLATE =
  "Buenas [nombre]! Te recuerdo tu clase del [dia] a las [hora]. Confirmame por favor.";

export type NoticeStudent = { id: string; name: string; phone: string | null };
export type NoticeLesson = { date: string; start: string; studentId: string; status: string };
export type NoticeEntry<S extends NoticeStudent> = { date: string; start: string; student: S };

/** Shifts a "YYYY-MM-DD" date without letting a timezone change the day. */
function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The days the screen looks at: tomorrow first, never today. */
export function nextDays(from: string, count: number = NOTICE_DAYS): string[] {
  return Array.from({ length: count }, (_, i) => shiftDay(from, i + 1));
}

/** A day the way the teacher says it: "viernes 30/10". */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const weekday = WEEKDAYS[d.getDay()]?.toLowerCase() ?? "";
  return `${weekday} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Fills `[nombre] [dia] [hora]`. Anything else stays exactly as it was written. */
export function fillTemplate(template: string, values: { nombre: string; dia: string; hora: string }): string {
  return template
    .replace(/\[nombre\]/g, values.nombre)
    .replace(/\[dia\]/g, values.dia)
    .replace(/\[día\]/g, values.dia)
    .replace(/\[hora\]/g, values.hora);
}

/** The message for one student, falling back to the factory template. */
export function noticeText(
  template: string | null | undefined,
  student: { name: string },
  date: string,
  start: string,
): string {
  return fillTemplate(template || DEFAULT_NOTICE_TEMPLATE, {
    nombre: student.name,
    dia: dayLabel(date),
    hora: start,
  });
}

/**
 * Every non-cancelled class in the window, sorted by day, then time, then name.
 *
 * A student without a phone is still listed: the teacher needs to see the gap.
 */
export function upcomingNotices<S extends NoticeStudent>(
  lessons: readonly NoticeLesson[],
  students: readonly S[],
  today: string,
  days: number = NOTICE_DAYS,
): Array<NoticeEntry<S>> {
  const window = new Set(nextDays(today, days));
  const byId = new Map(students.map((s) => [s.id, s]));
  return lessons
    .filter((l) => window.has(l.date) && l.status !== "cancelada")
    .flatMap((l) => {
      const student = byId.get(l.studentId);
      return student ? [{ date: l.date, start: l.start, student }] : [];
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        a.student.name.localeCompare(b.student.name, "es"),
    );
}
