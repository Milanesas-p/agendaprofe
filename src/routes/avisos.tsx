import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iso, useStore } from "@/lib/store";
import {
  DEFAULT_NOTICE_TEMPLATE,
  NOTICE_DAYS,
  dayLabel,
  nextDays,
  noticeText,
  upcomingNotices,
} from "@/lib/notices";
import { whatsappLink } from "@/lib/whatsapp";

export const Route = createFileRoute("/avisos")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Avisos — Pádel Pro" },
      { name: "description", content: "Los alumnos con clase en los próximos días, con el aviso de WhatsApp listo." },
      { property: "og:title", content: "Avisos — Pádel Pro" },
      { property: "og:description", content: "Recordatorios de WhatsApp para las clases que vienen." },
    ],
  }),
  component: Avisos,
});

/** Mirrors the `notice_template` column, so the field cannot overflow the row. */
const TEMPLATE_MAX = 400;

function Avisos() {
  const { students, lessons, settings, setNoticeTemplate, busy } = useStore();
  const saved = settings.noticeTemplate ?? DEFAULT_NOTICE_TEMPLATE;
  const [today, setToday] = useState("");
  const [draft, setDraft] = useState(saved);

  // Today is browser-local: a server render would guess another timezone.
  useEffect(() => { setToday(iso(new Date())); }, []);
  useEffect(() => { setDraft(settings.noticeTemplate ?? DEFAULT_NOTICE_TEMPLATE); }, [settings.noticeTemplate]);

  const days = today ? nextDays(today, NOTICE_DAYS) : [];
  const entries = today ? upcomingNotices(lessons, students, today, NOTICE_DAYS) : [];
  const edited = draft.trim() !== saved.trim();
  // The link uses what is on screen, so editing the template previews the message
  // even before saving it.
  const message = (e: (typeof entries)[number]) => noticeText(draft, e.student, e.date, e.start);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-xl">
        <Button asChild variant="ghost" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <Link to="/" aria-label="Volver a la agenda"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">Avisos</h1>
      </header>

      <div className="space-y-3 p-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Plantilla del aviso</h2>
          <label className="block text-sm font-semibold">
            <span className="sr-only">Plantilla del aviso</span>
            <textarea
              aria-label="Plantilla del aviso"
              value={draft}
              maxLength={TEMPLATE_MAX}
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[15px] leading-relaxed outline-none"
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Variables: <code>[nombre]</code> <code>[dia]</code> <code>[hora]</code>. WhatsApp te deja editar el mensaje antes de enviarlo.
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">{draft.trim().length}/{TEMPLATE_MAX}</span>
            <Button disabled={busy || !edited || draft.trim() === ""} onClick={() => setNoticeTemplate(draft.trim())} className="h-11">
              Guardar plantilla
            </Button>
          </div>
        </section>

        {today && entries.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No hay clases en los próximos {NOTICE_DAYS} días.
          </p>
        )}

        {days.map((date, i) => {
          const rows = entries.filter((e) => e.date === date);
          if (rows.length === 0) return null;
          return (
            <section key={date} className="overflow-hidden rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {i === 0 ? "Mañana · " : ""}{dayLabel(date)}
              </h2>
              <ul>
                {rows.map((e) => {
                  const link = whatsappLink(e.student.phone, message(e));
                  return (
                    <li key={`${e.date}-${e.start}-${e.student.id}`} className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-b-0">
                      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-foreground">{e.start}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{e.student.name}</span>
                      {link ? (
                        <Button asChild variant="ghost" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-court hover:bg-court/10">
                          <a href={link} target="_blank" rel="noopener noreferrer" aria-label={`Recordar por WhatsApp a ${e.student.name}`}>
                            <MessageCircle className="h-5 w-5" />
                          </a>
                        </Button>
                      ) : (
                        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sin teléfono</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
