/**
 * Payment modes for a student.
 *
 * Tokens are the stored values, mirrored by the `students_pay` check in MySQL and
 * by the server validator; the labels are what the teacher reads in the editor and
 * in the downloaded sheet. One place so the three never drift apart.
 */

import { fold } from "@/lib/text";

export const PAY_MODES = ["mensual", "individual", "grupal"] as const;
export type PayMode = (typeof PAY_MODES)[number];

export const payLabel = (mode: PayMode): string =>
  mode === "individual" ? "Pago individual" : mode === "grupal" ? "Paga grupal" : "Mensual";

/** Token or label coming from a sheet or a paste; null when it is not a mode. */
export function payOf(value: string): PayMode | null {
  const text = fold(value).replace(/\s+/g, " ");
  return PAY_MODES.find((mode) => text === mode || text === fold(payLabel(mode))) ?? null;
}
