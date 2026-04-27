/**
 * One-shot: sync alle pricing_tiers til Stripe Products + Prices.
 *
 *   DATABASE_URL=... npx tsx scripts/sync-stripe-products.ts
 *
 * Forutsetter at salg_settings.stripe_secret_key er satt.
 * Kjører ikke noen webserver — bare imports stripe-service og kjører.
 */

import { syncAllTiersToStripe } from "../server/lib/stripe-service";
import { pool } from "../server/db";

(async () => {
  try {
    console.log("→ Synker tiers til Stripe…");
    const result = await syncAllTiersToStripe();
    console.log("\n✅ Sync ferdig:");
    for (const r of result.results) {
      const created = Object.entries(r.created).filter(([, v]) => v).map(([k]) => k);
      console.log(`  • ${r.slug.padEnd(12)} → ${r.productId}`);
      console.log(`      monthly:    ${r.monthlyPriceId}`);
      console.log(`      annual:     ${r.annualPriceId}`);
      console.log(`      onboarding: ${r.onboardingPriceId ?? "(none)"}`);
      if (created.length) console.log(`      created:    ${created.join(", ")}`);
    }
    if (result.skipped.length) {
      console.log("\n⊘ Hoppet over:");
      for (const s of result.skipped) console.log(`  • ${s.slug}: ${s.reason}`);
    }
  } catch (err: any) {
    console.error("\n❌ Feilet:", err?.message ?? err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
