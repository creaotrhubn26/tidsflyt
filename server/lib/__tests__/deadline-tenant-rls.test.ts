import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import {
  withKommuneRlsContext,
  withSystemRlsContext,
  withVendorRlsContext,
} from "../database-rls-context";

describe("deadline tenant RLS migration 086", { timeout: 60_000 }, () => {
  const nonce = randomUUID();
  const kommuneUserA = `frist-rls-kommune-a-${nonce}`;
  const kommuneUserB = `frist-rls-kommune-b-${nonce}`;
  const vendorUserA = `frist-rls-vendor-a-${nonce}`;
  const vendorUserB = `frist-rls-vendor-b-${nonce}`;
  const deadlineIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  let kommuneA = 0;
  let kommuneB = 0;
  let vendorA = 0;
  let vendorB = 0;

  async function countWithoutContext(): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      const { rows: [row] } = await client.query(
        `SELECT count(*)::int AS count FROM tidum_frister WHERE id = ANY($1::uuid[])`,
        [deadlineIds],
      );
      await client.query("COMMIT");
      return Number(row.count);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    const migration = readFileSync("migrations/086_deadline_tenant_rls.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration);

    const municipalityNumber = 100_000 + Math.floor(Math.random() * 700_000);
    const kommuner = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer)
       VALUES ($1, $2, $3), ($4, $5, $6)
       RETURNING id, kommunenummer`,
      [
        `Frist RLS kommune A ${nonce}`,
        String(700_000_000 + Math.floor(Math.random() * 90_000_000)),
        String(municipalityNumber),
        `Frist RLS kommune B ${nonce}`,
        String(800_000_000 + Math.floor(Math.random() * 90_000_000)),
        String(municipalityNumber + 1),
      ],
    );
    kommuneA = Number(kommuner.rows.find((row) => row.kommunenummer === String(municipalityNumber)).id);
    kommuneB = Number(kommuner.rows.find((row) => row.kommunenummer === String(municipalityNumber + 1)).id);

    const vendors = await pool.query(
      `INSERT INTO tidum_vendors (name, slug)
       VALUES ($1, $2), ($3, $4)
       RETURNING id, slug`,
      [
        `Frist RLS vendor A ${nonce}`,
        `frist-rls-a-${nonce}`,
        `Frist RLS vendor B ${nonce}`,
        `frist-rls-b-${nonce}`,
      ],
    );
    vendorA = Number(vendors.rows.find((row) => row.slug === `frist-rls-a-${nonce}`).id);
    vendorB = Number(vendors.rows.find((row) => row.slug === `frist-rls-b-${nonce}`).id);

    await pool.query(
      `INSERT INTO users (id, username, password, role, kommune_id, vendor_id)
       VALUES
         ($1::varchar, $1::text, 'x', 'kommune_saksbehandler', $5, NULL),
         ($2::varchar, $2::text, 'x', 'kommune_saksbehandler', $6, NULL),
         ($3::varchar, $3::text, 'x', 'member', NULL, $7),
         ($4::varchar, $4::text, 'x', 'member', NULL, $8)`,
      [kommuneUserA, kommuneUserB, vendorUserA, vendorUserB, kommuneA, kommuneB, vendorA, vendorB],
    );

    await withSystemRlsContext("frist_rls_fixture", (client) => client.query(
      `INSERT INTO tidum_frister
         (id, entity_type, entity_id, kommune_id, vendor_id, frist_type, due_at, notify_user_id)
       VALUES
         ($1, 'rls_deadline_test', $13, $5, NULL, 'avklaring', NOW(), $9),
         ($2, 'rls_deadline_test', $14, $6, NULL, 'avklaring', NOW(), $10),
         ($3, 'rls_deadline_test', $15, NULL, $7, 'avklaring', NOW(), $11),
         ($4, 'rls_deadline_test', $16, NULL, $8, 'avklaring', NOW(), $12)`,
      [
        ...deadlineIds,
        kommuneA,
        kommuneB,
        vendorA,
        vendorB,
        kommuneUserA,
        kommuneUserB,
        vendorUserA,
        vendorUserB,
        `kommune-a-${nonce}`,
        `kommune-b-${nonce}`,
        `vendor-a-${nonce}`,
        `vendor-b-${nonce}`,
      ],
    ));
  });

  afterAll(async () => {
    await withSystemRlsContext("frist_rls_cleanup", (client) => client.query(
      `DELETE FROM tidum_frister WHERE id = ANY($1::uuid[])`,
      [deadlineIds],
    ));
    await pool.query(
      `DELETE FROM users WHERE id = ANY($1::varchar[])`,
      [[kommuneUserA, kommuneUserB, vendorUserA, vendorUserB]],
    );
    await pool.query(`DELETE FROM tidum_vendors WHERE id = ANY($1::int[])`, [[vendorA, vendorB]]);
    await pool.query(`DELETE FROM tidum_kommuner WHERE id = ANY($1::int[])`, [[kommuneA, kommuneB]]);
  });

  it("enables and forces the deadline tenant policy", async () => {
    const { rows: [row] } = await pool.query(
      `SELECT c.relrowsecurity, c.relforcerowsecurity,
              EXISTS (
                SELECT 1 FROM pg_policy policy
                 WHERE policy.polrelid = c.oid
                   AND policy.polname = 'tidum_frist_tenant_isolation'
              ) AS has_policy
         FROM pg_class c WHERE c.relname = 'tidum_frister'`,
    );
    expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true, has_policy: true });

    const { rows: constraints } = await pool.query(
      `SELECT conname, convalidated FROM pg_constraint
        WHERE conname = ANY($1::text[])
        ORDER BY conname`,
      [[
        "tidum_frister_exactly_one_tenant_check",
        "tidum_frister_notify_user_kommune_fkey",
        "tidum_frister_notify_user_vendor_fkey",
        "users_single_tenant_type_check",
      ]],
    );
    expect(constraints).toHaveLength(4);
    expect(constraints.every((constraint) => constraint.convalidated)).toBe(true);

    const migration = readFileSync("migrations/086_deadline_tenant_rls.sql", "utf8");
    expect(migration).not.toMatch(/GRANT[\s\S]+ON ALL (TABLES|SEQUENCES|FUNCTIONS)/i);
    expect(migration).not.toContain("ALTER DEFAULT PRIVILEGES");
  });

  it("denies reads without a context and resets after commit", async () => {
    expect(await countWithoutContext()).toBe(0);
    const visible = await withKommuneRlsContext(kommuneA, async (client) => Number((await client.query(
      `SELECT count(*)::int AS count FROM tidum_frister WHERE id = ANY($1::uuid[])`,
      [deadlineIds],
    )).rows[0].count));
    expect(visible).toBe(1);
    expect(await countWithoutContext()).toBe(0);
  });

  it("isolates both municipality and vendor deadlines", async () => {
    const municipalityRows = await withKommuneRlsContext(kommuneA, (client) => client.query(
      `SELECT id FROM tidum_frister WHERE id = ANY($1::uuid[])`,
      [deadlineIds],
    ));
    expect(municipalityRows.rows.map((row) => row.id)).toEqual([deadlineIds[0]]);

    const vendorRows = await withVendorRlsContext(vendorA, (client) => client.query(
      `SELECT id FROM tidum_frister WHERE id = ANY($1::uuid[])`,
      [deadlineIds],
    ));
    expect(vendorRows.rows.map((row) => row.id)).toEqual([deadlineIds[2]]);

    const crossUpdate = await withKommuneRlsContext(kommuneA, (client) => client.query(
      `UPDATE tidum_frister SET status = 'kansellert' WHERE id = $1`,
      [deadlineIds[1]],
    ));
    expect(crossUpdate.rowCount).toBe(0);
  });

  it("rejects a recipient from another tenant and ambiguous user ownership", async () => {
    await expect(withKommuneRlsContext(kommuneA, (client) => client.query(
      `INSERT INTO tidum_frister
         (entity_type, entity_id, kommune_id, frist_type, due_at, notify_user_id)
       VALUES ('rls_deadline_test', $1, $2, 'avklaring', NOW(), $3)`,
      [`recipient-mismatch-${nonce}`, kommuneA, kommuneUserB],
    ))).rejects.toThrow(/tidum_frister_notify_user_kommune_fkey/);

    await expect(pool.query(
      `UPDATE users SET vendor_id = $1 WHERE id = $2`,
      [vendorA, kommuneUserA],
    )).rejects.toThrow(/users_single_tenant_type_check/);
  });

  it("rejects deadlines with zero or two tenant owners", async () => {
    await expect(withSystemRlsContext("frist_rls_shape", (client) => client.query(
      `INSERT INTO tidum_frister
         (entity_type, entity_id, kommune_id, vendor_id, frist_type, due_at)
       VALUES ('rls_deadline_test', $1, NULL, NULL, 'avklaring', NOW())`,
      [`ownerless-${nonce}`],
    ))).rejects.toThrow(/tidum_frister_exactly_one_tenant_check/);

    await expect(withSystemRlsContext("frist_rls_shape", (client) => client.query(
      `INSERT INTO tidum_frister
         (entity_type, entity_id, kommune_id, vendor_id, frist_type, due_at)
       VALUES ('rls_deadline_test', $1, $2, $3, 'avklaring', NOW())`,
      [`double-owner-${nonce}`, kommuneA, vendorA],
    ))).rejects.toThrow(/tidum_frister_exactly_one_tenant_check/);
  });

  it("allows a named system scan across both tenant types", async () => {
    const visible = await withSystemRlsContext("frist_rls_verify", async (client) => Number((await client.query(
      `SELECT count(*)::int AS count FROM tidum_frister WHERE id = ANY($1::uuid[])`,
      [deadlineIds],
    )).rows[0].count));
    expect(visible).toBe(4);
  });
});
