import { Link } from "wouter";
import { 
  Clock, 
  Users, 
  FileText, 
  Shield, 
  BarChart3, 
  Smartphone,
  CheckCircle,
  ArrowRight,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { SmartTimingLogo } from "@/components/smart-timing-logo";

const features = [
  {
    icon: Clock,
    title: "Enkel Timeføring",
    description: "Registrer timer raskt og enkelt med vår intuitive grensesnitt. Start og stopp tidtaker eller legg inn manuelt.",
  },
  {
    icon: Users,
    title: "Team Administrasjon",
    description: "Administrer brukere, roller og tilganger. Inviter nye teammedlemmer og følg opp deres timer.",
  },
  {
    icon: FileText,
    title: "Rapporter & Eksport",
    description: "Generer detaljerte rapporter for prosjekter, ansatte eller perioder. Eksporter til Excel eller PDF.",
  },
  {
    icon: Shield,
    title: "Godkjenningsflyt",
    description: "Effektiv godkjenningsprosess for innsendte timer. Saksbehandlere kan godkjenne eller avvise med kommentarer.",
  },
  {
    icon: BarChart3,
    title: "Analyse & Innsikt",
    description: "Visualiser timeforbruk med grafer og statistikk. Se trender og optimaliser ressursbruk.",
  },
  {
    icon: Smartphone,
    title: "Mobilvennlig",
    description: "Responsivt design som fungerer perfekt på alle enheter. Registrer timer hvor som helst.",
  },
];

const testimonials = [
  {
    quote: "Smart Timing har forenklet vår timeføring betydelig. Vi sparer mye tid hver måned.",
    name: "Erik Hansen",
    role: "Daglig leder, Konsulentselskap AS",
  },
  {
    quote: "Rapporteringsfunksjonene er utmerkede. Vi får full oversikt over alle prosjekter.",
    name: "Maria Olsen",
    role: "Prosjektleder, IT Solutions",
  },
  {
    quote: "Enkel å ta i bruk og god kundeservice. Anbefales på det sterkeste!",
    name: "Anders Berg",
    role: "Økonomisjef, Bygg & Anlegg",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
          <SmartTimingLogo size="md" />
          
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-features">
              Funksjoner
            </a>
            <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-testimonials">
              Referanser
            </a>
            <a href="#contact" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-contact">
              Kontakt
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/dashboard">
              <Button data-testid="button-login">Logg inn</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="py-20 md:py-32 bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg">
              <Clock className="h-8 w-8 text-white" />
            </div>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6" data-testid="hero-title">
            Smart Timeføring for
            <span className="block text-primary">Norske Bedrifter</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Effektiv og brukervennlig timeregistrering for konsulenter, prosjektteam og bedrifter. 
            Spar tid på administrasjon og få full kontroll over timene dine.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/dashboard">
              <Button size="lg" className="gap-2" data-testid="button-start-free">
                Start gratis prøveperiode
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#features" data-testid="link-learn-more">
              <Button size="lg" variant="outline" data-testid="button-learn-more">
                Les mer
              </Button>
            </a>
          </div>

          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>Ingen kredittkort nødvendig</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>14 dagers gratis prøveperiode</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>Norsk kundesupport</span>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="features-title">
              Alt du trenger for effektiv timeføring
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Smart Timing gir deg verktøyene for å registrere, administrere og rapportere timer enkelt og effektivt.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover-elevate" data-testid={`feature-card-${index}`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="testimonials-title">
              Hva kundene sier
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Hundrevis av norske bedrifter bruker Smart Timing for sin timeregistrering.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="bg-background" data-testid={`testimonial-card-${index}`}>
                <CardContent className="p-6">
                  <p className="text-foreground mb-4 italic" data-testid={`text-testimonial-quote-${index}`}>"{testimonial.quote}"</p>
                  <div>
                    <p className="font-semibold" data-testid={`text-testimonial-name-${index}`}>{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground" data-testid={`text-testimonial-role-${index}`}>{testimonial.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Klar til å forenkle timeføringen?
          </h2>
          <p className="text-xl opacity-90 max-w-2xl mx-auto mb-8">
            Start gratis i dag og opplev forskjellen. Ingen binding, ingen skjulte kostnader.
          </p>
          <Link href="/dashboard">
            <Button size="lg" variant="secondary" className="gap-2" data-testid="button-cta-start">
              Kom i gang gratis
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <section id="contact" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            <div>
              <h2 className="text-3xl font-bold mb-4" data-testid="contact-title">Kontakt oss</h2>
              <p className="text-muted-foreground mb-8">
                Har du spørsmål om Smart Timing? Ta kontakt med oss, så hjelper vi deg gjerne.
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-3" data-testid="contact-email">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">E-post</p>
                    <p className="font-medium" data-testid="text-email">kontakt@smarttiming.no</p>
                  </div>
                </div>

                <div className="flex items-center gap-3" data-testid="contact-phone">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Telefon</p>
                    <p className="font-medium" data-testid="text-phone">+47 22 33 44 55</p>
                  </div>
                </div>

                <div className="flex items-center gap-3" data-testid="contact-address">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Adresse</p>
                    <p className="font-medium" data-testid="text-address">Oslo, Norge</p>
                  </div>
                </div>
              </div>
            </div>

            <Card>
              <CardContent className="p-6">
                <form className="space-y-4" data-testid="contact-form">
                  <div className="space-y-2">
                    <Label htmlFor="name">Navn</Label>
                    <Input id="name" placeholder="Ditt navn" data-testid="input-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-post</Label>
                    <Input id="email" type="email" placeholder="din@epost.no" data-testid="input-email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Melding</Label>
                    <Textarea 
                      id="message" 
                      placeholder="Skriv din melding her..." 
                      className="min-h-[120px]"
                      data-testid="input-message" 
                    />
                  </div>
                  <Button type="submit" className="w-full" data-testid="button-send-message">
                    Send melding
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <footer className="py-12 bg-muted/50 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <SmartTimingLogo size="sm" />
            
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors" data-testid="link-footer-features">
                Funksjoner
              </a>
              <a href="#testimonials" className="hover:text-foreground transition-colors" data-testid="link-footer-testimonials">
                Referanser
              </a>
              <a href="#contact" className="hover:text-foreground transition-colors" data-testid="link-footer-contact">
                Kontakt
              </a>
              <a href="#" className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">
                Personvern
              </a>
              <a href="#" className="hover:text-foreground transition-colors" data-testid="link-footer-terms">
                Vilkår
              </a>
            </div>

            <p className="text-sm text-muted-foreground">
              © 2025 Smart Timing. Alle rettigheter reservert.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
