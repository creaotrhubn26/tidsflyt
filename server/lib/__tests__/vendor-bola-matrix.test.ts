/**
 * BOLA-matrise for vendor-flaten (systematisk objekttilgangstest):
 * en aktør i vendor B kaller id-baserte endepunkter på objekter som
 * tilhører vendor A. Kravet er fail-closed: ALDRI 2xx (lekkasje) og
 * ALDRI 5xx (autorisasjonsfeil skal være kontrollerte 403/404).
 *
 * Matrisen er datadrevet — nye objektflater legges til i ENDEPUNKTER.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";

const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe("Vendor BOLA-matrise", { timeout: 30000 }, () => {
  let vendorA: number;
  let vendorB: number;
  const brukerA = `bola-a-${nonce}`;
  const brukerB = `bola-b-${nonce}`;
  let sakA: string;
  let rapportA: string;
  let invoiceA: string;
  let appB: express.Express;

  beforeAll(async () => {
    const { rows: vendors } = await pool.query(
      `INSERT INTO tidum_vendors (name, slug) VALUES
         ($1, $2), ($3, $4) RETURNING id`,
      [`BOLA A ${nonce}`, `bola-a-${nonce}`, `BOLA B ${nonce}`, `bola-b-${nonce}`],
    );
    vendorA = vendors[0].id;
    vendorB = vendors[1].id;

    await pool.query(
      `INSERT INTO users (id, username, password, email, vendor_id, role) VALUES
         ($1, $2, 'x', $3, $4, 'user'),
         ($5, $6, 'x', $7, $8, 'user')`,
      [brukerA, brukerA, `${brukerA}@example.com`, vendorA, brukerB, brukerB, `${brukerB}@example.com`, vendorB],
    );

    const { rows: [sak] } = await pool.query(
      `INSERT INTO tidum_saker (saksnummer, tittel, vendor_id, tiltaksleder_id)
       VALUES ($1, 'BOLA-testsak A', $2, $3) RETURNING id`,
      [`BOLA-${nonce}`, vendorA, brukerA],
    );
    sakA = sak.id;

    const { rows: [rapport] } = await pool.query(
      `INSERT INTO tidum_rapporter (sak_id, user_id, tiltaksleder_id)
       VALUES ($1, $2, $2) RETURNING id`,
      [sakA, brukerA],
    );
    rapportA = rapport.id;

    const { rows: [invoice] } = await pool.query(
      `INSERT INTO tidum_invoices
         (vendor_id, user_id, invoice_number, client_name, invoice_date, due_date,
          period_start, period_end, subtotal, tax_rate, tax_amount, total_amount)
       VALUES ($1, $2, $3, 'BOLA kunde', '2026-08-26', '2026-09-09',
               '2026-08-01', '2026-08-31', 100, 25, 25, 125)
       RETURNING id`,
      [vendorA, brukerA, `INV-BOLA-${nonce}`],
    );
    invoiceA = invoice.id;

    const { registerRoutes } = await import("../../routes");
    appB = express();
    appB.use(express.json());
    appB.use((req: any, _res, next) => {
      req.user = { id: brukerB, role: "user", vendorId: vendorB };
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), appB);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tidum_invoices WHERE id = $1`, [invoiceA]).catch(() => {});
    await pool.query(`DELETE FROM tidum_rapporter WHERE id = $1`, [rapportA]).catch(() => {});
    await pool.query(`DELETE FROM tidum_saker WHERE id = $1`, [sakA]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [[brukerA, brukerB]]).catch(() => {});
    await pool.query(`DELETE FROM tidum_vendors WHERE id = ANY($1::int[])`, [[vendorA, vendorB]]).catch(() => {});
  });

  it("fremmed vendor når aldri et annet vendors objekter (aldri 2xx, aldri 5xx)", async () => {
    const ENDEPUNKTER: { metode: "get" | "patch" | "post" | "delete"; sti: () => string; body?: any }[] = [
      // Saker
      { metode: "get", sti: () => `/api/saker/${sakA}/journal` },
      { metode: "post", sti: () => `/api/saker/${sakA}/journal`, body: { innhold: "BOLA-forsøk" } },
      // Rapporter
      { metode: "get", sti: () => `/api/rapporter/${rapportA}` },
      { metode: "patch", sti: () => `/api/rapporter/${rapportA}`, body: { tiltak: "BOLA" } },
      { metode: "get", sti: () => `/api/rapporter/${rapportA}/maal` },
      { metode: "post", sti: () => `/api/rapporter/${rapportA}/maal`, body: { tittel: "BOLA" } },
      { metode: "get", sti: () => `/api/rapporter/${rapportA}/aktiviteter` },
      { metode: "get", sti: () => `/api/rapporter/${rapportA}/audit` },
      { metode: "get", sti: () => `/api/rapporter/${rapportA}/kommentarer` },
      { metode: "post", sti: () => `/api/rapporter/${rapportA}/kommentarer`, body: { tekst: "BOLA" } },
      { metode: "get", sti: () => `/api/rapporter/${rapportA}/pdf` },
      { metode: "post", sti: () => `/api/rapporter/${rapportA}/send` },
      // Fakturaer
      { metode: "get", sti: () => `/api/invoices/${invoiceA}` },
      { metode: "get", sti: () => `/api/invoices/${invoiceA}/pdf` },
      { metode: "patch", sti: () => `/api/invoices/${invoiceA}`, body: { clientName: "BOLA" } },
      { metode: "delete", sti: () => `/api/invoices/${invoiceA}` },
    ];

    const brudd: string[] = [];
    for (const e of ENDEPUNKTER) {
      const res = await (request(appB) as any)[e.metode](e.sti()).send(e.body ?? undefined);
      const label = `${e.metode.toUpperCase()} ${e.sti()} -> ${res.status}`;
      if (res.status >= 200 && res.status < 300) brudd.push(`LEKKASJE: ${label}`);
      if (res.status >= 500) brudd.push(`UKONTROLLERT: ${label} ${JSON.stringify(res.body).slice(0, 120)}`);
    }
    expect(brudd, brudd.join("\n")).toEqual([]);

    // Objektene er urørt av skriveforsøkene.
    const { rows: [rapport] } = await pool.query(`SELECT tiltak FROM tidum_rapporter WHERE id = $1`, [rapportA]);
    expect(rapport.tiltak).not.toBe("BOLA");
    const { rows: [faktura] } = await pool.query(`SELECT id FROM tidum_invoices WHERE id = $1`, [invoiceA]);
    expect(faktura).toBeTruthy();
  });
});
