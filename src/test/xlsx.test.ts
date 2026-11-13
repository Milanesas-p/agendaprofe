import { describe, expect, it } from "vitest";

import { parseStudents, TEMPLATE_COLUMNS } from "@/lib/import";
import {
  buildStudentsWorkbook,
  isXlsxBytes,
  readStudentsWorkbook,
  rowsToTsv,
  unzip,
  weekdayLabel,
  WEEKDAY_OPTIONS,
  zip,
} from "@/lib/xlsx";

const SLOTS = ["08:00", "09:00", "14:00"];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function part(bytes: Uint8Array, name: string): Promise<string> {
  const files = await unzip(bytes);
  const entry = files.get(name);
  if (!entry) throw new Error(`missing ${name}`);
  return decoder.decode(entry);
}

/** Each validation as `[sqref, list]`, in sheet order. */
function validations(xml: string): Array<[string, string]> {
  return [
    ...xml.matchAll(/<dataValidation\b[^>]*sqref="([^"]+)"[^>]*>\s*<formula1>([^<]*)<\/formula1>/g),
  ].map((match) => [match[1]!, match[2]!]);
}

describe("students workbook", () => {
  it("ships a header row the parser already accepts", async () => {
    const rows = await readStudentsWorkbook(await buildStudentsWorkbook({ slots: SLOTS }));

    expect(rows[0]).toEqual([...TEMPLATE_COLUMNS]);
    expect(parseStudents(rowsToTsv(rows)).error).toBeNull();
  });

  it("puts a dropdown on every closed column", async () => {
    const xml = await part(
      await buildStudentsWorkbook({ slots: SLOTS }),
      "xl/worksheets/sheet1.xml",
    );
    const lists = Object.fromEntries(validations(xml));

    expect(validations(xml).map(([ref]) => ref)).toEqual([
      "C2:C201",
      "D2:D201",
      "E2:E201",
      "F2:F201",
      "G2:G201",
      "H2:H201",
    ]);
    expect(lists["C2:C201"]).toBe('"fijo,rotativo"');
    expect(lists["D2:D201"]).toBe('"Mensual,Pago individual,Paga grupal"');
    expect(lists["E2:E201"]).toBe('"1ra,2da,3ra,4ta,5ta,6ta firme,6ta,7ma firme,7ma,8va firme,8va"');
    expect(lists["F2:F201"]).toBe('"Drive,Revés,Indistinto"');
    expect(lists["G2:G201"]).toBe('"lunes,martes,miércoles,jueves,viernes,sábado,domingo"');
    expect(lists["H2:H201"]).toBe('"08:00,09:00,14:00"');
  });

  it("marks the data columns as text so times and categories stay as typed", async () => {
    const bytes = await buildStudentsWorkbook({ slots: SLOTS });
    const sheet = await part(bytes, "xl/worksheets/sheet1.xml");
    const styles = await part(bytes, "xl/styles.xml");

    expect(sheet).toContain('<col min="1" max="1"');
    expect(sheet).toContain('style="2"');
    expect(styles).toContain('numFmtId="49"');
  });

  it("skips the hora dropdown when the blocks would not fit a list", async () => {
    const many = Array.from(
      { length: 50 },
      (_, i) =>
        `${String(8 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
    );
    const xml = await part(
      await buildStudentsWorkbook({ slots: many }),
      "xl/worksheets/sheet1.xml",
    );

    expect(validations(xml).map(([ref]) => ref)).not.toContain("H2:H201");
    expect(validations(xml)).toHaveLength(5);
  });

  it("leaves the hora column free when no blocks are configured", async () => {
    const xml = await part(await buildStudentsWorkbook({ slots: [] }), "xl/worksheets/sheet1.xml");

    expect(validations(xml).map(([ref]) => ref)).not.toContain("H2:H201");
  });

  it("round trips a completed sheet into the student parser", async () => {
    const bytes = await buildStudentsWorkbook({
      slots: SLOTS,
      rows: [["Maxi Salas", "2302666351", "fijo", "mensual", "8va", "Revés", "lunes", "14:00"]],
    });
    const report = parseStudents(rowsToTsv(await readStudentsWorkbook(bytes)), {
      allowedSlots: SLOTS,
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      name: "Maxi Salas",
      phone: "5492302666351",
      type: "fijo",
      pay: "mensual",
      category: "8va",
      courtSide: "reves",
      recurringWeekday: 1,
      recurringTime: "14:00",
      error: null,
    });
  });

  it("keeps the student id in the last column", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const bytes = await buildStudentsWorkbook({
      slots: SLOTS,
      rows: [["Maxi Salas", "2302666351", "fijo", "mensual", "8va", "Revés", "lunes", "14:00", id]],
    });
    const rows = await readStudentsWorkbook(bytes);

    expect(rows[0]?.at(-1)).toBe("id");
    expect(rows[1]?.at(-1)).toBe(id);
  });
});

describe("weekday labels", () => {
  it("offers Monday first, lowercase and accented, like the sheet", () => {
    expect(WEEKDAY_OPTIONS).toEqual([
      "lunes",
      "martes",
      "miércoles",
      "jueves",
      "viernes",
      "sábado",
      "domingo",
    ]);
  });

  it("turns the stored weekday number into the sheet label", () => {
    expect(weekdayLabel(0)).toBe("domingo");
    expect(weekdayLabel(3)).toBe("miércoles");
    expect(weekdayLabel(9)).toBe("");
  });
});

describe("reading a workbook written by Excel or Sheets", () => {
  const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="inlineStr"><is><t>8va</t></is></c></row>
</sheetData></worksheet>`;
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>nombre</t></si><si><t>telefono</t></si><si><t>Maxi &amp; Salas</t></si></sst>`;

  async function workbook(): Promise<Uint8Array> {
    return zip(
      [
        { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheet) },
        { name: "xl/sharedStrings.xml", data: encoder.encode(sharedStrings) },
      ],
      "deflate",
    );
  }

  it("reads shared and inline strings from a deflated zip", async () => {
    const rows = await readStudentsWorkbook(await workbook());

    expect(rows[0]).toEqual(["nombre", "telefono"]);
    expect(rows[1]).toEqual(["Maxi & Salas", "", "8va"]);
  });

  it("rejects a file that is not a zip", async () => {
    await expect(readStudentsWorkbook(new Uint8Array([0x4d, 0x61, 0x72]))).rejects.toThrow();
  });

  it("rejects a zip without a worksheet", async () => {
    const bytes = await zip([{ name: "hola.txt", data: encoder.encode("hola") }], "store");

    await expect(readStudentsWorkbook(bytes)).rejects.toThrow();
  });
});

describe("workbook bytes", () => {
  it("recognizes the zip signature Excel writes", () => {
    expect(isXlsxBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(isXlsxBytes(new Uint8Array([0x6e, 0x6f, 0x6d, 0x62]))).toBe(false);
    expect(isXlsxBytes(new Uint8Array([]))).toBe(false);
  });

  it("records the original size in the zip headers, not the compressed one", async () => {
    const data = encoder.encode("hola mundo ".repeat(200));
    const bytes = await zip([{ name: "a.txt", data }], "deflate");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint32(18, true)).toBeLessThan(data.length);
    expect(view.getUint32(22, true)).toBe(data.length);
    const centralStart = view.getUint32(bytes.length - 22 + 16, true);
    expect(view.getUint32(centralStart + 20, true)).toBe(view.getUint32(18, true));
    expect(view.getUint32(centralStart + 24, true)).toBe(data.length);
  });

  it("turns rows into tab separated text the parser understands", () => {
    expect(
      rowsToTsv([
        ["a\tb", "c\nd"],
        ["e", ""],
      ]),
    ).toBe("a b\tc d\ne");
  });
});
