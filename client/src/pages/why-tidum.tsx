import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { tidumPageStyles } from "@/lib/tidum-page-styles";
import { useSEO } from "@/hooks/use-seo";
import { 
  ArrowRight, 
  Clock, 
  Shield, 
  Users, 
  BarChart3, 
  Zap, 
  CheckCircle,
  CheckCircle2,
  Building,
  Globe,
  Lock,
  Smartphone,
  TrendingUp,
  Award,
  Heart,
  ChevronRight,
  ClipboardList,
  LucideIcon
} from "lucide-react";
import tidumWordmark from "@assets/tidum-wordmark.png";

const iconMap: Record<string, LucideIcon> = {
  Clock,
  Shield,
  Users,
  BarChart3,
  Zap,
  Building,
  Globe,
  Lock,
  Smartphone,
  TrendingUp,
  Award,
  Heart,
  CheckCircle
};

const defaultBenefits = [
  {
    icon: "Clock",
    title: "Spar tid hver dag",
    description: "Automatisk tidsregistrering med smarte påminnelser gjør at du aldri glemmer å føre timer. Spar opptil 30 minutter per ansatt per dag."
  },
  {
    icon: "Shield",
    title: "GDPR-kompatibel",
    description: "Dine data er trygge hos oss. Vi følger alle norske og europeiske personvernregler, med sikker lagring i Norge."
  },
  {
    icon: "Users",
    title: "Enkel brukeradministrasjon",
    description: "Legg til ansatte med et klikk. Automatisk tilordning basert på e-postdomene gjør onboarding sømløs."
  },
  {
    icon: "BarChart3",
    title: "Kraftige rapporter",
    description: "Få full oversikt over arbeidstimer, prosjekter og kostnader. Eksporter til Excel eller PDF med ett klikk."
  },
  {
    icon: "Zap",
    title: "Rask implementering",
    description: "Kom i gang på minutter, ikke uker. Ingen komplisert oppsett eller IT-avdeling nødvendig."
  },
  {
    icon: "Building",
    title: "Skreddersydd for norske bedrifter",
    description: "Norske helligdager, ferieregler og arbeidsmiljøloven er allerede innebygd. Vi forstår dine behov."
  }
];

const defaultFeatures = [
  {
    icon: "Smartphone",
    title: "Fungerer overalt",
    description: "Bruk Tidum på mobil, nettbrett eller PC. Synkronisert i sanntid."
  },
  {
    icon: "Lock",
    title: "Sikker pålogging",
    description: "Logg inn med Google eller Apple. Ingen passord å huske."
  },
  {
    icon: "Globe",
    title: "Tilgjengelig 24/7",
    description: "Skybasert løsning som alltid er tilgjengelig når du trenger den."
  },
  {
    icon: "TrendingUp",
    title: "Vokser med bedriften",
    description: "Fra 2 til 2000 ansatte - Tidum skalerer med dine behov."
  }
];

const defaultStats = [
  { value: "98%", label: "Kundetilfredshet" },
  { value: "30 min", label: "Spart per dag" },
  { value: "500+", label: "Norske bedrifter" },
  { value: "99.9%", label: "Oppetid" }
];

const defaultHero = {
  title: "Hvorfor velge",
  title_highlight: "Tidum",
  subtitle: "Tidum er bygget for norske bedrifter som ønsker enkel, sikker og effektiv tidsregistrering - uten kompleksitet.",
  cta_primary_text: "Prøv gratis",
  cta_primary_url: "/login",
  cta_secondary_text: "Snakk med oss",
  cta_secondary_url: "/kontakt"
};

const defaultNordicContent = {
  title: "Bygget for norske forhold",
  subtitle: "Tidum er utviklet spesielt for norske bedrifter - med full forståelse for norsk arbeidsliv, lovverk og kultur.",
  bullet_points: [
    "Norske helligdager og røde dager innebygd",
    "Støtte for norsk ferielov og avspasering",
    "Integrasjon med norske regnskapssystemer",
    "Norsk kundesupport fra Oslo",
    "Data lagret sikkert i Norge"
  ]
};

const defaultTrustContent = {
  title: "Anbefalt av norske tiltaksbedrifter",
  subtitle: "Norske tiltaksbedrifter bruker Tidum til å effektivisere sin tidsregistrering. Fra barnevern og miljøarbeid til familietiltak - alle finner verdi i vår løsning."
};

const defaultCtaContent = {
  cta_title: "Klar til å komme i gang?",
  cta_subtitle: "Start din gratis prøveperiode i dag. Ingen kredittkort nødvendig.",
  cta_button_text: "Start gratis prøveperiode",
  cta_button_url: "/login"
};

interface WhyPageData {
  hero: typeof defaultHero | null;
  stats: typeof defaultStats;
  benefits: typeof defaultBenefits;
  features: typeof defaultFeatures;
  nordic: typeof defaultNordicContent | null;
  trust: typeof defaultTrustContent | null;
  cta: typeof defaultCtaContent | null;
}

interface FeedbackStats {
  hasData: boolean;
  satisfactionPercentage: number | null;
  avgRating: string;
  totalResponses: number;
  vendorCount: number;
  uniqueRespondingVendors: number;
  uniqueRespondingUsers: number;
}

export default function WhyTidum() {
  const [, setLocation] = useLocation();

  useSEO({
    title: "Hvorfor Tidum? – Fordeler og funksjoner",
    description: "Oppdag hvorfor norske bedrifter velger Tidum for timeføring. Brukervennlig, GDPR-kompatibel, og bygget for norske arbeidsforhold.",
    canonical: "https://tidum.no/hvorfor",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Hvorfor Tidum?",
      url: "https://tidum.no/hvorfor",
      description: "Fordeler og funksjoner i Tidum timeføringsløsning",
      isPartOf: { "@type": "WebSite", name: "Tidum", url: "https://tidum.no" },
    },
  });

  const { data, isLoading } = useQuery<WhyPageData>({
    queryKey: ["/api/cms/why-page"]
  });

  const { data: feedbackStats } = useQuery<FeedbackStats>({
    queryKey: ["/api/feedback/stats"]
  });

  const hero = data?.hero || defaultHero;
  const benefits = data?.benefits?.length ? data.benefits : defaultBenefits;
  const features = data?.features?.length ? data.features : defaultFeatures;
  const nordic = data?.nordic || defaultNordicContent;
  const trust = data?.trust || defaultTrustContent;
  const cta = data?.cta || defaultCtaContent;

  const hasRealFeedbackData = feedbackStats?.hasData && feedbackStats.satisfactionPercentage !== null;
  
  const getDynamicStats = () => {
    if (hasRealFeedbackData) {
      return [
        { value: `${feedbackStats.satisfactionPercentage}%`, label: "Kundetilfredshet" },
        { value: "30 min", label: "Spart per dag" },
        { value: feedbackStats.vendorCount > 0 ? `${feedbackStats.vendorCount}+` : "Mange", label: "Norske bedrifter" },
        { value: "99.9%", label: "Oppetid" }
      ];
    }
    return null;
  };

  const stats = getDynamicStats();

  const getBulletPoints = () => {
    if (nordic.bullet_points && Array.isArray(nordic.bullet_points)) {
      return nordic.bullet_points;
    }
    return defaultNordicContent.bullet_points;
  };

  const getDynamicTrustSubtitle = () => {
    if (hasRealFeedbackData && feedbackStats.vendorCount > 0) {
      return `Over ${feedbackStats.vendorCount} norske tiltaksbedrifter bruker Tidum til å effektivisere sin tidsregistrering. Fra barnevern og miljøarbeid til familietiltak - alle finner verdi i vår løsning.`;
    }
    return trust.subtitle;
  };

  const goToContact = () => setLocation("/kontakt");

  if (isLoading) {
    return (
      <main className="tidum-page">
        <style>{tidumPageStyles}</style>
        <div className="rt-container pb-20 pt-8">
          <div className="tidum-panel rounded-[28px] p-6 sm:p-8">
            <Skeleton className="h-12 w-64 mx-auto" />
            <Skeleton className="h-6 w-96 mx-auto mt-4" />
            <div className="grid md:grid-cols-3 gap-6 mt-8">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="tidum-page">
      <style>{tidumPageStyles}</style>

      <div className="rt-container pb-20 pt-8">
        {/* ── Hero Section ── */}
        <section className="tidum-panel tidum-fade-up relative overflow-hidden rounded-[28px]">
          <div className="pointer-events-none absolute -left-16 top-[34%] h-36 w-96 rotate-[-14deg] rounded-[999px] bg-[rgba(131,171,145,0.2)]" />
          <div className="pointer-events-none absolute right-[-140px] top-14 h-80 w-[520px] rounded-[999px] bg-[rgba(194,205,195,0.24)]" />

          <header className="relative z-10 flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <Link href="/">
                <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto sm:h-11 cursor-pointer" />
              </Link>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <Link href="/" className="hidden items-center gap-2 text-base text-[#26373C] transition-colors hover:text-[var(--color-primary)] sm:inline-flex">
                <ClipboardList className="h-4 w-4" />
                Forside
              </Link>
              <Button
                onClick={goToContact}
                className="tidum-btn-primary inline-flex h-auto items-center px-6 py-3 text-base font-semibold"
              >
                Be om demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </header>

          <div className="relative z-10 px-6 py-12 sm:px-8 sm:py-16 text-center max-w-4xl mx-auto">
            <h1 className="tidum-title" data-testid="text-why-title">
              {hero.title}{" "}
              <span className="text-[var(--color-primary)]">{hero.title_highlight}?</span>
            </h1>
            <p className="tidum-text mt-6 max-w-2xl mx-auto" data-testid="text-why-subtitle">
              {hero.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 sm:gap-4">
              <Link href={hero.cta_primary_url || "/kontakt"}>
                <Button className="tidum-btn-primary h-auto px-6 py-3 text-lg font-semibold" data-testid="button-try-free">
                  {hero.cta_primary_text}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href={hero.cta_secondary_url || "/kontakt"}>
                <Button variant="outline" className="tidum-btn-secondary h-auto px-6 py-3 text-lg font-medium" data-testid="button-contact-sales">
                  {hero.cta_secondary_text}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── Stats Section ── */}
        {stats && (
          <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              {stats.map((stat: any, index: number) => (
                <div key={index} className="text-center" data-testid={`stat-${index}`}>
                  <div className="text-3xl md:text-4xl font-bold text-[var(--color-primary)] mb-2">{stat.value}</div>
                  <div className="text-sm text-[var(--color-text-muted)]">{stat.label}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Benefits Section ── */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-section)] p-6 sm:p-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] sm:text-4xl" data-testid="text-benefits-title">
              Fordeler med Tidum
            </h2>
            <p className="mt-3 max-w-2xl mx-auto text-[var(--color-text-muted)]">
              Vi har bygget Tidum fra bunnen av for å løse de vanligste utfordringene norske bedrifter har med tidsregistrering.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
            {benefits.map((benefit: any, index: number) => {
              const IconComponent = iconMap[benefit.icon] || Clock;
              return (
                <Card key={index} className="rounded-2xl border-[var(--color-border)] bg-white/95 shadow-[0_8px_28px_rgba(22,43,49,0.06)]" data-testid={`card-benefit-${index}`}>
                  <CardContent className="p-6 sm:p-7">
                    <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#E7F3EE]">
                      <IconComponent className="h-6 w-6 text-[#3A8B73]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#1D2C31] mb-2">{benefit.title}</h3>
                    <p className="text-sm text-[var(--color-text-muted)]">{benefit.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ── Nordic + Features Section ── */}
        <section className="tidum-fade-up mt-12 grid gap-5 lg:grid-cols-2 lg:items-stretch">
          <Card className="h-full rounded-2xl border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(243,247,245,0.9))]">
            <CardContent className="flex h-full flex-col p-6 sm:p-7">
              <div className="min-h-[80px]">
                <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] sm:text-4xl" data-testid="text-nordic-title">
                  {nordic.title}
                </h2>
                <p className="mt-3 text-[var(--color-text-muted)]">
                  {nordic.subtitle}
                </p>
              </div>
              <div className="mt-6 grid gap-3">
                {getBulletPoints().map((item: string, index: number) => (
                  <div key={index} className="flex rounded-xl border border-[var(--color-border)] bg-white/90 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-[#E7F3EE] p-2">
                        <CheckCircle className="h-4 w-4 text-[var(--color-primary)]" />
                      </div>
                      <span className="text-[#2E3D43] pt-1.5">{item}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="h-full rounded-2xl border-[var(--color-border)] bg-white/95 shadow-[0_8px_28px_rgba(22,43,49,0.06)]">
            <CardContent className="flex h-full flex-col p-6 sm:p-7">
              <div className="min-h-[80px]">
                <h3 className="text-2xl font-semibold tracking-tight text-[#15343D]">Funksjoner som gjør forskjellen</h3>
                <p className="mt-2 text-[var(--color-text-muted)]">
                  Alt du trenger, tilgjengelig overalt.
                </p>
              </div>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {features.map((feature: any, index: number) => {
                  const IconComponent = iconMap[feature.icon] || Smartphone;
                  return (
                    <div key={index} className="flex rounded-xl border border-[var(--color-border)] bg-[#F7FAF9] px-4 py-3" data-testid={`card-feature-${index}`}>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-lg bg-[#E7F3EE] p-2">
                          <IconComponent className="h-4 w-4 text-[var(--color-primary)]" />
                        </div>
                        <div>
                          <p className="font-semibold text-[#1D2C31]">{feature.title}</p>
                          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{feature.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Trust Section ── */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8">
          <div className="grid gap-6 md:grid-cols-2 md:items-center">
            <div>
              <Award className="h-10 w-10 text-[var(--color-primary)] mb-4" />
              <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] sm:text-4xl" data-testid="text-trust-title">
                {trust.title}
              </h2>
              <p className="mt-4 text-[var(--color-text-muted)]">
                {getDynamicTrustSubtitle()}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[#F7FAF9] px-3 py-1.5 text-sm text-[var(--color-text-muted)]">
                <Heart className="h-4 w-4 text-red-500" />
                <span>Utviklet i Norge</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { title: "Tiltaksbedrifter", detail: "Barnevern, miljøarbeid og familievern." },
                { title: "Kommuner", detail: "Offentlig sektor og helsetjenester." },
                { title: "Konsulenter", detail: "Feltarbeidere og turnusansatte." },
                { title: "Alle bransjer", detail: "Skalerer fra 2 til 2000 ansatte." },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-secondary)]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1F3136]">{item.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Section ── */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[#1a5d65] bg-[var(--color-primary)] px-6 py-10 text-white sm:px-8">
          <h2 className="text-center text-[clamp(28px,4vw,42px)] font-semibold tracking-tight">
            {cta.cta_title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-white/85">
            {cta.cta_subtitle}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href={cta.cta_button_url || "/kontakt"}>
              <Button className="h-auto rounded-xl bg-white px-6 py-3 text-[var(--color-primary)] hover:bg-white/90" data-testid="button-cta-start">
                {cta.cta_button_text}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/kontakt">
              <Button
                variant="outline"
                className="h-auto rounded-xl border-white/70 px-6 py-3 text-white hover:bg-white/10"
                data-testid="button-cta-demo"
              >
                Bestill en demo
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="tidum-fade-up mt-10 rounded-3xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,246,0.92))] px-6 py-8 sm:px-8">
          <div className="grid gap-8 md:grid-cols-[1.2fr,0.9fr,1fr]">
            <div>
              <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto" />
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
                Arbeidstidssystem for felt, turnus og norsk dokumentasjonskrav.
              </p>
              <button
                type="button"
                onClick={goToContact}
                className="mt-3 text-sm font-medium text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]"
              >
                kontakt@tidum.no
              </button>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Snarveier</p>
              <div className="mt-3 grid gap-2 text-sm">
                <Link href="/" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Forside
                </Link>
                <Link href="/kontakt" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Kontakt oss
                </Link>
                <Link href="/personvern" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Personvern
                </Link>
                <Link href="/vilkar" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Vilkår
                </Link>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Trygghet</p>
              <div className="mt-3 grid gap-2">
                {[
                  "Bygget for norsk arbeidsliv",
                  "Personvern først",
                  "Klar for dokumentasjonskrav",
                ].map((item) => (
                  <div key={item} className="inline-flex items-start gap-2 rounded-lg bg-white/75 px-3 py-2 text-sm text-[#2B3C41]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-secondary)]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-text-muted)]">
            <p>© {new Date().getFullYear()} Tidum. Alle rettigheter reservert.</p>
            <p>Enkel registrering. Trygg dokumentasjon. Full oversikt.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}

