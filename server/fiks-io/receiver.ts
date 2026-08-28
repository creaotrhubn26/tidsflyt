import type { Express } from "express";
import { isSecretBoxConfigured, sealSecret } from "../lib/secret-box";
import { withKommuneRlsContext } from "../lib/database-rls-context";

/**
 * STUB — bekymringsmeldingens innholdsskjema er IKKE offentlig dokumentert
 * (bekreftet mot developers.fiks.ks.no og ks-no sine offisielle klient-
 * biblioteker for Java/.NET — se docs/superpowers/specs/2026-08-23-
 * barnevern-meldingsmottak-design.md § 5.4). Denne funksjonen skal ALDRI
 * gjette feltnavn. Når KS-avtale + reelt skjema foreligger: implementer
 * parsing her, prosesser tidum_fiks_raw_intake_log-rader med
 * processed_at IS NULL (de er allerede trygt lagret og venter).
 */
export async function onBekymringsmeldingRaw(kommuneId: number, rawPayload: unknown): Promise<void> {
  // sealSecret faller stille tilbake til klartekst uten nøkkel — en hel
  // bekymringsmelding (barnets og melders identitet) skal ALDRI lagres slik.
  if (!isSecretBoxConfigured()) {
    throw new Error("TIDUM_SECRET_KEY må være satt før Fiks IO-mottak kan lagre bekymringsmeldinger.");
  }
  await withKommuneRlsContext(kommuneId, async (client) => {
    await client.query(
      `INSERT INTO tidum_fiks_raw_intake_log (kommune_id, raw_payload_encrypted) VALUES ($1, $2)`,
      [kommuneId, sealSecret(JSON.stringify(rawPayload))],
    );
  });
}

/**
 * Aktiv når FIKS_IO_ENABLED=true OG full mottakskonfigurasjon finnes
 * (se fiks-io-subscriber.ts). AMQP-detaljene er verifisert mot KS'
 * offisielle, åpne klientkode (ks-no/fiks-io-client-dotnet): kø
 * fiksio.konto.<kontoId>, username=integrasjons-id, password =
 * "<integrasjonspassord> <maskinporten-token>". Leveringsbanen lagrer
 * kun kryptert payload + konvolutt; faglig parsing skjer i
 * prosessorsteget, fortsatt gated på avtalt meldingstype og eksplisitt
 * feltmapping (spec-prinsippet: feltnavn gjettes aldri).
 */
export function setupFiksIoReceiver(_app: Express): void {
  if (process.env.FIKS_IO_ENABLED !== "true") {
    return;
  }
  // Dynamisk import: amqplib lastes kun når mottaket faktisk er skrudd på.
  import("./fiks-io-subscriber").then(async ({ startFiksIoSubscriber }) => {
    const startet = await startFiksIoSubscriber();
    if (!startet) {
      console.warn("[fiks-io] FIKS_IO_ENABLED=true, men mottakskonfigurasjonen er ufullstendig — abonnenten er inert.");
    }
  }).catch((err) => console.error("[fiks-io] oppstart feilet:", err?.message ?? err));

  import("node-cron").then(({ default: cron }) => {
    cron.schedule("*/10 * * * *", async () => {
      try {
        const { processFiksIntake } = await import("./fiks-melding-prosessor");
        const resultat = await processFiksIntake();
        if (resultat.opprettet || resultat.feilet) {
          console.log(`[fiks-io-prosessor] opprettet=${resultat.opprettet} feilet=${resultat.feilet}`);
        }
      } catch (err) {
        console.error("[fiks-io-prosessor] feilet:", err);
      }
    });
  });
}
