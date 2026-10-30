import { describe, expect, it } from "vitest";

import { reminderText, whatsappLink } from "@/lib/whatsapp";

describe("reminderText", () => {
  it("names the time of the class", () => {
    expect(reminderText("09:00")).toBe("Buenas! Te recuerdo tu clase de las 09:00. Confirmame por favor.");
  });

  it("uses the time exactly as the agenda shows it", () => {
    expect(reminderText("14:00")).toContain("de las 14:00.");
  });
});

describe("whatsappLink", () => {
  it("opens the chat with the message already written", () => {
    expect(whatsappLink("5492302666351", "Buenas!")).toBe("https://wa.me/5492302666351?text=Buenas!");
  });

  it("encodes the message so spaces, accents and colons travel intact", () => {
    expect(whatsappLink("5492302666351", reminderText("09:00"))).toBe(
      "https://wa.me/5492302666351?text=Buenas!%20Te%20recuerdo%20tu%20clase%20de%20las%2009%3A00.%20Confirmame%20por%20favor.",
    );
  });

  it("returns nothing when the student has no phone", () => {
    for (const empty of [undefined, null, "", "   ", " - "]) {
      expect(whatsappLink(empty, "Buenas!"), String(empty)).toBeNull();
    }
  });

  it("completes a stored local number as a safety net", () => {
    expect(whatsappLink("2302666351", "Buenas!")).toBe("https://wa.me/5492302666351?text=Buenas!");
  });

  it("leaves a number from another country alone", () => {
    expect(whatsappLink("5511999999999", "Buenas!")).toBe("https://wa.me/5511999999999?text=Buenas!");
  });
});
