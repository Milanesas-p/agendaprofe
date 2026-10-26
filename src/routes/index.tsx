import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X, Plus, Settings2, Ban, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { SwipeCard } from "@/components/SwipeCard";
import { useStore, slots, iso, addDays, balanceLabel, type Lesson, validSettings } from "@/lib/store";

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
  programada: "bg-card border-foreground",
  presente: "bg-success/15 border-success",
  ausente: "bg-destructive/10 border-destructive",
  cancelada: "bg-muted border-muted-foreground border-dashed opacity-70",
};

function Agenda() {
  const { lessons, students, settings, setStatus, addLesson, setSettings } = useStore();
  const [view, setView] = useState<"dia" | "semana">("dia");
  const [day, setDay] = useState(() => iso(new Date()));
  const [adding, setAdding] = useState<string | null>(null);
  const [cfg, setCfg] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [weekStart, setWeekStart] = useState(() => iso(addDays(new Date(), -1)));
  const week = Array.from({ length: 7 }, (_, i) => addDays(new Date(weekStart + "T12:00:00"), i));
  const sOf = (id: string) => students.find((s) => s.id === id);
  const dayLessons = lessons.filter((l) => l.date === day);
  const blocks = slots(settings);

  return (
    <>
      <PageHeader
        sub="Tu cancha hoy"
        title="Agenda"
        right={
          <Button variant="ghost" onClick={() => { setDraft(settings); setCfg(true); }} aria-label="Configurar bloques" className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
            <Settings2 className="h-6 w-6" />
          </Button>
        }
      />
      <div className="sticky top-[92px] z-20 space-y-3 border-b-2 border-foreground bg-background px-4 py-3">
        <div className="grid grid-cols-2 rounded-xl border-2 border-foreground p-1">
          {(["dia", "semana"] as const).map((v) => (
            <Button variant="ghost" key={v} onClick={() => setView(v)} className={`h-11 rounded-lg font-display text-xl ${view === v ? "bg-foreground text-background" : ""}`}>
              {v === "dia" ? "Día" : "Semana"}
            </Button>
          ))}
        </div>
        <div className="flex items-center justify-between"><Button variant="ghost" aria-label="Semana anterior" onClick={() => { const k = iso(addDays(new Date(weekStart + "T12:00:00"), -7)); setWeekStart(k); setDay(k); }}><ChevronLeft /></Button><span className="text-sm font-bold">{new Date(day + "T12:00:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</span><Button variant="ghost" aria-label="Semana siguiente" onClick={() => { const k = iso(addDays(new Date(weekStart + "T12:00:00"), 7)); setWeekStart(k); setDay(k); }}><ChevronRight /></Button></div>
        <div className="flex gap-2 overflow-x-auto">
          {week.map((d) => {
            const k = iso(d);
            const n = lessons.filter((l) => l.date === k && l.status !== "cancelada").length;
            return (
              <Button variant="ghost" key={k} onClick={() => { setDay(k); setView("dia"); }} className={`flex h-auto min-w-14 shrink-0 flex-col items-center gap-1 rounded-lg border-2 py-2 ${k === day ? "border-foreground bg-primary text-primary-foreground" : "border-border"}`}>
                <span className="text-xs font-bold uppercase">{DOW[d.getDay()]}</span>
                <span className="font-display text-2xl leading-none">{d.getDate()}</span>
                <span className="text-xs font-semibold">{n}</span>
              </Button>
            );
          })}
        </div>
        <Legend />
      </div>

      {view === "dia" ? (
        <ul className="space-y-2 p-4">
          {blocks.map((t) => {
            const l = dayLessons.find((x) => x.start === t && x.status !== "cancelada") ?? dayLessons.find((x) => x.start === t);
            if (!l)
              return (
                <li key={t}>
                  <Button variant="ghost" onClick={() => setAdding(t)} className="flex h-16 w-full items-center gap-4 rounded-xl border-2 border-dashed border-success/60 bg-success/5 px-4 text-left">
                    <span className="w-14 font-display text-2xl">{t}</span>
                    <span className="flex-1 font-semibold text-success">Libre</span>
                    <Plus className="h-6 w-6 text-success" />
                  </Button>
                </li>
              );
            const s = sOf(l.studentId);
            const done = l.status !== "programada";
            return (
              <li key={t}>
                <SwipeCard disabled={l.status === "cancelada"} onRight={() => setStatus(l.id, "presente")} onLeft={() => setStatus(l.id, "ausente")}>
                  <div className={`rounded-xl border-2 p-3 ${statusStyle[l.status]}`}>
                    <div className="flex items-center gap-3">
                      <span className="w-14 font-display text-2xl">{t}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-bold">{s?.name}</p>
                        <p className="text-sm font-semibold uppercase text-muted-foreground">
                          {l.status} · {s?.type} · saldo {s ? balanceLabel(s.balance) : ""}
                        </p>
                      </div>
                    </div>
                    {l.status !== "cancelada" && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Button variant="ghost" onClick={() => setStatus(l.id, "presente")} className={`flex h-12 items-center justify-center gap-1 rounded-lg font-bold ${l.status === "presente" ? "bg-success text-success-foreground" : "border-2 border-success text-success"}`}><Check className="h-5 w-5" />Presente</Button>
                        <Button variant="ghost" onClick={() => setStatus(l.id, "ausente")} className={`flex h-12 items-center justify-center gap-1 rounded-lg font-bold ${l.status === "ausente" ? "bg-destructive text-destructive-foreground" : "border-2 border-destructive text-destructive"}`}><X className="h-5 w-5" />Ausente</Button>
                        <Button variant="ghost" onClick={() => setStatus(l.id, done ? "programada" : "cancelada")} className="flex h-12 items-center justify-center gap-1 rounded-lg border-2 border-foreground font-bold">{done ? "Deshacer" : <><Ban className="h-4 w-4" />Cancelar</>}</Button>
                      </div>
                    )}
                    {l.status === "cancelada" && (
                      <div className="mt-2 grid grid-cols-2 gap-2"><Button variant="ghost" onClick={() => setStatus(l.id, "programada")} className="h-11 rounded-lg border-2 border-foreground font-bold">Reactivar</Button><Button variant="outline" className="h-11" onClick={() => setAdding(t)}><Plus />Nueva reserva</Button></div>
                    )}
                  </div>
                </SwipeCard>
              </li>
            );
          })}
          
        </ul>
      ) : (
        <div className="space-y-4 p-4">
          {week.map((d) => {
            const k = iso(d);
            const ls = lessons.filter((l) => l.date === k).sort((a, b) => a.start.localeCompare(b.start));
            return (
              <Button variant="ghost" key={k} onClick={() => { setDay(k); setView("dia"); }} className="block w-full rounded-xl border-2 border-foreground bg-card p-3 text-left">
                <p className="font-display text-2xl">{DOW[d.getDay()]} {d.getDate()} <span className="text-base text-muted-foreground">· {blocks.length - ls.filter((l) => l.status !== "cancelada").length} libres</span></p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ls.length === 0 && <span className="text-sm text-success font-semibold">Todo libre</span>}
                  {ls.map((l) => (
                    <span key={l.id} className={`rounded-md border-2 px-2 py-1 text-sm font-bold ${statusStyle[l.status]}`}>{l.start} {sOf(l.studentId)?.name.split(" ")[0]}</span>
                  ))}
                </div>
              </Button>
            );
          })}
        </div>
      )}

      {adding && (
        <Sheet onClose={() => setAdding(null)} title={`Reservar ${adding}`}>
          <div className="space-y-2">
            {students.length === 0 && <p className="text-muted-foreground">Todavía no hay alumnos.</p>}
            {students.map((s) => (
              <Button variant="ghost" key={s.id} onClick={() => { addLesson({ date: day, start: adding, studentId: s.id }); setAdding(null); }} className="flex h-14 w-full items-center justify-between rounded-xl border-2 border-foreground px-4 font-bold">
                {s.name} <span className="font-display text-xl">{balanceLabel(s.balance)}</span>
              </Button>
            ))}
          </div>
        </Sheet>
      )}
      {cfg && (
        <Sheet onClose={() => setCfg(false)} title="Bloques horarios">
          {([["startHour", "Desde (hora)"], ["endHour", "Hasta (hora)"], ["blockMin", "Duración (min)"]] as const).map(([k, label]) => (
            <label key={k} className="mb-3 block font-bold">
              {label}
              <input type="number" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} className="mt-1 h-14 w-full rounded-xl border-2 border-foreground bg-background px-4 text-xl" />
            </label>
          ))}
          {!validSettings(draft) && <p role="alert" className="text-destructive">Revisá las horas y la duración: entre 15 y 240 minutos.</p>}
          <Button disabled={!validSettings(draft)} className="mt-3 h-12 w-full" onClick={() => { setSettings(draft); setCfg(false); }}>Guardar horarios</Button>
        </Sheet>
      )}
    </>
  );
}

function Legend() {
  return (
    <div className="flex justify-between text-xs font-bold uppercase">
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-success" />Libre / Presente</span>
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-foreground" />Ocupada</span>
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-destructive" />Ausente</span>
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-muted-foreground" />Cancelada</span>
    </div>
  );
}

