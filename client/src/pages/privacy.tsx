import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, ChevronRight, CheckCircle2 } from "lucide-react";
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

export default function Privacy() {
  usePublicLightTheme();
  useSEO({
    title: "Personvernerklæring – Tidum",
    description: "Les Tidums personvernerklæring. Vi behandler dine data trygt i samsvar med GDPR og norsk personvernlovgivning.",
    canonical: "https://tidum.no/personvern",
    robots: "noindex, follow",
  });

  const { data: pageContent } = useQuery<PageContent>({
    queryKey: ['/api/cms/pages/privacy'],
  });

  const defaultContent: PageContent = {
    title: "Personvernerklæring",
    subtitle: "Slik beskytter vi dine personopplysninger",
    content: `
## 1. Hvem denne erklæringen gjelder for
Denne personvernerklæringen gjelder for den offentlige nettsiden til Tidum, tilgangsforespørsler, supporthenvendelser og bruk av Tidum-plattformen. Tidum er et produkt levert av **Creatorhub AS**.

## 2. Roller og behandlingsansvar
For opplysninger som gjelder kontakt med oss, markedsdialog og bruk av den offentlige nettsiden, er **Creatorhub AS behandlingsansvarlig**.
Når en virksomhetskunde bruker Tidum til arbeidstidsregistrering, dokumentasjon og oppfølging av egne ansatte eller innleide, vil kunden som hovedregel være **behandlingsansvarlig**, mens Creatorhub AS behandler data som **databehandler** på vegne av kunden.

## 3. Hvilke opplysninger vi kan behandle
Vi kan behandle følgende kategorier opplysninger:
- **Kontakt- og virksomhetsopplysninger**: navn, e-post, telefon, virksomhetsnavn, rolle og informasjon du sender i skjemaer eller dialog med oss.
- **Konto- og tilgangsopplysninger**: innloggingsinformasjon, organisasjonstilknytning, invitasjoner, roller og godkjenninger.
- **Bruks- og arbeidsdata**: tidsregistreringer, rapporter, notater, saksreferanser og annet innhold som registreres i løsningen av autoriserte brukere.
- **Posisjonsdata (GPS)**: Når miljøarbeider stempler inn på en sak, kan vi fange brukerens geografiske posisjon én gang for å beregne kjøregodtgjørelse. Dette regnes som **kontrolltiltak** etter Arbeidsmiljøloven §9-1 og krever saklig grunn, drøfting og skriftlig informasjon. Posisjonsdata avrundes etter 90 dager og slettes etter 5 år.
- **Helsedata (sykmeldinger)**: Hvis en bruker laster opp en sykmelding, regnes dette som særlig kategori av personopplysninger (GDPR art. 9). Slik dokumentasjon slettes så snart fraværet er avregnet, normalt innen 1 år.
- **Endringshistorikk (audit-logg)**: Hvem har endret hva og når på timeoppføringer. Lagres for sporbarhet og revisjon. IP-adresse og nettleser-streng inngår.
- **Tekniske opplysninger**: IP-adresse, nettleser, enhet, tidspunkt, feillogger og sikkerhetshendelser.
- **Analyse på offentlige sider**: sidevisninger, knappetrykk og anonymiserte innsiktssignaler når du godtar analyse.

## 4. Hvorfor vi behandler opplysningene
Vi behandler opplysninger for å:
- levere, drifte og sikre Tidum,
- administrere tilgang, invitasjoner og godkjenninger,
- yte support og følge opp forespørsler,
- forbedre offentlig informasjon, onboarding og tjenestekvalitet,
- oppfylle rettslige forpliktelser knyttet til sikkerhet, regnskap og dokumentasjon.

## 5. Behandlingsgrunnlag
Våre behandlingsgrunnlag kan være ett eller flere av følgende:
- **avtale**, når behandling er nødvendig for å levere tjenesten,
- **rettslig forpliktelse**, når vi må oppbevare eller dokumentere forhold etter lov,
- **berettiget interesse**, for sikkerhet, drift, support og forbedring av tjenesten,
- **samtykke**, der dette kreves, for eksempel for analyse på offentlige sider.

## 6. Deling og databehandlere
Vi deler ikke personopplysninger unødvendig. Opplysninger kan behandles av underleverandører som leverer hosting, databaser, autentisering, analyse, supportverktøy og annen teknisk infrastruktur på våre vegne. Når vi bruker databehandlere, inngår vi nødvendige avtaler og stiller krav til sikkerhet og konfidensialitet.

## 7. Overføring utenfor EU/EØS
Dersom vi eller våre underleverandører behandler opplysninger utenfor EU/EØS, skal dette være basert på gyldig overføringsgrunnlag, for eksempel EU-kommisjonens standard kontraktsklausuler og supplerende sikkerhetstiltak der det er nødvendig.

## 8. Lagring og sletting
Vi lagrer opplysninger så lenge det er nødvendig for formålet de ble samlet inn for, eller så lenge lovpålagte krav krever det. Kundedata slettes eller anonymiseres når kundeforholdet avsluttes, med mindre annet følger av avtale eller lov.

**Konkrete oppbevaringstider** (kan justeres per kunde i databehandleravtalen):

| Datatype | Oppbevaring | Hjemmel |
| --- | --- | --- |
| Timeregistreringer (log_row) | 5 år, deretter pseudonymisert | Bokføringsloven §13 |
| Endringshistorikk (audit) | 5 år (25 år for barnevern) | Bokføringsloven §13 / Barnevernsloven §10-1 |
| GPS-koordinater på kjøreloggen | Avrundes til ~110m presisjon etter 90 dager, slettes etter 5 år | Datatilsynet — minimering for GPS i arbeidsforhold |
| Sykmeldinger (helsedata) | 1 år | Datatilsynet — kort oppbevaring av Art. 9 |
| Saksrapporter | 5–25 år avhengig av sektor | Barnevernsloven §10 / NAV-loven / kommunale lovhjemler |
| Påloggingssesjoner | 30 dager | Berettiget interesse — driftsstabilitet |

Automatiske slette-rutiner kjører daglig for å håndheve disse fristene.

## 9. Informasjonskapsler og analyse
Tidum bruker **nødvendige** mekanismer for sikkerhet, sesjonshåndtering og for å huske samtykkevalget ditt. Dersom du godtar analyse på offentlige sider, kan vi i tillegg registrere sidevisninger, CTA-klikk og generell bruk av offentlige innholdssider for å forbedre nettstedet. Analyse brukes ikke for å låse opp funksjoner i selve arbeidsflaten.

## 10. Dine rettigheter
Du kan be om:
- **Innsyn (art. 15)** — du kan laste ned all data Tidum har om deg via «Min profil → Last ned dataene mine».
- **Retting (art. 16)** av uriktige eller ufullstendige opplysninger.
- **Sletting (art. 17)** — sletteknappen i kontoinnstillingene pseudonymiserer profilen din. Bokføringsloven §13 hindrer oss fra å hard-slette timebilag i 5 år, men oppføringene kobles ikke lenger til deg som person.
- **Begrensning eller innsigelse** mot behandling (art. 18 og 21).
- **Dataportabilitet (art. 20)** — eksport leveres som strukturert JSON-fil.
- **Trekke tilbake samtykke** for behandling som bygger på samtykke. Slå av GPS-fangst i kontoinnstillingene; auto-kjøregodt deaktiveres da umiddelbart.

Henvendelser besvares innen 30 dager (art. 12 nr. 3).

## 11. Sikkerhet
Vi arbeider med tilgangskontroll, logging, sikre overføringer og tekniske og organisatoriske tiltak for å beskytte data mot uautorisert tilgang, endring, tap eller misbruk. Ingen løsning er helt risikofri, men vi arbeider fortløpende med sikkerhetsforbedringer.

## 12. Kontakt og klage
Spørsmål om personvern kan rettes til **${TIDUM_SUPPORT_EMAIL}** eller **${TIDUM_LEGAL_EMAIL}**. Dersom du mener behandlingen vår er i strid med regelverket, kan du også kontakte **Datatilsynet**.
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
                <Shield className="h-7 w-7 text-[#3A8B73]" />
              </div>
            </div>
            <h1 className="tidum-title" data-testid="text-privacy-title">{resolvedContent.title}</h1>
            <p className="tidum-text mt-4 max-w-2xl mx-auto" data-testid="text-privacy-subtitle">
              {resolvedContent.subtitle}
            </p>
            <p className="text-sm text-[var(--color-text-muted)] mt-3" data-testid="text-last-updated">
              Sist oppdatert: {resolvedContent.last_updated}
            </p>
          </div>
        </section>

        {/* ── Content ── */}
        <section className="tidum-fade-up mt-12 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8 md:p-10" data-testid="card-privacy-content">
          <div className="max-w-none" data-testid="text-privacy-content">
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
            <p data-testid="text-copyright">© {new Date().getFullYear()} Tidum. Driftet av Creatorhub AS.</p>
            <p>Enkel registrering. Trygg dokumentasjon. Full oversikt.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
