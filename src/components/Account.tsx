import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Moon, Sun, UserRound } from "lucide-react";
import { useStore, iso } from "@/lib/store";
import { greeting } from "@/lib/greeting";
import { applyTheme, onThemeChange, readTheme, type Theme } from "@/lib/theme";

/**
 * Top bar: who is signed in and how the day looks. Signing out and every
 * preference live in the settings screen, which this bar is the entry to.
 *
 * The daily counts and the greeting are computed after hydration on purpose: the
 * current local date and hour do not exist during server rendering, and
 * comparing two different "todays" would desync the markup.
 */
export function Account() {
  const { user, students, lessons } = useStore();
  const [summary, setSummary] = useState<string | null>(null);
  const [hello, setHello] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const today = iso(new Date());
    const classes = new Set(
      lessons.filter((l) => l.date === today && l.status !== "cancelada").map((l) => l.start),
    ).size;
    setSummary(
      `${students.length} ${students.length === 1 ? "alumno" : "alumnos"} · ${classes} ${classes === 1 ? "clase hoy" : "clases hoy"}`,
    );
  }, [students, lessons]);

  useEffect(() => {
    setHello(greeting(new Date().getHours()));
  }, []);

  // The bar and the first-run prompt both change the theme; keep them in sync.
  useEffect(() => {
    setTheme(readTheme());
    return onThemeChange(() => setTheme(readTheme()));
  }, []);

  if (!user) return null;

  const displayName = user.name?.trim() || user.email.split("@")[0] || "Mi cuenta";
  // The greeting is for the person, not the full legal name in the settings.
  const firstName = displayName.split(/\s+/)[0] ?? displayName;

  return (
    <div className="account-bar">
      <Link
        to="/configuracion"
        aria-label="Configuración"
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <UserRound className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">
            {hello ? `${hello}, ${firstName}` : displayName}
          </span>
          <span className="block truncate text-[11px] font-semibold text-muted-foreground">
            {summary ?? " "}
          </span>
        </span>
      </Link>
      <div
        role="group"
        aria-label="Tema"
        className="ml-2 flex shrink-0 items-center gap-1 rounded-full bg-muted p-1"
      >
        <button
          type="button"
          aria-label="Tema claro"
          aria-pressed={theme === "light"}
          onClick={() => applyTheme("light")}
          className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${theme === "light" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          <Sun className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Tema oscuro"
          aria-pressed={theme === "dark"}
          onClick={() => applyTheme("dark")}
          className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${theme === "dark" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          <Moon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
