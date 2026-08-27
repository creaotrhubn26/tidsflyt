import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { pool } from "../../db";
import { leaveAttachmentDirectory } from "../leave-attachment-security";
import { eraseUser } from "../gdpr";

const { scanMock } = vi.hoisted(() => ({ scanMock: vi.fn() }));
vi.mock("../secure-attachment-malware-scanner", () => {
  class MalwareScannerUnavailableError extends Error {
    constructor() {
      super("MALWARE_SCANNER_UNAVAILABLE");
    }
  }
  return {
    MalwareScannerUnavailableError,
    scanSecureAttachmentForMalware: scanMock,
  };
});

import { registerLeaveRoutes } from "../../routes/leave-routes";
import { registerLeaveAttachmentsRoutes } from "../../routes/leave-attachments-routes";
import { registerLeaveRolloverRoutes, runLeaveRollover } from "../../routes/leave-rollover-cron";

type Identity = { id: string; role: string; vendorId?: number | null };

describe("leave and health-attachment tenant security", () => {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const memberAId = `leave-member-a-${nonce}`;
  const managerAId = `leave-manager-a-${nonce}`;
  const memberBId = `leave-member-b-${nonce}`;
  const superId = `leave-super-${nonce}`;
  let vendorAId = 0;
  let vendorBId = 0;
  let leaveTypeId = 0;
  let requestAId = 0;
  let requestBId = 0;
  let attachmentId = "";
  let attachmentStorageName = "";

  function appFor(identity: Identity) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = identity;
      req.isAuthenticated = () => true;
      next();
    });
    registerLeaveRoutes(app);
    registerLeaveAttachmentsRoutes(app);
    registerLeaveRolloverRoutes(app);
    return app;
  }

  beforeAll(async () => {
    const migration = readFileSync("migrations/079_leave_tenant_security.sql", "utf8");
    const gdprAuditMigration = readFileSync("migrations/080_gdpr_erasure_audit.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration);
    await pool.query(gdprAuditMigration);
    await pool.query(gdprAuditMigration);

    const vendors = await pool.query(
      `INSERT INTO tidum_vendors (name, slug)
       VALUES ($1, $2), ($3, $4)
       RETURNING id, slug`,
      [
        `Leave tenant A ${nonce}`,
        `leave-a-${nonce}`,
        `Leave tenant B ${nonce}`,
        `leave-b-${nonce}`,
      ],
    );
    vendorAId = Number(vendors.rows.find((row) => row.slug === `leave-a-${nonce}`).id);
    vendorBId = Number(vendors.rows.find((row) => row.slug === `leave-b-${nonce}`).id);

    await pool.query(
      `INSERT INTO users (id, username, password, email, role, vendor_id)
       VALUES
         ($1, $2, 'x', $3, 'member', $4),
         ($5, $6, 'x', $7, 'tiltaksleder', $4),
         ($8, $9, 'x', $10, 'member', $11),
         ($12, $13, 'x', $14, 'super_admin', NULL)`,
      [
        memberAId,
        `leave_member_a_${nonce}`,
        `leave-member-a-${nonce}@example.com`,
        vendorAId,
        managerAId,
        `leave_manager_a_${nonce}`,
        `leave-manager-a-${nonce}@example.com`,
        memberBId,
        `leave_member_b_${nonce}`,
        `leave-member-b-${nonce}@example.com`,
        vendorBId,
        superId,
        `leave_super_${nonce}`,
        `leave-super-${nonce}@example.com`,
      ],
    );

    const type = await pool.query(
      `INSERT INTO tidum_leave_types (name, slug, is_active, max_days_per_year)
       VALUES ($1, $2, true, 25)
       RETURNING id`,
      [`Testfravær ${nonce}`, "ferie"],
    );
    leaveTypeId = Number(type.rows[0].id);

    await pool.query(
      `INSERT INTO tidum_leave_balances
         (vendor_id, user_id, leave_type_id, year, total_days, used_days, pending_days, remaining_days)
       VALUES
         ($1, $2, $3, 2026, '25', '0', '1', '24'),
         ($4, $5, $3, 2026, '25', '0', '1', '24')`,
      [vendorAId, memberAId, leaveTypeId, vendorBId, memberBId],
    );

    const requests = await pool.query(
      `INSERT INTO tidum_leave_requests
         (vendor_id, user_id, leave_type_id, start_date, end_date, days, reason, status)
       VALUES
         ($1, $2, $3, '2026-09-01', '2026-09-01', '1', 'Tenant A sensitive reason', 'pending'),
         ($4, $5, $3, '2026-09-02', '2026-09-02', '1', 'Tenant B sensitive reason', 'pending')
       RETURNING id, user_id`,
      [vendorAId, memberAId, leaveTypeId, vendorBId, memberBId],
    );
    requestAId = Number(requests.rows.find((row) => row.user_id === memberAId).id);
    requestBId = Number(requests.rows.find((row) => row.user_id === memberBId).id);
  });

  beforeEach(() => {
    scanMock.mockReset();
    scanMock.mockResolvedValue({ status: "clean", engine: "clamav" });
  });

  afterAll(async () => {
    const stored = await pool.query(
      `SELECT la.filename
         FROM tidum_leave_attachments la
         JOIN tidum_leave_requests lr ON lr.id = la.leave_request_id
        WHERE lr.user_id = ANY($1::text[])`,
      [[memberAId, memberBId]],
    ).catch(() => ({ rows: [] as any[] }));
    await pool.query(
      `DELETE FROM tidum_leave_requests WHERE user_id = ANY($1::text[])`,
      [[memberAId, memberBId]],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM tidum_leave_balances WHERE user_id = ANY($1::text[])`,
      [[memberAId, memberBId]],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM users WHERE id = ANY($1::text[])`,
      [[memberAId, managerAId, memberBId, superId]],
    ).catch(() => undefined);
    await pool.query("DELETE FROM tidum_leave_types WHERE id = $1", [leaveTypeId]).catch(() => undefined);
    await pool.query("DELETE FROM tidum_vendors WHERE id = ANY($1::int[])", [[vendorAId, vendorBId]]).catch(() => undefined);
    await Promise.all(
      stored.rows.map((row: any) => fs.unlink(path.join(leaveAttachmentDirectory(), row.filename)).catch(() => undefined)),
    );
  });

  it("migration is idempotent and validates composite tenant constraints", async () => {
    const constraints = await pool.query(
      `SELECT conname, convalidated
         FROM pg_constraint
        WHERE conname IN (
          'tidum_leave_requests_user_vendor_fkey',
          'tidum_leave_balances_user_vendor_fkey',
          'tidum_leave_attachments_request_vendor_fkey'
        )
        ORDER BY conname`,
    );
    expect(constraints.rows).toEqual([
      { conname: "tidum_leave_attachments_request_vendor_fkey", convalidated: true },
      { conname: "tidum_leave_balances_user_vendor_fkey", convalidated: true },
      { conname: "tidum_leave_requests_user_vendor_fkey", convalidated: true },
    ]);
  });

  it("member sees only own tenant-bound requests and cannot select a foreign user", async () => {
    const app = appFor({ id: memberAId, role: "member", vendorId: vendorAId });
    const own = await request(app).get("/api/leave/requests");
    expect(own.status).toBe(200);
    expect(own.headers["cache-control"]).toBe("no-store");
    expect(own.body.map((row: any) => row.id)).toContain(requestAId);
    expect(own.body.map((row: any) => row.id)).not.toContain(requestBId);

    const foreign = await request(app).get(`/api/leave/requests?userId=${encodeURIComponent(memberBId)}`);
    expect(foreign.status).toBe(404);
  });

  it("fresh DB role and vendor override forged/stale claims", async () => {
    const app = appFor({ id: memberAId, role: "hovedadmin", vendorId: vendorBId });
    const response = await request(app).get("/api/leave/requests?status=pending");
    expect(response.status).toBe(200);
    expect(response.body.map((row: any) => row.id)).toEqual([requestAId]);
  });

  it("tenant manager can review own tenant but not a foreign tenant", async () => {
    const app = appFor({ id: managerAId, role: "tiltaksleder", vendorId: vendorAId });
    const list = await request(app).get("/api/leave/requests?status=pending");
    expect(list.status).toBe(200);
    expect(list.body.map((row: any) => row.id)).toContain(requestAId);
    expect(list.body.map((row: any) => row.id)).not.toContain(requestBId);

    expect((await request(app).patch(`/api/leave/requests/${requestBId}`).send({ status: "approved" })).status).toBe(404);
    expect((await request(app).patch(`/api/leave/requests/${requestAId}`).send({ status: "approved" })).status).toBe(200);
    const statuses = await pool.query(
      "SELECT id, status FROM tidum_leave_requests WHERE id = ANY($1::int[]) ORDER BY id",
      [[requestAId, requestBId]],
    );
    expect(statuses.rows.find((row) => row.id === requestAId).status).toBe("approved");
    expect(statuses.rows.find((row) => row.id === requestBId).status).toBe("pending");
  });

  it("global supplier super_admin has no implicit access to customer health data", async () => {
    const app = appFor({ id: superId, role: "super_admin", vendorId: null });
    expect((await request(app).get("/api/leave/requests")).status).toBe(403);
    expect((await request(app).get(`/api/leave/${requestAId}/attachments`)).status).toBe(403);
  });

  it("server derives owner and tenant when creating a request", async () => {
    const app = appFor({ id: memberAId, role: "hovedadmin", vendorId: vendorBId });
    const reassignment = await request(app).post("/api/leave/requests").send({
      userId: memberBId,
      leaveTypeId,
      startDate: "2026-10-01",
      endDate: "2026-10-01",
      days: 1,
    });
    expect(reassignment.status).toBe(403);

    const created = await request(app).post("/api/leave/requests").send({
      userId: memberAId,
      leaveTypeId,
      startDate: "2026-10-01",
      endDate: "2026-10-01",
      days: 1,
      reason: "Own request",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ userId: memberAId, vendorId: vendorAId });
  });

  it("carries vendor binding through the annual leave rollover", async () => {
    const fromYear = 2400;
    const targetYear = 2401;
    await pool.query(
      `INSERT INTO tidum_leave_balances
         (vendor_id, user_id, leave_type_id, year, total_days, used_days, pending_days, remaining_days)
       VALUES
         ($1, $2, $3, $4, '25', '5', '0', '20'),
         ($5, $6, $3, $4, '25', '20', '0', '5')`,
      [vendorAId, memberAId, leaveTypeId, fromYear, vendorBId, memberBId],
    );

    const result = await runLeaveRollover(targetYear, fromYear);
    expect(result.find((row) => row.userId === memberAId)?.carriedOverDays).toBe(12);
    expect(result.find((row) => row.userId === memberBId)?.carriedOverDays).toBe(5);

    const balances = await pool.query(
      `SELECT vendor_id, user_id, remaining_days
         FROM tidum_leave_balances
        WHERE user_id = ANY($1::text[])
          AND year = $2
        ORDER BY user_id`,
      [[memberAId, memberBId], targetYear],
    );
    expect(balances.rows).toEqual([
      { vendor_id: vendorAId, user_id: memberAId, remaining_days: "37" },
      { vendor_id: vendorBId, user_id: memberBId, remaining_days: "30" },
    ]);
  });

  it("scopes manual rollover to a fresh manager tenant", async () => {
    const fromYear = 2097;
    const targetYear = 2098;
    await pool.query(
      `INSERT INTO tidum_leave_balances
         (vendor_id, user_id, leave_type_id, year, total_days, used_days, pending_days, remaining_days)
       VALUES
         ($1, $2, $3, $4, '25', '20', '0', '5'),
         ($5, $6, $3, $4, '25', '18', '0', '7')`,
      [vendorAId, memberAId, leaveTypeId, fromYear, vendorBId, memberBId],
    );

    const forged = appFor({ id: memberAId, role: "hovedadmin", vendorId: vendorBId });
    expect((await request(forged).post("/api/leave/rollover/run").send({ targetYear, fromYear })).status).toBe(403);

    const manager = appFor({ id: managerAId, role: "member", vendorId: vendorBId });
    const response = await request(manager).post("/api/leave/rollover/run").send({ targetYear, fromYear });
    expect(response.status).toBe(200);
    expect(response.body.results.map((row: any) => row.userId)).toEqual([memberAId]);

    const targetRows = await pool.query(
      `SELECT vendor_id, user_id
         FROM tidum_leave_balances
        WHERE year = $1
          AND user_id = ANY($2::text[])
        ORDER BY user_id`,
      [targetYear, [memberAId, memberBId]],
    );
    expect(targetRows.rows).toEqual([{ vendor_id: vendorAId, user_id: memberAId }]);
  });

  it("GDPR erasure preserves the tenant FK while removing health content and files", async () => {
    const erasedUserId = `leave-erasure-${nonce}`;
    const storageName = `${crypto.randomUUID()}.pdf`;
    const storagePath = path.join(leaveAttachmentDirectory(), storageName);
    let pseudonym = "";
    await fs.mkdir(leaveAttachmentDirectory(), { recursive: true, mode: 0o700 });
    await fs.writeFile(storagePath, "%PDF-1.4\n%%EOF\n", { mode: 0o600 });

    try {
      await pool.query(
        `INSERT INTO users (id, username, password, email, role, vendor_id)
         VALUES ($1, $2, 'x', $3, 'member', $4)`,
        [erasedUserId, `leave_erasure_${nonce}`, `leave-erasure-${nonce}@example.com`, vendorAId],
      );
      const leaveRequest = await pool.query(
        `INSERT INTO tidum_leave_requests
           (vendor_id, user_id, leave_type_id, start_date, end_date, days, reason, status)
         VALUES ($1, $2, $3, '2026-11-01', '2026-11-01', '1', 'Sensitive health reason', 'pending')
         RETURNING id`,
        [vendorAId, erasedUserId, leaveTypeId],
      );
      await pool.query(
        `INSERT INTO tidum_leave_attachments
           (vendor_id, leave_request_id, filename, original_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1, $2, $3, 'sykmelding.pdf', 'application/pdf', 16, $4)`,
        [vendorAId, leaveRequest.rows[0].id, storageName, erasedUserId],
      );

      const result = await eraseUser(
        erasedUserId,
        "security-test-actor",
        "Automated GDPR regression TEST-LEAVE-ERASURE",
      );
      pseudonym = result.pseudonym;
      expect(result.rowsAffected.tidum_leave_requests).toBe(1);
      expect(result.rowsAffected.tidum_leave_attachments).toBe(1);
      expect(result.filesDeleted).toBe(1);

      const preserved = await pool.query(
        `SELECT user_id, vendor_id, reason
           FROM tidum_leave_requests
          WHERE id = $1`,
        [leaveRequest.rows[0].id],
      );
      expect(preserved.rows[0]).toEqual({ user_id: erasedUserId, vendor_id: vendorAId, reason: null });
      expect((await pool.query(
        "SELECT COUNT(*)::int AS count FROM tidum_leave_attachments WHERE leave_request_id = $1",
        [leaveRequest.rows[0].id],
      )).rows[0].count).toBe(0);
      await expect(fs.access(storagePath)).rejects.toThrow();
    } finally {
      await fs.unlink(storagePath).catch(() => undefined);
      await pool.query("DELETE FROM tidum_leave_requests WHERE user_id = $1", [erasedUserId]).catch(() => undefined);
      await pool.query("DELETE FROM users WHERE id = $1", [erasedUserId]).catch(() => undefined);
      if (pseudonym) {
        await pool.query("DELETE FROM tidum_gdpr_erasure_audit WHERE target_pseudonym = $1", [pseudonym]).catch(() => undefined);
      }
    }
  });

  it("validates, malware-scans and privately serves a tenant-scoped attachment", async () => {
    const memberA = appFor({ id: memberAId, role: "member", vendorId: vendorAId });
    const memberB = appFor({ id: memberBId, role: "member", vendorId: vendorBId });
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

    const invalid = await request(memberA)
      .post(`/api/leave/${requestAId}/attachments`)
      .attach("file", Buffer.from("not a pdf"), { filename: "fake.pdf", contentType: "application/pdf" });
    expect(invalid.status).toBe(400);
    expect(scanMock).not.toHaveBeenCalled();

    const uploaded = await request(memberA)
      .post(`/api/leave/${requestAId}/attachments`)
      .attach("file", pdf, { filename: "legeerklæring.pdf", contentType: "application/pdf" });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.filename).toBeUndefined();
    expect(uploaded.body.originalName).toBe("legeerklæring.pdf");
    attachmentId = uploaded.body.id;
    const stored = await pool.query(
      "SELECT filename, vendor_id FROM tidum_leave_attachments WHERE id = $1",
      [attachmentId],
    );
    attachmentStorageName = stored.rows[0].filename;
    expect(attachmentStorageName).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(stored.rows[0].vendor_id).toBe(vendorAId);

    expect((await request(memberB).get(`/api/leave/attachments/${attachmentId}/download`)).status).toBe(404);
    const download = await request(memberA).get(`/api/leave/attachments/${attachmentId}/download`);
    expect(download.status).toBe(200);
    expect(download.headers["content-disposition"]).toContain("attachment;");
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
    expect(download.headers["cache-control"]).toContain("no-store");
    expect(download.body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("fails closed on malware and never creates metadata for rejected bytes", async () => {
    const app = appFor({ id: memberAId, role: "member", vendorId: vendorAId });
    const before = await pool.query(
      "SELECT COUNT(*)::int AS count FROM tidum_leave_attachments WHERE leave_request_id = $1",
      [requestAId],
    );
    scanMock.mockResolvedValueOnce({ status: "infected", engine: "clamav", signature: "Eicar-Test-Signature" });
    const pdf = Buffer.from("%PDF-1.4\ntrailer\n<<>>\n%%EOF\n");
    const response = await request(app)
      .post(`/api/leave/${requestAId}/attachments`)
      .attach("file", pdf, { filename: "infected.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(422);
    const after = await pool.query(
      "SELECT COUNT(*)::int AS count FROM tidum_leave_attachments WHERE leave_request_id = $1",
      [requestAId],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});
