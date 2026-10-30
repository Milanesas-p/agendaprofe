import { describe, it, expect } from "vitest";
import { applyStatus, type Lesson, type Student } from "@/lib/store";

const s: Student = { id: "a", name: "A", type: "fijo", pay: "mensual", phone: null, category: null, courtSide: null, recurringWeekday: null, recurringTime: null, balance: 3 };
const l = (status: Lesson["status"]): Lesson => ({ id: "l", date: "2026-01-01", start: "09:00", studentId: "a", status, notified: false });

describe("descuento automático", () => {
  it("presente resta una clase", () => expect(applyStatus(l("programada"), s, "presente").balance).toBe(2));
  it("ausente también resta una clase", () => expect(applyStatus(l("programada"), s, "ausente").balance).toBe(2));
  it("cambiar presente→ausente no descuenta dos veces", () => expect(applyStatus(l("presente"), s, "ausente").balance).toBe(3));
  it("deshacer devuelve la clase", () => expect(applyStatus(l("ausente"), s, "programada").balance).toBe(4));
});

describe("confirmar un alumno no cuesta una clase", () => {
  it("programada→confirmado deja el saldo igual", () => expect(applyStatus(l("programada"), s, "confirmado").balance).toBe(3));
  it("confirmado→presente recién ahí descuenta", () => expect(applyStatus(l("confirmado"), s, "presente").balance).toBe(2));
  it("volver de presente a confirmado devuelve la clase", () => expect(applyStatus(l("presente"), s, "confirmado").balance).toBe(4));
  it("cancelar desde confirmado tampoco descuenta", () => expect(applyStatus(l("confirmado"), s, "cancelada").balance).toBe(3));
  it("una clase cancelada que se confirma sigue sin descontar", () => expect(applyStatus(l("cancelada"), s, "confirmado").balance).toBe(3));
});
