/**
 * A student's mini history, for the profile sheet.
 *
 * The snapshot already carries half a year of lessons, so this is a pure
 * projection over what the agenda holds: no request, no extra query. It answers
 * the question the teacher asks when something looks off — did this student come,
 * miss, or cancel — and it never hides a class by guessing.
 */
import type { ClassStatus } from "./rules";

/** Enough to spot a pattern without turning the sheet into a report. */
export const HISTORY_LIMIT = 8;

export type HistoryLesson = {
  id: string;
  date: string;
  start: string;
  studentId: string;
  status: ClassStatus;
};

export type HistoryEntry = { id: string; date: string; start: string; status: ClassStatus };

export type StudentHistory = {
  /** Classes already played or already due today, by outcome. */
  counts: { present: number; absent: number; cancelled: number };
  /** Newest first, today included. */
  entries: HistoryEntry[];
  /** Older classes that exist but do not fit in the list. */
  hidden: number;
};

/**
 * The classes of one student up to `todayISO`, newest first.
 *
 * A future class is not history: it belongs to the agenda. A class still marked
 * `programada` in the past is listed as it stands, because that is the truth the
 * teacher needs when checking old records.
 */
export function studentHistory(input: {
  lessons: readonly HistoryLesson[];
  studentId: string;
  todayISO: string;
  limit?: number;
}): StudentHistory {
  const { lessons, studentId, todayISO, limit = HISTORY_LIMIT } = input;

  const counts = { present: 0, absent: 0, cancelled: 0 };
  const past: HistoryEntry[] = [];

  for (const lesson of lessons) {
    if (lesson.studentId !== studentId) continue;
    if (lesson.date > todayISO) continue;

    past.push({ id: lesson.id, date: lesson.date, start: lesson.start, status: lesson.status });
    if (lesson.status === "presente") counts.present += 1;
    else if (lesson.status === "ausente") counts.absent += 1;
    else if (lesson.status === "cancelada") counts.cancelled += 1;
  }

  past.sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
  const entries = past.slice(0, Math.max(0, limit));

  return { counts, entries, hidden: past.length - entries.length };
}

const SHORT_DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

/** One history row as the teacher reads it: "Lun 10/11". */
export function historyDayLabel(date: string): string {
  const day = SHORT_DAYS[new Date(`${date}T12:00:00`).getDay()];
  return `${day ?? ""} ${date.slice(8, 10)}/${date.slice(5, 7)}`.trim();
}
