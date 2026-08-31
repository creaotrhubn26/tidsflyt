import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 16: innsynsbegjæring — mottak, frist, beslutning med unntak,
// utlevering med audit og klageflyt.
describe("Barnevern innsynskrav (krav 16)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    // Sikker dialog-rader: append-only-triggere må av under opprydding
    // (samme mønster som secure-dialog-routes.test.ts).
    if (kommuneIds.length) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("LOCK TABLE tidum_secure_dialog_audit_events, tidum_secure_messages IN ACCESS EXCLUSIVE MODE");
        await client.query("ALTER TABLE tidum_secure_dialog_audit_events DISABLE TRIGGER tidum_secure_audit_immutable_trigger");
        await client.query("ALTER TABLE tidum_secure_messages DISABLE TRIGGER tidum_secure_message_immutable_trigger");
        for (const tabell of [
          "tidum_secure_notification_outbox", "tidum_secure_messages",
          "tidum_secure_conversation_participants", "tidum_secure_conversations",
          "tidum_secure_case_access", "tidum_secure_dialog_audit_events", "tidum_secure_parties",
        ]) {
          await client.query(`DELETE FROM ${tabell} WHERE kommune_id = ANY($1::int[])`, [kommuneIds]);
        }
        await client.query("ALTER TABLE tidum_secure_messages ENABLE TRIGGER tidum_secure_message_immutable_trigger");
        await client.query("ALTER TABLE tidum_secure_dialog_audit_events ENABLE TRIGGER tidum_secure_audit_immutable_trigger");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
    await withSystemRlsContext("barnevern_innsyn_test_cleanup", async (client) => {
      for (const id of sakIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(
          `DELETE FROM tidum_frister WHERE entity_id IN
             (SELECT id::text FROM tidum_barnevern_innsynskrav WHERE sak_id = $1)`,
          [id],
        );
        // Innsynskrav og journal CASCADEr fra saken.
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

  async function opprettSak(app: any) {
    const melding = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Innsynstest.",
    });
    cleanupMeldingIds.push(melding.body.id);
    const res = await request(app).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(res.body.sak.id);
    return res.body.sak;
  }

  it("full flyt: mottak med frist → delvis innvilgelse med unntak → utlevering med audit → klage → oversendelse", async () => {
    const kommuneId = await insertTestKommune();
    const { id: lederId, app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { id: sbId, app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const sak = await opprettSak(sbApp);

    const krav = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/innsynskrav`).send({
      partNavn: "Mor Testesen",
      partRelasjon: "forelder",
    });
    expect(krav.status).toBe(201);
    expect(krav.body.status).toBe("mottatt");

    // Behandlingsfrist registrert i fristmotoren (5 dager).
    const { rows: frister } = await pool.query(
      `SELECT frist_type, status FROM tidum_frister WHERE entity_type = 'barnevern_innsynskrav' AND entity_id = $1`,
      [krav.body.id],
    );
    expect(frister).toHaveLength(1);
    expect(frister[0].frist_type).toBe("innsyn");

    // Saksbehandler kan ikke beslutte; delvis uten unntak avvises.
    const nektet = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/beslutning`).send({
      utfall: "innvilget",
    });
    expect(nektet.status).toBe(403);
    const utenUnntak = await request(lederApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/beslutning`).send({
      utfall: "delvis_innvilget", begrunnelse: "Deler skjermes.",
    });
    expect(utenUnntak.status).toBe(400);

    // Utlevering før beslutning avvises.
    const forTidlig = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/utlever`).send({ via: "utskrift" });
    expect(forTidlig.status).toBe(409);

    // To journaloppføringer: én skal sladdes fysisk i utleverings-PDF-en.
    const aapenPost = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/journal`).send({
      kategori: "notat", innhold: "Åpent notat som parten skal se.",
    });
    const hemmeligPost = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/journal`).send({
      kategori: "notat", innhold: "Melders identitet: Kilde Kildesen.",
    });

    const beslutning = await request(lederApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/beslutning`).send({
      utfall: "delvis_innvilget",
      begrunnelse: "Opplysninger om melder skjermes av hensyn til kilden.",
      unntak: [{
        hjemmel: "fvl. § 19 første ledd bokstav b",
        beskrivelse: "Melders identitet",
        journalEntryIds: [hemmeligPost.body.id],
      }],
    });
    expect(beslutning.status).toBe(200);
    expect(beslutning.body.status).toBe("delvis_innvilget");

    // Sladdet utleverings-PDF (krav 16-rest): åpen tekst med, unntatt tekst
    // FYSISK fraværende, sladdemarkør til stede. Auditlogges.
    const sladdet = await request(lederApp)
      .get(`/api/barnevern/innsynskrav/${krav.body.id}/sladdet-pdf`)
      .buffer(true)
      .parse((res2, cb) => {
        const biter: Buffer[] = [];
        res2.on("data", (b: Buffer) => biter.push(b));
        res2.on("end", () => cb(null, Buffer.concat(biter)));
      });
    expect(sladdet.status).toBe(200);
    const pdfTekst = (sladdet.body as Buffer).toString("latin1");
    expect(pdfTekst.startsWith("%PDF-")).toBe(true);
    // pdfkit hex-koder tekst i TJ-arrays — dekod alle hex-strenger for å
    // kunne bevise at unntatt tekst er FYSISK fraværende i filen.
    // Kerning splitter tekst også midt i ord — sammenlign uten mellomrom.
    const dekodet = (pdfTekst.match(/<([0-9a-f]+)>/g) ?? [])
      .map((h) => Buffer.from(h.slice(1, -1), "hex").toString("latin1"))
      .join("").replace(/\s+/g, "");
    expect(dekodet).toContain("pentnotatsompartenskalse");
    expect(dekodet).not.toContain("Kildesen");
    expect(dekodet).toContain("SLADDET");
    const { rows: sladdetLogg } = await pool.query(
      `SELECT 1 FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 AND objekt_type = 'innsyn_sladdet_pdf' AND objekt_id = $2`,
      [lederId, krav.body.id],
    );
    expect(sladdetLogg).toHaveLength(1);

    // Vedlegg: ett på åpen og ett på sladdet oppføring — pakken skal kun
    // inneholde det åpne.
    await request(sbApp)
      .post(`/api/barnevern/saker/${sak.id}/journal/${aapenPost.body.id}/vedlegg`)
      .attach("file", Buffer.from("%PDF-1.4 aapen"), { filename: "aapen.pdf", contentType: "application/pdf" });
    await request(sbApp)
      .post(`/api/barnevern/saker/${sak.id}/journal/${hemmeligPost.body.id}/vedlegg`)
      .attach("file", Buffer.from("%PDF-1.4 hemmelig"), { filename: "hemmelig.pdf", contentType: "application/pdf" });

    const pakke = await request(lederApp)
      .get(`/api/barnevern/innsynskrav/${krav.body.id}/utleveringspakke`)
      .buffer(true)
      .parse((res3, cb) => {
        const biter: Buffer[] = [];
        res3.on("data", (b: Buffer) => biter.push(b));
        res3.on("end", () => cb(null, Buffer.concat(biter)));
      });
    expect(pakke.status).toBe(200);
    expect(pakke.headers["content-type"]).toBe("application/zip");
    const zipTekst = (pakke.body as Buffer).toString("latin1");
    expect((pakke.body as Buffer).subarray(0, 2).toString()).toBe("PK");
    expect(zipTekst).toContain("innsynsutlevering.pdf");
    expect(zipTekst).toContain("aapen.pdf");
    expect(zipTekst).not.toContain("hemmelig.pdf");
    expect(zipTekst).toContain("manifest.json");
    const { rows: pakkeLogg } = await pool.query(
      `SELECT detaljer FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 AND objekt_type = 'innsyn_utleveringspakke' AND objekt_id = $2`,
      [lederId, krav.body.id],
    );
    expect(pakkeLogg).toHaveLength(1);

    // Fristen kansellert; beslutningen journalført.
    const { rows: etterBeslutning } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'barnevern_innsynskrav' AND entity_id = $1`,
      [krav.body.id],
    );
    expect(etterBeslutning[0].status).toBe("kansellert");
    const journal = await request(sbApp).get(`/api/barnevern/saker/${sak.id}/journal`);
    const beslutningsInnforsel = journal.body.find((j: any) => j.innhold.includes("Innsynsbegjæring fra Mor Testesen"));
    expect(beslutningsInnforsel.kategori).toBe("vedtak");
    expect(beslutningsInnforsel.innhold).toContain("fvl. § 19");

    // Sikker dialog-utlevering krever part med aktiv tilgang.
    const utenPart = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/utlever`).send({
      via: "sikker_dialog",
    });
    expect(utenPart.status).toBe(409);
    expect(utenPart.body.code).toBe("INGEN_PART");

    const portalId = uniqueId("portal");
    await pool.query(
      `INSERT INTO users (id, username, password, email, kommune_id, role) VALUES ($1, $2, 'x', $3, $4, 'user')`,
      [portalId, portalId, `${portalId}@example.com`, kommuneId],
    );
    cleanupUserIds.push(portalId);
    const { rows: [{ melding_id: meldingId }] } = await pool.query(
      `SELECT melding_id FROM tidum_barnevern_saker WHERE id = $1`, [sak.id],
    );
    await withSystemRlsContext("innsyn_test_party_setup", async (client) => {
      const { rows: [party] } = await client.query(
        `INSERT INTO tidum_secure_parties (kommune_id, portal_user_id, display_name, notification_email, created_by)
         VALUES ($1, $2, 'Mor Testesen', $3, $4) RETURNING id`,
        [kommuneId, portalId, `${portalId}@example.com`, sbId],
      );
      await client.query(
        `INSERT INTO tidum_secure_case_access (kommune_id, party_id, barnevern_melding_id, party_role, created_by)
         VALUES ($1, $2, $3, 'forelder', $4)`,
        [kommuneId, party.id, meldingId, sbId],
      );
    });

    const utlevert = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/utlever`).send({
      via: "sikker_dialog",
    });
    expect(utlevert.status).toBe(200);
    expect(utlevert.body.status).toBe("utlevert");
    expect(utlevert.body.sikkerMeldingId).toBeTruthy();

    // Utleveringsmeldingen er sendt i sikker dialog.
    const { rows: [sikkerMelding] } = await pool.query(
      `SELECT status, sender_kind FROM tidum_secure_messages WHERE id = $1`,
      [utlevert.body.sikkerMeldingId],
    );
    expect(sikkerMelding.status).toBe("sent");
    expect(sikkerMelding.sender_kind).toBe("staff");

    const { rows: audit } = await pool.query(
      `SELECT detaljer FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 AND objekt_type = 'innsynsutlevering' AND objekt_id = $2`,
      [sbId, krav.body.id],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].detaljer.antallUnntak).toBe(1);

    // Klage → oversendelse (leder).
    const klage = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/klage`).send({
      notat: "Part klager på skjermingen.",
    });
    expect(klage.status).toBe(200);
    expect(klage.body.status).toBe("klage_mottatt");

    const oversendtAvSb = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/oversend-klage`).send({});
    expect(oversendtAvSb.status).toBe(403);
    const oversendt = await request(lederApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/oversend-klage`).send({});
    expect(oversendt.status).toBe(200);
    expect(oversendt.body.status).toBe("oversendt_klageinstans");
  });

  it("avslag krever begrunnelse; innvilget klage-sperre; tenant-isolasjon", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: lederApp } = await actorApp("leder", kommuneA, "barnevernsleder");
    const { app: sbApp } = await actorApp("sb", kommuneA, "kommune_saksbehandler");
    const { app: fremmedApp } = await actorApp("sb-b", kommuneB, "kommune_saksbehandler");
    const sak = await opprettSak(sbApp);

    const krav = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/innsynskrav`).send({
      partNavn: "Far Testesen", partRelasjon: "forelder",
    });

    const utenBegrunnelse = await request(lederApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/beslutning`).send({
      utfall: "avslatt",
    });
    expect(utenBegrunnelse.status).toBe(400);

    // Klage før beslutning avvises.
    const forTidligKlage = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/klage`).send({});
    expect(forTidligKlage.status).toBe(409);

    // Annen kommune når ingenting.
    const fremmedListe = await request(fremmedApp).get(`/api/barnevern/saker/${sak.id}/innsynskrav`);
    expect(fremmedListe.status).toBe(404);
    const fremmedBeslutning = await request(fremmedApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/utlever`).send({ via: "manuell" });
    expect(fremmedBeslutning.status).toBe(409);
  });
});
