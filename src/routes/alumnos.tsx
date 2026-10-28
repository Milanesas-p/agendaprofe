import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Minus, UserPlus, Search, Pencil } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Sheet } from "@/components/Sheet";
import { matchesStudent } from "@/lib/agenda";
import { useStore, balanceLabel, type Student } from "@/lib/store";

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
        <Button variant="ghost" onClick={() => setNuevo(true)} aria-label="Nuevo alumno" className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground"><UserPlus className="h-6 w-6" /></Button>
      } />
      <label className="mx-4 mt-4 flex items-center gap-2 rounded-lg border-2 border-border px-3"><Search className="h-5 w-5 shrink-0 text-muted-foreground" /><input type="search" aria-label="Buscar alumno" placeholder="Buscar alumno" value={search} onChange={e => setSearch(e.target.value)} className="h-12 w-full min-w-0 bg-transparent outline-none" /></label>
      <div className="flex gap-2 overflow-x-auto px-4 pt-4">
        {(["todos", "fijo", "rotativo", "deuda"] as const).map((f) => (
          <Button variant="ghost" key={f} onClick={() => setFilter(f)} className={`h-11 shrink-0 rounded-full border-2 border-foreground px-5 font-bold capitalize ${filter === f ? "bg-foreground text-background" : ""}`}>{f}</Button>
        ))}
      </div>
      <ul className="space-y-3 p-4">
        {list.length === 0 && <li className="py-8 text-center text-muted-foreground">{loading ? "Cargando alumnos…" : search ? "No hay coincidencias." : "No hay alumnos en esta lista."}</li>}
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-xl border-2 border-foreground bg-card p-3">
            <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-xl font-display text-3xl ${s.balance > 0 ? "bg-success text-success-foreground" : s.balance < 0 ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}>
              {balanceLabel(s.balance)}
            </div>
            <div className="min-w-0 flex-1">
              <Button variant="ghost" aria-label={`Editar ${s.name}`} onClick={() => setEditing(s)} className="h-auto w-full justify-start px-0 py-1 text-lg font-bold"><span className="truncate">{s.name}</span><Pencil className="shrink-0 text-muted-foreground" /></Button>
              <div className="mt-1 flex gap-1.5">
                <Tag>{s.type}</Tag><Tag>{s.pay}</Tag>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Button variant="ghost" disabled={busy} aria-label="Sumar clase" onClick={() => adjustBalance(s.id, 1)} className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground"><Plus /></Button>
              <Button variant="ghost" disabled={busy} aria-label="Restar clase" onClick={() => adjustBalance(s.id, -1)} className="grid h-10 w-10 place-items-center rounded-lg border-2 border-foreground"><Minus /></Button>
            </div>
          </li>
        ))}
      </ul>
      {nuevo && <StudentEditor busy={busy} onClose={() => setNuevo(false)} onSave={async s => { if (await addStudent(s)) setNuevo(false); }} />}
      {editing && <StudentEditor busy={busy} student={editing} onClose={() => setEditing(null)} onSave={async s => { if (await updateStudent(editing.id, s)) setEditing(null); }} />}
    </>
  );
}

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md bg-court px-2 py-0.5 text-xs font-bold uppercase text-court-foreground">{children}</span>
);

function StudentEditor({ onClose, onSave, student, busy }: { onClose: () => void; onSave: (s: Omit<Student, "id">) => Promise<void>; student?: Student; busy: boolean }) {
  const [f, setF] = useState<Omit<Student, "id">>(student ?? { name: "", type: "fijo", pay: "mensual", balance: 0 });
  const seg = <K extends "type" | "pay">(k: K, opts: Student[K][]) => (
    <div className="grid grid-cols-2 gap-2">
      {opts.map((o) => (
        <Button variant="ghost" key={o} onClick={() => setF({ ...f, [k]: o })} className={`h-12 rounded-xl border-2 border-foreground font-bold capitalize ${f[k] === o ? "bg-foreground text-background" : ""}`}>{o}</Button>
      ))}
    </div>
  );
  return (
    <Sheet title={student ? "Editar alumno" : "Nuevo alumno"} onClose={onClose}>
      <div className="space-y-4">
        <input aria-label="Nombre y apellido" placeholder="Nombre y apellido" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-14 w-full rounded-xl border-2 border-foreground bg-background px-4 text-lg" />
        {seg("type", ["fijo", "rotativo"])}
        {seg("pay", ["mensual", "semanal"])}
        {!student && <label className="block font-bold">Saldo inicial (clases)
          <input type="number" value={f.balance} onChange={(e) => setF({ ...f, balance: Number(e.target.value) || 0 })} className="mt-1 h-14 w-full rounded-xl border-2 border-foreground bg-background px-4 text-lg" />
        </label>}
        <Button variant="ghost" disabled={busy || !f.name.trim()} onClick={() => onSave({ ...f, name: f.name.trim(), balance: Math.trunc(f.balance) })} className="h-14 w-full rounded-xl bg-primary font-display text-2xl text-primary-foreground disabled:opacity-40">{busy ? "Guardando…" : "Guardar"}</Button>
      </div>
    </Sheet>
  );
}
