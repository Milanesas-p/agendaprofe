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
import { payOf, type PayMode } from "@/lib/pay";
import type { StudentSlot } from "@/lib/recurrence";
import { fold } from "@/lib/text";

export type ImportRow = {
  /** 1-based line in the pasted text, so the teacher finds it. */
  line: number;
  /** Existing student this row updates, or null when the row creates one. */
  id: string | null;
  name: string;
  phone: string | null;
  type: "fijo" | "rotativo";
  /** Null when the sheet leaves `pago` blank: the mode is still undecided. */
  pay: PayMode | null;
  category: Category | null;
  courtSide: CourtSide | null;
  /** Weekly slots read from the sheet; a `fijo` gets them booked, a `rotativo` not. */
  slots: StudentSlot[];
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

/** Columns of the downloadable template, in the order the screen lists them. */
export const TEMPLATE_COLUMNS = [
  "nombre",
  "telefono",
  "tipo",
  "pago",
  "categoria",
  "posicion",
  "dia",
  "hora",
  "dia 2",
  "hora 2",
  "id",
] as const;
export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

/** The shape the server stores for a student id, shared by both sides. */
export const STUDENT_ID_PATTERN = /^[0-9a-fA-F-]{36}$/;
export const isStudentId = (value: string): boolean => STUDENT_ID_PATTERN.test(value);

/**
 * Decodes a file the teacher completed. Excel writes UTF-8 only when asked, so a
 * file with invalid UTF-8 is retried as the ANSI code page it usually is.
 */
export function decodeImportFile(buffer: ArrayBuffer): string {
  const strip = (text: string) => text.replace(/^\uFEFF/, "");
  const utf8 = strip(new TextDecoder("utf-8").decode(buffer));
  return utf8.includes("\uFFFD") ? strip(new TextDecoder("windows-1252").decode(buffer)) : utf8;
}

type Column =
  | "nombre"
  | "telefono"
  | "tipo"
  | "pago"
  | "categoria"
  | "posicion"
  | "dia"
  | "hora"
  | "dia2"
  | "hora2"
  | "id";

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
  dia2: ["dia 2", "dia2", "segundo dia"],
  hora2: ["hora 2", "hora2", "segundo horario"],
  id: ["id"],
};

const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

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

/** A weekday from a day name, its first three letters, or a 0-6 digit in `dia`. */
function dayOf(token: string, allowDigits: boolean): number | null {
  const folded = fold(token);
  if (allowDigits && /^[0-6]$/.test(folded)) return Number(folded);
  const exact = WEEKDAY_NAMES.indexOf(folded);
  if (exact >= 0) return exact;
  if (folded.length >= 3) {
    const prefix = WEEKDAY_NAMES.findIndex((day) => day.slice(0, 3) === folded.slice(0, 3));
    if (prefix >= 0) return prefix;
  }
  return null;
}

/** Every day the `dia` cell names: "Martes y viernes", "lun/mie", "3". */
function daysOf(value: string): number[] | null {
  const tokens = fold(value)
    .split(/[\s,;/\-–—]+/)
    .filter(Boolean);
  const days: number[] = [];
  for (const token of tokens) {
    if (token === "y" || token === "e") continue;
    const day = dayOf(token, true);
    if (day === null) return null;
    if (!days.includes(day)) days.push(day);
  }
  return days;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * One time token → `HH:MM`. Accepts the shapes the teacher really types:
 * `14:00`, `2:00 PM`, `8AM`, `9am`, `15hs`, `8 hs` and a bare `16`.
 */
function timeOf(value: string): string | null {
  const text = fold(value).replace(/\s+/g, " ").trim();

  // A spreadsheet may store a time as the fraction of a day it already is.
  const fraction = /^(?:0)?\.(\d+)$/.exec(text);
  if (fraction) {
    const minutes = Math.round(Number(`0.${fraction[1]}`) * 24 * 60) % (24 * 60);
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }

  const twelveHour = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s*m?\.?$/.exec(text);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const twentyFour = (hour % 12) + (twelveHour[3] === "p" ? 12 : 0);
    return `${pad(twentyFour)}:${pad(minute)}`;
  }

  const hours = /^(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?|h)$/.exec(text);
  if (hours) {
    const hour = Number(hours[1]);
    const minute = Number(hours[2] ?? 0);
    if (hour > 23 || minute > 59) return null;
    return `${pad(hour)}:${pad(minute)}`;
  }

  // "14h30": the separator form the parser accepted before several slots existed.
  const compact = /^(\d{1,2})h([0-5]\d)$/.exec(text);
  if (compact) {
    const hour = Number(compact[1]);
    return hour > 23 ? null : `${pad(hour)}:${compact[2]}`;
  }

  const twentyFourHour = /^([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?$/.exec(text);
  if (twentyFourHour) return `${pad(Number(twentyFourHour[1]))}:${twentyFourHour[2]}`;

  const bare = /^(\d{1,2})$/.exec(text);
  if (bare) {
    const hour = Number(bare[1]);
    return hour > 23 ? null : `${pad(hour)}:00`;
  }
  return null;
}

type HourPart = { day: number | null; time: string };

/**
 * Reads the `hora` cell. It may carry one time, or one per day:
 * "martes 11hs - sab 12hs", "Mier-16hs Vier 14hs". Each time takes the day word
 * that precedes it; a day word with no time after it is ambiguous and fails.
 */
function hourPartsOf(value: string): HourPart[] | null {
  // "2:00 PM" and "8 hs" are one time, but split into two tokens by a plain
  // whitespace pass; glue the meridiem and the "hs" onto their number first.
  const text = fold(value)
    .replace(/(\d)\s+([ap])\.?\s*m?\.?/g, "$1$2")
    .replace(/(\d)\s+(hs?)/g, "$1$2");
  const tokens = text.split(/[\s,;/\-–—]+/).filter(Boolean);
  const parts: HourPart[] = [];
  let currentDay: number | null = null;
  for (const token of tokens) {
    if (token === "y" || token === "e") continue;
    const day = dayOf(token, false);
    if (day !== null) {
      currentDay = day;
      continue;
    }
    const time = timeOf(token);
    if (time === null) return null;
    parts.push({ day: currentDay, time });
    currentDay = null;
  }
  return currentDay === null ? parts : null;
}

/**
 * `dia` + `hora` → the weekly slots of one row. One day with one time is the
 * common case; several days share a time, or each day carries its own.
 */
function slotsFromCells(dia: string, hora: string): { slots: StudentSlot[]; error: string | null } {
  const days = daysOf(dia);
  if (days === null) return { slots: [], error: `Día inválido: ${dia}.` };
  const parts = hourPartsOf(hora);
  if (parts === null) return { slots: [], error: `Hora inválida: ${hora}. Usá 8AM, 15hs o HH:MM.` };

  if (days.length === 0 && parts.length === 0) return { slots: [], error: null };
  if (days.length === 0 || parts.length === 0)
    return { slots: [], error: "El horario fijo necesita día y hora." };

  const explicit = parts.filter((part) => part.day !== null).length;
  let pairs: Array<{ day: number; time: string }>;
  if (explicit === parts.length) {
    pairs = parts.map((part) => ({ day: part.day!, time: part.time }));
  } else if (explicit === 0) {
    if (parts.length === 1) pairs = days.map((day) => ({ day, time: parts[0]!.time }));
    else if (parts.length === days.length)
      pairs = days.map((day, index) => ({ day, time: parts[index]!.time }));
    else return { slots: [], error: "No coinciden los días con las horas." };
  } else {
    return { slots: [], error: "No coinciden los días con las horas." };
  }

  const declared = new Set(days);
  for (const pair of pairs) {
    if (!declared.has(pair.day))
      return { slots: [], error: "Los días de la hora no coinciden con la columna día." };
  }

  const seen = new Set<string>();
  const slots: StudentSlot[] = [];
  for (const pair of pairs) {
    const key = `${pair.day}#${pair.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ weekday: pair.day, time: pair.time });
  }
  return { slots, error: null };
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
  if (folded === "indistinto" || folded === "comodin") return "indistinto";
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
    dia2: cell("dia2"),
    hora2: cell("hora2"),
    id: cell("id"),
  };

  const row: ImportRow = {
    line,
    id: null,
    name: raw.nombre,
    phone: null,
    type: "rotativo",
    pay: null,
    category: null,
    courtSide: null,
    slots: [],
    error: null,
  };
  const fail = (message: string): ImportRow => ({ ...row, error: message });

  if (raw.id !== "") {
    if (!isStudentId(raw.id)) return fail("El id no es válido. No edites esa columna.");
    row.id = raw.id;
  }

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
    const pay = payOf(raw.pago);
    if (!pay)
      return fail(`Pago inválido: ${raw.pago}. Usá Mensual, Pago individual o Paga grupal.`);
    row.pay = pay;
  }

  // Two pairs of cells: the second one is optional and exists so a student who
  // goes two days does not need the compact notation in a single cell. Each pair
  // still accepts several days, so nothing is lost when there are more.
  const schedule = slotsFromCells(raw.dia, raw.hora);
  if (schedule.error) return fail(schedule.error);
  const extra = slotsFromCells(raw.dia2, raw.hora2);
  if (extra.error) return fail(`Segundo horario: ${extra.error}`);

  const slots: StudentSlot[] = [...schedule.slots];
  for (const slot of extra.slots) {
    if (!slots.some((known) => known.weekday === slot.weekday && known.time === slot.time)) {
      slots.push(slot);
    }
  }
  for (const slot of slots) {
    if (allowedSlots.length > 0 && !allowedSlots.includes(slot.time)) {
      return fail(`El horario ${slot.time} no está entre tus bloques.`);
    }
  }
  row.slots = slots;

  if (raw.tipo !== "") {
    const type = fold(raw.tipo);
    if (type !== "fijo" && type !== "rotativo")
      return fail(`Tipo inválido: ${raw.tipo}. Usá fijo o rotativo.`);
    row.type = type;
  }
  // No `tipo` means the student is not fixed, even when the sheet names a usual day
  // and time: those slots stay habitual and are never booked automatically.

  return row;
}

/**
 * Parses the paste. `allowedSlots` are the configured blocks: a weekly slot outside
 * them would never generate a class, so it is reported instead of saved. `knownIds`
 * are the students that still exist, so an id that no longer does cannot turn into
 * a duplicate on the next import.
 */
export function parseStudents(
  text: string,
  options: { allowedSlots?: readonly string[]; knownIds?: ReadonlySet<string> } = {},
): ImportReport {
  const allowedSlots = options.allowedSlots ?? [];
  const knownIds = options.knownIds;
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

  const seen = new Set<string>();
  const rows = nonEmpty.slice(1).map(({ line, number }) => {
    const cells = splitRow(line, delimiter);
    const values: Cells = {};
    for (const [column, index] of Object.entries(columns) as Array<[Column, number]>) {
      values[column] = cells[index] ?? "";
    }
    const row = readRow(number, values, allowedSlots);
    if (row.id === null) return row;
    if (seen.has(row.id))
      return { ...row, error: row.error ?? "Este alumno está repetido en la plantilla." };
    seen.add(row.id);
    if (knownIds && !knownIds.has(row.id)) {
      return {
        ...row,
        error: row.error ?? "Ese alumno ya no existe. Volvé a descargar la plantilla.",
      };
    }
    return row;
  });

  return { rows, ready: rows.filter((r) => r.error === null), error: null };
}
