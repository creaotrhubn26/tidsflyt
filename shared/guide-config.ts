/**
 * shared/guide-config.ts
 *
 * Single source of truth for /guide content + interactive-tour config +
 * stuck-detection behavior. Read by client (useGuideConfig hook) and
 * editable from CMS (stored in site_settings under key="guide_config" as
 * JSON). Hardcoded defaults below are used when no override exists.
 *
 * Schema is intentionally additive — new fields/rules can be added safely
 * without breaking existing stored overrides because every consumer falls
 * back to defaults via deepMerge() in mergeGuideConfig().
 */

export type GuideRole =
  | "miljoarbeider"
  | "tiltaksleder"
  | "vendor_admin"
  | "super_admin"
  | "default";

export interface GuideArticleStep {
  label: string;
  detail?: string;
}

export interface GuideArticle {
  id: string;
  title: string;
  summary: string;
  /** Lucide icon name (kept as string so config is JSON-safe). */
  icon?: string;
  inAppPath?: string;
  roles?: GuideRole[];
  steps?: GuideArticleStep[];
  tips?: string[];
  /** Filename under /guide-screenshots/ OR full URL — falls back to illustration. */
  screenshot?: string;
  /** Embedded video walkthrough — YouTube/Vimeo embed URL or direct MP4. */
  videoUrl?: string;
  /** Display label for the video (e.g. "Video: Slik skriver du en rapport"). */
  videoLabel?: string;
}

export interface GuideCategory {
  id: string;
  label: string;
  blurb: string;
  icon?: string;
  /** Tailwind gradient classes for the icon panel + tile chrome. */
  accent: string;
  articles: GuideArticle[];
}

export interface GuideFAQItem {
  q: string;
  a: string;
}

export type StuckReason = "idle" | "nav" | "dialog";

export interface StuckMessage {
  title: string;
  body: string;
  /**
   * Optional A/B variants. When present and non-empty, the runtime picks
   * one deterministically per session (so a user sees the same variant
   * every trip during a session) and emits the variant id in telemetry.
   * The top-level title/body acts as the implicit "control" — admins can
   * leave it as the canonical message and add experimental alternates here.
   */
  variants?: StuckMessageVariant[];
}

export interface StuckMessageVariant {
  id: string;
  title: string;
  body: string;
  /** Selection weight relative to other variants (default 1). */
  weight?: number;
}

/**
 * Optional admin-defined contextual rule. Triggered when the user lands on
 * a page matching `whenPathStartsWith` (and optionally has a matching
 * role) and remains idle for `idleMs`. Surfaces a custom message that
 * overrides the generic one.
 *
 * Designed as an extension point for future algorithm work — heuristics
 * can be expressed declaratively without redeploying.
 */
export interface StuckRule {
  id: string;
  enabled: boolean;
  whenPathStartsWith?: string;
  whenRole?: GuideRole | "any";
  /** Custom override for idle time; falls back to global thresholds.idleMs. */
  idleMsOverride?: number;
  message: StuckMessage;
}

export interface StuckConfig {
  enabled: boolean;
  thresholds: {
    idleMs: number;
    navWindowMs: number;
    navThreshold: number;
    dialogWindowMs: number;
    dialogThreshold: number;
  };
  messages: Record<StuckReason, StuckMessage>;
  actions: {
    tourLabel: string;
    guideLabel: string;
    dismissLabel: string;
  };
  /** Page/role-aware overrides — extension point for behavioral algorithms. */
  rules: StuckRule[];
}

export interface TourConfig {
  enabled: boolean;
  autoStartOnFirstVisit: boolean;
  /** Per-role override for the welcome step copy. */
  welcomeOverrides?: Partial<Record<GuideRole, Partial<StuckMessage>>>;
}

export interface GuideLayoutConfig {
  /** Page theme. "auto" follows the user's system preference. */
  theme: "light" | "dark" | "auto";
  /** Hero text alignment. */
  heroAlign: "center" | "left";
  /** Article card visual variant. */
  cardStyle: "gradient" | "solid" | "outline";
  /** Vertical density of the layout. */
  density: "comfortable" | "compact";
  /** Optional override for the hero badge background gradient. */
  heroAccent?: string;
  /** Show the hero "Oppdatert" badge. */
  showUpdatedBadge: boolean;
  /** Show the 3-card quick-start strip below the hero. */
  showQuickStart: boolean;
  /** Show the FAQ section. */
  showFAQ: boolean;
  /** Show the "Sitter du fast?" CTA banner. */
  showStuckCTA: boolean;
}

export interface AppDefaults {
  /** Global default theme for first-time visitors and users who haven't
   *  explicitly chosen one. Applies app-wide and consistently across
   *  public pages, the portal, and the CMS shell. */
  defaultTheme: "light" | "dark" | "auto";
}

export interface GuideConfig {
  hero: {
    title: string;
    subtitle: string;
    /** "Oppdatert" badge label — set empty string to hide. */
    updatedLabel: string;
    searchPlaceholder: string;
  };
  layout: GuideLayoutConfig;
  appDefaults: AppDefaults;
  categories: GuideCategory[];
  faq: GuideFAQItem[];
  stuck: StuckConfig;
  tour: TourConfig;
}

/* ─────────────────────────────────────────────────────────────────────────
   DEFAULT CONFIG — frozen production-quality content used when CMS
   override is absent or partial. Every consumer calls mergeGuideConfig()
   so partial overrides only replace the keys explicitly set.
   ───────────────────────────────────────────────────────────────────────── */

export const DEFAULT_GUIDE_CONFIG: GuideConfig = {
  hero: {
    title: "Slik bruker du Tidum",
    subtitle:
      "Komplett veiledning til alt — fra første pålogging til avansert rapportering. Søk, eller hopp rett til kategorien du trenger.",
    updatedLabel: "Oppdatert",
    searchPlaceholder: "Søk i guiden — for eksempel «rapport», «overtid», «sak»…",
  },

  layout: {
    theme: "light",
    heroAlign: "center",
    cardStyle: "gradient",
    density: "comfortable",
    showUpdatedBadge: true,
    showQuickStart: true,
    showFAQ: true,
    showStuckCTA: true,
  },

  appDefaults: {
    defaultTheme: "auto",
  },

  categories: [
    {
      id: "oversikt",
      label: "Oversikt",
      blurb: "Start dagen med dashboardet — alt du trenger å gjøre samlet på ett sted.",
      icon: "LayoutDashboard",
      accent: "from-sky-500 to-blue-600",
      articles: [
        {
          id: "dashboard",
          title: "Dashboardet",
          summary: "Personalisert hjemmebase: oppgaver, varsler og snarveier prioritert etter rolle.",
          icon: "LayoutDashboard",
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
          icon: "ClipboardCheck",
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
          icon: "PlayCircle",
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
      icon: "Folder",
      accent: "from-indigo-500 to-purple-600",
      articles: [
        {
          id: "ny-sak",
          title: "Opprette en sak",
          summary: "Brønnøysundregisteret er innebygd — søk, koble og bli ferdig på sekunder.",
          icon: "Plus",
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
          icon: "UserPlus",
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
          icon: "Building2",
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
          icon: "UserPlus",
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
      icon: "FileText",
      accent: "from-emerald-500 to-teal-600",
      articles: [
        {
          id: "ny-rapport",
          title: "Skrive en saksrapport",
          summary: "Rapportmaler tilpasser seg sektor og institusjon. Bedrift, oppdragsgiver og tiltaksleder fylles automatisk.",
          icon: "FileText",
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
          icon: "ClipboardCheck",
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
          icon: "ClipboardList",
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
          icon: "Shield",
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
      icon: "Clock",
      accent: "from-amber-500 to-orange-600",
      articles: [
        {
          id: "timeforing",
          title: "Timeføring",
          summary: "Stempel inn/ut, registrer aktivitet manuelt, eller la AI foreslå basert på tidligere mønstre.",
          icon: "Timer",
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
          icon: "ClipboardList",
          inAppPath: "/timesheets",
          roles: ["miljoarbeider", "tiltaksleder"],
          screenshot: "timelister.png",
        },
        {
          id: "overtid",
          title: "Overtid",
          summary: "Automatisk beregning av 50 % og 100 % tillegg basert på dine terskelverdier.",
          icon: "TrendingUp",
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
          icon: "Clock",
          inAppPath: "/leave",
        },
        {
          id: "faste-oppgaver",
          title: "Faste oppgaver",
          summary: "Tilbakevendende sjekklistepunkter du må gjøre daglig, ukentlig eller månedlig.",
          icon: "ClipboardList",
          inAppPath: "/recurring",
        },
      ],
    },
    {
      id: "kommunikasjon",
      label: "Økonomi & kommunikasjon",
      blurb: "Fakturaer, e‑post og videresending — hold kontakten med oppdragsgiverne ryddig.",
      icon: "Send",
      accent: "from-pink-500 to-rose-600",
      articles: [
        {
          id: "fakturaer",
          title: "Fakturaer",
          summary: "Generer fakturaer fra registrerte timer per oppdragsgiver eller sak.",
          icon: "FileText",
          inAppPath: "/invoices",
          roles: ["tiltaksleder", "vendor_admin"],
        },
        {
          id: "epost",
          title: "E‑post",
          summary: "Send rapporter, fakturaer eller meldinger direkte fra Tidum.",
          icon: "Mail",
          inAppPath: "/email",
          roles: ["tiltaksleder", "vendor_admin"],
        },
        {
          id: "send-videre",
          title: "Send videre",
          summary: "Videresend rapporter og dokumenter til oppdragsgiver med revisjons‑logging.",
          icon: "Send",
          inAppPath: "/forward",
          roles: ["tiltaksleder"],
        },
      ],
    },
    {
      id: "administrasjon",
      label: "Administrasjon",
      blurb: "Leverandøradministrasjon, CMS og tester‑program — kun for super‑admin.",
      icon: "Shield",
      accent: "from-slate-600 to-slate-800",
      articles: [
        {
          id: "leverandorer",
          title: "Leverandøradministrasjon",
          summary: "Opprett nye leverandører via Brreg‑søk, administrer admin‑brukere, se statistikk.",
          icon: "Building2",
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
          icon: "Palette",
          inAppPath: "/cms",
          roles: ["super_admin"],
        },
        {
          id: "tester-feedback",
          title: "Prototype‑testere",
          summary: "Inviter eksterne testere som gir tilbakemelding via flytende knapp i appen.",
          icon: "Sparkles",
          inAppPath: "/admin/tester-feedback",
          roles: ["super_admin"],
        },
      ],
    },
    {
      id: "system",
      label: "System & innstillinger",
      blurb: "Personlige preferanser, varsler, GDPR og språk.",
      icon: "Settings",
      accent: "from-gray-500 to-gray-700",
      articles: [
        {
          id: "innstillinger",
          title: "Innstillinger",
          summary: "Tema, språk, varsler, GDPR‑hjelper, eksportformater — alt samlet på ett sted.",
          icon: "Settings",
          inAppPath: "/settings",
        },
      ],
    },
  ],

  faq: [
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
      q: "Hvor mange brukere kan jeg ha?",
      a: "Avhenger av abonnementet ditt. Standard er 50 brukere; Premium har høyere grense. Kontakt support for oppgradering.",
    },
    {
      q: "Hva skjer med dataene mine ved oppsigelse?",
      a: "All data eksporteres til deg i CSV/JSON innen 30 dager etter oppsigelse, og slettes deretter permanent fra serverne våre.",
    },
  ],

  stuck: {
    enabled: true,
    thresholds: {
      idleMs: 45_000,
      navWindowMs: 15_000,
      navThreshold: 4,
      dialogWindowMs: 12_000,
      dialogThreshold: 3,
    },
    messages: {
      idle: {
        title: "Tideman her — trenger du hjelp?",
        body: "Du har sittet stille en stund. Skal jeg vise deg rundt eller åpne guiden?",
      },
      nav: {
        title: "Tideman ser at du leter",
        body: "Vil du ha en kort omvisning? Det tar 30 sekunder.",
      },
      dialog: {
        title: "Tideman: står du fast her?",
        body: "Denne dialogen er ikke åpenbar — la meg vise deg veien videre.",
      },
    },
    actions: {
      tourLabel: "Vis omvisning",
      guideLabel: "Åpne guiden",
      dismissLabel: "Ikke nå",
    },
    rules: [],
  },

  tour: {
    enabled: true,
    autoStartOnFirstVisit: true,
  },
};

/**
 * Deep-merge a partial config from CMS over the defaults. Arrays are
 * replaced wholesale (so admins can fully override categories/faq/rules
 * by sending replacement arrays). Scalars and nested objects are merged.
 */
export function mergeGuideConfig(
  override: Partial<GuideConfig> | null | undefined,
): GuideConfig {
  if (!override || typeof override !== "object") return DEFAULT_GUIDE_CONFIG;
  return {
    hero: { ...DEFAULT_GUIDE_CONFIG.hero, ...(override.hero ?? {}) },
    layout: { ...DEFAULT_GUIDE_CONFIG.layout, ...(override.layout ?? {}) },
    appDefaults: { ...DEFAULT_GUIDE_CONFIG.appDefaults, ...(override.appDefaults ?? {}) },
    categories: Array.isArray(override.categories)
      ? (override.categories as GuideCategory[])
      : DEFAULT_GUIDE_CONFIG.categories,
    faq: Array.isArray(override.faq)
      ? (override.faq as GuideFAQItem[])
      : DEFAULT_GUIDE_CONFIG.faq,
    stuck: {
      enabled: override.stuck?.enabled ?? DEFAULT_GUIDE_CONFIG.stuck.enabled,
      thresholds: { ...DEFAULT_GUIDE_CONFIG.stuck.thresholds, ...(override.stuck?.thresholds ?? {}) },
      messages: {
        idle: {
          ...DEFAULT_GUIDE_CONFIG.stuck.messages.idle,
          ...(override.stuck?.messages?.idle ?? {}),
          variants: Array.isArray(override.stuck?.messages?.idle?.variants)
            ? (override.stuck!.messages!.idle!.variants as StuckMessageVariant[])
            : undefined,
        },
        nav: {
          ...DEFAULT_GUIDE_CONFIG.stuck.messages.nav,
          ...(override.stuck?.messages?.nav ?? {}),
          variants: Array.isArray(override.stuck?.messages?.nav?.variants)
            ? (override.stuck!.messages!.nav!.variants as StuckMessageVariant[])
            : undefined,
        },
        dialog: {
          ...DEFAULT_GUIDE_CONFIG.stuck.messages.dialog,
          ...(override.stuck?.messages?.dialog ?? {}),
          variants: Array.isArray(override.stuck?.messages?.dialog?.variants)
            ? (override.stuck!.messages!.dialog!.variants as StuckMessageVariant[])
            : undefined,
        },
      },
      actions: { ...DEFAULT_GUIDE_CONFIG.stuck.actions, ...(override.stuck?.actions ?? {}) },
      rules: Array.isArray(override.stuck?.rules)
        ? (override.stuck!.rules as StuckRule[])
        : DEFAULT_GUIDE_CONFIG.stuck.rules,
    },
    tour: {
      enabled: override.tour?.enabled ?? DEFAULT_GUIDE_CONFIG.tour.enabled,
      autoStartOnFirstVisit: override.tour?.autoStartOnFirstVisit ?? DEFAULT_GUIDE_CONFIG.tour.autoStartOnFirstVisit,
      welcomeOverrides: override.tour?.welcomeOverrides ?? DEFAULT_GUIDE_CONFIG.tour.welcomeOverrides,
    },
  };
}

/** Storage key for site_settings (key/value blob). */
export const GUIDE_CONFIG_KEY = "guide_config";
