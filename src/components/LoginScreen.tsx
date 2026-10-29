import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogIn, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";

/** WhatsApp that receives "quiero sumar el sistema" enquiries. */
export const CONTACT_PHONE = "5492302666351";

/**
 * Single entry point of the app: there is no registration. Accounts are created
 * by whoever runs the system, so an interested teacher gets in touch instead.
 */
export function LoginScreen() {
  const { signIn, busy } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage("");
    const error = await signIn(email, password);
    setPending(false);
    if (error) { setMessage(error); return; }
    setPassword("");
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center bg-background px-6 py-10 text-foreground">
      <header className="mb-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tu agenda de clases</p>
        <h1 className="text-4xl font-semibold tracking-tight">Pádel Pro</h1>
      </header>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5 text-foreground">
        <label className="block text-sm font-semibold">Correo electrónico<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="account-input" /></label>
        <label className="block text-sm font-semibold">Contraseña<input type="password" minLength={8} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="account-input" /></label>
        {message && <p role="status" className="text-sm">{message}</p>}
        <Button disabled={pending || busy} type="submit" className="h-12 w-full"><LogIn />{pending ? "Un momento…" : "Ingresar"}</Button>
      </form>

      <section className="mt-8 rounded-xl border border-border p-5 text-center">
        <p className="font-semibold">¿Querés sumar nuestro sistema a tus clases?</p>
        <a
          href={`https://wa.me/${CONTACT_PHONE}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <MessageCircle className="h-5 w-5" />Contactate
        </a>
      </section>
    </div>
  );
}
