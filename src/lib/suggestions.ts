/**
 * Booking suggestions for an empty seat.
 *
 * A `rotativo` has no weekly slot, so nothing brings them back automatically.
 * A `fijo` does have one, but the teacher rotates students between classes all
 * the time: someone who already played this exact weekday and time is a strong
 * candidate whatever their current type. The agenda runs these pure helpers over
 * the lessons snapshot it already holds, so a suggestion never costs a request.
 *
 * Adding one of them only inserts a lesson for that date; the student's weekly
 * slots are never touched, so a `fijo` keeps the schedule they already had.
 */
import type { ClassStatus } from "./rules";

/** The last four occurrences of one weekday fit in a month; the reason says "de 4". */
const ATTENDANCE_SLOTS = 4;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type SuggestableStudent = {
  id: string;
  name: string;
  type: "fijo" | "rotativo";
  /** Habitual weekly slots; a rotativo's are never booked automatically. */
  slots?: readonly { weekday: number; time: string }[];
};
export type SuggestableLesson = {
  date: string;
  start: string;
  studentId: string;
  status: ClassStatus;
};

export type Suggestion = {
  studentId: string;
  name: string;
  /** True when the student has this weekday and time as a habitual slot. */
  habitual: boolean;
  /** Last time they attended this slot, or null when only the habitual slot qualifies them. */
  lastAttended: string | null;
  /** How many times they attended that slot inside the lookback window. */
  attended: number;
  /** Start time of another class this student already has that same day, or null. */
  sameDayStart: string | null;
};

/** 0 = Sunday … 6 = Saturday, read in UTC so the weekday never shifts. */
const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** `2026-11-10` → `10/11`, readable and locale-proof. */
const dayMonth = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Students worth offering for one slot `(date, start)`.
 *
 * Anyone not already in that slot qualifies through history: they attended that
 * exact weekday and time at least once and their most recent visit was a
 * `presente`. A `rotativo` can also qualify through a declared habitual slot,
 * even without history. Rotation is the normal case here, so a `fijo` who played
 * this class before is offered too; their own weekly slot is never changed.
 * Past days get nothing: suggestions are for planning ahead.
 */
export function suggestionsFor(input: {
  date: string;
  start: string;
  students: readonly SuggestableStudent[];
  lessons: readonly SuggestableLesson[];
  todayISO: string;
}): Suggestion[] {
  const { date, start, students, lessons, todayISO } = input;
  if (!DATE.test(date) || !DATE.test(todayISO) || date < todayISO) return [];

  const weekday = weekdayOf(date);
  // Anyone with a row in that slot — even a cancelled one — is not offered again.
  const inSlot = new Set(
    lessons.filter((l) => l.date === date && l.start === start).map((l) => l.studentId),
  );

  // Only attendance tells the truth; a booked or cancelled row says nothing.
  const history = new Map<
    string,
    { lastAttended: string; attended: number; lastStatus: ClassStatus }
  >();
  for (const lesson of lessons) {
    if (lesson.start !== start) continue;
    if (lesson.date >= todayISO) continue;
    if (weekdayOf(lesson.date) !== weekday) continue;
    if (lesson.status !== "presente" && lesson.status !== "ausente") continue;

    const previous = history.get(lesson.studentId);
    const attended = (previous?.attended ?? 0) + (lesson.status === "presente" ? 1 : 0);
    history.set(
      lesson.studentId,
      previous && previous.lastAttended > lesson.date
        ? { ...previous, attended }
        : { lastAttended: lesson.date, attended, lastStatus: lesson.status },
    );
  }

  // A student the teacher already booked elsewhere that same day is still a
  // candidate, but the row says so instead of hiding them.
  const sameDay = new Map<string, string[]>();
  for (const lesson of lessons) {
    if (lesson.date !== date || lesson.start === start || lesson.status === "cancelada") continue;
    const starts = sameDay.get(lesson.studentId) ?? [];
    if (!starts.includes(lesson.start)) starts.push(lesson.start);
    sameDay.set(lesson.studentId, starts);
  }

  const out: Suggestion[] = [];
  for (const student of students) {
    if (inSlot.has(student.id)) continue;
    const stat = history.get(student.id);
    const fromHistory = stat !== undefined && stat.lastStatus === "presente" && stat.attended > 0;
    // A `fijo` already owns their weekly slots, so only history qualifies them.
    const habitual =
      student.type === "rotativo" &&
      (student.slots?.some((slot) => slot.weekday === weekday && slot.time === start) ?? false);
    if (!habitual && !fromHistory) continue;
    out.push({
      studentId: student.id,
      name: student.name,
      habitual,
      lastAttended: stat?.lastAttended ?? null,
      attended: stat ? Math.min(stat.attended, ATTENDANCE_SLOTS) : 0,
      sameDayStart: (sameDay.get(student.id) ?? []).sort()[0] ?? null,
    });
  }

  return out.sort(
    (a, b) =>
      Number(b.habitual) - Number(a.habitual) ||
      b.attended - a.attended ||
      (b.lastAttended ?? "").localeCompare(a.lastAttended ?? "") ||
      a.name.localeCompare(b.name, "es"),
  );
}

/** The line under the name: a declared usual slot, or when they last came. */
export function suggestionReason(
  s: Pick<Suggestion, "habitual" | "lastAttended" | "attended">,
): string {
  if (s.habitual || s.lastAttended === null) return "Viene este horario";
  const base = `Vino el ${dayMonth(s.lastAttended)}`;
  return s.attended > 1 ? `${base} · ${s.attended} de ${ATTENDANCE_SLOTS}` : base;
}

/** The extra hint for a student who already has another class that same day. */
export function sameDayHint(s: Pick<Suggestion, "sameDayStart">): string | null {
  return s.sameDayStart === null ? null : `Ya tiene clase hoy ${s.sameDayStart}`;
}
