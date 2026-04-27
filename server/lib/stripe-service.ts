import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { pricingTiers, accessRequests, type PricingTier } from "@shared/schema";
import { loadSalgSettings, loadPricingSettings } from "./pricing-service";

interface StripeContext {
  client: Stripe;
  publishableKey: string | null;
  webhookSecret: string | null;
  currency: string;
  taxBehavior: "inclusive" | "exclusive";
  successUrl: string;
  cancelUrl: string;
  mode: "test" | "live";
}

let cached: { ctx: StripeContext; key: string } | null = null;

// Stripe-keys live in app_settings (NOT env) so admin can rotate without
// re-deploying. We cache the SDK client per-secret-key to avoid recreating
// it on every call, but invalidate when the key changes.
async function getStripeContext(): Promise<StripeContext | null> {
  const settings = await loadSalgSettings();
  const secretKey = (settings.stripe_secret_key as string | undefined)?.trim();
  if (!secretKey) return null;

  if (cached && cached.key === secretKey) return cached.ctx;

  const ctx: StripeContext = {
    client: new Stripe(secretKey, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    }),
    publishableKey: ((settings.stripe_publishable_key as string | undefined) ?? "") || null,
    webhookSecret: ((settings.stripe_webhook_secret as string | undefined) ?? "") || null,
    currency: ((settings.stripe_currency as string | undefined) || "nok").toLowerCase(),
    taxBehavior: ((settings.stripe_tax_behavior as string | undefined) === "exclusive" ? "exclusive" : "inclusive") as "inclusive" | "exclusive",
    successUrl: (settings.stripe_checkout_success_url as string | undefined) || "/kontakt?stripe=success",
    cancelUrl: (settings.stripe_checkout_cancel_url as string | undefined) || "/priser?stripe=cancelled",
    mode: (secretKey.startsWith("sk_live_") ? "live" : "test"),
  };
  cached = { ctx, key: secretKey };
  return ctx;
}

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe secret key is not configured. Sett den i /admin/salg/innstillinger → Stripe.");
  }
}

async function getCtxOrThrow(): Promise<StripeContext> {
  const ctx = await getStripeContext();
  if (!ctx) throw new StripeNotConfiguredError();
  return ctx;
}

export interface SyncResult {
  tierId: number;
  slug: string;
  productId: string;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
  onboardingPriceId: string | null;
  created: { product: boolean; monthly: boolean; annual: boolean; onboarding: boolean };
}

// Idempotently mirror a pricing tier into Stripe as a Product + 2 recurring
// Prices (monthly + annual) + an optional one-time onboarding Price.
//
// Strategy:
//   - If tier.stripeProductId exists → update Product (name/description)
//   - For each price kind (monthly/annual/onboarding):
//       compare current Stripe Price unit_amount with tier value
//       if equal: keep the existing Price ID
//       if different (or no ID stored): archive the old Price and
//         create a new one (Stripe Prices are immutable on amount)
//   - Skip Enterprise tiers — those are sold as bespoke deals, no Stripe Product.
export async function syncTierToStripe(tier: PricingTier): Promise<SyncResult | null> {
  if (!tier.isActive) return null;
  if (tier.isEnterprise) return null;

  const ctx = await getCtxOrThrow();
  const created = { product: false, monthly: false, annual: false, onboarding: false };

  const productMetadata = {
    tier_slug: tier.slug,
    tier_id: String(tier.id),
    min_users: String(tier.minUsers),
    max_users: tier.maxUsers != null ? String(tier.maxUsers) : "",
    binding_months: String(tier.bindingMonths),
  };

  // 1. Product — create or update
  let product: Stripe.Product;
  if (tier.stripeProductId) {
    product = await ctx.client.products.update(tier.stripeProductId, {
      name: tier.label,
      description: tier.description ?? `Tidum SaaS-lisens — ${tier.minUsers}${tier.maxUsers ? `–${tier.maxUsers}` : "+"} brukere`,
      active: true,
      metadata: productMetadata,
    });
  } else {
    product = await ctx.client.products.create({
      name: tier.label,
      description: tier.description ?? `Tidum SaaS-lisens — ${tier.minUsers}${tier.maxUsers ? `–${tier.maxUsers}` : "+"} brukere`,
      metadata: productMetadata,
    });
    created.product = true;
  }

  // Helper to (re-)sync a Price. Stripe Prices are immutable on amount,
  // so we archive + create when amount differs.
  async function syncPrice(args: {
    existingId: string | null;
    unitAmountOre: number;
    interval: "month" | "year" | null; // null = one-time
    nickname: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; created: boolean }> {
    if (args.existingId) {
      try {
        const existing = await ctx.client.prices.retrieve(args.existingId);
        if (
          existing.unit_amount === args.unitAmountOre &&
          existing.active &&
          existing.currency === ctx.currency &&
          ((args.interval == null && !existing.recurring) ||
            (args.interval != null && existing.recurring?.interval === args.interval))
        ) {
          return { id: existing.id, created: false };
        }
        // Different amount or interval — archive old, create new
        await ctx.client.prices.update(args.existingId, { active: false });
      } catch {
        // Price not found in Stripe (manually deleted?) — recreate
      }
    }
    const newPrice = await ctx.client.prices.create({
      product: product.id,
      unit_amount: args.unitAmountOre,
      currency: ctx.currency,
      tax_behavior: ctx.taxBehavior,
      nickname: args.nickname,
      metadata: args.metadata,
      ...(args.interval ? { recurring: { interval: args.interval } } : {}),
    });
    return { id: newPrice.id, created: true };
  }

  // 2. Monthly price (per-user)
  const monthly = await syncPrice({
    existingId: tier.stripePriceIdMonthly,
    unitAmountOre: tier.pricePerUserOre,
    interval: "month",
    nickname: `${tier.label} — månedlig per bruker`,
    metadata: { tier_slug: tier.slug, kind: "monthly_per_user" },
  });
  created.monthly = monthly.created;

  // 3. Annual price (per-user × 12, paid up-front)
  const annualUnitAmount = tier.pricePerUserOre * 12;
  const annual = await syncPrice({
    existingId: tier.stripePriceIdAnnual,
    unitAmountOre: annualUnitAmount,
    interval: "year",
    nickname: `${tier.label} — årlig per bruker (12 mnd forskudd)`,
    metadata: { tier_slug: tier.slug, kind: "annual_per_user" },
  });
  created.annual = annual.created;

  // 4. Onboarding (one-time, total — not per user)
  let onboardingPriceId: string | null = null;
  if (tier.onboardingOre > 0) {
    const onboarding = await syncPrice({
      existingId: tier.stripeOnboardingPriceId,
      unitAmountOre: tier.onboardingOre,
      interval: null,
      nickname: `${tier.label} — onboarding (engangs)`,
      metadata: { tier_slug: tier.slug, kind: "onboarding_one_time" },
    });
    onboardingPriceId = onboarding.id;
    created.onboarding = onboarding.created;
  } else if (tier.stripeOnboardingPriceId) {
    // Onboarding fjernet i UI — arkivér den gamle prisen
    try {
      await ctx.client.prices.update(tier.stripeOnboardingPriceId, { active: false });
    } catch { /* ignore */ }
  }

  // Persist Stripe IDs back to DB
  await db.update(pricingTiers)
    .set({
      stripeProductId: product.id,
      stripePriceIdMonthly: monthly.id,
      stripePriceIdAnnual: annual.id,
      stripeOnboardingPriceId: onboardingPriceId,
      stripeSyncedAt: new Date(),
    })
    .where(eq(pricingTiers.id, tier.id));

  return {
    tierId: tier.id,
    slug: tier.slug,
    productId: product.id,
    monthlyPriceId: monthly.id,
    annualPriceId: annual.id,
    onboardingPriceId,
    created,
  };
}

export async function syncAllTiersToStripe(): Promise<{
  results: SyncResult[];
  skipped: Array<{ slug: string; reason: string }>;
}> {
  await getCtxOrThrow();
  const tiers = await db.select().from(pricingTiers);
  const results: SyncResult[] = [];
  const skipped: Array<{ slug: string; reason: string }> = [];

  for (const t of tiers) {
    if (!t.isActive) { skipped.push({ slug: t.slug, reason: "inactive" }); continue; }
    if (t.isEnterprise) { skipped.push({ slug: t.slug, reason: "enterprise (custom-deal)" }); continue; }
    try {
      const r = await syncTierToStripe(t);
      if (r) results.push(r);
    } catch (err: any) {
      skipped.push({ slug: t.slug, reason: err?.message || "unknown error" });
    }
  }

  return { results, skipped };
}

export interface CheckoutOpts {
  leadId: number;
  priceMode: "monthly" | "annual";
  appBaseUrl: string;
}

// Generate a Checkout Session URL for a specific lead. Selger sender denne
// til kunden — kunden fyller inn kort og signerer i ett steg. Webhook
// kvitterer subscription.created → vi oppretter revenue_event(signup).
export async function createCheckoutSessionForLead(opts: CheckoutOpts): Promise<{
  url: string;
  sessionId: string;
  expiresAt: Date;
}> {
  const ctx = await getCtxOrThrow();

  const [lead] = await db.select().from(accessRequests).where(eq(accessRequests.id, opts.leadId)).limit(1);
  if (!lead) throw new Error(`Lead ${opts.leadId} not found`);
  if (!lead.tierSnapshotId) throw new Error("Lead has no tier snapshot — kan ikke generere checkout uten valgt pris-tier");

  const [tier] = await db.select().from(pricingTiers).where(eq(pricingTiers.id, lead.tierSnapshotId)).limit(1);
  if (!tier) throw new Error(`Tier ${lead.tierSnapshotId} not found`);
  if (tier.isEnterprise) throw new Error("Enterprise tiers selges ikke via Checkout — bruk manuell faktura");

  const priceId = opts.priceMode === "monthly" ? tier.stripePriceIdMonthly : tier.stripePriceIdAnnual;
  if (!priceId) throw new Error(`Tier ${tier.slug} mangler Stripe ${opts.priceMode}-pris. Synk tiers til Stripe først.`);

  const userCount = lead.userCountEstimate ?? tier.minUsers;

  // Reuse existing Stripe customer if we have one, else create new
  let customerId = lead.stripeCustomerId;
  if (!customerId) {
    const customer = await ctx.client.customers.create({
      email: lead.email,
      name: lead.company || lead.fullName,
      phone: lead.phone || undefined,
      metadata: {
        tidum_lead_id: String(lead.id),
        org_number: lead.orgNumber || "",
        institution_type: lead.institutionType || "",
      },
    });
    customerId = customer.id;
    await db.update(accessRequests)
      .set({ stripeCustomerId: customerId })
      .where(eq(accessRequests.id, lead.id));
  }

  const lineItems: Array<{ price: string; quantity: number }> = [
    { price: priceId, quantity: userCount },
  ];
  if (tier.stripeOnboardingPriceId && tier.onboardingOre > 0) {
    lineItems.push({ price: tier.stripeOnboardingPriceId, quantity: 1 });
  }

  const session = await ctx.client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: lineItems,
    success_url: opts.appBaseUrl + ctx.successUrl + (ctx.successUrl.includes("?") ? "&" : "?") + "session_id={CHECKOUT_SESSION_ID}",
    cancel_url: opts.appBaseUrl + ctx.cancelUrl,
    subscription_data: {
      metadata: {
        tidum_lead_id: String(lead.id),
        tier_slug: tier.slug,
        user_count: String(userCount),
      },
    },
    metadata: {
      tidum_lead_id: String(lead.id),
      tier_slug: tier.slug,
    },
    locale: "nb",
  });

  if (!session.url) throw new Error("Stripe returned a session without URL");

  const expiresAt = new Date((session.expires_at ?? Math.floor(Date.now() / 1000) + 24 * 3600) * 1000);

  await db.update(accessRequests)
    .set({
      stripeCheckoutUrl: session.url,
      stripeCheckoutExpiresAt: expiresAt,
    })
    .where(eq(accessRequests.id, lead.id));

  return { url: session.url, sessionId: session.id, expiresAt };
}

// Verify webhook signature against stripe_webhook_secret app setting
export async function verifyAndConstructWebhookEvent(
  rawBody: Buffer | string,
  signatureHeader: string,
): Promise<Stripe.Event> {
  const ctx = await getCtxOrThrow();
  if (!ctx.webhookSecret) throw new Error("stripe_webhook_secret not configured");
  return ctx.client.webhooks.constructEvent(rawBody, signatureHeader, ctx.webhookSecret);
}

export async function getPublicStripeConfig(): Promise<{
  publishableKey: string | null;
  mode: "test" | "live";
} | null> {
  const ctx = await getStripeContext();
  if (!ctx) return null;
  return { publishableKey: ctx.publishableKey, mode: ctx.mode };
}
