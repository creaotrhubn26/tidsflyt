import crypto from "crypto";

const TURNSTILE_SECRET_KEY = process.env.CF_TURNSTILE_SECRET_KEY?.trim() || "";
const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type VerifyTurnstileOptions = {
  token?: string | null;
  remoteIp?: string | null;
  expectedAction?: string | null;
};

type TurnstileSiteverifyResponse = {
  success: boolean;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

export type TurnstileVerificationResult = {
  success: boolean;
  configured: boolean;
  action?: string;
  hostname?: string;
  challengeTs?: string;
  errorCodes: string[];
};

export function getRequestIp(
  headers: Record<string, unknown>,
  fallbackIp?: string | null,
) {
  const cfConnectingIp =
    typeof headers["cf-connecting-ip"] === "string"
      ? headers["cf-connecting-ip"].trim()
      : "";
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const xForwardedFor =
    typeof headers["x-forwarded-for"] === "string"
      ? headers["x-forwarded-for"]
      : Array.isArray(headers["x-forwarded-for"])
        ? headers["x-forwarded-for"][0]
        : "";

  if (xForwardedFor) {
    const forwardedIp = xForwardedFor.split(",")[0]?.trim();
    if (forwardedIp) {
      return forwardedIp;
    }
  }

  return fallbackIp?.trim() || null;
}

export async function verifyTurnstileToken({
  token,
  remoteIp,
  expectedAction,
}: VerifyTurnstileOptions): Promise<TurnstileVerificationResult> {
  if (!TURNSTILE_SECRET_KEY) {
    return {
      success: true,
      configured: false,
      errorCodes: [],
    };
  }

  if (!token) {
    return {
      success: false,
      configured: true,
      errorCodes: ["missing-input-response"],
    };
  }

  const body = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: token,
    idempotency_key: crypto.randomUUID(),
  });

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `Turnstile siteverify failed with status ${response.status}`,
    );
  }

  const result =
    (await response.json()) as TurnstileSiteverifyResponse;

  const actionMatches =
    !expectedAction || !result.action || result.action === expectedAction;

  if (!result.success || !actionMatches) {
    return {
      success: false,
      configured: true,
      action: result.action,
      hostname: result.hostname,
      challengeTs: result.challenge_ts,
      errorCodes: actionMatches
        ? result["error-codes"] || ["invalid-input-response"]
        : ["invalid-action"],
    };
  }

  return {
    success: true,
    configured: true,
    action: result.action,
    hostname: result.hostname,
    challengeTs: result.challenge_ts,
    errorCodes: [],
  };
}
