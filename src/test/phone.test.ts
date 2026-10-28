import { describe, expect, it } from "vitest";

import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("keeps digits only, so the WhatsApp link is direct", () => {
    expect(normalizePhone("5492302666351")).toBe("5492302666351");
    expect(normalizePhone("+54 9 2302-666351")).toBe("5492302666351");
    expect(normalizePhone("(2302) 66-6351")).toBe("2302666351");
  });

  it("treats an empty value as no phone", () => {
    for (const empty of [undefined, null, "", "   ", " - "]) {
      expect(normalizePhone(empty), String(empty)).toBeNull();
    }
  });

  it("rejects values that are not a usable phone", () => {
    expect(() => normalizePhone("sin numeros")).toThrow("El teléfono tiene que tener números.");
    expect(() => normalizePhone("12345")).toThrow("El teléfono tiene que tener entre 6 y 20 dígitos.");
    expect(() => normalizePhone("1".repeat(21))).toThrow(
      "El teléfono tiene que tener entre 6 y 20 dígitos.",
    );
    expect(() => normalizePhone(5492302666351)).toThrow("El teléfono tiene que tener números.");
  });
});
