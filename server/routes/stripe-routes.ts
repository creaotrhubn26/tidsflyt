import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { pricingTiers, accessRequests } from "@shared/schema";
import { requireSuperAdmin } from "../custom-auth";
import { getAppBaseUrl } from "../lib/app-base-url";
import {
  syncTierToStripe,
  syncAllTiersToStripe,
  createCheckoutSessionForLead,
  verifyAndConstructWebhookEvent,
  getPublicStripeConfig,
  StripeNotConfiguredError,
} from "../lib/stripe-service";
import { trackPurchase, trackRefund } from "../lib/ga4-tracker";

export function registerStripeRoutes(app: Express): void {
  // ============================================================
  // Public — get publishable key + mode (used by frontend Checkout)
  // ============================================================
  app.get("/api/stripe/config", async (_req, res) => {
    try {
      const cfg = await getPublicStripeConfig();
      res.json(cfg ?? { publishableKey: null, mode: "test" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Admin — sync tiers
  // ============================================================
  app.post("/api/admin/stripe/sync-tiers", requireSuperAdmin, async (_req, res) => {
    try {
      const result = await syncAllTiersToStripe();
      res.json(result);
    } catch (err: any) {
      if (err instanceof StripeNotConfiguredError) {
        return res.status(400).json({ error: err.message });
      }
      console.error("sync-tiers error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/stripe/sync-tier/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [tier] = await db.select().from(pricingTiers).where(eq(pricingTiers.id, id)).limit(1);
      if (!tier) return res.status(404).json({ error: "Tier not found" });
      const result = await syncTierToStripe(tier);
      if (!result) {
        return res.status(400).json({
          error: tier.isEnterprise
            ? "Enterprise-tier syncher ikke til Stripe (selges manuelt)"
            : "Tier er inaktiv",
        });
      }
      res.json(result);
    } catch (err: any) {
      if (err instanceof StripeNotConfiguredError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/stripe/status", requireSuperAdmin, async (_req, res) => {
    try {
      const tiers = await db.select().from(pricingTiers);
      const config = await getPublicStripeConfig();
      res.json({
        configured: config != null,
        mode: config?.mode ?? null,
        tiers: tiers.map((t) => ({
          id: t.id,
          slug: t.slug,
          label: t.label,
          isActive: t.isActive,
          isEnterprise: t.isEnterprise,
          stripeProductId: t.stripeProductId,
          stripePriceIdMonthly: t.stripePriceIdMonthly,
          stripePriceIdAnnual: t.stripePriceIdAnnual,
          stripeOnboardingPriceId: t.stripeOnboardingPriceId,
          stripeSyncedAt: t.stripeSyncedAt,
          syncedToStripe: !!t.stripeProductId,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Admin — generer checkout-link for et lead
  // ============================================================
  app.post("/api/admin/leads/:id/checkout-session", requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const priceMode = (req.body?.priceMode === "monthly" ? "monthly" : "annual") as "monthly" | "annual";
      const result = await createCheckoutSessionForLead({
        leadId: id,
        priceMode,
        appBaseUrl: getAppBaseUrl(),
      });
      res.json(result);
    } catch (err: any) {
      if (err instanceof StripeNotConfiguredError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  });

  // ============================================================
  // Webhook — Stripe → our system
  // Raw body comes from express.json's `verify`-hook in server/index.ts
  // (req.rawBody as Buffer). express.raw() ville vært riktig hvis json-
  // middlewaren ikke alt hadde parsed kroppen først.
  // ============================================================
  app.post(
    "/api/stripe/webhook",
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") {
        return res.status(400).send("Missing stripe-signature header");
      }

      const rawBody = (req as any).rawBody as Buffer | undefined;
      if (!rawBody) {
        console.error("Stripe webhook: req.rawBody not available");
        return res.status(500).send("Internal: raw body capture failed");
      }

      let event;
      try {
        event = await verifyAndConstructWebhookEvent(rawBody, sig);
      } catch (err: any) {
        console.error("Stripe webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook signature error: ${err.message}`);
      }

      // Idempotency — Stripe retries; skip if we've already seen this event
      try {
        const existing = await pool.query(
          "SELECT id FROM stripe_events WHERE stripe_event_id = $1 LIMIT 1",
          [event.id],
        );
        if (existing.rows.length > 0) {
          return res.json({ received: true, deduped: true });
        }

        const obj: any = event.data.object;
        const customerId = obj.customer ?? null;
        const subscriptionId = obj.subscription ?? obj.id ?? null;
        const invoiceId = obj.id?.startsWith?.("in_") ? obj.id : null;

        // Find the lead — first by stripe_customer_id, then by metadata.tidum_lead_id
        let leadId: number | null = null;
        if (obj.metadata?.tidum_lead_id) {
          leadId = Number(obj.metadata.tidum_lead_id);
        } else if (customerId) {
          const r = await pool.query(
            "SELECT id FROM access_requests WHERE stripe_customer_id = $1 LIMIT 1",
            [customerId],
          );
          if (r.rows.length > 0) leadId = r.rows[0].id;
        }

        let revenueEventId: number | null = null;

        // ---- Map event type to revenue_event ----
        if (event.type === "customer.subscription.created" || event.type === "checkout.session.completed") {
          // signup
          if (leadId) {
            const sub = event.type === "customer.subscription.created"
              ? obj
              : (await pool.query("SELECT * FROM access_requests WHERE id = $1", [leadId])).rows[0];

            // Compute MRR from subscription items
            let mrrOre = 0;
            if (event.type === "customer.subscription.created" && obj.items?.data) {
              for (const item of obj.items.data) {
                const unit = item.price?.unit_amount || 0;
                const qty = item.quantity || 1;
                const interval = item.price?.recurring?.interval;
                if (interval === "month") mrrOre += unit * qty;
                else if (interval === "year") mrrOre += Math.round((unit * qty) / 12);
              }
            }

            const ins = await pool.query(
              `INSERT INTO revenue_events (
                 lead_id, customer_email, customer_company, event_type,
                 delta_mrr_ore, mrr_after_ore, source, utm_source, utm_medium, utm_campaign,
                 occurred_at, notes
               )
               SELECT $1, ar.email, ar.company, 'signup',
                      $2, $2, ar.source, ar.utm_source, ar.utm_medium, ar.utm_campaign,
                      NOW(), $3
                 FROM access_requests ar WHERE ar.id = $1
               RETURNING id`,
              [leadId, mrrOre, `Stripe ${event.type}`],
            );
            revenueEventId = ins.rows[0]?.id ?? null;

            // Update lead state
            await pool.query(
              `UPDATE access_requests SET
                 stripe_subscription_id = COALESCE($2, stripe_subscription_id),
                 stripe_customer_id     = COALESCE($3, stripe_customer_id),
                 signed_at              = COALESCE(signed_at, NOW()),
                 mrr_ore_snapshot       = $4,
                 arr_ore_snapshot       = $5
               WHERE id = $1`,
              [leadId, subscriptionId, customerId, mrrOre, mrrOre * 12],
            );

            // Server-side GA4 purchase event — så GA4 ser konverteringen
            // selv om den ble registrert via Stripe-webhook (ikke nettleser)
            try {
              const { rows: leadRows } = await pool.query(
                `SELECT ar.email, ar.company, ar.user_count_estimate,
                        ar.source, ar.utm_source, ar.utm_medium, ar.utm_campaign,
                        pt.slug AS tier_slug, pt.label AS tier_label
                   FROM access_requests ar
                   LEFT JOIN pricing_tiers pt ON pt.id = ar.tier_snapshot_id
                  WHERE ar.id = $1`,
                [leadId],
              );
              const r = leadRows[0];
              if (r && r.tier_slug) {
                await trackPurchase({
                  customerEmail: r.email,
                  transactionId: subscriptionId || `lead_${leadId}`,
                  valueKr: Math.round((mrrOre * 12) / 100),
                  tierSlug: r.tier_slug,
                  tierLabel: r.tier_label,
                  userCount: r.user_count_estimate || 0,
                  source: r.source,
                  utmSource: r.utm_source,
                  utmMedium: r.utm_medium,
                  utmCampaign: r.utm_campaign,
                });
              }
            } catch (e) {
              console.warn("GA4 purchase event failed (non-fatal):", e);
            }
          }
        } else if (event.type === "customer.subscription.deleted") {
          // churn
          if (leadId) {
            const ins = await pool.query(
              `INSERT INTO revenue_events (
                 lead_id, customer_email, customer_company, event_type,
                 delta_mrr_ore, mrr_after_ore, occurred_at, notes
               )
               SELECT $1, ar.email, ar.company, 'churn',
                      -COALESCE(ar.mrr_ore_snapshot, 0), 0, NOW(), 'Stripe subscription cancelled'
                 FROM access_requests ar WHERE ar.id = $1
               RETURNING id`,
              [leadId],
            );
            revenueEventId = ins.rows[0]?.id ?? null;

            // GA4 refund — netto-konvertering matcher faktisk MRR
            try {
              const { rows: leadRows } = await pool.query(
                `SELECT email, mrr_ore_snapshot, stripe_subscription_id
                   FROM access_requests WHERE id = $1`,
                [leadId],
              );
              const r = leadRows[0];
              if (r) {
                await trackRefund({
                  customerEmail: r.email,
                  transactionId: r.stripe_subscription_id || `lead_${leadId}`,
                  valueKr: Math.round(((r.mrr_ore_snapshot || 0) * 12) / 100),
                });
              }
            } catch (e) {
              console.warn("GA4 refund event failed (non-fatal):", e);
            }
          }
        } else if (event.type === "customer.subscription.updated") {
          // upgrade/downgrade — calculate delta from previous_attributes if available
          // (left as future work; logged for visibility)
        } else if (event.type === "invoice.payment_failed") {
          // dunning — no revenue event yet, just logged
        }

        await pool.query(
          `INSERT INTO stripe_events (
             stripe_event_id, event_type, customer_id, subscription_id, invoice_id,
             payload, processed_at, revenue_event_id
           ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
          [event.id, event.type, customerId, subscriptionId, invoiceId, JSON.stringify(event), revenueEventId],
        );

        res.json({ received: true, type: event.type, revenueEventId });
      } catch (err: any) {
        console.error("Stripe webhook handler error:", err);
        // Still return 200 — Stripe will retry, but if our DB is down,
        // returning 500 just causes retry storms. Log and move on.
        res.status(200).json({ received: true, handlerError: err.message });
      }
    },
  );
}
