/**
 * The .xlsx template the import screen downloads, and the reader for the file the
 * teacher sends back.
 *
 * A workbook is a ZIP of small XML parts, so this module keeps both halves tiny:
 * it writes one sheet with data-validation lists and reads back the first sheet
 * with its shared strings. Compression uses the platform streams
 * (`CompressionStream` / `DecompressionStream`), which every current browser and
 * Node ship, so no package is added for a file the teacher downloads once.
 */

import { TEMPLATE_COLUMNS, type TemplateColumn } from "@/lib/import";
import { WEEKDAYS } from "@/lib/agenda";
import { CATEGORIES, COURT_SIDES, courtSideLabel } from "@/lib/player";

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";

export const SHEET_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const SHEET_FILE_NAME = "plantilla-alumnos.xlsx";

/** Header style (bold) and data style (text) inside `xl/styles.xml`. */
const HEADER_STYLE = 1;
const TEXT_STYLE = 2;
/** Header plus the 200 rows the server accepts in one import. */
const LAST_ROW = 201;
/** Fixed timestamp for the ZIP entries: the file is generated, not edited. */
const DOS_DATE = 22561;

const TYPE_OPTIONS = ["fijo", "rotativo"] as const;
const PAY_OPTIONS = ["mensual", "semanal"] as const;
const SIDE_OPTIONS = COURT_SIDES.map(courtSideLabel);

/** The dropdown order: Monday first, lowercase, the way the sheet reads. */
export const WEEKDAY_OPTIONS: string[] = [1, 2, 3, 4, 5, 6, 0].map((day) =>
  WEEKDAYS[day]!.toLowerCase(),
);

/** Stored weekday number (0 = Sunday) → the label the sheet carries. */
export function weekdayLabel(day: number): string {
  return WEEKDAYS[day]?.toLowerCase() ?? "";
}

/** Widths for the template columns, in the same order. */
const COLUMN_WIDTHS = [30, 16, 12, 12, 12, 14, 14, 10, 38];

export type StudentsWorkbookOptions = {
  /** Configured blocks offered in the `hora` dropdown; empty leaves it free. */
  slots?: readonly string[];
  /** Rows under the header, used when rebuilding a completed sheet. */
  rows?: readonly (readonly string[])[];
};

/** Escapes text for XML element content. The quotes of a list stay literal. */
function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 0 → "A", 7 → "H", 26 → "AA". */
function columnLetter(index: number): string {
  let remaining = index + 1;
  let letters = "";
  while (remaining > 0) {
    const letter = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + letter) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return letters;
}

/** "B7" → 1. Cells always come with their reference in a workbook we read. */
function columnIndex(reference: string): number {
  let index = 0;
  for (const char of reference) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

function inlineCell(reference: string, value: string, style: number): string {
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

/**
 * One `dataValidation` per closed column. Excel caps an inline list at 255
 * characters, so a block list that long is dropped and the parser still checks it.
 */
function validationsXml(slots: readonly string[]): string {
  const columns: readonly string[] = TEMPLATE_COLUMNS;
  const lists: Array<[TemplateColumn, readonly string[]]> = [
    ["tipo", TYPE_OPTIONS],
    ["pago", PAY_OPTIONS],
    ["categoria", CATEGORIES],
    ["posicion", SIDE_OPTIONS],
    ["dia", WEEKDAY_OPTIONS],
    ["hora", [...new Set(slots)]],
  ];

  const rules: string[] = [];
  for (const [column, values] of lists) {
    if (values.length === 0) continue;
    const formula = `"${values.join(",")}"`;
    if (formula.length > 255) continue;
    const index = columns.indexOf(column);
    const ref = `${columnLetter(index)}2:${columnLetter(index)}${LAST_ROW}`;
    rules.push(
      `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${ref}"><formula1>${xml(formula)}</formula1></dataValidation>`,
    );
  }

  return rules.length === 0
    ? ""
    : `<dataValidations count="${rules.length}">${rules.join("")}</dataValidations>`;
}

/** The `xl/worksheets/sheet1.xml` part: header, optional rows and the dropdowns. */
export function studentsSheetXml(options: StudentsWorkbookOptions = {}): string {
  const columns: readonly string[] = TEMPLATE_COLUMNS;
  const cols = COLUMN_WIDTHS.map(
    (width, index) =>
      `<col min="${index + 1}" max="${index + 1}" width="${width}" style="${TEXT_STYLE}" customWidth="1"/>`,
  ).join("");
  const header = columns
    .map((name, index) => inlineCell(`${columnLetter(index)}1`, name, HEADER_STYLE))
    .join("");
  const body = (options.rows ?? [])
    .map((row, rowIndex) => {
      const number = rowIndex + 2;
      const cells = row
        .map((value, index) =>
          value === "" ? "" : inlineCell(`${columnLetter(index)}${number}`, value, TEXT_STYLE),
        )
        .join("");
      return `<row r="${number}">${cells}</row>`;
    })
    .join("");

  return [
    XML_HEAD,
    `<worksheet xmlns="${NS_MAIN}">`,
    `<dimension ref="A1:${columnLetter(columns.length - 1)}${LAST_ROW}"/>`,
    `<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`,
    `<cols>${cols}</cols>`,
    `<sheetData><row r="1">${header}</row>${body}</sheetData>`,
    validationsXml(options.slots ?? []),
    "</worksheet>",
  ].join("");
}

function contentTypesXml(): string {
  return [
    XML_HEAD,
    `<Types xmlns="${NS_CONTENT_TYPES}">`,
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`,
    "</Types>",
  ].join("");
}

function packageRelationshipsXml(): string {
  return `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml(): string {
  return `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Alumnos" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function workbookRelationshipsXml(): string {
  return `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`;
}

/** Two fonts (normal, bold) and a text format (`49` is the built-in `@`). */
function stylesXml(): string {
  return [
    XML_HEAD,
    `<styleSheet xmlns="${NS_MAIN}">`,
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>`,
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`,
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`,
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`,
    `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>`,
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`,
    "</styleSheet>",
  ].join("");
}

export async function buildStudentsWorkbook(
  options: StudentsWorkbookOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  const parts: Array<[string, string]> = [
    ["[Content_Types].xml", contentTypesXml()],
    ["_rels/.rels", packageRelationshipsXml()],
    ["xl/workbook.xml", workbookXml()],
    ["xl/_rels/workbook.xml.rels", workbookRelationshipsXml()],
    ["xl/styles.xml", stylesXml()],
    ["xl/worksheets/sheet1.xml", studentsSheetXml(options)],
  ];
  return zip(
    parts.map(([name, text]) => ({ name, data: encoder.encode(text) })),
    "deflate",
  );
}

// --- ZIP -------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index++)
    crc = CRC_TABLE[(crc ^ data[index]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function transform(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  // The stream wants a view over a plain ArrayBuffer, which a slice is not.
  const input = new Uint8Array(data.byteLength);
  input.set(data);
  const writer = stream.writable.getWriter();
  const pending = writer.write(input).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  await pending;
  return concat(chunks);
}

const deflateRaw = (data: Uint8Array): Promise<Uint8Array> =>
  transform(data, new CompressionStream("deflate-raw"));
const inflateRaw = (data: Uint8Array): Promise<Uint8Array> =>
  transform(data, new DecompressionStream("deflate-raw"));

export type ZipEntry = { name: string; data: Uint8Array };

/**
 * Minimal ZIP writer. `store` keeps the bytes as they are; `deflate` shrinks them
 * with the platform stream, and falls back to stored entries when it is missing.
 */
export async function zip(
  entries: readonly ZipEntry[],
  mode: "store" | "deflate" = "deflate",
): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  const deflate = mode === "deflate" && typeof CompressionStream !== "undefined";
  const prepared = await Promise.all(
    entries.map(async (entry) => {
      const packed = deflate ? await deflateRaw(entry.data) : entry.data;
      return {
        name: encoder.encode(entry.name),
        packed,
        size: entry.data.length,
        method: deflate ? 8 : 0,
        crc: crc32(entry.data),
      };
    }),
  );

  const localSize = prepared.reduce(
    (size, entry) => size + 30 + entry.name.length + entry.packed.length,
    0,
  );
  const centralSize = prepared.reduce((size, entry) => size + 46 + entry.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);

  let offset = 0;
  const offsets: number[] = [];
  for (const entry of prepared) {
    offsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true);
    view.setUint16(offset + 8, entry.method, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, DOS_DATE, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.packed.length, true);
    view.setUint32(offset + 22, entry.size, true);
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(entry.name, offset + 30);
    out.set(entry.packed, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.packed.length;
  }

  const centralStart = offset;
  prepared.forEach((entry, index) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, entry.method, true);
    view.setUint16(offset + 12, 0, true);
    view.setUint16(offset + 14, DOS_DATE, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.packed.length, true);
    view.setUint32(offset + 24, entry.size, true);
    view.setUint16(offset + 28, entry.name.length, true);
    view.setUint16(offset + 30, 0, true);
    view.setUint16(offset + 32, 0, true);
    view.setUint16(offset + 34, 0, true);
    view.setUint16(offset + 36, 0, true);
    view.setUint32(offset + 38, 0, true);
    view.setUint32(offset + 42, offsets[index]!, true);
    out.set(entry.name, offset + 46);
    offset += 46 + entry.name.length;
  });

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true);

  return out;
}

function endOfCentralDirectory(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= lowest; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("El archivo no es una planilla .xlsx.");
}

/** Minimal ZIP reader: every entry, decompressed when it was deflated. */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = endOfCentralDirectory(view);
  const count = view.getUint16(eocd + 10, true);
  const centralStart = view.getUint32(eocd + 16, true);
  if (centralStart === 0xffffffff) throw new Error("La planilla usa ZIP64 y no se puede leer.");

  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let offset = centralStart;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("La planilla está dañada.");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (localOffset + 30 > bytes.length) throw new Error("La planilla está dañada.");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    files.set(name, method === 0 ? raw : await inflateRaw(raw));

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// --- XLSX ------------------------------------------------------------------

export function isXlsxBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05)
  );
}

function parseXml(text: string): Document {
  if (typeof DOMParser === "undefined")
    throw new Error("Este navegador no puede leer la planilla.");
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0)
    throw new Error("La planilla está dañada.");
  return document;
}

/** Text of every `<t>` under a node, so rich-text runs are joined back. */
function nodeText(node: Element): string {
  return Array.from(node.getElementsByTagName("t"))
    .map((part) => part.textContent ?? "")
    .join("");
}

function firstSheet(files: Map<string, Uint8Array>): Uint8Array {
  const sheets = [...files.keys()]
    .map((name) => ({ name, match: /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(name) }))
    .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
  const first = sheets[0];
  const bytes = first ? files.get(first.name) : undefined;
  if (!bytes) throw new Error("La planilla no tiene hojas.");
  return bytes;
}

function sharedStrings(document: Document): string[] {
  return Array.from(document.getElementsByTagName("si")).map((item) => nodeText(item));
}

function cellValue(cell: Element, shared: readonly string[]): string {
  if (cell.getAttribute("t") === "inlineStr") return nodeText(cell);
  const raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
  if (cell.getAttribute("t") !== "s") return raw;
  const index = Number(raw);
  return Number.isInteger(index) ? (shared[index] ?? "") : "";
}

function readSheet(document: Document, shared: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const row of Array.from(document.getElementsByTagName("row"))) {
    const number = Number(row.getAttribute("r") ?? rows.length + 1);
    if (!Number.isInteger(number) || number < 1) continue;
    const target = (rows[number - 1] ??= []);
    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const index = columnIndex(cell.getAttribute("r") ?? "");
      if (index < 0) continue;
      while (target.length < index) target.push("");
      target[index] = cellValue(cell, shared);
    }
  }

  while (rows.length > 0 && rows[rows.length - 1]!.every((value) => value === "")) rows.pop();
  return rows.map((row) => {
    const copy = [...row];
    while (copy.length > 0 && copy[copy.length - 1] === "") copy.pop();
    return copy;
  });
}

/** Rows of the first worksheet, cells as strings, gaps kept in place. */
export async function readStudentsWorkbook(source: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const files = await unzip(bytes);
  const sheet = firstSheet(files);
  const shared = files.get("xl/sharedStrings.xml");
  const decoder = new TextDecoder();
  return readSheet(
    parseXml(decoder.decode(sheet)),
    shared ? sharedStrings(parseXml(decoder.decode(shared))) : [],
  );
}

/**
 * The reader hands the same text the paste box gets, so the preview and the
 * validation stay in one place. A cell cannot carry a tab or a line break.
 */
export function rowsToTsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) => {
      const cells = row.map((cell) => cell.replace(/[\t\r\n]+/g, " ").trim());
      while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      return cells.join("\t");
    })
    .join("\n");
}
