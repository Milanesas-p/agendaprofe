/**
 * Theme preference, kept on the device: it is a display choice, not app data, so
 * localStorage is enough and it does not need a round trip to the database.
 */

const KEY = "ppm-theme";
const CHANGE_EVENT = "ppm-theme-change";

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
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // No window (server render): nothing to notify.
  }
}

/** Notifies every mounted control (the account bar, the prompt) that the theme changed. */
export function onThemeChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

/** True once this device has a saved choice, so the first-run prompt asks only once. */
export function hasThemePreference(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

/** Applies the stored theme before React paints, so a dark session never flashes white. */
export function initTheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", readTheme() === "dark");
}
