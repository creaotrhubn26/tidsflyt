import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { pool } from "../../db";
import { registerSmartTimingRoutes } from "../../smartTimingRoutes";

process.env.ALLOW_DEV_AUTH_BYPASS = "false";

type TestIdentity = { id: string; role: string; vendorId: number };

describe("case-report object authorization", () => {
  const nonce = `${Date.now()}_${Math.floor(Math.random() * 100_000)}`;
  const ownerA: TestIdentity = { id: `case-owner-a-${nonce}`, role: "miljoarbeider", vendorId: 910_001 };
  const ownerB: TestIdentity = { id: `case-owner-b-${nonce}`, role: "miljoarbeider", vendorId: 920_001 };
  const managerA: TestIdentity = { id: `case-manager-a-${nonce}`, role: "teamleder", vendorId: ownerA.vendorId };
  const ordinaryA: TestIdentity = { id: `case-user-a-${nonce}`, role: "user", vendorId: ownerA.vendorId };
  let reportAId = 0;
  let reportBId = 0;
  let foreignCommentId = 0;
  let templateGlobalId = 0;
  let templateAId = 0;
  let templateBId = 0;
  let assetAId = 0;
  let assetBId = 0;
  let appA: express.Express;
  let managerApp: express.Express;
  let ordinaryApp: express.Express;

  function appFor(identity: TestIdentity) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = identity;
      req.isAuthenticated = () => true;
      next();
    });
    registerSmartTimingRoutes(app);
    return app;
  }

  beforeAll(async () => {
    const reportA = await pool.query(
      `INSERT INTO tidum_case_reports
         (vendor_id, user_id, case_id, month, background, status)
       VALUES ($1, $2, $3, '2026-08', 'tenant-a-marker', 'draft')
       RETURNING id`,
      [ownerA.vendorId, ownerA.id, `case-a-${nonce}`],
    );
    reportAId = reportA.rows[0].id;

    const reportB = await pool.query(
      `INSERT INTO tidum_case_reports
         (vendor_id, user_id, case_id, month, background, status)
       VALUES ($1, $2, $3, '2026-08', 'tenant-b-marker', 'draft')
       RETURNING id`,
      [ownerB.vendorId, ownerB.id, `case-b-${nonce}`],
    );
    reportBId = reportB.rows[0].id;

    const comments = await pool.query(
      `INSERT INTO tidum_report_comments
         (report_id, author_id, author_role, content, is_internal)
       VALUES
         ($1, 'reviewer', 'admin', 'public-a-marker', false),
         ($1, 'reviewer', 'admin', 'internal-a-marker', true),
         ($2, 'reviewer', 'admin', 'foreign-b-marker', false)
       RETURNING id, content`,
      [reportAId, reportBId],
    );
    foreignCommentId = comments.rows.find((row) => row.content === "foreign-b-marker").id;

    const templateRows = await pool.query(
      `INSERT INTO tidum_report_templates (name, company_id, is_active)
       VALUES
         ($1, NULL, true),
         ($2, $4, true),
         ($3, $5, true)
       RETURNING id, name`,
      [
        `global-template-${nonce}`,
        `tenant-a-template-${nonce}`,
        `tenant-b-template-${nonce}`,
        ownerA.vendorId,
        ownerB.vendorId,
      ],
    );
    templateGlobalId = templateRows.rows.find((row) => row.name === `global-template-${nonce}`).id;
    templateAId = templateRows.rows.find((row) => row.name === `tenant-a-template-${nonce}`).id;
    templateBId = templateRows.rows.find((row) => row.name === `tenant-b-template-${nonce}`).id;

    const assetRows = await pool.query(
      `INSERT INTO tidum_report_assets (company_id, name, type, url, is_active)
       VALUES ($1, $2, 'logo', $3, true), ($4, $5, 'logo', $6, true)
       RETURNING id, name`,
      [
        ownerA.vendorId,
        `tenant-a-asset-${nonce}`,
        `/test/a-${nonce}.png`,
        ownerB.vendorId,
        `tenant-b-asset-${nonce}`,
        `/test/b-${nonce}.png`,
      ],
    );
    assetAId = assetRows.rows.find((row) => row.name === `tenant-a-asset-${nonce}`).id;
    assetBId = assetRows.rows.find((row) => row.name === `tenant-b-asset-${nonce}`).id;

    await pool.query(
      `INSERT INTO tidum_report_generated (case_report_id, template_id, generated_by)
       VALUES ($1, $2, 'manager-a'), ($3, $4, 'manager-b')`,
      [reportAId, templateAId, reportBId, templateBId],
    );

    appA = appFor(ownerA);
    managerApp = appFor(managerA);
    ordinaryApp = appFor(ordinaryA);
  });

  afterAll(async () => {
    if (reportAId || reportBId) {
      await pool.query(`DELETE FROM tidum_report_generated WHERE case_report_id = ANY($1::int[])`, [[reportAId, reportBId]]);
      await pool.query(`DELETE FROM tidum_report_comments WHERE report_id = ANY($1::int[])`, [[reportAId, reportBId]]);
      await pool.query(`DELETE FROM tidum_case_reports WHERE id = ANY($1::int[])`, [[reportAId, reportBId]]);
    }
    await pool.query(`DELETE FROM tidum_report_assets WHERE name LIKE $1`, [`%${nonce}`]);
    await pool.query(`DELETE FROM tidum_report_templates WHERE name LIKE $1`, [`%${nonce}`]);
  });

  it("ignores caller-controlled user_id and lists only the authenticated owner's tenant rows", async () => {
    const response = await request(appA).get(`/api/case-reports?user_id=${encodeURIComponent(ownerB.id)}`);
    expect(response.status).toBe(200);
    expect(response.body.reports.map((row: any) => row.id)).toContain(reportAId);
    expect(response.body.reports.map((row: any) => row.id)).not.toContain(reportBId);
  });

  it("does not read, update, delete, or submit another tenant's report by ID", async () => {
    expect((await request(appA).get(`/api/case-reports/${reportBId}`)).status).toBe(404);
    expect((await request(appA).put(`/api/case-reports/${reportBId}`).send({ background: "overwritten" })).status).toBe(404);
    expect((await request(appA).delete(`/api/case-reports/${reportBId}`)).status).toBe(404);
    expect((await request(appA).post(`/api/case-reports/${reportBId}/submit`).send({})).status).toBe(404);

    const unchanged = await pool.query(`SELECT background, status FROM tidum_case_reports WHERE id = $1`, [reportBId]);
    expect(unchanged.rows[0]).toEqual({ background: "tenant-b-marker", status: "draft" });
  });

  it("does not expose or add comments on another tenant's report", async () => {
    expect((await request(appA).get(`/api/case-reports/${reportBId}/comments?include_internal=true`)).status).toBe(404);
    expect((await request(appA).post(`/api/case-reports/${reportBId}/comments`).send({
      content: "attacker-comment",
      author_role: "admin",
      is_internal: true,
    })).status).toBe(404);
    expect((await request(appA).post(`/api/case-reports/${reportAId}/comments`).send({
      content: "cross-report-parent",
      parent_id: foreignCommentId,
    })).status).toBe(400);

    const inserted = await pool.query(
      `SELECT COUNT(*)::int AS count FROM tidum_report_comments
       WHERE content IN ('attacker-comment', 'cross-report-parent')`,
    );
    expect(inserted.rows[0].count).toBe(0);
  });

  it("never exposes internal comments to the report owner through a query flag", async () => {
    const response = await request(appA).get(`/api/case-reports/${reportAId}/comments?include_internal=true`);
    expect(response.status).toBe(200);
    expect(response.body.map((row: any) => row.content)).toContain("public-a-marker");
    expect(response.body.map((row: any) => row.content)).not.toContain("internal-a-marker");
  });

  it("ignores status escalation in the ordinary edit endpoint", async () => {
    const response = await request(appA)
      .put(`/api/case-reports/${reportAId}`)
      .send({ background: "owner-edit", status: "approved", approved_by: "attacker" });
    expect(response.status).toBe(200);

    const row = await pool.query(`SELECT background, status, approved_by FROM tidum_case_reports WHERE id = $1`, [reportAId]);
    expect(row.rows[0]).toEqual({ background: "owner-edit", status: "draft", approved_by: null });
  });

  it("requires a real admin role and scopes tenant admins to their own vendor", async () => {
    expect((await request(ordinaryApp).get("/api/admin/case-reports")).status).toBe(403);

    const list = await request(managerApp).get("/api/admin/case-reports");
    expect(list.status).toBe(200);
    expect(list.body.reports.map((row: any) => row.id)).toContain(reportAId);
    expect(list.body.reports.map((row: any) => row.id)).not.toContain(reportBId);

    const approveForeign = await request(managerApp).post(`/api/admin/case-reports/${reportBId}/approve`).send({});
    expect(approveForeign.status).toBe(404);
    const foreign = await pool.query(`SELECT status FROM tidum_case_reports WHERE id = $1`, [reportBId]);
    expect(foreign.rows[0].status).toBe("draft");
  });

  it("tenant-scopes report templates, assets, PDF generation, and generation history", async () => {
    expect((await request(ordinaryApp).get("/api/report-templates")).status).toBe(403);

    const templates = await request(managerApp).get("/api/report-templates");
    expect(templates.status).toBe(200);
    expect(templates.body.map((row: any) => row.id)).toEqual(expect.arrayContaining([templateGlobalId, templateAId]));
    expect(templates.body.map((row: any) => row.id)).not.toContain(templateBId);
    expect((await request(managerApp).get(`/api/report-templates/${templateBId}`)).status).toBe(404);

    const created = await request(managerApp).post("/api/report-templates").send({
      name: `route-created-template-${nonce}`,
      company_id: ownerB.vendorId,
    });
    expect(created.status).toBe(200);
    expect(created.body.company_id).toBe(ownerA.vendorId);

    expect((await request(managerApp).put(`/api/report-templates/${templateBId}`).send({ name: "tampered" })).status).toBe(404);
    expect((await request(managerApp).delete(`/api/report-templates/${templateBId}`)).status).toBe(404);

    const assets = await request(managerApp).get("/api/report-assets");
    expect(assets.status).toBe(200);
    expect(assets.body.map((row: any) => row.id)).toContain(assetAId);
    expect(assets.body.map((row: any) => row.id)).not.toContain(assetBId);
    expect((await request(managerApp).delete(`/api/report-assets/${assetBId}`)).status).toBe(404);

    const generateForeign = await request(managerApp)
      .post(`/api/report-templates/${templateBId}/generate/${reportBId}`)
      .send({});
    expect(generateForeign.status).toBe(404);

    const history = await request(managerApp).get("/api/report-generated");
    expect(history.status).toBe(200);
    expect(history.body.map((row: any) => row.case_report_id)).toContain(reportAId);
    expect(history.body.map((row: any) => row.case_report_id)).not.toContain(reportBId);
  });
});
