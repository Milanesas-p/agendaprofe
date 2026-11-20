import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import {
  createTeacher,
  listAccounts,
  resetTeacherPassword,
  setTeacherActive,
  type AdminAccount,
} from "@/server/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Profesores — Pádel Pro" },
      { name: "description", content: "Alta, clave y estado de las cuentas de profesor." },
      { property: "og:title", content: "Profesores — Pádel Pro" },
      { property: "og:description", content: "Alta, clave y estado de las cuentas de profesor." },
    ],
  }),
  component: Admin,
});

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function Admin() {
  const { user } = useStore();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  async function refresh() {
    setAccounts(await listAccounts());
  }

  useEffect(() => {
    if (user?.role !== "admin") {
      setLoading(false);
      return;
    }
    let active = true;
    listAccounts()
      .then((rows) => {
        if (active) setAccounts(rows);
      })
      .catch((error) => {
        if (active) toast.error(messageOf(error, "No pudimos cargar las cuentas."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.role]);

  if (user?.role !== "admin") {
    return (
      <>
        <PageHeader sub="Operador" title="Profesores" />
        <p className="px-4 py-6 text-sm text-muted-foreground lg:px-6">
          No tenés permiso para ver esta pantalla.
        </p>
      </>
    );
  }

  /** Runs one mutation, then rereads the list so the screen never lies. */
  async function act(work: () => Promise<unknown>, done: string, fallback: string) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
      await refresh();
      toast.success(done);
    } catch (error) {
      toast.error(messageOf(error, fallback));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader sub="Operador" title="Profesores" />

      <p className="px-4 pt-4 text-xs text-muted-foreground lg:px-6">
        El último ingreso es aproximado: cerrar sesión borra el registro.
      </p>

      <section className="p-4 lg:px-6">
        <h2 className="pb-2 text-sm font-semibold text-foreground">Cuentas</h2>
        {loading ? (
          <p className="py-3 text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li key={account.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{account.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {account.name ?? "Sin nombre"} · {account.role === "admin" ? "Operador" : "Profe"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      account.active ? "bg-court/15 text-court" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {account.active ? "Activa" : "Suspendida"}
                  </span>
                </div>

                <p className="pt-2 text-xs text-muted-foreground">
                  {account.students} alumnos · {account.lessons30} clases en 30 días · último ingreso:{" "}
                  {account.lastLogin ? account.lastLogin.slice(0, 16) : "sin registro"}
                </p>

                <div className="flex flex-wrap gap-2 pt-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () =>
                          setTeacherActive({
                            data: { id: account.id, active: !account.active },
                          }),
                        account.active ? "Cuenta suspendida." : "Cuenta reactivada.",
                        "No pudimos cambiar el estado de la cuenta.",
                      )
                    }
                    className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    {account.active ? "Suspender" : "Reactivar"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setResetFor(resetFor === account.email ? null : account.email);
                      setResetPassword("");
                    }}
                    className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    Resetear clave
                  </button>
                </div>

                {resetFor === account.email && (
                  <div className="flex flex-wrap items-center gap-2 pt-3">
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                      placeholder="Nueva clave (8+)"
                      aria-label={`Nueva clave para ${account.email}`}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(
                          async () => {
                            await resetTeacherPassword({
                              data: { email: account.email, password: resetPassword },
                            });
                            setResetFor(null);
                            setResetPassword("");
                          },
                          "Clave actualizada.",
                          "No pudimos cambiar la clave.",
                        )
                      }
                      className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      Guardar clave
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="p-4 lg:px-6">
        <h2 className="pb-2 text-sm font-semibold text-foreground">Nuevo profe</h2>
        <form
          className="space-y-2 rounded-xl border border-border bg-card p-3"
          onSubmit={(event) => {
            event.preventDefault();
            act(
              async () => {
                await createTeacher({ data: { email, password, name } });
                setEmail("");
                setName("");
                setPassword("");
              },
              "Profe creado.",
              "No pudimos crear la cuenta.",
            );
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="correo@padel.com"
            aria-label="Correo del profe"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre (opcional)"
            aria-label="Nombre del profe"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Clave inicial (8+)"
            aria-label="Clave inicial"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Crear profe
          </button>
        </form>
      </section>
    </>
  );
}
