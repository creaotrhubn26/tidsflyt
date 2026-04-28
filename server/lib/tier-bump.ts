/**
 * Tier-bump-logikk ved seat-overrun.
 *
 * Når en import overstiger vendor.max_users og hovedadmin har akseptert
 * tier-oppgraderingen (seat_overrun_ack), oppdaterer vi vendor sin tier-
 * referanse i DB. Faktisk Stripe-prorering (subscription item update +
 * proration) er separat og skjer i T15 — her kun DB-side-justering så
 * neste import-runde har riktig grense.
 *
 * Vi rekker IKKE den eksakte tier-snapshot-historikken på vendor
 * (tier_snapshot_id ligger på access_requests.signed-row, og det er
 * historisk). I stedet lagrer vi bump-historikk i imports.summary_jsonb
 * + sender e-post til Daniel som har audit-spor.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { vendors } from '@shared/schema';
import type { PricingTier } from '@shared/schema';
import { findTierForUserCount, loadActiveTiers } from './pricing-service';

export interface TierBumpResult {
  fromTier: PricingTier | null;
  toTier: PricingTier;
  vendorBefore: { maxUsers: number | null; subscriptionPlan: string | null };
  vendorAfter:  { maxUsers: number | null; subscriptionPlan: string | null };
  changed: boolean;
}

/**
 * Slå opp riktig tier for det nye brukerantallet og oppdater vendor.
 * Returnerer null hvis ingen tier matcher (skal ikke skje med korrekt
 * konfigurert pricing_tiers, men håndteres defensivt).
 */
export async function applyTierBump(
  vendorId: number,
  newUserCount: number,
): Promise<TierBumpResult | null> {
  const tiers = await loadActiveTiers();
  const toTier = findTierForUserCount(newUserCount, tiers);
  if (!toTier) {
    console.warn(`[tier-bump] Ingen aktiv tier matcher userCount=${newUserCount}. Vendor ${vendorId} ikke oppdatert.`);
    return null;
  }

  const [vendorBefore] = await db
    .select({ maxUsers: vendors.maxUsers, subscriptionPlan: vendors.subscriptionPlan })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1);
  if (!vendorBefore) {
    console.warn(`[tier-bump] Vendor ${vendorId} finnes ikke. Avbryter.`);
    return null;
  }

  // Prøv først å finne tier vi var på (best-effort: matcher på maxUsers).
  // Hvis vendor.maxUsers ikke matcher noen tier eksakt, settes fromTier=null.
  const fromTier = vendorBefore.maxUsers != null
    ? tiers.find((t) => t.maxUsers === vendorBefore.maxUsers) ?? null
    : null;

  const changed =
    vendorBefore.maxUsers !== toTier.maxUsers ||
    vendorBefore.subscriptionPlan !== toTier.slug;

  if (changed) {
    await db
      .update(vendors)
      .set({
        maxUsers: toTier.maxUsers ?? null,
        subscriptionPlan: toTier.slug,
        updatedAt: new Date(),
      })
      .where(eq(vendors.id, vendorId));
  }

  return {
    fromTier,
    toTier,
    vendorBefore: { maxUsers: vendorBefore.maxUsers ?? null, subscriptionPlan: vendorBefore.subscriptionPlan ?? null },
    vendorAfter:  { maxUsers: toTier.maxUsers ?? null, subscriptionPlan: toTier.slug },
    changed,
  };
}
