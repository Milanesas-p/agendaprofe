import { describe, expect, it } from "vitest";

import { normalizeEmail, validatePassword } from "@/lib/credentials";

describe("email normalization", () => {
  it("trims and lowercases a valid address", () => {
    expect(normalizeEmail("  Profe@Padel.COM  ")).toBe("profe@padel.com");
  });

  it("rejects anything that is not a usable email", () => {
    for (const bad of [undefined, null, 42, "", "   ", "profe", "profe@", "profe@padel", "a@b", `${"x".repeat(250)}@padel.com`]) {
      expect(() => normalizeEmail(bad), String(bad)).toThrow("Ingresá un correo válido.");
    }
  });
});

describe("password validation", () => {
  it("accepts 8 characters and up", () => {
    expect(validatePassword("12345678")).toBe("12345678");
    expect(validatePassword("a".repeat(200))).toBe("a".repeat(200));
  });

  it("rejects short, oversized and non-string values", () => {
    for (const bad of [undefined, null, 12345678, "", "1234567", "a".repeat(201)]) {
      expect(() => validatePassword(bad), String(bad)).toThrow(
        "La contraseña necesita al menos 8 caracteres.",
      );
    }
  });

  it("does not trim or alter the password", () => {
    expect(validatePassword("  spaces  ")).toBe("  spaces  ");
  });
});
