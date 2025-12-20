import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  LucideIcon,
  UserPlus,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { SmartTimingLogo } from "@/components/smart-timing-logo";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

interface LandingHero {
  id: number;
  title: string;
  title_highlight: string | null;
  subtitle: string | null;
  cta_primary_text: string | null;
  cta_secondary_text: string | null;
  badge1: string | null;
  badge2: string | null;
  badge3: string | null;
}

interface LandingFeature {
  id: number;
  icon: string;
  title: string;
  description: string;
  display_order: number;
}

interface LandingTestimonial {
  id: number;
  quote: string;
  name: string;
  role: string;
  display_order: number;
}

interface LandingSections {
  features_title: string | null;
  features_subtitle: string | null;
  testimonials_title: string | null;
  testimonials_subtitle: string | null;
  cta_title: string | null;
  cta_subtitle: string | null;
  cta_button_text: string | null;
  contact_title: string | null;
  contact_subtitle: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  footer_copyright: string | null;
}

interface LandingContent {
  hero: LandingHero | null;
  features: LandingFeature[];
  testimonials: LandingTestimonial[];
  sections: LandingSections | null;
}

const iconMap: Record<string, LucideIcon> = {
  Clock,
  Users,
  FileText,
  Shield,
  BarChart3,
  Smartphone,
};

const defaultHero: LandingHero = {
  id: 0,
  title: "Smart Timeføring for",
  title_highlight: "Norske Bedrifter",
  subtitle: "Effektiv og brukervennlig timeregistrering for konsulenter, prosjektteam og bedrifter. Spar tid på administrasjon og få full kontroll over timene dine.",
  cta_primary_text: "Start gratis prøveperiode",
  cta_secondary_text: "Les mer",
  badge1: "Ingen kredittkort nødvendig",
  badge2: "14 dagers gratis prøveperiode",
  badge3: "Norsk kundesupport",
};

const defaultFeatures: LandingFeature[] = [
  { id: 1, icon: "Clock", title: "Enkel Timeføring", description: "Registrer timer raskt og enkelt med vår intuitive grensesnitt.", display_order: 0 },
  { id: 2, icon: "Users", title: "Team Administrasjon", description: "Administrer brukere, roller og tilganger.", display_order: 1 },
  { id: 3, icon: "FileText", title: "Rapporter & Eksport", description: "Generer detaljerte rapporter for prosjekter.", display_order: 2 },
  { id: 4, icon: "Shield", title: "Godkjenningsflyt", description: "Effektiv godkjenningsprosess for innsendte timer.", display_order: 3 },
  { id: 5, icon: "BarChart3", title: "Analyse & Innsikt", description: "Visualiser timeforbruk med grafer og statistikk.", display_order: 4 },
  { id: 6, icon: "Smartphone", title: "Mobilvennlig", description: "Responsivt design som fungerer perfekt på alle enheter.", display_order: 5 },
];

const defaultSections: LandingSections = {
  features_title: "Alt du trenger for effektiv timeføring",
  features_subtitle: "Smart Timing gir deg verktøyene for å registrere, administrere og rapportere timer enkelt og effektivt.",
  testimonials_title: "Hva kundene sier",
  testimonials_subtitle: "Hundrevis av norske bedrifter bruker Smart Timing for sin timeregistrering.",
  cta_title: "Klar til å forenkle timeføringen?",
  cta_subtitle: "Start gratis i dag og opplev forskjellen. Ingen binding, ingen skjulte kostnader.",
  cta_button_text: "Kom i gang gratis",
  contact_title: "Kontakt oss",
  contact_subtitle: "Har du spørsmål om Smart Timing? Ta kontakt med oss, så hjelper vi deg gjerne.",
  contact_email: "kontakt@smarttiming.no",
  contact_phone: "+47 22 33 44 55",
  contact_address: "Oslo, Norge",
  footer_copyright: "© 2025 Smart Timing. Alle rettigheter reservert.",
};

interface BrregCompany {
  organisasjonsnummer: string;
  navn: string;
  organisasjonsform?: {
    kode: string;
    beskrivelse: string;
  };
  forretningsadresse?: {
    adresse?: string[];
    postnummer?: string;
    poststed?: string;
  };
}

interface NewUserFormData {
  fullName: string;
  email: string;
  orgNumber: string;
  company: string;
  phone: string;
  message: string;
}

interface LoginFormData {
  username: string;
  password: string;
}

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'choice' | 'new-user' | 'existing-user'>('choice');
  const [brregSearchResults, setBrregSearchResults] = useState<BrregCompany[]>([]);
  const [brregLoading, setBrregLoading] = useState(false);
  const [brregVerified, setBrregVerified] = useState(false);
  const [showBrregDropdown, setShowBrregDropdown] = useState(false);

  const { data: content, isLoading } = useQuery<LandingContent>({
    queryKey: ['/api/cms/landing'],
  });

  const hero = content?.hero || defaultHero;
  const features = content?.features?.length ? content.features : defaultFeatures;
  const testimonials = content?.testimonials || [];
  const hasTestimonials = testimonials.length > 0;
  const sections = content?.sections || defaultSections;

  const newUserForm = useForm<NewUserFormData>({
    defaultValues: {
      fullName: '',
      email: '',
      orgNumber: '',
      company: '',
      phone: '',
      message: '',
    },
  });

  const searchBrreg = async (query: string) => {
    if (query.length < 2) {
      setBrregSearchResults([]);
      setShowBrregDropdown(false);
      return;
    }

    setBrregLoading(true);
    try {
      const isOrgNumber = /^\d{9}$/.test(query.replace(/\s/g, ''));
      let url: string;
      
      if (isOrgNumber) {
        url = `https://data.brreg.no/enhetsregisteret/api/enheter/${query.replace(/\s/g, '')}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setBrregSearchResults([data]);
          setShowBrregDropdown(true);
        } else {
          setBrregSearchResults([]);
          setShowBrregDropdown(false);
        }
      } else {
        url = `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(query)}&size=5`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data._embedded?.enheter) {
            setBrregSearchResults(data._embedded.enheter);
            setShowBrregDropdown(true);
          } else {
            setBrregSearchResults([]);
            setShowBrregDropdown(false);
          }
        }
      }
    } catch (error) {
      console.error('Brreg search error:', error);
      setBrregSearchResults([]);
    } finally {
      setBrregLoading(false);
    }
  };

  const selectBrregCompany = (company: BrregCompany) => {
    newUserForm.setValue('orgNumber', company.organisasjonsnummer);
    newUserForm.setValue('company', company.navn);
    setBrregVerified(true);
    setShowBrregDropdown(false);
    setBrregSearchResults([]);
  };

  const loginForm = useForm<LoginFormData>({
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const handleLoginClick = () => {
    setDialogMode('choice');
    setLoginDialogOpen(true);
  };

  const handleNewUserSubmit = async (data: NewUserFormData) => {
    try {
      const response = await fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: data.fullName,
          email: data.email,
          org_number: data.orgNumber,
          company: data.company,
          phone: data.phone,
          message: data.message,
          brreg_verified: brregVerified,
        }),
      });
      
      if (response.ok) {
        toast({
          title: "Forespørsel sendt",
          description: "Vi vil kontakte deg så snart som mulig.",
        });
        setLoginDialogOpen(false);
        newUserForm.reset();
        setBrregVerified(false);
      } else {
        const errorData = await response.json();
        toast({
          title: "Feil",
          description: errorData.error || "Kunne ikke sende forespørsel",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Feil",
        description: "Noe gikk galt. Prøv igjen senere.",
        variant: "destructive",
      });
    }
  };

  const handleLoginSubmit = async (data: LoginFormData) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (response.ok) {
        const result = await response.json();
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        toast({
          title: "Innlogget",
          description: `Velkommen tilbake, ${result.user.name}!`,
        });
        setLoginDialogOpen(false);
        loginForm.reset();
        setLocation('/dashboard');
      } else {
        const errorData = await response.json();
        toast({
          title: "Innlogging feilet",
          description: errorData.error || "Feil brukernavn eller passord",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Feil",
        description: "Noe gikk galt. Prøv igjen senere.",
        variant: "destructive",
      });
    }
  };

  const renderDialogContent = () => {
    if (dialogMode === 'choice') {
      return (
        <>
          <DialogHeader>
            <DialogTitle>Velkommen til Smart Timing</DialogTitle>
            <DialogDescription>
              Velg hvordan du vil fortsette
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button
              variant="outline"
              className="h-auto p-6 flex flex-col items-start gap-2"
              onClick={() => setDialogMode('new-user')}
              data-testid="button-new-user"
            >
              <div className="flex items-center gap-3">
                <UserPlus className="h-6 w-6 text-primary" />
                <div className="text-left">
                  <p className="font-semibold">Ny bruker</p>
                  <p className="text-sm text-muted-foreground">Send forespørsel om tilgang</p>
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto p-6 flex flex-col items-start gap-2"
              onClick={() => setDialogMode('existing-user')}
              data-testid="button-existing-user"
            >
              <div className="flex items-center gap-3">
                <LogIn className="h-6 w-6 text-primary" />
                <div className="text-left">
                  <p className="font-semibold">Eksisterende bruker</p>
                  <p className="text-sm text-muted-foreground">Logg inn med dine credentials</p>
                </div>
              </div>
            </Button>
          </div>
        </>
      );
    }

    if (dialogMode === 'new-user') {
      return (
        <>
          <DialogHeader>
            <DialogTitle>Be om tilgang</DialogTitle>
            <DialogDescription>
              Fyll ut skjemaet for å be om tilgang til Smart Timing
            </DialogDescription>
          </DialogHeader>
          <Form {...newUserForm}>
            <form onSubmit={newUserForm.handleSubmit(handleNewUserSubmit)} className="space-y-4 py-4">
              <FormField
                control={newUserForm.control}
                name="fullName"
                rules={{ required: "Navn er påkrevd" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fullt navn</FormLabel>
                    <FormControl>
                      <Input placeholder="Ola Nordmann" {...field} data-testid="input-new-user-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newUserForm.control}
                name="email"
                rules={{ 
                  required: "E-post er påkrevd",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "Ugyldig e-postadresse"
                  }
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-post</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="ola@bedrift.no" {...field} data-testid="input-new-user-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newUserForm.control}
                name="orgNumber"
                render={({ field }) => (
                  <FormItem className="relative">
                    <FormLabel className="flex items-center gap-2">
                      Organisasjonsnummer eller bedriftsnavn
                      {brregVerified && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle className="h-3 w-3" />
                          Verifisert
                        </span>
                      )}
                      {brregLoading && (
                        <span className="text-xs text-muted-foreground">Søker...</span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Søk med org.nr eller bedriftsnavn" 
                        {...field} 
                        onChange={(e) => {
                          field.onChange(e);
                          setBrregVerified(false);
                          searchBrreg(e.target.value);
                        }}
                        data-testid="input-new-user-orgnumber" 
                      />
                    </FormControl>
                    {showBrregDropdown && brregSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-auto">
                        {brregSearchResults.map((company) => (
                          <button
                            key={company.organisasjonsnummer}
                            type="button"
                            className="w-full text-left px-3 py-2 hover-elevate border-b border-border last:border-0"
                            onClick={() => selectBrregCompany(company)}
                            data-testid={`brreg-result-${company.organisasjonsnummer}`}
                          >
                            <p className="font-medium text-sm">{company.navn}</p>
                            <p className="text-xs text-muted-foreground">
                              Org.nr: {company.organisasjonsnummer}
                              {company.organisasjonsform && ` (${company.organisasjonsform.beskrivelse})`}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newUserForm.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bedriftsnavn {brregVerified && "(fra Brreg)"}</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Fylles ut automatisk ved søk" 
                        {...field} 
                        disabled={brregVerified}
                        className={brregVerified ? "bg-muted" : ""}
                        data-testid="input-new-user-company" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newUserForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon (valgfritt)</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+47 123 45 678" {...field} data-testid="input-new-user-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newUserForm.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Melding (valgfritt)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Fortell oss litt om hvorfor du ønsker tilgang..." 
                        className="min-h-[80px]"
                        {...field} 
                        data-testid="input-new-user-message" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogMode('choice')} data-testid="button-back">
                  Tilbake
                </Button>
                <Button type="submit" className="flex-1" data-testid="button-submit-request">
                  Send forespørsel
                </Button>
              </div>
            </form>
          </Form>
        </>
      );
    }

    if (dialogMode === 'existing-user') {
      return (
        <>
          <DialogHeader>
            <DialogTitle>Logg inn</DialogTitle>
            <DialogDescription>
              Skriv inn ditt brukernavn og passord
            </DialogDescription>
          </DialogHeader>
          <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(handleLoginSubmit)} className="space-y-4 py-4">
              <FormField
                control={loginForm.control}
                name="username"
                rules={{ required: "Brukernavn er påkrevd" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brukernavn</FormLabel>
                    <FormControl>
                      <Input placeholder="brukernavn" {...field} data-testid="input-login-username" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={loginForm.control}
                name="password"
                rules={{ required: "Passord er påkrevd" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Passord</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="********" {...field} data-testid="input-login-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogMode('choice')} data-testid="button-back-login">
                  Tilbake
                </Button>
                <Button type="submit" className="flex-1" data-testid="button-login-submit">
                  Logg inn
                </Button>
              </div>
            </form>
          </Form>
        </>
      );
    }

    return null;
  };

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
            <Button onClick={handleLoginClick} data-testid="button-login">Logg inn</Button>
          </div>
        </div>
      </header>

      <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-login">
          {renderDialogContent()}
        </DialogContent>
      </Dialog>

      <section className="py-20 md:py-32 bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg">
              <Clock className="h-8 w-8 text-white" />
            </div>
          </div>
          
          {isLoading ? (
            <Skeleton className="h-16 w-96 mx-auto mb-6" />
          ) : (
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6" data-testid="hero-title">
              {hero.title}
              {hero.title_highlight && (
                <span className="block text-primary">{hero.title_highlight}</span>
              )}
            </h1>
          )}
          
          {isLoading ? (
            <Skeleton className="h-8 w-full max-w-2xl mx-auto mb-10" />
          ) : (
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              {hero.subtitle}
            </p>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="gap-2" onClick={handleLoginClick} data-testid="button-start-free">
              {hero.cta_primary_text || "Start gratis prøveperiode"}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <a href="#features" data-testid="link-learn-more">
              <Button size="lg" variant="outline" data-testid="button-learn-more">
                {hero.cta_secondary_text || "Les mer"}
              </Button>
            </a>
          </div>

          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            {hero.badge1 && (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{hero.badge1}</span>
              </div>
            )}
            {hero.badge2 && (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{hero.badge2}</span>
              </div>
            )}
            {hero.badge3 && (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{hero.badge3}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="features" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="features-title">
              {sections.features_title}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {sections.features_subtitle}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const IconComponent = iconMap[feature.icon] || Clock;
              return (
                <Card key={feature.id} className="hover-elevate" data-testid={`feature-card-${index}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                      <IconComponent className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {hasTestimonials && (
        <section id="testimonials" className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="testimonials-title">
                {sections.testimonials_title}
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                {sections.testimonials_subtitle}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {testimonials.map((testimonial, index) => (
                <Card key={testimonial.id} className="bg-background" data-testid={`testimonial-card-${index}`}>
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
      )}

      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {sections.cta_title}
          </h2>
          <p className="text-xl opacity-90 max-w-2xl mx-auto mb-8">
            {sections.cta_subtitle}
          </p>
          <Button size="lg" variant="secondary" className="gap-2" onClick={handleLoginClick} data-testid="button-cta-start">
            {sections.cta_button_text}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <section id="contact" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            <div>
              <h2 className="text-3xl font-bold mb-4" data-testid="contact-title">{sections.contact_title}</h2>
              <p className="text-muted-foreground mb-8">
                {sections.contact_subtitle}
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-3" data-testid="contact-email">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">E-post</p>
                    <p className="font-medium" data-testid="text-email">{sections.contact_email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3" data-testid="contact-phone">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Telefon</p>
                    <p className="font-medium" data-testid="text-phone">{sections.contact_phone}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3" data-testid="contact-address">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Adresse</p>
                    <p className="font-medium" data-testid="text-address">{sections.contact_address}</p>
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

            <p className="text-sm text-muted-foreground" data-testid="text-footer-copyright">
              {sections.footer_copyright}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
