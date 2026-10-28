import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
export function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/60" />
      <Dialog.Content aria-describedby={undefined} className="fixed bottom-0 left-1/2 z-50 max-h-[80dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-lg border-t-4 border-primary bg-background p-5 pb-10">
        <div className="mb-4 flex items-center justify-between">
          <Dialog.Title className="font-display text-3xl">{title}</Dialog.Title>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-full border-2 border-foreground"><X /></Button>
        </div>
        {children}
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
