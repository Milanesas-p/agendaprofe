/**
 * How the app says hello.
 *
 * The hour comes from the browser, never from the server: a server render in
 * another timezone would greet "buenas noches" at noon (`AGENTS.md`).
 */
export function greeting(hour: number): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "Buenas";
  if (hour >= 6 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 20) return "Buenas tardes";
  return "Buenas noches";
}
