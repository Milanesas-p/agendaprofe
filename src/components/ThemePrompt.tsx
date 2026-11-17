import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Moon, Sun } from "lucide-react";
import { applyTheme, hasThemePreference, type Theme } from "@/lib/theme";

/**
 * First-run theme picker: shown once per device, right after the teacher signs in.
 * The choice lands in localStorage (it is a display preference, not app data), so
 * the same dialog never interrupts again on that device.
 */
export function ThemePrompt() {
  const [open, setOpen] = useState(false);

  // Read after hydration: the server has no localStorage.
  useEffect(() => {
    setOpen(!hasThemePreference());
  }, []);

  if (!open) return null;

  const choose = (theme: Theme) => {
    applyTheme(theme);
    setOpen(false);
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby="theme-prompt-description"
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-[0_24px_60px_-24px_rgba(28,28,26,0.35)]"
        >
          <Dialog.Title className="font-display text-xl font-bold tracking-tight">
            ¿Cómo querés ver la app?
          </Dialog.Title>
          <Dialog.Description
            id="theme-prompt-description"
            className="mt-1 text-sm text-muted-foreground"
          >
            Elegí el tema. Podés cambiarlo cuando quieras en Configuración.
          </Dialog.Description>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => choose("light")}
              aria-label="Usar el tema claro"
              className="rounded-2xl border border-border p-2 text-left transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className="mb-2 block rounded-xl border border-border bg-[oklch(0.982_0.01_87.5)] p-2"
              >
                <span className="block h-1.5 w-8 rounded-full bg-[oklch(0.42_0.1_155)]" />
                <span className="mt-2 block h-5 rounded-md bg-white" />
                <span className="mt-1 block h-5 rounded-md bg-[oklch(0.958_0.005_95.1)]" />
              </span>
              <span className="flex items-center gap-1.5 px-1 pb-1 text-sm font-semibold">
                <Sun className="h-4 w-4 text-court" /> Claro
              </span>
            </button>

            <button
              type="button"
              onClick={() => choose("dark")}
              aria-label="Usar el tema oscuro"
              className="rounded-2xl border border-border p-2 text-left transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className="mb-2 block rounded-xl border border-white/10 bg-[oklch(0.185_0.006_90)] p-2"
              >
                <span className="block h-1.5 w-8 rounded-full bg-[oklch(0.62_0.082_153.2)]" />
                <span className="mt-2 block h-5 rounded-md bg-[oklch(0.235_0.006_90)]" />
                <span className="mt-1 block h-5 rounded-md bg-[oklch(0.28_0.006_90)]" />
              </span>
              <span className="flex items-center gap-1.5 px-1 pb-1 text-sm font-semibold">
                <Moon className="h-4 w-4 text-court" /> Oscuro
              </span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
