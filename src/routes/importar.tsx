import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { slots, useStore, type ImportedStudent } from "@/lib/store";
import { parseStudents } from "@/lib/import";
import { profileLabel } from "@/lib/player";
import { weeklySlotLabel } from "@/lib/agenda";

export const Route = createFileRoute("/importar")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Importar alumnos — Pádel Pro" },
      { name: "description", content: "Pegá una lista de alumnos y dalos de alta de una vez." },
      { property: "og:title", content: "Importar alumnos — Pádel Pro" },
      { property: "og:description", content: "Pegá las filas copiadas de Excel o Sheets y revisá antes de guardar." },
    ],
  }),
  component: Importar,
});

const PLACEHOLDER = [
  "nombre\ttelefono\ttipo\tpago\tcategoria\tposicion\tdia\thora",
  "Maxi Salas\t2302666351\tfijo\tmensual\t8va\treves\tlunes\t14:00",
].join("\n");

function Importar() {
  const { settings, importStudents, busy } = useStore();
  const navigate = useNavigate();
  const [text, setText] = useState("");

  // The blocks decide whether a weekly slot can ever become a class.
  const report = useMemo(() => parseStudents(text, { allowedSlots: slots(settings) }), [text, settings]);
  const ready = report.rows.length === 0 ? [] : report.ready;
  const broken = report.rows.length - ready.length;

  async function run() {
    const rows = ready.map<ImportedStudent>(({ line: _line, error: _error, ...student }) => student);
    const count = await importStudents(rows);
    if (count === false) return;
    toast.success(count === 1 ? "Se importó 1 alumno." : `Se importaron ${count} alumnos.`);
    navigate({ to: "/alumnos" });
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-xl lg:px-6">
        <Button asChild variant="ghost" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <Link to="/alumnos" aria-label="Volver a alumnos"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">Importar alumnos</h1>
      </header>

      <div className="space-y-3 p-4 lg:mx-auto lg:grid lg:w-full lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-6 lg:p-6">
        <div className="space-y-3">
        <section className="rounded-xl border border-border bg-card p-4">
          <label className="block text-sm font-semibold">
            Pegá la lista
            <textarea
              aria-label="Alumnos pegados"
              value={text}
              rows={6}
              placeholder={PLACEHOLDER}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Copiá las filas desde Excel o Sheets y pegalas acá. La primera fila trae los títulos:
            <span className="font-semibold text-foreground"> nombre</span> es lo único obligatorio; también podés sumar
            telefono, tipo, pago, categoria, posicion, dia y hora.
          </p>
        </section>

        {report.error && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{report.error}</p>
        )}
        </div>

        <div className="space-y-3">
        {report.rows.length > 0 && (
          <>
            <div className="flex items-baseline justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Previsualización</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {ready.length} {ready.length === 1 ? "listo" : "listos"} · {broken} con problemas
              </span>
            </div>
            <ul className="space-y-2">
              {report.rows.map((row) => {
                const detail = [profileLabel(row), weeklySlotLabel(row)].filter(Boolean).join(" · ");
                return (
                  <li key={row.line} className={`rounded-xl border p-3 ${row.error ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">L{row.line}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{row.name || "—"}</span>
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {row.phone ?? "Sin teléfono"}
                      </span>
                    </div>
                    {detail && <p className="mt-1 pl-6 text-xs text-muted-foreground">{detail}</p>}
                    {row.error && <p className="mt-1 pl-6 text-xs font-semibold text-destructive">{row.error}</p>}
                  </li>
                );
              })}
            </ul>
            <Button disabled={busy || ready.length === 0} onClick={run} className="h-12 w-full">
              Importar {ready.length} {ready.length === 1 ? "alumno" : "alumnos"}
            </Button>
          </>
        )}
        </div>
      </div>
    </>
  );
}
