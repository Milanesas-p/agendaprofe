import { readFileSync } from "node:fs";

import { validatePassword } from "../src/lib/credentials.ts";

/**
 * Minimal prompt helpers for the account CLI.
 *
 * One mechanism for both cases: raw mode on a real terminal (echoing or not), and
 * a single buffered read of stdin when the input is piped. Using `readline` per
 * question loses the second line of a pipe, which is exactly how these scripts
 * get exercised non-interactively.
 *
 * Only the email answer is trimmed. A password is taken exactly as typed, because
 * the login form does not trim either: trimming here would provision an account
 * whose password can never be used.
 */

/** Reads one answer. `echo` only controls whether the terminal shows the keys. */
export type Reader = (question: string, echo: boolean) => Promise<string>;

/** Prompt set bound to a reader, so the rules can be exercised without a terminal. */
export function prompts(read: Reader) {
  const ask = async (question: string): Promise<string> => (await read(question, true)).trim();

  const askHidden = (question: string): Promise<string> => read(question, false);

  /** Asks twice so a typo cannot lock the account out, then applies the shared rules. */
  async function askNewPassword(): Promise<string> {
    const first = await askHidden("Contraseña nueva: ");
    const second = await askHidden("Repetila: ");
    if (first !== second) throw new Error("Las contraseñas no coinciden.");
    return validatePassword(first);
  }

  return { ask, askHidden, askNewPassword };
}

/**
 * Reader over already-read text, line by line, exactly as sent.
 *
 * Exported because this is where the "never trim a password" rule actually lives:
 * a test that only injects a canned reader would not notice this function
 * trimming again.
 */
export function pipedReader(text: string): Reader {
  const lines = text.split(/\r?\n/);
  return async (question, echo) => {
    process.stdout.write(question);
    const value = lines.shift() ?? "";
    process.stdout.write(echo ? `${value}\n` : "\n");
    return value;
  };
}

const interactive = Boolean(process.stdin.isTTY && typeof process.stdin.setRawMode === "function");

let piped: Reader | null = null;

const nextPiped: Reader = (question, echo) => {
  if (!piped) piped = pipedReader(readFileSync(0, "utf8"));
  return piped(question, echo);
};

const ttyReader: Reader = (question, echo) => {
  process.stdout.write(question);

  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    let value = "";

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
    };

    function onData(chunk: string) {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            if (echo) stdout.write("\b \b");
          }
          continue;
        }
        value += char;
        if (echo) stdout.write(char);
      }
    }

    stdin.on("data", onData);
  });
};

const readLine: Reader = (question, echo) =>
  interactive ? ttyReader(question, echo) : nextPiped(question, echo);

export const { ask, askHidden, askNewPassword } = prompts(readLine);
