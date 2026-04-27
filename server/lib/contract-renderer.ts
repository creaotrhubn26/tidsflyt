import {
  computeQuote,
  loadPricingSettings,
  formatKr,
} from "./pricing-service";
import type { SalgContractTemplate } from "@shared/schema";

export interface RenderContractInput {
  template: SalgContractTemplate;
  userCount: number;
  customer: { name: string; orgNumber: string };
}

// Replaces all {{key}} placeholders in template body. Unknown placeholders
// are left untouched so admins can spot them while editing the template.
export async function renderContract(
  input: RenderContractInput,
): Promise<string> {
  const settings = await loadPricingSettings();
  const quote = await computeQuote(input.userCount);

  const placeholders: Record<string, string> = {
    leverandor_navn: settings.leverandorNavn || "",
    leverandor_org_nr: settings.leverandorOrgNr || "",
    leverandor_legal_email: settings.leverandorLegalEmail || "",
    leverandor_support_email: settings.leverandorSupportEmail || "",
    leverandor_support_phone: settings.leverandorSupportPhone || "",
    kunde_navn: input.customer.name || "",
    kunde_org_nr: input.customer.orgNumber || "",
    bruker_antall: String(input.userCount),
    tier_navn: quote.tier?.label ?? "—",
    tier_slug: quote.tier?.slug ?? "",
    pris_per_bruker_kr: formatKr(quote.pricePerUserMonthlyKr),
    aarlig_lisens_kr: formatKr(quote.annualTotalKr),
    onboarding_kr: formatKr(quote.onboardingKr),
    total_aar_1_kr: formatKr(quote.totalYearOneKr),
    binding_mnd: String(quote.bindingMonths),
    oppsigelse_mnd: String(settings.cancellationNoticeMonths),
    prisendring_dager: String(settings.priceChangeNoticeDays),
    flex_pris_kr: formatKr(Math.round(settings.flexUserPriceOre / 100)),
    flex_max_dager: String(settings.flexUserMaxActiveDays),
    sla_kritisk_timer: String(settings.slaCriticalResponseHours),
    sla_oppetid_pct: String(settings.slaUptimeTargetPct),
    valuta: settings.currency,
  };

  return input.template.bodyMd.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, key) => {
    const value = placeholders[key as string];
    return value !== undefined ? value : match;
  });
}
