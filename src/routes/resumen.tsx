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
      <div className="grid grid-cols-2 gap-3 p-4">
        <Stat label="Tomadas" value={present.length} cls="bg-success text-success-foreground" />
        <Stat label="Ausencias" value={absent.length} cls="bg-destructive text-destructive-foreground" />
        <Stat label="A favor" value={`+${credit}`} cls="bg-primary text-primary-foreground" />
        <Stat label="Adeudadas" value={debt} cls="bg-court text-court-foreground" />
      </div>

      <Section title="Por alumno">
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-muted-foreground"><tr><th className="py-1">Alumno</th><th>Pres.</th><th>Aus.</th><th className="text-right">Saldo</th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t-2 border-border font-semibold">
                <td className="py-3">{s.name}</td>
                <td>{present.filter((l) => l.studentId === s.id).length}</td>
                <td className="text-destructive">{absent.filter((l) => l.studentId === s.id).length}</td>
                <td className={`text-right font-display text-xl ${s.balance < 0 ? "text-destructive" : "text-success"}`}>{balanceLabel(s.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Historial de ausencias">
        <ul className="space-y-2">
          {absent.sort((a, b) => b.date.localeCompare(a.date)).map((l) => (
            <li key={l.id} className="flex justify-between rounded-lg border-l-4 border-destructive bg-destructive/10 px-3 py-2 font-semibold">
              <span>{name(l.studentId)}</span>
              <span className="text-muted-foreground">{l.date.slice(8)}/{l.date.slice(5, 7)} · {l.start}</span>
            </li>
          ))}
          {absent.length === 0 && <p className="text-muted-foreground">Sin ausencias 🎾</p>}
        </ul>
      </Section>
    </>
  );
}

const Stat = ({ label, value, cls }: { label: string; value: number | string; cls: string }) => (
  <div className={`rounded-xl border-2 border-foreground p-4 ${cls}`}>
    <p className="text-sm font-bold uppercase">{label}</p>
    <p className="font-display text-5xl leading-none">{value}</p>
  </div>
);
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mx-4 mb-6 border-t-2 border-foreground pt-4">
    <h2 className="mb-2 font-display text-2xl">{title}</h2>
    {children}
  </section>
);
