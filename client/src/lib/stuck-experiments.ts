/**
 * Per-session deterministic variant picking + telemetry posting for the
 * stuck-detection A/B framework.
 *
 * The chosen variant is stable for the lifetime of the browser session
 * (so the same user never sees variant A on one trip and B on the next),
 * and is reported back to the server every time it surfaces or the user
 * acts on it. The server endpoint creates its table on first use.
 */
import type { StuckMessage, StuckMessageVariant, StuckReason } from "@shared/guide-config";

const SESSION_KEY = "tidum_stuck_session";

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

/** Stable hash of (sessionId + reason) → 0..1 for variant bucketing. */
function bucket(sessionId: string, reason: string): number {
  let h = 0;
  const s = `${sessionId}::${reason}`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 100_000) / 100_000;
}

/**
 * Pick the variant a given session should see for a given reason. Returns
 * { variantId: null, ...message } when no variants are configured (the
 * built-in title/body acts as the implicit control).
 */
export function pickVariant(
  reason: StuckReason,
  message: StuckMessage,
): StuckMessage & { variantId: string | null } {
  const variants = message.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    return { ...message, variantId: null };
  }
  const sessionId = getSessionId();
  const r = bucket(sessionId, reason);
  // Weighted selection — variants without weight default to 1.
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight ?? 1), 0) || 1;
  let acc = 0;
  for (const v of variants) {
    acc += (v.weight ?? 1) / totalWeight;
    if (r <= acc) {
      return { title: v.title, body: v.body, variants: message.variants, variantId: v.id };
    }
  }
  // Fallback to the last variant (rounding edge case).
  const last = variants[variants.length - 1];
  return { title: last.title, body: last.body, variants: message.variants, variantId: last.id };
}

/** Best-effort fire-and-forget telemetry POST. Never throws. */
export function recordStuckEvent(payload: {
  reason: StuckReason;
  variantId: string | null;
  action: "shown" | "tour" | "guide" | "dismissed";
  path?: string;
}): void {
  try {
    fetch("/api/cms/stuck-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...payload,
        path: payload.path ?? window.location.pathname,
        sessionId: getSessionId(),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
