/**
 * server/fiks-io/fiks-melding-prosessor.ts
 *
 * Krav 1: prosessering av innkommende FIKS IO-meldinger.
 *
 * Leveringsbanen (subscriber) lagrer KUN: kryptert payload + konvolutt,
 * idempotent på FIKS-meldings-id. Prosesseringen her dekrypterer (CMS
 * mot kontoens privatnøkkel, via openssl — formatet brukt av KS'
 * fiks-io-kryptering) og oppretter bekymringsmelding — men BARE når
 * meldingstypen matcher konfigurert type og payloaden validerer mot den
 * eksplisitte feltmappingen. Spec-prinsippet fra stubben står: feltnavn
 * gjettes aldri; uten mapping blir rader stående uprosessert og venter.
 *
 *   FIKS_MOTTAK_MELDINGSTYPE   — avtalt meldingstype for bekymringsmelding
 *   FIKS_MOTTAK_FELTMAPPING    — JSON: {beskrivelse, melderKategori?, melderNavn?,
 *                                melderKontakt?, barnNavn?, barnFodselsnummer?}
 *                                → payload-feltnavn (dot-sti støttes)
 *   FIKS_KONTO_PRIVATE_KEY_SEALED — kontoens privatnøkkel (secret-box)
 */
import { execFile } from "child_process";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { isSecretBoxConfigured, openSecret, sealSecret } from "../lib/secret-box";
import { withKommuneRlsContext, withSystemRlsContext } from "../lib/database-rls-context";
import { registerFrist } from "../lib/frist-engine";

const execFileAsync = promisify(execFile);

export interface FiksKonvolutt {
  fiksMeldingId: string | null;
  meldingType: string | null;
  avsenderKontoId: string | null;
  svarPaMeldingId: string | null;
}

/**
 * Leveringsbanens persist: kryptert payload forsegles og lagres med
 * konvolutt. Idempotent på fiks_melding_id — omlevering etter
 * nack/reconnect blir no-op.
 */
export async function lagreInnkommendeFiksMelding(
  kommuneId: number,
  konvolutt: FiksKonvolutt,
  kryptertPayload: Buffer,
): Promise<void> {
  if (!isSecretBoxConfigured()) {
    throw new Error("TIDUM_SECRET_KEY må være satt før Fiks IO-mottak kan lagre meldinger.");
  }
  await withKommuneRlsContext(kommuneId, async (client) => {
    await client.query(
      `INSERT INTO tidum_fiks_raw_intake_log
         (kommune_id, raw_payload_encrypted, fiks_melding_id, melding_type, avsender_konto_id, svar_pa_melding_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (fiks_melding_id) WHERE fiks_melding_id IS NOT NULL DO NOTHING`,
      [
        kommuneId,
        sealSecret(kryptertPayload.toString("base64")),
        konvolutt.fiksMeldingId,
        konvolutt.meldingType,
        konvolutt.avsenderKontoId,
        konvolutt.svarPaMeldingId,
      ],
    );
  });
}

/** CMS-dekryptering med kontoens privatnøkkel via openssl (KS'
 * fiks-io-kryptering bruker CMS enveloped data). Verifiseres i KS'
 * sandkasse; testes med openssl-generert CMS i testsuiten. */
export async function dekrypterCmsPayload(kryptert: Buffer, privateKeyPem: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "fiks-cms-"));
  try {
    const inn = join(dir, "payload.p7m");
    const nokkel = join(dir, "key.pem");
    const ut = join(dir, "klartekst");
    await writeFile(inn, kryptert, { mode: 0o600 });
    await writeFile(nokkel, privateKeyPem, { mode: 0o600 });
    await execFileAsync("openssl", [
      "cms", "-decrypt", "-inform", "DER",
      "-in", inn, "-inkey", nokkel, "-out", ut,
    ]);
    return await readFile(ut);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function hentFelt(objekt: unknown, sti: string): unknown {
  let verdi: any = objekt;
  for (const del of sti.split(".")) {
    if (verdi == null || typeof verdi !== "object") return undefined;
    verdi = verdi[del];
  }
  return verdi;
}

interface Feltmapping {
  beskrivelse: string;
  melderKategori?: string;
  melderNavn?: string;
  melderKontakt?: string;
  barnNavn?: string;
  barnFodselsnummer?: string;
}

export function lesFeltmapping(): Feltmapping | null {
  const raa = process.env.FIKS_MOTTAK_FELTMAPPING;
  if (!raa) return null;
  try {
    const mapping = JSON.parse(raa);
    if (typeof mapping?.beskrivelse !== "string") return null;
    return mapping;
  } catch {
    return null;
  }
}

/**
 * Prosesser uprosesserte råloggsrader: dekrypter, map og opprett
 * bekymringsmelding med kilde 'fiks_io' og avklaringsfrist. Kjøres av
 * cron og kan trigges manuelt. Uten meldingstype/mapping/kontonøkkel
 * konfigurert er dette en no-op — radene venter trygt.
 */
export async function processFiksIntake(limit = 20): Promise<{ opprettet: number; feilet: number }> {
  const meldingstype = process.env.FIKS_MOTTAK_MELDINGSTYPE;
  const mapping = lesFeltmapping();
  const kontoNokkelSealed = process.env.FIKS_KONTO_PRIVATE_KEY_SEALED;
  if (!meldingstype || !mapping || !kontoNokkelSealed) return { opprettet: 0, feilet: 0 };
  const privateKeyPem = openSecret(kontoNokkelSealed);

  const rader = await withSystemRlsContext("fiks_intake_scan", async (client) => {
    const { rows } = await client.query(
      `SELECT id, kommune_id, raw_payload_encrypted, fiks_melding_id
         FROM tidum_fiks_raw_intake_log
        WHERE processed_at IS NULL AND melding_type = $1
        ORDER BY received_at ASC LIMIT $2`,
      [meldingstype, limit],
    );
    return rows;
  });

  let opprettet = 0;
  let feilet = 0;
  for (const rad of rader) {
    try {
      const kryptert = Buffer.from(openSecret(rad.raw_payload_encrypted), "base64");
      const klartekst = await dekrypterCmsPayload(kryptert, privateKeyPem);
      const payload = JSON.parse(klartekst.toString("utf-8"));

      const beskrivelse = hentFelt(payload, mapping.beskrivelse);
      if (typeof beskrivelse !== "string" || beskrivelse.trim().length === 0) {
        throw new Error(`Feltmappingen ga ingen beskrivelse (sti: ${mapping.beskrivelse}).`);
      }
      const hentValgfri = (sti?: string): string | null => {
        if (!sti) return null;
        const verdi = hentFelt(payload, sti);
        return typeof verdi === "string" && verdi.length > 0 ? verdi : null;
      };
      const fnr = hentValgfri(mapping.barnFodselsnummer);
      if (fnr && !/^\d{11}$/.test(fnr)) {
        throw new Error("Mappet fødselsnummer er ikke 11 siffer.");
      }

      await withKommuneRlsContext(rad.kommune_id, async (client) => {
        const { rows: [kommune] } = await client.query(
          `SELECT kommunenummer FROM tidum_kommuner WHERE id = $1`,
          [rad.kommune_id],
        );
        const { rows: [seq] } = await client.query(`SELECT nextval('tidum_barnevern_meldingsnummer_seq') AS n`);
        const avklaringsfrist = new Date(Date.now() + 7 * 24 * 3600000);
        const { rows: [melding] } = await client.query(
          `INSERT INTO tidum_barnevern_meldinger
             (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, melder_navn, melder_kontakt,
              barn_fodselsnummer, barn_navn, beskrivelse, avklaringsfrist, fiks_melding_id)
           VALUES ($1, $2, 'fiks_io', NOW(), $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [
            rad.kommune_id, `BVM-${kommune?.kommunenummer ?? "UKJENT"}-${seq.n}`,
            hentValgfri(mapping.melderKategori) ?? "annet",
            hentValgfri(mapping.melderNavn), hentValgfri(mapping.melderKontakt),
            fnr, hentValgfri(mapping.barnNavn),
            beskrivelse, avklaringsfrist, rad.fiks_melding_id,
          ],
        );
        const { rows: [leder] } = await client.query(
          `SELECT id FROM users WHERE kommune_id = $1 AND role = 'barnevernsleder' ORDER BY id LIMIT 1`,
          [rad.kommune_id],
        );
        await registerFrist({
          entityType: "barnevern_melding",
          entityId: melding.id,
          kommuneId: rad.kommune_id,
          fristType: "avklaring",
          dueAt: avklaringsfrist,
          notifyUserId: leder?.id,
        }, client);
        await client.query(
          `UPDATE tidum_fiks_raw_intake_log
              SET processed_at = NOW(), processing_error = NULL WHERE id = $1`,
          [rad.id],
        );
      });
      opprettet += 1;
    } catch (err: any) {
      feilet += 1;
      await withSystemRlsContext("fiks_intake_error", (client) => client.query(
        `UPDATE tidum_fiks_raw_intake_log SET processing_error = $1 WHERE id = $2`,
        [String(err?.message ?? err), rad.id],
      )).catch(() => {});
    }
  }
  return { opprettet, feilet };
}
