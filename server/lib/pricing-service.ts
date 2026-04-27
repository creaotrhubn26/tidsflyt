import { eq, and, asc } from "drizzle-orm";
import { db } from "../db";
import {
  pricingTiers,
  pricingInclusions,
  pricingTierInclusions,
  salgSettings,
  type PricingTier,
  type PricingInclusion,
} from "@shared/schema";

export interface PricingSettings {
  currency: string;
  sweetSpotUsers: number;
  sweetSpotLabel: string;
  minUsersFloor: number;
  maxUsersSlider: number;
  flexUserPriceOre: number;
  flexUserMaxActiveDays: number;
  defaultBindingMonths: number;
  cancellationNoticeMonths: number;
  priceChangeNoticeDays: number;
  leverandorNavn: string;
  leverandorOrgNr: string;
  leverandorLegalEmail: string;
  leverandorSupportEmail: string;
  leverandorSupportPhone: string;
  slaUptimeTargetPct: number;
  slaCriticalResponseHours: number;
}

export interface TierWithInclusions extends PricingTier {
  inclusions: PricingInclusion[];
}

export interface PricingQuote {
  userCount: number;
  tier: PricingTier | null;
  isEnterprise: boolean;
  isBelowFloor: boolean;
  isSweetSpot: boolean;
  pricePerUserMonthlyKr: number;
  monthlyTotalKr: number;
  annualTotalKr: number;
  onboardingKr: number;
  totalYearOneKr: number;
  bindingMonths: number;
  currency: string;
  message: string;
}

const SETTING_DEFAULTS: PricingSettings = {
  currency: "NOK",
  sweetSpotUsers: 30,
  sweetSpotLabel: "sweet spot",
  minUsersFloor: 5,
  maxUsersSlider: 200,
  flexUserPriceOre: 3000,
  flexUserMaxActiveDays: 90,
  defaultBindingMonths: 12,
  cancellationNoticeMonths: 3,
  priceChangeNoticeDays: 90,
  leverandorNavn: "Creatorhub AS",
  leverandorOrgNr: "",
  leverandorLegalEmail: "",
  leverandorSupportEmail: "",
  leverandorSupportPhone: "",
  slaUptimeTargetPct: 99.5,
  slaCriticalResponseHours: 4,
};

function coerceSetting(raw: string | null | undefined, dataType: string): unknown {
  if (raw == null || raw === "") return null;
  switch (dataType) {
    case "number":
      return Number(raw);
    case "boolean":
      return raw === "true" || raw === "1";
    case "json":
      try { return JSON.parse(raw); } catch { return null; }
    default:
      return raw;
  }
}

export async function loadSalgSettings(): Promise<Record<string, unknown>> {
  const rows = await db.select().from(salgSettings);
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    out[r.key] = coerceSetting(r.value, r.dataType);
  }
  return out;
}

export async function loadPricingSettings(): Promise<PricingSettings> {
  const raw = await loadSalgSettings();
  const merged: PricingSettings = { ...SETTING_DEFAULTS };
  const map: Array<[keyof PricingSettings, string]> = [
    ["currency",                    "currency"],
    ["sweetSpotUsers",              "sweet_spot_users"],
    ["sweetSpotLabel",              "sweet_spot_label"],
    ["minUsersFloor",               "min_users_floor"],
    ["maxUsersSlider",              "max_users_slider"],
    ["flexUserPriceOre",            "flex_user_price_ore"],
    ["flexUserMaxActiveDays",       "flex_user_max_active_days"],
    ["defaultBindingMonths",        "default_binding_months"],
    ["cancellationNoticeMonths",    "cancellation_notice_months"],
    ["priceChangeNoticeDays",       "price_change_notice_days"],
    ["leverandorNavn",              "leverandor_navn"],
    ["leverandorOrgNr",             "leverandor_org_nr"],
    ["leverandorLegalEmail",        "leverandor_legal_email"],
    ["leverandorSupportEmail",      "leverandor_support_email"],
    ["leverandorSupportPhone",      "leverandor_support_phone"],
    ["slaUptimeTargetPct",          "sla_uptime_target_pct"],
    ["slaCriticalResponseHours",    "sla_critical_response_hours"],
  ];
  for (const [k, key] of map) {
    if (raw[key] != null) {
      (merged as any)[k] = raw[key];
    }
  }
  return merged;
}

export async function loadActiveTiers(): Promise<PricingTier[]> {
  return db
    .select()
    .from(pricingTiers)
    .where(eq(pricingTiers.isActive, true))
    .orderBy(asc(pricingTiers.sortOrder), asc(pricingTiers.minUsers));
}

export async function loadActiveTiersWithInclusions(): Promise<TierWithInclusions[]> {
  const tiers = await loadActiveTiers();
  if (tiers.length === 0) return [];

  const inclusions = await db
    .select()
    .from(pricingInclusions)
    .where(eq(pricingInclusions.isActive, true))
    .orderBy(asc(pricingInclusions.sortOrder));
  const inclusionById = new Map(inclusions.map((i) => [i.id, i]));

  const links = await db.select().from(pricingTierInclusions);
  const byTier = new Map<number, PricingInclusion[]>();
  for (const link of links) {
    const inc = inclusionById.get(link.inclusionId);
    if (!inc) continue;
    if (!byTier.has(link.tierId)) byTier.set(link.tierId, []);
    byTier.get(link.tierId)!.push(inc);
  }

  return tiers.map((t) => ({
    ...t,
    inclusions: (byTier.get(t.id) || []).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    ),
  }));
}

export function findTierForUserCount(
  userCount: number,
  tiers: PricingTier[],
): PricingTier | null {
  // Tiers expected sorted ASC by min_users. Pick first whose band contains userCount.
  for (const t of tiers) {
    const inMin = userCount >= t.minUsers;
    const inMax = t.maxUsers == null || userCount <= t.maxUsers;
    if (inMin && inMax) return t;
  }
  return null;
}

export function oreToKr(ore: number): number {
  return Math.round(ore / 100);
}

export async function computeQuote(
  rawUserCount: number,
): Promise<PricingQuote> {
  const settings = await loadPricingSettings();
  const tiers = await loadActiveTiers();

  const userCount = Math.max(0, Math.floor(rawUserCount || 0));
  const isBelowFloor = userCount > 0 && userCount < settings.minUsersFloor;
  const tier = findTierForUserCount(userCount, tiers);

  if (!tier || tier.isEnterprise) {
    const isEnterprise = !!tier?.isEnterprise;
    return {
      userCount,
      tier,
      isEnterprise,
      isBelowFloor,
      isSweetSpot: false,
      pricePerUserMonthlyKr: 0,
      monthlyTotalKr: 0,
      annualTotalKr: 0,
      onboardingKr: 0,
      totalYearOneKr: 0,
      bindingMonths: tier?.bindingMonths ?? settings.defaultBindingMonths,
      currency: settings.currency,
      message: isEnterprise
        ? "Enterprise — kontakt oss for tilpasset tilbud."
        : isBelowFloor
        ? `Minimum ${settings.minUsersFloor} brukere. Velg ${settings.minUsersFloor} eller flere.`
        : "Velg antall brukere for å se pris.",
    };
  }

  const pricePerUserMonthlyKr = oreToKr(tier.pricePerUserOre);
  const monthlyTotalKr = pricePerUserMonthlyKr * userCount;
  const annualTotalKr = monthlyTotalKr * 12;
  const onboardingKr = oreToKr(tier.onboardingOre);
  const totalYearOneKr = annualTotalKr + onboardingKr;
  const isSweetSpot = userCount === settings.sweetSpotUsers;

  return {
    userCount,
    tier,
    isEnterprise: false,
    isBelowFloor: false,
    isSweetSpot,
    pricePerUserMonthlyKr,
    monthlyTotalKr,
    annualTotalKr,
    onboardingKr,
    totalYearOneKr,
    bindingMonths: tier.bindingMonths,
    currency: settings.currency,
    message: isSweetSpot
      ? `For ${userCount} brukere ligger Tidum på ca ${formatKr(annualTotalKr)} kr/år (${settings.sweetSpotLabel}). Inkludert onboarding første år: ${formatKr(totalYearOneKr)} kr.`
      : `For ${userCount} brukere ligger Tidum på ca ${formatKr(annualTotalKr)} kr/år. Inkludert onboarding første år: ${formatKr(totalYearOneKr)} kr.`,
  };
}

export function formatKr(n: number): string {
  // Norwegian thousand-separator (non-breaking space)
  return new Intl.NumberFormat("no-NO").format(Math.round(n));
}
