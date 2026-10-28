import { describe, expect, it } from "vitest";

import { pipedReader, prompts } from "../../scripts/prompt";

/** A reader that answers every question with the same canned value. */
const answering = (value: string) => async () => value;

describe("account CLI prompts", () => {
  it("never trims a password, because the login form does not trim either", async () => {
    const { askHidden, askNewPassword } = prompts(answering("  spaces12 "));

    await expect(askHidden("Contraseña nueva: ")).resolves.toBe("  spaces12 ");
    await expect(askNewPassword()).resolves.toBe("  spaces12 ");
  });

  // Goes through the real piped reader, so a trim coming back to its original
  // place is caught here and not only in the wrapper.
  it("keeps a piped password exactly as sent", async () => {
    const read = pipedReader("  spaces12  \r\n  spaces12  \r\n");
    await expect(prompts(read).askNewPassword()).resolves.toBe("  spaces12  ");
  });

  it("trims a piped email", async () => {
    const read = pipedReader("  profe@padel.com  \r\n");
    await expect(prompts(read).ask("Correo: ")).resolves.toBe("profe@padel.com");
  });

  it("reads consecutive piped lines without losing any", async () => {
    const read = pipedReader("profe@padel.com\nclave1234\nclave1234\n");
    const bound = prompts(read);
    await expect(bound.ask("Correo: ")).resolves.toBe("profe@padel.com");
    await expect(bound.askNewPassword()).resolves.toBe("clave1234");
  });

  it("trims the email answer", async () => {
    const { ask } = prompts(answering("  profe@padel.com  "));
    await expect(ask("Correo: ")).resolves.toBe("profe@padel.com");
  });

  it("refuses a mismatched confirmation and a short password", async () => {
    const answers = ["clave1234", "clave12345"];
    const { askNewPassword } = prompts(async () => answers.shift() ?? "");
    await expect(askNewPassword()).rejects.toThrow("Las contraseñas no coinciden.");

    const short = prompts(answering("corta"));
    await expect(short.askNewPassword()).rejects.toThrow(
      "La contraseña necesita al menos 8 caracteres.",
    );
  });
});
