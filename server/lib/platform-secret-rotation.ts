import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { processSecureDialogKeyRotation } from "./secure-dialog-governance";
import { getSecretBoxRuntimeStatus } from "./secret-box";
import { withSystemRlsContext } from "./database-rls-context";

export type SecretRotationInventory = {
  secureConversations: number;
  secureMessages: number;
  archiveConfigs: number;
  municipalityKeys: number;
  rawIntakePayloads: number;
  powerOfficeCredentials: number;
};

export class PlatformSecretRotationError extends Error {
  constructor(readonly code:
    | "NOT_CONFIGURED"
    | "INVALID_OPERATOR"
    | "INVALID_LIMIT"
    | "AUDIT_FAILURE"
    | "ROTATION_FAILURE") {
    super(code);
    this.name = "PlatformSecretRotationError";
  }
}

function numericInventory(row: Record<string, unknown>): SecretRotationInventory {
  return {
    secureConversations: Number(row.secure_conversations ?? 0),
    secureMessages: Number(row.secure_messages ?? 0),
    archiveConfigs: Number(row.archive_configs ?? 0),
    municipalityKeys: Number(row.municipality_keys ?? 0),
    rawIntakePayloads: Number(row.raw_intake_payloads ?? 0),
    powerOfficeCredentials: Number(row.poweroffice_credentials ?? 0),
  };
}

export async function getSecretRotationInventory(
  activeKeyId: string,
): Promise<SecretRotationInventory> {
  return withSystemRlsContext("secret_inventory", async (client) => {
    const { rows: [row] } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM tidum_secure_conversations
           WHERE subject IS NOT NULL AND NOT (
             subject ~ '^sdc:v1:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
             AND split_part(subject, ':', 3) = $1
           )) AS secure_conversations,
         (SELECT COUNT(*)::int FROM tidum_secure_messages
           WHERE NOT (
             body_encrypted ~ '^sdc:v1:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
             AND split_part(body_encrypted, ':', 3) = $1
           )) AS secure_messages,
         (SELECT COUNT(*)::int FROM archive_configs
           WHERE NOT (
             client_secret ~ '^enc:v2:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
             AND split_part(client_secret, ':', 3) = $1
           )) AS archive_configs,
         (SELECT COUNT(*)::int FROM tidum_kommuner
           WHERE fiks_private_key_encrypted IS NOT NULL AND NOT (
             fiks_private_key_encrypted ~ '^enc:v2:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
             AND split_part(fiks_private_key_encrypted, ':', 3) = $1
           )) AS municipality_keys,
         (SELECT COUNT(*)::int FROM tidum_fiks_raw_intake_log
           WHERE NOT (
             raw_payload_encrypted ~ '^enc:v2:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
             AND split_part(raw_payload_encrypted, ':', 3) = $1
           )) AS raw_intake_payloads,
         (SELECT COUNT(*)::int FROM tidum_vendor_integrations
           WHERE provider = 'poweroffice' AND NOT (
             client_key ~ '^enc:v2:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
             AND split_part(client_key, ':', 3) = $1
           )) AS poweroffice_credentials`,
      [activeKeyId],
    );
    return numericInventory(row ?? {});
  });
}

function rotatedCounts(result: Awaited<ReturnType<typeof processSecureDialogKeyRotation>>): SecretRotationInventory {
  return {
    secureConversations: result.conversations,
    secureMessages: result.messages,
    archiveConfigs: result.archiveConfigs,
    municipalityKeys: result.municipalityKeys,
    rawIntakePayloads: result.rawIntakePayloads,
    powerOfficeCredentials: result.powerOfficeCredentials,
  };
}

async function appendRunAudit(args: {
  runId: string;
  source: "manual" | "scheduled";
  initiatedBy: string | null;
  activeKeyId: string;
  status: "completed" | "failed";
  rotated: Partial<SecretRotationInventory>;
  remaining: Partial<SecretRotationInventory>;
  errorCode?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO tidum_secret_rotation_runs
       (id, rotation_source, initiated_by, active_key_id, status,
        rotated_counts, remaining_counts, error_code)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      args.runId,
      args.source,
      args.initiatedBy,
      args.activeKeyId,
      args.status,
      JSON.stringify(args.rotated),
      JSON.stringify(args.remaining),
      args.errorCode ?? null,
    ],
  );
}

export async function runPlatformSecretRotation(args: {
  limit: number;
  source: "manual" | "scheduled";
  initiatedBy: string | null;
}): Promise<{
  runId: string;
  activeKeyId: string;
  rotated: SecretRotationInventory;
  remaining: SecretRotationInventory;
}> {
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 500) {
    throw new PlatformSecretRotationError("INVALID_LIMIT");
  }
  if (args.source === "manual" && !args.initiatedBy) {
    throw new PlatformSecretRotationError("INVALID_OPERATOR");
  }
  const runtime = getSecretBoxRuntimeStatus();
  if (!runtime.configured || !runtime.activeKeyId || runtime.keyCount < 1) {
    throw new PlatformSecretRotationError("NOT_CONFIGURED");
  }

  const runId = randomUUID();
  try {
    const result = await processSecureDialogKeyRotation(args.limit, undefined, args.source);
    const rotated = rotatedCounts(result);
    // Always calculate inventory. SKIP LOCKED can make a concurrent run rotate
    // zero rows even while a locked legacy row still exists; audit must never
    // turn that observation into a false zero-rest claim.
    const remaining = await getSecretRotationInventory(result.activeKeyId);
    await appendRunAudit({
      runId,
      source: args.source,
      initiatedBy: args.initiatedBy,
      activeKeyId: result.activeKeyId,
      status: "completed",
      rotated,
      remaining,
    });
    return { runId, activeKeyId: result.activeKeyId, rotated, remaining };
  } catch (error) {
    try {
      await appendRunAudit({
        runId,
        source: args.source,
        initiatedBy: args.initiatedBy,
        activeKeyId: runtime.activeKeyId,
        status: "failed",
        rotated: {},
        remaining: {},
        errorCode: "ROTATION_FAILURE",
      });
    } catch {
      throw new PlatformSecretRotationError("AUDIT_FAILURE");
    }
    if (error instanceof PlatformSecretRotationError) throw error;
    throw new PlatformSecretRotationError("ROTATION_FAILURE");
  }
}
