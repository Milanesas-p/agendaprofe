import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { profileLabel, type Category, type CourtSide } from "@/lib/player";

/**
 * The interactive preview on the login card: a simulated week with the same shape
 * as the real agenda (hour blocks holding students with their category). It never
 * reads the database, so nothing of the teacher's roster is exposed before signing in.
 */
type DemoStudent = { name: string; category: Category; courtSide: CourtSide };
type DemoLesson = { start: string; students: DemoStudent[] };

const student = (name: string, category: Category, courtSide: CourtSide): DemoStudent => ({
  name,
  category,
  courtSide,
});

const DEMO: Record<number, DemoLesson[]> = {
  // 0 = Sunday, matching `Date.getDay()`.
  0: [],
  1: [
    {
      start: "09:00",
      students: [student("Sofi", "7ma", "reves"), student("Nico", "8va", "drive")],
    },
    {
      start: "17:00",
      students: [
        student("Mati", "6ta firme", "drive"),
        student("Cami", "7ma firme", "reves"),
        student("Joaco", "8va", "reves"),
        student("Vale", "6ta", "drive"),
      ],
    },
  ],
  2: [
    { start: "10:00", students: [student("Tomi", "8va firme", "drive")] },
    {
      start: "16:00",
      students: [student("Lu", "7ma", "indistinto"), student("Sofi", "7ma", "reves")],
    },
  ],
  3: [
    {
      start: "09:00",
      students: [student("Nico", "8va", "drive"), student("Mati", "6ta firme", "drive")],
    },
    { start: "17:00", students: [student("Cami", "7ma firme", "reves")] },
  ],
  4: [
    {
      start: "10:00",
      students: [
        student("Vale", "6ta", "drive"),
        student("Joaco", "8va", "reves"),
        student("Lu", "7ma", "indistinto"),
      ],
    },
  ],
  5: [
    {
      start: "09:00",
      students: [student("Sofi", "7ma", "reves"), student("Tomi", "8va firme", "drive")],
    },
    {
      start: "17:00",
      students: [student("Nico", "8va", "drive"), student("Cami", "7ma firme", "reves")],
    },
  ],
  6: [
    {
      start: "10:00",
      students: [
        student("Mati", "6ta firme", "drive"),
        student("Vale", "6ta", "drive"),
        student("Joaco", "8va", "reves"),
      ],
    },
  ],
};

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DOW_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const iso = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export function AgendaPreview() {
  const [week, setWeek] = useState<Date[]>([]);
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  // Computed after hydration so the server and the first client render agree.
  useEffect(() => {
    const today = new Date();
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    setWeek(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
    setSelected(iso(today));
  }, []);

  const lessons = selected ? (DEMO[new Date(`${selected}T12:00:00`).getDay()] ?? []) : [];
  const month = week[0]?.toLocaleDateString("es-AR", { month: "short" }) ?? "";
  const range = week.length === 7 ? `${week[0]!.getDate()} – ${week[6]!.getDate()} ${month}` : "";

  return (
    <section
      aria-label="Vista previa de la agenda"
      className="rounded-2xl border border-border bg-card p-4 shadow-[0_18px_40px_-32px_oklch(0.3_0.05_150/0.6)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-base font-bold tracking-tight">Tu semana</p>
        <span className="rounded-full bg-ball/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">
          Vista previa
        </span>
      </div>
      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{range || " "}</p>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {week.map((date, index) => {
          const key = iso(date);
          const isSelected = key === selected;
          const count = DEMO[date.getDay()]?.length ?? 0;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${DOW_LONG[index]} ${date.getDate()}`}
              onClick={() => {
                setSelected(key);
                setOpen(null);
              }}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide">
                {DOW[index]}
              </span>
              <span className="text-lg font-bold leading-none tabular-nums">{date.getDate()}</span>
              <i
                aria-hidden
                className={`h-1 w-1 rounded-full ${count > 0 ? "bg-ball" : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-3 min-h-[150px] space-y-2">
        {lessons.length === 0 ? (
          <div className="flex min-h-[132px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center text-xs font-semibold text-muted-foreground">
            No hay clases programadas.
          </div>
        ) : (
          lessons.map((lesson) => {
            const isOpen = open === lesson.start;
            const count =
              lesson.students.length === 1 ? "1 alumno" : `${lesson.students.length} alumnos`;
            return (
              <div key={lesson.start} className="flex gap-2">
                <span className="w-11 shrink-0 pt-2 text-sm font-semibold tabular-nums text-foreground">
                  {lesson.start}
                </span>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`${lesson.start}, ${count}`}
                  onClick={() => setOpen(isOpen ? null : lesson.start)}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">{count}</span>
                    <span aria-hidden className="flex items-center gap-1">
                      {lesson.students.map((s) => (
                        <i key={s.name} className="h-1.5 w-1.5 rounded-full bg-court" />
                      ))}
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </span>
                  </span>
                  {isOpen && (
                    <span className="mt-2 block space-y-1">
                      {lesson.students.map((s) => (
                        <span
                          key={s.name}
                          className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2 py-1"
                        >
                          <span className="min-w-0 truncate text-[11px] font-semibold text-foreground">
                            {s.name}
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
                            {profileLabel(s)} · {lesson.start}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Tocá un día y un horario
      </p>
    </section>
  );
}
