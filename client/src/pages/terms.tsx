import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, ChevronRight, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { tidumPageStyles } from "@/lib/tidum-page-styles";
import { useSEO } from "@/hooks/use-seo";
import { usePublicLightTheme } from "@/hooks/use-public-light-theme";
import { LegalRichText } from "@/components/legal-rich-text";
import tidumWordmark from "@assets/tidum-wordmark.png";
import { TIDUM_LEGAL_EMAIL, TIDUM_SUPPORT_EMAIL } from "@shared/brand";

interface PageContent {
  title: string;
  subtitle: string;
  content: string;
  last_updated: string;
}

export default function Terms() {
  usePublicLightTheme();
  useSEO({
    title: "Brukervilkår – Tidum",
    description: "Les Tidums brukervilkår for bruk av plattformen. Detaljer om rettigheter, ansvar og betingelser.",
    canonical: "https://tidum.no/vilkar",
    robots: "noindex, follow",
  });

  const { data: pageContent } = useQuery<PageContent>({
    queryKey: ['/api/cms/pages/terms'],
  });

  const defaultContent: PageContent = {
    title: "Brukervilkår",
    subtitle: "Vilkår for bruk av Tidum",
    content: `
## 1. Om vilkårene
Disse vilkårene gjelder bruk av Tidum, som leveres og driftes av **Creatorhub AS**. Ved å bruke løsningen aksepterer virksomheten og autoriserte brukere disse vilkårene.

## 2. Hvem Tidum er laget for
Tidum tilbys til virksomheter og autoriserte brukere som arbeider med drift, dokumentasjon, arbeidstid og oppfølging innenfor blant annet barn, omsorg og miljøarbeid. Tilgang gis etter vurdering, invitasjon eller godkjenning.

## 3. Tilgang, roller og kontoansvar
- virksomhetsledere eller administratorer kan få opprettet konto og tildele tilgang videre,
- miljøarbeidere og andre brukere kan bare få tilgang når virksomheten eller systemadministrator har godkjent dette,
- du er ansvarlig for å beskytte innloggingsinformasjonen din og for aktivitet som skjer gjennom din konto,
- du skal varsle oss uten ugrunnet opphold ved mistanke om misbruk eller uautorisert tilgang.

## 4. Tillatt bruk
Tidum skal bare brukes til lovlige og avtalte formål. Det er ikke tillatt å:
- forsøke å skaffe seg uautorisert tilgang til kontoer, data eller infrastruktur,
- dele tilgang med uvedkommende,
- laste opp eller spre skadelig kode,
- bruke løsningen på en måte som kan skade tjenesten, andre kunder eller tredjeparter.

## 5. Kundedata og ansvar
Virksomhetskunden er ansvarlig for at registrerte opplysninger, rapporter og dokumentasjon som legges inn i Tidum har et lovlig grunnlag. Kunden er også ansvarlig for å gi riktige tilgangsnivåer til ansatte, miljøarbeidere og ledere.

## 6. Integrasjoner og tredjepartstjenester
Tidum kan bruke eller integreres med tredjepartstjenester som autentisering, hosting, analyse og kommunikasjonsverktøy. Slike tjenester brukes som en del av leveransen eller etter nærmere avtale.

## 7. Tilgjengelighet og endringer
Vi arbeider for stabil drift, men garanterer ikke at tjenesten alltid er uten avbrudd eller feil. Vi kan oppdatere, forbedre eller endre funksjonalitet når det er nødvendig for drift, sikkerhet, lovkrav eller videre produktutvikling.

## 8. Pris og kommersielle vilkår
Pris, omfang, implementering og eventuelle tilleggstjenester avtales særskilt med virksomhetskunden. Med mindre annet er avtalt, gjelder avtalte betalingsfrister og kommersielle vilkår i tilbud, ordre eller egen avtale.

## 9. Immaterielle rettigheter
Tidum, herunder programvare, design, innhold, struktur, navn og dokumentasjon, tilhører Creatorhub AS eller våre lisensgivere. Kunden får en begrenset, ikke-eksklusiv rett til å bruke løsningen i avtaleperioden.

## 10. Oppsigelse, sperring og avslutning
Vi kan suspendere eller stenge tilgang ved mislighold, sikkerhetsrisiko, misbruk eller brudd på disse vilkårene. Kunden kan avslutte bruken i henhold til avtalt oppsigelsestid. Ved avslutning håndteres data i samsvar med avtale og personvernerklæring.

## 11. Ansvarsbegrensning
Så langt loven tillater, er Creatorhub AS ikke ansvarlig for indirekte tap, følgeskader, tapt fortjeneste eller tap som skyldes forhold utenfor vår rimelige kontroll. Eventuelt direkte ansvar er begrenset til det kunden har betalt for tjenesten i den relevante avtaleperioden, med mindre annet følger av ufravikelig lov.

## 12. Endringer i vilkårene
Vi kan oppdatere disse vilkårene når det er nødvendig. Vesentlige endringer varsles på en rimelig måte. Fortsatt bruk etter ikrafttredelse innebærer aksept av oppdaterte vilkår.

## 13. Lovvalg og verneting
Vilkårene er underlagt norsk rett. Tvister søkes løst i minnelighet. Dersom det ikke lykkes, er **Oslo tingrett** avtalt verneting, med mindre annet følger av ufravikelig lov eller særskilt avtale.

## 14. Kontakt
Spørsmål om vilkårene kan rettes til **${TIDUM_SUPPORT_EMAIL}** eller **${TIDUM_LEGAL_EMAIL}**.
    `,
    last_updated: "6. april 2026"
  };

  const hasRichCmsContent = Boolean(pageContent?.content && pageContent.content.trim().length > 800);
  const content = hasRichCmsContent ? pageContent! : defaultContent;

  const resolvedContent = {
    ...content,
    content: content.content.replaceAll("Tidum AS", "Creatorhub AS"),
  };

  return (
    <main className="tidum-page tidum-page--public">
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
                <FileText className="h-7 w-7 text-[#3A8B73]" />
              </div>
            </div>
            <h1 className="tidum-title" data-testid="text-terms-title">{resolvedContent.title}</h1>
            <p className="tidum-text mt-4 max-w-2xl mx-auto" data-testid="text-terms-subtitle">
              {resolvedContent.subtitle}
            </p>
            <p className="text-sm text-[var(--color-text-muted)] mt-3" data-testid="text-last-updated">
              Sist oppdatert: {resolvedContent.last_updated}
            </p>
          </div>
        </section>

        {/* ── Content ── */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8 md:p-10" data-testid="card-terms-content">
          <div className="max-w-none" data-testid="text-terms-content">
            <LegalRichText content={resolvedContent.content} />
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
              <Link href="/kontakt" className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]">
                {TIDUM_SUPPORT_EMAIL}
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
                <Link href="/personvern" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]" data-testid="link-privacy">
                  <ChevronRight className="h-4 w-4" />
                  Personvern
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
            <p data-testid="text-copyright">© {new Date().getFullYear()} Tidum. Driftet av Creatorhub AS.</p>
            <p>Enkel registrering. Trygg dokumentasjon. Full oversikt.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
