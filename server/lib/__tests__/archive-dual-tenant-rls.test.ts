import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import {
  withKommuneRlsContext,
  withSystemRlsContext,
  withVendorRlsContext,
} from "../database-rls-context";

const ARCHIVE_TABLES = ["archive_configs", "archive_case_links", "archive_entries"] as const;

describe("archive dual-tenant RLS migration 085", { timeout: 60_000 }, () => {
  const nonce = randomUUID();
  const vendorA = 7_000_000 + Math.floor(Math.random() * 100_000);
  const vendorB = vendorA + 100_001;
  const sakA = randomUUID();
  const sakB = randomUUID();
  const entryVendorA = randomUUID();
  const entryVendorB = randomUUID();
  const entryKommuneA = randomUUID();
  const entryKommuneB = randomUUID();
  let kommuneA = 0;
  let kommuneB = 0;
  let meldingA = "";
  let meldingB = "";

  async function countsWithoutContext(): Promise<Record<string, number>> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      const counts: Record<string, number> = {};
      for (const table of ARCHIVE_TABLES) {
        const { rows: [row] } = await client.query(
          `SELECT count(*)::int AS count FROM ${table}
            WHERE vendor_id = ANY($1::int[]) OR kommune_id = ANY($2::int[])`,
          [[vendorA, vendorB], [kommuneA, kommuneB]],
        );
        counts[table] = Number(row.count);
      }
      await client.query("COMMIT");
      return counts;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    const migration = readFileSync("migrations/085_archive_dual_tenant_rls.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration);

    const municipalityNumber = 100_000 + Math.floor(Math.random() * 700_000);
    const kommuner = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer)
       VALUES ($1, $2, $3), ($4, $5, $6)
       RETURNING id, kommunenummer`,
      [
        `Archive RLS kommune A ${nonce}`,
        String(700_000_000 + Math.floor(Math.random() * 90_000_000)),
        String(municipalityNumber),
        `Archive RLS kommune B ${nonce}`,
        String(800_000_000 + Math.floor(Math.random() * 90_000_000)),
        String(municipalityNumber + 1),
      ],
    );
    kommuneA = Number(kommuner.rows.find((row) => row.kommunenummer === String(municipalityNumber)).id);
    kommuneB = Number(kommuner.rows.find((row) => row.kommunenummer === String(municipalityNumber + 1)).id);

    await withSystemRlsContext("archive_rls_fixture", async (client) => {
      const messages = await client.query(
        `INSERT INTO tidum_barnevern_meldinger
           (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, beskrivelse, avklaringsfrist)
         VALUES ($1, $2, 'manuell', NOW(), 'annet', 'Arkiv RLS A', NOW() + INTERVAL '7 days'),
                ($3, $4, 'manuell', NOW(), 'annet', 'Arkiv RLS B', NOW() + INTERVAL '7 days')
         RETURNING id, kommune_id`,
        [kommuneA, `BVM-ARCHIVE-A-${nonce}`, kommuneB, `BVM-ARCHIVE-B-${nonce}`],
      );
      meldingA = String(messages.rows.find((row) => Number(row.kommune_id) === kommuneA).id);
      meldingB = String(messages.rows.find((row) => Number(row.kommune_id) === kommuneB).id);

      await client.query(
        `INSERT INTO archive_configs
           (vendor_id, kommune_id, provider, base_url, client_id, client_secret, status)
         VALUES
           ($1, NULL, 'documaster', 'https://vendor-a.invalid', 'a', 'secret-a', 'active'),
           ($2, NULL, 'documaster', 'https://vendor-b.invalid', 'b', 'secret-b', 'active'),
           (NULL, $3, 'documaster', 'https://kommune-a.invalid', 'c', 'secret-c', 'active'),
           (NULL, $4, 'documaster', 'https://kommune-b.invalid', 'd', 'secret-d', 'active')`,
        [vendorA, vendorB, kommuneA, kommuneB],
      );
      await client.query(
        `INSERT INTO archive_entries
           (id, vendor_id, kommune_id, entity_type, entity_id, status)
         VALUES
           ($1, $5, NULL, 'rls_test', $9, 'pending'),
           ($2, $6, NULL, 'rls_test', $10, 'pending'),
           ($3, NULL, $7, 'rls_test', $11, 'pending'),
           ($4, NULL, $8, 'rls_test', $12, 'pending')`,
        [
          entryVendorA,
          entryVendorB,
          entryKommuneA,
          entryKommuneB,
          vendorA,
          vendorB,
          kommuneA,
          kommuneB,
          `vendor-a-${nonce}`,
          `vendor-b-${nonce}`,
          `kommune-a-${nonce}`,
          `kommune-b-${nonce}`,
        ],
      );
      await client.query(
        `INSERT INTO archive_case_links
           (vendor_id, kommune_id, sak_id, barnevern_melding_id, ekstern_mappe_id)
         VALUES
           ($1, NULL, $3, NULL, 'vendor-a-map'),
           ($2, NULL, $4, NULL, 'vendor-b-map'),
           (NULL, $5, NULL, $7, 'kommune-a-map'),
           (NULL, $6, NULL, $8, 'kommune-b-map')`,
        [vendorA, vendorB, sakA, sakB, kommuneA, kommuneB, meldingA, meldingB],
      );
    });
  });

  afterAll(async () => {
    await withSystemRlsContext("archive_rls_cleanup", async (client) => {
      await client.query(
        `DELETE FROM archive_entries WHERE id = ANY($1::uuid[])`,
        [[entryVendorA, entryVendorB, entryKommuneA, entryKommuneB]],
      );
      await client.query(
        `DELETE FROM archive_case_links
          WHERE vendor_id = ANY($1::int[]) OR kommune_id = ANY($2::int[])`,
        [[vendorA, vendorB], [kommuneA, kommuneB]],
      );
      await client.query(
        `DELETE FROM archive_configs
          WHERE vendor_id = ANY($1::int[]) OR kommune_id = ANY($2::int[])`,
        [[vendorA, vendorB], [kommuneA, kommuneB]],
      );
      const meldingIds = [meldingA, meldingB].filter(Boolean);
      if (meldingIds.length > 0) {
        await client.query(
          `DELETE FROM tidum_barnevern_meldinger WHERE id = ANY($1::uuid[])`,
          [meldingIds],
        );
      }
    });
    await pool.query(
      `DELETE FROM tidum_kommuner WHERE id = ANY($1::int[])`,
      [[kommuneA, kommuneB]],
    );
  });

  it("enables and forces one dual-tenant policy on every archive table", async () => {
    const { rows } = await pool.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              EXISTS (
                SELECT 1 FROM pg_policy policy
                 WHERE policy.polrelid = c.oid
                   AND policy.polname = 'tidum_archive_tenant_isolation'
              ) AS has_policy
         FROM pg_class c
        WHERE c.relname = ANY($1::text[])
        ORDER BY c.relname`,
      [[...ARCHIVE_TABLES]],
    );
    expect(rows).toHaveLength(ARCHIVE_TABLES.length);
    expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity && row.has_policy)).toBe(true);
    const migration = readFileSync("migrations/085_archive_dual_tenant_rls.sql", "utf8");
    expect(migration).not.toMatch(/GRANT[\s\S]+ON ALL (TABLES|SEQUENCES|FUNCTIONS)/i);
    expect(migration).not.toContain("ALTER DEFAULT PRIVILEGES");
  });

  it("denies all archive rows without an explicit transaction context", async () => {
    expect(await countsWithoutContext()).toEqual({
      archive_configs: 0,
      archive_case_links: 0,
      archive_entries: 0,
    });
  });

  it("isolates vendor and municipality owners on all three archive tables", async () => {
    const vendorCounts = await withVendorRlsContext(vendorA, async (client) => {
      const counts: Record<string, number> = {};
      for (const table of ARCHIVE_TABLES) {
        const { rows: [row] } = await client.query(
          `SELECT count(*)::int AS count FROM ${table}
            WHERE vendor_id = ANY($1::int[]) OR kommune_id = ANY($2::int[])`,
          [[vendorA, vendorB], [kommuneA, kommuneB]],
        );
        counts[table] = Number(row.count);
      }
      return counts;
    });
    expect(Object.values(vendorCounts)).toEqual([1, 1, 1]);

    const municipalityCounts = await withKommuneRlsContext(kommuneA, async (client) => {
      const counts: Record<string, number> = {};
      for (const table of ARCHIVE_TABLES) {
        const { rows: [row] } = await client.query(
          `SELECT count(*)::int AS count FROM ${table}
            WHERE vendor_id = ANY($1::int[]) OR kommune_id = ANY($2::int[])`,
          [[vendorA, vendorB], [kommuneA, kommuneB]],
        );
        counts[table] = Number(row.count);
      }
      return counts;
    });
    expect(Object.values(municipalityCounts)).toEqual([1, 1, 1]);
  });

  it("blocks cross-tenant updates and owner spoofing", async () => {
    const changed = await withVendorRlsContext(vendorA, (client) => client.query(
      `UPDATE archive_configs SET status = 'disabled' WHERE vendor_id = $1`,
      [vendorB],
    ));
    expect(changed.rowCount).toBe(0);

    await expect(withVendorRlsContext(vendorA, (client) => client.query(
      `INSERT INTO archive_entries
         (vendor_id, kommune_id, entity_type, entity_id, status)
       VALUES ($1, NULL, 'rls_test', $2, 'pending')`,
      [vendorB, `spoof-${nonce}`],
    ))).rejects.toThrow(/row-level security policy/i);
  });

  it("allows only named system maintenance to traverse both tenant types", async () => {
    const counts = await withSystemRlsContext("archive_rls_verify", async (client) => {
      const result: Record<string, number> = {};
      for (const table of ARCHIVE_TABLES) {
        const { rows: [row] } = await client.query(
          `SELECT count(*)::int AS count FROM ${table}
            WHERE vendor_id = ANY($1::int[]) OR kommune_id = ANY($2::int[])`,
          [[vendorA, vendorB], [kommuneA, kommuneB]],
        );
        result[table] = Number(row.count);
      }
      return result;
    });
    expect(Object.values(counts)).toEqual([4, 4, 4]);
  });
});
