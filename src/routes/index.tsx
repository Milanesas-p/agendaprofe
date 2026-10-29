import { weekStartFor, matchesStudent, weeklySlotLabel } from "@/lib/agenda";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, X, Plus, Settings2, ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { canAddToLesson } from "@/lib/rules";
import { useStore, slots, iso, addDays, type Lesson, type Student } from "@/lib/store";
import { profileLabel } from "@/lib/player";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Agenda — Pádel Pro" },
      { name: "description", content: "Agenda diaria y semanal de clases de pádel con check-in rápido." },
      { property: "og:title", content: "Agenda — Pádel Pro" },
      { property: "og:description", content: "Turnos, asistencia y saldos de alumnos a pie de cancha." },
    ],
  }),
  component: Agenda,
});

const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const statusStyle: Record<Lesson["status"], string> = {
  programada: "bg-muted text-muted-foreground",
  presente: "bg-court/10 text-court",
  ausente: "bg-destructive/10 text-destructive",
  cancelada: "bg-muted text-muted-foreground line-through",
};

/** Everything the teacher may want to know before acting on a student. */
const studentDetail = (s: Student) => [profileLabel(s), weeklySlotLabel(s)].filter(Boolean).join(" · ");

/** How many different time slots of a day hold at least one active student. */
const usedSlots = (lessons: Lesson[]) =>
  new Set(lessons.filter((l) => l.status !== "cancelada").map((l) => l.start)).size;

function Agenda() {
  const { lessons, students, settings, setStatus, addLesson, moveLesson, busy } = useStore();
  const [view, setView] = useState<"dia" | "semana">("dia");
  const [day, setDay] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [acting, setActing] = useState<Lesson | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [moveStart, setMoveStart] = useState("");

  const [weekStart, setWeekStart] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => { const today = iso(new Date()); setDay(today); setWeekStart(weekStartFor(today)); }, []);
  const selectDate = (date: string) => { setDay(date); setWeekStart(weekStartFor(date)); };
  const week = weekStart ? Array.from({ length: 7 }, (_, i) => addDays(new Date(weekStart + "T12:00:00"), i)) : [];
  const sOf = (id: string) => students.find((s) => s.id === id);
  const dayLessons = lessons.filter((l) => l.date === day);
  const blocks = slots(settings);
  const actingStudent = acting ? sOf(acting.studentId) : undefined;
  // Target slots for a move: within the blocks, with room, and not a slot this
  // student already has that day.
  const moveSlots = acting && moveDate
    ? slots(settings).filter((t) => {
      const taken = lessons.filter((l) => l.date === moveDate && l.start === t && l.status !== "cancelada" && l.id !== acting.id);
      return canAddToLesson(taken.length) && !taken.some((l) => l.studentId === acting.studentId);
    })
    : [];
  const openActions = (lesson: Lesson) => {
    setActing(lesson);
    setMoving(false);
    setMoveDate(lesson.date);
    setMoveStart("");
  };
  // Students already in the class being filled, so they are not offered twice.
  const alreadyIn = adding ? new Set(dayLessons.filter((l) => l.start === adding).map((l) => l.studentId)) : new Set<string>();

  return (
    <>
      <PageHeader
        sub="Tu cancha hoy"
        title="Agenda"
        right={
          <div className="flex shrink-0 items-center gap-2">
            <Link to="/resumen" aria-label="Resumen" className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground">
              <BarChart3 className="h-5 w-5" />
            </Link>
            <Link to="/configuracion" aria-label="Configuración" className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground">
              <Settings2 className="h-5 w-5" />
            </Link>
          </div>
        }
      />
      <div className="sticky top-[92px] z-20 space-y-3 border-b border-border bg-background px-4 py-3">
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
          {(["dia", "semana"] as const).map((v) => (
            <Button variant="ghost" key={v} onClick={() => setView(v)} className={`h-10 rounded-md text-sm font-semibold ${view === v ? "bg-foreground text-background" : "text-muted-foreground"}`}>
              {v === "dia" ? "Día" : "Semana"}
            </Button>
          ))}
        </div>
        <div className="flex items-center justify-between"><Button variant="ghost" aria-label="Semana anterior" onClick={() => { const k = iso(addDays(new Date(weekStart + "T12:00:00"), -7)); setWeekStart(k); setDay(k); }}><ChevronLeft /></Button><span className="text-sm font-semibold text-foreground">{day ? new Date(day + "T12:00:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" }) : "Agenda"}</span><Button variant="ghost" aria-label="Semana siguiente" onClick={() => { const k = iso(addDays(new Date(weekStart + "T12:00:00"), 7)); setWeekStart(k); setDay(k); }}><ChevronRight /></Button></div>
        <div className="flex items-center gap-2"><input type="date" aria-label="Fecha de la agenda" value={day} onChange={e => { if(e.target.value) selectDate(e.target.value); }} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-semibold" /><Button variant="outline" onClick={() => selectDate(iso(new Date()))} className="h-10">Hoy</Button></div>
        <div className="flex gap-2 overflow-x-auto">
          {week.map((d) => {
            const k = iso(d);
            const n = usedSlots(lessons.filter((l) => l.date === k));
            return (
              <Button variant="ghost" key={k} onClick={() => { setDay(k); setView("dia"); }} className={`flex h-auto min-w-14 shrink-0 flex-col items-center gap-1 rounded-lg py-2 ${k === day ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground"}`}>
                <span className="text-[10px] font-semibold uppercase tracking-wider">{DOW[d.getDay()]}</span>
                <span className="text-xl font-semibold leading-none tabular-nums">{d.getDate()}</span>
                <span className="text-[10px] font-semibold">{n}</span>
              </Button>
            );
          })}
        </div>
        <Legend />
      </div>

      {view === "dia" ? (
        <ul className="space-y-3 p-4">
          {blocks.map((t) => {
            const ls = dayLessons.filter((x) => x.start === t);
            if (ls.length === 0) {
              return (
                <li key={t} className="flex gap-3">
                  <span className="w-12 shrink-0 pt-3 text-xl font-semibold leading-none tabular-nums text-foreground">{t}</span>
                  <Button variant="ghost" onClick={() => { setSearch(""); setAdding(t); }} className="flex h-16 flex-1 items-center gap-4 rounded-xl border border-dashed border-court/40 bg-court/5 px-4 text-left">
                    <span className="flex-1 text-sm font-semibold text-court">Libre</span>
                    <Plus className="h-5 w-5 text-court" />
                  </Button>
                </li>
              );
            }
            const active = ls.filter((l) => l.status !== "cancelada").length;
            return (
              <li key={t} className="flex gap-3">
                <span className="w-12 shrink-0 pt-2 text-xl font-semibold leading-none tabular-nums text-foreground">{t}</span>
                <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {active === 1 ? "1 alumno" : `${active} alumnos`}
                    </span>
                    {canAddToLesson(active) && (
                      <Button variant="ghost" aria-label={`Agregar alumno a las ${t}`} onClick={() => { setSearch(""); setAdding(t); }} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-foreground hover:bg-border"><Plus className="h-4 w-4" /></Button>
                    )}
                  </div>
                  <ul>
                    {ls.map((l) => (
                      <StudentRow key={l.id} lesson={l} student={sOf(l.studentId)} busy={busy} onStatus={setStatus} onActions={openActions} />
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-4 p-4">
          {week.map((d) => {
            const k = iso(d);
            const ls = lessons.filter((l) => l.date === k).sort((a, b) => a.start.localeCompare(b.start));
            const starts = [...new Set(ls.map((l) => l.start))].sort();
            return (
              <Button variant="ghost" key={k} onClick={() => { setDay(k); setView("dia"); }} className="block h-auto w-full whitespace-normal rounded-xl border border-border bg-card p-3 text-left">
                <span className="block text-lg font-semibold tracking-tight text-foreground">{DOW[d.getDay()]} {d.getDate()} <span className="text-sm font-normal text-muted-foreground">· {blocks.length - usedSlots(ls)} libres</span></span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {starts.length === 0 && <span className="text-sm font-medium text-court">Todo libre</span>}
                  {starts.map((t) => {
                    const group = ls.filter((l) => l.start === t);
                    const active = group.filter((l) => l.status !== "cancelada").length;
                    const tone = active === 0
                      ? statusStyle.cancelada
                      : group.some((l) => l.status === "presente") ? statusStyle.presente
                        : group.some((l) => l.status === "ausente") ? statusStyle.ausente
                          : statusStyle.programada;
                    return (
                      <span key={t} className={`rounded px-2 py-1 text-xs font-semibold ${tone}`}>{t} · {active === 0 ? "cancelada" : `${active} ${active === 1 ? "alumno" : "alumnos"}`}</span>
                    );
                  })}
                </span>
              </Button>
            );
          })}
        </div>
      )}

      {adding && (
        <Sheet onClose={() => setAdding(null)} title={`Reservar ${adding}`}>
          <div className="space-y-2">
            <input type="search" aria-label="Buscar alumno para reservar" placeholder="Buscar alumno" value={search} onChange={e => setSearch(e.target.value)} className="h-12 w-full rounded-lg border border-border bg-card px-3" />
            {students.length === 0 && <p className="text-muted-foreground">Todavía no hay alumnos.</p>}
            {students.filter(s => matchesStudent(s.name, search) && !alreadyIn.has(s.id)).map((s) => (
              <Button variant="ghost" key={s.id} disabled={busy} onClick={async () => { if(await addLesson({ date: day, start: adding, studentId: s.id })) setAdding(null); }} className="flex h-14 w-full items-center justify-between rounded-xl border border-border bg-card px-4 font-semibold hover:bg-muted">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate">{s.name}</span>
                  {s.balance < 0 && <span role="img" aria-label="Debe clases" className="h-2 w-2 shrink-0 rounded-full bg-destructive" />}
                </span>
              </Button>
            ))}
          </div>
        </Sheet>
      )}
      {acting && (
        <Sheet title={actingStudent?.name ?? "Alumno"} onClose={() => { setActing(null); setMoving(false); }}>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{acting.date} · {acting.start} · {acting.status}</p>
          {actingStudent && studentDetail(actingStudent) && (
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{studentDetail(actingStudent)}</p>
          )}
          {moving ? (
            <div className="space-y-3">
              <label className="block text-sm font-semibold">Nuevo día
                <input type="date" aria-label="Nuevo día de la clase" value={moveDate} onChange={(e) => { setMoveDate(e.target.value); setMoveStart(""); }} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3" />
              </label>
              <label className="block text-sm font-semibold">Horario libre
                <select aria-label="Nuevo horario de la clase" value={moveStart} onChange={(e) => setMoveStart(e.target.value)} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3">
                  <option value="">Elegir horario</option>
                  {moveSlots.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              {moveSlots.length === 0 && <p role="status" className="text-sm text-destructive">No hay horarios libres ese día.</p>}
              <Button disabled={busy || !moveDate || !moveStart} onClick={async () => { if (await moveLesson(acting.id, { date: moveDate, start: moveStart })) { setActing(null); setMoving(false); } }} className="h-12 w-full">Mover la clase</Button>
              <Button variant="outline" onClick={() => setMoving(false)} className="h-11 w-full">Volver</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {acting.status === "programada" && (
                <Button variant="outline" onClick={() => setMoving(true)} className="h-12 w-full">Mover esta clase</Button>
              )}
              <Button disabled={busy} onClick={async () => { if (await setStatus(acting.id, acting.status === "cancelada" ? "programada" : "cancelada")) setActing(null); }} className="h-12 w-full">
                {acting.status === "cancelada" ? "Reactivar la clase" : "Cancelar la clase de este alumno"}
              </Button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

/**
 * One student inside a class. Attendance is a single tap: the active button
 * returns the lesson to "programada". The balance number is deliberately absent;
 * a red dot is the only hint that this student owes classes.
 */
function StudentRow({ lesson, student, busy, onStatus, onActions }: {
  lesson: Lesson;
  student: Student | undefined;
  busy: boolean;
  onStatus: (id: string, status: Lesson["status"]) => Promise<boolean>;
  onActions: (lesson: Lesson) => void;
}) {
  const cancelled = lesson.status === "cancelada";
  const name = student?.name ?? "Alumno";
  const owes = (student?.balance ?? 0) < 0;
  const profile = student ? profileLabel(student) : "";
  const tone = cancelled ? "" : lesson.status === "presente" ? "bg-court/5" : lesson.status === "ausente" ? "bg-destructive/5" : "";
  const round = "grid h-10 w-10 shrink-0 place-items-center rounded-full";

  return (
    <li className={`flex items-center gap-1.5 border-b border-border/60 px-2 py-1.5 last:border-b-0 ${tone}`}>
      <Button
        variant="ghost"
        disabled={busy || cancelled}
        aria-label={`Marcar presente a ${name}`}
        aria-pressed={lesson.status === "presente"}
        onClick={() => onStatus(lesson.id, lesson.status === "presente" ? "programada" : "presente")}
        className={`${round} ${lesson.status === "presente" ? "bg-court text-court-foreground" : "text-muted-foreground hover:bg-muted hover:text-court"}`}
      ><Check className="h-5 w-5" /></Button>
      <Button
        variant="ghost"
        disabled={busy || cancelled}
        aria-label={`Marcar ausente a ${name}`}
        aria-pressed={lesson.status === "ausente"}
        onClick={() => onStatus(lesson.id, lesson.status === "ausente" ? "programada" : "ausente")}
        className={`${round} ${lesson.status === "ausente" ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:bg-muted hover:text-destructive"}`}
      ><X className="h-5 w-5" /></Button>
      <Button variant="ghost" aria-label={`Opciones de ${name}`} onClick={() => onActions(lesson)} className="flex h-10 min-w-0 flex-1 items-center gap-1.5 px-1 text-left">
        <span className={`truncate text-[15px] font-semibold ${cancelled ? "text-muted-foreground line-through" : "text-foreground"}`}>{name}</span>
        {profile && <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{profile}</span>}
        {owes && !cancelled && <span role="img" aria-label="Debe clases" className="h-2 w-2 shrink-0 rounded-full bg-destructive" />}
        {cancelled && <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">cancelada</span>}
      </Button>
    </li>
  );
}

function Legend() {
  return (
    <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-court" />Libre / Presente</span>
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-foreground" />Ocupada</span>
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-destructive" />Ausente</span>
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-muted-foreground" />Cancelada</span>
    </div>
  );
}
