/**
 * scripts/seal-secret.ts
 *
 * Forsegler en hemmelighet (f.eks. Maskinporten-/FIKS-privatnøkkel i PEM)
 * med secret-box, klar til å limes inn i miljøvariabler som
 * FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED / FIKS_KONTO_PRIVATE_KEY_SEALED.
 *
 * Bruk (TIDUM_SECRET_KEY/-KEYRING må være satt, samme som i drift):
 *   npx tsx scripts/seal-secret.ts /sti/til/privatnokkel.pem
 *   cat nokkel.pem | npx tsx scripts/seal-secret.ts
 */
import { readFileSync } from "fs";
import { isSecretBoxConfigured, sealSecret } from "../server/lib/secret-box";

function main(): void {
  if (!isSecretBoxConfigured()) {
    console.error("TIDUM_SECRET_KEY (eller -KEYRING) må være satt — bruk samme nøkkel som driftsmiljøet.");
    process.exit(1);
  }
  const sti = process.argv[2];
  const innhold = sti ? readFileSync(sti, "utf-8") : readFileSync(0, "utf-8");
  if (!innhold.trim()) {
    console.error("Tomt innhold — oppgi filsti eller pipe inn hemmeligheten.");
    process.exit(1);
  }
  process.stdout.write(sealSecret(innhold) + "\n");
}

main();
