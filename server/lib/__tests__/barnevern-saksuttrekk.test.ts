import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 17: komplett saksuttrekk med manifest, kontrollert utlevering og audit.
describe("Barnevern saksuttrekk (krav 17)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_uttrekk_test_cleanup", async (client) => {
      for (const id of sakIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(
          `DELETE FROM tidum_frister WHERE entity_id IN
             (SELECT id::text FROM tidum_barnevern_oppgaver WHERE entity_type = 'sak' AND entity_id = $1)`,
          [id],
        );
        await client.query(`DELETE FROM tidum_barnevern_oppgaver WHERE entity_type = 'sak' AND entity_id = $1`, [id]);
        await client.query(
          `DELETE FROM tidum_frister WHERE entity_id IN
             (SELECT id::text FROM tidum_barnevern_planer WHERE sak_id = $1)`,
          [id],
        );
        await client.query(`DELETE FROM tidum_barnevern_saker WHERE id = $1`, [id]);
      }
      for (const id of meldingIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_meldinger WHERE id = $1`, [id]);
      }
    });
    for (const id of userIds) {
      await pool.query(`DELETE FROM tidum_barnevern_tilgangslogg WHERE user_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
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

  const uniqueId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function actorApp(prefix: string, kommuneId: number, role: string) {
    const id = uniqueId(prefix);
    await pool.query(
      `INSERT INTO users (id, username, password, email, kommune_id, role) VALUES ($1, $2, 'x', $3, $4, $5)`,
      [id, id, `${id}@example.com`, kommuneId, role],
    );
    cleanupUserIds.push(id);
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id };
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);
    return { id, app };
  }

  it("leder får komplett uttrekk med alle saksdeler, manifest og hash; utleveringen auditlogges", async () => {
    const kommuneId = await insertTestKommune();
    const { id: lederId, app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { id: sbId, app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    // Bygg en sak med innhold i alle deler.
    const melding = await request(sbApp).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Uttrekkstest.",
      barnNavn: "Uttrekksbarn",
    });
    cleanupMeldingIds.push(melding.body.id);
    const undersokelse = await request(sbApp).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    const sakId = undersokelse.body.sak.id;
    cleanupSakIds.push(sakId);

    await request(sbApp).post(`/api/barnevern/saker/${sakId}/journal`).send({
      kategori: "notat", innhold: "Journalnotat i uttrekket.",
    });
    const plan = await request(sbApp).post(`/api/barnevern/saker/${sakId}/planer`).send({ formaal: "Uttrekksplan" });
    await request(sbApp).post(`/api/barnevern/planer/${plan.body.id}/tiltak`).send({
      beskrivelse: "Uttrekkstiltak", ansvarlig: "Kari",
    });
    await request(sbApp).post(`/api/barnevern/saker/${sakId}/dokumenter`).send({
      malId: "brev_orientering",
    });
    await request(sbApp).post("/api/barnevern/oppgaver").send({
      entityType: "sak", entityId: sakId, tittel: "Uttrekksoppgave", tildeltUserId: sbId,
    });

    const uttrekk = await request(lederApp).get(`/api/barnevern/saker/${sakId}/uttrekk`);
    expect(uttrekk.status).toBe(200);
    expect(uttrekk.body.manifest.innholdsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(uttrekk.body.manifest.antall).toEqual({
      journaloppforinger: 1,
      journalvedlegg: 0,
      planer: 1,
      dokumenter: 1,
      oppgaver: 1,
      fasehendelser: 1,
    });
    expect(uttrekk.body.sak.id).toBe(sakId);
    expect(uttrekk.body.melding.id).toBe(melding.body.id);
    expect(uttrekk.body.journal[0].innhold).toBe("Journalnotat i uttrekket.");
    expect(uttrekk.body.planer[0].formaal).toBe("Uttrekksplan");
    expect(uttrekk.body.planTiltak[0].beskrivelse).toBe("Uttrekkstiltak");
    expect(uttrekk.body.dokumenter[0].mal_id).toBe("brev_orientering");
    expect(uttrekk.body.oppgaver[0].tittel).toBe("Uttrekksoppgave");
    expect(uttrekk.headers["cache-control"]).toBe("no-store");

    // Utleveringen står i tilgangsloggen med hash.
    const { rows: logg } = await pool.query(
      `SELECT detaljer FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 AND handling = 'nedlastet' AND objekt_type = 'saksuttrekk' AND objekt_id = $2`,
      [lederId, sakId],
    );
    expect(logg).toHaveLength(1);
    expect(logg[0].detaljer.innholdsHash).toBe(uttrekk.body.manifest.innholdsHash);

    // Vedlegg for ZIP-pakken: last opp en fil på journaloppføringen.
    const journalListe = await request(sbApp).get(`/api/barnevern/saker/${sakId}/journal`);
    const opplasting = await request(sbApp)
      .post(`/api/barnevern/saker/${sakId}/journal/${journalListe.body[0].id}/vedlegg`)
      .attach("file", Buffer.from("%PDF-1.4 pakkeinnhold"), { filename: "notat.pdf", contentType: "application/pdf" });
    expect(opplasting.status, opplasting.text?.slice(0, 300)).toBe(201);

    // ZIP-pakke (krav 17-rest): gyldig zip med uttrekk, vedlegg og manifest.
    const pakke = await request(lederApp)
      .get(`/api/barnevern/saker/${sakId}/uttrekk/pakke`)
      .buffer(true)
      .parse((res2, cb) => {
        const biter: Buffer[] = [];
        res2.on("data", (b: Buffer) => biter.push(b));
        res2.on("end", () => cb(null, Buffer.concat(biter)));
      });
    expect(pakke.status).toBe(200);
    expect(pakke.headers["content-type"]).toBe("application/zip");
    expect((pakke.body as Buffer).subarray(0, 2).toString()).toBe("PK");
    const zipTekst = (pakke.body as Buffer).toString("latin1");
    expect(zipTekst).toContain("saksuttrekk.json");
    expect(zipTekst).toContain("manifest.json");
    expect(zipTekst).toContain("notat.pdf");
    // Interne lagringsnøkler lekker ikke i JSON-delen.
    expect(uttrekk.body.journalVedlegg.every((v: any) => v.filename === undefined)).toBe(true);

    const { rows: pakkeLogg } = await pool.query(
      `SELECT 1 FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 AND objekt_type = 'saksuttrekk_pakke' AND objekt_id = $2`,
      [lederId, sakId],
    );
    expect(pakkeLogg).toHaveLength(1);
  });

  it("saksbehandler nektes utlevering; annen kommunes leder får 404", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: sbApp } = await actorApp("sb", kommuneA, "kommune_saksbehandler");
    const { app: lederBApp } = await actorApp("leder-b", kommuneB, "barnevernsleder");

    const melding = await request(sbApp).post("/api/barnevern/meldinger").send({
      melderKategori: "nav", beskrivelse: "Sperretest.",
    });
    cleanupMeldingIds.push(melding.body.id);
    const undersokelse = await request(sbApp).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(undersokelse.body.sak.id);

    const nektet = await request(sbApp).get(`/api/barnevern/saker/${undersokelse.body.sak.id}/uttrekk`);
    expect(nektet.status).toBe(403);

    const fremmed = await request(lederBApp).get(`/api/barnevern/saker/${undersokelse.body.sak.id}/uttrekk`);
    expect(fremmed.status).toBe(404);
  });
});
