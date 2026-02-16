import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, 
  Clock, 
  Shield, 
  Users, 
  BarChart3, 
  Zap, 
  CheckCircle,
  Building,
  Globe,
  Lock,
  Smartphone,
  TrendingUp,
  Award,
  Heart,
  ArrowRight,
  LucideIcon
} from "lucide-react";
import { SmartTimingLogo } from "@/components/smart-timing-logo";
import { ThemeToggle } from "@/components/theme-toggle";

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

  // Only show stats if we have real feedback data
  const hasRealFeedbackData = feedbackStats?.hasData && feedbackStats.satisfactionPercentage !== null;
  
  const getDynamicStats = () => {
    if (hasRealFeedbackData) {
      return [
        { 
          value: `${feedbackStats.satisfactionPercentage}%`, 
          label: "Kundetilfredshet" 
        },
        { value: "30 min", label: "Spart per dag" },
        { 
          value: feedbackStats.vendorCount > 0 ? `${feedbackStats.vendorCount}+` : "Mange", 
          label: "Norske bedrifter" 
        },
        { value: "99.9%", label: "Oppetid" }
      ];
    }
    return null; // Don't show stats when no real data
  };

  const stats = getDynamicStats();

  const getBulletPoints = () => {
    if (nordic.bullet_points && Array.isArray(nordic.bullet_points)) {
      return nordic.bullet_points;
    }
    return defaultNordicContent.bullet_points;
  };

  // Dynamic trust subtitle based on real vendor count
  const getDynamicTrustSubtitle = () => {
    if (hasRealFeedbackData && feedbackStats.vendorCount > 0) {
      return `Over ${feedbackStats.vendorCount} norske tiltaksbedrifter bruker Tidum til å effektivisere sin tidsregistrering. Fra barnevern og miljøarbeid til familietiltak - alle finner verdi i vår løsning.`;
    }
    return trust.subtitle;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
          <div className="rt-container py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Tilbake
                </Button>
              </Link>
              <SmartTimingLogo />
            </div>
            <ThemeToggle />
          </div>
        </header>
        <div className="rt-container py-16 space-y-8">
          <Skeleton className="h-12 w-64 mx-auto" />
          <Skeleton className="h-6 w-96 mx-auto" />
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="rt-container py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Tilbake
              </Button>
            </Link>
            <SmartTimingLogo />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main>
        <section className="py-16 md:py-24 bg-gradient-to-b from-primary/5 to-background">
          <div className="rt-container text-center max-w-4xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6" data-testid="text-why-title">
              {hero.title} <span className="text-primary">{hero.title_highlight}?</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-why-subtitle">
              {hero.subtitle}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href={hero.cta_primary_url || "/login"}>
                <Button size="lg" data-testid="button-try-free">
                  {hero.cta_primary_text}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <Link href={hero.cta_secondary_url || "/kontakt"}>
                <Button variant="outline" size="lg" data-testid="button-contact-sales">
                  {hero.cta_secondary_text}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {stats && (
          <section className="py-16 border-b">
            <div className="rt-container">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
                {stats.map((stat: any, index: number) => (
                  <div key={index} className="text-center" data-testid={`stat-${index}`}>
                    <div className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="py-16 md:py-24">
          <div className="rt-container">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4" data-testid="text-benefits-title">
                Fordeler med Tidum
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Vi har bygget Tidum fra bunnen av for å løse de vanligste utfordringene norske bedrifter har med tidsregistrering.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {benefits.map((benefit: any, index: number) => {
                const IconComponent = iconMap[benefit.icon] || Clock;
                return (
                  <Card key={index} className="hover-elevate" data-testid={`card-benefit-${index}`}>
                    <CardContent className="p-6">
                      <div className="p-3 rounded-lg bg-primary/10 w-fit mb-4">
                        <IconComponent className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">{benefit.title}</h3>
                      <p className="text-muted-foreground text-sm">{benefit.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24 bg-muted/50">
          <div className="rt-container">
            <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
              <div>
                <h2 className="text-3xl font-bold mb-6" data-testid="text-nordic-title">
                  {nordic.title}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {nordic.subtitle}
                </p>
                <ul className="space-y-4">
                  {getBulletPoints().map((item: string, index: number) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {features.map((feature: any, index: number) => {
                  const IconComponent = iconMap[feature.icon] || Smartphone;
                  return (
                    <Card key={index} data-testid={`card-feature-${index}`}>
                      <CardContent className="p-4">
                        <IconComponent className="h-8 w-8 text-primary mb-3" />
                        <h3 className="font-semibold mb-1">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="rt-container text-center max-w-3xl">
            <Award className="h-12 w-12 text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4" data-testid="text-trust-title">
              {trust.title}
            </h2>
            <p className="text-muted-foreground mb-8">
              {getDynamicTrustSubtitle()}
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Heart className="h-4 w-4 text-red-500" />
              <span>Utviklet i Norge</span>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24 bg-primary text-primary-foreground">
          <div className="rt-container text-center max-w-3xl">
            <h2 className="text-3xl font-bold mb-4">
              {cta.cta_title}
            </h2>
            <p className="text-primary-foreground/80 mb-8">
              {cta.cta_subtitle}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href={cta.cta_button_url || "/login"}>
                <Button size="lg" variant="secondary" data-testid="button-cta-start">
                  {cta.cta_button_text}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <Link href="/kontakt">
                <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-cta-demo">
                  Bestill en demo
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="rt-container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <Link href="/personvern" className="text-sm text-muted-foreground hover:text-foreground">
                Personvern
              </Link>
              <Link href="/vilkar" className="text-sm text-muted-foreground hover:text-foreground">
                Vilkår
              </Link>
              <Link href="/kontakt" className="text-sm text-muted-foreground hover:text-foreground">
                Kontakt
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 Tidum. Alle rettigheter reservert.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
