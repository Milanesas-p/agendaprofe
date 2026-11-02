import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useStore, balanceLabel } from "@/lib/store";

export const Route = createFileRoute("/resumen")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Resumen — Pádel Pro" },
      { name: "description", content: "Historial de ausencias, clases tomadas y balances." },
      { property: "og:title", content: "Resumen — Pádel Pro" },
      { property: "og:description", content: "Reportes de asistencia y saldos de tus alumnos." },
    ],
  }),
  component: Resumen,
});

function Resumen() {
  const { lessons, students } = useStore();
  const present = lessons.filter((l) => l.status === "presente");
  const absent = lessons.filter((l) => l.status === "ausente");
  const debt = students.filter((s) => s.balance < 0).reduce((a, s) => a + s.balance, 0);
  const credit = students.filter((s) => s.balance > 0).reduce((a, s) => a + s.balance, 0);
  const name = (id: string) => students.find((s) => s.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader sub="Control" title="Resumen" />
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4 lg:px-6">
        <Stat label="Tomadas" value={present.length} />
        <Stat label="Ausencias" value={absent.length} tone="text-destructive" />
        <Stat label="A favor" value={`+${credit}`} tone="text-court" />
        <Stat label="Adeudadas" value={debt} tone="text-destructive" />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:px-6">
        <Section title="Por alumno">
        <table className="w-full text-left">
          <thead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><tr><th className="py-2">Alumno</th><th>Pres.</th><th>Aus.</th><th className="text-right">Saldo</th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t border-border text-sm">
                <td className="py-3 font-semibold text-foreground">{s.name}</td>
                <td className="tabular-nums">{present.filter((l) => l.studentId === s.id).length}</td>
                <td className="tabular-nums text-destructive">{absent.filter((l) => l.studentId === s.id).length}</td>
                <td className={`text-right font-semibold tabular-nums ${s.balance < 0 ? "text-destructive" : s.balance > 0 ? "text-court" : "text-muted-foreground"}`}>{balanceLabel(s.balance)}</td>
              </tr>
            ))}
            {students.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Todavía no hay alumnos.</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section title="Historial de ausencias">
        <ul className="space-y-2">
          {absent.sort((a, b) => b.date.localeCompare(a.date)).map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-3 rounded-lg bg-destructive/5 px-3 py-2">
              <span className="min-w-0 truncate text-sm font-semibold text-foreground">{name(l.studentId)}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{l.date.slice(8)}/{l.date.slice(5, 7)} · {l.start}</span>
            </li>
          ))}
          {absent.length === 0 && <p className="text-sm text-muted-foreground">Sin ausencias.</p>}
        </ul>
      </Section>
      </div>
    </>
  );
}

const Stat = ({ label, value, tone = "text-foreground" }: { label: string; value: number | string; tone?: string }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`mt-1 text-3xl font-semibold leading-none tabular-nums ${tone}`}>{value}</p>
  </div>
);
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mx-4 mb-6 border-t border-border pt-4 lg:mx-0">
    <h2 className="mb-2 text-base font-semibold text-foreground">{title}</h2>
    {children}
  </section>
);
