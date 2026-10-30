import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";

/**
 * First-session walkthrough.
 *
 * Four bubbles anchored to things that always exist on the agenda, so the tour
 * cannot get stuck on a day without classes. It shows only while the account has
 * no `tour_done_at`; finishing or skipping writes that column once.
 *
 * The dim is painted as a huge shadow around the hole, so the target keeps its
 * real brightness instead of sitting under a flat veil: the teacher sees exactly
 * which control the bubble is talking about.
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

type Hole = { top: number; left: number; width: number; height: number };

/** Margin around the target so the ring never sits on top of the control. */
const PAD = 8;
/** The bubbles stay clear of the thumb zone while the target is down there. */
const DIM = "0 0 0 100vmax color-mix(in oklab, var(--foreground) 55%, transparent)";

export function Tour() {
  const { user, finishTour, busy } = useStore();
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState<Hole | null>(null);

  const open = Boolean(user) && user?.tourDone === false;
  const step = STEPS[index];

  useEffect(() => {
    if (!open || !step) return;
    setHole(null);
    let frame = 0;
    let stopped = false;

    const measure = () => {
      const target = document.querySelector(`[data-tour="${step.target}"]`);
      if (!target) return false;
      const rect = target.getBoundingClientRect();
      const next = {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      };
      setHole((prev) =>
        prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
      return true;
    };

    // The agenda paints after the session resolves, so the anchor may not exist
    // yet on the first frame of step 1. Keep looking for a bounded moment.
    const look = () => {
      if (stopped) return;
      if (!measure() && frame < 300) frame = requestAnimationFrame(look);
    };
    look();

    const onViewportChange = () => measure();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, step]);

  if (!open || !step) return null;

  const last = index === STEPS.length - 1;
  const advance = () => {
    if (last) void finishTour();
    else setIndex(index + 1);
  };
  // The bubble goes to the opposite half, so it never covers the control it names.
  const atTop = hole ? hole.top + hole.height / 2 > window.innerHeight / 2 : false;

  return (
    <div role="dialog" aria-modal="true" aria-label="Tour de bienvenida" className="fixed inset-0 z-50">
      {hole ? (
        <div
          aria-hidden
          data-tour-spotlight
          className="pointer-events-none absolute rounded-2xl ring-2 ring-court"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, boxShadow: DIM }}
        />
      ) : (
        // Before the anchor exists (or between steps) the veil alone keeps the
        // screen modal, so the tour never flashes a see-through background.
        <div aria-hidden className="absolute inset-0 bg-foreground/55" />
      )}
      <div
        className={`absolute inset-x-4 rounded-xl border border-border bg-card p-4 shadow-xl ${atTop ? "top-4" : "bottom-24"}`}
      >
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
