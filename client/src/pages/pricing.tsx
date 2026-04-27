import { useMemo, useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Info, Newspaper, Sparkles } from "lucide-react";
import { trackTidumPublicEvent } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { tidumPageStyles } from "@/lib/tidum-page-styles";
import { useSEO } from "@/hooks/use-seo";
import { usePublicLightTheme } from "@/hooks/use-public-light-theme";
import tidumWordmark from "@assets/tidum-wordmark.png";

interface PricingTier {
  id: number;
  slug: string;
  label: string;
  minUsers: number;
  maxUsers: number | null;
  pricePerUserOre: number;
  onboardingOre: number;
  bindingMonths: number;
  isEnterprise: boolean;
  description: string | null;
  inclusions: Array<{ id: number; slug: string; label: string }>;
}

interface PricingSettings {
  currency: string;
  sweetSpotUsers: number;
  sweetSpotLabel: string;
  minUsersFloor: number;
  maxUsersSlider: number;
  defaultBindingMonths: number;
}

interface PricingResponse {
  tiers: PricingTier[];
  settings: PricingSettings;
}

interface Quote {
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

function formatKr(n: number): string {
  return new Intl.NumberFormat("no-NO").format(Math.round(n));
}

function oreToKr(ore: number): number {
  return Math.round(ore / 100);
}

export default function Pricing() {
  usePublicLightTheme();

  useSEO({
    title: "Priser – Tidum",
    description:
      "Tidum SaaS-priser per bruker per måned. Volumrabatt fra 11 brukere. Faktureres årlig forskuddsvis.",
    canonical: "https://tidum.no/priser",
  });

  const { data, isLoading } = useQuery<PricingResponse>({
    queryKey: ["/api/pricing/tiers"],
  });

  // CMS-editable copy. Falls back to baked-in defaults if the CMS row
  // hasn't been created yet (admin can override at /admin/salg/sidetekster).
  const { data: cms } = useQuery<{
    title?: string;
    subtitle?: string;
    calculator_title?: string;
    calculator_user_label?: string;
    cta_request_access?: string;
    cta_enterprise?: string;
    cta_contact_sales?: string;
    footer_note?: string;
  }>({
    queryKey: ["/api/cms/pages/pricing"],
  });
  const copy = {
    title: cms?.title ?? "Priser",
    subtitle:
      cms?.subtitle ??
      "Per bruker per måned, fakturert årlig forskuddsvis. Større team får lavere pris per bruker. Velg antall ansatte under for å se hva det vil koste dere.",
    calculatorTitle: cms?.calculator_title ?? "Hva koster Tidum for dere?",
    calculatorUserLabel: cms?.calculator_user_label ?? "Antall brukere",
    ctaRequestAccess: cms?.cta_request_access ?? "Be om tilgang",
    ctaEnterprise: cms?.cta_enterprise ?? "Be om Enterprise-tilbud",
    ctaContactSales: cms?.cta_contact_sales ?? "Kontakt salg",
    footerNote:
      cms?.footer_note ??
      "Faktureres årlig forskuddsvis. Bindingstid fra første dag. Avtalen fornyes automatisk; oppsigelse må sendes skriftlig før utløp. Vikarer og sesongarbeidere kan dekkes som Flex-brukere uten å belaste tier-båndet.",
  };

  const settings = data?.settings;
  const tiers = data?.tiers ?? [];
  const sliderMin = settings?.minUsersFloor ?? 5;
  const sliderMax = settings?.maxUsersSlider ?? 200;
  const sweetSpot = settings?.sweetSpotUsers ?? 30;

  const [userCount, setUserCount] = useState<number>(sweetSpot);

  // GA4 / GTM: page view (the global pageview-tracker handles route changes,
  // but we send a richer view_item_list event with current pricing snapshot)
  useEffect(() => {
    if (!tiers.length) return;
    trackTidumPublicEvent("view_item_list", {
      item_list_id: "pricing_tiers",
      item_list_name: "Tidum pricing tiers",
      items: tiers.map((t, i) => ({
        item_id: t.slug,
        item_name: t.label,
        index: i,
        price: Math.round(t.pricePerUserOre / 100),
        item_category: t.isEnterprise ? "enterprise" : "standard",
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers.length]);

  // Throttled slider tracking — coalesces drag events to one event per 800ms
  // so we don't flood GA with every pixel of slider movement.
  const sliderTrackTimer = useRef<number | null>(null);
  const trackSliderChange = (value: number, tierSlug: string | null, annual: number) => {
    if (sliderTrackTimer.current != null) {
      window.clearTimeout(sliderTrackTimer.current);
    }
    sliderTrackTimer.current = window.setTimeout(() => {
      trackTidumPublicEvent("tidum_pricing_slider_change", {
        user_count: value,
        tier_slug: tierSlug,
        annual_total_kr: annual,
        is_sweet_spot: value === sweetSpot,
      });
    }, 800);
  };

  const quote: Quote | null = useMemo(() => {
    if (!tiers.length) return null;
    const tier = tiers.find((t) => {
      const inMin = userCount >= t.minUsers;
      const inMax = t.maxUsers == null || userCount <= t.maxUsers;
      return inMin && inMax;
    }) ?? null;
    if (!tier) return null;
    if (tier.isEnterprise) {
      return {
        userCount,
        tier,
        isEnterprise: true,
        isBelowFloor: false,
        isSweetSpot: false,
        pricePerUserMonthlyKr: 0,
        monthlyTotalKr: 0,
        annualTotalKr: 0,
        onboardingKr: 0,
        totalYearOneKr: 0,
        bindingMonths: tier.bindingMonths,
        currency: settings?.currency ?? "NOK",
        message: "Enterprise — kontakt oss for tilpasset tilbud.",
      };
    }
    const pricePerUserKr = oreToKr(tier.pricePerUserOre);
    const monthlyTotalKr = pricePerUserKr * userCount;
    const annualTotalKr = monthlyTotalKr * 12;
    const onboardingKr = oreToKr(tier.onboardingOre);
    return {
      userCount,
      tier,
      isEnterprise: false,
      isBelowFloor: userCount < (settings?.minUsersFloor ?? 5),
      isSweetSpot: userCount === sweetSpot,
      pricePerUserMonthlyKr: pricePerUserKr,
      monthlyTotalKr,
      annualTotalKr,
      onboardingKr,
      totalYearOneKr: annualTotalKr + onboardingKr,
      bindingMonths: tier.bindingMonths,
      currency: settings?.currency ?? "NOK",
      message: "",
    };
  }, [tiers, userCount, settings, sweetSpot]);

  return (
    <main className="tidum-page tidum-page--public">
      <style>{tidumPageStyles}</style>

      <div className="rt-container pb-16 pt-8">
        <section className="tidum-panel relative overflow-hidden rounded-[28px]">
          <div className="pointer-events-none absolute -left-16 top-[20%] h-36 w-96 rotate-[-14deg] rounded-[999px] bg-[rgba(131,171,145,0.2)]" />
          <div className="pointer-events-none absolute right-[-140px] top-14 h-80 w-[520px] rounded-[999px] bg-[rgba(194,205,195,0.24)]" />

          <header className="relative z-10 flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <Link href="/">
                <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto cursor-pointer sm:h-11" />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/blog" className="hidden items-center gap-2 text-sm font-medium text-[#294048] transition-colors hover:text-[var(--color-primary)] sm:inline-flex">
                <Newspaper className="h-4 w-4" />
                Blogg
              </Link>
              <Link href="/">
                <Button variant="outline" className="tidum-btn-secondary h-auto px-5 py-2.5 text-base font-medium">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Tilbake
                </Button>
              </Link>
            </div>
          </header>

          <div className="relative z-10 px-6 py-8 sm:px-8 sm:py-10">
            <h1 className="text-[clamp(2rem,3.7vw,3.1rem)] font-semibold tracking-tight text-[#0E4852]">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-2xl text-[clamp(1.05rem,1.45vw,1.3rem)] leading-relaxed text-[#2D3D43]">
              {copy.subtitle}
            </p>

            {isLoading ? (
              <div className="mt-10 text-center text-[#5B686B]">Laster priser…</div>
            ) : (
              <>
                {/* Quote calculator */}
                <Card className="mt-8 rounded-2xl border border-[#BFD7CC] bg-white/95 shadow-[0_8px_28px_rgba(22,43,49,0.06)]">
                  <CardHeader>
                    <CardTitle className="text-xl font-semibold text-[#15343D]">
                      {copy.calculatorTitle}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <div className="flex items-baseline justify-between">
                        <label className="text-sm font-medium text-[#223238]">
                          {copy.calculatorUserLabel}
                        </label>
                        <span className="text-3xl font-semibold tabular-nums text-[#0E4852]">
                          {userCount}
                        </span>
                      </div>
                      <Slider
                        value={[userCount]}
                        min={sliderMin}
                        max={sliderMax}
                        step={1}
                        onValueChange={(v) => {
                          setUserCount(v[0]);
                          trackSliderChange(v[0], quote?.tier?.slug ?? null, quote?.annualTotalKr ?? 0);
                        }}
                        className="mt-3"
                      />
                      <div className="mt-2 flex justify-between text-xs text-[#5B686B]">
                        <span>{sliderMin} brukere</span>
                        <span>{sliderMax}+ brukere</span>
                      </div>
                    </div>

                    {quote && (
                      <div className="rounded-2xl border border-[#1F6B73]/20 bg-[#F2F8F5] p-5">
                        {quote.isEnterprise ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[#1F6B73]">
                              <Sparkles className="h-5 w-5" />
                              <span className="font-semibold">Enterprise</span>
                            </div>
                            <p className="text-base text-[#203138]">
                              {userCount} brukere er Enterprise-segment. Ta kontakt for et tilpasset tilbud.
                            </p>
                            <Link href={`/kontakt?users=${userCount}`}>
                              <Button className="tidum-btn-primary mt-2"
                                onClick={() => trackTidumPublicEvent("tidum_pricing_cta_click", {
                                  cta: "enterprise_contact",
                                  user_count: userCount,
                                })}>
                                {copy.ctaEnterprise}
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        ) : (
                          <>
                            <div className="grid gap-4 sm:grid-cols-3">
                              <div>
                                <div className="text-xs uppercase tracking-wider text-[#5B686B]">
                                  Årlig lisens
                                </div>
                                <div className="mt-1 text-2xl font-semibold text-[#0E4852]">
                                  {formatKr(quote.annualTotalKr)} kr
                                </div>
                                {quote.isSweetSpot && (
                                  <Badge className="mt-1 bg-[#1F6B73]/15 text-[#1F6B73]">
                                    {settings?.sweetSpotLabel ?? "sweet spot"}
                                  </Badge>
                                )}
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wider text-[#5B686B]">
                                  Onboarding (år 1)
                                </div>
                                <div className="mt-1 text-2xl font-semibold text-[#0E4852]">
                                  {formatKr(quote.onboardingKr)} kr
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wider text-[#5B686B]">
                                  Totalt år 1
                                </div>
                                <div className="mt-1 text-2xl font-semibold text-[#0E4852]">
                                  {formatKr(quote.totalYearOneKr)} kr
                                </div>
                              </div>
                            </div>
                            <p className="mt-4 text-sm text-[#5B686B]">
                              {quote.tier?.label} — bindingstid {quote.bindingMonths} måneder.
                            </p>
                            <Link href={`/kontakt?users=${userCount}`}>
                              <Button className="tidum-btn-primary mt-4"
                                onClick={() => trackTidumPublicEvent("tidum_pricing_cta_click", {
                                  cta: "request_access_quote",
                                  user_count: userCount,
                                  tier_slug: quote.tier?.slug,
                                  annual_total_kr: quote.annualTotalKr,
                                })}>
                                {copy.ctaRequestAccess}
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            </Link>
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tier table */}
                <div className="mt-10 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {tiers.map((t) => (
                    <Card
                      key={t.id}
                      className={`rounded-2xl border bg-white/95 shadow-[0_8px_28px_rgba(22,43,49,0.06)] ${
                        userCount >= t.minUsers && (t.maxUsers == null || userCount <= t.maxUsers)
                          ? "border-[#1F6B73] ring-2 ring-[#1F6B73]/20"
                          : "border-[#BFD7CC]"
                      }`}
                    >
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#15343D]">
                          {t.label}
                          {t.isEnterprise && (
                            <Badge className="bg-[#1F6B73]/15 text-[#1F6B73]">Custom</Badge>
                          )}
                        </CardTitle>
                        {t.description && (
                          <p className="text-sm text-[#5B686B]">{t.description}</p>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          {t.isEnterprise ? (
                            <div>
                              <span className="text-3xl font-semibold text-[#0E4852]">
                                Tilpasset
                              </span>
                              <span className="ml-2 text-sm text-[#5B686B]">tilbud</span>
                            </div>
                          ) : (
                            <div>
                              <span className="text-3xl font-semibold text-[#0E4852]">
                                {formatKr(oreToKr(t.pricePerUserOre))}
                              </span>
                              <span className="ml-2 text-sm text-[#5B686B]">
                                kr / bruker / mnd
                              </span>
                            </div>
                          )}
                          <div className="mt-1 text-xs text-[#5B686B]">
                            {t.maxUsers
                              ? `${t.minUsers}–${t.maxUsers} brukere`
                              : `${t.minUsers}+ brukere`}
                            {!t.isEnterprise &&
                              ` • Onboarding ${formatKr(oreToKr(t.onboardingOre))} kr`}
                          </div>
                        </div>

                        <ul className="space-y-2">
                          {t.inclusions.map((inc) => (
                            <li
                              key={inc.id}
                              className="flex items-start gap-2 text-sm text-[#203138]"
                            >
                              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1F6B73]" />
                              <span>{inc.label}</span>
                            </li>
                          ))}
                        </ul>

                        <Link href={`/kontakt?users=${Math.max(t.minUsers, sliderMin)}`}>
                          <Button variant="outline" className="tidum-btn-secondary w-full"
                            onClick={() => trackTidumPublicEvent("tidum_pricing_tier_click", {
                              tier_slug: t.slug,
                              tier_label: t.label,
                              suggested_user_count: Math.max(t.minUsers, sliderMin),
                            })}>
                            {t.isEnterprise ? copy.ctaContactSales : copy.ctaRequestAccess}
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="mt-10 flex items-start gap-3 rounded-2xl border border-[#1F6B73]/15 bg-[#1F6B73]/5 p-5 text-sm leading-relaxed text-[#20434A]">
                  <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#1F6B73]" />
                  <div>
                    {copy.footerNote}{" "}
                    <Link href="/kontakt" className="underline">Kontakt oss</Link>.
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <footer className="mt-8 border-t border-[var(--color-border)] pt-6 text-sm text-[#5B686B]">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/personvern" className="transition-colors hover:text-[#1F6B73]">
              Personvern
            </Link>
            <Link href="/vilkar" className="transition-colors hover:text-[#1F6B73]">
              Vilkår
            </Link>
          </div>
          <p className="mt-4 text-center">© 2025 Tidum. Driftet av Creatorhub AS.</p>
        </footer>
      </div>
    </main>
  );
}
