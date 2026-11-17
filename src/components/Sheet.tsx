import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  // Keep the page behind the sheet exactly where it was. On a phone the keyboard
  // would otherwise scroll the document to reveal the focused field, and closing
  // the sheet would leave the agenda moved. Pinning the body and restoring the
  // saved offset keeps both fixed.
  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      if (scrollY !== 0) window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px]" />
      <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-xl border-t border-border bg-card shadow-[0_-4px_20px_-2px_rgba(28,28,26,0.10)]">
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
          <Dialog.Title className="truncate text-2xl font-semibold tracking-tight">{title}</Dialog.Title>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X /></Button>
        </div>
        {/* The body is the only scroll area: the sheet itself never moves, and the
            list scrolls under the title. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10">
          {children}
        </div>
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
