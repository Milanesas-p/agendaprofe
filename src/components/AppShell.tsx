import { Account } from "@/components/Account";
import { initTheme } from "@/lib/theme";
import { LoginScreen } from "@/components/LoginScreen";
import { Link, Outlet } from "@tanstack/react-router";
import { CalendarDays, Users, Plus } from "lucide-react";
import { useStore } from "@/lib/store";

// Before the first paint: a dark session never flashes the light theme.
initTheme();

export function AppShell() {
  const { user, loading } = useStore();

  // Login is the only entry point: nothing of the app renders without a session.
  if (loading) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center bg-background text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Cargando…
      </div>
    );
  }
  if (!user) return <LoginScreen />;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <Account />
      <main className="flex-1 pb-28">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <ul className="grid grid-cols-3 items-center">
          <li>
            <Link
              to="/"
              activeOptions={{ exact: true }}
              className="flex h-16 flex-col items-center justify-center gap-1 text-muted-foreground data-[status=active]:text-foreground"
            >
              <CalendarDays className="h-6 w-6" strokeWidth={1.75} />
              <span className="text-[11px] font-semibold">Agenda</span>
            </Link>
          </li>
          <li className="flex justify-center">
            <Link
              to="/nueva-clase"
              aria-label="Nueva clase"
              className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(28,28,26,0.18)] transition-opacity active:opacity-85"
            >
              <Plus className="h-6 w-6" />
            </Link>
          </li>
          <li>
            <Link
              to="/alumnos"
              activeOptions={{ exact: true }}
              className="flex h-16 flex-col items-center justify-center gap-1 text-muted-foreground data-[status=active]:text-foreground"
            >
              <Users className="h-6 w-6" strokeWidth={1.75} />
              <span className="text-[11px] font-semibold">Alumnos</span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex items-end justify-between gap-3 border-b border-border bg-background/90 px-4 pb-3 pt-4 backdrop-blur-xl">
      <div className="min-w-0">
        {sub && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{sub}</p>}
        <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      </div>
      {right}
    </header>
  );
}
