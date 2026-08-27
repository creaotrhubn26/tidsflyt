import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withKommuneRlsContext, withSystemRlsContext } from "../database-rls-context";

describe("barnevern municipality RLS migration 083", () => {
  const nonce = randomUUID();
  const userA = `rls-user-a-${nonce}`;
  const userB = `rls-user-b-${nonce}`;
  let kommuneA = 0;
  let kommuneB = 0;
  let meldingA = "";
  let meldingB = "";

  async function countWithoutContext(): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      const { rows: [row] } = await client.query(
        `SELECT count(*) FROM tidum_barnevern_meldinger WHERE id = ANY($1::uuid[])`,
        [[meldingA, meldingB]],
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
    const migration = readFileSync("migrations/083_barnevern_municipality_rls.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration);

    const kommuner = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer)
       VALUES ($1, $2, '9101'), ($3, $4, '9102')
       RETURNING id, kommunenummer`,
      [
        `RLS kommune A ${nonce}`,
        String(800000000 + Math.floor(Math.random() * 90_000_000)),
        `RLS kommune B ${nonce}`,
        String(800000000 + Math.floor(Math.random() * 90_000_000)),
      ],
    );
    kommuneA = Number(kommuner.rows.find((row) => row.kommunenummer === "9101").id);
    kommuneB = Number(kommuner.rows.find((row) => row.kommunenummer === "9102").id);

    await pool.query(
      `INSERT INTO users (id, username, password, email, role, kommune_id)
       VALUES ($1, $2, 'x', $3, 'kommune_saksbehandler', $4),
              ($5, $6, 'x', $7, 'kommune_saksbehandler', $8)`,
      [
        userA,
        userA,
        `${userA}@example.no`,
        kommuneA,
        userB,
        userB,
        `${userB}@example.no`,
        kommuneB,
      ],
    );

    await withSystemRlsContext("rls_test_fixture", async (client) => {
      const messages = await client.query(
        `INSERT INTO tidum_barnevern_meldinger
           (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, beskrivelse, avklaringsfrist)
         VALUES ($1, $2, 'manuell', NOW(), 'annet', 'RLS A', NOW() + INTERVAL '7 days'),
                ($3, $4, 'manuell', NOW(), 'annet', 'RLS B', NOW() + INTERVAL '7 days')
         RETURNING id, kommune_id`,
        [kommuneA, `BVM-RLS-A-${nonce}`, kommuneB, `BVM-RLS-B-${nonce}`],
      );
      meldingA = String(messages.rows.find((row) => Number(row.kommune_id) === kommuneA).id);
      meldingB = String(messages.rows.find((row) => Number(row.kommune_id) === kommuneB).id);
      await client.query(
        `INSERT INTO tidum_barnevern_melding_vedlegg
           (melding_id, kommune_id, filename, original_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1, $2, 'rls-a.pdf', 'rls-a.pdf', 'application/pdf', 1, $3),
                ($4, $5, 'rls-b.pdf', 'rls-b.pdf', 'application/pdf', 1, $6)`,
        [meldingA, kommuneA, userA, meldingB, kommuneB, userB],
      );
      await client.query(
        `INSERT INTO tidum_fiks_raw_intake_log (kommune_id, raw_payload_encrypted)
         VALUES ($1, 'rls-fixture-a'), ($2, 'rls-fixture-b')`,
        [kommuneA, kommuneB],
      );
    });
  }, 60_000);

  afterAll(async () => {
    await withSystemRlsContext("rls_test_cleanup", async (client) => {
      await client.query(
        `DELETE FROM tidum_fiks_raw_intake_log WHERE kommune_id = ANY($1::int[])`,
        [[kommuneA, kommuneB]],
      );
      await client.query(
        `DELETE FROM tidum_barnevern_meldinger WHERE kommune_id = ANY($1::int[])`,
        [[kommuneA, kommuneB]],
      );
    });
    await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [[userA, userB]]);
    await pool.query(
      `DELETE FROM tidum_kommuner WHERE id = ANY($1::int[])`,
      [[kommuneA, kommuneB]],
    );
  });

  it("enables and forces RLS on all phase-1 tables", async () => {
    const { rows } = await pool.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              EXISTS (
                SELECT 1 FROM pg_policy p
                 WHERE p.polrelid = c.oid AND p.polname = 'tidum_kommune_isolation'
              ) AS has_policy
         FROM pg_class c
        WHERE c.relname = ANY($1::text[])
        ORDER BY c.relname`,
      [[
        "tidum_barnevern_meldinger",
        "tidum_barnevern_melding_vedlegg",
        "tidum_fiks_raw_intake_log",
      ]],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity && row.has_policy)).toBe(true);
    const role = await pool.query(
      `SELECT rolcanlogin, rolsuper, rolbypassrls
         FROM pg_roles WHERE rolname = 'pg_database_owner'`,
    );
    expect(role.rows).toEqual([{ rolcanlogin: false, rolsuper: false, rolbypassrls: false }]);
    const migration = readFileSync("migrations/083_barnevern_municipality_rls.sql", "utf8");
    expect(migration).not.toMatch(/GRANT[\s\S]+ON ALL (TABLES|SEQUENCES|FUNCTIONS)/i);
    expect(migration).not.toContain("ALTER DEFAULT PRIVILEGES");
  });

  it("denies reads without context and resets context after commit", async () => {
    expect(await countWithoutContext()).toBe(0);

    const ownCount = await withKommuneRlsContext(kommuneA, async (client) => Number((await client.query(
      `SELECT count(*) FROM tidum_barnevern_meldinger WHERE id = ANY($1::uuid[])`,
      [[meldingA, meldingB]],
    )).rows[0].count));
    expect(ownCount).toBe(1);

    expect(await countWithoutContext()).toBe(0);
  });

  it("isolates messages, attachments and raw FIKS payloads by municipality", async () => {
    const visible = await withKommuneRlsContext(kommuneA, async (client) => {
      const messages = await client.query(
        `SELECT id FROM tidum_barnevern_meldinger WHERE id = ANY($1::uuid[])`,
        [[meldingA, meldingB]],
      );
      const attachments = await client.query(
        `SELECT kommune_id FROM tidum_barnevern_melding_vedlegg WHERE melding_id = ANY($1::uuid[])`,
        [[meldingA, meldingB]],
      );
      const raw = await client.query(
        `SELECT kommune_id FROM tidum_fiks_raw_intake_log WHERE kommune_id = ANY($1::int[])`,
        [[kommuneA, kommuneB]],
      );
      return { messages: messages.rows, attachments: attachments.rows, raw: raw.rows };
    });
    expect(visible.messages.map((row) => row.id)).toEqual([meldingA]);
    expect(visible.attachments.map((row) => Number(row.kommune_id))).toEqual([kommuneA]);
    expect(visible.raw.map((row) => Number(row.kommune_id))).toEqual([kommuneA]);
  });

  it("blocks cross-municipality updates and mismatched attachment bindings", async () => {
    const changed = await withKommuneRlsContext(kommuneA, async (client) => client.query(
      `UPDATE tidum_barnevern_meldinger SET beskrivelse = 'blocked' WHERE id = $1`,
      [meldingB],
    ));
    expect(changed.rowCount).toBe(0);

    await expect(withSystemRlsContext("rls_test_fk", async (client) => client.query(
      `INSERT INTO tidum_barnevern_melding_vedlegg
         (melding_id, kommune_id, filename, original_name, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, 'mismatch.pdf', 'mismatch.pdf', 'application/pdf', 1, $3)`,
      [meldingA, kommuneB, userB],
    ))).rejects.toThrow(/melding_kommune_fkey/);
  });
});
