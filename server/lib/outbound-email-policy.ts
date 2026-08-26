/**
 * Central policy boundary for outbound SMTP.
 *
 * SMTP is an administrative/notification transport in Tidum. It must never
 * be used as the delivery channel for child-welfare case content or case
 * documents. Callers must state their purpose explicitly so new send paths
 * cannot silently inherit an unsafe default.
 */

export const SECURE_CHANNEL_REQUIRED_CODE = "SECURE_CHANNEL_REQUIRED";

export type PublicOutboundEmailPurpose =
  | "administrative"
  | "authentication"
  | "user_composed"
  | "sensitive_case_content";

export type InternalOutboundEmailPurpose =
  | PublicOutboundEmailPurpose
  | "neutral_secure_notification";

export class SecureChannelRequiredError extends Error {
  readonly code = SECURE_CHANNEL_REQUIRED_CODE;
  readonly reasonCode: string;

  constructor(
    message = "Sensitive opplysninger må sendes i godkjent sikker kanal",
    reasonCode = "SENSITIVE_CONTENT",
  ) {
    super(message);
    this.name = "SecureChannelRequiredError";
    this.reasonCode = reasonCode;
  }
}

export function assertOutboundEmailPurposeAllowed(purpose: unknown): asserts purpose is InternalOutboundEmailPurpose {
  if (purpose === "sensitive_case_content") {
    throw new SecureChannelRequiredError(undefined, "SENSITIVE_CASE_CONTENT");
  }
  if (
    purpose !== "administrative"
    && purpose !== "authentication"
    && purpose !== "user_composed"
    && purpose !== "neutral_secure_notification"
  ) {
    // Missing/unknown classification fails closed. A new call site must make
    // an explicit security decision before it can reach SMTP.
    throw new SecureChannelRequiredError("E-postens formål er ikke sikkerhetsklassifisert", "UNCLASSIFIED_EMAIL_PURPOSE");
  }
}

export function isSecureChannelRequiredError(error: unknown): error is SecureChannelRequiredError {
  return error instanceof SecureChannelRequiredError
    || (typeof error === "object" && error !== null && (error as { code?: unknown }).code === SECURE_CHANNEL_REQUIRED_CODE);
}
