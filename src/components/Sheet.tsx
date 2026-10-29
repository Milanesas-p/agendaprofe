import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
export function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px]" />
      <Dialog.Content aria-describedby={undefined} className="fixed bottom-0 left-1/2 z-50 max-h-[80dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-xl border-t border-border bg-card p-5 pb-10 shadow-[0_-4px_20px_-2px_rgba(28,28,26,0.10)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Dialog.Title className="truncate text-2xl font-semibold tracking-tight">{title}</Dialog.Title>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X /></Button>
        </div>
        {children}
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
