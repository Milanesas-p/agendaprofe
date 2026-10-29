/**
 * Player profile: the padel category and the court side a student plays on.
 *
 * Both are closed sets, shared by the browser and the server, so the editor can
 * only offer values the database accepts. Tokens are the stored values; the
 * labels are what the teacher reads.
 */

export const CATEGORIES = ["1ra", "2da", "3ra", "4ta", "5ta", "6ta", "7ma", "8va"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Stored without accents on purpose: `reves` is a value, `Revés` is a label. */
export const COURT_SIDES = ["drive", "reves", "indistinto"] as const;
export type CourtSide = (typeof COURT_SIDES)[number];

export const courtSideLabel = (side: CourtSide): string => {
  if (side === "reves") return "Revés";
  if (side === "drive") return "Drive";
  return "Indistinto";
};

/** The compact line shown next to a name: "4ta · Revés", or "" when unset. */
export const profileLabel = (profile: { category: Category | null; courtSide: CourtSide | null }): string =>
  [profile.category, profile.courtSide ? courtSideLabel(profile.courtSide) : null].filter(Boolean).join(" · ");
