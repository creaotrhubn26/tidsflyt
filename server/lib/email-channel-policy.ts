import { pool } from "../db";
import type { EmailActor } from "./email-composer-security";
import { SecureChannelRequiredError } from "./outbound-email-policy";

const SENSITIVE_CATEGORIES = new Set([
  "barnevern",
  "case-report",
  "case_report",
  "journal",
  "vedtak",
  "saksdokument",
  "case-document",
]);

const SAFE_POLICY_METADATA_KEYS = new Set([
  "category",
  "reportType",
  "hasAttachment",
  "hasAttachments",
  "institutionId",
  "rapportId",
]);

export type EmailChannelPolicy = {
  actorUserId: string;
  vendorId: number;
  kommuneId: number | null;
  role: string;
  barnevernContext: boolean;
};

export type EmailPolicyAuditContext = {
  actorUserId?: string | null;
  vendorId?: number | null;
  kommuneId?: number | null;
  route: string;
  purpose: string;
  reasonCode: string;
  metadata?: Record<string, unknown>;
};

export async function loadEmailChannelPolicy(actor: EmailActor): Promise<EmailChannelPolicy> {
  const result = await pool.query(
    `SELECT
       u.id::text AS user_id,
       u.vendor_id,
       u.kommune_id,
       LOWER(COALESCE(u.role, '')) AS role,
       (
         COALESCE(v.sensitive_smtp_blocked, FALSE) = TRUE
         OR
         LOWER(COALESCE(v.institution_type, '')) = 'barnevern'
         OR EXISTS (
           SELECT 1
             FROM tidum_vendor_institutions vi
            WHERE vi.vendor_id = u.vendor_id
              AND LOWER(COALESCE(vi.institution_type, '')) = 'barnevern'
         )
       ) AS barnevern_context
     FROM users u
     LEFT JOIN tidum_vendors v ON v.id = u.vendor_id
     WHERE u.id::text = $1
     LIMIT 1`,
    [actor.id],
  );
  const row = result.rows[0];
  if (!row || Number(row.vendor_id) !== actor.vendorId) {
    throw new SecureChannelRequiredError("Brukerens e-posttilknytning kunne ikke verifiseres", "ACTOR_SCOPE_MISMATCH");
  }
  return {
    actorUserId: String(row.user_id),
    vendorId: Number(row.vendor_id),
    kommuneId: row.kommune_id == null ? null : Number(row.kommune_id),
    role: String(row.role || ""),
    barnevernContext: row.barnevern_context === true,
  };
}

export function sensitiveEmailCategory(value: unknown): boolean {
  return SENSITIVE_CATEGORIES.has(String(value ?? "").trim().toLowerCase());
}

export function assertUserComposedSmtpAllowed(
  policy: EmailChannelPolicy,
  input: { category?: unknown; reportType?: unknown } = {},
): void {
  if (policy.kommuneId != null || policy.role === "barnevernsleder" || policy.role === "kommune_saksbehandler") {
    throw new SecureChannelRequiredError("Kommunal barnevernsdialog må bruke sikker kanal", "KOMMUNE_SMTP_BLOCKED");
  }
  if (policy.barnevernContext) {
    throw new SecureChannelRequiredError("Barnevernsopplysninger må bruke sikker kanal", "BARNEVERN_SMTP_BLOCKED");
  }
  if (sensitiveEmailCategory(input.category) || sensitiveEmailCategory(input.reportType)) {
    throw new SecureChannelRequiredError("Saksrapport eller saksdokument må bruke sikker kanal", "SENSITIVE_CATEGORY_BLOCKED");
  }
}

/**
 * Security telemetry deliberately excludes recipients, subjects and message
 * bodies. Failure to persist the audit event must never turn a block into an
 * allowed send.
 */
export async function recordEmailPolicyBlock(context: EmailPolicyAuditContext): Promise<void> {
  const safeMetadata = context.metadata
    ? Object.fromEntries(Object.entries(context.metadata).filter(([key, value]) => (
      SAFE_POLICY_METADATA_KEYS.has(key)
      && (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    )))
    : {};
  try {
    await pool.query(
      `INSERT INTO tidum_outbound_email_policy_events
         (actor_user_id, vendor_id, kommune_id, route, purpose, reason_code, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        context.actorUserId ?? null,
        context.vendorId ?? null,
        context.kommuneId ?? null,
        context.route.slice(0, 200),
        context.purpose.slice(0, 100),
        context.reasonCode.slice(0, 100),
        JSON.stringify(safeMetadata),
      ],
    );
  } catch (error) {
    console.error("Failed to persist outbound email policy block", {
      route: context.route,
      reasonCode: context.reasonCode,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}
