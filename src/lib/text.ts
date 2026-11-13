/** Loose comparison: no accents, no case, no surrounding spaces. */
export const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
