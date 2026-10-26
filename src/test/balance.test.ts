import { describe, it, expect } from "vitest";
import { applyStatus, type Lesson, type Student } from "@/lib/store";

const s: Student = { id: "a", name: "A", type: "fijo", pay: "mensual", balance: 3 };
const l = (status: Lesson["status"]): Lesson => ({ id: "l", date: "2026-01-01", start: "09:00", studentId: "a", status });

describe("descuento automático", () => {
  it("presente resta una clase", () => expect(applyStatus(l("programada"), s, "presente").balance).toBe(2));
  it("ausente también resta una clase", () => expect(applyStatus(l("programada"), s, "ausente").balance).toBe(2));
  it("cambiar presente→ausente no descuenta dos veces", () => expect(applyStatus(l("presente"), s, "ausente").balance).toBe(3));
  it("deshacer devuelve la clase", () => expect(applyStatus(l("ausente"), s, "programada").balance).toBe(4));
});
