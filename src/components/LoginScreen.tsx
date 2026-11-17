import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogIn, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgendaPreview } from "@/components/AgendaPreview";
import { useStore } from "@/lib/store";

/** WhatsApp that receives "quiero sumar el sistema" enquiries. */
export const CONTACT_PHONE = "5492302666351";

/**
 * Single entry point of the app: there is no registration. Accounts are created
 * by whoever runs the system, so an interested teacher gets in touch instead.
 *
 * The small week on the card is a simulation (see `AgendaPreview`): it shows how
 * the agenda works without exposing any of the teacher's real students.
 */
export function LoginScreen() {
  const { signIn, busy } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [forgot, setForgot] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage("");
    const error = await signIn(email, password);
    setPending(false);
    if (error) {
      setMessage(error);
      return;
    }
    setPassword("");
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative h-44 overflow-hidden lg:h-auto lg:min-h-dvh">
        <img
          src="/padel-court-centered.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
        <div className="relative flex h-full flex-col justify-end gap-1 p-5 text-white lg:gap-4 lg:p-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70 lg:text-[11px]">
            Tu agenda de clases
          </p>
          <h1 className="font-display text-2xl font-bold leading-tight lg:max-w-md lg:text-5xl lg:leading-[1.05]">
            Tus clases, siempre en orden.
          </h1>
          <p className="hidden max-w-sm text-base text-white/80 lg:block">
            Alumnos, horarios y pagos en un solo lugar.
          </p>
        </div>
      </section>

      <main className="flex flex-col justify-center px-5 py-7 sm:px-8 lg:min-h-dvh lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <header className="mb-4">
            <p className="font-display text-xl font-bold tracking-tight">Pádel Pro</p>
            <p className="text-sm text-muted-foreground">Ingresá a tu agenda.</p>
          </header>

          <AgendaPreview />

          <form
            onSubmit={submit}
            className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-5 text-foreground shadow-[0_18px_40px_-32px_oklch(0.3_0.05_150/0.6)]"
          >
            <label className="block text-sm font-semibold">
              Correo electrónico
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="account-input"
              />
            </label>
            <label className="block text-sm font-semibold">
              Contraseña
              <input
                type="password"
                minLength={8}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="account-input"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                aria-expanded={forgot}
                aria-controls="password-recovery"
                onClick={() => setForgot((open) => !open)}
                className="text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            {forgot && (
              <div
                id="password-recovery"
                className="rounded-xl border border-border bg-muted/40 p-3"
              >
                <p className="text-sm font-semibold">La contraseña la renueva la administración.</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Escribinos por WhatsApp con el correo de tu cuenta. Te pasamos una contraseña
                  nueva y se cierran todas las sesiones abiertas.
                </p>
                <a
                  href={`https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(
                    `Hola, olvidé la contraseña de Pádel Pro.${email.trim() ? ` Mi correo es ${email.trim()}.` : ""}`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <MessageCircle className="h-4 w-4" />
                  Pedir una nueva
                </a>
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                  WhatsApp +54 9 2302 666351
                </p>
              </div>
            )}
            {message && (
              <p role="status" className="text-sm">
                {message}
              </p>
            )}
            <Button disabled={pending || busy} type="submit" className="h-12 w-full">
              <LogIn />
              {pending ? "Un momento…" : "Ingresar"}
            </Button>
          </form>

          <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">¿Querés sumar nuestro sistema a tus clases?</p>
              <p className="text-xs text-muted-foreground">
                Escribinos y te mostramos cómo funciona.
              </p>
            </div>
            <a
              href={`https://wa.me/${CONTACT_PHONE}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <MessageCircle className="h-4 w-4" />
              Contactate
            </a>
          </section>
        </div>
      </main>
    </div>
  );
}
