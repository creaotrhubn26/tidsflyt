import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { pool } from "../../db";
import { registerForwardRoutes } from "../../routes/forward-routes";

process.env.ALLOW_DEV_AUTH_BYPASS = "false";

type Identity = { id: string; email: string; role: string; vendorId: number };

describe("secure-channel enforcement for report forwarding", () => {
  const nonce = `${Date.now()}_${Math.floor(Math.random() * 100_000)}`;
  const barnevernActor: Identity = {
    id: `forward-barnevern-${nonce}`,
    email: `forward-barnevern-${nonce}@example.no`,
    role: "tiltaksleder",
    vendorId: 991_001,
  };
  const ordinaryActor: Identity = {
    id: `forward-ordinary-${nonce}`,
    email: `forward-ordinary-${nonce}@example.no`,
    role: "tiltaksleder",
    vendorId: 992_001,
  };
  const createdDownloadTokens = new Set<string>();

  function appFor(identity: Identity) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = identity;
      req.isAuthenticated = () => true;
      next();
    });
    registerForwardRoutes(app);
    return app;
  }

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tidum_vendors (id, name, slug, institution_type)
       VALUES ($1, $2, $3, 'privat'), ($4, $5, $6, 'privat')`,
      [
        barnevernActor.vendorId,
        `Barnevern vendor ${nonce}`,
        `forward-barnevern-${nonce}`,
        ordinaryActor.vendorId,
        `Ordinary vendor ${nonce}`,
        `forward-ordinary-${nonce}`,
      ],
    );
    await pool.query(
      `INSERT INTO users (id, username, password, email, role, vendor_id)
       VALUES
         ($1::varchar, $1::text, 'unused-test-password', $2, $3, $4),
         ($5::varchar, $5::text, 'unused-test-password', $6, $3, $7)`,
      [
        barnevernActor.id,
        barnevernActor.email,
        barnevernActor.role,
        barnevernActor.vendorId,
        ordinaryActor.id,
        ordinaryActor.email,
        ordinaryActor.vendorId,
      ],
    );
    await pool.query(
      `INSERT INTO tidum_vendor_institutions (vendor_id, name, institution_type, active, created_by)
       VALUES ($1, $2, 'barnevern', true, $3)`,
      [barnevernActor.vendorId, `Barnevern ${nonce}`, barnevernActor.id],
    );
  });

  afterAll(async () => {
    const forwardDir = path.join(process.cwd(), "tmp", "forwards");
    for (const token of createdDownloadTokens) {
      const files = await fs.promises.readdir(forwardDir).catch(() => [] as string[]);
      for (const file of files.filter((name) => name.includes(token))) {
        await fs.promises.unlink(path.join(forwardDir, file)).catch(() => undefined);
      }
    }
    await pool.query(
      `DELETE FROM tidum_outbound_email_policy_events WHERE actor_user_id = ANY($1::text[])`,
      [[barnevernActor.id, ordinaryActor.id]],
    ).catch(() => undefined);
    await pool.query(`DELETE FROM tidum_vendor_institutions WHERE vendor_id = $1`, [barnevernActor.vendorId]).catch(() => undefined);
    await pool.query(
      `DELETE FROM users WHERE id = ANY($1::varchar[])`,
      [[barnevernActor.id, ordinaryActor.id]],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM tidum_vendors WHERE id = ANY($1::integer[])`,
      [[barnevernActor.vendorId, ordinaryActor.vendorId]],
    ).catch(() => undefined);
  });

  const reportPayload = {
    recipientEmail: "recipient@example.no",
    reportType: "timesheet",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
  };

  it("disables both SMTP and the manual-email fallback for a barnevern tenant", async () => {
    const app = appFor(barnevernActor);
    const status = await request(app).get("/api/forward/email-status");
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ smtp: false, secureChannelRequired: true });

    await pool.query(
      `UPDATE tidum_vendor_institutions SET institution_type = 'annet' WHERE vendor_id = $1`,
      [barnevernActor.vendorId],
    );
    const stickyStatus = await request(app).get("/api/forward/email-status");
    expect(stickyStatus.body).toMatchObject({ smtp: false, secureChannelRequired: true });

    const send = await request(app).post("/api/forward/send").send(reportPayload);
    expect(send.status).toBe(422);
    expect(send.body.code).toBe("SECURE_CHANNEL_REQUIRED");

    const prepare = await request(app).post("/api/forward/prepare").send(reportPayload);
    expect(prepare.status).toBe(422);
    expect(prepare.body.code).toBe("SECURE_CHANNEL_REQUIRED");

    const events = await pool.query(
      `SELECT route, reason_code, metadata
         FROM tidum_outbound_email_policy_events
        WHERE actor_user_id = $1
        ORDER BY route`,
      [barnevernActor.id],
    );
    expect(events.rows.map((row) => row.route)).toEqual(["/api/forward/prepare", "/api/forward/send"]);
    expect(events.rows.every((row) => row.reason_code === "BARNEVERN_SMTP_BLOCKED")).toBe(true);
    expect(JSON.stringify(events.rows)).not.toContain("recipient@example.no");
  });

  it("blocks the case-report category even for an ordinary tenant", async () => {
    const response = await request(appFor(ordinaryActor)).post("/api/forward/prepare").send({
      ...reportPayload,
      reportType: "case-report",
    });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe("SECURE_CHANNEL_REQUIRED");
  });

  it("tenant-scopes report selection and requires the authenticated file owner for download", async () => {
    const ordinaryApp = appFor(ordinaryActor);
    const foreignTarget = await request(ordinaryApp).post("/api/forward/prepare").send({
      ...reportPayload,
      userId: barnevernActor.id,
    });
    expect(foreignTarget.status).toBe(403);

    const prepared = await request(ordinaryApp).post("/api/forward/prepare").send(reportPayload);
    expect(prepared.status).toBe(200);
    expect(prepared.body.downloadUrl).toMatch(/^\/api\/forward\/download\/[a-f0-9]{32}$/);
    const token = prepared.body.downloadUrl.split("/").pop();
    createdDownloadTokens.add(token);

    const foreignDownload = await request(appFor(barnevernActor)).get(prepared.body.downloadUrl);
    expect(foreignDownload.status).toBe(404);
    const ownDownload = await request(ordinaryApp).get(prepared.body.downloadUrl);
    expect(ownDownload.status).toBe(200);
    expect(ownDownload.headers["content-type"]).toContain("spreadsheetml");
  });
});
