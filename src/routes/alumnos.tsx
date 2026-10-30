import { Button } from "@/components/ui/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Minus, UserPlus, Search, Pencil, Upload } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Sheet } from "@/components/Sheet";
import { matchesStudent, weeklySlotLabel, WEEKDAYS } from "@/lib/agenda";
import { useStore, slots, iso, type Student, type Category, type CourtSide } from "@/lib/store";
import { CATEGORIES, COURT_SIDES, courtSideLabel } from "@/lib/player";
import { canAddToLesson } from "@/lib/rules";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/alumnos")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Alumnos — Pádel Pro" },
      { name: "description", content: "Alumnos fijos y rotativos con su saldo de clases." },
      { property: "og:title", content: "Alumnos — Pádel Pro" },
      { property: "og:description", content: "Saldo de clases, tipo de alumno y modalidad de pago." },
    ],
  }),
  component: Alumnos,
});

function Alumnos() {
  const { students, adjustBalance, addStudent, updateStudent, busy, loading } = useStore();
  const [filter, setFilter] = useState<"todos" | "fijo" | "rotativo" | "deuda">("todos");
  const [nuevo, setNuevo] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [search, setSearch] = useState("");
  const list = students.filter((s) => matchesStudent(s.name, search) && (filter === "todos" || (filter === "deuda" ? s.balance < 0 : s.type === filter)));

  return (
    <>
      <PageHeader sub={`${students.length} alumnos`} title="Alumnos" right={
        <div className="flex shrink-0 items-center gap-2">
          <Link to="/importar" aria-label="Importar alumnos" className="grid h-12 w-12 place-items-center rounded-full bg-muted text-foreground">
            <Upload className="h-5 w-5" />
          </Link>
          <Button variant="ghost" onClick={() => setNuevo(true)} aria-label="Nuevo alumno" className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground"><UserPlus className="h-6 w-6" /></Button>
        </div>
      } />
      <label className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input type="search" aria-label="Buscar alumno" placeholder="Buscar alumno" value={search} onChange={e => setSearch(e.target.value)} className="h-12 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
      </label>
      <div className="mx-4 mt-3 grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
        {(["todos", "fijo", "rotativo", "deuda"] as const).map((f) => (
          <Button variant="ghost" key={f} onClick={() => setFilter(f)} className={`h-10 rounded-md px-1 text-xs font-semibold capitalize ${filter === f ? "bg-foreground text-background" : "text-muted-foreground"}`}>{f}</Button>
        ))}
      </div>
      <div className="flex items-baseline justify-between px-4 pb-2 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Directorio</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{list.length} {list.length === 1 ? "alumno" : "alumnos"}</span>
      </div>
      <ul className="space-y-3 px-4 pb-4">
        {list.length === 0 && <li className="py-8 text-center text-sm text-muted-foreground">{loading ? "Cargando alumnos…" : search ? "No hay coincidencias." : "No hay alumnos en esta lista."}</li>}
        {list.map((s) => (
          <li key={s.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Button variant="ghost" aria-label={`Editar ${s.name}`} onClick={() => setEditing(s)} className="h-auto max-w-full justify-start p-0 text-lg font-semibold text-foreground hover:bg-transparent">
                  <span className="truncate">{s.name}</span><Pencil className="shrink-0 text-muted-foreground" />
                </Button>
                <p className="mt-1 text-sm text-muted-foreground">{[s.type, s.category, s.courtSide ? courtSideLabel(s.courtSide) : null, weeklySlotLabel(s)].filter(Boolean).join(" · ")}</p>
                <p className={`mt-0.5 text-sm font-medium ${s.balance < 0 ? "text-destructive" : "text-muted-foreground"}`}>{balancePhrase(s.balance)}</p>
              </div>
              <span aria-hidden className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${s.balance > 0 ? "bg-court" : s.balance < 0 ? "bg-destructive" : "bg-border"}`} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={busy} aria-label="Restar clase" onClick={() => adjustBalance(s.id, -1)} className="h-11 w-full"><Minus className="h-4 w-4" />Clase</Button>
              <Button disabled={busy} aria-label="Sumar clase" onClick={() => adjustBalance(s.id, 1)} className="h-11 w-full"><Plus className="h-4 w-4" />Clase</Button>
            </div>
          </li>
        ))}
      </ul>
      {nuevo && <StudentEditor busy={busy} onClose={() => setNuevo(false)} onSave={addStudent} />}
      {editing && <StudentEditor busy={busy} student={editing} onClose={() => setEditing(null)} onSave={async s => await updateStudent(editing.id, s) ? editing.id : false} />}
    </>
  );
}

/** Balance in words: useful in the directory, but not as a loud badge. */
const balancePhrase = (balance: number): string => {
  if (balance === 0) return "Al día";
  if (balance > 0) return `${balance} ${balance === 1 ? "clase a favor" : "clases a favor"}`;
  const owed = Math.abs(balance);
  return `Debe ${owed} ${owed === 1 ? "clase" : "clases"}`;
};

function StudentEditor({ onClose, onSave, student, busy }: { onClose: () => void; onSave: (s: Omit<Student, "id">) => Promise<string | false>; student?: Student; busy: boolean }) {
  const { settings, lessons, addLesson } = useStore();
  const [f, setF] = useState<Omit<Student, "id">>(student ?? { name: "", type: "fijo", pay: "mensual", phone: null, category: null, courtSide: null, recurringWeekday: null, recurringTime: null, balance: 0 });
  const [booking, setBooking] = useState(false);
  const [date, setDate] = useState(() => iso(new Date()));
  const [start, setStart] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Only a fijo student gets the extra class from here: a rotativo is booked
  // from the agenda. Deriving it (instead of clearing the switch on change) means
  // a date and time chosen before switching the type can never be booked.
  const bookAlso = booking && f.type === "fijo";
  // A slot is offered while it still has room for one more student.
  const available = slots(settings).filter((t) => {
    const active = lessons.filter((l) => l.date === date && l.start === t && l.status !== "cancelada").length;
    return canAddToLesson(active);
  });
  async function save() {
    if (submitting || busy) return;
    setSubmitting(true);
    try {
      const id = savedId ?? await onSave({ ...f, name: f.name.trim(), balance: Math.trunc(f.balance) });
      if (!id) return;
      setSavedId(id);
      if (bookAlso && !await addLesson({ date, start, studentId: id })) return;
      onClose();
    } finally { setSubmitting(false); }
  }
  const seg = <K extends "type" | "pay">(k: K, opts: Student[K][]) => (
    <div className="grid grid-cols-2 gap-2">
      {opts.map((o) => (
        <Button variant="ghost" key={o} onClick={() => setF({ ...f, [k]: o })} className={`h-11 rounded-lg text-sm font-semibold capitalize ${f[k] === o ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>{o}</Button>
      ))}
    </div>
  );
  return (
    <Sheet title={student ? "Editar alumno" : "Nuevo alumno"} onClose={onClose}>
      <div className="space-y-4">
        <fieldset disabled={submitting || busy || Boolean(savedId)} className="space-y-4">
        <input aria-label="Nombre y apellido" placeholder="Nombre y apellido" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]" />
        <input type="tel" inputMode="tel" aria-label="Teléfono" placeholder="Teléfono (opcional)" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value === "" ? null : e.target.value })} className="h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]" />
        {seg("type", ["fijo", "rotativo"])}
        {seg("pay", ["mensual", "semanal"])}
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-semibold">Categoría
            <select
              aria-label="Categoría"
              value={f.category ?? ""}
              onChange={(e) => setF({ ...f, category: e.target.value === "" ? null : (e.target.value as Category) })}
              className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]"
            >
              <option value="">Sin categoría</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">Posición
            <select
              aria-label="Posición"
              value={f.courtSide ?? ""}
              onChange={(e) => setF({ ...f, courtSide: e.target.value === "" ? null : (e.target.value as CourtSide) })}
              className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]"
            >
              <option value="">Sin posición</option>
              {COURT_SIDES.map((side) => <option key={side} value={side}>{courtSideLabel(side)}</option>)}
            </select>
          </label>
        </div>
        {!student && <label className="block text-sm font-semibold">Clases pagadas (cantidad)
          <input type="number" value={f.balance} onChange={(e) => setF({ ...f, balance: Number(e.target.value) || 0 })} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]" />
        </label>}
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-semibold">Horario fijo (semanal)</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm font-semibold">Día
              <select
                aria-label="Día del horario fijo"
                value={f.recurringWeekday ?? ""}
                onChange={(e) => setF({ ...f, recurringWeekday: e.target.value === "" ? null : Number(e.target.value), recurringTime: e.target.value === "" ? null : f.recurringTime })}
                className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]"
              >
                <option value="">Sin horario fijo</option>
                {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Hora
              <select
                aria-label="Hora del horario fijo"
                value={f.recurringTime ?? ""}
                disabled={f.recurringWeekday === null}
                onChange={(e) => setF({ ...f, recurringTime: e.target.value === "" ? null : e.target.value })}
                className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px] disabled:opacity-50"
              >
                <option value="">Elegir hora</option>
                {slots(settings).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Se agenda solo las próximas 4 semanas. Mover una clase puntual no cambia el horario.</p>
        </div>
        </fieldset>
        {f.type === "fijo" && <div className="flex items-center justify-between gap-3 border-t border-border pt-4"><label htmlFor="student-booking" className="text-sm font-semibold">Agregar clase a la agenda</label><Switch id="student-booking" checked={booking} disabled={submitting || busy} onCheckedChange={setBooking} /></div>}
        {bookAlso && <div className="space-y-3">
          <label className="block text-sm font-semibold">Día de la clase<input type="date" value={date} disabled={submitting || busy} onChange={e => { setDate(e.target.value); setStart(""); }} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]" /></label>
          <label className="block text-sm font-semibold">Horario<select value={start} disabled={submitting || busy} onChange={e => setStart(e.target.value)} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]"><option value="">Elegir horario</option>{available.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          {available.length === 0 && <p role="status" className="text-sm text-destructive">No hay horarios libres para este día.</p>}
        </div>}
        {savedId && <p role="status" className="text-sm text-muted-foreground">Alumno guardado. Falta confirmar la reserva.</p>}
        <Button variant="ghost" disabled={submitting || busy || !f.name.trim() || (f.recurringWeekday !== null && f.recurringTime === null) || (bookAlso && (!date || !available.includes(start)))} onClick={save} className="h-12 w-full text-[15px] disabled:opacity-40">{submitting || busy ? "Guardando…" : bookAlso ? "Guardar y reservar" : "Guardar"}</Button>
      </div>
    </Sheet>
  );
}
