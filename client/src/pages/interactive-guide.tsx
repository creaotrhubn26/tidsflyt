import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Folder,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  Mail,
  Palette,
  PlayCircle,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Timer,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSEO } from "@/hooks/use-seo";
import { usePublicLightTheme } from "@/hooks/use-public-light-theme";
import { TIDUM_SUPPORT_EMAIL } from "@shared/brand";
import tidumWordmark from "@assets/tidum-wordmark.png";

/* ─────────────────────────────────────────────────────────────────────────
   GUIDE DATA — categorical, mirrors the in-app sidebar (portal-layout.tsx).
   Update this array when features change; the rendering loop adapts.
   ───────────────────────────────────────────────────────────────────────── */

type Role = "miljoarbeider" | "tiltaksleder" | "vendor_admin" | "super_admin";

interface Article {
  id: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  inAppPath?: string;
  roles?: Role[];
  steps?: { label: string; detail?: string }[];
  tips?: string[];
  screenshot?: string; // path under /guide-screenshots/<file>.png — falls back to illustration
}

interface Category {
  id: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  accent: string; // tailwind gradient classes
  articles: Article[];
}

const CATEGORIES: Category[] = [
  {
    id: "oversikt",
    label: "Oversikt",
    blurb: "Start dagen med dashboardet — alt du trenger å gjøre samlet på ett sted.",
    icon: LayoutDashboard,
    accent: "from-sky-500 to-blue-600",
    articles: [
      {
        id: "dashboard",
        title: "Dashboardet",
        summary: "Personalisert hjemmebase: oppgaver, varsler og snarveier prioritert etter rolle.",
        icon: LayoutDashboard,
        inAppPath: "/dashboard",
        screenshot: "dashboard.png",
        steps: [
          { label: "Sjekk Tiltak som krever oppfølging", detail: "Fargekodede tiles viser deg hva som haster — rapporter til gjennomgang, tiltak nær frist, klientsaker uten kontakt." },
          { label: "Bruk hurtigaksjoner", detail: "Kortene øverst tar deg rett til å registrere timer, åpne en sak eller skrive en ny rapport." },
          { label: "Følg statistikken", detail: "Trender for timer, brukere og saker oppdateres automatisk for valgt periode." },
        ],
        tips: [
          "Bytt periode (uke/måned/i dag) øverst til høyre for å se data i kontekst.",
          "Klikk på en tile for å hoppe rett til den filtrerte listen.",
        ],
      },
      {
        id: "tiltaksleder-oversikt",
        title: "Tiltaksleder‑oversikten",
        summary: "Egen oversikt for ledere: ventende godkjenninger, returnerte rapporter og teamets tilgjengelighet.",
        icon: ClipboardCheck,
        inAppPath: "/tiltaksleder",
        roles: ["tiltaksleder", "vendor_admin"],
        screenshot: "tiltaksleder-dashboard.png",
        steps: [
          { label: "Gjennomgå rapporter", detail: "Se hvem som venter på godkjenning og åpne dem direkte." },
          { label: "Følg opp returnerte rapporter", detail: "Listen viser hvem som har fått en kommentar tilbake — sjekk at endringer kommer." },
          { label: "Sjekk fravær neste 14 dager", detail: "Planlegg bemanning før uka starter." },
        ],
      },
      {
        id: "kom-i-gang",
        title: "Kom i gang med Tidum",
        summary: "Sjekkliste som ledet deg gjennom de første viktige stegene — finnes i sidemenyen.",
        icon: PlayCircle,
        steps: [
          { label: "Bekreft profilen din" },
          { label: "Legg til første institusjon (Brreg‑søk)", detail: "Slå opp organisasjonsnummer eller bedriftsnavn for å auto‑fylle adresse + virksomhetstype." },
          { label: "Opprett første sak og tildel miljøarbeidere" },
          { label: "Inviter teamet via delbar lenke" },
        ],
      },
    ],
  },
  {
    id: "saker",
    label: "Saker & klienter",
    blurb: "Opprett saker, koble dem til oppdragsgivere, og tildel dem til miljøarbeidere.",
    icon: Folder,
    accent: "from-indigo-500 to-purple-600",
    articles: [
      {
        id: "ny-sak",
        title: "Opprette en sak",
        summary: "Brønnøysundregisteret er innebygd — søk, koble og bli ferdig på sekunder.",
        icon: Plus,
        inAppPath: "/cases",
        roles: ["tiltaksleder", "vendor_admin"],
        screenshot: "ny-sak.png",
        steps: [
          { label: "Klikk «Ny sak»" },
          { label: "Søk i Brønnøysundregisteret", detail: "Skriv organisasjonsnummeret (9 siffer) eller bedriftsnavn — adresse, virksomhetstype og kontaktinfo fylles inn." },
          { label: "Velg klient og tiltakstype" },
          { label: "Tildel miljøarbeidere", detail: "De får varsel og saken dukker opp i deres «Mine saker»." },
        ],
        tips: [
          "Lim inn org.nr fra utklippstavlen — Tidum oppdager formatet automatisk.",
          "Saksnummer genereres etter mønsteret du har valgt under Innstillinger → Saksnummer.",
        ],
      },
      {
        id: "tildele",
        title: "Tildele saker",
        summary: "Flere miljøarbeidere kan jobbe på samme sak. Tildelinger varsler dem direkte.",
        icon: UserPlus,
        roles: ["tiltaksleder", "vendor_admin"],
        steps: [
          { label: "Åpne saken" },
          { label: "Klikk «Tildel»", detail: "Velg én eller flere brukere — de får e‑post og dashboardvarsel." },
        ],
      },
      {
        id: "institusjoner",
        title: "Institusjoner og oppdragsgivere",
        summary: "Administrer hvilke virksomheter dere jobber for — kun synlig for ledere og admin.",
        icon: Building2,
        inAppPath: "/institusjoner",
        roles: ["tiltaksleder", "vendor_admin", "super_admin"],
        screenshot: "institusjoner.png",
        steps: [
          { label: "Legg til ny institusjon", detail: "Bruk Brreg‑søk for å sikre korrekt org.nr og adresse." },
          { label: "Velg standard rapportmal", detail: "Saker tilknyttet denne institusjonen får automatisk valgt mal når miljøarbeider skriver rapport." },
        ],
      },
      {
        id: "invitasjoner",
        title: "Invitasjoner og delbare lenker",
        summary: "Inviter team via e‑post eller én delbar lenke som flere kan bruke.",
        icon: UserPlus,
        inAppPath: "/invites",
        roles: ["tiltaksleder", "vendor_admin"],
        screenshot: "invitasjoner.png",
        tips: [
          "Delbare lenker kan begrenses i tid eller antall bruk.",
          "Brukere som registrerer seg via lenken havner automatisk på riktig leverandør.",
        ],
      },
    ],
  },
  {
    id: "rapportering",
    label: "Rapportering",
    blurb: "Skriv strukturerte saksrapporter, send til godkjenning, håndter avvik.",
    icon: FileText,
    accent: "from-emerald-500 to-teal-600",
    articles: [
      {
        id: "ny-rapport",
        title: "Skrive en saksrapport",
        summary: "Rapportmaler tilpasser seg sektor og institusjon. Bedrift, oppdragsgiver og tiltaksleder fylles automatisk.",
        icon: FileText,
        inAppPath: "/rapporter",
        screenshot: "rapport-skrive.png",
        steps: [
          { label: "Velg en tildelt sak" },
          { label: "Bedrift, oppdragsgiver og tiltaksleder fylles automatisk", detail: "Disse feltene er låst når en sak er valgt — det sikrer konsistens på tvers av rapporter." },
          { label: "Fyll inn periode, mål og aktiviteter", detail: "Aktivitets‑maler gir deg standardstruktur du kan tilpasse." },
          { label: "Auto‑lagring tar resten", detail: "Tidum lagrer endringer fortløpende — du kan trygt lukke fanen." },
          { label: "Send til godkjenning når du er ferdig" },
        ],
        tips: [
          "GDPR‑hjelperen fjerner automatisk personnavn fra fritekst hvis det er aktivert i Innstillinger.",
          "Dobbeltklikk en aktivitet i ukesvisningen for rask redigering.",
        ],
      },
      {
        id: "godkjenning",
        title: "Godkjenne rapporter",
        summary: "Som tiltaksleder ser du innsendte rapporter under «Godkjenning». Returner med kommentar når noe må fikses.",
        icon: ClipboardCheck,
        inAppPath: "/rapporter/godkjenning",
        roles: ["tiltaksleder"],
        screenshot: "godkjenning.png",
        steps: [
          { label: "Åpne rapporten" },
          { label: "Legg igjen kommentar per seksjon", detail: "Forfatteren ser kommentarene direkte på rett sted." },
          { label: "Godkjenn eller returner" },
        ],
      },
      {
        id: "rapport-maler",
        title: "Rapport‑maler (admin)",
        summary: "Definer hvilke seksjoner en rapport skal inneholde for ulike sektorer.",
        icon: ClipboardList,
        inAppPath: "/admin/rapport-maler",
        roles: ["vendor_admin", "super_admin"],
        steps: [
          { label: "Klone systemmal eller start blank" },
          { label: "Legg til seksjoner (tekst, sjekkliste, observasjon)" },
          { label: "Velg standardmal per institusjon", detail: "Spar miljøarbeideren for å velge mal hver gang." },
        ],
      },
      {
        id: "avvik",
        title: "Avvik og hendelser",
        summary: "Registrer avvik direkte fra en rapport. Alvorlighetsgrad: lav, middels, høy, kritisk.",
        icon: Shield,
        inAppPath: "/avvik",
        screenshot: "avvik.png",
        tips: [
          "Avvik knyttet til en rapport flagges automatisk for tiltakslederen ved godkjenning.",
          "Kritiske avvik utløser umiddelbart varsel.",
        ],
      },
    ],
  },
  {
    id: "tid",
    label: "Tid & fravær",
    blurb: "Timeføring, timelister, overtid og fravær — én flyt, ingen dobbelregistrering.",
    icon: Clock,
    accent: "from-amber-500 to-orange-600",
    articles: [
      {
        id: "timeforing",
        title: "Timeføring",
        summary: "Stempel inn/ut, registrer aktivitet manuelt, eller la AI foreslå basert på tidligere mønstre.",
        icon: Timer,
        inAppPath: "/time",
        screenshot: "timeforing.png",
        steps: [
          { label: "Velg sak og aktivitet" },
          { label: "Bruk timer eller fyll inn manuelt" },
          { label: "Aktivitets‑forslag", detail: "Systemet foreslår aktivitet ut fra tid på dagen og tidligere mønstre — godta eller skriv selv." },
        ],
      },
      {
        id: "timelister",
        title: "Timelister",
        summary: "Månedlige timelister genereres automatisk fra registrerte timer.",
        icon: ClipboardList,
        inAppPath: "/timesheets",
        roles: ["miljoarbeider", "tiltaksleder"],
        screenshot: "timelister.png",
      },
      {
        id: "overtid",
        title: "Overtid",
        summary: "Automatisk beregning av 50 % og 100 % tillegg basert på dine terskelverdier.",
        icon: TrendingUp,
        inAppPath: "/overtime",
        screenshot: "overtid.png",
        tips: [
          "Tiltaksleder kan deaktivere overtidsregistrering per bruker — da skjules fanen helt for miljøarbeideren.",
          "Standard er 7,5 t/dag og 37,5 t/uke. Endre i Innstillinger på siden.",
        ],
      },
      {
        id: "fravar",
        title: "Fravær",
        summary: "Søk om ferie, sykefravær eller annet. Tiltaksleder ser planlagt fravær i sin oversikt.",
        icon: Clock,
        inAppPath: "/leave",
      },
      {
        id: "faste-oppgaver",
        title: "Faste oppgaver",
        summary: "Tilbakevendende sjekklistepunkter du må gjøre daglig, ukentlig eller månedlig.",
        icon: ClipboardList,
        inAppPath: "/recurring",
      },
    ],
  },
  {
    id: "kommunikasjon",
    label: "Økonomi & kommunikasjon",
    blurb: "Fakturaer, e‑post og videresending — hold kontakten med oppdragsgiverne ryddig.",
    icon: Send,
    accent: "from-pink-500 to-rose-600",
    articles: [
      {
        id: "fakturaer",
        title: "Fakturaer",
        summary: "Generer fakturaer fra registrerte timer per oppdragsgiver eller sak.",
        icon: FileText,
        inAppPath: "/invoices",
        roles: ["tiltaksleder", "vendor_admin"],
      },
      {
        id: "epost",
        title: "E‑post",
        summary: "Send rapporter, fakturaer eller meldinger direkte fra Tidum.",
        icon: Mail,
        inAppPath: "/email",
        roles: ["tiltaksleder", "vendor_admin"],
      },
      {
        id: "send-videre",
        title: "Send videre",
        summary: "Videresend rapporter og dokumenter til oppdragsgiver med revisjons‑logging.",
        icon: Send,
        inAppPath: "/forward",
        roles: ["tiltaksleder"],
      },
    ],
  },
  {
    id: "administrasjon",
    label: "Administrasjon",
    blurb: "Leverandøradministrasjon, CMS og tester‑program — kun for super‑admin.",
    icon: Shield,
    accent: "from-slate-600 to-slate-800",
    articles: [
      {
        id: "leverandorer",
        title: "Leverandøradministrasjon",
        summary: "Opprett nye leverandører via Brreg‑søk, administrer admin‑brukere, se statistikk.",
        icon: Building2,
        inAppPath: "/vendors",
        roles: ["super_admin"],
        screenshot: "vendors.png",
        steps: [
          { label: "Klikk «Ny leverandør»" },
          { label: "Søk org.nr eller bedriftsnavn", detail: "Tidum henter navn, adresse og org.form fra Brønnøysundregisteret automatisk." },
          { label: "Velg abonnement og maks brukere" },
          { label: "Legg til vendor‑admin", detail: "Magic‑link‑invitasjon på e‑post — ingen passord nødvendig." },
        ],
      },
      {
        id: "cms",
        title: "CMS",
        summary: "Rediger landingsside, blogg og innhold direkte fra Tidum. Innlogging via Google fungerer for super‑admin.",
        icon: Palette,
        inAppPath: "/cms",
        roles: ["super_admin"],
      },
      {
        id: "tester-feedback",
        title: "Prototype‑testere",
        summary: "Inviter eksterne testere som gir tilbakemelding via flytende knapp i appen.",
        icon: Sparkles,
        inAppPath: "/admin/tester-feedback",
        roles: ["super_admin"],
      },
    ],
  },
  {
    id: "system",
    label: "System & innstillinger",
    blurb: "Personlige preferanser, varsler, GDPR og språk.",
    icon: Settings,
    accent: "from-gray-500 to-gray-700",
    articles: [
      {
        id: "innstillinger",
        title: "Innstillinger",
        summary: "Tema, språk, varsler, GDPR‑hjelper, eksportformater — alt samlet på ett sted.",
        icon: Settings,
        inAppPath: "/settings",
      },
    ],
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Jeg ser ikke «Overtid»‑fanen — hvor er den?",
    a: "Tiltakslederen din kan ha deaktivert overtidsregistrering for deg. Når det er deaktivert, gjemmes fanen helt fra menyen. Snakk med tiltakslederen hvis du mener det er feil.",
  },
  {
    q: "Hvorfor er bedrift, oppdragsgiver og tiltaksleder låst når jeg skriver rapport?",
    a: "Disse feltene fylles automatisk fra saken som er tildelt deg. Det sikrer at alle rapporter på samme sak har konsistent informasjon. Kontakt tiltakslederen din hvis du må endre dem.",
  },
  {
    q: "Kan jeg redigere en rapport etter at den er sendt inn?",
    a: "Innsendte rapporter er låst for endringer. Hvis du oppdager en feil, be tiltakslederen returnere rapporten — da kan du redigere og sende inn på nytt.",
  },
  {
    q: "Hvordan inviterer jeg flere kolleger samtidig?",
    a: "Gå til Invitasjoner i menyen og lag en delbar lenke. Den kan deles på Slack, e‑post eller hvor som helst — alle som åpner den blir registrert under riktig leverandør.",
  },
  {
    q: "Hvor finner jeg gamle rapporter?",
    a: "Gå til Rapporter‑fanen. Bruk filtrene for å begrense på status, periode eller sak. Godkjente rapporter er alltid søkbare.",
  },
  {
    q: "Hvordan logger jeg inn på CMS?",
    a: "For super‑admin: bare logg inn med Google på vanlig vis — du får automatisk CMS‑tilgang uten ekstra passord.",
  },
  {
    q: "Hvor mange brukere kan jeg ha?",
    a: "Avhenger av abonnementet ditt. Standard er 50 brukere; Premium har høyere grense. Kontakt support for oppgradering.",
  },
  {
    q: "Hva skjer med dataene mine ved oppsigelse?",
    a: "All data eksporteres til deg i CSV/JSON innen 30 dager etter oppsigelse, og slettes deretter permanent fra serverne våre.",
  },
];

/* ─────────────────────────────────────────────────────────────────────────
   PAGE
   ───────────────────────────────────────────────────────────────────────── */

export default function InteractiveGuide() {
  usePublicLightTheme();
  useSEO({
    title: "Brukerveiledning — Tidum",
    description: "Komplett guide til Tidum: dashboard, saker, rapporter, timeføring, fravær og admin. Søk eller bla gjennom kategoriene.",
  });

  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 1;

  // Restore scroll target from hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setActiveCategory(hash);
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const filteredCategories = useMemo(() => {
    if (!isSearching) return CATEGORIES;
    return CATEGORIES.map((c) => ({
      ...c,
      articles: c.articles.filter((a) => {
        const haystack = [
          a.title,
          a.summary,
          ...(a.steps?.map((s) => `${s.label} ${s.detail ?? ""}`) ?? []),
          ...(a.tips ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(trimmedQuery);
      }),
    })).filter((c) => c.articles.length > 0);
  }, [isSearching, trimmedQuery]);

  const totalArticleCount = CATEGORIES.reduce((n, c) => n + c.articles.length, 0);
  const matchCount = filteredCategories.reduce((n, c) => n + c.articles.length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-900">
      {/* ── Top nav ── */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/80 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <img src={tidumWordmark} alt="Tidum" className="h-7 w-auto" />
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
              Veiledning
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Til forsiden</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard">
                Åpne Tidum
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero + Search ── */}
      <section className="max-w-4xl mx-auto px-4 lg:px-8 pt-16 pb-10 text-center">
        <Badge variant="outline" className="mb-4 text-xs gap-1.5 border-emerald-300 text-emerald-700 bg-emerald-50">
          <Sparkles className="h-3 w-3" />
          Oppdatert {new Date().toLocaleDateString("nb-NO", { month: "long", year: "numeric" })}
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Slik bruker du Tidum
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8 leading-relaxed">
          Komplett veiledning til alt — fra første pålogging til avansert rapportering.
          Søk, eller hopp rett til kategorien du trenger.
        </p>
        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk i guiden — for eksempel «rapport», «overtid», «sak»…"
            className="h-14 pl-11 pr-4 text-base shadow-sm border-slate-200 bg-white focus-visible:ring-2 focus-visible:ring-emerald-400/40"
            data-testid="guide-search"
          />
          {isSearching && (
            <p className="absolute -bottom-7 left-1 text-xs text-slate-500">
              {matchCount} av {totalArticleCount} treff
            </p>
          )}
        </div>
      </section>

      {/* ── Quick start strip ── */}
      {!isSearching && (
        <section className="max-w-6xl mx-auto px-4 lg:px-8 pb-10">
          <div className="grid gap-3 md:grid-cols-3">
            <QuickCard
              icon={LayoutDashboard}
              label="1. Bli kjent med dashboardet"
              hint="Hvordan navigere oversikten"
              onClick={() => navigate("#oversikt")}
            />
            <QuickCard
              icon={FileText}
              label="2. Skriv din første rapport"
              hint="Steg for steg"
              onClick={() => navigate("#rapportering")}
            />
            <QuickCard
              icon={Clock}
              label="3. Registrer timer"
              hint="Med eller uten timer"
              onClick={() => navigate("#tid")}
            />
          </div>
        </section>
      )}

      {/* ── Category nav (sticky on desktop) ── */}
      {!isSearching && (
        <nav className="max-w-6xl mx-auto px-4 lg:px-8 pb-4">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const isActive = activeCategory === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(c.id);
                    document.getElementById(c.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    history.replaceState(null, "", `#${c.id}`);
                  }}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40"
                  }`}
                  data-testid={`guide-category-${c.id}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {c.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Categories + articles ── */}
      <main className="max-w-6xl mx-auto px-4 lg:px-8 pb-16 space-y-16">
        {filteredCategories.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-base">Ingen treff på «{query}».</p>
            <Button variant="ghost" className="mt-3" onClick={() => setQuery("")}>
              Tøm søk
            </Button>
          </div>
        )}

        {filteredCategories.map((category) => (
          <section key={category.id} id={category.id} className="scroll-mt-24">
            <CategoryHeader category={category} />
            <div className="grid gap-5 mt-6 md:grid-cols-2">
              {category.articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  category={category}
                  isHighlighted={isSearching}
                  onOpenInApp={(p) => navigate(p)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* ── Stuck CTA ── */}
      <section className="border-t border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-14 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md mb-4">
            <HelpCircle className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Sitter du fast?</h2>
          <p className="text-slate-600 mb-6 max-w-xl mx-auto">
            Du kan starte den interaktive omvisningen inne i appen når som helst — den peker på
            riktig knapp på riktig side. Hvis det fortsatt er uklart, send oss en e‑post.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/dashboard?tour=restart">
                <PlayCircle className="h-4 w-4 mr-2" />
                Start interaktiv omvisning
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`mailto:${TIDUM_SUPPORT_EMAIL}`}>
                <Inbox className="h-4 w-4 mr-2" />
                Kontakt support
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-4xl mx-auto px-4 lg:px-8 py-14">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Zap className="h-5 w-5 text-emerald-500" />
          Vanlige spørsmål
        </h2>
        <div className="space-y-3">
          {FAQ.map((item, idx) => (
            <FAQAccordion key={idx} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 text-sm text-slate-500 flex flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} Tidum</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-slate-700">Personvern</Link>
            <Link href="/terms" className="hover:text-slate-700">Vilkår</Link>
            <a href={`mailto:${TIDUM_SUPPORT_EMAIL}`} className="hover:text-slate-700">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SUBCOMPONENTS
   ───────────────────────────────────────────────────────────────────────── */

function CategoryHeader({ category }: { category: Category }) {
  const Icon = category.icon;
  return (
    <div className="flex items-start gap-4">
      <div className={`flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br ${category.accent} text-white shadow-md shrink-0`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{category.label}</h2>
        <p className="text-slate-600 mt-1 text-base leading-relaxed">{category.blurb}</p>
      </div>
    </div>
  );
}

function ArticleCard({
  article,
  category,
  isHighlighted,
  onOpenInApp,
}: {
  article: Article;
  category: Category;
  isHighlighted: boolean;
  onOpenInApp: (path: string) => void;
}) {
  const Icon = article.icon;
  const [expanded, setExpanded] = useState(isHighlighted);
  return (
    <Card className={`overflow-hidden transition-all ${expanded ? "shadow-md" : "hover:shadow-sm"} bg-white border-slate-200`}>
      {/* Screenshot or illustration */}
      <ArticleVisual article={article} accent={category.accent} icon={Icon} />

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-slate-400" />
            <CardTitle className="text-lg leading-tight">{article.title}</CardTitle>
          </div>
          {article.roles && article.roles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {article.roles.map((r) => (
                <Badge key={r} variant="outline" className="text-[10px] capitalize">
                  {ROLE_LABELS[r] ?? r}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <CardDescription className="leading-relaxed">{article.summary}</CardDescription>
      </CardHeader>

      <CardContent>
        {(article.steps || article.tips) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 mb-3"
          >
            {expanded ? "Skjul detaljer" : "Vis steg for steg"}
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        )}

        {expanded && article.steps && (
          <ol className="space-y-2.5 mb-4">
            {article.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium text-slate-800">{s.label}</p>
                  {s.detail && <p className="text-slate-600 mt-0.5">{s.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {expanded && article.tips && article.tips.length > 0 && (
          <div className="rounded-lg bg-amber-50/60 border border-amber-200/70 p-3 text-sm text-amber-900">
            <p className="font-semibold flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Tips
            </p>
            <ul className="space-y-1 ml-5 list-disc marker:text-amber-500">
              {article.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {article.inAppPath && (
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpenInApp(article.inAppPath!)}>
              Åpne i Tidum
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
            <code className="text-[11px] font-mono text-slate-500">{article.inAppPath}</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ArticleVisual({
  article,
  accent,
  icon,
}: {
  article: Article;
  accent: string;
  icon: LucideIcon;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const Icon = icon;

  // Try real screenshot first; fall back to illustrated panel.
  if (article.screenshot && !imgFailed) {
    return (
      <div className="relative aspect-[16/9] bg-slate-100 border-b border-slate-200 overflow-hidden">
        <img
          src={`/guide-screenshots/${article.screenshot}`}
          alt={`Skjermbilde av ${article.title}`}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className={`aspect-[16/9] bg-gradient-to-br ${accent} relative overflow-hidden border-b border-slate-200`}>
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage:
          "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3), transparent 40%)",
      }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-white/90 flex flex-col items-center gap-3">
          <Icon className="h-12 w-12 drop-shadow" />
          <span className="text-xs uppercase tracking-wider font-semibold opacity-80">
            {article.title}
          </span>
        </div>
      </div>
    </div>
  );
}

function QuickCard({ icon: Icon, label, hint, onClick }: {
  icon: LucideIcon; label: string; hint: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:shadow-md hover:border-emerald-300 hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-tight">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
    </button>
  );
}

function FAQAccordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-xl border bg-white p-5 transition-all ${
        open ? "border-emerald-300 shadow-sm" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 text-left"
      >
        <span className="font-semibold text-slate-800">{q}</span>
        <ChevronRight
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <p className="mt-3 text-sm text-slate-600 leading-relaxed">{a}</p>}
    </div>
  );
}

const ROLE_LABELS: Record<Role, string> = {
  miljoarbeider: "Miljøarbeider",
  tiltaksleder: "Tiltaksleder",
  vendor_admin: "Vendor admin",
  super_admin: "Super admin",
};
