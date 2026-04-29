/**
 * Felles seat-overrun-prosess.
 *
 * Sjekker om en vendor er over max_users, og hvis ja:
 *   1) Slår opp riktig pricing_tier basert på faktisk brukerantall
 *   2) Oppdaterer vendors.max_users + subscription_plan (DB)
 *   3) Kaller Stripe-prorering hvis TIDUM_STRIPE_AUTOBUMP=1
 *   4) Sender hovedadmin-notice + Daniel-varsel
 *   5) Logger hendelsen til vendor_seat_log
 *
 * Brukes av:
 *   - Daglig seat-overrun-cron (sikkerhetsnett — fanger alt)
 *   - Insert-time hooks i invitasjons-endepunkter (real-time når mulig)
 *
 * Best-effort: kaster ikke exceptions. Returnerer status-objekt.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { companyUsers, vendors, vendorSeatLog } from '@shared/schema';
import { applyTierBump } from './tier-bump';
import { bumpStripeSubscriptionToNewTier, type StripeBumpResult } from './stripe-service';
import { emailService } from './email-service';
import { TIDUM_SUPPORT_EMAIL } from '@shared/brand';
import { oreToKr } from './pricing-service';
import { accessRequests } from '@shared/schema';
import { and, desc } from 'drizzle-orm';

export type SeatOverrunSource = 'cron' | 'import' | 'manual_invite' | 'api' | 'approval';

export interface SeatOverrunResult {
  vendorId: number;
  vendorName: string | null;
  prevUsers: number;
  newUsers: number;
  prevMaxUsers: number | null;
  newMaxUsers: number | null;
  bumped: boolean;
  stripeResult: StripeBumpResult | null;
  reason?: 'no_overrun' | 'no_tier_match' | 'vendor_not_found';
}

/**
 * Hovedinngangen. Sjekker vendor's nåværende brukerantall mot max_users,
 * og hvis overrun: trigger DB-bump + Stripe + e-post + audit-logg.
 *
 * @param triggeredBy E-post / id av hva/hvem som trigget. Cron sender 'system:cron'.
 */
export async function processVendorSeatOverrun(
  vendorId: number,
  source: SeatOverrunSource,
  triggeredBy: string | null = null,
): Promise<SeatOverrunResult> {
  // 1. Hent vendor + tell brukere
  const [vendor] = await db
    .select({ id: vendors.id, name: vendors.name, maxUsers: vendors.maxUsers, subscriptionPlan: vendors.subscriptionPlan })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1);

  if (!vendor) {
    return {
      vendorId,
      vendorName: null,
      prevUsers: 0,
      newUsers: 0,
      prevMaxUsers: null,
      newMaxUsers: null,
      bumped: false,
      stripeResult: null,
      reason: 'vendor_not_found',
    };
  }

  const [cnt] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companyUsers)
    .where(eq(companyUsers.vendorId, vendorId));
  const currentUsers = Number(cnt?.count ?? 0);
  const maxUsers = vendor.maxUsers ?? null;

  // 2. Ingen overrun → ingenting å gjøre
  if (maxUsers == null || currentUsers <= maxUsers) {
    return {
      vendorId,
      vendorName: vendor.name,
      prevUsers: currentUsers,
      newUsers: currentUsers,
      prevMaxUsers: maxUsers,
      newMaxUsers: maxUsers,
      bumped: false,
      stripeResult: null,
      reason: 'no_overrun',
    };
  }

  // 3. Tier-bump i DB
  const tierBump = await applyTierBump(vendorId, currentUsers);
  if (!tierBump) {
    // Ingen tier matcher — vendor sitter på et brukerantall som ikke er
    // dekket av prisbåndene. Logger uansett, slik at Daniel kan rydde opp.
    await db.insert(vendorSeatLog).values({
      vendorId,
      source,
      prevUsers: currentUsers,
      prevMaxUsers: maxUsers,
      prevTierSlug: vendor.subscriptionPlan,
      newUsers: currentUsers,
      newMaxUsers: maxUsers,
      newTierSlug: null,
      newTierId: null,
      stripeResult: null,
      triggeredBy,
    });
    return {
      vendorId,
      vendorName: vendor.name,
      prevUsers: currentUsers,
      newUsers: currentUsers,
      prevMaxUsers: maxUsers,
      newMaxUsers: maxUsers,
      bumped: false,
      stripeResult: null,
      reason: 'no_tier_match',
    };
  }

  // 4. Stripe-bump (best-effort, default-OFF via flag)
  let stripeResult: StripeBumpResult | null = null;
  try {
    const [activeSub] = await db
      .select({ subId: accessRequests.stripeSubscriptionId })
      .from(accessRequests)
      .where(and(
        eq(accessRequests.vendorId, vendorId),
        eq(accessRequests.status, 'approved'),
      ))
      .orderBy(desc(accessRequests.createdAt))
      .limit(1);

    stripeResult = await bumpStripeSubscriptionToNewTier(
      activeSub?.subId ?? null,
      tierBump.toTier,
      currentUsers,
    );
  } catch (err) {
    console.error(`[seat-overrun] Stripe-bump feilet for vendor ${vendorId}:`, err);
    stripeResult = null;
  }

  // 5. Audit-logg
  await db.insert(vendorSeatLog).values({
    vendorId,
    source,
    prevUsers: currentUsers,
    prevMaxUsers: maxUsers,
    prevTierSlug: tierBump.fromTier?.slug ?? vendor.subscriptionPlan ?? null,
    newUsers: currentUsers,
    newMaxUsers: tierBump.vendorAfter.maxUsers,
    newTierSlug: tierBump.toTier.slug,
    newTierId: tierBump.toTier.id,
    stripeResult: stripeResult as unknown,
    triggeredBy,
  });

  // 6. E-post til Daniel + hovedadmin (best-effort)
  try {
    await sendSeatOverrunEmails(vendor.name || `vendor #${vendorId}`, vendorId, {
      prevUsers: maxUsers,         // grensen som er overskredet
      newUsers: currentUsers,      // faktisk antall
      maxUsers,                    // tidligere cap
      tierBumpFromLabel: tierBump.fromTier?.label ?? null,
      tierBumpToLabel: tierBump.toTier.label,
      tierBumpToPriceKr: oreToKr(tierBump.toTier.pricePerUserOre),
      stripeResult,
      source,
      triggeredBy,
    });
  } catch (mailErr) {
    console.error(`[seat-overrun] E-post-varsler feilet for vendor ${vendorId}:`, mailErr);
  }

  return {
    vendorId,
    vendorName: vendor.name,
    prevUsers: currentUsers,
    newUsers: currentUsers,
    prevMaxUsers: maxUsers,
    newMaxUsers: tierBump.vendorAfter.maxUsers,
    bumped: tierBump.changed,
    stripeResult,
  };
}

interface OverrunEmailContext {
  prevUsers: number;
  newUsers: number;
  maxUsers: number;
  tierBumpFromLabel: string | null;
  tierBumpToLabel: string;
  tierBumpToPriceKr: number;
  stripeResult: StripeBumpResult | null;
  source: SeatOverrunSource;
  triggeredBy: string | null;
}

async function sendSeatOverrunEmails(
  vendorName: string,
  vendorId: number,
  ctx: OverrunEmailContext,
): Promise<void> {
  // Hovedadmin-e-post: prøv å finne hovedadmin sin e-post via accessRequests
  // (siste approved-rad, der is_hovedadmin=true ⇒ request.email; ellers
  // alt_hovedadmin_email).
  const [latestApproved] = await db
    .select({
      email: accessRequests.email,
      fullName: accessRequests.fullName,
      isHovedadmin: accessRequests.isHovedadmin,
      altEmail: accessRequests.altHovedadminEmail,
      altName: accessRequests.altHovedadminName,
    })
    .from(accessRequests)
    .where(and(eq(accessRequests.vendorId, vendorId), eq(accessRequests.status, 'approved')))
    .orderBy(desc(accessRequests.createdAt))
    .limit(1);

  if (latestApproved) {
    const hovedEmail = latestApproved.isHovedadmin === false && latestApproved.altEmail
      ? latestApproved.altEmail
      : latestApproved.email;
    const hovedName = latestApproved.isHovedadmin === false && latestApproved.altName
      ? latestApproved.altName
      : latestApproved.fullName;

    if (hovedEmail) {
      try {
        await emailService.sendTierUpgradeNoticeEmail({
          to: hovedEmail,
          hovedadminName: hovedName,
          vendorName,
          fromUserCount: ctx.maxUsers,
          toUserCount: ctx.newUsers,
          fromTierLabel: ctx.tierBumpFromLabel,
          toTierLabel: ctx.tierBumpToLabel,
          pricePerUserKr: ctx.tierBumpToPriceKr,
        });
      } catch (err) {
        console.error('[seat-overrun] Hovedadmin-e-post feilet:', err);
      }
    }
  }

  // Daniel-varsel
  const stripeStatus = ctx.stripeResult?.ok
    ? `Stripe auto-oppdatert (subscription ${ctx.stripeResult.subscription_id}, pris ${ctx.stripeResult.new_price_id}, qty ${ctx.stripeResult.new_quantity}${ctx.stripeResult.invoice_id ? `, invoice ${ctx.stripeResult.invoice_id}` : ''}).`
    : ctx.stripeResult
      ? `Stripe IKKE oppdatert: ${ctx.stripeResult.reason}${ctx.stripeResult.error_message ? ` — ${ctx.stripeResult.error_message}` : ''}. Manuell action kreves.`
      : 'Stripe-bump ikke forsøkt.';

  await emailService.sendEmail({
    to: TIDUM_SUPPORT_EMAIL,
    subject: `Seat-overrun (${ctx.source}): ${vendorName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="color: #0f172a;">Seat-overrun oppdaget</h2>
        <p><strong>Vendor:</strong> ${vendorName} (id ${vendorId})</p>
        <p><strong>Tidligere grense:</strong> ${ctx.maxUsers} brukere</p>
        <p><strong>Faktisk antall:</strong> ${ctx.newUsers} brukere</p>
        <p><strong>Kilde:</strong> ${ctx.source}${ctx.triggeredBy ? ` (av ${ctx.triggeredBy})` : ''}</p>
        <p><strong>Tier:</strong> ${ctx.tierBumpFromLabel || '—'} → ${ctx.tierBumpToLabel}</p>
        <div style="margin-top: 12px; padding: 12px; background: ${ctx.stripeResult?.ok ? '#f0fdf4; border-left: 3px solid #16a34a' : '#fff7e6; border-left: 3px solid #f0c674'};">
          <strong>Stripe:</strong> ${stripeStatus}
        </div>
      </div>
    `,
    text: [
      `Seat-overrun (${ctx.source}): ${vendorName}`,
      `Vendor id: ${vendorId}`,
      `Grense → faktisk: ${ctx.maxUsers} → ${ctx.newUsers}`,
      `Tier: ${ctx.tierBumpFromLabel || '—'} → ${ctx.tierBumpToLabel}`,
      ctx.triggeredBy ? `Trigget av: ${ctx.triggeredBy}` : '',
      '',
      stripeStatus,
    ].filter(Boolean).join('\n'),
  });
}

/**
 * Sweeper alle aktive vendors. Kalles fra daglig cron.
 */
export async function sweepAllVendorsForSeatOverrun(): Promise<{
  total: number;
  bumped: number;
  errors: number;
}> {
  const allVendors = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.status, 'active'));
  let bumped = 0;
  let errors = 0;
  for (const v of allVendors) {
    try {
      const res = await processVendorSeatOverrun(v.id, 'cron', 'system:cron');
      if (res.bumped) bumped++;
    } catch (err) {
      errors++;
      console.error(`[seat-overrun] sweep-error for vendor ${v.id}:`, err);
    }
  }
  return { total: allVendors.length, bumped, errors };
}
