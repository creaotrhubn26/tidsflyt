import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pool } from "../../db";
import { sealPowerOfficeClientKey } from "../poweroffice-credentials";

describe("PowerOffice credential migration 081", () => {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const originalSecretKey = process.env.TIDUM_SECRET_KEY;
  const originalKeyring = process.env.TIDUM_SECRET_KEYRING;
  const originalActiveKeyId = process.env.TIDUM_SECRET_ACTIVE_KEY_ID;
  let vendorId = 0;

  function restore(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  beforeAll(async () => {
    process.env.TIDUM_SECRET_KEY = "";
    process.env.TIDUM_SECRET_KEYRING = JSON.stringify({
      "migration-test": "poweroffice-migration-test-key-at-least-32-bytes",
    });
    process.env.TIDUM_SECRET_ACTIVE_KEY_ID = "migration-test";

    const migration = readFileSync("migrations/081_poweroffice_client_key_encryption.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration);

    const vendor = await pool.query(
      `INSERT INTO tidum_vendors (name, slug, settings)
       VALUES ($1, $2, '{}'::jsonb)
       RETURNING id`,
      [`PowerOffice migration ${nonce}`, `poweroffice-migration-${nonce}`],
    );
    vendorId = Number(vendor.rows[0].id);
  }, 60_000);

  afterAll(async () => {
    await pool.query(
      `DELETE FROM tidum_integration_secret_rotation_audit WHERE vendor_id = $1`,
      [vendorId],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM tidum_vendor_integrations WHERE vendor_id = $1`,
      [vendorId],
    ).catch(() => undefined);
    await pool.query("DELETE FROM tidum_vendors WHERE id = $1", [vendorId]).catch(() => undefined);
    restore("TIDUM_SECRET_KEY", originalSecretKey);
    restore("TIDUM_SECRET_KEYRING", originalKeyring);
    restore("TIDUM_SECRET_ACTIVE_KEY_ID", originalActiveKeyId);
  });

  it("fully validates the format guard when no legacy rows remain", async () => {
    const constraints = await pool.query(
      `SELECT conname, convalidated
         FROM pg_constraint
        WHERE conname = ANY($1::text[])
        ORDER BY conname`,
      [[
        "tidum_integration_secret_rotation_provider_check",
        "tidum_integration_secret_rotation_source_check",
        "tidum_vendor_integrations_poweroffice_client_key_sealed",
      ]],
    );
    expect(constraints.rows).toEqual([
      { conname: "tidum_integration_secret_rotation_provider_check", convalidated: true },
      { conname: "tidum_integration_secret_rotation_source_check", convalidated: true },
      { conname: "tidum_vendor_integrations_poweroffice_client_key_sealed", convalidated: true },
    ]);
  });

  it("rejects every new plaintext PowerOffice ClientKey", async () => {
    await expect(pool.query(
      `INSERT INTO tidum_vendor_integrations (vendor_id, provider, client_key, label)
       VALUES ($1, 'poweroffice', $2, 'must fail')`,
      [vendorId, `plaintext-${nonce}`],
    )).rejects.toThrow(/poweroffice_client_key_sealed/);
  });

  it("accepts an authenticated enc:v2 envelope without storing plaintext", async () => {
    const clientKey = `migration-client-key-${nonce}`;
    const sealed = sealPowerOfficeClientKey(clientKey);
    await pool.query(
      `INSERT INTO tidum_vendor_integrations (vendor_id, provider, client_key, label)
       VALUES ($1, 'poweroffice', $2, 'sealed fixture')`,
      [vendorId, sealed],
    );
    const stored = await pool.query(
      `SELECT client_key FROM tidum_vendor_integrations WHERE vendor_id = $1 AND provider = 'poweroffice'`,
      [vendorId],
    );
    expect(stored.rows[0].client_key).toMatch(/^enc:v2:migration-test:/);
    expect(stored.rows[0].client_key).not.toContain(clientKey);
  });
});
