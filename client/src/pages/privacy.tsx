import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, ChevronRight, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { tidumPageStyles } from "@/lib/tidum-page-styles";
import { useSEO } from "@/hooks/use-seo";
import tidumWordmark from "@assets/tidum-wordmark.png";

interface PageContent {
  title: string;
  subtitle: string;
  content: string;
  last_updated: string;
}

export default function Privacy() {
  useSEO({
    title: "Personvernerklæring – Tidum",
    description: "Les Tidums personvernerklæring. Vi behandler dine data trygt i samsvar med GDPR og norsk personvernlovgivning.",
    canonical: "https://tidum.no/personvern",
    robots: "noindex, follow",
  });

  const { data: pageContent } = useQuery<PageContent>({
    queryKey: ['/api/cms/pages/privacy'],
  });

  const content = pageContent || {
    title: "Personvernerklæring",
    subtitle: "Slik beskytter vi dine personopplysninger",
    content: `
## 1. Innledning
Tidum AS ("vi", "oss", "vår") er opptatt av å beskytte personvernet til våre brukere. Denne personvernerklæringen forklarer hvordan vi samler inn, bruker, deler og beskytter personopplysninger.

## 2. Hvilke opplysninger vi samler inn
Vi samler inn følgende typer personopplysninger:
- **Kontaktinformasjon**: Navn, e-postadresse, telefonnummer
- **Kontoopplysninger**: Brukernavn, passord (kryptert)
- **Arbeidsdata**: Timeregistreringer, prosjektdata, saksnumre
- **Tekniske data**: IP-adresse, nettlesertype, enhetsdata

## 3. Hvordan vi bruker opplysningene
Vi bruker personopplysningene til å:
- Levere og forbedre våre tjenester
- Kommunisere med deg om din konto
- Sende viktige oppdateringer og varsler
- Overholde juridiske forpliktelser

## 4. Deling av opplysninger
Vi deler ikke personopplysninger med tredjeparter, med unntak av:
- Når du har gitt samtykke
- For å oppfylle juridiske forpliktelser
- Med tjenesteleverandører som behandler data på våre vegne

## 5. Lagring og sikkerhet
Vi lagrer personopplysninger så lenge det er nødvendig for formålene beskrevet i denne erklæringen. Vi bruker bransjestandarder for sikkerhet, inkludert kryptering og sikre servere.

## 6. Dine rettigheter
Du har rett til å:
- Be om innsyn i dine personopplysninger
- Be om retting eller sletting
- Protestere mot behandling
- Trekke tilbake samtykke

## 7. Informasjonskapsler (cookies)
Vi bruker informasjonskapsler for å forbedre brukeropplevelsen. Du kan administrere dine preferanser i nettleserinnstillingene.

## 8. Kontakt
Har du spørsmål om personvern? Kontakt oss på support@tidum.no
    `,
    last_updated: "20. desember 2025"
  };

  return (
    <main className="tidum-page">
      <style>{tidumPageStyles}</style>

      <div className="rt-container pb-20 pt-8">
        {/* ── Header Panel ── */}
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
              <Link href="/hvorfor" className="hidden items-center gap-2 text-base text-[#26373C] transition-colors hover:text-[var(--color-primary)] sm:inline-flex">
                Hvorfor Tidum?
              </Link>
              <Link href="/kontakt">
                <Button className="tidum-btn-primary inline-flex h-auto items-center px-6 py-3 text-base font-semibold">
                  Be om demo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </header>

          <div className="relative z-10 px-6 py-12 sm:px-8 sm:py-16 text-center max-w-4xl mx-auto">
            <div className="flex justify-center mb-5">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E7F3EE]">
                <Shield className="h-7 w-7 text-[#3A8B73]" />
              </div>
            </div>
            <h1 className="tidum-title" data-testid="text-privacy-title">{content.title}</h1>
            <p className="tidum-text mt-4 max-w-2xl mx-auto" data-testid="text-privacy-subtitle">
              {content.subtitle}
            </p>
            <p className="text-sm text-[var(--color-text-muted)] mt-3" data-testid="text-last-updated">
              Sist oppdatert: {content.last_updated}
            </p>
          </div>
        </section>

        {/* ── Content ── */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8 md:p-10" data-testid="card-privacy-content">
          <div
            className="prose max-w-none text-[var(--color-text-main)]"
            data-testid="text-privacy-content"
            dangerouslySetInnerHTML={{
              __html: content.content
                .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-8 mb-4 text-[#15343D]">$1</h2>')
                .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-6 mb-3 text-[#15343D]">$1</h3>')
                .replace(/^\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
                .replace(/^- (.*$)/gim, '<li class="ml-4 text-[#5F6B6D]">$1</li>')
                .replace(/\n\n/g, '</p><p class="mb-4 text-[#5F6B6D]">')
            }}
          />
        </section>

        {/* ── Footer ── */}
        <footer className="tidum-fade-up mt-10 rounded-3xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,246,0.92))] px-6 py-8 sm:px-8">
          <div className="grid gap-8 md:grid-cols-[1.2fr,0.9fr,1fr]">
            <div>
              <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto" />
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
                Arbeidstidssystem for felt, turnus og norsk dokumentasjonskrav.
              </p>
              <Link href="/kontakt" className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]">
                support@tidum.no
              </Link>
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
                  Hvorfor Tidum?
                </Link>
                <Link href="/vilkar" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]" data-testid="link-terms">
                  <ChevronRight className="h-4 w-4" />
                  Vilkår
                </Link>
                <Link href="/kontakt" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]" data-testid="link-contact">
                  <ChevronRight className="h-4 w-4" />
                  Kontakt oss
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
            <p data-testid="text-copyright">© {new Date().getFullYear()} Tidum. Alle rettigheter reservert.</p>
            <p>Enkel registrering. Trygg dokumentasjon. Full oversikt.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}

