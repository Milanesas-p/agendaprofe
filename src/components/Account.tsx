import { useState } from "react";
import { LogIn, LogOut, CircleUserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/Sheet";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useStore } from "@/lib/store";
import "@lovable.dev/cloud-auth-js/styles.css";

export function Account() {
  const {session,loading,busy} = useStore();
  const [open,setOpen] = useState(false);
  const [mode,setMode] = useState<"login"|"signup"|"reset"|"password">("login");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [message,setMessage] = useState("");
  const [pending,setPending] = useState(false);
  // Recovery links establish a temporary session before asking for a new password.
  const recovery = typeof window !== "undefined" && window.location.hash.includes("type=recovery");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setPending(true); setMessage("");
    const result = mode === "password" || recovery ? await supabase.auth.updateUser({password}) : mode === "signup" ? await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}}) : mode === "reset" ? await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin}) : await supabase.auth.signInWithPassword({email,password});
    setPending(false);
    if(result.error) { setMessage(result.error.message); return; }
    if(mode === "signup" || mode === "reset") setMessage("Revisá tu correo para continuar.");
    else { setOpen(false); setPassword(""); if(recovery) window.history.replaceState(null,"",window.location.pathname); }
  }
  return <>
    <div className="account-bar"><span className="font-display text-lg">PÁDEL PRO</span><Button variant="ghost" size="sm" onClick={() => {setMessage("");setOpen(true);}}><CircleUserRound />{loading ? "Cargando…" : session ? "Mi cuenta" : "Ingresar"}</Button></div>
    {busy && <div role="status" className="saving-bar">Guardando…</div>}
    {(open || recovery) && <Sheet title={session && !recovery ? "Mi cuenta" : mode === "signup" ? "Crear cuenta" : mode === "reset" ? "Recuperar acceso" : recovery ? "Nueva contraseña" : "Ingresar"} onClose={() => setOpen(false)}>
      {session && !recovery ? <><p className="mb-5 break-all">{session.user.email}</p><Button className="h-12 w-full" onClick={async () => {await supabase.auth.signOut();setOpen(false);}}><LogOut />Cerrar sesión</Button></> : <>
        {!recovery && mode !== "reset" && <div className="mb-4 grid grid-cols-2 gap-2"><Button variant={mode === "login" ? "default":"outline"} onClick={() => {setMode("login");setMessage("");}}>Ingresar</Button><Button variant={mode === "signup" ? "default":"outline"} onClick={() => {setMode("signup");setMessage("");}}>Crear cuenta</Button></div>}
        <form onSubmit={submit} className="space-y-4">
          {!recovery && <label className="block font-semibold">Correo electrónico<input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="account-input" /></label>}
          {mode !== "reset" && <label className="block font-semibold">Contraseña<input type="password" minLength={8} required autoComplete={mode === "signup" || recovery ? "new-password":"current-password"} value={password} onChange={e => setPassword(e.target.value)} className="account-input" /></label>}
          {message && <p role="status" className="text-sm">{message}</p>}
          <Button disabled={pending} type="submit" className="h-12 w-full"><LogIn />{pending ? "Un momento…" : recovery ? "Guardar contraseña" : mode === "signup" ? "Crear cuenta" : mode === "reset" ? "Enviar enlace" : "Ingresar"}</Button>
        </form>
        {!recovery && <Button variant="link" className="mt-2" onClick={() => {setMode(mode === "reset" ? "login":"reset");setMessage("");}}>{mode === "reset" ? "Volver a ingresar":"Olvidé mi contraseña"}</Button>}
        {!recovery && mode !== "reset" && <div className="mt-4 space-y-2 border-t border-border pt-4"><Button variant="outline" className="h-12 w-full" onClick={async () => {const r=await lovable.auth.signInWithOAuth("google",{redirect_uri:window.location.origin});if(r.error)setMessage(r.error.message);else if(!r.redirected)setOpen(false);}}>Continuar con Google</Button><Button variant="ghost" className="lovable-auth-button w-full" onClick={async () => {const r=await lovable.auth.signInWithOAuth("lovable",{redirect_uri:window.location.origin});if(r.error)setMessage(r.error.message);else if(!r.redirected)setOpen(false);}}>Continue with Lovable</Button></div>}
      </>}
    </Sheet>}
  </>;
}