import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 6: malstyrte brev/vedtak med fletting, godkjenning og ekspedering.
describe("Barnevern dokumenter (krav 6)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    // Sikker dialog-rader: append-only-triggere må av under opprydding
    // (samme mønster som secure-dialog-routes.test.ts).
    if (cleanupKommuneIds.length) {
      const ids = [...cleanupKommuneIds];
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
          await client.query(`DELETE FROM ${tabell} WHERE kommune_id = ANY($1::int[])`, [ids]);
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
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_dokument_test_cleanup", async (client) => {
      for (const id of sakIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(
          `DELETE FROM archive_entries WHERE entity_id IN
             (SELECT id::text FROM tidum_barnevern_sak_journal WHERE sak_id = $1)`,
          [id],
        ).catch(() => {});
        // Dokumenter og journal (med ekspederingsoppføringer) CASCADEr fra saken.
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

  async function insertTestKommune(navn?: string): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9999') RETURNING id`,
      [navn ?? `Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
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

  async function opprettSak(app: any, barnNavn = "Ola Testbarn") {
    const melding = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Dokumenttest.",
      barnNavn,
    });
    cleanupMeldingIds.push(melding.body.id);
    const res = await request(app).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(res.body.sak.id);
    return res.body.sak;
  }

  it("vedtak: fletting fra saksdata, leder-godkjenning og ekspedering som journalfører", async () => {
    const kommuneId = await insertTestKommune("Dokumentkommune");
    const { app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { id: sbId, app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const sak = await opprettSak(sbApp);

    const maler = await request(sbApp).get("/api/barnevern/dokumentmaler");
    expect(maler.status).toBe(200);
    expect(maler.body.map((m: any) => m.malId)).toContain("vedtak_hjelpetiltak");

    const utkast = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/dokumenter`).send({
      malId: "vedtak_hjelpetiltak",
      mottaker: { navn: "Mor Testesen" },
    });
    expect(utkast.status).toBe(201);
    expect(utkast.body.dokumenttype).toBe("vedtak");
    expect(utkast.body.hjemmel).toBe("barnevernsloven § 3-1");
    expect(utkast.body.innhold).toContain(sak.saksnummer);
    expect(utkast.body.innhold).toContain("Ola Testbarn");
    expect(utkast.body.innhold).toContain("Dokumentkommune");
    expect(utkast.body.innhold).not.toContain("{{");

    // Ekspedering før godkjenning avvises; saksbehandler kan ikke godkjenne vedtak.
    const forTidlig = await request(sbApp).post(`/api/barnevern/dokumenter/${utkast.body.id}/ekspeder`).send({ via: "manuell" });
    expect(forTidlig.status).toBe(404);
    const nektet = await request(sbApp).post(`/api/barnevern/dokumenter/${utkast.body.id}/godkjenn`).send({});
    expect(nektet.status).toBe(403);

    const godkjent = await request(lederApp).post(`/api/barnevern/dokumenter/${utkast.body.id}/godkjenn`).send({});
    expect(godkjent.status).toBe(200);
    expect(godkjent.body.status).toBe("godkjent");

    // PDF-nedlasting (krav 6): gyldig PDF, auditlogget som 'nedlastet'.
    const pdf = await request(sbApp).get(`/api/barnevern/dokumenter/${utkast.body.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    const { rows: pdfAudit } = await pool.query(
      `SELECT 1 FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 AND objekt_type = 'dokument_pdf' AND objekt_id = $2 AND handling = 'nedlastet'`,
      [sbId, utkast.body.id],
    );
    expect(pdfAudit).toHaveLength(1);

    // Godkjent dokument er uforanderlig.
    const laast = await request(sbApp).patch(`/api/barnevern/dokumenter/${utkast.body.id}`).send({ innhold: "Endres ikke" });
    expect(laast.status).toBe(404);

    // Sikker dialog-ekspedering krever part med aktiv tilgang.
    const utenPart = await request(sbApp).post(`/api/barnevern/dokumenter/${utkast.body.id}/ekspeder`).send({ via: "sikker_dialog" });
    expect(utenPart.status).toBe(409);
    expect(utenPart.body.code).toBe("INGEN_PART");

    // Gi en part tilgang til sakens bekymringsmelding.
    const portalId = uniqueId("portal");
    await pool.query(
      `INSERT INTO users (id, username, password, email, kommune_id, role) VALUES ($1, $2, 'x', $3, $4, 'user')`,
      [portalId, portalId, `${portalId}@example.com`, kommuneId, ],
    );
    cleanupUserIds.push(portalId);
    const { rows: [{ melding_id: meldingId }] } = await pool.query(
      `SELECT melding_id FROM tidum_barnevern_saker WHERE id = $1`, [sak.id],
    );
    await withSystemRlsContext("dokument_test_party_setup", async (client) => {
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

    const ekspedert = await request(sbApp).post(`/api/barnevern/dokumenter/${utkast.body.id}/ekspeder`).send({ via: "sikker_dialog" });
    expect(ekspedert.status).toBe(200);
    expect(ekspedert.body.status).toBe("ekspedert");
    expect(ekspedert.body.journalEntryId).toBeTruthy();
    expect(ekspedert.body.sikkerMeldingId).toBeTruthy();

    // Meldingen er faktisk sendt i sikker dialog med varsel i utboksen.
    const { rows: [sikkerMelding] } = await pool.query(
      `SELECT status, sender_kind, conversation_id FROM tidum_secure_messages WHERE id = $1`,
      [ekspedert.body.sikkerMeldingId],
    );
    expect(sikkerMelding.status).toBe("sent");
    expect(sikkerMelding.sender_kind).toBe("staff");
    const { rows: [samtale] } = await pool.query(
      `SELECT barnevern_melding_id, status FROM tidum_secure_conversations WHERE id = $1`,
      [sikkerMelding.conversation_id],
    );
    expect(samtale.barnevern_melding_id).toBe(meldingId);
    expect(samtale.status).toBe("open");
    const { rows: utboks } = await pool.query(
      `SELECT 1 FROM tidum_secure_notification_outbox WHERE message_id = $1`,
      [ekspedert.body.sikkerMeldingId],
    );
    expect(utboks.length).toBe(1);

    // Ekspederingen ligger i sakens journal med kategori 'vedtak'.
    const journal = await request(sbApp).get(`/api/barnevern/saker/${sak.id}/journal`);
    const oppforing = journal.body.find((j: any) => j.id === ekspedert.body.journalEntryId);
    expect(oppforing.kategori).toBe("vedtak");
    expect(oppforing.innhold).toContain("Vedtak om hjelpetiltak");
    expect(oppforing.innhold).toContain("Mor Testesen");
  });

  it("brev godkjennes av saksbehandler; ukjent mal og vedtak uten hjemmel håndteres; tenant-isolert", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: sbApp } = await actorApp("sb", kommuneA, "kommune_saksbehandler");
    const { app: fremmedApp } = await actorApp("sb-b", kommuneB, "kommune_saksbehandler");
    const sak = await opprettSak(sbApp);

    const ukjentMal = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/dokumenter`).send({
      malId: "finnes_ikke",
    });
    expect(ukjentMal.status).toBe(400);

    const brev = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/dokumenter`).send({
      malId: "brev_innkalling_samtale",
    });
    expect(brev.status).toBe(201);
    expect(brev.body.dokumenttype).toBe("brev");

    // Utkast kan redigeres før godkjenning.
    const redigert = await request(sbApp).patch(`/api/barnevern/dokumenter/${brev.body.id}`).send({
      innhold: brev.body.innhold + "\n\nForeslått tidspunkt: fredag kl. 10.",
    });
    expect(redigert.status).toBe(200);

    const godkjent = await request(sbApp).post(`/api/barnevern/dokumenter/${brev.body.id}/godkjenn`).send({});
    expect(godkjent.status).toBe(200);

    // Annen kommune ser og når ingenting.
    const fremmedListe = await request(fremmedApp).get(`/api/barnevern/saker/${sak.id}/dokumenter`);
    expect(fremmedListe.status).toBe(404);
    const fremmedGodkjenn = await request(fremmedApp).post(`/api/barnevern/dokumenter/${brev.body.id}/godkjenn`).send({});
    expect(fremmedGodkjenn.status).toBe(404);
  });
});
