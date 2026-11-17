import { weekStartFor, matchesStudent, slotsLabel } from "@/lib/agenda";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, X, Plus, Settings2, ChevronLeft, ChevronRight, ChevronDown, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { canAddToLesson } from "@/lib/rules";
import { useStore, slots, iso, addDays, type Lesson, type Student } from "@/lib/store";
import { windowEndISO, windowStartISO } from "@/lib/lesson-window";
import { profileLabel } from "@/lib/player";
import { Tour } from "@/components/Tour";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { reminderText, whatsappLink } from "@/lib/whatsapp";
import { suggestionReason, suggestionsFor, type Suggestion } from "@/lib/suggestions";

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
  confirmado: "bg-foreground/10 text-foreground",
  presente: "bg-court/10 text-court",
  ausente: "bg-destructive/10 text-destructive",
  cancelada: "bg-muted text-muted-foreground line-through",
};

/** The dot that hints, in a closed row, how each student of the block stands. */
const statusDot: Record<Lesson["status"], string> = {
  programada: "bg-muted-foreground/60",
  confirmado: "bg-foreground",
  presente: "bg-court",
  ausente: "bg-destructive",
  cancelada: "bg-muted-foreground/30",
};

/** Everything the teacher may want to know before acting on a student. */
const studentDetail = (s: Student) => [profileLabel(s), slotsLabel(s.slots)].filter(Boolean).join(" · ");

/** How many different time slots of a day hold at least one active student. */
const usedSlots = (lessons: Lesson[]) =>
  new Set(lessons.filter((l) => l.status !== "cancelada").map((l) => l.start)).size;

function Agenda() {
  const { lessons, students, settings, setStatus, setNotified, addLesson, moveLesson, busy } = useStore();
  const [view, setView] = useState<"dia" | "semana">("dia");
  const [day, setDay] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [acting, setActing] = useState<Lesson | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [moveStart, setMoveStart] = useState("");
  // Closed by default: the day is a list of hours, and a block only reveals its
  // students (and its edits) once the teacher opens it.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const [weekStart, setWeekStart] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => { const today = iso(new Date()); setDay(today); setWeekStart(weekStartFor(today)); }, []);
  // Another day is another list: nothing stays open from the previous one.
  useEffect(() => { setOpen(new Set()); }, [day]);
  const toggleSlot = (t: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  const selectDate = (date: string) => { setDay(date); setWeekStart(weekStartFor(date)); };
  const week = weekStart ? Array.from({ length: 7 }, (_, i) => addDays(new Date(weekStart + "T12:00:00"), i)) : [];
  // Empty until hydration, so the server and the first client render agree.
  const earliestLoaded = weekStart ? windowStartISO(new Date()) : "";
  const latestLoaded = weekStart ? windowEndISO(new Date()) : "";
  const sOf = (id: string) => students.find((s) => s.id === id);
  const dayLessons = lessons.filter((l) => l.date === day);
  const blocks = slots(settings);
  const actingStudent = acting ? sOf(acting.studentId) : undefined;
  const actingReminder = acting && actingStudent && acting.status !== "cancelada"
    ? whatsappLink(actingStudent.phone, reminderText(acting.start))
    : null;
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
  // Planning ahead: a rotativo who already played this weekday and time is the
  // strongest candidate for the empty seat. Past days get no suggestions.
  const today = iso(new Date());
  const suggestionsOf = (slotDate: string, slotStart: string) =>
    suggestionsFor({ date: slotDate, start: slotStart, students, lessons, todayISO: today });
  const sheetSuggestions = adding ? suggestionsOf(day, adding) : [];

  return (
    <>
      <Tour />
      <PageHeader
        sticky={false}
        sub="Tu cancha hoy"
        title="Agenda"
        right={
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <Link to="/avisos" aria-label="Avisos" data-tour="notices" className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground">
              <WhatsAppIcon className="h-5 w-5" />
            </Link>
            <Link to="/resumen" aria-label="Resumen" className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground">
              <BarChart3 className="h-5 w-5" />
            </Link>
            <Link to="/configuracion" aria-label="Configuración" className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground">
              <Settings2 className="h-5 w-5" />
            </Link>
          </div>
        }
      />
      <div className="sticky top-0 z-20 space-y-3 border-b border-border bg-background px-4 py-3 lg:px-6">
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
          {(["dia", "semana"] as const).map((v) => (
            <Button variant="ghost" key={v} onClick={() => setView(v)} className={`h-10 rounded-md text-sm font-semibold ${view === v ? "bg-foreground text-background" : "text-muted-foreground"}`}>
              {v === "dia" ? "Día" : "Semana"}
            </Button>
          ))}
        </div>
        <div className="flex items-center justify-between"><Button variant="ghost" aria-label="Semana anterior" disabled={earliestLoaded !== "" && weekStart <= earliestLoaded} onClick={() => { const k = iso(addDays(new Date(weekStart + "T12:00:00"), -7)); setWeekStart(k); setDay(k); }}><ChevronLeft /></Button><span className="text-sm font-semibold text-foreground">{day ? new Date(day + "T12:00:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" }) : "Agenda"}</span><Button variant="ghost" aria-label="Semana siguiente" disabled={latestLoaded !== "" && weekStart >= latestLoaded} onClick={() => { const k = iso(addDays(new Date(weekStart + "T12:00:00"), 7)); setWeekStart(k); setDay(k); }}><ChevronRight /></Button></div>
        <div data-tour="date" className="flex items-center gap-2"><input type="date" aria-label="Fecha de la agenda" min={earliestLoaded || undefined} max={latestLoaded || undefined} value={day} onChange={e => { if(e.target.value) selectDate(e.target.value); }} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-semibold" /><Button variant="outline" onClick={() => selectDate(iso(new Date()))} className="h-10">Hoy</Button></div>
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
        <div className="p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6 lg:p-6">
          <ul className="space-y-3">
            {blocks.map((t) => {
              const ls = dayLessons.filter((x) => x.start === t);
              const active = ls.filter((l) => l.status !== "cancelada");
              const released = ls.length - active.length;
              const expanded = open.has(t);
              // Only a slot with room can take another student.
              const suggestions = canAddToLesson(active.length) ? suggestionsOf(day, t) : [];
              // The released seat is worth saying out loud: a class that looks full
              // because it shows four students still has room for a replacement.
              const count = active.length === 0
                ? (ls.length > 0 ? "Cancelada" : "Libre")
                : `${active.length === 1 ? "1 alumno" : `${active.length} alumnos`}${released > 0 ? ` · ${released} no va` : ""}`;
              return (
                <li key={t} className="flex gap-3">
                  <span className="w-12 shrink-0 pt-3 text-xl font-semibold leading-none tabular-nums text-foreground">{t}</span>
                  <div
                    className={`min-w-0 flex-1 overflow-hidden rounded-xl border ${
                      active.length === 0 ? "border-dashed border-court/40 bg-court/5" : "border-border bg-card"
                    }`}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`${t}, ${count}`}
                      onClick={() => toggleSlot(t)}
                      className="flex w-full items-center gap-2 px-3 py-3 text-left"
                    >
                      <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${active.length === 0 ? "text-court" : "text-foreground"}`}>
                        {count}
                      </span>
                      {active.length > 0 && (
                        <span aria-hidden className="flex shrink-0 items-center gap-1">
                          {active.map((l) => (
                            <i key={l.id} className={`h-2 w-2 rounded-full ${statusDot[l.status]}`} />
                          ))}
                        </span>
                      )}
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    {expanded && (
                      <div className="border-t border-border/60">
                        {suggestions.length > 0 && (
                          <div className="border-b border-border/60 bg-court/5 px-2 py-2">
                            <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-court">Sugeridos</p>
                            {suggestions.map((s) => (
                              <SuggestionRow
                                key={s.studentId}
                                suggestion={s}
                                busy={busy}
                                onAdd={() => { void addLesson({ date: day, start: t, studentId: s.studentId }); }}
                              />
                            ))}
                          </div>
                        )}
                        {ls.length > 0 && (
                          <ul>
                            {ls.map((l) => (
                              <StudentRow
                                key={l.id}
                                lesson={l}
                                student={sOf(l.studentId)}
                                busy={busy}
                                onStatus={setStatus}
                                onNotify={setNotified}
                                onActions={openActions}
                              />
                            ))}
                          </ul>
                        )}
                        {canAddToLesson(active.length) ? (
                          <Button
                            variant="ghost"
                            onClick={() => { setSearch(""); setAdding(t); }}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-none text-sm font-semibold text-court"
                          >
                            <Plus className="h-4 w-4" /> Agregar alumno
                          </Button>
                        ) : (
                          <p className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Clase completa
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <DaySummary lessons={dayLessons} blocks={blocks} />
        </div>
      ) : (
        <div className="space-y-4 p-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:p-6">
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
            {sheetSuggestions.length > 0 && (
              <div role="group" aria-label="Sugeridos" className="space-y-1 rounded-xl border border-court/30 bg-court/5 p-2">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-court">Sugeridos</p>
                {sheetSuggestions.map((s) => (
                  <SuggestionRow
                    key={s.studentId}
                    suggestion={s}
                    busy={busy}
                    onAdd={async () => { if (await addLesson({ date: day, start: adding, studentId: s.studentId })) setAdding(null); }}
                  />
                ))}
              </div>
            )}
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
              {actingReminder && (
                <>
                  <Button asChild variant="outline" className="h-12 w-full">
                    <a
                      href={actingReminder}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => { if (!acting.notified) void setNotified(acting.id, true).then((ok) => { if (ok) setActing({ ...acting, notified: true }); }); }}
                    >
                      <WhatsAppIcon className="h-4 w-4" /> Recordar por WhatsApp
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    aria-pressed={acting.notified}
                    onClick={() => void setNotified(acting.id, !acting.notified).then((ok) => { if (ok) setActing({ ...acting, notified: !acting.notified }); })}
                    className="h-11 w-full"
                  >
                    {acting.notified ? "Ya le avisé (deshacer)" : "Marcar como avisado"}
                  </Button>
                </>
              )}
              {(acting.status === "programada" || acting.status === "confirmado") && (
                <Button variant="outline" onClick={() => setMoving(true)} className="h-12 w-full">Mover esta clase</Button>
              )}
              {acting.status === "confirmado" && (
                <Button variant="outline" disabled={busy} onClick={async () => { if (await setStatus(acting.id, "programada")) setActing(null); }} className="h-12 w-full">
                  Quitar la confirmación
                </Button>
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
 * Desktop-only companion to the day list: the same numbers the teacher would
 * otherwise count by hand, in a column that has room for them. Hidden on mobile
 * because there the day itself is the screen.
 */
function DaySummary({ lessons, blocks }: { lessons: Lesson[]; blocks: string[] }) {
  const active = lessons.filter((l) => l.status !== "cancelada");
  const present = lessons.filter((l) => l.status === "presente").length;
  const absent = lessons.filter((l) => l.status === "ausente").length;
  const confirmed = lessons.filter((l) => l.status === "confirmado").length;
  const released = lessons.length - active.length;
  const taken = new Set(active.map((l) => l.start)).size;
  const rows = [
    { label: "Horarios ocupados", value: `${taken} de ${blocks.length}` },
    { label: "Alumnos en clase", value: String(active.length) },
    { label: "Presentes", value: String(present), tone: "text-court" },
    { label: "Ausentes", value: String(absent), tone: "text-destructive" },
    { label: "Confirmados", value: String(confirmed) },
    { label: "No van", value: String(released) },
    { label: "Horarios libres", value: String(blocks.length - taken), tone: "text-court" },
  ];

  return (
    <aside className="hidden lg:block">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resumen del día</h2>
        <dl className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-sm font-medium text-muted-foreground">{row.label}</dt>
              <dd className={`text-sm font-semibold tabular-nums ${row.tone ?? "text-foreground"}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

/**
 * One suggestion: who, why, and a single tap to book them. It appears both in an
 * open block and in the booking sheet, so the markup lives in one place.
 */
function SuggestionRow({ suggestion, busy, onAdd }: { suggestion: Suggestion; busy: boolean; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-1">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{suggestion.name}</span>
        <span className="block truncate text-[11px] font-medium text-muted-foreground">{suggestionReason(suggestion)}</span>
      </span>
      <Button
        variant="ghost"
        disabled={busy}
        aria-label={`Agregar sugerido: ${suggestion.name}`}
        onClick={onAdd}
        className="h-10 shrink-0 gap-1 px-2 text-xs font-semibold text-court hover:bg-court/10"
      >
        <Plus className="h-4 w-4" /> Agregar
      </Button>
    </div>
  );
}

/**
 * One student inside a class. Attendance is a single tap: the active button
 * returns the lesson to "programada". Dragging the name sideways is the quick
 * way to confirm (right) or release (left) the slot, and both can be undone from
 * the toast. The balance number is deliberately absent; a red dot is the only
 * hint that this student owes classes.
 */
const SWIPE_LIMIT = 88;
const SWIPE_COMMIT = 56;

function StudentRow({ lesson, student, busy, onStatus, onNotify, onActions }: {
  lesson: Lesson;
  student: Student | undefined;
  busy: boolean;
  onStatus: (id: string, status: Lesson["status"]) => Promise<boolean>;
  onNotify: (id: string, notified: boolean) => Promise<boolean>;
  onActions: (lesson: Lesson) => void;
}) {
  const cancelled = lesson.status === "cancelada";
  const confirmed = lesson.status === "confirmado";
  const name = student?.name ?? "Alumno";
  const owes = (student?.balance ?? 0) < 0;
  const profile = student ? profileLabel(student) : "";
  const tone = lesson.status === "presente" ? "bg-court/5" : lesson.status === "ausente" ? "bg-destructive/5" : confirmed ? "bg-foreground/5" : "";
  const round = "grid h-10 w-10 shrink-0 place-items-center rounded-full";
  // Nothing to remember when the class is cancelled or the student has no phone.
  const reminder = cancelled ? null : whatsappLink(student?.phone, reminderText(lesson.start));

  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const offset = useRef(0);
  const swipedAt = useRef(0);

  /** Confirming or releasing a slot never spends a class: only presence does. */
  const mark = async (next: Lesson["status"]) => {
    if (busy || next === lesson.status) return;
    const previous = lesson.status;
    if (!(await onStatus(lesson.id, next))) return;
    toast(next === "confirmado" ? `Confirmaste a ${name}` : `${name} no va`, {
      action: { label: "Deshacer", onClick: () => { void onStatus(lesson.id, previous); } },
    });
  };

  const pointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    start.current = { x: e.clientX, y: e.clientY };
    offset.current = 0;
  };
  const pointerMove = (e: React.PointerEvent) => {
    const from = start.current;
    if (!from) return;
    const mx = e.clientX - from.x;
    const my = e.clientY - from.y;
    // A vertical drag belongs to the page: only a clear sideways drag takes over.
    if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my)) return;
    const next = Math.max(-SWIPE_LIMIT, Math.min(SWIPE_LIMIT, mx));
    offset.current = next;
    setDx(next);
  };
  const pointerUp = () => {
    const from = start.current;
    start.current = null;
    const moved = offset.current;
    offset.current = 0;
    setDx(0);
    if (!from || moved === 0) return;
    // The click that follows a drag must not also fire the button underneath.
    swipedAt.current = Date.now();
    if (moved >= SWIPE_COMMIT) void mark("confirmado");
    else if (moved <= -SWIPE_COMMIT) void mark("cancelada");
  };
  const tap = (run: () => void) => () => {
    if (Date.now() - swipedAt.current < 300) return;
    run();
  };

  return (
    <li
      className="relative overflow-hidden border-b border-border/60 last:border-b-0"
      style={{ touchAction: "pan-y" }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      {dx !== 0 && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-between bg-card px-4">
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-court">
            <Check className="h-4 w-4" /> Va
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-destructive">
            No va <X className="h-4 w-4" />
          </span>
        </div>
      )}
      <div
        className={`relative bg-card ${dx !== 0 ? "select-none" : ""}`}
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 140ms ease-out" : "none" }}
      >
        {tone && <span aria-hidden className={`absolute inset-0 ${tone}`} />}
        <div className="relative flex items-center gap-1.5 px-2 py-1.5">
          <Button
            variant="ghost"
            disabled={busy || cancelled}
            aria-label={`Marcar presente a ${name}`}
            aria-pressed={lesson.status === "presente"}
            onClick={tap(() => void onStatus(lesson.id, lesson.status === "presente" ? "programada" : "presente"))}
            className={`${round} ${lesson.status === "presente" ? "bg-court text-court-foreground" : "text-muted-foreground hover:bg-muted hover:text-court"}`}
          ><Check className="h-5 w-5" /></Button>
          <Button
            variant="ghost"
            disabled={busy || cancelled}
            aria-label={`Marcar ausente a ${name}`}
            aria-pressed={lesson.status === "ausente"}
            onClick={tap(() => void onStatus(lesson.id, lesson.status === "ausente" ? "programada" : "ausente"))}
            className={`${round} ${lesson.status === "ausente" ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:bg-muted hover:text-destructive"}`}
          ><X className="h-5 w-5" /></Button>
          <Button variant="ghost" aria-label={`Opciones de ${name}`} onClick={tap(() => onActions(lesson))} className="flex h-auto min-h-10 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 px-1 py-1 text-left">
            {/* The name gets the whole width; the profile shares a smaller second
                line, so a long name never ends up as "Sofía Ra...". */}
            <span className="flex max-w-full items-center gap-1.5">
              <span className={`truncate text-[15px] font-semibold ${cancelled ? "text-muted-foreground line-through" : "text-foreground"}`}>{name}</span>
              {owes && !cancelled && <span role="img" aria-label="Debe clases" className="h-2 w-2 shrink-0 rounded-full bg-destructive" />}
              {confirmed && (
                <span role="img" aria-label="Confirmado" className="shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">va</span>
              )}
            </span>
            {(profile || cancelled) && (
              <span className="max-w-full truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {cancelled ? "cancelada" : profile}
              </span>
            )}
          </Button>
          {reminder && (
            <Button asChild variant="ghost" className={`${round} ${lesson.notified ? "bg-court/10 text-court" : "text-court hover:bg-court/10"}`}>
              <a
                href={reminder}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={lesson.notified ? `Ya le avisaste a ${name}` : `Recordar por WhatsApp a ${name}`}
                onClick={tap(() => { if (!lesson.notified) void onNotify(lesson.id, true); })}
              >
                <span className="relative">
                  <WhatsAppIcon className="h-5 w-5" />
                  {lesson.notified && <Check className="absolute -bottom-1 -right-1 h-3 w-3" strokeWidth={3} />}
                </span>
              </a>
            </Button>
          )}
        </div>
      </div>
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
