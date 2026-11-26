import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReactivateStudent } from "@/components/ReactivateStudent";
import { activePayload } from "@/lib/students";
import { toast } from "sonner";
import { canAddToLesson } from "@/lib/rules";
import { useStore, slots, iso, addDays, type Student } from "@/lib/store";
import { matchesStudent } from "@/lib/agenda";

export const Route = createFileRoute("/nueva-clase")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Nueva clase — Pádel Pro" },
      { name: "description", content: "Reservar un alumno en un bloque libre de la agenda." },
      { property: "og:title", content: "Nueva clase — Pádel Pro" },
      { property: "og:description", content: "Elegí alumno, día y horario libre en tres pasos." },
    ],
  }),
  component: NuevaClase,
});

/** Numbered section of the flow: same shape the design uses for every step. */
function Step({ number, title, hint, children }: { number: number; title: string; hint?: string | undefined; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{number}</span>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
        </div>
        {hint && <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function NuevaClase() {
  const { students, lessons, settings, addLesson, updateStudent, busy } = useStore();
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  // Paused student the teacher tried to pick: ask to reactivate right here.
  const [paused, setPaused] = useState<Student | null>(null);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");

  // The local date only exists after hydration: computing it during render would
  // make the server and the client disagree around midnight.
  useEffect(() => { setDate(iso(new Date())); }, []);

  const days = date
    ? [
        { label: "Hoy", date: iso(new Date()) },
        { label: "Mañana", date: iso(addDays(new Date(), 1)) },
        { label: "Pasado", date: iso(addDays(new Date(), 2)) },
      ]
    : [];

  // A block is offered when it still has room and this student is not already in it.
  const free = date
    ? slots(settings).filter((t) => {
        const taken = lessons.filter((l) => l.date === date && l.start === t && l.status !== "cancelada");
        return canAddToLesson(taken.length) && !taken.some((l) => l.studentId === studentId);
      })
    : [];

  // A paused student stays selectable: picking them asks to reactivate instead
  // of hiding them, so the teacher does not have to hunt them in the directory.
  const candidates = students.filter((s) => matchesStudent(s.name, search));
  const chosen = students.find((s) => s.id === studentId);
  const ready = Boolean(studentId) && Boolean(start);

  function pick(s: Student) {
    if (s.active === false) {
      setPaused(s);
      return;
    }
    setStudentId(s.id);
    setStart("");
  }

  async function submit() {
    if (!ready) return;
    if (await addLesson({ date, start, studentId })) navigate({ to: "/" });
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-xl lg:px-6">
        <Button variant="ghost" aria-label="Volver a la agenda" onClick={() => navigate({ to: "/" })} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">Nueva clase</h1>
      </header>

      <div className="space-y-3 p-4 lg:mx-auto lg:w-full lg:max-w-3xl lg:p-6">
        <Step number={1} title="¿Quién entrena?" hint={`${candidates.length} ${candidates.length === 1 ? "alumno" : "alumnos"}`}>
          <label className="flex items-center gap-2 rounded-lg bg-muted px-3">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input type="search" aria-label="Buscar alumno para la clase" placeholder="Buscar alumno" value={search} onChange={(e) => setSearch(e.target.value)} className="h-12 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
          </label>
          {candidates.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{students.length === 0 ? "Todavía no hay alumnos." : "No hay coincidencias."}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {candidates.map((s) => (
                <Button variant="ghost" key={s.id} aria-pressed={studentId === s.id} onClick={() => pick(s)} className={`h-10 rounded-lg px-3 text-sm font-semibold ${studentId === s.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                  {s.name}
                  {s.active === false && <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-70">inactivo</span>}
                </Button>
              ))}
            </div>
          )}
        </Step>

        <Step number={2} title="¿Cuándo juegan?" hint={date ? new Date(`${date}T12:00:00`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }) : undefined}>
          <div className="grid grid-cols-3 gap-2">
            {days.map((d) => (
              <Button variant="ghost" key={d.label} onClick={() => { setDate(d.date); setStart(""); }} className={`h-11 rounded-lg text-sm font-semibold ${date === d.date ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                {d.label}
              </Button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3">
            <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input type="date" aria-label="Otro día para la clase" value={date} onChange={(e) => { setDate(e.target.value); setStart(""); }} className="h-12 w-full min-w-0 bg-transparent text-[15px] font-semibold outline-none" />
          </label>
          {free.length === 0 ? (
            <p role="status" className="mt-3 text-sm text-destructive">No hay horarios libres para este día{chosen ? " para este alumno" : ""}.</p>
          ) : (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {free.map((t) => (
                <Button variant="ghost" key={t} aria-pressed={start === t} onClick={() => setStart(t)} className={`h-11 rounded-lg text-sm font-semibold tabular-nums ${start === t ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                  {t}
                </Button>
              ))}
            </div>
          )}
        </Step>

        <div className="pt-1">
          {chosen && (
            <p className="mb-2 text-center text-sm text-muted-foreground">
              {chosen.name}{start ? ` · ${start}` : ""}
            </p>
          )}
          <Button disabled={busy || !ready} onClick={submit} className="h-14 w-full text-[15px] disabled:opacity-40">
            Reservar clase
          </Button>
        </div>
      </div>

      <ReactivateStudent
        student={paused}
        busy={busy}
        onCancel={() => setPaused(null)}
        onConfirm={async (s) => {
          // A returning student starts with a clean schedule: clear the old slots
          // so the previous days are not booked again behind the teacher's back.
          if (!(await updateStudent(s.id, { ...activePayload(s, true), slots: [] }))) return;
          setPaused(null);
          toast.success(`${s.name} reactivado. Configurá sus horarios en Alumnos.`);
          setStudentId(s.id);
          setStart("");
        }}
      />
    </>
  );
}
