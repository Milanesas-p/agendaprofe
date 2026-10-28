import { describe, expect, it } from "vitest";
import { hashSessionToken, newSessionToken } from "@/server/session";

describe("session tokens", () => {
  it("generates a distinct token every time", () => {
    expect(newSessionToken()).not.toBe(newSessionToken());
  });

  it("hashes to a lowercase sha256 hex digest", () => {
    const token = newSessionToken();
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("never exposes the raw token through the stored hash", () => {
    const token = newSessionToken();
    expect(hashSessionToken(token)).not.toContain(token);
  });
});
