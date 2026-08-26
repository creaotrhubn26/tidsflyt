import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";
import { pool } from "../../db";
import { hashSsn } from "../eid-hash";

const storageState = vi.hoisted(() => ({ objects: new Map<string, Buffer>(), sequence: 0 }));

vi.mock("../secure-dialog-storage", () => ({
  generateSecureDialogAttachmentKey: (messageId: string, originalName: string) => {
    storageState.sequence += 1;
    const extension = originalName.includes(".") ? `.${originalName.split(".").pop()}` : "";
    return `secure-dialog/${messageId}/test-${storageState.sequence}${extension}`;
  },
  uploadSecureDialogAttachment: async (key: string, body: Buffer) => {
    storageState.objects.set(key, Buffer.from(body));
  },
  downloadSecureDialogAttachment: async (key: string) => {
    const value = storageState.objects.get(key);
    if (!value) throw new Error("missing test object");
    return Buffer.from(value);
  },
  deleteSecureDialogAttachment: async (key: string) => {
    storageState.objects.delete(key);
  },
}));

import { registerSecureDialogRoutes } from "../../routes/secure-dialog-routes";
import { resolveUserForVerifiedEid } from "../../eid-auth";
import { emailService } from "../email-service";

describe("sikker dialog: part, eID, autorisasjon, audit og vedlegg", { timeout: 30000 }, () => {
  const cleanupKommuneIds: number[] = [];
  let ssnSequence = 1000;

  beforeAll(() => {
    process.env.EID_SSN_HASH_PEPPER = "secure-dialog-test-pepper-never-production";
    process.env.TIDUM_SECRET_KEY = "secure-dialog-test-key-never-production";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    storageState.objects.clear();
    if (cleanupKommuneIds.length === 0) return;
    const ids = cleanupKommuneIds.splice(0);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE tidum_secure_dialog_audit_events, tidum_secure_message_attachments, tidum_secure_messages IN ACCESS EXCLUSIVE MODE");
      await client.query("ALTER TABLE tidum_secure_dialog_audit_events DISABLE TRIGGER tidum_secure_audit_immutable_trigger");
      await client.query("ALTER TABLE tidum_secure_message_attachments DISABLE TRIGGER tidum_secure_attachment_draft_trigger");
      await client.query("ALTER TABLE tidum_secure_messages DISABLE TRIGGER tidum_secure_message_immutable_trigger");

      const portalUsers = await client.query(
        `SELECT portal_user_id FROM tidum_secure_parties WHERE kommune_id = ANY($1::int[])`,
        [ids],
      );
      await client.query(`DELETE FROM tidum_secure_notification_outbox WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_message_receipts WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_message_attachments WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_messages WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_conversation_participants WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_conversations WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_case_access WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_dialog_audit_events WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_parties WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_frister WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_barnevern_melding_vedlegg WHERE melding_id IN (SELECT id FROM tidum_barnevern_meldinger WHERE kommune_id = ANY($1::int[]))`, [ids]);
      await client.query(`DELETE FROM tidum_barnevern_meldinger WHERE kommune_id = ANY($1::int[])`, [ids]);

      const userIds = portalUsers.rows.map((row) => String(row.portal_user_id));
      const staffUsers = await client.query(`SELECT id FROM users WHERE kommune_id = ANY($1::int[])`, [ids]);
      userIds.push(...staffUsers.rows.map((row) => String(row.id)));
      if (userIds.length > 0) {
        await client.query(`DELETE FROM tidum_eid_identities WHERE user_id = ANY($1::varchar[])`, [userIds]);
        await client.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [userIds]);
      }
      await client.query(`DELETE FROM tidum_kommuner WHERE id = ANY($1::int[])`, [ids]);

      await client.query("ALTER TABLE tidum_secure_messages ENABLE TRIGGER tidum_secure_message_immutable_trigger");
      await client.query("ALTER TABLE tidum_secure_message_attachments ENABLE TRIGGER tidum_secure_attachment_draft_trigger");
      await client.query("ALTER TABLE tidum_secure_dialog_audit_events ENABLE TRIGGER tidum_secure_audit_immutable_trigger");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  function nextSsn(): string {
    ssnSequence += 1;
    return `0101900${String(ssnSequence).padStart(4, "0")}`.slice(0, 11);
  }

  async function createKommune(label: string): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer)
       VALUES ($1, $2, $3) RETURNING id`,
      [
        `Secure test ${label} ${randomUUID()}`,
        String(900000000 + Math.floor(Math.random() * 90000000)),
        String(7000 + cleanupKommuneIds.length),
      ],
    );
    cleanupKommuneIds.push(Number(row.id));
    return Number(row.id);
  }

  async function createStaff(kommuneId: number, role = "kommune_saksbehandler"): Promise<string> {
    const id = `secure-test-${randomUUID()}`;
    await pool.query(
      `INSERT INTO users (id, username, password, email, role, kommune_id)
       VALUES ($1, $2, 'x', $3, $4, $5)`,
      [id, id, `${id}@example.no`, role, kommuneId],
    );
    return id;
  }

  async function createMelding(kommuneId: number): Promise<string> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_barnevern_meldinger
         (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, beskrivelse, avklaringsfrist)
       VALUES ($1, $2, 'manuell', NOW(), 'annet', 'Integrasjonstest', NOW() + INTERVAL '7 days')
       RETURNING id`,
      [kommuneId, `BVM-SECURE-${randomUUID()}`],
    );
    return String(row.id);
  }

  function appFor(user: { id: string; provider: string }) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = user;
      req.isAuthenticated = () => true;
      next();
    });
    registerSecureDialogRoutes(app);
    return app;
  }

  async function createPartyAndAccess(input?: { kommuneId?: number; staffId?: string; meldingId?: string }) {
    const kommuneId = input?.kommuneId ?? await createKommune("A");
    const staffId = input?.staffId ?? await createStaff(kommuneId);
    const meldingId = input?.meldingId ?? await createMelding(kommuneId);
    const staffApp = appFor({ id: staffId, provider: "entra_id" });
    const personnummer = nextSsn();
    const partyResponse = await request(staffApp).post("/api/secure-dialog/parties").send({
      displayName: "Test Forelder",
      personnummer,
      notificationEmail: `varsling-${randomUUID()}@example.no`,
    });
    expect(partyResponse.status).toBe(201);
    const { rows: [partyRow] } = await pool.query(
      `SELECT portal_user_id FROM tidum_secure_parties WHERE id = $1`,
      [partyResponse.body.id],
    );
    const accessResponse = await request(staffApp)
      .post(`/api/secure-dialog/cases/${meldingId}/access`)
      .send({ partyId: partyResponse.body.id, partyRole: "forelder" });
    expect(accessResponse.status).toBe(201);
    return {
      kommuneId,
      staffId,
      meldingId,
      staffApp,
      personnummer,
      partyId: String(partyResponse.body.id),
      portalUserId: String(partyRow.portal_user_id),
      accessId: String(accessResponse.body.id),
    };
  }

  async function verifyPartyEid(portalUserId: string, personnummer: string, provider: "bankid" | "buypass") {
    const resolved = await resolveUserForVerifiedEid({
      provider,
      sub: `${provider}-${randomUUID()}`,
      ssnHash: hashSsn(personnummer),
      givenName: "Test",
      familyName: "Forelder",
      fullName: "Test Forelder",
      rawClaims: { acr: provider },
    });
    expect(resolved?.id).toBe(portalUserId);
    return appFor({ id: portalUserId, provider });
  }

  it("oppretter eID-only part og kobler både BankID og Buypass til samme portalbruker", async () => {
    const scenario = await createPartyAndAccess();
    const partyList = await request(scenario.staffApp)
      .get(`/api/secure-dialog/parties?meldingId=${scenario.meldingId}`);
    expect(partyList.status).toBe(200);
    expect(partyList.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: scenario.partyId,
        displayName: "Test Forelder",
        eidLinked: false,
        access: expect.objectContaining({ id: scenario.accessId, partyRole: "forelder" }),
      }),
    ]));
    expect(JSON.stringify(partyList.body)).not.toContain(scenario.personnummer);
    const partyListAudit = await pool.query(
      `SELECT action FROM tidum_secure_dialog_audit_events
        WHERE kommune_id = $1 AND party_id = $2 AND action = 'party_listed'`,
      [scenario.kommuneId, scenario.partyId],
    );
    expect(partyListAudit.rowCount).toBeGreaterThan(0);

    const before = await pool.query(
      `SELECT email, role, expected_ssn_hash FROM users WHERE id = $1`,
      [scenario.portalUserId],
    );
    expect(before.rows[0].email).toBeNull();
    expect(before.rows[0].role).toBe("innbygger");
    expect(before.rows[0].expected_ssn_hash).toBe(hashSsn(scenario.personnummer));
    expect(before.rows[0].expected_ssn_hash).not.toContain(scenario.personnummer);

    await verifyPartyEid(scenario.portalUserId, scenario.personnummer, "bankid");
    await verifyPartyEid(scenario.portalUserId, scenario.personnummer, "buypass");
    const identities = await pool.query(
      `SELECT provider, user_id FROM tidum_eid_identities WHERE user_id = $1 ORDER BY provider`,
      [scenario.portalUserId],
    );
    expect(identities.rows).toEqual([
      expect.objectContaining({ provider: "bankid", user_id: scenario.portalUserId }),
      expect.objectContaining({ provider: "buypass", user_id: scenario.portalUserId }),
    ]);
    const after = await pool.query(`SELECT expected_ssn_hash FROM users WHERE id = $1`, [scenario.portalUserId]);
    expect(after.rows[0].expected_ssn_hash).toBeNull();

    const rawLeak = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM tidum_secure_parties party
         JOIN users portal_user ON portal_user.id = party.portal_user_id
        WHERE party.id = $1 AND (party::text LIKE $2 OR portal_user::text LIKE $2)`,
      [scenario.partyId, `%${scenario.personnummer}%`],
    );
    expect(rawLeak.rows[0].count).toBe(0);
  });

  it("sender kryptert, uforanderlig melding med privat vedlegg, lesekvittering og audit", async () => {
    const scenario = await createPartyAndAccess();
    const partyApp = await verifyPartyEid(scenario.portalUserId, scenario.personnummer, "bankid");
    const conversation = await request(scenario.staffApp).post("/api/secure-dialog/conversations").send({
      meldingId: scenario.meldingId,
      subject: "Oppfølging",
      participantPartyIds: [scenario.partyId],
    });
    expect(conversation.status).toBe(201);

    const draft = await request(scenario.staffApp)
      .post(`/api/secure-dialog/conversations/${conversation.body.id}/drafts`)
      .send({ content: "Første versjon" });
    expect(draft.status).toBe(201);
    const edited = await request(scenario.staffApp)
      .patch(`/api/secure-dialog/messages/${draft.body.id}/draft`)
      .send({ content: "Endelig og sensitiv melding" });
    expect(edited.status).toBe(200);

    const pdfBytes = Buffer.from("%PDF-1.7\nsecure-test-payload");
    const attachment = await request(scenario.staffApp)
      .post(`/api/secure-dialog/messages/${draft.body.id}/attachments`)
      .attach("file", pdfBytes, { filename: "vedtak.pdf", contentType: "application/pdf" });
    expect(attachment.status).toBe(201);

    const notification = vi.spyOn(emailService, "sendSecurePortalNotification").mockResolvedValue(true);
    const sent = await request(scenario.staffApp).post(`/api/secure-dialog/messages/${draft.body.id}/send`).send({});
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe("sent");
    expect(notification).toHaveBeenCalledTimes(1);

    const stored = await pool.query(
      `SELECT message.body_encrypted, conversation.subject
         FROM tidum_secure_messages message
         JOIN tidum_secure_conversations conversation ON conversation.id = message.conversation_id
        WHERE message.id = $1`,
      [draft.body.id],
    );
    expect(stored.rows[0].body_encrypted).toMatch(/^enc:v1:/);
    expect(stored.rows[0].body_encrypted).not.toContain("Endelig og sensitiv melding");
    expect(stored.rows[0].subject).toMatch(/^enc:v1:/);
    expect(stored.rows[0].subject).not.toContain("Oppfølging");

    const editAfterSend = await request(scenario.staffApp)
      .patch(`/api/secure-dialog/messages/${draft.body.id}/draft`)
      .send({ content: "Forsøk på endring" });
    expect(editAfterSend.status).toBe(404);
    await expect(pool.query(
      `UPDATE tidum_secure_messages SET body_encrypted = 'forfalsket' WHERE id = $1`,
      [draft.body.id],
    )).rejects.toThrow(/immutable/);

    const partyList = await request(partyApp).get("/api/secure-dialog/conversations");
    expect(partyList.status).toBe(200);
    expect(partyList.body.map((item: any) => item.id)).toContain(conversation.body.id);
    expect(partyList.body.find((item: any) => item.id === conversation.body.id).subject).toBe("Oppfølging");
    const partyRead = await request(partyApp).get(`/api/secure-dialog/conversations/${conversation.body.id}`);
    expect(partyRead.status).toBe(200);
    expect(partyRead.body.messages[0].content).toBe("Endelig og sensitiv melding");

    const download = await request(partyApp).get(
      `/api/secure-dialog/conversations/${conversation.body.id}/attachments/${attachment.body.id}`,
    );
    expect(download.status).toBe(200);
    expect(Buffer.from(download.body).equals(pdfBytes)).toBe(true);

    const receipts = await pool.query(
      `SELECT reader_user_id FROM tidum_secure_message_receipts WHERE message_id = $1`,
      [draft.body.id],
    );
    expect(receipts.rows.map((row) => row.reader_user_id)).toContain(scenario.portalUserId);
    const audit = await request(scenario.staffApp).get(`/api/secure-dialog/conversations/${conversation.body.id}/audit`);
    expect(audit.status).toBe(200);
    const actions = audit.body.map((event: any) => event.action);
    expect(actions).toEqual(expect.arrayContaining([
      "conversation_created",
      "draft_created",
      "draft_updated",
      "attachment_uploaded",
      "message_sent",
      "notification_sent",
      "conversation_opened",
      "message_read",
      "attachment_downloaded",
      "audit_viewed",
    ]));
    expect(JSON.stringify(audit.body)).not.toContain("Endelig og sensitiv melding");
    expect(JSON.stringify(audit.body)).not.toContain("varsling-");
    await expect(pool.query(
      `UPDATE tidum_secure_dialog_audit_events SET action = 'draft_updated' WHERE conversation_id = $1`,
      [conversation.body.id],
    )).rejects.toThrow(/immutable/);
  });

  it("avviser kommune B, ugranted part og e-postautentisert part uten å røpe objektet", async () => {
    const scenario = await createPartyAndAccess();
    const partyApp = await verifyPartyEid(scenario.portalUserId, scenario.personnummer, "bankid");
    const conversation = await request(scenario.staffApp).post("/api/secure-dialog/conversations").send({
      meldingId: scenario.meldingId,
      subject: "Kun autoriserte",
      participantPartyIds: [scenario.partyId],
    });
    expect(conversation.status).toBe(201);

    const kommuneB = await createKommune("B");
    const staffB = await createStaff(kommuneB);
    const staffBApp = appFor({ id: staffB, provider: "entra_id" });
    expect((await request(staffBApp).get(`/api/secure-dialog/conversations/${conversation.body.id}`)).status).toBe(404);
    const partiesB = await request(staffBApp).get("/api/secure-dialog/parties");
    expect(partiesB.status).toBe(200);
    expect(partiesB.body.map((party: any) => party.id)).not.toContain(scenario.partyId);
    expect((await request(staffBApp).get(`/api/secure-dialog/parties?meldingId=${scenario.meldingId}`)).status).toBe(404);

    const other = await createPartyAndAccess({
      kommuneId: scenario.kommuneId,
      staffId: scenario.staffId,
      meldingId: scenario.meldingId,
    });
    const otherPartyApp = await verifyPartyEid(other.portalUserId, other.personnummer, "bankid");
    expect((await request(otherPartyApp).get(`/api/secure-dialog/conversations/${conversation.body.id}`)).status).toBe(404);

    const emailOnlyApp = appFor({ id: scenario.portalUserId, provider: "email" });
    expect((await request(partyApp).get("/api/secure-dialog/parties")).status).toBe(403);
    expect((await request(emailOnlyApp).get(`/api/secure-dialog/conversations/${conversation.body.id}`)).status).toBe(404);
    expect((await request(emailOnlyApp).get("/api/secure-dialog/conversations")).status).toBe(403);
    expect((await request(partyApp).get(`/api/secure-dialog/conversations/${conversation.body.id}`)).status).toBe(200);
  });

  it("tilbakekalling fjerner partsinnsyn umiddelbart", async () => {
    const scenario = await createPartyAndAccess();
    const partyApp = await verifyPartyEid(scenario.portalUserId, scenario.personnummer, "buypass");
    const conversation = await request(scenario.staffApp).post("/api/secure-dialog/conversations").send({
      meldingId: scenario.meldingId,
      subject: "Tilbakekallbar",
      participantPartyIds: [scenario.partyId],
    });
    expect((await request(partyApp).get(`/api/secure-dialog/conversations/${conversation.body.id}`)).status).toBe(200);

    const revoked = await request(scenario.staffApp)
      .post(`/api/secure-dialog/access/${scenario.accessId}/revoke`)
      .send({});
    expect(revoked.status).toBe(200);
    expect((await request(partyApp).get(`/api/secure-dialog/conversations/${conversation.body.id}`)).status).toBe(404);
    const list = await request(partyApp).get("/api/secure-dialog/conversations");
    expect(list.status).toBe(200);
    expect(list.body.map((item: any) => item.id)).not.toContain(conversation.body.id);
    const audit = await request(scenario.staffApp).get(`/api/secure-dialog/conversations/${conversation.body.id}/audit`);
    expect(audit.body.map((event: any) => event.action)).toContain("access_revoked");
  });
});
