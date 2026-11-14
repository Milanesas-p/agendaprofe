import { describe, expect, it } from "vitest";

import { PAY_MODES, payLabel, payOf } from "@/lib/pay";
import { parseStudents } from "@/lib/import";
import { buildStudentsWorkbook, readStudentsWorkbook, rowsToTsv } from "@/lib/xlsx";

describe("payment modes", () => {
  it("keeps the three modes the teacher uses", () => {
    expect(PAY_MODES).toEqual(["mensual", "individual", "grupal"]);
  });

  it("labels them the way the screen and the sheet read", () => {
    expect(payLabel("mensual")).toBe("Mensual");
    expect(payLabel("individual")).toBe("Pago individual");
    expect(payLabel("grupal")).toBe("Paga grupal");
    expect(payLabel(null)).toBe("Sin definir");
  });

  it("reads the stored token", () => {
    expect(payOf("mensual")).toBe("mensual");
    expect(payOf("individual")).toBe("individual");
    expect(payOf("grupal")).toBe("grupal");
  });

  it("reads the label from the sheet, without case or accents", () => {
    expect(payOf("Mensual")).toBe("mensual");
    expect(payOf("pago individual")).toBe("individual");
    expect(payOf("Paga Grupal")).toBe("grupal");
    expect(payOf("  INDIVIDUAL ")).toBe("individual");
  });

  it("rejects the retired mode and empty values", () => {
    expect(payOf("semanal")).toBeNull();
    expect(payOf("")).toBeNull();
  });
});

describe("payment modes through the sheet", () => {
  it("round-trips the three modes through a prefilled workbook", async () => {
    const rows = PAY_MODES.map((mode, index) => [
      `Alumno ${index}`,
      "",
      "fijo",
      payLabel(mode),
      "",
      "",
      "",
      "",
      `11111111-1111-4111-8${index}11-111111111111`,
    ]);
    const report = parseStudents(
      rowsToTsv(await readStudentsWorkbook(await buildStudentsWorkbook({ slots: [], rows }))),
      { allowedSlots: [] },
    );

    expect(report.ready.map((row) => row.pay)).toEqual([...PAY_MODES]);
  });

  it("keeps a blank payment blank instead of guessing mensual", async () => {
    const rows = [["Alumno sin pago", "", "fijo", "", "", "", "", "", "11111111-1111-4111-8111-111111111111"]];
    const report = parseStudents(
      rowsToTsv(await readStudentsWorkbook(await buildStudentsWorkbook({ slots: [], rows }))),
      { allowedSlots: [] },
    );

    expect(report.ready[0]?.pay).toBeNull();
  });
});
