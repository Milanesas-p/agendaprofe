import { describe, expect, it } from "vitest";

import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("adds the Argentine country code to a local number", () => {
    expect(normalizePhone("2302666351")).toBe("5492302666351");
    expect(normalizePhone("(2302) 66-6351")).toBe("5492302666351");
    expect(normalizePhone("+54 9 2302-666351")).toBe("5492302666351");
  });

  it("drops the domestic trunk zero before adding the country code", () => {
    expect(normalizePhone("02302 666351")).toBe("5492302666351");
    expect(normalizePhone("011 4123-4567")).toBe("5491141234567");
  });

  it("completes an Argentine number that is missing the mobile nine", () => {
    expect(normalizePhone("+54 2302 666351")).toBe("5492302666351");
  });

  it("leaves a phone from another country untouched", () => {
    // The teacher writes the country code when the student is not Argentine.
    expect(normalizePhone("5511999999999")).toBe("5511999999999");
    expect(normalizePhone("+56 9 1234 5678")).toBe("56912345678");
    expect(normalizePhone("59891234567")).toBe("59891234567");
  });

  it("does not add the prefix twice", () => {
    expect(normalizePhone("+5492302666351")).toBe("5492302666351");
    expect(normalizePhone("5492302666351")).toBe("5492302666351");
  });

  it("treats an empty value as no phone", () => {
    for (const empty of [undefined, null, "", "   ", " - "]) {
      expect(normalizePhone(empty), String(empty)).toBeNull();
    }
  });

  it("rejects values that are not a usable phone", () => {
    expect(() => normalizePhone("sin numeros")).toThrow("El teléfono tiene que tener números.");
    expect(() => normalizePhone("12345")).toThrow("El teléfono tiene que tener entre 6 y 20 dígitos.");
  });
});
