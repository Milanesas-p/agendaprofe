import { Link, Outlet } from "@tanstack/react-router";
import { CalendarDays, Users, BarChart3 } from "lucide-react";

const tabs = [
  { to: "/", label: "Agenda", icon: CalendarDays },
  { to: "/alumnos", label: "Alumnos", icon: Users },
  { to: "/resumen", label: "Resumen", icon: BarChart3 },
] as const;

export function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <main className="flex-1 pb-28">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t-2 border-foreground bg-court pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-3">
          {tabs.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact: true }}
                className="flex h-20 flex-col items-center justify-center gap-1 font-display text-lg tracking-wider text-court-foreground/60 data-[status=active]:text-primary"
              >
                <Icon className="h-7 w-7" strokeWidth={2.5} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex items-end justify-between bg-court px-5 pb-4 pt-6 text-court-foreground">
      <div>
        {sub && <p className="text-sm font-semibold uppercase tracking-widest text-primary">{sub}</p>}
        <h1 className="font-display text-5xl leading-none">{title}</h1>
      </div>
      {right}
    </header>
  );
}
