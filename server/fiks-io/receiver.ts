import type { Express } from "express";
import { pool } from "../db";
import { isSecretBoxConfigured, sealSecret } from "../lib/secret-box";

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
  await pool.query(
    `INSERT INTO tidum_fiks_raw_intake_log (kommune_id, raw_payload_encrypted) VALUES ($1, $2)`,
    [kommuneId, sealSecret(JSON.stringify(rawPayload))],
  );
}

/**
 * Inert med mindre FIKS_IO_ENABLED=true OG minst én kommune har
 * fiks_enabled=true med gyldig konfigurasjon. AMQP-legitimasjons-
 * utveksling og meldingskonvoluttens feltnavn er IKKE offentlig
 * dokumentert (se spec § 5.2) — denne funksjonen etablerer derfor
 * ingen AMQP-tilkobling ennå. Speiler setupEntraIdAuth sitt
 * inaktiveringsmønster fra delprosjekt 1.
 */
export function setupFiksIoReceiver(_app: Express): void {
  if (process.env.FIKS_IO_ENABLED !== "true") {
    return;
  }
  console.warn(
    "[fiks-io] FIKS_IO_ENABLED=true, men AMQP-tilkoblingslaget er ikke implementert " +
    "(legitimasjonsutveksling og meldingskonvolutt er ikke offentlig dokumentert, se " +
    "docs/superpowers/specs/2026-08-23-barnevern-meldingsmottak-design.md § 5.2). " +
    "Maskinporten-tokenutveksling er klar (server/fiks-io/maskinporten-client.ts); " +
    "resten venter på KS-avtale.",
  );
}
