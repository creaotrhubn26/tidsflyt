import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";

vi.mock("../journal-attachment-storage", () => ({
  uploadJournalAttachment: vi.fn().mockResolvedValue(undefined),
  downloadJournalAttachment: vi.fn().mockResolvedValue(Buffer.from("fake-pdf-bytes")),
  generateAttachmentKey: (entryId: string, name: string) => `journal/${entryId}/fake-key.pdf`,
}));

// registerRoutes(httpServer, app) sin httpServer-parameter er kun en
// gjennomgangs-returverdi (server/routes.ts, `return httpServer;`) —
// samme mønster som task-assignment-routes.test.ts brukte.
//
// VIKTIG: ikke sett NODE_ENV=production her — sakerRouter/rapportRouter
// bruker sin egen lokale `requireAuth` (server/sakerRapportRoutes.ts:30),
// som kun sjekker `if (!req.user)` uten noen dev-bypass å forsvare seg mot.
// req.user injiseres direkte av test-middlewaren under.
describe("sak-journalføring: POST/GET journal + vedlegg", () => {
  const cleanupSakIds: string[] = [];
  const cleanupJournalIds: string[] = [];

  afterEach(async () => {
    for (const id of cleanupJournalIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_sak_journal_attachments WHERE journal_entry_id = $1`, [id]);
      await pool.query(`DELETE FROM tidum_sak_journal WHERE id = $1`, [id]);
    }
    for (const id of cleanupSakIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_saker WHERE id = $1`, [id]);
    }
  });

  async function insertTestSak(overrides: { tiltakslederId: number; tildelteUserId?: number[] }): Promise<string> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_saker (saksnummer, tittel, vendor_id, tiltaksleder_id, tildelte_user_id)
       VALUES ($1, 'Test-sak journal-ruter', 1, $2, $3::jsonb) RETURNING id`,
      [`TEST-JR-${Date.now()}-${Math.random()}`, overrides.tiltakslederId, JSON.stringify(overrides.tildelteUserId ?? [])],
    );
    cleanupSakIds.push(row.id);
    return row.id;
  }

  async function appWithUser(user: { id: number; role: string; vendorId?: number }) {
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = user;
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);
    return app;
  }

  it("tildelt bruker kan opprette og liste journalnotat på en sak", async () => {
    const sakId = await insertTestSak({ tiltakslederId: 999, tildelteUserId: [42] });
    const app = await appWithUser({ id: 42, role: "user" });

    const createRes = await request(app).post(`/api/saker/${sakId}/journal`).send({ content: "Første notat." });
    expect(createRes.status).toBe(201);
    expect(createRes.body.content).toBe("Første notat.");
    expect(createRes.body.userId).toBe(42);
    expect(createRes.body.sakId).toBe(sakId);
    cleanupJournalIds.push(createRes.body.id);

    const listRes = await request(app).get(`/api/saker/${sakId}/journal`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(createRes.body.id);
  });

  it("bruker som IKKE er tildelt saken og ikke er tiltaksleder får 403", async () => {
    const sakId = await insertTestSak({ tiltakslederId: 999, tildelteUserId: [42] });
    const app = await appWithUser({ id: 7, role: "user" });

    const res = await request(app).post(`/api/saker/${sakId}/journal`).send({ content: "Skal feile." });
    expect(res.status).toBe(403);
  });

  it("tiltaksleder på saken kan skrive journal selv om ikke eksplisitt tildelt", async () => {
    const sakId = await insertTestSak({ tiltakslederId: 555 });
    const app = await appWithUser({ id: 555, role: "vendor_admin" });

    const res = await request(app).post(`/api/saker/${sakId}/journal`).send({ content: "Fra tiltaksleder." });
    expect(res.status).toBe(201);
    cleanupJournalIds.push(res.body.id);
  });

  it("super_admin kan skrive journal på hvilken som helst sak", async () => {
    const sakId = await insertTestSak({ tiltakslederId: 999 });
    const app = await appWithUser({ id: 1, role: "super_admin" });

    const res = await request(app).post(`/api/saker/${sakId}/journal`).send({ content: "Fra super_admin." });
    expect(res.status).toBe(201);
    cleanupJournalIds.push(res.body.id);
  });

  it("en korreksjon kan opprettes med correctsEntryId, originalen forblir uendret", async () => {
    const sakId = await insertTestSak({ tiltakslederId: 999, tildelteUserId: [42] });
    const app = await appWithUser({ id: 42, role: "user" });

    const original = await request(app).post(`/api/saker/${sakId}/journal`).send({ content: "Feil tekst." });
    cleanupJournalIds.push(original.body.id);

    const correction = await request(app)
      .post(`/api/saker/${sakId}/journal`)
      .send({ content: "Rettet tekst.", correctsEntryId: original.body.id });
    expect(correction.status).toBe(201);
    expect(correction.body.correctsEntryId).toBe(original.body.id);
    cleanupJournalIds.push(correction.body.id);

    const list = await request(app).get(`/api/saker/${sakId}/journal`);
    const orig = list.body.find((e: any) => e.id === original.body.id);
    expect(orig.content).toBe("Feil tekst.");
  });

  it("correctsEntryId som peker på en oppføring på en ANNEN sak gir 400", async () => {
    const sakA = await insertTestSak({ tiltakslederId: 111, tildelteUserId: [10] });
    const sakB = await insertTestSak({ tiltakslederId: 222, tildelteUserId: [20] });

    const appB = await appWithUser({ id: 20, role: "user" });
    const entryB = await request(appB).post(`/api/saker/${sakB}/journal`).send({ content: "Hører til sak B." });
    cleanupJournalIds.push(entryB.body.id);

    const appA = await appWithUser({ id: 10, role: "user" });
    const res = await request(appA)
      .post(`/api/saker/${sakA}/journal`)
      .send({ content: "Forsøker å korrigere sak B sin oppføring.", correctsEntryId: entryB.body.id });
    expect(res.status).toBe(400);
  }, 15000);

  it("kan laste opp og laste ned et vedlegg til en journaloppføring", async () => {
    const sakId = await insertTestSak({ tiltakslederId: 999, tildelteUserId: [42] });
    const app = await appWithUser({ id: 42, role: "user" });

    const entry = await request(app).post(`/api/saker/${sakId}/journal`).send({ content: "Med vedlegg." });
    cleanupJournalIds.push(entry.body.id);

    const upload = await request(app)
      .post(`/api/saker/${sakId}/journal/${entry.body.id}/attachments`)
      .attach("file", Buffer.from("fake-pdf-bytes"), { filename: "dok.pdf", contentType: "application/pdf" });
    expect(upload.status).toBe(201);
    expect(upload.body.originalName).toBe("dok.pdf");

    const download = await request(app).get(
      `/api/saker/${sakId}/journal/${entry.body.id}/attachments/${upload.body.id}`,
    );
    expect(download.status).toBe(200);
    expect(download.body).toEqual(Buffer.from("fake-pdf-bytes"));
  });

  it("kan ikke laste ned et vedlegg via en sak det ikke tilhører (tvers-sak-lekkasje)", async () => {
    const sakA = await insertTestSak({ tiltakslederId: 111, tildelteUserId: [10] });
    const sakB = await insertTestSak({ tiltakslederId: 222, tildelteUserId: [20] });

    const appB = await appWithUser({ id: 20, role: "user" });
    const entryB = await request(appB).post(`/api/saker/${sakB}/journal`).send({ content: "Hører til sak B." });
    cleanupJournalIds.push(entryB.body.id);
    const uploadB = await request(appB)
      .post(`/api/saker/${sakB}/journal/${entryB.body.id}/attachments`)
      .attach("file", Buffer.from("fake-pdf-bytes"), { filename: "dok.pdf", contentType: "application/pdf" });
    expect(uploadB.status).toBe(201);

    const appA = await appWithUser({ id: 10, role: "user" });
    const leak = await request(appA).get(
      `/api/saker/${sakA}/journal/${entryB.body.id}/attachments/${uploadB.body.id}`,
    );
    expect(leak.status).toBe(404);
  }, 15000);

  it("kan liste alle vedlegg på en journaloppføring", async () => {
    const sakId = await insertTestSak({ tiltakslederId: 999, tildelteUserId: [42] });
    const app = await appWithUser({ id: 42, role: "user" });

    const entry = await request(app).post(`/api/saker/${sakId}/journal`).send({ content: "Med to vedlegg." });
    cleanupJournalIds.push(entry.body.id);

    const upload1 = await request(app)
      .post(`/api/saker/${sakId}/journal/${entry.body.id}/attachments`)
      .attach("file", Buffer.from("fake-pdf-bytes"), { filename: "dok1.pdf", contentType: "application/pdf" });
    const upload2 = await request(app)
      .post(`/api/saker/${sakId}/journal/${entry.body.id}/attachments`)
      .attach("file", Buffer.from("fake-pdf-bytes"), { filename: "dok2.pdf", contentType: "application/pdf" });
    expect(upload1.status).toBe(201);
    expect(upload2.status).toBe(201);

    const list = await request(app).get(`/api/saker/${sakId}/journal/${entry.body.id}/attachments`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    const names = list.body.map((a: any) => a.originalName).sort();
    expect(names).toEqual(["dok1.pdf", "dok2.pdf"]);
    expect(list.body[0]).toHaveProperty("id");
    expect(list.body[0]).toHaveProperty("mimeType");
  });

  it("bruker uten tilgang til saken får 403 på vedleggs-liste-endepunktet", async () => {
    const sakId = await insertTestSak({ tiltakslederId: 999, tildelteUserId: [42] });
    const owner = await appWithUser({ id: 42, role: "user" });
    const entry = await request(owner).post(`/api/saker/${sakId}/journal`).send({ content: "Beskyttet." });
    cleanupJournalIds.push(entry.body.id);

    const outsider = await appWithUser({ id: 7, role: "user" });
    const res = await request(outsider).get(`/api/saker/${sakId}/journal/${entry.body.id}/attachments`);
    expect(res.status).toBe(403);
  });

  it("ingen PATCH- eller DELETE-rute finnes for en journaloppføring", async () => {
    const sakId = await insertTestSak({ tiltakslederId: 999, tildelteUserId: [42] });
    const app = await appWithUser({ id: 42, role: "user" });
    const entry = await request(app).post(`/api/saker/${sakId}/journal`).send({ content: "Uforanderlig." });
    cleanupJournalIds.push(entry.body.id);

    const patchRes = await request(app).patch(`/api/saker/${sakId}/journal/${entry.body.id}`).send({ content: "Endret" });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app).delete(`/api/saker/${sakId}/journal/${entry.body.id}`);
    expect(deleteRes.status).toBe(404);
  });
});
