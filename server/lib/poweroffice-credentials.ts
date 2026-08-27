import { pool } from "../db";
import type { PoolClient } from "pg";
import {
  getActiveSecretKeyId,
  isSecretBoxConfigured,
  openSecret,
  sealSecret,
  sealedSecretKeyId,
} from "./secret-box";

export type PowerOfficeCredentialErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_CONFIGURATION"
  | "UNREADABLE_CREDENTIAL"
  | "STORAGE_FAILURE";

export class PowerOfficeCredentialError extends Error {
  constructor(public readonly code: PowerOfficeCredentialErrorCode) {
    super(code);
    this.name = "PowerOfficeCredentialError";
  }
}

function requireCredentialStorage(): void {
  try {
    if (!isSecretBoxConfigured()) {
      throw new PowerOfficeCredentialError("NOT_CONFIGURED");
    }
    getActiveSecretKeyId();
  } catch (error) {
    if (error instanceof PowerOfficeCredentialError) throw error;
    throw new PowerOfficeCredentialError("INVALID_CONFIGURATION");
  }
}

export function isPowerOfficeCredentialStorageConfigured(): boolean {
  try {
    requireCredentialStorage();
    return true;
  } catch {
    return false;
  }
}

export function sealPowerOfficeClientKey(clientKey: string): string {
  requireCredentialStorage();
  if (!clientKey || clientKey.length > 4096) {
    throw new PowerOfficeCredentialError("UNREADABLE_CREDENTIAL");
  }
  const sealed = sealSecret(clientKey);
  if (!sealed.startsWith("enc:v2:")) {
    throw new PowerOfficeCredentialError("STORAGE_FAILURE");
  }
  return sealed;
}

export function openPowerOfficeClientKey(stored: string): string {
  requireCredentialStorage();
  if (!stored || stored.length > 16_384) {
    throw new PowerOfficeCredentialError("UNREADABLE_CREDENTIAL");
  }
  try {
    const clientKey = openSecret(stored);
    if (!clientKey || clientKey.length > 4096) {
      throw new Error("invalid plaintext length");
    }
    return clientKey;
  } catch {
    throw new PowerOfficeCredentialError("UNREADABLE_CREDENTIAL");
  }
}

export function powerOfficeClientKeyNeedsRotation(stored: string): boolean {
  requireCredentialStorage();
  return sealedSecretKeyId(stored) !== getActiveSecretKeyId();
}

function storedKeyId(stored: string): string {
  return sealedSecretKeyId(stored) ?? "legacy-plaintext";
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function persistRotation(args: {
  integrationId: string;
  vendorId: number;
  previousStored: string;
  nextStored: string;
  source: "lazy-read" | "scheduled" | "manual";
}): Promise<boolean> {
  try {
    return await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE tidum_vendor_integrations
            SET client_key = $1, updated_at = NOW()
          WHERE id = $2
            AND vendor_id = $3
            AND provider = 'poweroffice'
            AND client_key = $4
        RETURNING id`,
        [args.nextStored, args.integrationId, args.vendorId, args.previousStored],
      );
      if (updated.rows.length !== 1) return false;
      await client.query(
        `INSERT INTO tidum_integration_secret_rotation_audit
           (integration_id, vendor_id, provider, from_key_id, to_key_id, rotation_source)
         VALUES ($1, $2, 'poweroffice', $3, $4, $5)`,
        [
          args.integrationId,
          args.vendorId,
          storedKeyId(args.previousStored),
          getActiveSecretKeyId(),
          args.source,
        ],
      );
      return true;
    });
  } catch (error) {
    if (error instanceof PowerOfficeCredentialError) throw error;
    throw new PowerOfficeCredentialError("STORAGE_FAILURE");
  }
}

export async function openAndRotatePowerOfficeClientKey(integration: {
  id: string;
  vendorId: number;
  clientKey: string;
}): Promise<string> {
  const clientKey = openPowerOfficeClientKey(integration.clientKey);
  if (powerOfficeClientKeyNeedsRotation(integration.clientKey)) {
    const rotated = await persistRotation({
      integrationId: integration.id,
      vendorId: integration.vendorId,
      previousStored: integration.clientKey,
      nextStored: sealPowerOfficeClientKey(clientKey),
      source: "lazy-read",
    });
    // Do not continue with a credential that was concurrently replaced or
    // disconnected after the caller read it.
    if (!rotated) throw new PowerOfficeCredentialError("STORAGE_FAILURE");
  }
  return clientKey;
}

export async function rotatePowerOfficeClientKeys(
  limit = 100,
  source: "scheduled" | "manual" = "scheduled",
): Promise<{ rotated: number; remaining: number; activeKeyId: string }> {
  requireCredentialStorage();
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 500));
  const activeKeyId = getActiveSecretKeyId();

  let rotated = 0;
  try {
    rotated = await withTransaction(async (client) => {
      const rows = await client.query(
        `SELECT id, vendor_id, client_key
           FROM tidum_vendor_integrations
          WHERE provider = 'poweroffice'
            AND NOT (
              client_key ~ '^enc:v2:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
              AND split_part(client_key, ':', 3) = $1
            )
          ORDER BY created_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT $2`,
        [activeKeyId, safeLimit],
      );
      let count = 0;
      for (const row of rows.rows) {
        const previousStored = String(row.client_key);
        const clientKey = openPowerOfficeClientKey(previousStored);
        const nextStored = sealPowerOfficeClientKey(clientKey);
        await client.query(
          `UPDATE tidum_vendor_integrations
              SET client_key = $1, updated_at = NOW()
            WHERE id = $2 AND vendor_id = $3 AND provider = 'poweroffice'`,
          [nextStored, row.id, row.vendor_id],
        );
        await client.query(
          `INSERT INTO tidum_integration_secret_rotation_audit
             (integration_id, vendor_id, provider, from_key_id, to_key_id, rotation_source)
           VALUES ($1, $2, 'poweroffice', $3, $4, $5)`,
          [row.id, row.vendor_id, storedKeyId(previousStored), activeKeyId, source],
        );
        count += 1;
      }
      return count;
    });

    const remainingResult = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM tidum_vendor_integrations
        WHERE provider = 'poweroffice'
          AND NOT (
            client_key ~ '^enc:v2:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
            AND split_part(client_key, ':', 3) = $1
          )`,
      [activeKeyId],
    );
    return {
      rotated,
      remaining: Number(remainingResult.rows[0]?.count ?? 0),
      activeKeyId,
    };
  } catch (error) {
    if (error instanceof PowerOfficeCredentialError) throw error;
    throw new PowerOfficeCredentialError("STORAGE_FAILURE");
  }
}
