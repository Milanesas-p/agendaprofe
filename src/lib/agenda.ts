/** Full weekday names, 0 = Sunday, matching the stored `recurring_weekday`. */
export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

/** A student's weekly slots as the teacher reads them: "Viernes 14:00 · Sábado 10:00". */
export function slotsLabel(slots: readonly { weekday: number; time: string }[]): string {
  return slots
    .map((slot) => {
      const day = WEEKDAYS[slot.weekday];
      return day ? `${day} ${slot.time}` : "";
    })
    .filter(Boolean)
    .join(" · ");
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