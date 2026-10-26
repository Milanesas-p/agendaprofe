import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
export function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-end bg-foreground/60" onClick={onClose}>
      <div className="mx-auto max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t-4 border-primary bg-background p-5 pb-10" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-3xl">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-full border-2 border-foreground"><X /></Button>
        </div>
        {children}
      </div>
    </div>
  );
}
