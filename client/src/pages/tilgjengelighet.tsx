import { Button } from "@/components/ui/button";
import { ArrowRight, Accessibility, ChevronRight, CheckCircle2, CircleAlert } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { tidumPageStyles } from "@/lib/tidum-page-styles";
import { useSEO } from "@/hooks/use-seo";
import { usePublicLightTheme } from "@/hooks/use-public-light-theme";
import { LegalRichText } from "@/components/legal-rich-text";
import { useBrandInfo } from "@/hooks/use-brand-info";
import tidumWordmark from "@assets/tidum-wordmark.png";
import { TIDUM_SUPPORT_EMAIL } from "@shared/brand";

interface PageContent { title?: string; subtitle?: string; content?: string }

const LAST_UPDATED = "15. april 2026";

const TILGJENGELIGHET_CONTENT = `
## Sammendrag

Tidum er forpliktet til å gjøre plattformen tilgjengelig for alle brukere, inkludert personer med nedsatt funksjonsevne. Denne erklæringen beskriver hvordan vi oppfyller kravene i forskrift om universell utforming av IKT-løsninger, og hvordan du kan gi oss tilbakemelding hvis noe ikke fungerer for deg.

## 1. Samsvarsstatus

Tidum tilstreber samsvar med **WCAG 2.1 nivå AA** — den internasjonale standarden for tilgjengelig webinnhold. Samsvaret beskrives etter tre nivåer:

- **Fullt samsvar** — alle kravene i standarden er oppfylt
- **Delvis samsvar** — de fleste kravene er oppfylt, men enkelte mangler
- **Ikke i samsvar** — kravene er ikke oppfylt

**Tidum-plattformen er per 15. april 2026 i delvis samsvar med WCAG 2.1 AA.** De områdene der vi ikke er i fullt samsvar er listet under "Kjente avvik" lenger ned, sammen med planlagte tiltak.

## 2. Lovgrunnlag

Tilgjengelighet er lovpålagt etter:

- **Likestillings- og diskrimineringsloven § 17 og § 18** — generell plikt til universell utforming
- **Forskrift om universell utforming av IKT-løsninger** (FOR-2013-06-21-732) — tekniske krav
- **Direktiv (EU) 2016/2102** — implementert i EØS, med krav til tilgjengelighetserklæring for offentlige myndigheters løsninger
- **European Accessibility Act** (Direktiv (EU) 2019/882) — utvidet fra 28. juni 2025 til også å gjelde arbeidsrelatert IKT

For Tidum betyr dette at vi som leverandør til offentlig og privat sektor må levere en løsning som er brukbar for så mange som mulig, uavhengig av funksjonsevne.

## 3. Funksjoner vi har på plass

- **Skjermleserkompatibilitet** — hovedflyten (innlogging, tidsregistrering, rapportskriving, godkjenning) fungerer med NVDA, JAWS og VoiceOver
- **Tastaturnavigering** — alle interaktive elementer kan nås med Tab, og alle handlinger kan utløses uten mus
- **Synlig fokus** — fokusindikator med tilstrekkelig kontrast på alle elementer
- **Skalerbar tekst** — innhold fungerer ved opptil 200 % zoom uten tap av funksjonalitet
- **Kontrastforhold** — tekstinnhold oppfyller 4,5:1 (normal tekst) og 3:1 (stor tekst)
- **Alternativ tekst** — bilder har beskrivende alt-tekster, og dekorative bilder er markert med tom alt
- **Semantisk markup** — overskrifts-hierarki, landmark-roller og ARIA-attributter brukes gjennomgående
- **Skjemahjelp** — alle skjemafelt har synlig label, feilmeldinger er koblet til feltene, og obligatoriske felt er markert
- **Ingen fargeavhengig informasjon** — status og alarmer kommuniseres med både farge, ikon og tekst
- **Unngår bevegelse som kan utløse anfall** — ingen blink eller parallakse utover retningslinjene
- **Responsivt design** — plattformen fungerer fra 320 px viewport og oppover

## 4. Kjente avvik

Vi er åpne om hva som ennå ikke er i fullt samsvar. Disse avvikene er registrert og prioritert i roadmap:

### 4.1 Rapport-editor (Quill rich text)

**Problem:** Tredjeparts-editoren Quill brukt i rapportskriving har enkelte tastaturnavigasjons-mangler, spesielt i verktøylinjen.
**Status:** Arbeides med — plan om å bytte til en tilgjengelig rich-text-editor eller egen minimum-markup-editor.
**Omgåelse:** Skjermleserbrukere kan redigere rå tekst i editor-området og bruke hurtigtaster for fet/kursiv (Ctrl+B / Ctrl+I).

### 4.2 Enkelte datagridd

**Problem:** Noen store tabeller i tiltaksleder-dashbord og rapport-oversikt har ikke full ARIA-tabellrollestøtte.
**Status:** Tabellene oppgraderes med korrekt \`<table>\`-markup og \`aria-sort\` på sorterte kolonner.
**Omgåelse:** Kolonneoverskrifter er tilgjengelige via skjermleser; data kan leses rad for rad.

### 4.3 Fargekodede heatmap-grafikker

**Problem:** Kalenderheatmap og aktivitetsgrafer kommuniserer intensitet kun via farge.
**Status:** Tooltips med tallverdier lagt til som en del av oppgraderingen; tekstalternativ planlagt.
**Omgåelse:** Hovedinformasjonen er alltid tilgjengelig i den relaterte tabellen ved siden av grafen.

### 4.4 PDF-rapporter

**Problem:** PDF-er generert av Tidum er ikke alltid tagget etter PDF/UA (Universal Accessibility).
**Status:** Planlagt migrering til tagget PDF med overskriftsstruktur, tabelltagg og alt-tekst på bilder.
**Omgåelse:** HTML-versjonen av samme rapport er tilgjengelig i plattformen og er fullt tilgjengelig.

## 5. Testing og metode

Tilgjengelighetsarbeidet i Tidum er basert på:

- **Automatiske verktøy** — axe-core, Lighthouse og WAVE kjøres på alle hovedsider før release
- **Manuell testing** — tastaturnavigasjon, skjermleser (NVDA og VoiceOver), zoom 200 % og høy kontrast
- **Brukertesting** — planlagt involvering av brukere med nedsatt funksjonsevne for 2026
- **Kontinuerlig forbedring** — tilgjengelighet er del av PR-gjennomgang på fargekontrast, aria-attributter og tastaturstøtte

## 6. Teknisk informasjon

- **Plattform:** React 18, WAI-ARIA 1.2
- **Designsystem:** Shadcn/ui-baserte komponenter, tilpasset for Tidum
- **CSS:** Tailwind CSS med fargetokens som oppfyller WCAG AA-kontrast
- **Språk:** Norsk bokmål er primærspråk; korrekt \`lang="nb"\` settes på HTML-rot

## 7. Brukertilbakemelding

Hvis du opplever tilgjengelighetsproblemer i Tidum, vil vi gjerne høre fra deg. Vi forsøker å svare innen **fem arbeidsdager**.

- **E-post:** ${TIDUM_SUPPORT_EMAIL}
- **Emne i e-post:** "Tilgjengelighet — [kort beskrivelse]"
- **Oppgi:** hvilken side / funksjon det gjelder, hva som ikke fungerer, hvilken hjelpemiddel-teknologi du bruker (skjermleser, tastatur, zoom osv.), og nettleser / operativsystem

Om du ikke får tilfredsstillende svar fra oss, kan du klage til:

**Tilsynet for universell utforming av IKT (uu-tilsynet)**
Digitaliseringsdirektoratet (Digdir)
postmottak@digdir.no
[https://www.uutilsynet.no](https://www.uutilsynet.no)

## 8. Oppdatering av erklæringen

Denne erklæringen gjennomgås minst én gang i året, og oppdateres ved større endringer i plattformen. Sist gjennomgått: ${LAST_UPDATED}.

Ansvarlig for tilgjengelighetsarbeidet: Produktteamet i Creatorhub AS, som drifter Tidum.
`;

export default function Tilgjengelighet() {
  usePublicLightTheme();
  const brand = useBrandInfo();
  // Pull editable copy from CMS (falls back to baked-in default below).
  const { data: cmsPage } = useQuery<PageContent>({
    queryKey: ["/api/cms/pages/tilgjengelighet"],
    staleTime: 5 * 60_000,
  });
  const cmsContent = cmsPage?.content?.trim();
  const renderedContent = cmsContent && cmsContent.length > 0 ? cmsContent : TILGJENGELIGHET_CONTENT;

  useSEO({
    title: "Tilgjengelighetserklæring – Tidum",
    description:
      "Tidum jobber for WCAG 2.1 AA-samsvar. Les samsvarsstatus, kjente avvik og hvordan du gir tilbakemelding om tilgjengelighet.",
    ogTitle: "Tilgjengelighetserklæring for Tidum",
    ogDescription:
      "Status for WCAG 2.1 AA i Tidum, kjente avvik og kanaler for tilbakemelding.",
    ogImage: "https://tidum.no/screenshots/landing.png",
    ogImageAlt: "Tidum tilgjengelighet — WCAG 2.1 AA-samsvar",
    ogType: "website",
    canonical: "https://tidum.no/tilgjengelighet",
  });

  return (
    <main className="tidum-page tidum-page--public">
      <style>{tidumPageStyles}</style>

      <div className="rt-container pb-20 pt-8">
        {/* Header Panel */}
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
                <Accessibility className="h-7 w-7 text-[#3A8B73]" />
              </div>
            </div>
            <h1 className="tidum-title">Tilgjengelighetserklæring</h1>
            <p className="tidum-text mt-4 max-w-2xl mx-auto">
              Tidum skal være brukbar for alle — uavhengig av funksjonsevne, hjelpemiddel-teknologi eller nettleser.
            </p>
            <p className="text-sm text-[var(--color-text-muted)] mt-3">
              Sist oppdatert: {LAST_UPDATED}
            </p>
          </div>
        </section>

        {/* Status summary cards */}
        <section className="tidum-fade-up mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-[#3A8B73]" />
              <div>
                <p className="text-sm font-semibold text-[#1E2C30]">Standard</p>
                <p className="text-sm text-[var(--color-text-muted)]">WCAG 2.1 AA</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <div className="flex items-start gap-3">
              <CircleAlert className="h-6 w-6 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-[#1E2C30]">Samsvarsstatus</p>
                <p className="text-sm text-[var(--color-text-muted)]">Delvis samsvar</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <div className="flex items-start gap-3">
              <Accessibility className="h-6 w-6 shrink-0 text-[var(--color-primary)]" />
              <div>
                <p className="text-sm font-semibold text-[#1E2C30]">Tilbakemelding</p>
                <a
                  href={`mailto:${brand.supportEmail}?subject=Tilgjengelighet`}
                  className="text-sm text-[var(--color-primary)] hover:underline"
                >
                  {brand.supportEmail}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="tidum-fade-up mt-8 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8 md:p-10">
          <div className="max-w-none">
            <LegalRichText content={renderedContent} />
          </div>
        </section>

        {/* Footer */}
        <footer className="tidum-fade-up mt-10 rounded-3xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,246,0.92))] px-6 py-8 sm:px-8">
          <div className="grid gap-8 md:grid-cols-[1.2fr,0.9fr,1fr]">
            <div>
              <img src={tidumWordmark} alt="Tidum" className="h-10 w-auto" />
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
                Arbeidstidssystem for felt, turnus og norsk dokumentasjonskrav.
              </p>
              <Link
                href="/kontakt"
                className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]"
              >
                {brand.supportEmail}
              </Link>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Snarveier</p>
              <div className="mt-3 grid gap-2 text-sm">
                <Link href="/" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Forside
                </Link>
                <Link href="/personvern" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Personvern
                </Link>
                <Link href="/vilkar" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Vilkår
                </Link>
                <Link href="/kontakt" className="inline-flex items-center gap-2 text-left text-[#2B3C41] transition-colors hover:text-[var(--color-primary)]">
                  <ChevronRight className="h-4 w-4" />
                  Kontakt oss
                </Link>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#35545B]">Prinsipper</p>
              <div className="mt-3 grid gap-2">
                {[
                  "Brukbar med tastatur og skjermleser",
                  "Kontrast og skrift skalerer",
                  "Kontinuerlig forbedring",
                ].map((item) => (
                  <div
                    key={item}
                    className="inline-flex items-start gap-2 rounded-lg bg-white/75 px-3 py-2 text-sm text-[#2B3C41]"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-secondary)]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-text-muted)]">
            <p>© {new Date().getFullYear()} Tidum. Driftet av Creatorhub AS.</p>
            <p>Tilgjengelig for alle, uansett hjelpemiddel.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
