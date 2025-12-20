import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  ArrowRight
} from "lucide-react";
import { SmartTimingLogo } from "@/components/smart-timing-logo";
import { ThemeToggle } from "@/components/theme-toggle";

const benefits = [
  {
    icon: Clock,
    title: "Spar tid hver dag",
    description: "Automatisk tidsregistrering med smarte påminnelser gjør at du aldri glemmer å føre timer. Spar opptil 30 minutter per ansatt per dag."
  },
  {
    icon: Shield,
    title: "GDPR-kompatibel",
    description: "Dine data er trygge hos oss. Vi følger alle norske og europeiske personvernregler, med sikker lagring i Norge."
  },
  {
    icon: Users,
    title: "Enkel brukeradministrasjon",
    description: "Legg til ansatte med et klikk. Automatisk tilordning basert på e-postdomene gjør onboarding sømløs."
  },
  {
    icon: BarChart3,
    title: "Kraftige rapporter",
    description: "Få full oversikt over arbeidstimer, prosjekter og kostnader. Eksporter til Excel eller PDF med ett klikk."
  },
  {
    icon: Zap,
    title: "Rask implementering",
    description: "Kom i gang på minutter, ikke uker. Ingen komplisert oppsett eller IT-avdeling nødvendig."
  },
  {
    icon: Building,
    title: "Skreddersydd for norske bedrifter",
    description: "Norske helligdager, ferieregler og arbeidsmiljøloven er allerede innebygd. Vi forstår dine behov."
  }
];

const features = [
  {
    icon: Smartphone,
    title: "Fungerer overalt",
    description: "Bruk Tidsflyt på mobil, nettbrett eller PC. Synkronisert i sanntid."
  },
  {
    icon: Lock,
    title: "Sikker pålogging",
    description: "Logg inn med Google eller Apple. Ingen passord å huske."
  },
  {
    icon: Globe,
    title: "Tilgjengelig 24/7",
    description: "Skybasert løsning som alltid er tilgjengelig når du trenger den."
  },
  {
    icon: TrendingUp,
    title: "Vokser med bedriften",
    description: "Fra 2 til 2000 ansatte - Tidsflyt skalerer med dine behov."
  }
];

const stats = [
  { value: "98%", label: "Kundetilfredshet" },
  { value: "30 min", label: "Spart per dag" },
  { value: "500+", label: "Norske bedrifter" },
  { value: "99.9%", label: "Oppetid" }
];

export default function WhyTidsflyt() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
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
          <div className="container mx-auto px-4 text-center max-w-4xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6" data-testid="text-why-title">
              Hvorfor velge <span className="text-primary">Tidsflyt</span>?
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-why-subtitle">
              Tidsflyt er bygget for norske bedrifter som ønsker enkel, sikker og effektiv tidsregistrering - uten kompleksitet.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/login">
                <Button size="lg" data-testid="button-try-free">
                  Prøv gratis
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <Link href="/kontakt">
                <Button variant="outline" size="lg" data-testid="button-contact-sales">
                  Snakk med oss
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 border-b">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              {stats.map((stat, index) => (
                <div key={index} className="text-center" data-testid={`stat-${index}`}>
                  <div className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4" data-testid="text-benefits-title">
                Fordeler med Tidsflyt
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Vi har bygget Tidsflyt fra bunnen av for å løse de vanligste utfordringene norske bedrifter har med tidsregistrering.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {benefits.map((benefit, index) => (
                <Card key={index} className="hover-elevate" data-testid={`card-benefit-${index}`}>
                  <CardContent className="p-6">
                    <div className="p-3 rounded-lg bg-primary/10 w-fit mb-4">
                      <benefit.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{benefit.title}</h3>
                    <p className="text-muted-foreground text-sm">{benefit.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
              <div>
                <h2 className="text-3xl font-bold mb-6" data-testid="text-nordic-title">
                  Bygget for norske forhold
                </h2>
                <p className="text-muted-foreground mb-6">
                  Mange tidsregistreringssystemer er laget for det amerikanske markedet. 
                  Tidsflyt er annerledes - vi har bygget en løsning som forstår norsk arbeidsliv.
                </p>
                <ul className="space-y-4">
                  {[
                    "Norske helligdager og røde dager innebygd",
                    "Støtte for norsk ferielov og avspasering",
                    "Integrasjon med norske regnskapssystemer",
                    "Norsk kundesupport fra Oslo",
                    "Data lagret sikkert i Norge"
                  ].map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {features.map((feature, index) => (
                  <Card key={index} data-testid={`card-feature-${index}`}>
                    <CardContent className="p-4">
                      <feature.icon className="h-8 w-8 text-primary mb-3" />
                      <h3 className="font-semibold mb-1">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <Award className="h-12 w-12 text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4" data-testid="text-trust-title">
              Anbefalt av norske bedrifter
            </h2>
            <p className="text-muted-foreground mb-8">
              Over 500 norske bedrifter bruker Tidsflyt til å effektivisere sin tidsregistrering. 
              Fra små konsulentfirmaer til store entreprenørselskaper - alle finner verdi i vår løsning.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Heart className="h-4 w-4 text-red-500" />
              <span>Laget med kjærlighet i Norge</span>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <h2 className="text-3xl font-bold mb-4">
              Klar til å komme i gang?
            </h2>
            <p className="text-primary-foreground/80 mb-8">
              Start din gratis prøveperiode i dag. Ingen kredittkort nødvendig.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/login">
                <Button size="lg" variant="secondary" data-testid="button-cta-start">
                  Start gratis prøveperiode
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
        <div className="container mx-auto px-4">
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
              © 2025 Tidsflyt. Alle rettigheter reservert.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
