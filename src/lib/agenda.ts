/** Full weekday names, 0 = Sunday, matching the stored `recurring_weekday`. */
export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

/** A student's weekly slot as the teacher reads it: "Viernes 14:00", or "". */
export function weeklySlotLabel(s: { recurringWeekday: number | null; recurringTime: string | null }): string {
  if (s.recurringWeekday === null || s.recurringTime === null) return "";
  const day = WEEKDAYS[s.recurringWeekday];
  return day ? `${day} ${s.recurringTime}` : "";
}

export function weekStartFor(date: string) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function matchesStudent(name: string, search: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  return normalize(name).includes(normalize(search.trim()));
}