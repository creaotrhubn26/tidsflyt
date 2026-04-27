/**
 * Server-side GA4 (Measurement Protocol).
 *
 * Brukes for events som ikke skjer i nettleseren — særlig `purchase`
 * når et lead konverterer til "Won" via admin eller Stripe-webhook.
 * Uten dette ser GA4 bare opp til `generate_lead`; vi mister ARR-attribusjon.
 *
 * Konfig leses utelukkende fra Render env vars (per security policy):
 *   GA4_MEASUREMENT_ID  — G-XXXXXXXXXX (samme som klient bruker)
 *   GA4_API_SECRET      — fra GA4 Admin → Data Streams → Web → Measurement
 *                         Protocol API secrets → Create
 *
 * Hvis env mangler er funksjonene no-ops (logger warning én gang).
 */

interface Ga4Event {
  name: string;
  params?: Record<string, string | number | boolean>;
}

interface Ga4Payload {
  client_id: string;          // unik per "device/user" — for server-side bruker vi lead-email-hash
  user_id?: string;
  events: Ga4Event[];
  timestamp_micros?: number;
}

let warnedMissing = false;

function getCredentials(): { measurementId: string; apiSecret: string } | null {
  const measurementId = (process.env.GA4_MEASUREMENT_ID || "").trim();
  const apiSecret = (process.env.GA4_API_SECRET || "").trim();
  if (!measurementId || !apiSecret) {
    if (!warnedMissing) {
      console.warn(
        "[ga4-mp] GA4_MEASUREMENT_ID eller GA4_API_SECRET mangler i env — server-side events sendes ikke. " +
        "Sett dem i Render Dashboard → tidum-backend → Environment.",
      );
      warnedMissing = true;
    }
    return null;
  }
  return { measurementId, apiSecret };
}

// Stable client_id per email — gjør at flere events fra samme kunde
// grupperes som ett "device" i GA4 (selv om vi ikke har faktisk
// klient-ID fra nettleser).
function clientIdFromEmail(email: string): string {
  // Enkel deterministisk hash til positivt tall.timestamp-format som GA4 forventer
  let h = 0;
  for (let i = 0; i < email.length; i++) {
    h = (h * 31 + email.charCodeAt(i)) | 0;
  }
  return `${Math.abs(h)}.1700000000`;
}

async function send(payload: Ga4Payload): Promise<void> {
  const creds = getCredentials();
  if (!creds) return;

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    creds.measurementId,
  )}&api_secret=${encodeURIComponent(creds.apiSecret)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[ga4-mp] HTTP ${res.status} — ${await res.text().catch(() => "")}`);
    }
  } catch (err: any) {
    console.warn("[ga4-mp] send failed:", err?.message ?? err);
  }
}

/**
 * Standard GA4 e-commerce purchase — fyres når et lead går til "Won".
 * `value` er ARR i kroner (norsk SaaS regnes typisk i ARR ved konvertering).
 */
export async function trackPurchase(opts: {
  customerEmail: string;
  transactionId: string;        // bruk lead.id eller stripe subscription_id
  valueKr: number;              // ARR
  currency?: string;            // default NOK
  tierSlug: string;
  tierLabel: string;
  userCount: number;
  source?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}): Promise<void> {
  await send({
    client_id: clientIdFromEmail(opts.customerEmail),
    user_id: opts.customerEmail,
    timestamp_micros: Date.now() * 1000,
    events: [{
      name: "purchase",
      params: {
        transaction_id: opts.transactionId,
        value: opts.valueKr,
        currency: opts.currency || "NOK",
        items_json: JSON.stringify([{
          item_id: opts.tierSlug,
          item_name: opts.tierLabel,
          item_category: "saas-subscription",
          quantity: opts.userCount,
          price: Math.round(opts.valueKr / Math.max(opts.userCount, 1)),
        }]),
        // Custom dimensjoner (matcher det vi sender klient-side)
        tier_slug: opts.tierSlug,
        user_count: opts.userCount,
        ...(opts.source ? { source: opts.source } : {}),
        ...(opts.utmSource ? { utm_source: opts.utmSource } : {}),
        ...(opts.utmMedium ? { utm_medium: opts.utmMedium } : {}),
        ...(opts.utmCampaign ? { utm_campaign: opts.utmCampaign } : {}),
      },
    }],
  });
}

/**
 * Refund når kunden churn'er — gjør at GA4-konverteringer matcher
 * faktisk netto MRR over tid.
 */
export async function trackRefund(opts: {
  customerEmail: string;
  transactionId: string;
  valueKr: number;
}): Promise<void> {
  await send({
    client_id: clientIdFromEmail(opts.customerEmail),
    user_id: opts.customerEmail,
    timestamp_micros: Date.now() * 1000,
    events: [{
      name: "refund",
      params: {
        transaction_id: opts.transactionId,
        value: opts.valueKr,
        currency: "NOK",
      },
    }],
  });
}
