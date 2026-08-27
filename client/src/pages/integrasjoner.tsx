import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tidumPageStyles } from "@/lib/tidum-page-styles";
import { useSEO } from "@/hooks/use-seo";
import { usePublicLightTheme } from "@/hooks/use-public-light-theme";
import {
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Newspaper,
} from "lucide-react";
import tidumWordmark from "@assets/tidum-wordmark.png";
import { TIDUM_SUPPORT_EMAIL } from "@shared/brand";

const INTEGRASJONER_OG_IMAGE = "https://tidum.no/screenshots/time-tracking.png";

interface IntegrationCard {
  logoSrc: string;
  logoAlt: string;
  name: string;
  tagline: string;
  description: string;
  points: string[];
  href: string;
}

const integrations: IntegrationCard[] = [
  {
    logoSrc: "/logos/bankid-logo.svg",
    logoAlt: "BankID",
    name: "BankID",
    tagline: "Innlogging på sikkerhetsnivå høy",
    description:
      "Ansatte og tiltaksledere kan logge inn med BankID. Identiteten er verifisert av en uavhengig tredjepart, ikke bare et selvvalgt passord.",
    points: [
      "Sikkerhetsnivå høy (Digdirs strengeste nivå)",
      "Kobles kun til eksisterende, godkjente kontoer",
      "Fødselsnummer lagres aldri i klartekst",
    ],
    href: "/blog/bankid-innlogging-tidum-sikkerhet",
  },
  {
    logoSrc: "/logos/buypass-logo.svg",
    logoAlt: "Buypass",
    name: "Buypass",
    tagline: "Ett eID-valg til, samme sikkerhet",
    description:
      "Buypass er et likestilt alternativ til BankID. Samme sikkerhetsnivå, og samme evne til å gjenkjenne én person uansett hvilken eID de velger.",
    points: [
      "Samme sikkerhetsnivå som BankID",
      "Én konto per person, uansett eID-valg",
      "Direkte mot Buypass, ingen mellommann",
    ],
    href: "/blog/buypass-innlogging-tidum",
  },
  {
    logoSrc: "/logos/documaster-logo.svg",
    logoAlt: "Documaster",
    name: "Documaster",
    tagline: "Noark 5-arkivering",
    description:
      "Godkjente rapporter arkiveres automatisk som journalposter etter Noark 5-standarden, lovkravet for offentlig sektors saksbehandling.",
    points: [
      "Automatisk saksmappe- og journalpost-opprettelse",
      "Idempotent, ingen dobbeltarkivering",
      "Kontraktstestet lokalt — kundesandkasse verifiseres ved oppkobling",
    ],
    href: "/blog/documaster-noark5-arkivering-tidum",
  },
];

export default function Integrasjoner() {
  usePublicLightTheme();
  const [, setLocation] = useLocation();

  useSEO({
    title: "Tidum sine integrasjoner: BankID, Buypass og Documaster",
    description:
      "Se hvordan Tidum kobles til BankID, Buypass og Documaster, og hva det betyr for sikkerhet, sporbarhet og dokumentasjonsplikt for sensitive sektorer som barnevern.",
    ogDescription:
      "Tidum sine integrasjoner: eID-innlogging med BankID og Buypass, og Noark 5-arkivering med Documaster.",
    ogImage: INTEGRASJONER_OG_IMAGE,
    ogImageAlt: "Tidum sine integrasjoner",
    canonical: "https://tidum.no/integrasjoner",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Tidum sine integrasjoner",
      url: "https://tidum.no/integrasjoner",
      description: "BankID, Buypass og Documaster-integrasjoner i Tidum",
      isPartOf: { "@type": "WebSite", name: "Tidum", url: "https://tidum.no" },
    },
  });

  const goToContact = () => setLocation("/kontakt");

  return (
    <main className="tidum-page tidum-page--public">
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
              <Link href="/blog" className="hidden items-center gap-2 text-base text-[#26373C] transition-colors hover:text-[var(--color-primary)] sm:inline-flex">
                <Newspaper className="h-4 w-4" />
                Blogg
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
            <h1 className="tidum-title" data-testid="text-integrasjoner-title">
              Tidum sine <span className="text-[var(--color-primary)]">integrasjoner</span>
            </h1>
            <p className="tidum-text mt-6 max-w-2xl mx-auto" data-testid="text-integrasjoner-subtitle">
              For virksomheter som barnevern, familietiltak og andre sensitive sektorer handler tillit
              om mer enn funksjoner. Det handler om hvem som kan logge inn, og hvor dokumentasjonen
              faktisk havner. Slik løser Tidum begge deler.
            </p>
          </div>
        </section>

        {/* ── Integration Cards ── */}
        <section className="tidum-fade-up mt-12">
          <div className="grid gap-5 md:grid-cols-3">
            {integrations.map((integration) => (
                <Card
                  key={integration.name}
                  className="h-full rounded-2xl border-[var(--color-border)] bg-white/95 shadow-[0_8px_28px_rgba(22,43,49,0.06)]"
                  data-testid={`card-integration-${integration.name.toLowerCase()}`}
                >
                  <CardContent className="flex h-full flex-col p-6 sm:p-7">
                    <div className="mb-4 flex h-11 items-center">
                      <img
                        src={integration.logoSrc}
                        alt={integration.logoAlt}
                        className="h-7 w-auto object-contain"
                      />
                    </div>
                    <h2 className="text-xl font-semibold text-[#1D2C31]">{integration.name}</h2>
                    <p className="mt-1 text-sm font-medium text-[var(--color-primary)]">{integration.tagline}</p>
                    <p className="mt-3 text-sm text-[var(--color-text-muted)]">{integration.description}</p>
                    <div className="mt-5 grid gap-2">
                      {integration.points.map((point) => (
                        <div key={point} className="flex items-start gap-2">
                          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                          <span className="text-sm text-[#2E3D43]">{point}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 pt-2">
                      <Link href={integration.href}>
                        <Button
                          variant="outline"
                          className="tidum-btn-secondary h-auto w-full px-4 py-2.5 text-sm font-medium"
                          data-testid={`button-read-${integration.name.toLowerCase()}`}
                        >
                          Les mer om {integration.name}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
            ))}
          </div>
        </section>

        {/* ── Trust Section ── */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8">
          <div className="grid gap-6 md:grid-cols-2 md:items-center">
            <div>
              <ShieldCheck className="h-10 w-10 text-[var(--color-primary)] mb-4" />
              <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] sm:text-4xl" data-testid="text-trust-title">
                Bygget for sensitive sektorer
              </h2>
              <p className="mt-4 text-[var(--color-text-muted)]">
                Barnevernsloven og forvaltningsloven stiller strenge krav til hvem som får tilgang til hva,
                og til at det kan dokumenteres i etterkant. Verifisert identitet ved innlogging og
                lovpålagt arkivering av rapporter er ikke tilleggsfunksjoner hos Tidum. De er en del av
                grunnmuren.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { title: "Verifisert identitet", detail: "BankID og Buypass på sikkerhetsnivå høy." },
                { title: "Sporbar tilgang", detail: "Hash-kjedet revisjonsspor på hver innlogging." },
                { title: "Lovpålagt arkivering", detail: "Noark 5-journalposter via Documaster." },
                { title: "Ingen dobbeltarbeid", detail: "Alt skjer automatisk i bakgrunnen." },
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
            Vil du vite mer om hvordan Tidum passer i deres systemlandskap?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-white/85">
            Vi tar gjerne en prat om hvilke integrasjoner som er relevante for akkurat dere.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={goToContact}
              className="h-auto rounded-xl bg-white px-6 py-3 text-[var(--color-primary)] hover:bg-white/90"
              data-testid="button-cta-contact"
            >
              Snakk med oss
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Link href="/blog">
              <Button
                variant="outline"
                className="h-auto rounded-xl border-white/70 px-6 py-3 text-white hover:bg-white/10"
                data-testid="button-cta-blog"
              >
                Les flere artikler
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
                {TIDUM_SUPPORT_EMAIL}
              </button>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Snarveier</p>
              <div className="mt-3 grid gap-2 text-sm">
                <Link href="/" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Forside
                </Link>
                <Link href="/hvorfor" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Hvorfor Tidum
                </Link>
                <Link href="/kontakt" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Kontakt oss
                </Link>
                <Link href="/personvern" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Personvern
                </Link>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Trygghet</p>
              <div className="mt-3 grid gap-2">
                {[
                  "Verifisert identitet ved innlogging",
                  "Lovpålagt arkivering av dokumentasjon",
                  "Bygget for norsk arbeidsliv",
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
            <p>© {new Date().getFullYear()} Tidum. Driftet av Creatorhub AS.</p>
            <p>Enkel registrering. Trygg dokumentasjon. Full oversikt.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
