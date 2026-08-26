import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { pool } from "../../db";
import { registerInvoiceRoutes } from "../../routes/invoice-routes";

process.env.ALLOW_DEV_AUTH_BYPASS = "false";

type TestIdentity = { id: string; role: string; vendorId: number };

describe("invoice object authorization", () => {
  const nonce = `${Date.now()}_${Math.floor(Math.random() * 100_000)}`;
  const ownerA: TestIdentity = { id: `invoice-owner-a-${nonce}`, role: "user", vendorId: 930_001 };
  const ownerB: TestIdentity = { id: `invoice-owner-b-${nonce}`, role: "user", vendorId: 940_001 };
  let invoiceAId = "";
  let invoiceBId = "";
  let invoiceBItemId = 0;
  let appA: express.Express;

  function appFor(identity: TestIdentity) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = identity;
      req.isAuthenticated = () => true;
      next();
    });
    registerInvoiceRoutes(app);
    return app;
  }

  beforeAll(async () => {
    const invoiceRows = await pool.query(
      `INSERT INTO tidum_invoices
         (vendor_id, user_id, invoice_number, client_name, invoice_date, due_date,
          period_start, period_end, subtotal, tax_rate, tax_amount, total_amount)
       VALUES
         ($1, $2, $3, 'Tenant A customer', '2026-08-26', '2026-09-09',
          '2026-08-01', '2026-08-31', 100, 25, 25, 125),
         ($4, $5, $6, 'Tenant B customer', '2026-08-26', '2026-09-09',
          '2026-08-01', '2026-08-31', 200, 25, 50, 250)
       RETURNING id, user_id`,
      [
        ownerA.vendorId,
        ownerA.id,
        `INV-A-${nonce}`,
        ownerB.vendorId,
        ownerB.id,
        `INV-B-${nonce}`,
      ],
    );
    invoiceAId = invoiceRows.rows.find((row) => row.user_id === ownerA.id).id;
    invoiceBId = invoiceRows.rows.find((row) => row.user_id === ownerB.id).id;

    const item = await pool.query(
      `INSERT INTO tidum_invoice_items
         (invoice_id, description, quantity, unit_price, amount)
       VALUES ($1, $2, 2, 100, 200)
       RETURNING id`,
      [invoiceBId, `foreign-item-${nonce}`],
    );
    invoiceBItemId = item.rows[0].id;

    await pool.query(
      `INSERT INTO tidum_log_row
         (vendor_id, user_id, date, start_time, end_time, break_hours, activity, project)
       VALUES
         ($1, $2, '2026-08-15', '08:00', '10:00', 0.5, 'Arbeid', $3),
         ($4, $5, '2026-08-15', '08:00', '16:00', 0, 'Arbeid', $6)`,
      [
        ownerA.vendorId,
        ownerA.id,
        `tenant-a-project-${nonce}`,
        ownerB.vendorId,
        ownerB.id,
        `tenant-b-project-${nonce}`,
      ],
    );

    appA = appFor(ownerA);
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM tidum_invoices WHERE user_id = ANY($1::text[])`,
      [[ownerA.id, ownerB.id]],
    );
    await pool.query(
      `DELETE FROM tidum_log_row WHERE user_id = ANY($1::text[])`,
      [[ownerA.id, ownerB.id]],
    );
  });

  it("lists only the authenticated owner even when a foreign userId is supplied", async () => {
    const response = await request(appA).get(`/api/invoices?userId=${encodeURIComponent(ownerB.id)}`);

    expect(response.status).toBe(200);
    expect(response.body.map((row: any) => row.id)).toContain(invoiceAId);
    expect(response.body.map((row: any) => row.id)).not.toContain(invoiceBId);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("does not read, update, delete, or render another tenant's invoice by ID", async () => {
    expect((await request(appA).get(`/api/invoices/${invoiceBId}`)).status).toBe(404);
    expect((await request(appA).patch(`/api/invoices/${invoiceBId}`).send({ status: "paid" })).status).toBe(404);
    expect((await request(appA).delete(`/api/invoices/${invoiceBId}`)).status).toBe(404);
    expect((await request(appA).get(`/api/invoices/${invoiceBId}/pdf`)).status).toBe(404);

    const foreign = await pool.query(
      `SELECT status FROM tidum_invoices WHERE id = $1`,
      [invoiceBId],
    );
    const foreignItem = await pool.query(
      `SELECT description FROM tidum_invoice_items WHERE id = $1`,
      [invoiceBItemId],
    );
    expect(foreign.rows[0].status).toBe("draft");
    expect(foreignItem.rows[0].description).toBe(`foreign-item-${nonce}`);
  });

  it("rejects ownership reassignment and generating for another user", async () => {
    const ownershipUpdate = await request(appA)
      .patch(`/api/invoices/${invoiceAId}`)
      .send({ userId: ownerB.id, vendorId: ownerB.vendorId });
    expect(ownershipUpdate.status).toBe(403);

    const before = await pool.query(
      `SELECT COUNT(*)::int AS count FROM tidum_invoices WHERE user_id = $1`,
      [ownerA.id],
    );
    const foreignGenerate = await request(appA).post("/api/invoices/generate").send({
      userId: ownerB.id,
      clientName: "Attacker customer",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    const after = await pool.query(
      `SELECT COUNT(*)::int AS count FROM tidum_invoices WHERE user_id = $1`,
      [ownerA.id],
    );

    expect(foreignGenerate.status).toBe(403);
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("generates, renders, and cascade-deletes an invoice using only the actor's time rows", async () => {
    const generated = await request(appA).post("/api/invoices/generate").send({
      clientName: "Halden kommune",
      clientOrg: "959159092",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      hourlyRate: 1000,
      taxRate: 25,
    });

    expect(generated.status).toBe(201);
    expect(generated.body.vendorId).toBe(ownerA.vendorId);
    expect(generated.body.userId).toBe(ownerA.id);
    expect(generated.body.clientOrgNumber).toBe("959159092");
    expect(generated.body.subtotal).toBe("1500.00");
    expect(generated.body.taxAmount).toBe("375.00");
    expect(generated.body.totalAmount).toBe("1875.00");
    expect(generated.body.lineItems).toHaveLength(1);
    expect(generated.body.lineItems[0]).toMatchObject({
      description: `tenant-a-project-${nonce}`,
      quantity: "1.50",
      amount: "1500.00",
    });

    const generatedId = generated.body.id as string;
    const itemId = generated.body.lineItems[0].id as number;
    const pdf = await request(appA).get(`/api/invoices/${generatedId}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect(pdf.body.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    expect((await request(appA).delete(`/api/invoices/${generatedId}`)).status).toBe(200);
    const deletedItem = await pool.query(
      `SELECT COUNT(*)::int AS count FROM tidum_invoice_items WHERE id = $1`,
      [itemId],
    );
    expect(deletedItem.rows[0].count).toBe(0);
  });
});
