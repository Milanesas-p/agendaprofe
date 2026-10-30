import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";

/**
 * First-session walkthrough.
 *
 * Four bubbles anchored to things that always exist on the agenda, so the tour
 * cannot get stuck on a day without classes. It shows only while the account has
 * no `tour_done_at`; finishing or skipping writes that column once.
 */

type Step = { target: string; title: string; text: string };

const STEPS: Step[] = [
  {
    target: "date",
    title: "Elegí el día",
    text: "Desde acá te movés entre días. La tira de arriba te dice cuántas clases tiene cada uno.",
  },
  {
    target: "add",
    title: "Reservá una clase",
    text: "El botón del medio abre el alta de una clase nueva, paso a paso: alumno, día y horario.",
  },
  {
    target: "notices",
    title: "Avisos por WhatsApp",
    text: "Ves las clases de los próximos 3 días y abrís el chat de cada alumno con el mensaje ya escrito.",
  },
  {
    target: "students",
    title: "Tus alumnos",
    text: "El directorio: saldo, perfil y horario fijo de cada uno. También podés importarlos desde una lista.",
  },
];

export function Tour() {
  const { user, finishTour, busy } = useStore();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const open = Boolean(user) && user?.tourDone === false;
  const step = STEPS[index];

  useEffect(() => {
    if (!open || !step) return;
    const measure = () => {
      const target = document.querySelector(`[data-tour="${step.target}"]`);
      if (!target) {
        setBox(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setBox({ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  if (!open || !step) return null;

  const last = index === STEPS.length - 1;
  const advance = () => {
    if (last) void finishTour();
    else setIndex(index + 1);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Tour de bienvenida" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-foreground/55" />
      {box && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-court"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      )}
      <div className="absolute inset-x-4 bottom-24 rounded-xl border border-border bg-card p-4 shadow-xl">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {index + 1} de {STEPS.length}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{step.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => void finishTour()} className="h-11 px-2 text-muted-foreground">
            Saltear
          </Button>
          <Button disabled={busy} onClick={advance} className="h-11 px-5">
            {last ? "Entendido" : "Siguiente"}
          </Button>
        </div>
      </div>
    </div>
  );
}
