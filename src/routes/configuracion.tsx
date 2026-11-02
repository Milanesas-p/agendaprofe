import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, slots, type Settings } from "@/lib/store";
import { validSettings } from "@/lib/rules";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Configuración — Pádel Pro" },
      { name: "description", content: "Tu cuenta, tus horarios de trabajo y el tema de la app." },
      { property: "og:title", content: "Configuración — Pádel Pro" },
      { property: "og:description", content: "Cuenta, horarios con corte y modo oscuro." },
    ],
  }),
  component: Configuracion,
});

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** Hours that fall on a block boundary between the opening and closing hour. */
function boundaries(s: Settings): number[] {
  const out: number[] = [];
  for (let m = s.startHour * 60; m <= s.endHour * 60; m += s.blockMin) {
    if (m % 60 === 0) out.push(m / 60);
  }
  return out.filter((h) => h > s.startHour && h < s.endHour);
}

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

function Configuracion() {
  const { user, settings, setSettings, updateProfile, signOut, busy } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<Settings>(settings);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => { setName(user?.name ?? ""); }, [user?.name]);
  useEffect(() => { setDraft(settings); }, [settings]);
  useEffect(() => { setTheme(readTheme()); }, []);

  const froms = boundaries(draft);
  const tos = boundaries(draft).filter((h) => draft.breakStart !== null && h > draft.breakStart);
  const settingsOk = validSettings(draft);
  const breakChosen = draft.breakStart !== null && draft.breakEnd !== null;

  function chooseTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  async function saveHours() {
    if (await setSettings({ ...draft, breakStart: breakChosen ? draft.breakStart : null, breakEnd: breakChosen ? draft.breakEnd : null })) navigate({ to: "/" });
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-xl lg:px-6">
        <Button variant="ghost" aria-label="Volver a la agenda" onClick={() => navigate({ to: "/" })} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">Configuración</h1>
      </header>

      <div className="space-y-3 p-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:p-6">
        <Section title="Tu cuenta">
          <label className="block text-sm font-semibold">Nombre y apellido
            <input
              aria-label="Nombre y apellido del profesor"
              placeholder="Cómo querés que te llame la app"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none"
            />
          </label>
          <p className="mt-2 truncate text-sm text-muted-foreground">{user?.email}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={busy || name.trim() === "" || name.trim() === (user?.name ?? "")} onClick={() => updateProfile(name.trim())} className="h-11">Guardar nombre</Button>
            <Button variant="outline" disabled={busy} onClick={async () => { await signOut(); navigate({ to: "/" }); }} className="h-11 text-destructive"><LogOut className="h-4 w-4" />Salir</Button>
          </div>
        </Section>

        <Section title="Horarios de trabajo">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm font-semibold">Abre
              <select aria-label="Hora de apertura" value={draft.startHour} onChange={(e) => setDraft({ ...draft, startHour: Number(e.target.value), breakStart: null, breakEnd: null })} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]">
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Cierra
              <select aria-label="Hora de cierre" value={draft.endHour} onChange={(e) => setDraft({ ...draft, endHour: Number(e.target.value), breakStart: null, breakEnd: null })} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]">
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Corte desde
              <select aria-label="Inicio del corte" value={draft.breakStart ?? ""} onChange={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); setDraft({ ...draft, breakStart: v, breakEnd: v === null ? null : draft.breakEnd }); }} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]">
                <option value="">Sin corte</option>
                {froms.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Corte hasta
              <select aria-label="Fin del corte" value={draft.breakEnd ?? ""} disabled={draft.breakStart === null} onChange={(e) => setDraft({ ...draft, breakEnd: e.target.value === "" ? null : Number(e.target.value) })} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px] disabled:opacity-50">
                <option value="">Elegir hora</option>
                {tos.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </label>
            <label className="col-span-2 block text-sm font-semibold">Duración de cada clase
              <select aria-label="Duración de cada clase" value={draft.blockMin} onChange={(e) => setDraft({ ...draft, blockMin: Number(e.target.value), breakStart: null, breakEnd: null })} className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px]">
                {[30, 45, 60, 75, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </label>
          </div>
          {!settingsOk && <p role="alert" className="mt-2 text-sm text-destructive">Revisá las horas: el corte tiene que entrar en la jornada y caer en un bloque.</p>}
          <Button disabled={busy || !settingsOk} onClick={saveHours} className="mt-3 h-12 w-full">Guardar horarios</Button>
        </Section>

        <Section title="Apariencia" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2">
            {([["light", "Claro", Sun], ["dark", "Oscuro", Moon]] as const).map(([value, label, Icon]) => (
              <Button variant="ghost" key={value} aria-pressed={theme === value} onClick={() => chooseTheme(value)} className={`h-12 ${theme === value ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                <Icon className="h-4 w-4" />{label}
              </Button>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
