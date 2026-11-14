import { describe, expect, it } from "vitest";

import { parseStudents } from "@/lib/import";
import {
  buildStudentsWorkbook,
  cellText,
  readStudentsWorkbook,
  rowsToTsv,
  scheduleCells,
} from "@/lib/xlsx";

const SLOTS = ["08:00", "09:00", "11:00", "12:00"];

describe("scheduleCells", () => {
  it("returns empty cells when the student has no slots", () => {
    expect(scheduleCells([])).toEqual({ dia: "", hora: "" });
  });

  it("joins the days that share one time", () => {
    expect(scheduleCells([{ weekday: 2, time: "09:00" }, { weekday: 5, time: "09:00" }])).toEqual({
      dia: "martes y viernes",
      hora: "09:00",
    });
  });

  it("writes one time per day when they differ", () => {
    expect(scheduleCells([{ weekday: 2, time: "11:00" }, { weekday: 6, time: "12:00" }])).toEqual({
      dia: "martes y sábado",
      hora: "martes 11:00 - sábado 12:00",
    });
  });

  it("round-trips several slots through the sheet", async () => {
    const slots = [{ weekday: 2, time: "11:00" }, { weekday: 6, time: "12:00" }];
    const { dia, hora } = scheduleCells(slots);
    const bytes = await buildStudentsWorkbook({
      slots: SLOTS,
      rows: [["A", "", "fijo", "", "", "", dia, hora, ""]],
    });
    const report = parseStudents(rowsToTsv(await readStudentsWorkbook(bytes)), { allowedSlots: SLOTS });

    expect(report.rows[0]?.slots).toEqual(slots);
  });
});

describe("cellText", () => {
  it("expands a phone stored in exponent form", () => {
    expect(cellText("3.544612527E9")).toBe("3544612527");
  });

  it("leaves every other value alone", () => {
    expect(cellText("3544612527")).toBe("3544612527");
    expect(cellText("8AM")).toBe("8AM");
  });
});
