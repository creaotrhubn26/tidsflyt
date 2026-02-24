import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Phone, MapPin, ArrowLeft, Send, Building2, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { tidumPageStyles } from "@/lib/tidum-page-styles";
import { useSEO } from "@/hooks/use-seo";
import tidumWordmark from "@assets/tidum-wordmark.png";

interface PageContent {
  title: string;
  subtitle: string;
  content: string;
  email: string;
  phone: string;
  address: string;
}

interface BrregCompany {
  organisasjonsnummer: string;
  navn: string;
  hjemmeside?: string;
  forretningsadresse?: {
    adresse?: string[];
    postnummer?: string;
    poststed?: string;
  };
}

export default function Contact() {
  const { toast } = useToast();

  useSEO({
    title: "Kontakt oss – Tidum",
    description: "Ta kontakt med Tidum for spørsmål om timeføring, priser eller demo. Vi hjelper norske bedrifter med effektiv tidsregistrering.",
    canonical: "https://tidum.no/kontakt",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      name: "Kontakt Tidum",
      url: "https://tidum.no/kontakt",
      mainEntity: {
        "@type": "Organization",
        name: "Tidum",
        telephone: "+47-97-95-92-94",
        email: "support@tidum.no",
        address: { "@type": "PostalAddress", addressLocality: "Oslo", addressCountry: "NO" },
      },
    },
  });

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    orgNumber: "",
    website: "",
    phone: "",
    subject: "",
    message: "",
    institutionType: "" as "" | "privat" | "offentlig" | "nav",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [formLoadTime] = useState(() => Date.now());
  const [brregSearchResults, setBrregSearchResults] = useState<BrregCompany[]>([]);
  const [brregLoading, setBrregLoading] = useState(false);
  const [brregVerified, setBrregVerified] = useState(false);
  const [showBrregDropdown, setShowBrregDropdown] = useState(false);
  const brregDropdownRef = useRef<HTMLDivElement>(null);
  const brregInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (brregDropdownRef.current && !brregDropdownRef.current.contains(event.target as Node)) {
        setShowBrregDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search brreg.no when org number changes
  const searchBrreg = async (query: string) => {
    if (query.length < 3) {
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
    setFormData(prev => ({
      ...prev,
      orgNumber: company.organisasjonsnummer,
      company: company.navn,
      website: company.hjemmeside ? (company.hjemmeside.startsWith('http') ? company.hjemmeside : `https://${company.hjemmeside}`) : prev.website,
    }));
    setBrregVerified(true);
    setShowBrregDropdown(false);
    setBrregSearchResults([]);
  };

  const resetBrregVerification = () => {
    setBrregVerified(false);
    setFormData(prev => ({ ...prev, company: "", orgNumber: "" }));
  };

  const { data: pageContent } = useQuery<PageContent>({
    queryKey: ['/api/cms/pages/contact'],
  });

  const content = pageContent || {
    title: "Kontakt oss",
    subtitle: "Har du spørsmål? Vi hjelper deg gjerne.",
    content: "Fyll ut skjemaet nedenfor, så tar vi kontakt med deg så snart som mulig.",
    email: "support@tidum.no",
    phone: "+47 97 95 92 94",
    address: "Oslo, Norge"
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.name,
          email: formData.email,
          company: formData.company,
          org_number: formData.orgNumber,
          phone: formData.phone,
          message: formData.message || formData.subject,
          brreg_verified: brregVerified,
          institution_type: formData.institutionType || null,
          _honeypot: honeypot,
          _timestamp: formLoadTime,
        }),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Forespørsel sendt",
          description: "Vi har mottatt din tilgangsforespørsel og vil behandle den så snart som mulig."
        });
        setFormData({ name: "", email: "", company: "", orgNumber: "", website: "", phone: "", subject: "", message: "", institutionType: "" });
        setBrregVerified(false);
      } else {
        toast({
          title: "Feil",
          description: result.error || "Kunne ikke sende melding. Prøv igjen.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Feil",
        description: "Kunne ikke sende melding. Prøv igjen senere.",
        variant: "destructive"
      });
    }
    
    setIsSubmitting(false);
  };

  return (
    <main className="tidum-page">
      <style>{tidumPageStyles}</style>
      <style>{`
        .tidum-contact-card {
          border: 1px solid var(--color-border);
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 8px 28px rgba(22, 43, 49, 0.06);
        }
      `}</style>

      <div className="rt-container pb-16 pt-8">
        <section className="tidum-panel relative overflow-hidden rounded-[28px]">
          <div className="pointer-events-none absolute -left-16 top-[34%] h-36 w-96 rotate-[-14deg] rounded-[999px] bg-[rgba(131,171,145,0.2)]" />
          <div className="pointer-events-none absolute right-[-140px] top-14 h-80 w-[520px] rounded-[999px] bg-[rgba(194,205,195,0.24)]" />

          <header className="relative z-10 flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto sm:h-11" />
              <span className="sr-only" data-testid="text-page-title">Tidum</span>
            </div>

            <Link href="/">
              <Button variant="outline" className="tidum-btn-secondary h-auto px-5 py-2.5 text-base font-medium" data-testid="button-back">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tilbake
              </Button>
            </Link>
          </header>

          <div className="relative z-10 grid gap-6 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[0.95fr,1.3fr]">
            <div className="space-y-5">
              <div>
                <h1 className="text-[clamp(2rem,3.7vw,3.1rem)] font-semibold tracking-tight text-[#0E4852]" data-testid="text-contact-title">
                  {content.title}
                </h1>
                <p className="mt-3 max-w-xl text-[clamp(1.05rem,1.45vw,1.3rem)] leading-relaxed text-[#2D3D43]" data-testid="text-contact-subtitle">
                  {content.subtitle}
                </p>
              </div>

              <Card data-testid="card-contact-info" className="tidum-contact-card rounded-2xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-2xl font-semibold tracking-tight text-[#15343D]">Kontaktinformasjon</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-start gap-3.5">
                    <div className="rounded-lg bg-[#E7F3EE] p-2.5">
                      <Mail className="h-5 w-5 text-[#1F6B73]" />
                    </div>
                    <div>
                      <p className="font-medium text-[#203138]">E-post</p>
                      <a href={`mailto:${content.email}`} className="text-[#4B5A5E] transition-colors hover:text-[#1F6B73]">
                        {content.email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="rounded-lg bg-[#E7F3EE] p-2.5">
                      <Phone className="h-5 w-5 text-[#1F6B73]" />
                    </div>
                    <div>
                      <p className="font-medium text-[#203138]">Telefon</p>
                      <a href={`tel:${content.phone}`} className="text-[#4B5A5E] transition-colors hover:text-[#1F6B73]" data-testid="link-phone">
                        {content.phone}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="rounded-lg bg-[#E7F3EE] p-2.5">
                      <MapPin className="h-5 w-5 text-[#1F6B73]" />
                    </div>
                    <div>
                      <p className="font-medium text-[#203138]">Adresse</p>
                      <p className="text-[#4B5A5E]" data-testid="text-address">{content.address}</p>
                    </div>
                  </div>

                  <p className="border-t border-[var(--color-border)] pt-4 text-sm leading-relaxed text-[#5B686B]" data-testid="text-contact-content">
                    {content.content}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card data-testid="card-contact-form" className="tidum-contact-card rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-semibold tracking-tight text-[#15343D]">Send oss en melding</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="absolute -left-[9999px]" aria-hidden="true">
                    <input
                      type="text"
                      name="website_url"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-[#223238]">Kontaktperson *</Label>
                      <Input
                        id="name"
                        placeholder="Ditt navn"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        className="tidum-input"
                        data-testid="input-contact-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-[#223238]">E-post *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="din@bedrift.no"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        className="tidum-input"
                        data-testid="input-contact-email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2" ref={brregDropdownRef}>
                    <Label htmlFor="orgSearch" className="flex items-center gap-2 text-[#223238]">
                      <Building2 className="h-4 w-4" />
                      Søk etter bedrift (org.nr eller navn)
                    </Label>
                    <div className="relative">
                      <Input
                        id="orgSearch"
                        ref={brregInputRef}
                        placeholder="Skriv org.nummer eller bedriftsnavn..."
                        onChange={(e) => {
                          const value = e.target.value;
                          if (!brregVerified) {
                            searchBrreg(value);
                          }
                        }}
                        disabled={brregVerified}
                        className={`tidum-input ${brregVerified ? "bg-[#eef2ef]" : ""}`}
                        data-testid="input-contact-brreg-search"
                      />
                      {brregLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-[#607073]" />
                        </div>
                      )}
                      {showBrregDropdown && brregSearchResults.length > 0 && (
                        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-[var(--color-border)] bg-white shadow-lg">
                          {brregSearchResults.map((company) => (
                            <button
                              key={company.organisasjonsnummer}
                              type="button"
                              onClick={() => selectBrregCompany(company)}
                              className="flex w-full items-start gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors hover:bg-[#f2f5f4] last:border-0"
                              data-testid={`button-brreg-select-${company.organisasjonsnummer}`}
                            >
                              <Building2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#1F6B73]" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-[#203138]">{company.navn}</div>
                                <div className="text-sm text-[#5B686B]">
                                  Org.nr: {company.organisasjonsnummer}
                                  {company.forretningsadresse?.poststed && ` • ${company.forretningsadresse.poststed}`}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-[#5B686B]">
                      Søk henter informasjon fra Brønnøysundregistrene
                    </p>
                  </div>

                  {brregVerified && (
                    <div className="space-y-3 rounded-lg border border-[#BFD7CC] bg-[#ECF6F1] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[#1F6B73]">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="font-medium">Bedrift verifisert fra Brønnøysundregistrene</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={resetBrregVerification}
                          className="tidum-btn-secondary px-3 py-1.5 text-sm"
                          data-testid="button-reset-brreg"
                        >
                          Endre
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                        <div>
                          <span className="text-[#5B686B]">Bedriftsnavn:</span>
                          <p className="font-medium text-[#203138]" data-testid="text-verified-company">{formData.company}</p>
                        </div>
                        <div>
                          <span className="text-[#5B686B]">Org.nummer:</span>
                          <p className="font-medium text-[#203138]" data-testid="text-verified-orgnumber">{formData.orgNumber}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {!brregVerified && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="company" className="text-[#223238]">Bedriftsnavn (manuelt)</Label>
                        <Input
                          id="company"
                          placeholder="Eller skriv inn manuelt"
                          value={formData.company}
                          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                          className="tidum-input"
                          data-testid="input-contact-company"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="orgNumber" className="text-[#223238]">Org.nummer (manuelt)</Label>
                        <Input
                          id="orgNumber"
                          placeholder="123 456 789"
                          value={formData.orgNumber}
                          onChange={(e) => setFormData({ ...formData, orgNumber: e.target.value })}
                          className="tidum-input"
                          data-testid="input-contact-orgnumber"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="institutionType" className="text-[#223238]">Type institusjon *</Label>
                    <select
                      id="institutionType"
                      title="Type institusjon"
                      value={formData.institutionType}
                      onChange={(e) => setFormData({ ...formData, institutionType: e.target.value as any })}
                      required
                      className="tidum-input flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      data-testid="select-institution-type"
                    >
                      <option value="">Velg type...</option>
                      <option value="privat">Privat institusjon</option>
                      <option value="offentlig">Offentlig institusjon</option>
                      <option value="nav">NAV / BUFetat</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="website" className="text-[#223238]">Nettside</Label>
                      <Input
                        id="website"
                        type="url"
                        placeholder="https://www.bedrift.no"
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                        className="tidum-input"
                        data-testid="input-contact-website"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-[#223238]">Telefon</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+47 XXX XX XXX"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="tidum-input"
                        data-testid="input-contact-phone"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject" className="text-[#223238]">Emne *</Label>
                    <Input
                      id="subject"
                      placeholder="Hva gjelder henvendelsen?"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      required
                      className="tidum-input"
                      data-testid="input-contact-subject"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-[#223238]">Melding *</Label>
                    <Textarea
                      id="message"
                      placeholder="Beskriv hva du ønsker å vite mer om..."
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      rows={5}
                      required
                      className="tidum-input resize-y"
                      data-testid="textarea-contact-message"
                    />
                  </div>
                  <Button type="submit" className="tidum-btn-primary h-auto w-full py-3 text-base font-semibold" disabled={isSubmitting} data-testid="button-submit-contact">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sender...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send henvendelse
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        <footer className="mt-8 border-t border-[var(--color-border)] pt-6 text-sm text-[#5B686B]">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/personvern" className="transition-colors hover:text-[#1F6B73]" data-testid="link-privacy">Personvern</Link>
            <Link href="/vilkar" className="transition-colors hover:text-[#1F6B73]" data-testid="link-terms">Vilkår</Link>
          </div>
          <p className="mt-4 text-center" data-testid="text-copyright">© 2025 Tidum. Alle rettigheter reservert.</p>
        </footer>
      </div>
    </main>
  );
}
