import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { pool } from "../../db";
import { registerEmailComposerRoutes } from "../../routes/email-composer-routes";

process.env.ALLOW_DEV_AUTH_BYPASS = "false";

type TestIdentity = { id: string; email: string; role: string; vendorId: number };

describe("email composer tenant and object authorization", () => {
  const nonce = `${Date.now()}_${Math.floor(Math.random() * 100_000)}`;
  const ownerA: TestIdentity = { id: `email-a-${nonce}`, email: `email-a-${nonce}@example.no`, role: "miljoarbeider", vendorId: 970_001 };
  const leaderA: TestIdentity = { id: `email-leader-a-${nonce}`, email: `email-leader-a-${nonce}@example.no`, role: "teamleder", vendorId: ownerA.vendorId };
  const ownerB: TestIdentity = { id: `email-b-${nonce}`, email: `email-b-${nonce}@example.no`, role: "miljoarbeider", vendorId: 980_001 };
  const barnevernOwner: TestIdentity = {
    id: `email-barnevern-${nonce}`,
    email: `email-barnevern-${nonce}@example.no`,
    role: "miljoarbeider",
    vendorId: 990_001,
  };
  const uploadDir = path.join(process.cwd(), "private-uploads", "email");
  const storedName = `${randomBytes(24).toString("hex")}.pdf`;
  const attachmentContent = Buffer.from("%PDF-1.7\nemail-composer-tenant-test\n", "utf8");
  const createdStoredNames = new Set<string>([storedName]);
  let templateAId = 0;
  let templateBId = 0;
  let publicTemplateId = 0;
  let draftAId = 0;
  let draftBId = 0;
  let attachmentAId = "";

  function appFor(identity: TestIdentity) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = identity;
      req.isAuthenticated = () => true;
      next();
    });
    registerEmailComposerRoutes(app);
    return app;
  }

  beforeAll(async () => {
    await fs.promises.mkdir(uploadDir, { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(path.join(uploadDir, storedName), attachmentContent, { mode: 0o600, flag: "wx" });

    await pool.query(
      `INSERT INTO users (id, username, password, email, first_name, last_name, role, vendor_id)
       VALUES
         ($1::varchar, $1::text, 'unused-test-password', $2, 'Eier', 'A', $3, $4),
         ($5::varchar, $5::text, 'unused-test-password', $6, 'Leder', 'A', $7, $4),
         ($8::varchar, $8::text, 'unused-test-password', $9, 'Eier', 'B', $3, $10)`,
      [
        ownerA.id, ownerA.email, ownerA.role, ownerA.vendorId,
        leaderA.id, leaderA.email, leaderA.role,
        ownerB.id, ownerB.email, ownerB.vendorId,
      ],
    );
    await pool.query(
      `INSERT INTO users (id, username, password, email, first_name, last_name, role, vendor_id)
       VALUES ($1::varchar, $1::text, 'unused-test-password', $2, 'Barnevern', 'Bruker', $3, $4)`,
      [barnevernOwner.id, barnevernOwner.email, barnevernOwner.role, barnevernOwner.vendorId],
    );
    await pool.query(
      `INSERT INTO tidum_vendor_institutions (vendor_id, name, institution_type, active, created_by)
       VALUES ($1, $2, 'barnevern', true, $3)`,
      [barnevernOwner.vendorId, `Barnevern ${nonce}`, barnevernOwner.id],
    );

    const templates = await pool.query(
      `INSERT INTO tidum_email_composer_templates
         (vendor_id, user_id, name, slug, subject, html_content, is_public)
       VALUES
         ($1, $2, $3, $4, 'Tenant A', '<p>A</p>', false),
         ($5, $6, $7, $8, 'Tenant B', '<p>B</p>', false),
         (NULL, NULL, $9, $10, 'System', '<p>System</p>', true)
       RETURNING id, slug`,
      [
        ownerA.vendorId, ownerA.id, `Tenant A ${nonce}`, `tenant-a-${nonce}`,
        ownerB.vendorId, ownerB.id, `Tenant B ${nonce}`, `tenant-b-${nonce}`,
        `System ${nonce}`, `system-${nonce}`,
      ],
    );
    templateAId = templates.rows.find((row) => row.slug === `tenant-a-${nonce}`).id;
    templateBId = templates.rows.find((row) => row.slug === `tenant-b-${nonce}`).id;
    publicTemplateId = templates.rows.find((row) => row.slug === `system-${nonce}`).id;

    const drafts = await pool.query(
      `INSERT INTO tidum_email_drafts (vendor_id, user_id, subject, body, status)
       VALUES ($1, $2, 'Draft A', '<p>A</p>', 'draft'), ($3, $4, 'Draft B', '<p>B</p>', 'draft')
       RETURNING id, user_id`,
      [ownerA.vendorId, ownerA.id, ownerB.vendorId, ownerB.id],
    );
    draftAId = drafts.rows.find((row) => row.user_id === ownerA.id).id;
    draftBId = drafts.rows.find((row) => row.user_id === ownerB.id).id;

    await pool.query(
      `INSERT INTO tidum_email_composer_history
         (vendor_id, sent_by, recipient_email, subject, status)
       VALUES ($1, $2, 'a-recipient@example.no', $3, 'sent'),
              ($4, $5, 'b-recipient@example.no', $6, 'sent')`,
      [ownerA.vendorId, ownerA.id, `History A ${nonce}`, ownerB.vendorId, ownerB.id, `History B ${nonce}`],
    );

    const attachment = await pool.query(
      `INSERT INTO tidum_email_attachments
         (vendor_id, user_id, stored_name, original_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, 'tenant-a.pdf', 'application/pdf', $4)
       RETURNING id::text`,
      [ownerA.vendorId, ownerA.id, storedName, attachmentContent.length],
    );
    attachmentAId = attachment.rows[0].id;
  });

  afterAll(async () => {
    const attachmentRows = await pool.query(
      `SELECT stored_name FROM tidum_email_attachments WHERE user_id = ANY($1::text[])`,
      [[ownerA.id, ownerB.id]],
    ).catch(() => ({ rows: [] as Array<{ stored_name: string }> }));
    for (const row of attachmentRows.rows) createdStoredNames.add(row.stored_name);

    await pool.query(`DELETE FROM tidum_email_attachments WHERE user_id = ANY($1::text[])`, [[ownerA.id, ownerB.id]]).catch(() => undefined);
    await pool.query(`DELETE FROM tidum_email_composer_history WHERE sent_by = ANY($1::text[])`, [[ownerA.id, ownerB.id, barnevernOwner.id]]).catch(() => undefined);
    await pool.query(`DELETE FROM tidum_email_drafts WHERE user_id = ANY($1::text[])`, [[ownerA.id, ownerB.id, barnevernOwner.id]]).catch(() => undefined);
    await pool.query(
      `DELETE FROM tidum_outbound_email_policy_events WHERE actor_user_id = ANY($1::text[])`,
      [[ownerA.id, ownerB.id, barnevernOwner.id]],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM tidum_email_composer_templates
       WHERE user_id = ANY($1::text[]) OR slug = $2`,
      [[ownerA.id, ownerB.id], `system-${nonce}`],
    ).catch(() => undefined);
    await pool.query(`DELETE FROM tidum_vendor_institutions WHERE vendor_id = $1`, [barnevernOwner.vendorId]).catch(() => undefined);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [[ownerA.id, leaderA.id, ownerB.id, barnevernOwner.id]]).catch(() => undefined);
    for (const name of createdStoredNames) {
      await fs.promises.unlink(path.join(uploadDir, path.basename(name))).catch(() => undefined);
    }
  });

  it("lists only system templates and templates owned by the authenticated actor", async () => {
    const response = await request(appFor(ownerA)).get("/api/email/templates");
    expect(response.status).toBe(200);
    const ids = response.body.map((template: any) => template.id);
    expect(ids).toEqual(expect.arrayContaining([templateAId, publicTemplateId]));
    expect(ids).not.toContain(templateBId);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("cannot read, mutate, or delete a foreign or system template", async () => {
    const app = appFor(ownerA);
    expect((await request(app).get(`/api/email/templates/${templateBId}`)).status).toBe(404);
    expect((await request(app).put(`/api/email/templates/${templateBId}`).send({ subject: "Overwritten" })).status).toBe(404);
    expect((await request(app).delete(`/api/email/templates/${templateBId}`)).status).toBe(404);
    expect((await request(app).put(`/api/email/templates/${publicTemplateId}`).send({ subject: "Overwritten" })).status).toBe(404);

    const unchanged = await pool.query(
      `SELECT subject, is_active FROM tidum_email_composer_templates WHERE id = $1`,
      [templateBId],
    );
    expect(unchanged.rows[0]).toEqual({ subject: "Tenant B", is_active: true });
  });

  it("server-derives template ownership and blocks ownership reassignment", async () => {
    const app = appFor(ownerA);
    const created = await request(app).post("/api/email/templates").send({
      vendorId: ownerB.vendorId,
      userId: ownerB.id,
      isPublic: true,
      name: `Created ${nonce}`,
      subject: "Created",
      htmlContent: '<p onclick="x()">Safe<script>x()</script></p>',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ vendorId: ownerA.vendorId, userId: ownerA.id, isPublic: false });
    expect(created.body.htmlContent).toBe("<p>Safe</p>");

    const reassignment = await request(app)
      .put(`/api/email/templates/${created.body.id}`)
      .send({ vendorId: ownerB.vendorId, subject: "Moved" });
    expect(reassignment.status).toBe(403);
  });

  it("tenant-scopes draft list, update, and delete operations", async () => {
    const app = appFor(ownerA);
    const listed = await request(app).get("/api/email/drafts");
    expect(listed.status).toBe(200);
    expect(listed.body.map((draft: any) => draft.id)).toContain(draftAId);
    expect(listed.body.map((draft: any) => draft.id)).not.toContain(draftBId);

    const foreignUpdate = await request(app).post("/api/email/drafts").send({ id: draftBId, subject: "Taken" });
    expect(foreignUpdate.status).toBe(404);
    expect((await request(app).delete(`/api/email/drafts/${draftBId}`)).status).toBe(404);
    const unchanged = await pool.query(`SELECT subject FROM tidum_email_drafts WHERE id = $1`, [draftBId]);
    expect(unchanged.rows[0].subject).toBe("Draft B");
  });

  it("tenant-scopes send history and team-member enumeration", async () => {
    const ownerHistory = await request(appFor(ownerA)).get("/api/email/sent");
    expect(ownerHistory.status).toBe(200);
    expect(ownerHistory.body.map((row: any) => row.subject)).toContain(`History A ${nonce}`);
    expect(ownerHistory.body.map((row: any) => row.subject)).not.toContain(`History B ${nonce}`);

    expect((await request(appFor(ownerA)).get("/api/email/team-members")).status).toBe(403);
    const leaderTeam = await request(appFor(leaderA)).get("/api/email/team-members");
    expect(leaderTeam.status).toBe(200);
    expect(leaderTeam.body.map((row: any) => row.id)).toEqual(expect.arrayContaining([ownerA.id, leaderA.id]));
    expect(leaderTeam.body.map((row: any) => row.id)).not.toContain(ownerB.id);
  });

  it("rejects URL attachments, foreign attachment IDs, and cross-user report export", async () => {
    const basePayload = { toEmail: "recipient@example.no", subject: "Test", body: "<p>Test</p>" };
    expect((await request(appFor(ownerA)).post("/api/email/send").send({
      ...basePayload,
      attachments: [{ url: "http://169.254.169.254/latest/meta-data" }],
    })).status).toBe(400);

    expect((await request(appFor(ownerB)).post("/api/email/send").send({
      ...basePayload,
      attachments: [{ id: attachmentAId }],
    })).status).toBe(404);

    expect((await request(appFor(ownerA)).post("/api/email/send").send({
      ...basePayload,
      attachReport: true,
      reportType: "timesheet",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      targetUserId: ownerB.id,
    })).status).toBe(403);
  });

  it("uploads private files and resolves only the owner's attachment metadata", async () => {
    const uploaded = await request(appFor(ownerA))
      .post("/api/email/attachments")
      .attach("file", Buffer.from("%PDF-1.7\nupload-test\n"), { filename: "test.pdf", contentType: "application/pdf" });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({ filename: "test.pdf", mimeType: "application/pdf" });
    expect(uploaded.body).not.toHaveProperty("url");

    const metadata = await pool.query(
      `SELECT vendor_id, user_id, stored_name FROM tidum_email_attachments WHERE id = $1`,
      [uploaded.body.id],
    );
    expect(metadata.rows[0]).toMatchObject({ vendor_id: ownerA.vendorId, user_id: ownerA.id });
    createdStoredNames.add(metadata.rows[0].stored_name);

    const ownSend = await request(appFor(ownerA)).post("/api/email/send").send({
      toEmail: "recipient@example.no",
      subject: `Own attachment ${nonce}`,
      body: "<p>Test</p>",
      attachments: [{ id: uploaded.body.id }],
    });
    expect(ownSend.status).toBe(503);
    const audit = await pool.query(
      `SELECT vendor_id, sent_by, status, attachments
       FROM tidum_email_composer_history WHERE subject = $1`,
      [`Own attachment ${nonce}`],
    );
    expect(audit.rows[0]).toMatchObject({ vendor_id: ownerA.vendorId, sent_by: ownerA.id, status: "failed" });
    expect(audit.rows[0].attachments).toEqual([{ filename: "test.pdf" }]);
  });

  it("blocks free-text SMTP, drafts, AI input, and attachment intake for a barnevern tenant", async () => {
    const app = appFor(barnevernOwner);
    const status = await request(app).get("/api/email/status");
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ smtp: false, ai: false, secureChannelRequired: true });

    const send = await request(app).post("/api/email/send").send({
      toEmail: "recipient@example.no",
      subject: `Sensitive ${nonce}`,
      body: "<p>Sensitive saksopplysninger</p>",
      category: "general",
    });
    expect(send.status).toBe(422);
    expect(send.body.code).toBe("SECURE_CHANNEL_REQUIRED");

    const draft = await request(app).post("/api/email/drafts").send({
      toEmail: "recipient@example.no",
      subject: `Sensitive draft ${nonce}`,
      body: "<p>Sensitive saksopplysninger</p>",
    });
    expect(draft.status).toBe(422);

    const ai = await request(app).post("/api/email/ai-draft").send({ sak: "Barn og sak", tema: "oppfølging" });
    expect(ai.status).toBe(422);

    const attachment = await request(app)
      .post("/api/email/attachments")
      .attach("file", Buffer.from("%PDF-1.7\nblocked\n"), { filename: "sak.pdf", contentType: "application/pdf" });
    expect(attachment.status).toBe(422);

    const persisted = await pool.query(
      `SELECT COUNT(*)::integer AS count FROM tidum_email_composer_history WHERE sent_by = $1 AND subject = $2`,
      [barnevernOwner.id, `Sensitive ${nonce}`],
    );
    expect(persisted.rows[0].count).toBe(0);

    const policyEvents = await pool.query(
      `SELECT reason_code, metadata FROM tidum_outbound_email_policy_events WHERE actor_user_id = $1`,
      [barnevernOwner.id],
    );
    expect(policyEvents.rows.length).toBeGreaterThanOrEqual(4);
    expect(policyEvents.rows.every((row) => row.reason_code === "BARNEVERN_SMTP_BLOCKED")).toBe(true);
    expect(JSON.stringify(policyEvents.rows)).not.toContain("Sensitive saksopplysninger");
    expect(JSON.stringify(policyEvents.rows)).not.toContain("recipient@example.no");
  });

  it("blocks a case-report category even outside an explicitly marked barnevern tenant", async () => {
    const response = await request(appFor(ownerA)).post("/api/email/send").send({
      toEmail: "recipient@example.no",
      subject: `Case report ${nonce}`,
      body: "<p>Rapport</p>",
      category: "case-report",
    });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe("SECURE_CHANNEL_REQUIRED");

    const event = await pool.query(
      `SELECT reason_code FROM tidum_outbound_email_policy_events
        WHERE actor_user_id = $1 AND route = '/api/email/send'
        ORDER BY created_at DESC LIMIT 1`,
      [ownerA.id],
    );
    expect(event.rows[0]?.reason_code).toBe("SENSITIVE_CATEGORY_BLOCKED");
  });

  it("fails closed when the background scheduler encounters a restricted tenant", async () => {
    const scheduled = await pool.query(
      `INSERT INTO tidum_email_drafts
         (vendor_id, user_id, to_email, subject, body, status, send_at)
       VALUES ($1, $2, 'recipient@example.no', $3, '<p>Sensitive</p>', 'scheduled', NOW() - INTERVAL '1 minute')
       RETURNING id`,
      [barnevernOwner.vendorId, barnevernOwner.id, `Scheduled sensitive ${nonce}`],
    );

    const trigger = await request(appFor(ownerA)).get("/api/email/drafts");
    expect(trigger.status).toBe(200);

    const state = await pool.query(
      `SELECT status FROM tidum_email_drafts WHERE id = $1`,
      [scheduled.rows[0].id],
    );
    expect(state.rows[0]?.status).toBe("failed");
    const history = await pool.query(
      `SELECT COUNT(*)::integer AS count FROM tidum_email_composer_history WHERE sent_by = $1 AND subject = $2`,
      [barnevernOwner.id, `Scheduled sensitive ${nonce}`],
    );
    expect(history.rows[0].count).toBe(0);
  });
});
