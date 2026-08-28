import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { execFile } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";
import { sealSecret } from "../secret-box";
import {
  dekrypterCmsPayload,
  lagreInnkommendeFiksMelding,
  lesFeltmapping,
  processFiksIntake,
} from "../../fiks-io/fiks-melding-prosessor";
import { lesKonvolutt, lesMottakKonfig } from "../../fiks-io/fiks-io-subscriber";

const execFileAsync = promisify(execFile);

// Krav 1: ekte FIKS IO-mottak — kryptert lagring, idempotens, CMS-
// dekryptering og gated prosessering til bekymringsmelding.
describe("FIKS IO-mottak (krav 1)", { timeout: 30000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  let testDir: string;
  let privateKeyPem: string;
  let certPem: string;

  beforeAll(async () => {
    // Generer nøkkel + selvsignert sertifikat for CMS-roundtrip.
    testDir = await mkdtemp(join(tmpdir(), "fiks-test-"));
    await execFileAsync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", join(testDir, "key.pem"), "-out", join(testDir, "cert.pem"),
      "-days", "1", "-subj", "/CN=fiks-test",
    ]);
    privateKeyPem = await readFile(join(testDir, "key.pem"), "utf-8");
    certPem = await readFile(join(testDir, "cert.pem"), "utf-8");
  });

  afterEach(async () => {
    delete process.env.FIKS_MOTTAK_MELDINGSTYPE;
    delete process.env.FIKS_MOTTAK_FELTMAPPING;
    delete process.env.FIKS_KONTO_PRIVATE_KEY_SEALED;
    const meldingIds = cleanupMeldingIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("fiks_mottak_test_cleanup", async (client) => {
      for (const id of meldingIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_meldinger WHERE id = $1`, [id]);
      }
      for (const kommuneId of kommuneIds) {
        await client.query(`DELETE FROM tidum_fiks_raw_intake_log WHERE kommune_id = $1`, [kommuneId]);
      }
    });
    for (const id of kommuneIds) await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
  });

  async function insertTestKommune(): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9999') RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(row.id);
    return row.id;
  }

  async function cmsKrypter(klartekst: string): Promise<Buffer> {
    const inn = join(testDir, `inn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const ut = `${inn}.p7m`;
    await writeFile(inn, klartekst, "utf-8");
    await execFileAsync("openssl", [
      "cms", "-encrypt", "-binary", "-aes-256-cbc", "-outform", "DER",
      "-in", inn, "-out", ut, join(testDir, "cert.pem"),
    ]);
    const kryptert = await readFile(ut);
    await rm(inn, { force: true });
    await rm(ut, { force: true });
    return kryptert;
  }

  it("CMS-roundtrip: openssl-kryptert payload dekrypteres med kontonøkkelen", async () => {
    const kryptert = await cmsKrypter(JSON.stringify({ innhold: { tekst: "Bekymring æøå" } }));
    const klartekst = await dekrypterCmsPayload(kryptert, privateKeyPem);
    expect(JSON.parse(klartekst.toString("utf-8")).innhold.tekst).toBe("Bekymring æøå");

    // Feil nøkkel feiler.
    const annenDir = await mkdtemp(join(tmpdir(), "fiks-feil-"));
    await execFileAsync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", join(annenDir, "key.pem"), "-out", join(annenDir, "cert.pem"),
      "-days", "1", "-subj", "/CN=feil",
    ]);
    const feilNokkel = await readFile(join(annenDir, "key.pem"), "utf-8");
    await expect(dekrypterCmsPayload(kryptert, feilNokkel)).rejects.toThrow();
    await rm(annenDir, { recursive: true, force: true });
  });

  it("mottak lagrer kryptert payload med konvolutt, idempotent på FIKS-meldings-id", async () => {
    const kommuneId = await insertTestKommune();
    const konvolutt = {
      fiksMeldingId: `fiks-${Date.now()}`,
      meldingType: "no.ks.test.bekymringsmelding.v1",
      avsenderKontoId: "konto-nasjonal-portal",
      svarPaMeldingId: null,
    };
    const payload = Buffer.from("kryptert-innhold");

    await lagreInnkommendeFiksMelding(kommuneId, konvolutt, payload);
    // Omlevering (nack/reconnect) → no-op.
    await lagreInnkommendeFiksMelding(kommuneId, konvolutt, payload);

    const { rows } = await pool.query(
      `SELECT * FROM tidum_fiks_raw_intake_log WHERE fiks_melding_id = $1`,
      [konvolutt.fiksMeldingId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].melding_type).toBe("no.ks.test.bekymringsmelding.v1");
    expect(rows[0].avsender_konto_id).toBe("konto-nasjonal-portal");
    expect(rows[0].processed_at).toBeNull();
    // Payload er forseglet — rå base64 ligger ikke i klartekst.
    expect(rows[0].raw_payload_encrypted).not.toContain(payload.toString("base64"));
  });

  it("prosessering er inert uten meldingstype/mapping; med konfig opprettes bekymringsmelding med frist", async () => {
    const kommuneId = await insertTestKommune();
    const kryptert = await cmsKrypter(JSON.stringify({
      melding: {
        beskrivelse: "Nasjonal portal-bekymring for barnet.",
        melder: { navn: "Offentlig Melder", kontakt: "melder@etat.no" },
        barn: { navn: "Portal Barn", fodselsnummer: "01019912345" },
      },
    }));
    await lagreInnkommendeFiksMelding(kommuneId, {
      fiksMeldingId: `fiks-p-${Date.now()}`,
      meldingType: "no.ks.test.bekymringsmelding.v1",
      avsenderKontoId: "konto-nasjonal-portal",
      svarPaMeldingId: null,
    }, kryptert);

    // Uten konfig: no-op — raden venter.
    expect(await processFiksIntake()).toEqual({ opprettet: 0, feilet: 0 });

    process.env.FIKS_MOTTAK_MELDINGSTYPE = "no.ks.test.bekymringsmelding.v1";
    process.env.FIKS_KONTO_PRIVATE_KEY_SEALED = sealSecret(privateKeyPem);
    process.env.FIKS_MOTTAK_FELTMAPPING = JSON.stringify({
      beskrivelse: "melding.beskrivelse",
      melderNavn: "melding.melder.navn",
      melderKontakt: "melding.melder.kontakt",
      barnNavn: "melding.barn.navn",
      barnFodselsnummer: "melding.barn.fodselsnummer",
    });
    expect(lesFeltmapping()).not.toBeNull();

    const resultat = await processFiksIntake();
    expect(resultat).toEqual({ opprettet: 1, feilet: 0 });

    const { rows: [melding] } = await pool.query(
      `SELECT * FROM tidum_barnevern_meldinger WHERE kommune_id = $1 AND kilde = 'fiks_io'`,
      [kommuneId],
    );
    cleanupMeldingIds.push(melding.id);
    expect(melding.beskrivelse).toBe("Nasjonal portal-bekymring for barnet.");
    expect(melding.barn_navn).toBe("Portal Barn");
    expect(melding.melder_kategori).toBe("annet");
    const { rows: frister } = await pool.query(
      `SELECT frist_type FROM tidum_frister WHERE entity_type = 'barnevern_melding' AND entity_id = $1`,
      [melding.id],
    );
    expect(frister[0].frist_type).toBe("avklaring");

    // Raden er markert prosessert; ny kjøring gjør ingenting.
    expect(await processFiksIntake()).toEqual({ opprettet: 0, feilet: 0 });
  });

  it("konvoluttlesing og fail-closed mottakskonfig", () => {
    expect(lesMottakKonfig()).toBeNull();
    const konvolutt = lesKonvolutt({
      properties: {
        messageId: "melding-123",
        headers: { type: "no.ks.test.v1", "avsender-id": "konto-a", "svar-til": "melding-0" },
      },
    } as any);
    expect(konvolutt).toEqual({
      fiksMeldingId: "melding-123",
      meldingType: "no.ks.test.v1",
      avsenderKontoId: "konto-a",
      svarPaMeldingId: "melding-0",
    });
  });
});
