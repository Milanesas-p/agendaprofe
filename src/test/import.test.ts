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
      slots: [{ weekday: 1, time: "14:00" }],
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

  it("fills the defaults: rotativo and no payment mode when nothing is said", () => {
    const report = parseStudents("nombre,telefono\nMaxi Salas,\n", { allowedSlots: [] });

    expect(report.rows[0]).toMatchObject({ type: "rotativo", pay: null, category: null, courtSide: null });
  });

  it("reads the three payment modes from their labels", () => {
    const report = parseStudents(
      "nombre,pago\nA,Mensual\nB,Pago individual\nC,Paga grupal\nD,semanal\n",
      { allowedSlots: [] },
    );

    expect(report.rows.map((row) => row.pay)).toEqual(["mensual", "individual", "grupal", null]);
    expect(report.rows.map((row) => row.error)).toEqual([
      null,
      null,
      null,
      "Pago inválido: semanal. Usá Mensual, Pago individual o Paga grupal.",
    ]);
  });

  it("rejects a literal Sin definir cell instead of accepting it as a mode", () => {
    const report = parseStudents("nombre,pago\nA,Sin definir\n", { allowedSlots: [] });

    expect(report.rows[0]?.error).toBe("Pago inválido: Sin definir. Usá Mensual, Pago individual o Paga grupal.");
  });

  it("reads the firme categories the teacher uses", () => {
    const report = parseStudents(
      "nombre,categoria\nA,6ta firme\nB,7ma firme\nC,8va firme\nD,8va Firme\n",
      { allowedSlots: [] },
    );

    expect(report.rows.map((row) => row.category)).toEqual([
      "6ta firme",
      "7ma firme",
      "8va firme",
      "8va firme",
    ]);
    expect(report.rows.map((row) => row.error)).toEqual([null, null, null, null]);
  });

  it("keeps a row without tipo as rotativo even when it names a usual slot", () => {
    const report = parseStudents("nombre,dia,hora\nMaxi Salas,viernes,18:00\n", { allowedSlots: ["18:00"] });

    expect(report.rows[0]).toMatchObject({ type: "rotativo", slots: [{ weekday: 5, time: "18:00" }] });
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
      "nombre,dia,hora\nA,lunes,14:00:00\nB,martes,2:00 PM\nC,miercoles,2:00 p. m.\nD,jueves,12:30 a. m.\nE,viernes,14h30\n",
      { allowedSlots: ["14:00", "00:30", "14:30"] },
    );

    expect(report.rows.map((r) => r.error)).toEqual([null, null, null, null, null]);
    expect(report.rows.map((r) => r.slots[0]?.time)).toEqual(["14:00", "14:00", "14:00", "00:30", "14:30"]);
  });

  it("rejects a twelve-hour time that does not exist", () => {
    const report = parseStudents("nombre,dia,hora\nMaxi Salas,lunes,13:00 PM\n", { allowedSlots: [] });

    expect(report.rows[0]?.error).toBe("Hora inválida: 13:00 PM. Usá 8AM, 15hs o HH:MM.");
  });

  it("reads weekday names without accents or in numbers", () => {
    const report = parseStudents("nombre,dia,hora\nA,miercoles,09:00\nB,Miércoles,09:00\nC,3,09:00\n", {
      allowedSlots: ["09:00"],
    });

    expect(report.rows.map((r) => r.slots[0]?.weekday)).toEqual([3, 3, 3]);
  });
});

describe("editing students from the sheet", () => {
  const ID = "11111111-1111-4111-8111-111111111111";

  it("reads the id column and marks the row for update", () => {
    const report = parseStudents(`nombre,telefono,id\nMaxi Salas,2302666351,${ID}`, {
      allowedSlots: [],
      knownIds: new Set([ID]),
    });

    expect(report.rows[0]).toMatchObject({ id: ID, name: "Maxi Salas", error: null });
  });

  it("creates a row that carries no id", () => {
    const report = parseStudents("nombre,telefono\nMaxi Salas,2302666351", {
      allowedSlots: [],
      knownIds: new Set([ID]),
    });

    expect(report.rows[0]?.id).toBeNull();
    expect(report.rows[0]?.error).toBeNull();
  });

  it("rejects an id that no longer exists instead of creating a duplicate", () => {
    const report = parseStudents(`nombre,id\nMaxi Salas,${ID}`, { allowedSlots: [], knownIds: new Set() });

    expect(report.rows[0]?.error).toBe("Ese alumno ya no existe. Volvé a descargar la plantilla.");
    expect(report.ready).toHaveLength(0);
  });

  it("rejects the same student twice in one sheet", () => {
    const report = parseStudents(`nombre,id\nA,${ID}\nB,${ID}`, {
      allowedSlots: [],
      knownIds: new Set([ID]),
    });

    expect(report.rows.map((row) => row.error)).toEqual([null, "Este alumno está repetido en la plantilla."]);
    expect(report.ready).toHaveLength(1);
  });

  it("rejects an id that is not a student id", () => {
    const report = parseStudents("nombre,id\nA,no-es-un-id", { allowedSlots: [], knownIds: new Set() });

    expect(report.rows[0]?.error).toBe("El id no es válido. No edites esa columna.");
  });

  it("rejects an id with characters outside the stored shape", () => {
    const report = parseStudents("nombre,id\nA,zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz", {
      allowedSlots: [],
      knownIds: new Set(),
    });

    expect(report.rows[0]?.error).toBe("El id no es válido. No edites esa columna.");
  });

  it("accepts the id with surrounding spaces", () => {
    const report = parseStudents(`nombre,id\nA,  ${ID}  `, { allowedSlots: [], knownIds: new Set([ID]) });

    expect(report.rows[0]?.id).toBe(ID);
    expect(report.rows[0]?.error).toBeNull();
  });

  it("flags the second row even when the first one already failed", () => {
    const report = parseStudents(`nombre,id\n,${ID}\nB,${ID}`, {
      allowedSlots: [],
      knownIds: new Set([ID]),
    });

    expect(report.rows.map((row) => row.error)).toEqual([
      "Falta el nombre.",
      "Este alumno está repetido en la plantilla.",
    ]);
  });
});

describe("reading a completed file", () => {
  it("reads a time that a spreadsheet stored as a fraction of a day", () => {
    const report = parseStudents("nombre,dia,hora\nA,lunes,0.583333333333333\nB,martes,0.5\n", {
      allowedSlots: ["14:00", "12:00"],
    });

    expect(report.rows.map((row) => row.slots[0]?.time)).toEqual(["14:00", "12:00"]);
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

describe("reading the teacher's own notation", () => {
  it("splits two days that share one time", () => {
    const report = parseStudents("nombre,tipo,dia,hora\nFernanda Castro,fijo,Martes y viernes,8AM\n", {
      allowedSlots: ["08:00"],
    });

    expect(report.rows[0]).toMatchObject({
      type: "fijo",
      slots: [{ weekday: 2, time: "08:00" }, { weekday: 5, time: "08:00" }],
    });
  });

  it("pairs each day with its own time", () => {
    const report = parseStudents(
      "nombre,tipo,dia,hora\nCatalina,fijo,Martes y sabado,martes 11hs - sab 12hs\n",
      { allowedSlots: ["11:00", "12:00"] },
    );

    expect(report.rows[0]?.slots).toEqual([
      { weekday: 2, time: "11:00" },
      { weekday: 6, time: "12:00" },
    ]);
  });

  it("reads the shorthand the teacher uses", () => {
    const report = parseStudents("nombre,dia,hora\nA,miercoles y viernes,Mier-16hs Vier 14hs\n", {
      allowedSlots: ["16:00", "14:00"],
    });

    expect(report.rows[0]?.slots).toEqual([
      { weekday: 3, time: "16:00" },
      { weekday: 5, time: "14:00" },
    ]);
  });

  it("maps comodin to indistinto", () => {
    const report = parseStudents("nombre,posicion\nA,comodin\n", { allowedSlots: [] });

    expect(report.rows[0]?.courtSide).toBe("indistinto");
  });

  it("rejects a day it cannot recognize instead of dropping it", () => {
    const report = parseStudents("nombre,dia,hora\nA,martes y vir,vie 9hs\n", { allowedSlots: [] });

    expect(report.rows[0]?.error).toBe("Día inválido: martes y vir.");
  });
});
describe("the second slot pair", () => {
  const header = "nombre,tipo,dia,hora,dia 2,hora 2";

  it("reads the two days from their own columns", () => {
    const report = parseStudents(`${header}\nFernanda,fijo,martes,8AM,jueves,16:00\n`, {
      allowedSlots: ["08:00", "16:00"],
    });

    expect(report.rows[0]?.slots).toEqual([
      { weekday: 2, time: "08:00" },
      { weekday: 4, time: "16:00" },
    ]);
    expect(report.rows[0]?.error).toBeNull();
  });

  it("still reads a sheet without the second pair", () => {
    const report = parseStudents("nombre,dia,hora\nA,lunes,9hs\n", { allowedSlots: ["09:00"] });

    expect(report.rows[0]?.slots).toEqual([{ weekday: 1, time: "09:00" }]);
  });

  it("asks for both cells when the second pair is half filled", () => {
    const withoutTime = parseStudents(`${header}\nA,fijo,lunes,9hs,jueves,\n`, {
      allowedSlots: ["09:00"],
    });
    const withoutDay = parseStudents(`${header}\nA,fijo,lunes,9hs,,16:00\n`, {
      allowedSlots: ["09:00", "16:00"],
    });

    expect(withoutTime.rows[0]?.error).toBe(
      "Segundo horario: El horario fijo necesita día y hora.",
    );
    expect(withoutDay.rows[0]?.error).toBe("Segundo horario: El horario fijo necesita día y hora.");
  });

  it("does not duplicate a slot written in both pairs", () => {
    const report = parseStudents(`${header}\nA,fijo,lunes,9hs,lunes,9hs\n`, {
      allowedSlots: ["09:00"],
    });

    expect(report.rows[0]?.slots).toEqual([{ weekday: 1, time: "09:00" }]);
  });

  it("checks the second pair against the configured blocks too", () => {
    const report = parseStudents(`${header}\nA,fijo,lunes,9hs,jueves,16:00\n`, {
      allowedSlots: ["09:00"],
    });

    expect(report.rows[0]?.error).toBe("El horario 16:00 no está entre tus bloques.");
  });
});