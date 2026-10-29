import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { useStore, iso } from "@/lib/store";

/**
 * Top bar: who is signed in and how the day looks. Signing out and every
 * preference live in the settings screen, which this bar is the entry to.
 *
 * The daily counts are computed after hydration on purpose: the current local
 * date does not exist during server rendering, and comparing two different
 * "todays" would desync the markup.
 */
export function Account() {
  const { user, students, lessons } = useStore();
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    const today = iso(new Date());
    const classes = new Set(lessons.filter((l) => l.date === today && l.status !== "cancelada").map((l) => l.start)).size;
    setSummary(`${students.length} ${students.length === 1 ? "alumno" : "alumnos"} · ${classes} ${classes === 1 ? "clase hoy" : "clases hoy"}`);
  }, [students, lessons]);

  if (!user) return null;

  const displayName = user.name?.trim() || user.email.split("@")[0] || "Mi cuenta";

  return (
    <div className="account-bar">
      <Link to="/configuracion" aria-label="Configuración" className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <UserRound className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{displayName}</span>
          <span className="block truncate text-[11px] font-semibold text-muted-foreground">{summary ?? " "}</span>
        </span>
      </Link>
    </div>
  );
}
