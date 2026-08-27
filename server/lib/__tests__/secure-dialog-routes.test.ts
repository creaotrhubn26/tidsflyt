import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";
import { pool } from "../../db";
import { hashSsn } from "../eid-hash";

const storageState = vi.hoisted(() => ({ objects: new Map<string, Buffer>(), sequence: 0 }));
const malwareState = vi.hoisted(() => ({ mode: "clean" as "clean" | "infected" | "unavailable" }));

vi.mock("../secure-attachment-malware-scanner", () => {
  class MalwareScannerUnavailableError extends Error {}
  return {
    MalwareScannerUnavailableError,
    scanSecureAttachmentForMalware: async () => {
      if (malwareState.mode === "unavailable") throw new MalwareScannerUnavailableError();
      if (malwareState.mode === "infected") {
        return { status: "infected", engine: "clamav", signature: "Eicar-Signature" };
      }
      return { status: "clean", engine: "clamav" };
    },
  };
});

vi.mock("../secure-dialog-storage", () => ({
  generateSecureDialogAttachmentKey: (messageId: string, originalName: string) => {
    storageState.sequence += 1;
    const extension = originalName.includes(".") ? `.${originalName.split(".").pop()}` : "";
    return `secure-dialog/${messageId}/test-${storageState.sequence}${extension}`;
  },
  generateSecureDialogQuarantineKey: (messageId: string, originalName: string) => {
    storageState.sequence += 1;
    const extension = originalName.includes(".") ? `.${originalName.split(".").pop()}` : "";
    return `secure-dialog-quarantine/${messageId}/test-${storageState.sequence}${extension}`;
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

import {
  processExpiredSecureAttachmentQuarantine,
  registerSecureDialogRoutes,
} from "../../routes/secure-dialog-routes";
import { registerArchiveRoutes } from "../../routes/archive-routes";
import { resolveUserForVerifiedEid } from "../../eid-auth";
import { emailService } from "../email-service";
import {
  processSecureDialogKeyRotation,
  processSecureDialogRetention,
} from "../secure-dialog-governance";
import { processArchiveEntry } from "../archive/archive-service";
import { sealSecret } from "../secret-box";

describe("sikker dialog: part, eID, autorisasjon, audit og vedlegg", { timeout: 30000 }, () => {
  const cleanupKommuneIds: number[] = [];
  let ssnSequence = 1000;

  beforeAll(() => {
    process.env.EID_SSN_HASH_PEPPER = "secure-dialog-test-pepper-never-production";
    process.env.TIDUM_SECRET_KEY = "secure-dialog-test-key-never-production";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    malwareState.mode = "clean";
    storageState.objects.clear();
    delete process.env.TIDUM_SECRET_KEYRING;
    delete process.env.TIDUM_SECRET_ACTIVE_KEY_ID;
    delete process.env.ARCHIVE_ALLOWED_HOSTS;
    if (cleanupKommuneIds.length === 0) return;
    const ids = cleanupKommuneIds.splice(0);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE tidum_secure_dialog_audit_events, tidum_secure_attachment_quarantine, tidum_secure_message_attachments, tidum_secure_messages IN ACCESS EXCLUSIVE MODE");
      await client.query("ALTER TABLE tidum_secure_dialog_audit_events DISABLE TRIGGER tidum_secure_audit_immutable_trigger");
      await client.query("ALTER TABLE tidum_secure_message_attachments DISABLE TRIGGER tidum_secure_attachment_draft_trigger");
      await client.query("ALTER TABLE tidum_secure_messages DISABLE TRIGGER tidum_secure_message_immutable_trigger");

      const portalUsers = await client.query(
        `SELECT portal_user_id FROM tidum_secure_parties WHERE kommune_id = ANY($1::int[])`,
        [ids],
      );
      await client.query(`DELETE FROM archive_entries WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM archive_case_links WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM archive_configs WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_dialog_legal_holds WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_dialog_retention_policies WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_notification_outbox WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_message_receipts WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_attachment_quarantine WHERE kommune_id = ANY($1::int[])`, [ids]);
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
    registerArchiveRoutes(app);
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
    const scanEvidence = await pool.query(
      `SELECT scan_status, scan_engine, scanned_at
         FROM tidum_secure_message_attachments WHERE id = $1`,
      [attachment.body.id],
    );
    expect(scanEvidence.rows[0]).toEqual(expect.objectContaining({
      scan_status: "clean",
      scan_engine: "clamav",
      scanned_at: expect.any(Date),
    }));

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
    expect(stored.rows[0].body_encrypted).toMatch(/^sdc:v1:legacy-v1:/);
    expect(stored.rows[0].body_encrypted).not.toContain("Endelig og sensitiv melding");
    expect(stored.rows[0].subject).toMatch(/^sdc:v1:legacy-v1:/);
    expect(stored.rows[0].subject).not.toContain("Oppfølging");

    process.env.TIDUM_SECRET_KEYRING = JSON.stringify({
      "2026-11": "secure-dialog-rotated-test-key-never-production",
    });
    process.env.TIDUM_SECRET_ACTIVE_KEY_ID = "2026-11";
    const rotatedCount = await processSecureDialogKeyRotation(20, scenario.kommuneId);
    expect(rotatedCount).toEqual(expect.objectContaining({ conversations: 1, messages: 1, activeKeyId: "2026-11" }));
    const rotatedStored = await pool.query(
      `SELECT message.body_encrypted, conversation.subject
         FROM tidum_secure_messages message
         JOIN tidum_secure_conversations conversation ON conversation.id = message.conversation_id
        WHERE message.id = $1`,
      [draft.body.id],
    );
    expect(rotatedStored.rows[0].body_encrypted).toMatch(/^sdc:v1:2026-11:/);
    expect(String(rotatedStored.rows[0].body_encrypted).split(":").slice(4))
      .toEqual(String(stored.rows[0].body_encrypted).split(":").slice(4));

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
      "attachment_scanned",
      "attachment_uploaded",
      "message_sent",
      "notification_sent",
      "conversation_opened",
      "message_read",
      "attachment_downloaded",
      "audit_viewed",
      "encryption_key_rotated",
    ]));
    expect(JSON.stringify(audit.body)).not.toContain("Endelig og sensitiv melding");
    expect(JSON.stringify(audit.body)).not.toContain("varsling-");
    await expect(pool.query(
      `UPDATE tidum_secure_dialog_audit_events SET action = 'draft_updated' WHERE conversation_id = $1`,
      [conversation.body.id],
    )).rejects.toThrow(/immutable/);

    const closed = await request(scenario.staffApp)
      .post(`/api/secure-dialog/conversations/${conversation.body.id}/close`)
      .send({});
    expect(closed.status).toBe(200);
    expect(closed.body.archive).toEqual(expect.objectContaining({ status: "pending" }));
    const archiveEntry = await pool.query(
      `SELECT vendor_id, kommune_id, entity_type, entity_id, barnevern_melding_id, status
         FROM archive_entries WHERE id = $1`,
      [closed.body.archive.entryId],
    );
    expect(archiveEntry.rows[0]).toEqual(expect.objectContaining({
      vendor_id: null,
      kommune_id: scenario.kommuneId,
      entity_type: "secure_dialog",
      entity_id: conversation.body.id,
      barnevern_melding_id: scenario.meldingId,
      status: "pending",
    }));
  });

  it("setter skadevare i privat karantene og feiler lukket når skanneren er utilgjengelig", async () => {
    const scenario = await createPartyAndAccess();
    const conversation = await request(scenario.staffApp).post("/api/secure-dialog/conversations").send({
      meldingId: scenario.meldingId,
      subject: "Karantene",
      participantPartyIds: [scenario.partyId],
    });
    const infectedDraft = await request(scenario.staffApp)
      .post(`/api/secure-dialog/conversations/${conversation.body.id}/drafts`)
      .send({ content: "Skadevare skal ikke følge med" });

    malwareState.mode = "infected";
    const infected = await request(scenario.staffApp)
      .post(`/api/secure-dialog/messages/${infectedDraft.body.id}/attachments`)
      .attach("file", Buffer.from("%PDF-1.7\nEICAR"), { filename: "stoppet.pdf", contentType: "application/pdf" });
    expect(infected.status).toBe(422);
    expect(infected.body.code).toBe("ATTACHMENT_QUARANTINED");
    expect(JSON.stringify(infected.body)).not.toContain("Eicar-Signature");

    const quarantined = await pool.query(
      `SELECT id, storage_key, detected_signature, status
         FROM tidum_secure_attachment_quarantine WHERE message_id = $1`,
      [infectedDraft.body.id],
    );
    expect(quarantined.rows).toHaveLength(1);
    expect(quarantined.rows[0]).toEqual(expect.objectContaining({
      detected_signature: "Eicar-Signature",
      status: "quarantined",
    }));
    expect(String(quarantined.rows[0].storage_key)).toMatch(/^secure-dialog-quarantine\//);
    expect(storageState.objects.has(String(quarantined.rows[0].storage_key))).toBe(true);

    await pool.query(
      `UPDATE tidum_secure_attachment_quarantine
          SET expires_at = NOW() - INTERVAL '1 minute', next_attempt_at = NOW() - INTERVAL '1 minute'
        WHERE id = $1`,
      [quarantined.rows[0].id],
    );
    expect(await processExpiredSecureAttachmentQuarantine(1)).toBe(1);
    expect(storageState.objects.has(String(quarantined.rows[0].storage_key))).toBe(false);
    const deleted = await pool.query(
      `SELECT status, deleted_at FROM tidum_secure_attachment_quarantine WHERE id = $1`,
      [quarantined.rows[0].id],
    );
    expect(deleted.rows[0]).toEqual(expect.objectContaining({ status: "deleted", deleted_at: expect.any(Date) }));

    const unavailableDraft = await request(scenario.staffApp)
      .post(`/api/secure-dialog/conversations/${conversation.body.id}/drafts`)
      .send({ content: "Skanneren er nede" });
    malwareState.mode = "unavailable";
    const unavailable = await request(scenario.staffApp)
      .post(`/api/secure-dialog/messages/${unavailableDraft.body.id}/attachments`)
      .attach("file", Buffer.from("%PDF-1.7\nclean-but-unverified"), { filename: "ukjent.pdf", contentType: "application/pdf" });
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.code).toBe("MALWARE_SCANNER_UNAVAILABLE");
    expect((await pool.query(
      `SELECT COUNT(*)::int AS count FROM tidum_secure_attachment_quarantine WHERE message_id = $1`,
      [unavailableDraft.body.id],
    )).rows[0].count).toBe(0);

    const pendingKey = `secure-dialog/${unavailableDraft.body.id}/legacy-pending.pdf`;
    storageState.objects.set(pendingKey, Buffer.from("%PDF-1.7\nlegacy"));
    const pending = await pool.query(
      `INSERT INTO tidum_secure_message_attachments
         (kommune_id, message_id, storage_key, original_name, mime_type, size_bytes,
          checksum_sha256, uploaded_by, scan_status)
       VALUES ($1, $2, $3, 'legacy.pdf', 'application/pdf', 15, $4, $5, 'pending')
       RETURNING id`,
      [scenario.kommuneId, unavailableDraft.body.id, pendingKey, "a".repeat(64), scenario.staffId],
    );
    const blockedSend = await request(scenario.staffApp)
      .post(`/api/secure-dialog/messages/${unavailableDraft.body.id}/send`)
      .send({});
    expect(blockedSend.status).toBe(409);
    expect(blockedSend.body.code).toBe("ATTACHMENT_NOT_CLEAN");
    expect((await request(scenario.staffApp).get(
      `/api/secure-dialog/conversations/${conversation.body.id}/attachments/${pending.rows[0].id}`,
    )).status).toBe(404);

    const audit = await request(scenario.staffApp).get(`/api/secure-dialog/conversations/${conversation.body.id}/audit`);
    expect(audit.body.map((event: any) => event.action)).toEqual(expect.arrayContaining([
      "attachment_quarantined",
      "attachment_quarantine_deleted",
      "attachment_scan_failed",
    ]));
    expect(JSON.stringify(audit.body)).not.toContain("Eicar-Signature");
  });

  it("sletter aldri før arkivkvittering og lar juridisk sperring overstyre retensjon", async () => {
    const scenario = await createPartyAndAccess();
    const partyApp = await verifyPartyEid(scenario.portalUserId, scenario.personnummer, "bankid");
    const leaderId = await createStaff(scenario.kommuneId, "barnevernsleder");
    const leaderApp = appFor({ id: leaderId, provider: "entra_id" });
    const conversation = await request(scenario.staffApp).post("/api/secure-dialog/conversations").send({
      meldingId: scenario.meldingId,
      subject: "Retensjonstest",
      participantPartyIds: [scenario.partyId],
    });
    const draft = await request(scenario.staffApp)
      .post(`/api/secure-dialog/conversations/${conversation.body.id}/drafts`)
      .send({ content: "Skal arkiveres før lokal sletting" });
    vi.spyOn(emailService, "sendSecurePortalNotification").mockResolvedValue(true);
    expect((await request(scenario.staffApp).post(`/api/secure-dialog/messages/${draft.body.id}/send`).send({})).status).toBe(200);
    expect((await request(scenario.staffApp).post(`/api/secure-dialog/conversations/${conversation.body.id}/close`).send({})).status).toBe(200);

    const policy = await request(leaderApp).patch("/api/secure-dialog/governance/retention").send({
      enabled: true,
      retentionDays: 1,
      policyReference: "Testvedtak 2026-08",
    });
    expect(policy.status).toBe(200);
    await pool.query(
      `UPDATE tidum_secure_conversations
          SET retention_due_at = NOW() - INTERVAL '1 minute',
              retention_next_attempt_at = NOW() - INTERVAL '1 minute'
        WHERE id = $1`,
      [conversation.body.id],
    );

    // Ingen arkivkvittering: selv en forfalt, aktiv policy gir ingen sletting.
    expect(await processSecureDialogRetention(5, scenario.kommuneId)).toEqual({ processed: 0, purged: 0, failed: 0 });
    expect((await pool.query(`SELECT COUNT(*)::int AS count FROM tidum_secure_messages WHERE id = $1`, [draft.body.id])).rows[0].count).toBe(1);

    await pool.query(
      `UPDATE archive_entries
          SET status = 'archived', archived_at = NOW(), payload_hash = $2
        WHERE entity_type = 'secure_dialog' AND entity_id = $1 AND kommune_id = $3`,
      [conversation.body.id, "a".repeat(64), scenario.kommuneId],
    );
    const hold = await request(leaderApp)
      .post(`/api/secure-dialog/conversations/${conversation.body.id}/legal-holds`)
      .send({ reason: "Pågående klagebehandling" });
    expect(hold.status).toBe(201);
    expect(await processSecureDialogRetention(5, scenario.kommuneId)).toEqual({ processed: 0, purged: 0, failed: 0 });

    const governance = await request(leaderApp)
      .get(`/api/secure-dialog/conversations/${conversation.body.id}/governance`);
    expect(governance.status).toBe(200);
    expect(governance.body).toEqual(expect.objectContaining({
      archive_status: "archived",
      legal_hold_id: hold.body.id,
      retention_state: "active",
    }));

    expect((await request(leaderApp)
      .delete(`/api/secure-dialog/conversations/${conversation.body.id}/legal-holds/${hold.body.id}`)).status).toBe(200);
    expect(await processSecureDialogRetention(5, scenario.kommuneId)).toEqual({ processed: 1, purged: 1, failed: 0 });
    const purged = await pool.query(
      `SELECT subject, retention_state, purged_at FROM tidum_secure_conversations WHERE id = $1`,
      [conversation.body.id],
    );
    expect(purged.rows[0]).toEqual(expect.objectContaining({
      subject: null,
      retention_state: "purged",
      purged_at: expect.any(Date),
    }));
    expect((await pool.query(`SELECT COUNT(*)::int AS count FROM tidum_secure_messages WHERE conversation_id = $1`, [conversation.body.id])).rows[0].count).toBe(0);
    expect((await request(partyApp).get(`/api/secure-dialog/conversations/${conversation.body.id}`)).status).toBe(404);
    const audit = await pool.query(
      `SELECT action FROM tidum_secure_dialog_audit_events WHERE conversation_id = $1 ORDER BY created_at`,
      [conversation.body.id],
    );
    expect(audit.rows.map((row) => row.action)).toEqual(expect.arrayContaining([
      "archive_queued",
      "legal_hold_applied",
      "legal_hold_released",
      "retention_purge_started",
      "retention_purged",
    ]));
  });

  it("avgrenser kommune-arkivloggen og retry til serveravledet tenant", async () => {
    const scenario = await createPartyAndAccess();
    const conversation = await request(scenario.staffApp).post("/api/secure-dialog/conversations").send({
      meldingId: scenario.meldingId,
      subject: "Arkivscope",
      participantPartyIds: [scenario.partyId],
    });
    const closed = await request(scenario.staffApp)
      .post(`/api/secure-dialog/conversations/${conversation.body.id}/close`)
      .send({});
    expect(closed.status).toBe(200);

    const leaderA = await createStaff(scenario.kommuneId, "barnevernsleder");
    const leaderAApp = appFor({ id: leaderA, provider: "entra_id" });
    const kommuneB = await createKommune("archive-B");
    const leaderB = await createStaff(kommuneB, "barnevernsleder");
    const leaderBApp = appFor({ id: leaderB, provider: "entra_id" });

    const entriesA = await request(leaderAApp).get("/api/integrations/arkiv/entries");
    const entriesB = await request(leaderBApp).get("/api/integrations/arkiv/entries");
    expect(entriesA.status).toBe(200);
    expect(entriesA.body.map((entry: any) => entry.id)).toContain(closed.body.archive.entryId);
    expect(entriesB.status).toBe(200);
    expect(entriesB.body.map((entry: any) => entry.id)).not.toContain(closed.body.archive.entryId);
    const foreignRetry = await request(leaderBApp)
      .post(`/api/integrations/arkiv/entries/${closed.body.archive.entryId}/retry`)
      .send({});
    expect(foreignRetry.status).toBe(404);
  });

  it("verifiserer og lagrer separat Documaster-IDP uten å eksponere secret", async () => {
    const kommuneId = await createKommune("archive-connect");
    const leaderId = await createStaff(kommuneId, "barnevernsleder");
    const leaderApp = appFor({ id: leaderId, provider: "entra_id" });
    process.env.ARCHIVE_ALLOWED_HOSTS = "archive.integration.example.no,idp.integration.example.no";

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://idp.integration.example.no/oauth2/token") {
        expect(String(init?.body)).toContain("grant_type=client_credentials");
        return new Response(JSON.stringify({ access_token: "integration-token", expires_in: 300 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "https://archive.integration.example.no/rms/api/public/noark5/v1/query") {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer integration-token");
        return new Response(JSON.stringify({ results: [{ id: "archive-1" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const connected = await request(leaderApp).post("/api/integrations/arkiv/connect").send({
      provider: "documaster",
      baseUrl: "https://archive.integration.example.no",
      tokenUrl: "https://idp.integration.example.no/oauth2/token",
      clientId: "halden-test-client",
      clientSecret: "halden-test-secret",
      arkivdelId: "arkivdel-test",
      journalenhet: "BARNEVERN",
    });
    expect(connected.status).toBe(200);
    expect(connected.body).toEqual(expect.objectContaining({
      connected: true,
      kommuneId,
      tokenUrl: "https://idp.integration.example.no/oauth2/token",
    }));
    expect(connected.body).not.toHaveProperty("clientSecret");
    const stored = await pool.query(
      `SELECT token_url, client_secret FROM archive_configs WHERE kommune_id = $1`,
      [kommuneId],
    );
    expect(stored.rows[0].token_url).toBe("https://idp.integration.example.no/oauth2/token");
    expect(stored.rows[0].client_secret).not.toBe("halden-test-secret");

    const tested = await request(leaderApp).post("/api/integrations/arkiv/test").send({});
    expect(tested.status).toBe(200);
    expect(tested.body.tokenUrl).toBe("https://idp.integration.example.no/oauth2/token");
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "https://idp.integration.example.no/oauth2/token"))
      .toBe(true);

    const callsBeforeRejected = fetchMock.mock.calls.length;
    const rejected = await request(leaderApp).post("/api/integrations/arkiv/connect").send({
      baseUrl: "https://archive.integration.example.no",
      tokenUrl: "https://127.0.0.1/oauth2/token",
      clientId: "blocked",
      clientSecret: "blocked",
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toContain("tokenUrl");
    expect(fetchMock.mock.calls).toHaveLength(callsBeforeRejected);

    const caseworkerId = await createStaff(kommuneId, "kommune_saksbehandler");
    const caseworkerApp = appFor({ id: caseworkerId, provider: "entra_id" });
    const forbidden = await request(caseworkerApp).post("/api/integrations/arkiv/connect").send({
      baseUrl: "https://archive.integration.example.no",
      tokenUrl: "https://idp.integration.example.no/oauth2/token",
      clientId: "forbidden",
      clientSecret: "forbidden",
    });
    expect(forbidden.status).toBe(403);
    expect(fetchMock.mock.calls).toHaveLength(callsBeforeRejected);
  });

  it("arkiverer manifest, transkript og rent vedlegg idempotent mot Noark-adapteren", async () => {
    const scenario = await createPartyAndAccess();
    const conversation = await request(scenario.staffApp).post("/api/secure-dialog/conversations").send({
      meldingId: scenario.meldingId,
      subject: "Arkivpakke",
      participantPartyIds: [scenario.partyId],
    });
    const draft = await request(scenario.staffApp)
      .post(`/api/secure-dialog/conversations/${conversation.body.id}/drafts`)
      .send({ content: "Dialoginnhold i arkivpakken" });
    const attachmentBytes = Buffer.from("%PDF-1.7\narchive-package");
    const attachment = await request(scenario.staffApp)
      .post(`/api/secure-dialog/messages/${draft.body.id}/attachments`)
      .attach("file", attachmentBytes, { filename: "arkivvedlegg.pdf", contentType: "application/pdf" });
    expect(attachment.status).toBe(201);
    vi.spyOn(emailService, "sendSecurePortalNotification").mockResolvedValue(true);
    expect((await request(scenario.staffApp).post(`/api/secure-dialog/messages/${draft.body.id}/send`).send({})).status).toBe(200);
    const closed = await request(scenario.staffApp)
      .post(`/api/secure-dialog/conversations/${conversation.body.id}/close`)
      .send({});
    expect(closed.status).toBe(200);

    await pool.query(
      `INSERT INTO archive_configs
         (vendor_id, kommune_id, provider, base_url, client_id, client_secret,
          arkivdel_id, journalenhet, status, created_by)
       VALUES (NULL, $1, 'documaster', 'https://documaster.test', 'client', $2,
               'arkivdel-1', 'barnevern', 'active', $3)`,
      [scenario.kommuneId, sealSecret("documaster-test-secret"), scenario.staffId],
    );

    let uploads = 0;
    const fetchMock = vi.fn(async (urlInput: string | URL, init?: RequestInit) => {
      const url = String(urlInput);
      if (url.endsWith("/idp/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 300 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/query")) {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/upload")) {
        uploads += 1;
        return new Response(JSON.stringify({ id: `upload-${uploads}` }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/transaction")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const createsMappe = body.actions?.some((action: any) => action.type === "Saksmappe");
        return new Response(JSON.stringify({
          saved: createsMappe
            ? { "@mappe": { id: "mappe-1", fields: { mappeIdent: "M-1" } } }
            : { "@jp": { id: "journalpost-1", fields: { journalpostIdent: "JP-1" } } },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const archived = await processArchiveEntry(closed.body.archive.entryId);
    expect(archived.status).toBe("archived");
    expect(uploads).toBe(3);
    expect(archived.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(archived.archiveManifest).toEqual(expect.objectContaining({
      schemaVersion: 1,
      conversationId: conversation.body.id,
      auditEventCount: expect.any(Number),
      documents: expect.arrayContaining([
        expect.objectContaining({ logicalType: "transcript" }),
        expect.objectContaining({ logicalType: "attachment", sourceId: attachment.body.id }),
      ]),
    }));
    expect(archived.archiveEvidence).toEqual(expect.objectContaining({
      externalJournalpostId: "journalpost-1",
      documentCount: 3,
    }));
    const callsAfterFirst = fetchMock.mock.calls.length;
    expect((await processArchiveEntry(closed.body.archive.entryId)).status).toBe("archived");
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    const completed = await pool.query(
      `SELECT action FROM tidum_secure_dialog_audit_events
        WHERE conversation_id = $1 AND action = 'archive_completed'`,
      [conversation.body.id],
    );
    expect(completed.rowCount).toBe(1);
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
