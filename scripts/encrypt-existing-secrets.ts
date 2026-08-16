import { db } from "../server/db";
import { vendorIntegrations, userSettings } from "@shared/schema";
import { encryptSecret, isEncryptedSecret } from "../server/lib/secret-crypto";
import { eq } from "drizzle-orm";

async function run() {
  const integrations = await db.select().from(vendorIntegrations);
  let integrationsEncrypted = 0;
  for (const row of integrations) {
    if (!row.clientKey || isEncryptedSecret(row.clientKey)) continue;
    await db
      .update(vendorIntegrations)
      .set({ clientKey: encryptSecret(row.clientKey) })
      .where(eq(vendorIntegrations.id, row.id));
    integrationsEncrypted++;
  }

  const settings = await db.select().from(userSettings);
  let smtpEncrypted = 0;
  for (const row of settings) {
    if (!row.smtpAppPassword || isEncryptedSecret(row.smtpAppPassword)) continue;
    await db
      .update(userSettings)
      .set({ smtpAppPassword: encryptSecret(row.smtpAppPassword) })
      .where(eq(userSettings.id, row.id));
    smtpEncrypted++;
  }

  console.log(
    `Kryptert ${integrationsEncrypted} vendor_integrations.client_key og ${smtpEncrypted} user_settings.smtp_app_password rader.`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migrering feilet:", err);
    process.exit(1);
  });
