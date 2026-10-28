import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/password";

describe("password hashing", () => {
  it("accepts the original password", async () => {
    const stored = await hashPassword("clases-de-padel");
    await expect(verifyPassword("clases-de-padel", stored)).resolves.toBe(true);
  });

  it("rejects a different password", async () => {
    const stored = await hashPassword("clases-de-padel");
    await expect(verifyPassword("clases-de-pade1", stored)).resolves.toBe(false);
  });

  it("salts every hash, so the same password hashes differently", async () => {
    const first = await hashPassword("clases-de-padel");
    const second = await hashPassword("clases-de-padel");
    expect(first).not.toBe(second);
    await expect(verifyPassword("clases-de-padel", first)).resolves.toBe(true);
    await expect(verifyPassword("clases-de-padel", second)).resolves.toBe(true);
  });

  it("returns false for malformed stored values instead of throwing", async () => {
    await expect(verifyPassword("x", "basura")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$00$00")).resolves.toBe(false);
    await expect(verifyPassword("x", "bcrypt$aa$bb")).resolves.toBe(false);
  });
});
