/**
 * Creates a teacher account.
 *
 * Registration was removed from the app: access is granted by whoever runs the
 * system, after the teacher gets in touch through the login screen.
 *
 * Usage: npm run create-account -- profe@correo.com
 */
import { createAccount, findAccount } from "../src/server/accounts.ts";
import { closeDb } from "../src/server/db.ts";
import { ask, askNewPassword } from "./prompt.ts";

async function main(): Promise<void> {
  const email = process.argv[2] ?? (await ask("Correo: "));
  if (!email) throw new Error("Falta el correo.");

  // Checked before asking for a password, so a bad address never costs two prompts.
  if (await findAccount(email)) throw new Error("Ese correo ya está registrado.");

  const name = (await ask("Nombre y apellido: ")).trim();
  const password = await askNewPassword();
  const account = await createAccount(email, password, name);

  console.log(`Cuenta creada: ${account.email}${account.name ? ` (${account.name})` : ""}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
