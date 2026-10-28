import { useState } from "react";
import { LogIn, LogOut, CircleUserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/Sheet";
import { useStore } from "@/lib/store";

export function Account() {
  const { user, loading, busy, signIn, signUp, signOut } = useStore();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage("");
    const error = mode === "signup" ? await signUp(email, password) : await signIn(email, password);
    setPending(false);
    if (error) { setMessage(error); return; }
    setOpen(false);
    setPassword("");
  }

  return <>
    <div className="account-bar"><span className="font-display text-lg">PÁDEL PRO</span><Button variant="ghost" size="sm" onClick={() => { setMessage(""); setOpen(true); }}><CircleUserRound />{loading ? "Cargando…" : user ? "Mi cuenta" : "Ingresar"}</Button></div>
    {busy && <div role="status" className="saving-bar">Guardando…</div>}
    {open && <Sheet title={user ? "Mi cuenta" : mode === "signup" ? "Crear cuenta" : "Ingresar"} onClose={() => setOpen(false)}>
      {user ? <><p className="mb-5 break-all">{user.email}</p><Button className="h-12 w-full" onClick={async () => { await signOut(); setOpen(false); }}><LogOut />Cerrar sesión</Button></> : <>
        <div className="mb-4 grid grid-cols-2 gap-2"><Button variant={mode === "login" ? "default" : "outline"} onClick={() => { setMode("login"); setMessage(""); }}>Ingresar</Button><Button variant={mode === "signup" ? "default" : "outline"} onClick={() => { setMode("signup"); setMessage(""); }}>Crear cuenta</Button></div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block font-semibold">Correo electrónico<input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="account-input" /></label>
          <label className="block font-semibold">Contraseña<input type="password" minLength={8} required autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} className="account-input" /></label>
          {message && <p role="status" className="text-sm">{message}</p>}
          <Button disabled={pending || busy} type="submit" className="h-12 w-full"><LogIn />{pending ? "Un momento…" : mode === "signup" ? "Crear cuenta" : "Ingresar"}</Button>
        </form>
      </>}
    </Sheet>}
  </>;
}
