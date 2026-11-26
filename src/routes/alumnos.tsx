import { Button } from "@/components/ui/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Minus, UserPlus, Search, Pencil, Upload, Power } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Sheet } from "@/components/Sheet";
import { ReactivateStudent } from "@/components/ReactivateStudent";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { matchesStudent, slotsLabel, WEEKDAYS } from "@/lib/agenda";
import { useStore, slots, iso, PAY_MODES, type Student, type Category, type CourtSide } from "@/lib/store";
import { activePayload } from "@/lib/students";
import type { StudentSlot } from "@/lib/recurrence";
import { CATEGORIES, COURT_SIDES, courtSideLabel } from "@/lib/player";
import { canAddToLesson } from "@/lib/rules";
import { payLabel } from "@/lib/pay";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

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
  const [filter, setFilter] = useState<"todos" | "fijo" | "rotativo" | "deuda" | "inactivos">("todos");
  const [nuevo, setNuevo] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  // Monthly top-up opened from the row: +1, +4 or +8 in one move.
  const [adding, setAdding] = useState<Student | null>(null);
  // Pause or bring back a student from the row, after a confirmation.
  const [status, setStatus] = useState<{ student: Student; nextActive: boolean } | null>(null);
  // A student just came back: the editor opens empty and explains what is missing.
  const [reactivatedNotice, setReactivatedNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const inactive = students.filter((s) => s.active === false).length;
  const applyStatus = async (s: Student, nextActive: boolean) => {
    // Coming back asks for a fresh schedule: the old weekly slots are cleared
    // (and with them the automatic booking), so the teacher sets the new days.
    const payload = nextActive ? { ...activePayload(s, true), slots: [] } : activePayload(s, false);
    if (!(await updateStudent(s.id, payload))) return;
    setStatus(null);
    if (nextActive) {
      toast.success(`${s.name} reactivado. Configurá el alumno nuevamente.`);
      setReactivatedNotice(`Cargá los nuevos horarios de ${s.name} y guardá para volver a agendarlo.`);
      setEditing({ ...s, slots: [], active: true });
    }
  };
  const list = students.filter((s) =>
    matchesStudent(s.name, search) &&
    (filter === "todos" ||
      (filter === "deuda"
        ? s.balance < 0
        : filter === "inactivos"
          ? s.active === false
          : s.type === filter)),
  );

  return (
    <>
      <PageHeader sub={inactive > 0 ? `${students.length} alumnos · ${inactive} inactivos` : `${students.length} alumnos`} title="Alumnos" right={
        <div className="flex shrink-0 items-center gap-2">
          <Link to="/importar" aria-label="Importar alumnos" className="grid h-12 w-12 place-items-center rounded-full bg-muted text-foreground">
            <Upload className="h-5 w-5" />
          </Link>
          <Button variant="ghost" onClick={() => setNuevo(true)} aria-label="Nuevo alumno" className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground"><UserPlus className="h-6 w-6" /></Button>
        </div>
      } />
      <div className="lg:flex lg:items-center lg:gap-3 lg:px-6 lg:pt-3">
        <label className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 lg:mx-0 lg:mt-0 lg:flex-1">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input type="search" aria-label="Buscar alumno" placeholder="Buscar alumno" value={search} onChange={e => setSearch(e.target.value)} className="h-12 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
        </label>
        <div className="mx-4 mt-3 grid grid-cols-5 gap-1 rounded-lg bg-muted p-1 lg:mx-0 lg:mt-0 lg:w-96">
          {(["todos", "fijo", "rotativo", "deuda", "inactivos"] as const).map((f) => (
            <Button variant="ghost" key={f} onClick={() => setFilter(f)} className={`h-10 rounded-md px-1 text-[11px] font-semibold capitalize ${filter === f ? "bg-foreground text-background" : "text-muted-foreground"}`}>{f}</Button>
          ))}
        </div>
      </div>
      <div className="flex items-baseline justify-between px-4 pb-2 pt-4 lg:px-6">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Directorio</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{list.length} {list.length === 1 ? "alumno" : "alumnos"}</span>
      </div>
      <ul className="space-y-3 px-4 pb-4 lg:space-y-0 lg:divide-y lg:divide-border lg:rounded-xl lg:border lg:border-border lg:bg-card lg:px-0 lg:pb-0">
        <li className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_12rem_13rem] lg:gap-4 lg:border-b lg:border-border lg:px-4 lg:py-2.5 lg:text-[11px] lg:font-semibold lg:uppercase lg:tracking-wider lg:text-muted-foreground">
          <span>Alumno</span>
          <span>Saldo</span>
          <span>Clases</span>
        </li>
        {list.length === 0 && <li className="py-8 text-center text-sm text-muted-foreground">{loading ? "Cargando alumnos…" : search ? "No hay coincidencias." : "No hay alumnos en esta lista."}</li>}
        {list.map((s) => (
          <li key={s.id} className="rounded-xl border border-border bg-card p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_12rem_13rem] lg:items-center lg:gap-4 lg:rounded-none lg:border-0 lg:px-4 lg:py-3">
            <div className="flex items-start justify-between gap-3 lg:block">
              <div className="min-w-0">
                <Button variant="ghost" aria-label={`Editar ${s.name}`} onClick={() => { setReactivatedNotice(null); setEditing(s); }} className="h-auto max-w-full justify-start p-0 text-lg font-semibold text-foreground hover:bg-transparent">
                  <span className="truncate">{s.name}</span><Pencil className="shrink-0 text-muted-foreground" />
                </Button>
                {s.active === false && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Inactivo</span>}
                <p className="mt-1 text-sm text-muted-foreground">{[s.type, s.category, s.courtSide ? courtSideLabel(s.courtSide) : null, slotsLabel(s.slots)].filter(Boolean).join(" · ")}</p>
                <Button
                  variant="ghost"
                  aria-label={s.active === false ? `Reactivar a ${s.name}` : `Deshabilitar a ${s.name}`}
                  disabled={busy}
                  onClick={() => setStatus({ student: s, nextActive: s.active === false })}
                  className="mt-1 h-auto gap-1 p-0 text-xs font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  <Power className="h-3.5 w-3.5" />
                  {s.active === false ? "Reactivar" : "Deshabilitar"}
                </Button>
              </div>
              <span aria-hidden className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full lg:hidden ${s.balance > 0 ? "bg-court" : s.balance < 0 ? "bg-destructive" : "bg-border"}`} />
            </div>
            <p className={`mt-0.5 text-sm font-medium lg:mt-0 ${s.balance < 0 ? "text-destructive" : "text-muted-foreground"}`}>{balancePhrase(s.balance)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:mt-0">
              <Button variant="outline" disabled={busy} aria-label="Restar clase" onClick={() => adjustBalance(s.id, -1)} className="h-11 w-full"><Minus className="h-4 w-4" />Clase</Button>
              <Button disabled={busy} aria-label="Sumar clase" onClick={() => { if (s.pay === "mensual") setAdding(s); else void adjustBalance(s.id, 1); }} className="h-11 w-full"><Plus className="h-4 w-4" />Clase</Button>
            </div>
          </li>
        ))}
      </ul>
      {nuevo && <StudentEditor busy={busy} onClose={() => setNuevo(false)} onSave={addStudent} />}
      {editing && <StudentEditor busy={busy} student={editing} notice={reactivatedNotice ?? undefined} onClose={() => { setEditing(null); setReactivatedNotice(null); }} onSave={async s => await updateStudent(editing.id, s) ? editing.id : false} />}
      {adding && <AddClasses student={adding} onClose={() => setAdding(null)} />}
      {status && status.nextActive && (
        <ReactivateStudent
          student={status.student}
          busy={busy}
          description={`${status.student.name} vuelve a agendarse desde hoy. Se reservan sus horarios fijos si hay cupo.`}
          onCancel={() => setStatus(null)}
          onConfirm={(s) => applyStatus(s, true)}
        />
      )}
      {status && !status.nextActive && (
        <DeactivateStudent
          student={status.student}
          busy={busy}
          onCancel={() => setStatus(null)}
          onConfirm={(s) => applyStatus(s, false)}
        />
      )}
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

/**
 * Quick top-up for a monthly student: the whole month in one move instead of
 * tapping "+1" four or eight times. The suggestion comes from the weekly slots
 * (the agenda books four weeks ahead), so the teacher sees which preset matches.
 */
function AddClasses({ student, onClose }: { student: Student; onClose: () => void }) {
  const { adjustBalance, busy } = useStore();
  const perWeek = student.slots.length;
  const monthly = perWeek * 4;
  const hint = (n: number) =>
    n === monthly && perWeek > 0
      ? `${perWeek} ${perWeek === 1 ? "vez" : "veces"} por semana`
      : n === 1
        ? "una clase"
        : "clases";
  const add = async (n: number) => {
    if (!(await adjustBalance(student.id, n))) return;
    toast.success(`Sumaste ${n} ${n === 1 ? "clase" : "clases"} a ${student.name}`, {
      description: balancePhrase(student.balance + n),
      action: { label: "Deshacer", onClick: () => void adjustBalance(student.id, -n) },
    });
    onClose();
  };
  return (
    <Sheet title="Sumar clases" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Cargá el mes de {student.name} en un solo movimiento.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[1, 4, 8].map((n) => (
          <Button
            key={n}
            variant="outline"
            disabled={busy}
            aria-label={`Sumar ${n} ${n === 1 ? "clase" : "clases"}`}
            onClick={() => add(n)}
            className="h-20 flex-col gap-1"
          >
            <span className="text-xl font-semibold tabular-nums">+{n}</span>
            <span className="text-[11px] font-normal text-muted-foreground">{hint(n)}</span>
          </Button>
        ))}
      </div>
    </Sheet>
  );
}

/** Confirms pausing a student: the one row action that removes future classes. */
function DeactivateStudent({ student, busy, onCancel, onConfirm }: {
  student: Student;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (student: Student) => void | Promise<void>;
}) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deshabilitar alumno</AlertDialogTitle>
          <AlertDialogDescription>
            {student.name} deja de agendarse. Se borran sus clases futuras programadas y se libera el cupo. El historial, el saldo y los horarios semanales se conservan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              // Keep the dialog open while the pause runs.
              event.preventDefault();
              void onConfirm(student);
            }}
          >
            Deshabilitar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function StudentEditor({ onClose, onSave, student, busy, notice }: { onClose: () => void; onSave: (s: Omit<Student, "id">) => Promise<string | false>; student?: Student; busy: boolean; notice?: string | undefined }) {
  const { settings, lessons, addLesson } = useStore();
  const [f, setF] = useState<Omit<Student, "id">>(student ?? { name: "", type: "fijo", pay: null, phone: null, category: null, courtSide: null, slots: [], balance: 0, active: true });
  const [booking, setBooking] = useState(false);
  // Turning booking on for a paused student asks to reactivate them in place.
  const [askActive, setAskActive] = useState(false);
  const [date, setDate] = useState(() => iso(new Date()));
  const [start, setStart] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Only a fijo student gets the extra class from here: a rotativo is booked
  // from the agenda. Deriving it (instead of clearing the switch on change) means
  // a date and time chosen before switching the type can never be booked.
  const bookAlso = booking && f.type === "fijo" && f.active;
  const updateSlot = (index: number, patch: Partial<StudentSlot>) =>
    setF({ ...f, slots: f.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)) });
  const addSlot = () => setF({ ...f, slots: [...f.slots, { weekday: 1, time: "" }] });
  const removeSlot = (index: number) => setF({ ...f, slots: f.slots.filter((_, i) => i !== index) });
  // A slot is offered while it still has room for one more student.
  const available = slots(settings).filter((t) => {
    const active = lessons.filter((l) => l.date === date && l.start === t && l.status !== "cancelada").length;
    return canAddToLesson(active);
  });
  async function save() {
    if (submitting || busy) return;
    setSubmitting(true);
    try {
      const id = savedId ?? await onSave({ ...f, name: f.name.trim(), slots: f.slots.filter((slot) => slot.time !== ""), balance: Math.trunc(f.balance) });
      if (!id) return;
      setSavedId(id);
      if (bookAlso && !await addLesson({ date, start, studentId: id })) return;
      onClose();
    } finally { setSubmitting(false); }
  }
  const seg = <K extends "type" | "pay">(k: K, opts: Array<{ value: Student[K]; label: string }>) => (
    <div className={`grid gap-2 ${opts.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {opts.map((o) => (
        <Button variant="ghost" key={o.label} onClick={() => setF({ ...f, [k]: o.value })} className={`h-11 rounded-lg px-2 text-[13px] font-semibold leading-tight ${f[k] === o.value ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>{o.label}</Button>
      ))}
    </div>
  );
  return (
    <Sheet title={student ? "Editar alumno" : "Nuevo alumno"} onClose={onClose}>
      <div className="space-y-4">
        {notice && (
          <p role="status" className="rounded-lg border border-court/30 bg-court/5 p-3 text-sm font-medium text-foreground">
            {notice}
          </p>
        )}
        <fieldset disabled={submitting || busy || Boolean(savedId)} className="space-y-4">
        <input aria-label="Nombre y apellido" placeholder="Nombre y apellido" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]" />
        <input type="tel" inputMode="tel" aria-label="Teléfono" placeholder="Teléfono (opcional)" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value === "" ? null : e.target.value })} className="h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]" />
        {seg("type", [{ value: "fijo", label: "Fijo" }, { value: "rotativo", label: "Rotativo" }])}
        {seg("pay", [...PAY_MODES.map((mode) => ({ value: mode, label: payLabel(mode) })), { value: null, label: payLabel(null) }])}
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
        {student && <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="min-w-0">
            <label htmlFor="student-active" className="text-sm font-semibold">Alumno activo</label>
            <p className="text-xs text-muted-foreground">
              {f.active
                ? "Se agendan sus horarios fijos."
                : "No se agendan clases nuevas. El horario, el historial y el saldo se conservan."}
            </p>
          </div>
          <Switch id="student-active" checked={f.active} disabled={submitting || busy || Boolean(savedId)} onCheckedChange={(value) => {
            setF({ ...f, active: value });
            // A paused student cannot keep a booking half-configured.
            if (!value) setBooking(false);
          }} />
        </div>}
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-semibold">Horarios semanales</p>
          {f.slots.map((slot, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <label className="block text-sm font-semibold">Día
                <select
                  aria-label={`Día del horario ${index + 1}`}
                  value={slot.weekday}
                  onChange={(e) => updateSlot(index, { weekday: Number(e.target.value) })}
                  className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]"
                >
                  {WEEKDAYS.map((day, value) => <option key={day} value={value}>{day}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold">Hora
                <select
                  aria-label={`Hora del horario ${index + 1}`}
                  value={slot.time}
                  onChange={(e) => updateSlot(index, { time: e.target.value })}
                  className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]"
                >
                  <option value="">Elegir hora</option>
                  {slots(settings).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <Button variant="ghost" aria-label={`Quitar horario ${index + 1}`} onClick={() => removeSlot(index)} className="h-12 w-12 text-lg text-muted-foreground">×</Button>
            </div>
          ))}
          <Button variant="outline" onClick={addSlot} className="h-11 w-full">Agregar horario</Button>
          <p className="text-xs text-muted-foreground">
            {f.type === "fijo"
              ? "Se agenda solo cada horario, hasta 4 semanas adelante. Mover una clase puntual no cambia el horario."
              : "Quedan como horario habitual: no se agendan solos, la agenda los sugiere."}
          </p>
        </div>
        </fieldset>
        {f.type === "fijo" && <div className="flex items-center justify-between gap-3 border-t border-border pt-4"><label htmlFor="student-booking" className="text-sm font-semibold">Agregar clase a la agenda</label><Switch id="student-booking" checked={bookAlso} disabled={submitting || busy} onCheckedChange={(value) => {
          if (value && !f.active) { setAskActive(true); return; }
          setBooking(value);
        }} /></div>}
        {bookAlso && <div className="space-y-3">
          <label className="block text-sm font-semibold">Día de la clase<input type="date" value={date} disabled={submitting || busy} onChange={e => { setDate(e.target.value); setStart(""); }} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]" /></label>
          <label className="block text-sm font-semibold">Horario<select value={start} disabled={submitting || busy} onChange={e => setStart(e.target.value)} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]"><option value="">Elegir horario</option>{available.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          {available.length === 0 && <p role="status" className="text-sm text-destructive">No hay horarios libres para este día.</p>}
        </div>}
        {savedId && <p role="status" className="text-sm text-muted-foreground">Alumno guardado. Falta confirmar la reserva.</p>}
        <Button variant="ghost" disabled={submitting || busy || !f.name.trim() || f.slots.some((slot) => slot.time === "") || (bookAlso && (!date || !available.includes(start)))} onClick={save} className="h-12 w-full text-[15px] disabled:opacity-40">{submitting || busy ? "Guardando…" : bookAlso ? "Guardar y reservar" : "Guardar"}</Button>
      </div>
      <ReactivateStudent
        student={askActive ? (student ?? null) : null}
        busy={submitting || busy}
        onCancel={() => setAskActive(false)}
        onConfirm={() => {
          // Local until the form is saved: one transaction reactivates and books.
          setF({ ...f, active: true });
          setBooking(true);
          setAskActive(false);
        }}
      />
    </Sheet>
  );
}
