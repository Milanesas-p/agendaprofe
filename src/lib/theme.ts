/**
 * Theme preference, kept on the device: it is a display choice, not app data, so
 * localStorage is enough and it does not need a round trip to the database.
 */

const KEY = "ppm-theme";

export type Theme = "light" | "dark";

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode: the theme still applies for this session.
  }
}

/** Applies the stored theme before React paints, so a dark session never flashes white. */
export function initTheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", readTheme() === "dark");
}
