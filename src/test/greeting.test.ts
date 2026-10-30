import { describe, expect, it } from "vitest";

import { greeting } from "@/lib/greeting";

describe("saludo según la hora local", () => {
  it("saluda a la mañana desde las 6", () => {
    expect(greeting(6)).toBe("Buenos días");
    expect(greeting(11)).toBe("Buenos días");
  });

  it("saluda a la tarde desde el mediodía", () => {
    expect(greeting(12)).toBe("Buenas tardes");
    expect(greeting(19)).toBe("Buenas tardes");
  });

  it("saluda a la noche desde las 20 y de madrugada", () => {
    expect(greeting(20)).toBe("Buenas noches");
    expect(greeting(23)).toBe("Buenas noches");
    expect(greeting(0)).toBe("Buenas noches");
    expect(greeting(5)).toBe("Buenas noches");
  });

  it("no inventa un saludo con una hora que no existe", () => {
    expect(greeting(-1)).toBe("Buenas");
    expect(greeting(24)).toBe("Buenas");
    expect(greeting(Number.NaN)).toBe("Buenas");
  });
});
