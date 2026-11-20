/**
 * Promotes an existing account to operator (role = admin) and reactivates it.
 *
 * The panel is closed to everyone else, so the first admin has to be made here,
 * from the machine that holds the database credentials.
 *
 * Usage: npm run make-admin -- duenio@correo.com
 */
import { findAccount } from "../src/server/accounts.ts";
import { closeDb, db } from "../src/server/db.ts";
import { ask } from "./prompt.ts";

async function main(): Promise<void> {
  const email = process.argv[2] ?? (await ask("Correo: "));
  if (!email) throw new Error("Falta el correo.");

  const account = await findAccount(email);
  if (!account) throw new Error("No existe una cuenta con ese correo.");

  await db().execute("UPDATE users SET role = 'admin', active = 1 WHERE id = ?", [account.id]);
  console.log(`Operador: ${account.email}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
