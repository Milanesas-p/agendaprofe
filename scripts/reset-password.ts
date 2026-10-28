/**
 * Replaces the password of an existing account and revokes its open sessions.
 *
 * This is the whole "I forgot my password" story: the app runs locally, the
 * account belongs to the teacher, so no email service is involved.
 *
 * Usage: npm run reset-password -- profe@correo.com
 */
import { findAccount, resetAccountPassword } from "../src/server/accounts.ts";
import { closeDb } from "../src/server/db.ts";
import { ask, askNewPassword } from "./prompt.ts";

async function main(): Promise<void> {
  const email = process.argv[2] ?? (await ask("Correo: "));
  if (!email) throw new Error("Falta el correo.");

  // Checked before asking for a password, so a typo in the address costs one prompt.
  if (!(await findAccount(email))) throw new Error("No existe una cuenta con ese correo.");

  const password = await askNewPassword();
  const account = await resetAccountPassword(email, password);

  console.log(`Contraseña actualizada para ${account.email}. Se cerraron sus sesiones abiertas.`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
