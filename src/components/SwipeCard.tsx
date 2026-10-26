import { useRef, useState, type ReactNode } from "react";

/** Swipe right = onRight (Presente), swipe left = onLeft (Ausente). */
export function SwipeCard({ children, onLeft, onRight, disabled }: { children: ReactNode; onLeft: () => void; onRight: () => void; disabled?: boolean }) {
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const T = 90;
  const end = () => {
    if (dx > T) onRight();
    else if (dx < -T) onLeft();
    start.current = null;
    setDx(0);
  };
  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 flex items-center justify-between px-5 font-display text-2xl">
        <span className={dx > 0 ? "text-success" : "opacity-0"}>✓ PRESENTE</span>
        <span className={dx < 0 ? "text-destructive" : "opacity-0"}>AUSENTE ✕</span>
      </div>
      <div
        style={{ transform: `translateX(${dx}px)`, transition: start.current === null ? "transform .2s" : "none", touchAction: "pan-y" }}
        onPointerDown={(e) => { if (!disabled) { start.current = e.clientX; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } }}
        onPointerMove={(e) => { if (start.current !== null) setDx(e.clientX - start.current); }}
        onPointerUp={end}
        onPointerCancel={() => { start.current = null; setDx(0); }}
        className="relative select-none"
      >
        {children}
      </div>
    </div>
  );
}
