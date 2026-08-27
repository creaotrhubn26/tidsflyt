import { describe, expect, it } from "vitest";
import { pool } from "../../db";

describe("tidum_vendors schema", () => {
  it("keeps the foreign vendors table untouched and exposes Tidum's integer tenant table", async () => {
    const { rows } = await pool.query(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('vendors', 'tidum_vendors')
          AND column_name IN ('id', 'org_number', 'institution_type')
        ORDER BY table_name, column_name`,
    );

    expect(rows).toEqual(expect.arrayContaining([
      { table_name: "vendors", column_name: "id", data_type: "character varying" },
      { table_name: "tidum_vendors", column_name: "id", data_type: "integer" },
      { table_name: "tidum_vendors", column_name: "institution_type", data_type: "text" },
      { table_name: "tidum_vendors", column_name: "org_number", data_type: "text" },
    ]));
  });

  it("normalizes Tidum-owned vendor references to integer", async () => {
    const { rows } = await pool.query(
      `SELECT table_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'vendor_id'
          AND table_name IN ('tidum_admin_users', 'tidum_frister')
        ORDER BY table_name`,
    );

    expect(rows).toEqual([
      { table_name: "tidum_admin_users", data_type: "integer" },
      { table_name: "tidum_frister", data_type: "integer" },
    ]);
  });

  it("has a unique partial index for organization number", async () => {
    const { rows } = await pool.query(
      `SELECT indexdef
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'tidum_vendors'
          AND indexname = 'tidum_vendors_org_number_unique_idx'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("UNIQUE INDEX");
    expect(rows[0].indexdef).toContain("WHERE (org_number IS NOT NULL)");
  });

  it("points deadline ownership at the Tidum-owned tenant table", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(con.oid) AS definition,
              con.convalidated AS validated
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE ns.nspname = 'public'
          AND rel.relname = 'tidum_frister'
          AND con.conname = 'tidum_frister_vendor_id_fkey'
          AND con.contype = 'f'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].definition).toContain(
      "FOREIGN KEY (vendor_id) REFERENCES tidum_vendors(id)",
    );
    expect(rows[0].validated).toBe(true);
  });
});
