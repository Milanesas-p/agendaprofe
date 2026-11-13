import { describe, expect, it } from "vitest";

import { decodeImportFile, parseStudents } from "@/lib/import";

const header = "nombre\ttelefono\ttipo\tpago\tcategoria\tposicion\tdia\thora";

describe("importing students from pasted text", () => {
  it("reads a tab-separated copy straight out of Excel", () => {
    const report = parseStudents(
      [header, "Maxi Salas\t2302666351\tfijo\tmensual\t8va\treves\tlunes\t14:00"].join("\n"),
      { allowedSlots: ["14:00"] },
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      line: 2,
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

  it("accepts commas and semicolons too", () => {
    const comma = parseStudents(`nombre,telefono\nMaxi Salas,2302666351\n`, { allowedSlots: [] });
    const semicolon = parseStudents(`nombre;telefono\nPepe Mujica;1141234567\n`, { allowedSlots: [] });

    expect(comma.rows[0]?.name).toBe("Maxi Salas");
    expect(semicolon.rows[0]?.name).toBe("Pepe Mujica");
  });

  it("asks for a header row instead of guessing", () => {
    const report = parseStudents("Maxi Salas\t2302666351", { allowedSlots: [] });

    expect(report.rows).toEqual([]);
    expect(report.error).toBe("La primera fila tiene que traer los títulos de las columnas.");
  });

  it("fills the defaults: rotativo and mensual when nothing is said", () => {
    const report = parseStudents("nombre,telefono\nMaxi Salas,\n", { allowedSlots: [] });

    expect(report.rows[0]).toMatchObject({ type: "rotativo", pay: "mensual", category: null, courtSide: null });
  });

  it("defaults to fijo when the row carries a weekly slot", () => {
    const report = parseStudents("nombre,dia,hora\nMaxi Salas,viernes,18:00\n", { allowedSlots: ["18:00"] });

    expect(report.rows[0]).toMatchObject({ type: "fijo", recurringWeekday: 5, recurringTime: "18:00" });
  });

  it("keeps the good rows and explains the broken ones", () => {
    const report = parseStudents(
      [
        "nombre,telefono,categoria",
        "Maxi Salas,2302666351,8va",
        ",2302666351,4ta",
        "Pepe Mujica,2302666351,novena",
        "Juan Gomez,no-es-un-telefono,",
      ].join("\n"),
      { allowedSlots: [] },
    );

    expect(report.rows.map((r) => r.error)).toEqual([
      null,
      "Falta el nombre.",
      "Categoría inválida: novena.",
      "El teléfono tiene que tener números.",
    ]);
    expect(report.ready).toHaveLength(1);
  });

  it("rejects a weekly slot that is not one of the blocks", () => {
    const report = parseStudents("nombre,dia,hora\nMaxi Salas,sabado,07:30\n", { allowedSlots: ["08:00"] });

    expect(report.rows[0]?.error).toBe("El horario 07:30 no está entre tus bloques.");
  });

  it("rejects a slot with only one side", () => {
    const report = parseStudents("nombre,dia\nMaxi Salas,lunes\n", { allowedSlots: [] });

    expect(report.rows[0]?.error).toBe("El horario fijo necesita día y hora.");
  });

  it("ignores blank lines and spaces around the cells", () => {
    const report = parseStudents("nombre , telefono\n\n  Maxi Salas  ,  2302666351  \n\n", { allowedSlots: [] });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ line: 3, name: "Maxi Salas", phone: "5492302666351" });
  });

  it("reads the time the way Google Sheets exports it", () => {
    const report = parseStudents(
      "nombre,dia,hora\nA,lunes,14:00:00\nB,martes,2:00 PM\nC,miercoles,2:00 p. m.\nD,jueves,12:30 a. m.\n",
      { allowedSlots: ["14:00", "00:30"] },
    );

    expect(report.rows.map((r) => r.error)).toEqual([null, null, null, null]);
    expect(report.rows.map((r) => r.recurringTime)).toEqual(["14:00", "14:00", "14:00", "00:30"]);
  });

  it("rejects a twelve-hour time that does not exist", () => {
    const report = parseStudents("nombre,dia,hora\nMaxi Salas,lunes,13:00 PM\n", { allowedSlots: [] });

    expect(report.rows[0]?.error).toBe("Hora inválida: 13:00 PM. Usá HH:MM.");
  });

  it("reads weekday names without accents or in numbers", () => {
    const report = parseStudents("nombre,dia,hora\nA,miercoles,09:00\nB,Miércoles,09:00\nC,3,09:00\n", {
      allowedSlots: ["09:00"],
    });

    expect(report.rows.map((r) => r.recurringWeekday)).toEqual([3, 3, 3]);
  });
});

describe("reading a completed file", () => {
  it("reads a time that a spreadsheet stored as a fraction of a day", () => {
    const report = parseStudents("nombre,dia,hora\nA,lunes,0.583333333333333\nB,martes,0.5\n", {
      allowedSlots: ["14:00", "12:00"],
    });

    expect(report.rows.map((row) => row.recurringTime)).toEqual(["14:00", "12:00"]);
    expect(report.rows.map((row) => row.error)).toEqual([null, null]);
  });

  it("ignores the instruction comment without shifting the line numbers", () => {
    const report = parseStudents("# completá una fila por alumno\nnombre,telefono\nMaxi Salas,2302666351");

    expect(report.rows[0]).toMatchObject({ line: 3, name: "Maxi Salas" });
  });

  it("decodes a UTF-8 file and drops the BOM Excel adds", () => {
    const bytes = new Uint8Array(new TextEncoder().encode("\uFEFFnombre;telefono\nMaría;123"));

    expect(decodeImportFile(bytes.buffer)).toBe("nombre;telefono\nMaría;123");
  });

  it("falls back to the ANSI code page when the file is not UTF-8", () => {
    // "María" in windows-1252: 0xED is a lone continuation byte in UTF-8.
    const bytes = new Uint8Array([0x4d, 0x61, 0x72, 0xed, 0x61]);

    expect(decodeImportFile(bytes.buffer)).toBe("María");
  });
});
