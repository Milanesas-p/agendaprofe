/**
 * Importing students from pasted text.
 *
 * The teacher copies rows out of Excel or Sheets and pastes them: tabs by default,
 * but commas and semicolons work too. The first non-comment row names the columns
 * (lines starting with `#` are ignored), so nothing is guessed; every row is
 * validated on its own and a broken row never blocks the rest. Pure functions only.
 */

import { CATEGORIES, COURT_SIDES, type Category, type CourtSide } from "@/lib/player";
import { normalizePhone } from "@/lib/phone";

export type ImportRow = {
  /** 1-based line in the pasted text, so the teacher finds it. */
  line: number;
  name: string;
  phone: string | null;
  type: "fijo" | "rotativo";
  pay: "mensual" | "semanal";
  category: Category | null;
  courtSide: CourtSide | null;
  recurringWeekday: number | null;
  recurringTime: string | null;
  /** Why this row cannot be imported, or null when it is ready. */
  error: string | null;
};

export type ImportReport = {
  rows: ImportRow[];
  ready: ImportRow[];
  /** Something wrong with the whole paste (a missing header), not with one row. */
  error: string | null;
};

export const HEADER_ERROR = "La primera fila tiene que traer los títulos de las columnas.";

/** Column headings of the downloadable template, in the order the screen lists them. */
export const TEMPLATE_HEADER = ["nombre", "telefono", "tipo", "pago", "categoria", "posicion", "dia", "hora"].join(";");

/**
 * The template the teacher downloads: an instruction line, the header, and room to
 * fill rows under it. Semicolons match the Spanish Excel list separator, so it
 * opens already split into columns; `#` lines are ignored by the parser.
 */
export function importTemplate(): string {
  return [
    "# Una fila por alumno. tipo: fijo o rotativo. pago: mensual o semanal. categoria: 1ra a 8va. posicion: drive, reves o indistinto. dia: lunes a domingo. hora: HH:MM.",
    TEMPLATE_HEADER,
    "",
  ].join("\n");
}

/**
 * Decodes a file the teacher completed. Excel writes UTF-8 only when asked, so a
 * file with invalid UTF-8 is retried as the ANSI code page it usually is.
 */
export function decodeImportFile(buffer: ArrayBuffer): string {
  const strip = (text: string) => text.replace(/^\uFEFF/, "");
  const utf8 = strip(new TextDecoder("utf-8").decode(buffer));
  return utf8.includes("\uFFFD") ? strip(new TextDecoder("windows-1252").decode(buffer)) : utf8;
}

type Column = "nombre" | "telefono" | "tipo" | "pago" | "categoria" | "posicion" | "dia" | "hora";

/** Every accepted heading, already normalized (no accents, lowercase). */
const HEADINGS: Record<Column, readonly string[]> = {
  nombre: ["nombre", "alumno", "nombre y apellido", "nombre completo"],
  telefono: ["telefono", "celular", "whatsapp", "tel"],
  tipo: ["tipo"],
  pago: ["pago", "modalidad", "abona"],
  categoria: ["categoria", "cat"],
  posicion: ["posicion", "lado", "cancha"],
  dia: ["dia", "dia fijo", "semana"],
  hora: ["hora", "horario"],
};

const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

/** Loose comparison: no accents, no case, no surrounding spaces. */
const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

/** Tabs win over commas, which win over semicolons: Excel copies tab separated. */
function delimiterOf(line: string): string {
  if (line.includes("\t")) return "\t";
  const semicolons = (line.match(/;/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function weekdayOf(value: string): number | null {
  const folded = fold(value);
  if (/^[0-6]$/.test(folded)) return Number(folded);
  const exact = WEEKDAY_NAMES.indexOf(folded);
  if (exact >= 0) return exact;
  const prefix = WEEKDAY_NAMES.findIndex((day) => day.slice(0, 3) === folded.slice(0, 3) && folded.length >= 3);
  return prefix >= 0 ? prefix : null;
}

/**
 * `14:00`, `14:00:00`, `2:00 PM` or `2:00 p. m.` → `HH:MM`; anything else → null.
 * Google Sheets turns a typed time into a value and exports it with seconds or
 * with a twelve-hour meridiem, so both shapes have to survive the round trip.
 */
function timeOf(value: string): string | null {
  const text = fold(value);
  const twelveHour = /^(\d{1,2})[:.h](\d{2})(?::\d{2})?\s*([ap])\.?\s*m?\.?$/.exec(text);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const twentyFour = (hour % 12) + (twelveHour[3] === "p" ? 12 : 0);
    return `${String(twentyFour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const twentyFourHour = /^([01]?\d|2[0-3])[:.h]([0-5]\d)(?::[0-5]\d)?$/.exec(text);
  if (!twentyFourHour) return null;
  return `${twentyFourHour[1]!.padStart(2, "0")}:${twentyFourHour[2]}`;
}

function categoryOf(value: string): Category | null {
  const folded = fold(value);
  return CATEGORIES.find((c) => fold(c) === folded) ?? null;
}

function courtSideOf(value: string): CourtSide | null {
  const folded = fold(value);
  const byToken = COURT_SIDES.find((side) => side === folded);
  if (byToken) return byToken;
  if (folded === "reves") return "reves";
  if (folded === "drive") return "drive";
  if (folded === "indistinto") return "indistinto";
  return null;
}

type Cells = Partial<Record<Column, string>>;

function readRow(line: number, cells: Cells, allowedSlots: readonly string[]): ImportRow {
  const cell = (column: Column) => (cells[column] ?? "").trim();
  const raw = {
    nombre: cell("nombre"),
    telefono: cell("telefono"),
    tipo: cell("tipo"),
    pago: cell("pago"),
    categoria: cell("categoria"),
    posicion: cell("posicion"),
    dia: cell("dia"),
    hora: cell("hora"),
  };

  const row: ImportRow = {
    line,
    name: raw.nombre,
    phone: null,
    type: "rotativo",
    pay: "mensual",
    category: null,
    courtSide: null,
    recurringWeekday: null,
    recurringTime: null,
    error: null,
  };
  const fail = (message: string): ImportRow => ({ ...row, error: message });

  if (raw.nombre === "") return fail("Falta el nombre.");

  if (raw.telefono !== "") {
    try {
      row.phone = normalizePhone(raw.telefono);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "El teléfono no es válido.");
    }
  }

  if (raw.categoria !== "") {
    const category = categoryOf(raw.categoria);
    if (!category) return fail(`Categoría inválida: ${raw.categoria}.`);
    row.category = category;
  }

  if (raw.posicion !== "") {
    const side = courtSideOf(raw.posicion);
    if (!side) return fail(`Posición inválida: ${raw.posicion}.`);
    row.courtSide = side;
  }

  if (raw.pago !== "") {
    const pay = fold(raw.pago);
    if (pay !== "mensual" && pay !== "semanal") return fail(`Pago inválido: ${raw.pago}. Usá mensual o semanal.`);
    row.pay = pay;
  }

  if ((raw.dia === "") !== (raw.hora === "")) return fail("El horario fijo necesita día y hora.");

  if (raw.dia !== "" && raw.hora !== "") {
    const weekday = weekdayOf(raw.dia);
    if (weekday === null) return fail(`Día inválido: ${raw.dia}.`);
    const time = timeOf(raw.hora);
    if (!time) return fail(`Hora inválida: ${raw.hora}. Usá HH:MM.`);
    if (allowedSlots.length > 0 && !allowedSlots.includes(time)) {
      return fail(`El horario ${time} no está entre tus bloques.`);
    }
    row.recurringWeekday = weekday;
    row.recurringTime = time;
  }

  if (raw.tipo !== "") {
    const type = fold(raw.tipo);
    if (type !== "fijo" && type !== "rotativo") return fail(`Tipo inválido: ${raw.tipo}. Usá fijo o rotativo.`);
    row.type = type;
  } else {
    // A weekly slot is what makes a student "fijo" in this app.
    row.type = row.recurringWeekday !== null ? "fijo" : "rotativo";
  }

  return row;
}

/**
 * Parses the paste. `allowedSlots` are the configured blocks: a weekly slot outside
 * them would never generate a class, so it is reported instead of saved.
 */
export function parseStudents(
  text: string,
  options: { allowedSlots?: readonly string[] } = {},
): ImportReport {
  const allowedSlots = options.allowedSlots ?? [];
  const lines = text.split(/\r?\n/);
  // Comments keep the downloaded template self-explanatory without becoming rows.
  const nonEmpty = lines
    .map((line, i) => ({ line, number: i + 1 }))
    .filter((l) => l.line.trim() !== "" && !l.line.trimStart().startsWith("#"));

  if (nonEmpty.length === 0) return { rows: [], ready: [], error: null };

  const delimiter = delimiterOf(nonEmpty[0]!.line);
  const headings = splitRow(nonEmpty[0]!.line, delimiter).map(fold);
  const columns: Partial<Record<Column, number>> = {};
  for (const [column, aliases] of Object.entries(HEADINGS) as Array<[Column, readonly string[]]>) {
    const index = headings.findIndex((heading) => aliases.includes(heading));
    if (index >= 0) columns[column] = index;
  }
  if (columns.nombre === undefined) return { rows: [], ready: [], error: HEADER_ERROR };

  const rows = nonEmpty.slice(1).map(({ line, number }) => {
    const cells = splitRow(line, delimiter);
    const values: Cells = {};
    for (const [column, index] of Object.entries(columns) as Array<[Column, number]>) {
      values[column] = cells[index] ?? "";
    }
    return readRow(number, values, allowedSlots);
  });

  return { rows, ready: rows.filter((r) => r.error === null), error: null };
}
