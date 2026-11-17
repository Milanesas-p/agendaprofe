import { Account } from "@/components/Account";
import { LoadingScreen } from "@/components/LoadingScreen";
import { initTheme } from "@/lib/theme";
import { LoginScreen } from "@/components/LoginScreen";
import { Link, Outlet } from "@tanstack/react-router";
import { BarChart3, Bell, CalendarDays, Plus, Settings, Users } from "lucide-react";
import { useStore } from "@/lib/store";

// Before the first paint: a dark session never flashes the light theme.
initTheme();

// One source for both navigations: the desktop sidebar and the mobile tab bar.
const NAV_ITEMS = [
  { to: "/", label: "Agenda", icon: CalendarDays, exact: true },
  { to: "/alumnos", label: "Alumnos", icon: Users, exact: true },
  { to: "/avisos", label: "Avisos", icon: Bell, exact: true },
  { to: "/resumen", label: "Resumen", icon: BarChart3, exact: true },
  { to: "/configuracion", label: "Configuración", icon: Settings, exact: true },
] as const;

function DesktopSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="px-6 pb-5 pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pádel Pro
        </p>
        <p className="text-xl font-semibold tracking-tight text-foreground">Clases y alumnos</p>
      </div>
      <nav aria-label="Navegación lateral" className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground"
              >
                <item.icon className="h-5 w-5" strokeWidth={1.75} />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-3">
        <Link
          to="/nueva-clase"
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nueva clase
        </Link>
      </div>
    </aside>
  );
}

export function AppShell() {
  const { user, loading } = useStore();

  // Login is the only entry point: nothing of the app renders without a session.
  if (loading) {
    return <LoadingScreen />;
  }
  if (!user) return <LoginScreen />;

  return (
    <div className="flex min-h-dvh bg-background">
      <DesktopSidebar />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col lg:mx-0 lg:max-w-none lg:flex-1">
        <Account />
        <main className="flex-1 pb-28 lg:pb-12">
          <div className="lg:mx-auto lg:w-full lg:max-w-6xl">
            <Outlet />
          </div>
        </main>
        <nav
          aria-label="Navegación inferior"
          className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        >
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
                data-tour="add"
                className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(28,28,26,0.18)] transition-opacity active:opacity-85"
              >
                <Plus className="h-6 w-6" />
              </Link>
            </li>
            <li>
              <Link
                to="/alumnos"
                activeOptions={{ exact: true }}
                data-tour="students"
                className="flex h-16 flex-col items-center justify-center gap-1 text-muted-foreground data-[status=active]:text-foreground"
              >
                <Users className="h-6 w-6" strokeWidth={1.75} />
                <span className="text-[11px] font-semibold">Alumnos</span>
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  right,
  sticky = true,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  /** A page with its own sticky block above the content turns this off. */
  sticky?: boolean;
}) {
  return (
    <header
      className={`flex items-end justify-between gap-3 border-b border-border bg-background/90 px-4 pb-3 pt-4 backdrop-blur-xl lg:px-6 lg:pt-6 ${
        sticky ? "sticky top-0 z-30" : ""
      }`}
    >
      <div className="min-w-0">
        {sub && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {sub}
          </p>
        )}
        <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      </div>
      {right}
    </header>
  );
}
