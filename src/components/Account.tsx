import { useState } from "react";
import { LogOut, CircleUserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/Sheet";
import { useStore } from "@/lib/store";

/**
 * Account bar shown inside the app shell. Signing in lives in `LoginScreen`,
 * which gates the whole app, so this only shows the current account and logout.
 */
export function Account() {
  const { user, busy, signOut } = useStore();
  const [open, setOpen] = useState(false);

  return <>
    <div className="account-bar"><span className="font-display text-lg">PÁDEL PRO</span>{user && <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><CircleUserRound />Mi cuenta</Button>}</div>
    {busy && <div role="status" className="saving-bar">Guardando…</div>}
    {open && user && <Sheet title="Mi cuenta" onClose={() => setOpen(false)}>
      <p className="mb-5 break-all">{user.email}</p>
      <Button className="h-12 w-full" onClick={async () => { await signOut(); setOpen(false); }}><LogOut />Cerrar sesión</Button>
    </Sheet>}
  </>;
}
