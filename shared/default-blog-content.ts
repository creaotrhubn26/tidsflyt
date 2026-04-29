import { getBlogCoverOgUrl, getBlogCoverPath } from "./blog-cover";

type BlogSection = {
  paragraphs?: string[];
  bullets?: string[];
  ordered?: boolean;
};

type BlogFigure = {
  src: string;
  alt: string;
  caption?: string;
};

type BlogSource = {
  label: string;
  url: string;
};

type BlogArticleDraft = {
  title: string;
  slug: string;
  excerpt: string;
  categorySlug: string;
  featuredImage: string;
  ogImage: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
  intro: string[];
  leadFigure?: BlogFigure;
  supportFigure?: BlogFigure;
  whatIs: BlogSection;
  whyImportant: BlogSection;
  steps: BlogSection;
  commonMistakes: BlogSection;
  tools: BlogSection;
  sources?: BlogSource[];
  publishedAt: string;
};

export type DefaultBlogCategorySeed = {
  name: string;
  slug: string;
  description: string;
};

export type DefaultBlogPostSeed = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImage: string;
  ogImage: string;
  author: string;
  categorySlug: string;
  tags: string[];
  status: "published";
  metaTitle: string;
  metaDescription: string;
  publishedAt: string;
};

const AUTHOR_NAME = "Tidum-redaksjonen";
const SITE_URL = "https://tidum.no";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderParagraphs(paragraphs?: string[]) {
  if (!paragraphs?.length) return "";
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n");
}

function renderList(items?: string[], ordered = false) {
  if (!items?.length) return "";
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
}

function renderSection(title: string, section: BlogSection) {
  return [
    `<h2>${escapeHtml(title)}</h2>`,
    renderParagraphs(section.paragraphs),
    renderList(section.bullets, section.ordered),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderFigure(figure?: BlogFigure) {
  if (!figure) return "";
  const caption = figure.caption ? `<figcaption>${escapeHtml(figure.caption)}</figcaption>` : "";
  return `<figure><img src="${escapeHtml(figure.src)}" alt="${escapeHtml(figure.alt)}" />${caption}</figure>`;
}

function renderSources(sources?: BlogSource[]) {
  if (!sources?.length) return "";

  return [
    "<hr />",
    "<h2>Kilder og videre lesing</h2>",
    "<ul>",
    ...sources.map(
      (source) =>
        `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a></li>`,
    ),
    "</ul>",
  ].join("\n");
}

function renderArticleContent(article: BlogArticleDraft) {
  return [
    renderParagraphs(article.intro),
    renderFigure(article.leadFigure),
    renderSection("Hva er tidsregistrering", article.whatIs),
    renderSection("Hvorfor er det viktig", article.whyImportant),
    renderSection("Steg-for-steg guide", article.steps),
    renderFigure(article.supportFigure),
    renderSection("Vanlige feil", article.commonMistakes),
    renderSection("Verktøy", article.tools),
    renderSources(article.sources),
  ]
    .filter(Boolean)
    .join("\n\n");
}

const screenshotDesktop = "/screenshots/blog/tidum-time-tracking-fresh-desktop.png";
const screenshotMobile = "/screenshots/blog/tidum-time-tracking-fresh-mobile.png";
const screenshotMobileViewport = "/screenshots/blog/tidum-time-tracking-fresh-mobile-viewport.png";
const stockClock = "/blog/stock-clock.png";
const stockExcel = "/blog/stock-excel.png";
const stockCaregiver = "/blog/stock-caregiver.png";

function assetOg(path: string) {
  return `${SITE_URL}${path}`;
}

export const DEFAULT_BLOG_CATEGORIES: DefaultBlogCategorySeed[] = [
  {
    name: "Problem og oversikt",
    slug: "problem-og-oversikt",
    description:
      "Artikler om vanlige utfordringer med timelister, arbeidstid og daglig oversikt.",
  },
  {
    name: "Yrkesguider",
    slug: "yrkesguider",
    description:
      "Praktiske guider for miljøarbeid, helse, BPA og andre arbeidshverdager med turnus og dokumentasjonskrav.",
  },
  {
    name: "Regelverk og krav",
    slug: "regelverk-og-krav",
    description:
      "Forklaringer av arbeidsmiljøloven, timelister, dokumentasjon og personvern for arbeidstid i Norge.",
  },
];

const officialSources = {
  arbeidstidRegistrering: {
    label: "Arbeidstilsynet: Registrering av arbeidstid",
    url: "https://www.arbeidstilsynet.no/arbeidstid-og-organisering/arbeidstid/registrering-av-arbeidstid/",
  },
  arbeidstidOverview: {
    label: "Arbeidstilsynet: Arbeidstid",
    url: "https://www.arbeidstilsynet.no/arbeidstid-og-organisering/arbeidstid/",
  },
  gjennomsnittsberegning: {
    label: "Arbeidstilsynet: Gjennomsnittsberegning av arbeidstiden",
    url: "https://www.arbeidstilsynet.no/arbeidstid-og-organisering/arbeidstid/gjennomsnittsberegning/",
  },
  beredskapsvakt: {
    label: "Arbeidstilsynet: Beredskapsvakt utenfor arbeidsstedet",
    url: "https://www.arbeidstilsynet.no/arbeidstid-og-organisering/arbeidstid/beredskapsvakt-utenfor-arbeidsstedet/",
  },
  privateEmployer: {
    label: "Arbeidstilsynet: Privatpersoner kan ha arbeidsgiveransvar",
    url: "https://www.arbeidstilsynet.no/lonn-og-ansettelse/ansettelse/privatpersonar-kan-ha-arbeidsgivaransvar/",
  },
  datatilsynetWorkplace: {
    label: "Datatilsynet: Personvern på arbeidsplassen",
    url: "https://www.datatilsynet.no/personvern-pa-ulike-omrader/personvern-pa-arbeidsplassen/",
  },
  datatilsynetControl: {
    label: "Datatilsynet: Kontroll og overvåking i arbeidslivet",
    url: "https://www.datatilsynet.no/personvern-pa-ulike-omrader/personvern-pa-arbeidsplassen/veileder-om-kontroll-og-overvaking-i-arbeidslivet/",
  },
  aml104: {
    label: "Lovdata: Arbeidsmiljøloven § 10-4",
    url: "https://lovdata.no/lov/2005-06-17-62/%C2%A710-4",
  },
  aml107: {
    label: "Lovdata: Arbeidsmiljøloven § 10-7",
    url: "https://lovdata.no/lov/2005-06-17-62/%C2%A710-7",
  },
  aml91: {
    label: "Lovdata: Arbeidsmiljøloven § 9-1",
    url: "https://lovdata.no/lov/2005-06-17-62/%C2%A79-1",
  },
  bokforing13: {
    label: "Lovdata: Bokføringsloven § 13",
    url: "https://lovdata.no/lov/2004-11-19-73/%C2%A713",
  },
};

const DEFAULT_BLOG_ARTICLES: BlogArticleDraft[] = [
  {
    title: "Derfor mister du oversikt over arbeidstiden din",
    slug: "derfor-mister-du-oversikt-over-arbeidstiden-din",
    excerpt:
      "Når arbeidstid ligger i hodet, i Excel og i meldinger, mister du fort kontrollen. Her er de vanligste årsakene og hva du kan gjøre i stedet.",
    categorySlug: "problem-og-oversikt",
    featuredImage: stockClock,
    ogImage: assetOg(stockClock),
    metaTitle: "Derfor mister du oversikt over arbeidstiden din | Tidum",
    metaDescription:
      "Mister du oversikten over arbeidstid og timelister? Se de vanligste årsakene og hvordan du får bedre kontroll med en enklere rutine.",
    tags: ["timeregistrering", "arbeidstid", "timeregistrering app", "oversikt arbeidstid"],
    intro: [
      "Mange mister ikke oversikten fordi de er ustrukturerte. De mister den fordi arbeidstiden blir registrert flere steder samtidig: litt i notater, litt i Excel, litt i en melding og litt i hukommelsen.",
      "Når dagen går fort og skiftene varierer, blir små avvik store problemer. Da forsvinner tryggheten både for den som fører timer og for lederen som skal godkjenne dem.",
    ],
    leadFigure: {
      src: screenshotDesktop,
      alt: "Tidum timeføring på desktop",
      caption: "Når timer føres i én samlet arbeidsflyt, blir oversikten enklere å beholde gjennom hele uka.",
    },
    whatIs: {
      paragraphs: [
        "Tidsregistrering betyr å dokumentere når arbeid starter, når det slutter, hvilke pauser som er tatt og hvilket arbeid som faktisk ble utført. I praksis er det forskjellen mellom planlagt arbeidstid og reell arbeidstid som må være tydelig.",
        "Det er ikke nok å vite at noen jobbet omtrent åtte timer. For å ha kontroll må virksomheten se dato, varighet, avvik, ekstra vakter og hva som må følges opp videre.",
      ],
      bullets: [
        "start- og sluttid per vakt",
        "pauser som skal trekkes fra eller regnes som arbeidstid",
        "overtid, ekstra vakter og bytter",
        "hvem som har ført og godkjent timene",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Oversikt over arbeidstiden er viktig fordi lønn, bemanning, arbeidsmiljø og dokumentasjon henger sammen. Når oversikten svikter, øker risikoen for feil lønn, utydelige forventninger og unødvendige konflikter.",
        "Det er også viktig fordi arbeidsgiver har plikt til å kunne vise hvor mye den enkelte har arbeidet. Et system som gir etterslep eller mangler historikk gjør det vanskeligere å følge regelverket i praksis.",
      ],
      bullets: [
        "du ser raskere hvem som nærmer seg overtid",
        "ledere får bedre kontroll på turnus og fravær",
        "timelister blir enklere å forklare i etterkant",
        "det blir mindre avhengig av hukommelse og manuell opprydding",
      ],
    },
    steps: {
      paragraphs: [
        "For å få kontroll må du gjøre registreringen enkel nok til at den faktisk blir gjort mens arbeidet pågår, ikke flere dager senere.",
      ],
      bullets: [
        "Bestem ett sted der all arbeidstid skal registreres.",
        "Registrer start, slutt og pause samme dag som arbeidet utføres.",
        "Skill tydelig mellom planlagt vakt og faktisk arbeidstid.",
        "Lag en enkel godkjenningsrutine for leder eller teamleder.",
        "Bruk rapporter ukentlig, ikke først når lønn eller revisjon haster.",
      ],
      ordered: true,
    },
    commonMistakes: {
      paragraphs: [
        "Den vanligste feilen er ikke at folk glemmer å føre timer. Feilen er at systemet rundt føringen er for uklart.",
      ],
      bullets: [
        "timer blir ført flere steder samtidig",
        "sluttid blir fylt inn senere fra hukommelsen",
        "pauser håndteres ulikt fra person til person",
        "leder ser ikke avvik før flere uker etterpå",
        "man blander aktivitet, notater og arbeidstid i samme felt",
      ],
    },
    tools: {
      paragraphs: [
        "Et godt verktøy fjerner friksjon i stedet for å legge til flere felter. Derfor bør løsningen være rask på mobil, enkel å godkjenne og tydelig nok til å brukes i felt, turnus og oppfølging.",
        "Tidum er laget for å samle føring, godkjenning og oversikt i én arbeidsflyt, slik at du slipper å rekonstruere arbeidstiden i etterkant. Når registreringen blir trygg og enkel, øker også kvaliteten på dataene du bruker videre.",
      ],
    },
    sources: [officialSources.arbeidstidRegistrering, officialSources.aml107],
    publishedAt: "2026-04-05T08:00:00.000Z",
  },
  {
    title: "De 5 vanligste feilene i tidsregistrering",
    slug: "de-5-vanligste-feilene-i-tidsregistrering",
    excerpt:
      "Små feil i tidsregistrering gir store utslag i lønn, planlegging og dokumentasjon. Her er feilene vi ser oftest og hvordan du rydder dem bort.",
    categorySlug: "problem-og-oversikt",
    featuredImage: screenshotDesktop,
    ogImage: assetOg(screenshotDesktop),
    metaTitle: "De 5 vanligste feilene i tidsregistrering | Tidum",
    metaDescription:
      "Unngå de vanligste feilene i tidsregistrering. Se hva som skaper problemer med timelister og hvordan du retter opp rutinene.",
    tags: ["tidsregistrering", "timeregistrering app", "timeliste", "arbeidstid"],
    intro: [
      "De fleste feil i tidsregistrering er ikke tekniske. De oppstår fordi rutiner, ansvar og begreper er uklare.",
      "Når alle fører timer litt forskjellig, får du et system som ser ryddig ut på overflaten, men som blir vanskelig å stole på når det virkelig gjelder.",
    ],
    leadFigure: {
      src: screenshotMobileViewport,
      alt: "Tidum timeføring på mobil",
      caption: "Når registreringen er enkel på mobil, blir det lettere å føre riktig mens arbeidet faktisk pågår.",
    },
    whatIs: {
      paragraphs: [
        "Tidsregistrering handler om å dokumentere utført arbeid på en måte som kan brukes til lønn, planlegging og kontroll. Det betyr at føringen må være både praktisk og etterprøvbar.",
        "God tidsregistrering er ikke bare et skjema. Det er en arbeidsrutine som gjør det mulig å forstå hva som skjedde, når det skjedde og hvem som godkjente det.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Feil registrering slår raskt ut i feil lønn, dårlig planlegging og ekstra administrasjon. Jo lenger det tar før avvik blir oppdaget, jo dyrere blir det å rydde opp.",
      ],
      bullets: [
        "overtid kan bli oversett eller feilberegnet",
        "turnus og bemanning blir vanskeligere å justere",
        "ledere mister tillit til timelistene",
        "arbeidstakere må forklare gamle vakter i etterkant",
      ],
    },
    steps: {
      paragraphs: [
        "Hvis du vil luke bort feilene, må du gjøre det samme hver dag og gjøre det synlig hvem som har ansvar for hva.",
      ],
      bullets: [
        "Definer hva som menes med starttid, sluttid, pause og overtid hos dere.",
        "Lag en fast regel for når registreringen skal være ferdig samme dag.",
        "Bruk én løsning som viser endringer og godkjenninger.",
        "Sjekk ukentlig hvilke føringer som mangler eller avviker fra plan.",
        "Bruk avvikene til å forbedre rutinen, ikke bare til å rette feil manuelt.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotDesktop,
      alt: "Tidum dashboard for timeføring",
      caption: "En felles oversikt gjør det lettere å oppdage feil før de går videre til lønn eller rapportering.",
    },
    commonMistakes: {
      paragraphs: [
        "Her er de fem feilene som går igjen i virksomheter som strever med timelister.",
      ],
      bullets: [
        "Timer føres for sent, ofte flere dager etter vakten.",
        "Planlagt vakt blir kopiert som faktisk arbeidstid uten avviksføring.",
        "Pauser trekkes ulikt fra ansatt til ansatt.",
        "Notater om arbeid blandes inn i felt som egentlig skal brukes til tid.",
        "Godkjenning skjer uten at leder ser hele uke- eller månedsbildet.",
      ],
    },
    tools: {
      paragraphs: [
        "Et verktøy som fungerer i praksis må gjøre de riktige valgene enkle. Det bør være like lett å føre timer på mobilen som å kontrollere dem på desktop.",
        "Tidum er bygget for å redusere nettopp disse feilene med tydelige arbeidsflater, enklere avviksføring og en ledervisning som gjør godkjenning mindre skjønnsbasert.",
      ],
    },
    sources: [officialSources.arbeidstidRegistrering, officialSources.arbeidstidOverview],
    publishedAt: "2026-04-04T08:00:00.000Z",
  },
  {
    title: "Hvorfor Excel-timelister ikke fungerer lenger",
    slug: "hvorfor-excel-timelister-ikke-fungerer-lenger",
    excerpt:
      "Excel kan virke enkelt helt til timelistene skal brukes til godkjenning, turnus og dokumentasjon. Her er grunnen til at mange har vokst fra regnearket.",
    categorySlug: "problem-og-oversikt",
    featuredImage: stockExcel,
    ogImage: assetOg(stockExcel),
    metaTitle: "Hvorfor Excel-timelister ikke fungerer lenger | Tidum",
    metaDescription:
      "Excel-timelister skaper fort feil, versjonskaos og dårlig oversikt. Se hvorfor flere går over til et enklere arbeidstidssystem.",
    tags: ["timeliste mal", "excel timeliste", "timeregistrering app", "arbeidstid"],
    intro: [
      "Excel var lenge et greit kompromiss. Én fil, noen kolonner og en formel eller to kunne være nok for en liten virksomhet.",
      "Problemet er at arbeidshverdagen ikke lenger skjer ett sted. Når timer føres fra mobil, i turnus og på ulike vakter, blir Excel fort et manuelt mellomledd i stedet for et faktisk system.",
    ],
    leadFigure: {
      src: screenshotDesktop,
      alt: "Tidum timeføring med oversikt",
      caption: "Når dataene ligger direkte i løsningen, slipper du å samle dem i regneark etterpå.",
    },
    whatIs: {
      paragraphs: [
        "En Excel-timeliste er i praksis en manuell registreringsflate. Den kan være nyttig som mal, men den er sjelden god som arbeidsflyt når flere personer skal føre, kontrollere og godkjenne samtidig.",
        "Tidsregistrering i dag handler ikke bare om å fylle inn timer. Det handler også om sporbarhet, historikk, mobilbruk og tydelig ansvar.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Når timelisten er et regneark, blir kvaliteten lett avhengig av hvem som fyller det ut. Da øker risikoen for versjonsfeil, kopieringsfeil og utydelige endringer.",
      ],
      bullets: [
        "leder ser ikke alltid siste versjon",
        "endringer blir gjort uten tydelig historikk",
        "mobilbruk blir tungvint",
        "godkjenning skjer ofte via e-post eller chat ved siden av",
      ],
    },
    steps: {
      paragraphs: [
        "Hvis dere fortsatt bruker Excel, er det fullt mulig å rydde overgangen uten å skape merarbeid.",
      ],
      bullets: [
        "Kartlegg hvilke felter dere faktisk bruker i dagens timeliste.",
        "Skill mellom det dere trenger daglig og det dere bare bruker i rapportering.",
        "Flytt først den daglige registreringen over i én løsning.",
        "Behold eksport til Excel kun for de tilfellene der noen fortsatt trenger filformatet.",
        "Gi leder en egen godkjenningsrutine, ikke bare tilgang til en fil.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotMobile,
      alt: "Tidum mobil for timeføring",
      caption: "Mobilvennlig føring gjør at timer kan registreres der arbeidet skjer, ikke først når man er tilbake ved et regneark.",
    },
    commonMistakes: {
      paragraphs: [
        "Den største misforståelsen er å tro at Excel er billig fordi lisensen allerede finnes. Den reelle kostnaden ligger ofte i feil, etterarbeid og usikkerhet.",
      ],
      bullets: [
        "samme timeliste sendes i flere versjoner",
        "brukere fyller inn ulike dato- og tidsformater",
        "pauser og tillegg håndteres manuelt",
        "historikken blir uklar når noen skriver over gamle verdier",
        "regnearket blir brukt som database, godkjenningsflyt og arkiv samtidig",
      ],
    },
    tools: {
      paragraphs: [
        "Et bedre verktøy trenger ikke være mer komplisert. Det må bare være laget for faktisk tidsregistrering og ikke for generell tallbehandling.",
        "Tidum lar deg fortsatt hente ut rapporter når du trenger dem, men selve registreringen og oppfølgingen skjer i en arbeidsflyt som er mer robust enn et regneark.",
      ],
    },
    sources: [officialSources.arbeidstidRegistrering, officialSources.datatilsynetWorkplace],
    publishedAt: "2026-04-03T08:00:00.000Z",
  },
  {
    title: "Stress på jobb? Slik får du kontroll på timene dine",
    slug: "stress-pa-jobb-slik-far-du-kontroll-pa-timene-dine",
    excerpt:
      "Når arbeidsdagen er hektisk, blir timeregistrering ofte utsatt. Her er en mer realistisk måte å få kontroll uten å gjøre hverdagen tyngre.",
    categorySlug: "problem-og-oversikt",
    featuredImage: stockClock,
    ogImage: assetOg(stockClock),
    metaTitle: "Stress på jobb? Slik får du kontroll på timene dine | Tidum",
    metaDescription:
      "Få bedre kontroll på timer og arbeidsdag uten mer stress. Se en enklere rutine for tidsregistrering i en travel hverdag.",
    tags: ["arbeidstid", "timeregistrering app", "stress på jobb", "timeliste"],
    intro: [
      "Jo travlere dagen blir, jo lettere er det å tenke at timene kan føres senere. Det er en forståelig reaksjon, men den gjør registreringen mer krevende for hver time som går.",
      "Løsningen er sjelden å skjerpe seg mer. Løsningen er å gjøre tidsregistreringen så enkel at den passer inn i tempoet du faktisk jobber i.",
    ],
    leadFigure: {
      src: screenshotMobileViewport,
      alt: "Mobilvennlig Tidum timeføring",
      caption: "Når du kan føre timer i korte steg på mobilen, blir terskelen lavere selv på hektiske dager.",
    },
    whatIs: {
      paragraphs: [
        "Tidsregistrering er i praksis en måte å avslutte en arbeidsoppgave på. Når du vet hvor og hvordan timer skal føres, blir det mindre mentalt arbeid å få det gjort.",
        "Et godt system skal derfor støtte arbeidsflyten din, ikke konkurrere med den.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Når stressnivået er høyt, trenger ledelsen enda bedre oversikt over belastning, overtid og hva som faktisk skjer i hverdagen. Hvis timer mangler eller kommer sent, mister man et viktig styringsgrunnlag.",
      ],
      bullets: [
        "det blir lettere å oppdage ubalanse i arbeidsmengde",
        "du slipper å rekonstruere dagen i etterkant",
        "lønn og avspasering blir enklere å kontrollere",
        "leder får et mer realistisk bilde av bemanningen",
      ],
    },
    steps: {
      paragraphs: [
        "Begynn med en rutine som er liten nok til å fungere også på en dårlig dag.",
      ],
      bullets: [
        "Bestem ett tidspunkt i løpet av vakten for å kontrollere tidene.",
        "Før kun det viktigste først: start, slutt og pause.",
        "Legg til notater eller aktivitet bare når det faktisk trengs.",
        "La leder godkjenne på fast tidspunkt i stedet for tilfeldig.",
        "Bruk ukevisning eller rapport for å fange opp mønstre, ikke bare enkeltdager.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotDesktop,
      alt: "Tidum desktop med ukeoversikt",
      caption: "Et ukebilde gjør det lettere å se om stresset skyldes et enkelt avvik eller et gjentakende mønster.",
    },
    commonMistakes: {
      paragraphs: [
        "Når folk er stresset, er det vanlig å prøve å føre alt perfekt. Det gir ofte motsatt effekt.",
      ],
      bullets: [
        "man venter til uka er over før man fyller inn timer",
        "man bruker for mange fritekstfelt i stedet for enkle valg",
        "man prøver å huske pauser og avvik i etterkant",
        "leder ser bare på totalen, ikke på mønsteret bak",
      ],
    },
    tools: {
      paragraphs: [
        "Et verktøy bør hjelpe deg å føre det viktigste raskt og rydde opp i detaljene senere. Jo enklere grunnflyten er, jo mer realistisk blir det å få gode data ut av en travel arbeidsdag.",
        "Tidum er laget for nettopp den typen hverdager. Du kan føre raskt på mobil, mens leder fortsatt får oversikten som trengs for å følge opp.",
      ],
    },
    sources: [officialSources.arbeidstidRegistrering, officialSources.arbeidstidOverview],
    publishedAt: "2026-04-02T08:00:00.000Z",
  },
  {
    title: "Tidsregistrering for miljøarbeidere",
    slug: "tidsregistrering-for-miljoarbeidere",
    excerpt:
      "Miljøarbeid skjer ofte i felt, i turnus og med skiftende oppgaver. Her er en praktisk guide til trygg og enkel tidsregistrering for miljøarbeidere.",
    categorySlug: "yrkesguider",
    featuredImage: stockCaregiver,
    ogImage: assetOg(stockCaregiver),
    metaTitle: "Tidsregistrering for miljøarbeidere | Tidum",
    metaDescription:
      "Slik fører miljøarbeidere timer riktig i felt, turnus og oppfølging. Praktiske råd om arbeidstid, avvik og dokumentasjon.",
    tags: ["miljøarbeider", "tidsregistrering for miljøarbeidere", "timeregistrering app", "arbeidstid"],
    intro: [
      "Miljøarbeidere jobber sjelden i en helt lik hverdag. Arbeidet kan skifte mellom feltoppfølging, møter, transport, turnus, hjemmebesøk og dokumentasjon.",
      "Det gjør tidsregistrering ekstra viktig. Ikke fordi du skal fylle ut mer, men fordi arbeidstiden må være mulig å forstå i etterkant uten at du trenger å gjenfortelle hele dagen.",
    ],
    leadFigure: {
      src: screenshotMobile,
      alt: "Tidum på mobil for miljøarbeidere",
      caption: "Feltarbeid krever ofte mobilvennlig føring som kan gjøres mellom oppdrag, ikke bare ved skrivebordet.",
    },
    whatIs: {
      paragraphs: [
        "For miljøarbeidere betyr tidsregistrering å dokumentere arbeidstid på en måte som skiller tydelig mellom når du jobbet, hva slags vakt det var og hvilke avvik som faktisk oppsto.",
        "Det betyr ikke at sensitive brukeropplysninger skal inn i timelisten. Timelisten bør handle om arbeidstid, aktivitetstype og nødvendig oppfølging, ikke detaljerte personopplysninger om brukere eller familier.",
      ],
      bullets: [
        "vaktstart og vaktslutt",
        "pauser og avbrudd",
        "ekstra oppmøte eller forlengelse av vakt",
        "tiltak, avdeling eller team hvis det er relevant",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Miljøarbeid foregår ofte i situasjoner der dagen endrer seg raskt. Da er det lett å tenke at registreringen kan vente, men det er nettopp i slike jobber at avvik og belastning blir vanskeligst å se uten god oversikt.",
        "Gode timelister gjør det enklere å følge opp turnus, ressursbruk, overtid og bemanningsbehov uten å blande tidsregistrering med fagjournal eller saksnotat.",
      ],
    },
    steps: {
      paragraphs: [
        "En god arbeidsflyt for miljøarbeidere bør være enkel, tydelig og mulig å bruke mens vakten pågår.",
      ],
      bullets: [
        "Før starttid og sluttid samme dag som vakten gjennomføres.",
        "Bruk egne felter for pause, ekstra tid og avvik.",
        "Hold faglige notater og timeliste adskilt fra hverandre.",
        "Bruk ledergodkjenning til å fange opp uvanlige vakter og ekstra arbeidstid.",
        "Se over ukebildet før timene går videre til lønn eller rapportering.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotDesktop,
      alt: "Tidum desktop for miljøarbeid og timeføring",
      caption: "Lederoversikten gjør det enklere å se avvik i feltarbeid uten å be ansatte forklare gamle vakter på nytt.",
    },
    commonMistakes: {
      paragraphs: [
        "I miljøarbeid ser vi ofte at timelisten blir brukt til mer enn den er ment for. Det skaper både personvernrisiko og dårligere oversikt.",
      ],
      bullets: [
        "man legger inn sensitive opplysninger i timelisten",
        "transport, ventetid og aktiv oppfølging blandes uten forklaring",
        "vakten føres som planlagt selv om den faktisk ble forlenget",
        "godkjenning skjer så sent at detaljene allerede er uklare",
      ],
    },
    tools: {
      paragraphs: [
        "Miljøarbeidere trenger et verktøy som fungerer ute i arbeidshverdagen, ikke bare på kontoret. Mobil føring og enkel ledergodkjenning er viktigere enn flest mulig felter.",
        "Tidum er laget for denne typen arbeidshverdag: rask føring, tydelig avviksregistrering og et skille mellom arbeidstid og annen dokumentasjon.",
      ],
    },
    sources: [
      officialSources.arbeidstidRegistrering,
      officialSources.datatilsynetWorkplace,
      officialSources.datatilsynetControl,
    ],
    publishedAt: "2026-04-01T08:00:00.000Z",
  },
  {
    title: "Tidsregistrering i helsevesenet – hva er kravene?",
    slug: "tidsregistrering-i-helsevesenet-hva-er-kravene",
    excerpt:
      "I helsevesenet møter arbeidstid både turnus, beredskap og dokumentasjonskrav. Her er hva virksomheter må ha kontroll på og hva som ofte skaper feil.",
    categorySlug: "yrkesguider",
    featuredImage: screenshotDesktop,
    ogImage: assetOg(screenshotDesktop),
    metaTitle: "Tidsregistrering i helsevesenet – hva er kravene? | Tidum",
    metaDescription:
      "Hva kreves av tidsregistrering i helsevesenet? Få oversikt over arbeidstid, turnus, beredskap og dokumentasjon i norsk regelverk.",
    tags: ["helsevesenet", "arbeidstid helsevesenet", "turnus regler", "arbeidsmiljøloven arbeidstid"],
    intro: [
      "I helsevesenet er arbeidstid sjelden bare et spørsmål om start og slutt. Turnus, vaktskifter, beredskap, nattarbeid og dokumentasjonsplikt gjør registreringen mer kompleks enn i mange andre bransjer.",
      "Det finnes ikke ett enkelt særkrav som løser alt. Virksomheten må ha kontroll på både arbeidsmiljølovens rammer, egne turnusordninger og hvordan faktisk arbeidstid avviker fra planen.",
    ],
    leadFigure: {
      src: screenshotDesktop,
      alt: "Tidum desktop for helse og turnus",
      caption: "Når faktisk arbeidstid og planlagt vakt kan sammenlignes, blir det lettere å følge opp lange vakter, ekstraarbeid og avvik.",
    },
    whatIs: {
      paragraphs: [
        "Tidsregistrering i helsevesenet betyr å kunne vise hvor mye den enkelte faktisk har arbeidet, når det er jobbet utover plan, og hvordan eventuelle vakter, beredskap eller passive perioder skal forstås.",
        "For mange virksomheter er utfordringen at turnusplanen er tydelig, mens avvikene underveis ikke blir registrert godt nok. Det er nettopp der feilene oppstår.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Arbeidstid i helse og omsorg påvirker både forsvarlig drift og arbeidsmiljø. Hvis registreringen er svak, blir det vanskelig å følge opp belastning, hviletid og behov for endringer i bemanningen.",
        "Arbeidstilsynet peker også på at virksomheter som søker om gjennomsnittsberegning i helse- og omsorgsarbeid må gi informasjon om passive perioder når ordningen er lang eller avviker mye.",
      ],
      bullets: [
        "turnus må stemme mot faktisk arbeidstid",
        "lange vakter og nattarbeid krever bedre kontroll",
        "beredskap og passive perioder må håndteres tydelig",
        "leder må se mønster over tid, ikke bare enkeltskift",
      ],
    },
    steps: {
      paragraphs: [
        "For å få kontroll i helsevesenet bør virksomheten bygge registreringen rundt avvikshåndtering, ikke bare standardvakter.",
      ],
      bullets: [
        "La planlagt turnus være utgangspunkt, men registrer faktisk tid separat.",
        "Marker ekstraarbeid, bytte av vakt og forlengelser samme dag.",
        "Avklar hvordan beredskap og passive perioder skal registreres i virksomheten.",
        "Sjekk ukentlig om gjennomsnittsberegning, hviletid og samlet belastning ser forsvarlig ut.",
        "Bruk rapporter som grunnlag for lederoppfølging, ikke bare for lønn.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotMobileViewport,
      alt: "Tidum mobil for helse og omsorg",
      caption: "Mobil føring gjør det enklere å registrere avvik mens vakten fortsatt er fersk, i stedet for å stole på hukommelse senere.",
    },
    commonMistakes: {
      paragraphs: [
        "Feilene i helsevesenet handler ofte om at plan og virkelighet glir fra hverandre uten at systemet fanger det opp.",
      ],
      bullets: [
        "turnusplanen blir stående som fasit selv når vakten endres",
        "beredskap eller passive perioder registreres ikke tydelig nok",
        "ekstra tid etter vaktslutt føres som notat i stedet for arbeidstid",
        "leder ser totalen, men ikke belastningen fordelt over flere uker",
      ],
    },
    tools: {
      paragraphs: [
        "Helse- og omsorgsarbeid trenger et verktøy som tåler skift, avvik og godkjenningsflyt. Det viktigste er at løsningen gjør faktisk arbeidstid synlig og enkel å kontrollere mot plan.",
        "Tidum kan brukes som et praktisk arbeidstidssystem for virksomheter som vil ha bedre oversikt over turnus, avvik og ledergodkjenning uten å gjøre føringen tyngre for ansatte.",
      ],
    },
    sources: [
      officialSources.arbeidstidRegistrering,
      officialSources.gjennomsnittsberegning,
      officialSources.beredskapsvakt,
      officialSources.aml104,
      officialSources.aml107,
    ],
    publishedAt: "2026-03-31T08:00:00.000Z",
  },
  {
    title: "Hvordan føre timer som BPA-assistent",
    slug: "hvordan-fore-timer-som-bpa-assistent",
    excerpt:
      "BPA-arbeid skjer ofte hjemme hos tjenestemottaker og i varierende vakter. Her er en praktisk guide til trygg og ryddig timeføring for BPA-assistenter.",
    categorySlug: "yrkesguider",
    featuredImage: stockCaregiver,
    ogImage: assetOg(stockCaregiver),
    metaTitle: "Hvordan føre timer som BPA-assistent | Tidum",
    metaDescription:
      "Slik fører du timer riktig som BPA-assistent. Praktiske råd om vakter, avvik, turnus og dokumentasjon i BPA-arbeid.",
    tags: ["bpa assistent", "bpa", "timeregistrering", "arbeidstid"],
    intro: [
      "Som BPA-assistent jobber du ofte tett på hverdagen til tjenestemottakeren, og vaktene kan variere mye fra dag til dag. Nettopp derfor bør timene føres så konkret og nøkternt som mulig.",
      "En god timeliste i BPA handler om arbeidstid, ikke om privatlivet til den du jobber for. Klare rutiner gjør det lettere både for assistent, arbeidsleder og arbeidsgiver.",
    ],
    leadFigure: {
      src: screenshotMobile,
      alt: "Tidum på mobil for BPA-assistenter",
      caption: "BPA-arbeid krever ofte enkel føring på mobil, med tydelige vakter og avvik uten unødvendige felter.",
    },
    whatIs: {
      paragraphs: [
        "For BPA-assistenter betyr tidsregistrering å dokumentere når du faktisk jobbet, om vakten ble endret, og hvilke timer som eventuelt må godkjennes som ekstraarbeid.",
        "I BPA er det spesielt viktig å holde timelisten fri for detaljerte personopplysninger. Timelisten skal dokumentere arbeidstid og arbeidsforhold, ikke medisinske eller private forhold.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "BPA-arbeid kan være organisert gjennom kommune, privat leverandør eller andre arbeidsgivere. Uansett modell er det viktig at arbeidstiden dokumenteres tydelig, slik at både lønn, turnus og lederoppfølging blir riktig.",
        "Hvis arbeidsgiverrollen ligger hos en privatperson eller arbeidsleder, blir det ekstra viktig med en enkel og forståelig løsning som ikke gjør oppfølgingen unødvendig vanskelig.",
      ],
      bullets: [
        "du dokumenterer faktisk utført arbeid",
        "endringer i vakten blir enklere å følge opp",
        "arbeidsgiver får bedre oversikt over belastning og bemanning",
        "det blir mindre risiko for misforståelser om tillegg og ekstraarbeid",
      ],
    },
    steps: {
      paragraphs: [
        "En BPA-timeliste bør være enkel nok til å brukes hver dag, også når vakten endrer seg underveis.",
      ],
      bullets: [
        "Før inn planlagt eller avtalt vakt som utgangspunkt.",
        "Registrer faktisk start og slutt samme dag.",
        "Marker tydelig hvis vakten ble forlenget, forkortet eller byttet.",
        "Bruk korte, nøytrale aktivitetsbeskrivelser der det er nødvendig.",
        "La arbeidsleder eller arbeidsgiver godkjenne på fast tidspunkt.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotDesktop,
      alt: "Tidum desktop med oversikt over timer",
      caption: "En tydelig oversikt gjør det lettere for arbeidsleder å godkjenne uten å gå gjennom lange forklaringer i etterkant.",
    },
    commonMistakes: {
      paragraphs: [
        "Mange BPA-assistenter gjør en god jobb, men bruker unødvendig tid på timelister fordi rutinen er for uklar.",
      ],
      bullets: [
        "timene føres samlet på slutten av uka",
        "man skriver for mye personinformasjon i kommentarfelt",
        "vaktendringer blir ikke registrert som egne avvik",
        "arbeidsgiver må tolke fritekst i stedet for tydelige timer",
      ],
    },
    tools: {
      paragraphs: [
        "Et godt BPA-verktøy bør være enkelt for assistenten og tydelig for arbeidsleder. Målet er ikke flest mulig detaljer, men trygg og ryddig oversikt.",
        "Tidum kan brukes som en enkel løsning for å registrere vakter, avvik og godkjenning uten at timelisten blir en belastning i seg selv.",
      ],
    },
    sources: [
      officialSources.arbeidstidRegistrering,
      officialSources.privateEmployer,
      officialSources.datatilsynetWorkplace,
    ],
    publishedAt: "2026-03-30T08:00:00.000Z",
  },
  {
    title: "Turnus og timelister – slik får du oversikt",
    slug: "turnus-og-timelister-slik-far-du-oversikt",
    excerpt:
      "Når turnusen er kompleks, holder det ikke å se på planlagte vakter alene. Her er en praktisk metode for å koble turnus og timelister bedre sammen.",
    categorySlug: "yrkesguider",
    featuredImage: screenshotDesktop,
    ogImage: assetOg(screenshotDesktop),
    metaTitle: "Turnus og timelister – slik får du oversikt | Tidum",
    metaDescription:
      "Få bedre oversikt over turnus og timelister. Slik følger du opp avvik, ekstra vakter og gjennomsnittsberegning enklere.",
    tags: ["turnus", "turnus regler", "timelister", "gjennomsnittsberegning av arbeidstid"],
    intro: [
      "Turnus gir plan. Timelister viser virkelighet. Problemet oppstår når disse to ikke snakker sammen.",
      "I mange virksomheter blir turnusen brukt som bemanningskart, mens timelistene blir etterslep. Da mister du raskt kontroll på ekstraarbeid, forskyvninger og samlet belastning.",
    ],
    leadFigure: {
      src: screenshotDesktop,
      alt: "Tidum med oversikt over arbeidstid og avvik",
      caption: "Det viktigste i turnusarbeid er å se forskjellen mellom planlagt vakt og faktisk arbeidstid.",
    },
    whatIs: {
      paragraphs: [
        "Tidsregistrering i turnus betyr at du ikke bare fører hvilke vakter som skulle skje, men hvilke timer som faktisk ble jobbet. Det er dette som gir grunnlag for riktig oppfølging, lønn og kontroll.",
        "Turnus og timelister bør derfor sees som to sider av samme bilde: plan og gjennomføring.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Når virksomheten jobber i turnus, blir små avvik fort gjentakende mønstre. En sen avslutning på én vakt kan være håndterbar, men fem slike i løpet av to uker sier noe om bemanningen.",
      ],
      bullets: [
        "du ser ekstra vakter og bytter tidligere",
        "leder kan følge opp samlet belastning over tid",
        "det blir enklere å forstå hva som påvirker lønn og fravær",
        "gjennomsnittsberegning blir lettere å håndtere i praksis",
      ],
    },
    steps: {
      paragraphs: [
        "Start med å bygge en enkel kobling mellom plan og faktisk tid, i stedet for å gjøre timelisten mer komplisert.",
      ],
      bullets: [
        "La planlagt turnus være synlig, men registrer avvik separat.",
        "Marker alltid bytte av vakt, ekstra oppmøte og forlenget vakt.",
        "Se på ukes- eller månedsnivå, ikke bare én vakt av gangen.",
        "Avklar hvordan beredskap, passive perioder og tillegg skal føres.",
        "La leder bruke rapportene til kapasitetsstyring, ikke bare etterkontroll.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotMobileViewport,
      alt: "Tidum mobil timeføring i turnus",
      caption: "Mobil føring gjør det lettere å registrere endringer mens vakten fortsatt er pågående.",
    },
    commonMistakes: {
      paragraphs: [
        "Den vanligste feilen i turnus er å tro at planlagt vakt er nok som dokumentasjon. Det er den ikke hvis virkeligheten avviker.",
      ],
      bullets: [
        "turnusen brukes som timeliste",
        "ekstra vakter havner i e-post eller chat i stedet for i systemet",
        "samlet belastning blir ikke vurdert over flere uker",
        "leder godkjenner enkeltvakter uten å se mønsteret i hele perioden",
      ],
    },
    tools: {
      paragraphs: [
        "Et godt verktøy for turnusarbeid må være sterkt nok for ledelse og enkelt nok for den som står i vakten. Det bør gjøre avvik synlige uten å gjøre registreringen treg.",
        "Tidum gjør det lettere å samle timer, avvik og ledergodkjenning i samme flyt, slik at turnus ikke bare blir en plan, men et faktisk styringsgrunnlag.",
      ],
    },
    sources: [
      officialSources.arbeidstidRegistrering,
      officialSources.gjennomsnittsberegning,
      officialSources.beredskapsvakt,
    ],
    publishedAt: "2026-03-29T08:00:00.000Z",
  },
  {
    title: "Hva sier arbeidsmiljøloven om arbeidstid?",
    slug: "hva-sier-arbeidsmiljoloven-om-arbeidstid",
    excerpt:
      "Arbeidsmiljøloven setter rammene for arbeidstid, overtid og hvile. Her er hovedreglene du bør kjenne til og hva de betyr i praksis.",
    categorySlug: "regelverk-og-krav",
    featuredImage: screenshotDesktop,
    ogImage: assetOg(screenshotDesktop),
    metaTitle: "Hva sier arbeidsmiljøloven om arbeidstid? | Tidum",
    metaDescription:
      "Se hva arbeidsmiljøloven sier om arbeidstid, overtid og registrering. En praktisk forklaring for arbeidsgivere og ledere.",
    tags: ["arbeidsmiljøloven arbeidstid", "aml arbeidstid", "arbeidstid", "timeregistrering"],
    intro: [
      "Arbeidsmiljøloven er rammen for hvordan arbeidstid skal organiseres i Norge. Likevel oppleves reglene ofte som uklare fordi de må brukes sammen med turnus, avtaler, praksis og faktisk arbeidshverdag.",
      "Hvis du skal ha kontroll, er det ikke nok å vite hva som står i loven. Du må også kunne se hvordan arbeidstiden faktisk utspiller seg i virksomheten.",
    ],
    leadFigure: {
      src: screenshotDesktop,
      alt: "Tidum med arbeidstidsoversikt",
      caption: "Loven gir rammene, men virksomheten trenger også en konkret oversikt over faktisk arbeidstid.",
    },
    whatIs: {
      paragraphs: [
        "Arbeidstid er i arbeidsmiljøloven den tiden arbeidstaker står til disposisjon for arbeidsgiver. Det betyr at det er den reelle tilgjengeligheten og innsatsen som er avgjørende, ikke bare hva som sto i planen.",
        "Loven skiller også mellom alminnelig arbeidstid, overtid, pauser, hvileperioder og ulike ordninger som kan gi en annen fordeling av arbeidstiden over tid.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Reglene er viktige fordi arbeidstid påvirker både helse, sikkerhet og lønn. I praksis er de også viktige fordi arbeidsgiver må kunne vise at arbeidsordningen er forsvarlig og innenfor rammene i loven.",
      ],
      bullets: [
        "alminnelig arbeidstid har lovbestemte grenser",
        "overtid krever egne vilkår og må kunne dokumenteres",
        "hvile og fritid skal ivaretas i arbeidstidsordningen",
        "arbeidsgiver må ha løpende oversikt over arbeidstiden",
      ],
    },
    steps: {
      paragraphs: [
        "Hvis du vil bruke arbeidsmiljøloven riktig i praksis, bør du jobbe i denne rekkefølgen.",
      ],
      bullets: [
        "Kartlegg hva som er planlagt arbeidstid i virksomheten.",
        "Sammenlign plan med faktisk arbeidstid uke for uke.",
        "Fang opp overtid, lange vakter og hvilebrudd så tidlig som mulig.",
        "Avklar om dere bruker turnus, gjennomsnittsberegning eller beredskap som krever egne rutiner.",
        "Sørg for at oversikten faktisk er tilgjengelig når leder, tillitsvalgte eller Arbeidstilsynet trenger den.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotMobileViewport,
      alt: "Mobil oversikt for arbeidstid",
      caption: "God registrering gjør det mulig å se om virksomheten holder seg innenfor de rammene loven setter.",
    },
    commonMistakes: {
      paragraphs: [
        "Mange blander lovens hovedregler med lokale praksiser. Da blir det fort uklart om avviket egentlig er lovlig, avtalt eller bare vanlig.",
      ],
      bullets: [
        "man bruker bare turnusplanen som dokumentasjon",
        "overtid og forskyvninger føres ikke tydelig",
        "man antar at pauser alltid er fritid uten å vurdere situasjonen",
        "oversikten finnes, men er ikke enkel å kontrollere",
      ],
    },
    tools: {
      paragraphs: [
        "Et verktøy kan ikke erstatte lovforståelse, men det kan gjøre det mye enklere å følge opp reglene i praksis. Det viktigste er å se faktisk arbeidstid tydelig og tidlig.",
        "Tidum hjelper virksomheter med å samle registrering, avvik og lederoversikt slik at det blir enklere å jobbe systematisk med arbeidstid i hverdagen.",
      ],
    },
    sources: [
      officialSources.aml104,
      officialSources.aml107,
      officialSources.arbeidstidOverview,
      officialSources.arbeidstidRegistrering,
    ],
    publishedAt: "2026-03-28T08:00:00.000Z",
  },
  {
    title: "Er det krav til timelister i Norge?",
    slug: "er-det-krav-til-timelister-i-norge",
    excerpt:
      "Ja, arbeidsgiver må ha oversikt over hvor mye den enkelte arbeider. Her er hva kravet betyr i praksis og hvorfor formatet er mindre viktig enn kvaliteten.",
    categorySlug: "regelverk-og-krav",
    featuredImage: screenshotDesktop,
    ogImage: assetOg(screenshotDesktop),
    metaTitle: "Er det krav til timelister i Norge? | Tidum",
    metaDescription:
      "Er timelister lovpålagt i Norge? Se hva arbeidsgiver faktisk må dokumentere og hva kravet betyr i praksis.",
    tags: ["timelister", "er det krav til timelister", "arbeidstid", "arbeidsmiljøloven arbeidstid"],
    intro: [
      "Spørsmålet dukker opp ofte: Må virksomheter faktisk føre timelister i Norge? Det korte svaret er at arbeidsgiver må ha oversikt over hvor mye den enkelte arbeidstaker har arbeidet.",
      "Det betyr ikke at loven krever én bestemt mal eller ett bestemt system. Men den krever at oversikten er god nok til å kontrollere arbeidstidsordningen i praksis.",
    ],
    leadFigure: {
      src: screenshotDesktop,
      alt: "Tidum oversikt over timelister",
      caption: "Det avgjørende er ikke om oversikten ligger i et regneark eller et system, men om den faktisk kan brukes til kontroll og oppfølging.",
    },
    whatIs: {
      paragraphs: [
        "Timelister er virksomhetens dokumentasjon av faktisk arbeidstid. De bør vise når arbeid startet og sluttet, og hvordan arbeidstiden er sammensatt over tid.",
        "Arbeidstilsynet peker på at registreringen må være satt opp slik at både arbeidsgiver og tilsynsmyndigheten kan kontrollere arbeidstidsordningen.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Kravet er viktig fordi arbeidstid ikke bare handler om lønn. Det handler også om helse, hvile, overtid og om virksomheten faktisk har kontroll på arbeidsbelastningen.",
      ],
      bullets: [
        "arbeidsgiver får et faktisk grunnlag for oppfølging",
        "arbeidstaker får bedre trygghet for at timer er registrert riktig",
        "Arbeidstilsynet kan kontrollere ordningen dersom det blir nødvendig",
        "tillitsvalgte og ledere får et tydeligere utgangspunkt for dialog",
      ],
    },
    steps: {
      paragraphs: [
        "Hvis du vil oppfylle kravet i praksis, bør du tenke mer på kvalitet enn på filformat.",
      ],
      bullets: [
        "Velg én løsning som viser faktisk arbeidstid per ansatt.",
        "Sørg for at registreringen skjer fortløpende og ikke bare i etterkant.",
        "Registrer også relevante avvik som overtid, beredskap eller passive perioder.",
        "Lag en fast godkjenningsrutine.",
        "Sjekk jevnlig om oversikten faktisk er enkel å kontrollere.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotMobileViewport,
      alt: "Tidum mobilvisning av timer",
      caption: "Fortløpende registrering gir bedre kvalitet enn timelister som fylles ut lenge etter at vakten er ferdig.",
    },
    commonMistakes: {
      paragraphs: [
        "Den vanligste feilen er å tro at kravet er oppfylt fordi noen kan sette opp en fil ved behov. Kravet gjelder den løpende oversikten, ikke bare sluttresultatet.",
      ],
      bullets: [
        "timer blir fylt ut samlet i etterkant",
        "oversikten mangler avvik og ekstraarbeid",
        "arbeidsgiver ser bare summer, ikke faktisk tid",
        "timelisten finnes, men er ikke mulig å kontrollere ordentlig",
      ],
    },
    tools: {
      paragraphs: [
        "Et godt verktøy gjør det enklere å oppfylle kravet i praksis, fordi registreringen blir fortløpende og oversikten blir lettere å kontrollere.",
        "Tidum er bygget nettopp for dette: tydelig arbeidstid, enklere ledergodkjenning og rapporter som faktisk kan brukes videre.",
      ],
    },
    sources: [officialSources.aml107, officialSources.arbeidstidRegistrering],
    publishedAt: "2026-03-27T08:00:00.000Z",
  },
  {
    title: "Hvor lenge må arbeidstid dokumenteres?",
    slug: "hvor-lenge-ma-arbeidstid-dokumenteres",
    excerpt:
      "Arbeidstid må lagres så lenge det er nødvendig og så lenge annet regelverk krever det. Her er hvordan du vurderer lagringstid uten å forenkle feil.",
    categorySlug: "regelverk-og-krav",
    featuredImage: stockClock,
    ogImage: assetOg(stockClock),
    metaTitle: "Hvor lenge må arbeidstid dokumenteres? | Tidum",
    metaDescription:
      "Hvor lenge må arbeidstid og timelister lagres? Se hvordan arbeidsmiljøloven, bokføringsregler og personvern påvirker lagringstiden.",
    tags: ["arbeidstid dokumentasjon", "timelister lagring", "bokføringsloven", "personvern arbeidsplassen"],
    intro: [
      "Det finnes ikke ett enkelt svar som passer alle virksomheter. Hvor lenge arbeidstid må dokumenteres avhenger av hvorfor opplysningene lagres og hvilket regelverk de inngår i.",
      "I praksis betyr det at timelister ofte må vurderes både som arbeidstidsoversikt, grunnlag for lønn og som personopplysninger.",
    ],
    leadFigure: {
      src: screenshotDesktop,
      alt: "Tidum med historikk for arbeidstid",
      caption: "Et godt arbeidstidssystem gjør det enklere å vite hva som er lagret, hvorfor det er lagret og når det kan slettes.",
    },
    whatIs: {
      paragraphs: [
        "Arbeidstidsdokumentasjon er informasjon som viser hvor mye den enkelte har arbeidet, når arbeidet er utført og hvordan opplysningene inngår i virksomhetens oppfølging, lønn eller kontroll.",
        "Noen virksomheter trenger timelistene primært for arbeidstidskontroll, mens andre også bruker dem som underlag for lønn, fakturering eller bokføring. Det påvirker hvor lenge de må oppbevares.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Lagringstid er viktig fordi virksomheten både må kunne dokumentere det som er nødvendig, og samtidig slette eller begrense opplysninger som ikke lenger har et formål.",
        "Hvis du sletter for tidlig, kan du miste viktig grunnlag for oppfølging eller kontroll. Hvis du lagrer for lenge uten grunn, kan du komme i konflikt med personvernreglene.",
      ],
    },
    steps: {
      paragraphs: [
        "Det tryggeste er å lage en bevisst lagringsrutine i stedet for å anta at én frist gjelder for alt.",
      ],
      bullets: [
        "Kartlegg hvorfor dere lagrer timelistene.",
        "Avgjør om de også er del av lønns- eller bokføringsgrunnlag.",
        "Definer en lagringsperiode i interne rutiner og informer brukerne.",
        "Sørg for at historikk og sletting kan håndteres kontrollert.",
        "Gå jevnlig gjennom om opplysningene fortsatt er nødvendige å beholde.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotMobile,
      alt: "Tidum mobil med arbeidstid",
      caption: "Når arbeidstid føres systematisk, blir det også enklere å styre lagringstid og tilgang til opplysningene.",
    },
    commonMistakes: {
      paragraphs: [
        "Den vanligste feilen er å lete etter én universell lagringsfrist. I praksis må virksomheten vurdere både bokføringsplikt og personvern.",
      ],
      bullets: [
        "man blander arbeidstidsoversikt og bokføringsdokumentasjon uten å skille formål",
        "ingen vet hvem som har ansvar for sletting eller arkivering",
        "historikk blir liggende i gamle filer uten styring på tilgang",
        "virksomheten lagrer alt på ubestemt tid fordi det føles tryggest",
      ],
    },
    tools: {
      paragraphs: [
        "Et godt system gjør det lettere å ha kontroll på både historikk og tilgang. Da blir det enklere å dokumentere det som må beholdes og rydde bort det som ikke lenger er nødvendig.",
        "Tidum kan brukes som et tydelig arbeidstidssystem der historikk, godkjenning og tilgang henger sammen. Det gjør det lettere å bygge gode lagringsrutiner rundt opplysningene.",
      ],
    },
    sources: [
      officialSources.aml107,
      officialSources.bokforing13,
      officialSources.datatilsynetWorkplace,
      officialSources.datatilsynetControl,
    ],
    publishedAt: "2026-03-26T08:00:00.000Z",
  },
  {
    title: "Kan arbeidsgiver kreve tidsregistrering?",
    slug: "kan-arbeidsgiver-kreve-tidsregistrering",
    excerpt:
      "Ja, arbeidsgiver kan i utgangspunktet kreve tidsregistrering. Men løsningen må være saklig, forholdsmessig og håndtere personopplysninger riktig.",
    categorySlug: "regelverk-og-krav",
    featuredImage: stockClock,
    ogImage: assetOg(stockClock),
    metaTitle: "Kan arbeidsgiver kreve tidsregistrering? | Tidum",
    metaDescription:
      "Kan arbeidsgiver kreve at ansatte registrerer timer? Ja, men tidsregistreringen må være saklig, tydelig og personvernmessig forsvarlig.",
    tags: ["kan arbeidsgiver kreve tidsregistrering", "kontrolltiltak", "personvern arbeidsplassen", "timeregistrering"],
    intro: [
      "Ja, arbeidsgiver kan som hovedregel kreve tidsregistrering. Det henger tett sammen med arbeidsgivers ansvar for å ha kontroll på arbeidstid, lønn og arbeidsmiljø.",
      "Men det betyr ikke at enhver løsning er lovlig eller klok. Når tidsregistrering også fungerer som kontrolltiltak eller innebærer behandling av personopplysninger, stilles det krav til saklighet, informasjon og forholdsmessighet.",
    ],
    leadFigure: {
      src: screenshotMobileViewport,
      alt: "Tidum mobil for enkel tidsregistrering",
      caption: "Jo tydeligere og mindre inngripende løsningen er, jo enklere er det å forsvare den både praktisk og personvernmessig.",
    },
    whatIs: {
      paragraphs: [
        "Tidsregistrering er arbeidsgivers måte å få oversikt over faktisk arbeidstid. Den kan være enkel, som start og slutt per vakt, eller mer detaljert der det er nødvendig for virksomheten.",
        "Når løsningen samler inn flere opplysninger enn det som trengs, eller brukes til bred overvåking av ansatte, må virksomheten være ekstra varsom.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Arbeidsgiver trenger tidsregistrering for å kunne følge opp arbeidstidsreglene, men ansatte har samtidig krav på et forsvarlig arbeidsmiljø og personvern på jobb.",
      ],
      bullets: [
        "virksomheten må ha reell oversikt over arbeidstid",
        "ansatte skal forstå hvorfor opplysningene registreres",
        "kontrolltiltak må være saklig begrunnet",
        "personopplysninger skal ikke samles inn i større omfang enn nødvendig",
      ],
    },
    steps: {
      paragraphs: [
        "For å innføre eller bruke tidsregistrering riktig bør arbeidsgiver gå systematisk til verks.",
      ],
      bullets: [
        "Definer hvorfor registreringen er nødvendig for virksomheten.",
        "Velg en løsning som samler inn minst mulig data utover det som trengs.",
        "Informer ansatte tydelig om formål, bruk, tilgang og lagringstid.",
        "Vurder om ordningen også er et kontrolltiltak etter arbeidsmiljøloven kapittel 9.",
        "Følg opp jevnlig om løsningen fortsatt er forholdsmessig og forståelig.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotDesktop,
      alt: "Tidum lederoversikt for arbeidstid",
      caption: "Tydelig arbeidstidsoversikt er lettere å forsvare enn løsninger som samler inn mer kontrollinformasjon enn virksomheten trenger.",
    },
    commonMistakes: {
      paragraphs: [
        "Konflikter oppstår ofte ikke fordi arbeidsgiver registrerer tid, men fordi formålet er uklart eller løsningen oppleves mer overvåkende enn nødvendig.",
      ],
      bullets: [
        "ansatte får ikke god nok informasjon om hvorfor systemet brukes",
        "virksomheten samler inn mer data enn det er behov for",
        "arbeidstid og overvåking blandes i samme løsning",
        "tilgangsstyring og lagringstid er uklart definert",
      ],
    },
    tools: {
      paragraphs: [
        "Det beste verktøyet er som regel det minst kompliserte som fortsatt gir arbeidsgiver den oversikten som trengs. Enkel registrering og tydelig godkjenningsflyt er ofte bedre enn brede kontrollfunksjoner.",
        "Tidum er bygget rundt arbeidstid og godkjenning, ikke unødvendig overvåking. Det gjør det lettere å ha en løsning som både ledelse og ansatte kan forstå og bruke.",
      ],
    },
    sources: [
      officialSources.aml107,
      officialSources.aml91,
      officialSources.datatilsynetWorkplace,
      officialSources.datatilsynetControl,
    ],
    publishedAt: "2026-03-25T08:00:00.000Z",
  },
  // ── Auto-kjøregodt — produkt-showcase ───────────────────────────────────────
  {
    title: "Auto-kjøregodt for miljøarbeidere — slik skriver kjøreloggen seg selv",
    slug: "auto-kjoregodt-for-miljoarbeidere",
    excerpt:
      "Når miljøarbeider stempler inn på en sak, regner Tidum automatisk ut kjøregodtgjørelse fra der du står til klientens adresse. Slik bygde vi det uten å ofre personvernet.",
    categorySlug: "yrkesguider",
    featuredImage: "/screenshots/tidum-time-mobile.png",
    ogImage: assetOg("/screenshots/tidum-time-mobile.png"),
    metaTitle: "Auto-kjøregodt for miljøarbeidere — slik fungerer det | Tidum",
    metaDescription:
      "Tidum auto-registrerer kjøregodtgjørelse når miljøarbeider stempler inn på sak. Sak-adressen er kjent, telefonen henter posisjonen, kjøreloggen blir riktig — uten manuelt arbeid.",
    tags: ["kjøregodt", "miljøarbeider", "stempling", "auto-registrering", "personvern"],
    intro: [
      "Miljøarbeidere kjører mellom oppdrag hele dagen. Klient hjemme, klient på avlastning, klient på aktivitetssenter, kontor, hjem. Hver tur skal i kjøreloggen — og hver linje er kr 3,50 per kilometer som glipper hvis den ikke føres.",
      "I praksis fører få arbeidere kjøregodt nøyaktig. Det er ikke fordi de er slurvete, men fordi det er tungvint: huske km, slå opp adresser, regne ut, fylle inn skjema. Konsekvensen er at miljøarbeideren betaler regningen for jobb-kjøringen sin selv.",
      "Vi bygde derfor auto-kjøregodt: en stempling-først-flyt der kjøringen registreres som en bivirkning av at du gjør jobben.",
    ],
    leadFigure: {
      src: "/screenshots/tidum-time-mobile.png",
      alt: "Tidum stemplings-flate på mobil med sak-velger og kjøre-felt",
      caption: "Sak-velger over timer-kortet. Når sak har «standard arbeidssted» registrert, dukker auto-kjøring opp som en grønn indikator.",
    },
    whatIs: {
      paragraphs: [
        "Auto-kjøregodt er en kobling mellom tre ting Tidum allerede har: sakens registrerte adresse, miljøarbeiderens GPS ved stempling, og kjøreloggen som regnskaps-bilag.",
        "Når disse tre møtes på samme tidspunkt, kan systemet skrive en hel kjøre-linje selv: fra punkt A (der du er) til punkt B (sakens adresse), beregnet i kilometer, multiplisert med statens skattefrie sats, og lagret som primær-kjøretur for dagen.",
      ],
      bullets: [
        "Tiltakslederen registrerer sakens standard arbeidssted én gang — adresse via Kartverket-søk, lat/lng faller på plass automatisk.",
        "Miljøarbeideren får en sak-velger over timer-kortet. Velger sak før «Fortsett».",
        "Ved stempling fanges posisjonen én gang. Hvis avstanden til sak er mer enn 300 meter, opprettes en kjøre-leg automatisk.",
        "Mellomstopp i løpet av dagen kan legges til manuelt — Auto-flyten er bare for primærruten.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "Riktig kjøregodt handler ikke bare om penger. Det er en del av arbeidskontrakten din, og når føringen blir tungvint blir den i praksis underrapportert.",
        "Tidum gir fra første dag en korrekt logg over reisene som faktisk skjedde, knyttet til den faktiske saken. Når regnskap eller skattemyndigheter spør, har du dokumentasjon med tidsstempel og posisjon — ikke en Excel-fil med tilnærmede tall.",
      ],
      bullets: [
        "Miljøarbeider får riktig betalt for kjøring uten å fylle ut skjema",
        "Tiltaksleder slipper å minne om manglende kjøreloggføring",
        "Vendor får revisjonsklar dokumentasjon på 3,50 kr/km-utlegg",
        "Klient-adresser ligger ett sted (saken) i stedet for spredt i hver miljøarbeiders egen liste",
      ],
    },
    steps: {
      paragraphs: [
        "Sett det opp én gang per sak, så går det av seg selv. Slik:",
      ],
      bullets: [
        "Tiltaksleder åpner saken under «Mine saker» og trykker stedmarkør-knappen.",
        "Skriver inn klient-adressen i Kartverket-søket — koordinatene fylles inn automatisk.",
        "Tildeler saken til miljøarbeider(e) som vanlig.",
        "Miljøarbeider åpner Tidum, velger saken i sak-velgeren, trykker «Fortsett».",
        "Første gang vises et informert valg om GPS — etter Arbeidsmiljøloven §9-1. Aksepter eller avvis.",
        "Når «Ferdig» trykkes, opprettes timeoppføringen og kjøre-linjen samtidig.",
      ],
      ordered: true,
    },
    supportFigure: {
      src: screenshotDesktop,
      alt: "Tidum desktop med dagens timeregistrering og saksoversikt",
      caption: "Tidum desktop med dagens registreringer. Når sakens arbeidssted er satt, blir kjøreloggen ført automatisk uten ekstra steg for miljøarbeideren.",
    },
    commonMistakes: {
      paragraphs: [
        "Auto-kjøregodt erstatter ikke godt skjønn — det forutsetter at miljøarbeider og tiltaksleder bruker det riktig.",
      ],
      bullets: [
        "Glemmer å sette sakens arbeidssted: da skjer ingen auto-leg, miljøarbeider må føre manuelt",
        "Trykker «Fortsett» hjemme i stedet for ved klienten: GPS fanger hjem-koordinaten, ikke kjøreturen",
        "Avvist GPS én gang for alltid: kan reverseres i innstillinger, men er enkelt å glemme",
        "Mellomstopp uten standard arbeidssted: må legges inn manuelt fra «Legg til kjøring»-knappen",
      ],
    },
    tools: {
      paragraphs: [
        "Auto-kjøregodt er bygd inn i Tidums miljøarbeider-app — du trenger ingen ekstra funksjoner. GPS-lagringen er privat: koordinater avrundes til ~110m presisjon etter 90 dager og slettes helt etter 5 år. Datatilsynet og Arbeidsmiljøloven §9-1 er hovedrammeverket.",
        "Vi sender ikke koordinater til Vegvesenet, Google eller andre tredjeparter. Avstanden beregnes lokalt på serveren med Haversine-formelen (luftlinje). For kunder som krever eksakt kjørestrekning kobler vi senere på Statens vegvesens NVDB.",
      ],
    },
    sources: [
      officialSources.aml91,
      officialSources.datatilsynetWorkplace,
      officialSources.datatilsynetControl,
      officialSources.bokforing13,
    ],
    publishedAt: "2026-04-22T08:00:00.000Z",
  },
  // ── GDPR-eksplainer ────────────────────────────────────────────────────────
  {
    title: "GDPR for arbeidstid og oppfølging — slik håndterer du personopplysninger trygt",
    slug: "gdpr-for-arbeidstid-og-oppfolging",
    excerpt:
      "Personopplysningsloven, Arbeidsmiljøloven §9-1, Bokføringsloven §13. Slik fungerer regelverket for timelister, GPS-sporing og dokumentasjon i sosial- og helse-sektor.",
    categorySlug: "regelverk-og-krav",
    featuredImage: "/illustrations/data-analytics.svg",
    ogImage: assetOg("/illustrations/data-analytics.svg"),
    metaTitle: "GDPR for arbeidstid og oppfølging | Tidum",
    metaDescription:
      "Forstå GDPR, Personopplysningsloven og norske særregler for behandling av timelister, posisjonsdata og helsedokumentasjon i arbeidsforhold.",
    tags: ["gdpr", "personvern", "datatilsynet", "personopplysningsloven", "arbeidsmiljøloven"],
    intro: [
      "Personvern handler om hvilke regler som gjelder når noen behandler opplysninger om deg. I arbeidssammenheng — særlig i barnevern, NAV-tiltak og kommunalt miljøarbeid — er det ekstra strengt fordi dataene ofte berører hjelpetrengende tredjeparter.",
      "GDPR er EU-rammeverket. Personopplysningsloven (2018) gjør GDPR til norsk rett og legger på nasjonale særregler. Datatilsynet er tilsynsmyndighet og publiserer veiledning på <strong>datatilsynet.no</strong> som er praktisk forpliktende.",
      "Denne guiden tar for seg det Tidum-kunder møter daglig: timelister, kontrolltiltak (som GPS), dokumentasjon av sykmeldinger, og oppbevaring vs. sletting.",
    ],
    leadFigure: {
      src: "/illustrations/data-analytics.svg",
      alt: "Illustrasjon av personopplysninger og databehandling",
      caption: "GDPR + Personopplysningsloven + sektor-lovgivning. Lagene må stemme samtidig.",
    },
    whatIs: {
      paragraphs: [
        "GDPR krever at all behandling av personopplysninger har et klart formål, et lovlig rettsgrunnlag, og en kort nok oppbevaringstid. I et arbeidsforhold er rettsgrunnlaget vanligvis arbeidskontrakten (art. 6 b) eller berettiget interesse (art. 6 f) — sjelden samtykke, fordi maktforholdet mellom arbeidsgiver og ansatt er asymmetrisk.",
        "Norsk særrett: Arbeidsmiljøloven §9-1 sier at kontrolltiltak overfor ansatte krever saklig grunn, drøfting med ansatte/tillitsvalgte, skriftlig informasjon og at tiltaket ikke er uforholdsmessig. GPS-sporing av miljøarbeidere er et typisk kontrolltiltak.",
        "Bokføringsloven §13 setter en motgrense: timebilag skal oppbevares i 5 år. Det betyr at «slett alt nå» ikke alltid er lov — vi må anonymisere brukeren, men beholde regnskapssporet.",
      ],
      bullets: [
        "Formål — hva skal data brukes til? Skriv det ned.",
        "Rettsgrunnlag — hvilken artikkel i GDPR / Personopplysningsloven hjemler behandlingen?",
        "Minimering — bare det som er nødvendig.",
        "Oppbevaring — så kort som lovlig mulig, lengre kun hvis loven krever.",
        "Sikkerhet — tilgangskontroll, kryptering, logging.",
      ],
    },
    whyImportant: {
      paragraphs: [
        "I sosial- og helse-sektor håndterer dere data om sårbare mennesker — barn under barnevernet, brukere på NAV, klienter med diagnose. Et brudd er både juridisk og etisk dyrere her enn i andre bransjer.",
        "Datatilsynet kan ilegge bøter på inntil 4 % av global omsetning eller 20 millioner euro — det høyeste. Mer praktisk: vendor-kunder krever skriftlig databehandleravtale (DPA) før kontrakt skrives. Uten orden i personvernet får dere ikke signere.",
      ],
      bullets: [
        "DPA er inngangsbilletten for offentlige kunder",
        "Avvik må meldes til Datatilsynet innen 72 timer (art. 33)",
        "DPIA (vurdering av personvernkonsekvenser) kreves for systematisk overvåking eller behandling av Art. 9-data",
        "De ansatte har rett til innsyn, retting og «sletting» (med begrensninger for regnskap)",
      ],
    },
    steps: {
      paragraphs: [
        "En praktisk 7-stegs sjekkliste for arbeidsgivere som håndterer timelister og dokumentasjon:",
      ],
      bullets: [
        "Kartlegg hvilke data dere samler inn — lag en behandlingsoversikt (art. 30).",
        "Skriv en personvernerklæring som dekker alle datatypene. Oppdater når dere endrer rutiner.",
        "Inngå databehandleravtale med hver leverandør (regnskap, lønn, timeliste-system).",
        "Drøft kontrolltiltak (timeliste, GPS, kameraovervåking) med ansatte før innføring — Arbeidsmiljøloven §9-1.",
        "Sett oppbevaringsfrister per datatype og automatiser sletting der det er mulig.",
        "Tren ledere og HR i å besvare innsynsforespørsler innen 30 dager.",
        "Lag en avviks-rutine: hva gjør dere hvis en bærbar PC mistes med klient-data på?",
      ],
      ordered: true,
    },
    supportFigure: {
      src: "/illustrations/collaboration.png",
      alt: "Samarbeid om dokumentasjon og personvern",
    },
    commonMistakes: {
      paragraphs: [
        "Det er sjelden de store, åpenbare bruddene som tar dere — det er de små rutinegrepene som glipper.",
      ],
      bullets: [
        "Spør om samtykke der rettsgrunnlaget egentlig er kontrakt eller lov — gjør det vanskeligere å trekke tilbake senere",
        "Lagrer sykmeldinger i 5+ år «for sikkerhets skyld» — Datatilsynet anbefaler 1 år for helsedata",
        "Lar GPS-koordinater stå med full presisjon på arkiverte kjøreturer",
        "Eksporterer hele klient-databasen til en ekstern konsulent uten DPA",
        "Bruker «alle ledere»-tilgang i stedet for rolle-basert tilgangskontroll",
        "Glemmer å oppdatere personvernerklæringen når en ny integrasjon legges til",
      ],
    },
    tools: {
      paragraphs: [
        "Tidum er bygget med GDPR-prinsippene som grunnpilarer — ikke som ettertanke. Auditspor på alle endringer, automatisk sletting etter konfigurerbare retensjonstider, krypterte filer for sykmeldinger, dataportabilitet via «Last ned dataene mine»-knapp og rett til pseudonymisering for hver bruker.",
        "Vendoradminer kan se vår offentlige retensjons-policy på <code>/api/gdpr/retention-policy</code>, og hver databehandleravtale knytter de konkrete fristene til kunden. Det gjør det mulig å svare ja på «Hvor lenge oppbevarer dere min data?» med en lenke i stedet for et estimat.",
        "Ingen verktøy gjør GDPR for dere — men et godt verktøy reduserer hvor mange beslutninger dere må ta hver dag for å holde regelverket. Det er forskjellen mellom etterlevelse og etterskuddsvis opprydning.",
      ],
    },
    sources: [
      officialSources.datatilsynetWorkplace,
      officialSources.datatilsynetControl,
      officialSources.aml91,
      officialSources.bokforing13,
    ],
    publishedAt: "2026-04-24T08:00:00.000Z",
  },
];

export const DEFAULT_BLOG_POSTS: DefaultBlogPostSeed[] = DEFAULT_BLOG_ARTICLES.map((article) => ({
  title: article.title,
  slug: article.slug,
  excerpt: article.excerpt,
  content: renderArticleContent(article),
  featuredImage: getBlogCoverPath(article.slug),
  ogImage: getBlogCoverOgUrl(article.slug),
  author: AUTHOR_NAME,
  categorySlug: article.categorySlug,
  tags: article.tags,
  status: "published",
  metaTitle: article.metaTitle,
  metaDescription: article.metaDescription,
  publishedAt: article.publishedAt,
}));
