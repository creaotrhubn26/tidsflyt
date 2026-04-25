/**
 * server/seed/rapport-templates.ts
 *
 * Seeds the 5 built-in rapport templates for different sector contexts.
 * Idempotent — running multiple times is safe (ON CONFLICT DO NOTHING on slug).
 *
 * Section types reference (sections JSON structure):
 *   - rich_text:              free-form textarea with GDPR check
 *   - structured_observations: repeatable observations (date, area, text)
 *   - goals_list:             use the existing rapport_maal table
 *   - activities_log:         use the existing rapport_aktiviteter table
 *   - checklist:              array of items; tester marks done/not-done + optional note
 *   - summary:                closing summary text
 */

import { db } from "../db";
import { rapportTemplates } from "@shared/schema";
import { sql } from "drizzle-orm";

type Section = {
  key: string;
  title: string;
  type: "rich_text" | "structured_observations" | "goals_list" | "activities_log" | "checklist" | "summary";
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  items?: string[];       // for checklist
  minItems?: number;      // for structured_observations / goals
};

// ─── Barnevern ──────────────────────────────────────────────────────────────
const BARNEVERN_SECTIONS: Section[] = [
  {
    key: "innledning",
    title: "Innledning og kontekst",
    type: "rich_text",
    required: true,
    placeholder: "Kort om ungdommen, boforhold og aktuell situasjon denne perioden. Ingen navn eller fødselsdatoer.",
    helpText: "Bruk anonyme betegnelser (ungdommen, jenta, gutten).",
  },
  {
    key: "maal",
    title: "Mål og tiltak",
    type: "goals_list",
    required: true,
    helpText: "Konkrete, målbare mål med fremdrift. Gruppert etter kategori (hverdagsmestring, sosialt, skole, psykisk helse).",
  },
  {
    key: "aktiviteter",
    title: "Aktivitetslogg",
    type: "activities_log",
    required: true,
    helpText: "Alle møter, samtaler og aktiviteter i perioden — med tidspunkt, sted og anonym klient-ref.",
  },
  {
    key: "observasjoner",
    title: "Observasjoner",
    type: "structured_observations",
    required: false,
    helpText: "Relevante observasjoner innenfor områdene trygghet, utvikling, relasjoner, skole/aktivitet, helse.",
  },
  {
    key: "samarbeid",
    title: "Samarbeid og nettverk",
    type: "rich_text",
    required: false,
    placeholder: "Samarbeid med skole, saksbehandler, pårørende, BUP, eventuelle andre tjenester.",
  },
  {
    key: "risiko",
    title: "Risikomomenter og oppmerksomhetsbehov",
    type: "rich_text",
    required: false,
    placeholder: "Beskytte­tiltak eller bekymringer som krever videre oppfølging. Skal varsles.",
  },
  {
    key: "avslutning",
    title: "Oppsummering og veien videre",
    type: "summary",
    required: false,
    placeholder: "Hva har gått bra? Hva bør justeres? Planlagte tiltak neste periode.",
  },
];

// ─── NAV / Arbeidsrettet oppfølging ─────────────────────────────────────────
const NAV_SECTIONS: Section[] = [
  {
    key: "innledning",
    title: "Status i perioden",
    type: "rich_text",
    required: true,
    placeholder: "Brukerens aktuelle situasjon — motivasjon, helse, livsomstendigheter som påvirker arbeidsdeltakelse.",
  },
  {
    key: "maal",
    title: "Mål i individuell plan",
    type: "goals_list",
    required: true,
    helpText: "Mål mot arbeid, utdanning eller økt aktivitet — med fremdrift.",
  },
  {
    key: "aktiviteter",
    title: "Aktivitetslogg",
    type: "activities_log",
    required: true,
    helpText: "Møter, praksis, kurs, veiledning, jobbsøking i perioden.",
  },
  {
    key: "kompetanse",
    title: "Kompetanseutvikling",
    type: "checklist",
    required: false,
    items: [
      "Deltatt i kurs eller opplæring",
      "Ferdigstilt praksis/arbeidsutprøving",
      "Deltatt på jobbmesse eller nettverksaktivitet",
      "Oppdatert CV/jobbsøknader",
      "Gjennomført arbeidsintervju",
    ],
  },
  {
    key: "helse",
    title: "Helse og funksjon",
    type: "rich_text",
    required: false,
    placeholder: "Relevante helse- og funksjonsforhold som påvirker arbeidsdeltakelse. Kun det som er dokumentasjonspliktig.",
  },
  {
    key: "samarbeid",
    title: "Samarbeid med NAV og andre tjenester",
    type: "rich_text",
    required: false,
  },
  {
    key: "avslutning",
    title: "Vurdering og videre plan",
    type: "summary",
    required: true,
    placeholder: "Vurdering av måloppnåelse, eventuell justering av tiltak, neste steg.",
  },
];

// ─── Kommune / ADL (daglig liv, bo-oppfølging) ──────────────────────────────
const KOMMUNE_SECTIONS: Section[] = [
  {
    key: "innledning",
    title: "Innledning",
    type: "rich_text",
    required: true,
    placeholder: "Kort om brukeren og bo-/omsorgssituasjonen denne perioden.",
  },
  {
    key: "adl",
    title: "ADL-ferdigheter",
    type: "checklist",
    required: false,
    helpText: "Markér hva brukeren mestrer selvstendig, med støtte, eller trenger hjelp til.",
    items: [
      "Personlig hygiene og påkledning",
      "Matlaging og kosthold",
      "Renhold og hjemmehold",
      "Økonomi og innkjøp",
      "Medisinering",
      "Transport og offentlige tjenester",
      "Kommunikasjon med hjelpeapparat",
    ],
  },
  {
    key: "maal",
    title: "Mål og tiltak",
    type: "goals_list",
    required: true,
    helpText: "Individuelle mål i ADL, sosial deltakelse og helsemestring.",
  },
  {
    key: "aktiviteter",
    title: "Aktivitetslogg",
    type: "activities_log",
    required: true,
  },
  {
    key: "sosialt",
    title: "Sosial deltakelse og nettverk",
    type: "rich_text",
    required: false,
    placeholder: "Deltakelse i fritidsaktiviteter, sosialt nettverk, familie.",
  },
  {
    key: "helse",
    title: "Helse og trivsel",
    type: "rich_text",
    required: false,
    placeholder: "Observasjoner om fysisk og psykisk helse, trivsel i hverdagen.",
  },
  {
    key: "avslutning",
    title: "Oppsummering",
    type: "summary",
    required: false,
  },
];

// ─── Helsevesen (oppfølging etter behandling, hjemmebesøk, o.l.) ────────────
const HELSE_SECTIONS: Section[] = [
  {
    key: "innledning",
    title: "Pasientens status",
    type: "rich_text",
    required: true,
    placeholder: "Kort oppsummering av aktuell helsesituasjon, behandlingsløp og fokusområder.",
  },
  {
    key: "maal",
    title: "Behandlingsmål",
    type: "goals_list",
    required: true,
    helpText: "Mål i samarbeid med behandler — rehabilitering, mestring, symptomreduksjon.",
  },
  {
    key: "aktiviteter",
    title: "Oppfølgingsaktiviteter",
    type: "activities_log",
    required: true,
    helpText: "Hjemmebesøk, samtaler, legebesøk, koordineringsmøter.",
  },
  {
    key: "helseobs",
    title: "Helseobservasjoner",
    type: "structured_observations",
    required: false,
    helpText: "Fysiske og psykiske observasjoner, symptombilde, endringer fra forrige periode.",
  },
  {
    key: "medisinering",
    title: "Medisinering og compliance",
    type: "checklist",
    required: false,
    items: [
      "Tar medisiner som foreskrevet",
      "Ingen bivirkninger rapportert",
      "Kontroll-/oppfølgingstimer holdes",
      "Lagt frem recept/forordning",
    ],
  },
  {
    key: "samarbeid",
    title: "Samarbeid med behandlere",
    type: "rich_text",
    required: false,
  },
  {
    key: "avslutning",
    title: "Vurdering og videre plan",
    type: "summary",
    required: true,
  },
];

// ─── Barnevern — Tiltaksplan (Barnevernsloven §6-3) ─────────────────────────
// Plikten til å utarbeide tiltaksplan for barn med tiltak fra barneverntjenesten.
// Loven krever spesifikke punkter som DENNE malen dekker eksplisitt.
const BARNEVERN_TILTAKSPLAN_SECTIONS: Section[] = [
  {
    key: "formaal",
    title: "Formålet med tiltaket",
    type: "rich_text",
    required: true,
    placeholder: "Hva skal tiltaket oppnå? Konkretiser i forhold til barnets behov.",
    helpText: "Lovkrav: §6-3 første ledd bokstav a — formålet med tiltaket.",
  },
  {
    key: "innhold",
    title: "Tiltakets innhold",
    type: "rich_text",
    required: true,
    placeholder: "Hva består tiltaket faktisk av? Beskriv konkret innhold, omfang og hyppighet.",
    helpText: "Lovkrav: §6-3 første ledd bokstav b — tiltakets innhold.",
  },
  {
    key: "tidsperiode",
    title: "Tidsperiode og evalueringsdato",
    type: "rich_text",
    required: true,
    placeholder: "Startdato, planlagt sluttdato, og når tiltaket skal evalueres (minst årlig).",
    helpText: "Lovkrav: §6-3 første ledd bokstav c — tidsperioden tiltaket skal vare.",
  },
  {
    key: "oppfolging",
    title: "Hvordan oppfølgingen skal gjennomføres",
    type: "rich_text",
    required: true,
    placeholder: "Hvem følger opp? Hvor ofte? Hvilke møter, samtaler, hjemmebesøk?",
    helpText: "Lovkrav: §6-3 første ledd bokstav d — gjennomføring av oppfølging.",
  },
  {
    key: "evalueringsplan",
    title: "Hvordan tiltaket skal evalueres",
    type: "rich_text",
    required: true,
    placeholder: "Hvilke kriterier brukes? Hvem deltar i evalueringen? Når og hvordan dokumenteres?",
    helpText: "Lovkrav: §6-3 første ledd bokstav e — hvordan tiltaket skal evalueres.",
  },
  {
    key: "maal",
    title: "Hovedmål og delmål",
    type: "goals_list",
    required: true,
    helpText: "Operasjonaliser formålet (over) i målbare hovedmål og delmål.",
  },
  {
    key: "barnets_medvirkning",
    title: "Barnets/ungdommens medvirkning",
    type: "rich_text",
    required: true,
    placeholder: "Hvordan har barnet deltatt? Hva er barnets synspunkt? Bruk anonymisert formulering.",
    helpText: "Lovkrav: Barnevernsloven §1-4 — barn har rett til medvirkning. Barn over 7 år skal høres.",
  },
  {
    key: "foreldrenes_medvirkning",
    title: "Foreldrenes medvirkning",
    type: "rich_text",
    required: true,
    placeholder: "Hvordan har foreldre/foresatte deltatt i utforming av planen? Hvilke synspunkter har de gitt?",
    helpText: "Lovkrav: Barnevernsloven §1-5 — foreldre med foreldreansvar har rett til medvirkning.",
  },
  {
    key: "samtykker",
    title: "Samtykker og hjemler",
    type: "checklist",
    required: true,
    items: [
      "Foreldre med foreldreansvar er informert",
      "Barnet er hørt (over 7 år) eller informert (under 7 år)",
      "Samtykke til informasjonsutveksling med skole/helse",
      "Samtykke til informasjonsutveksling med BUP/PPT",
      "Vedtaket er journalført iht. arkivforskriften",
    ],
  },
  {
    key: "aktiviteter",
    title: "Aktivitets- og møtelogg",
    type: "activities_log",
    required: false,
    helpText: "Møter med barnet, samtaler med foreldre, kontakt med samarbeidende tjenester.",
  },
  {
    key: "avslutning",
    title: "Status og videre plan",
    type: "summary",
    required: true,
    placeholder: "Aktuell status. Forslag til justeringer ved neste evaluering.",
  },
];

// ─── Barnevern — Periodisk evaluering mot §6-3-tiltaksplan ──────────────────
const BARNEVERN_EVALUERING_SECTIONS: Section[] = [
  {
    key: "innledning",
    title: "Periode og kontekst",
    type: "rich_text",
    required: true,
    placeholder: "Hvilken periode dekker evalueringen? Vesentlige hendelser i perioden.",
    helpText: "Bruk anonyme betegnelser. Ingen navn, fødselsdatoer eller adresse.",
  },
  {
    key: "maal",
    title: "Status på mål fra tiltaksplanen",
    type: "goals_list",
    required: true,
    helpText: "For hvert mål fra tiltaksplanen — er det oppnådd, delvis oppnådd, eller ikke oppnådd? Vurder fremdriften.",
  },
  {
    key: "aktiviteter",
    title: "Aktivitetslogg",
    type: "activities_log",
    required: true,
    helpText: "Møter, samtaler og oppfølgingsaktiviteter i perioden.",
  },
  {
    key: "vurdering_oppfolging",
    title: "Vurdering av oppfølgingstilnærmingen",
    type: "rich_text",
    required: false,
    placeholder: "Fungerer den valgte tilnærmingen? Hva har vist seg vanskelig? Hva har vært en suksess?",
  },
  {
    key: "barnets_synspunkt",
    title: "Barnets synspunkt på perioden",
    type: "rich_text",
    required: true,
    placeholder: "Hvordan opplever barnet selv hverdagen og tiltaket? Sitater bør anonymiseres.",
    helpText: "Lovkrav: §1-4 — dokumenter barnets stemme i perioden.",
  },
  {
    key: "foreldrenes_synspunkt",
    title: "Foreldrenes synspunkt",
    type: "rich_text",
    required: false,
    placeholder: "Foreldrenes vurdering av tiltaket i perioden, eventuelle ønsker om justering.",
  },
  {
    key: "justering_plan",
    title: "Forslag til justering av tiltaksplan",
    type: "rich_text",
    required: true,
    placeholder: "Bør tiltaket fortsette uendret, justeres, eller avsluttes? Konkrete forslag.",
    helpText: "Inn-data til neste tiltaksplan-revisjon.",
  },
  {
    key: "avslutning",
    title: "Vurdering og veien videre",
    type: "summary",
    required: true,
  },
];

// ─── NAV — Aktivitetsplan (NAV-loven §14a / Folketrygdloven §11-9) ──────────
const NAV_AKTIVITETSPLAN_SECTIONS: Section[] = [
  {
    key: "nav_status",
    title: "Brukerens status og bistandsbehov",
    type: "rich_text",
    required: true,
    placeholder: "Brukerens nåværende situasjon, helse, kompetanse, og hva slags bistand som trengs for å komme i arbeid.",
    helpText: "Lovkrav: NAV-loven §14a — kartlegging av bistandsbehov er grunnlaget for planen.",
  },
  {
    key: "maal",
    title: "Mål for aktivitet og arbeid",
    type: "goals_list",
    required: true,
    helpText: "Konkrete mål mot arbeid, utdanning eller annen aktivitet. Hovedmål og delmål.",
  },
  {
    key: "aktiviteter",
    title: "Konkrete aktiviteter",
    type: "activities_log",
    required: true,
    helpText: "Hvilke aktiviteter skal brukeren gjennomføre? Praksis, kurs, jobbsøking, veiledning.",
  },
  {
    key: "forpliktelser_bruker",
    title: "Brukerens forpliktelser",
    type: "rich_text",
    required: true,
    placeholder: "Hva forplikter brukeren seg til å gjøre? Møter, oppgaver, frister.",
    helpText: "Lovkrav: §14a — planen skal vise brukerens egne plikter.",
  },
  {
    key: "forpliktelser_nav",
    title: "NAVs forpliktelser",
    type: "rich_text",
    required: true,
    placeholder: "Hva forplikter NAV / arbeidsgiver / oppfølgingstjenesten seg til? Veiledning, ressurser, økonomisk bistand.",
    helpText: "Lovkrav: §14a — planen skal vise tjenestens egne plikter.",
  },
  {
    key: "oppfolgingsfrekvens",
    title: "Oppfølgingsfrekvens",
    type: "checklist",
    required: false,
    items: [
      "Ukentlig oppfølgingssamtale",
      "Annenhver uke",
      "Månedlig",
      "Ved spesifikke milepæler",
      "Etter behov / på forespørsel",
    ],
  },
  {
    key: "helse",
    title: "Helsemessige begrensninger",
    type: "rich_text",
    required: false,
    placeholder: "Helsemessige forhold som påvirker arbeidsdeltakelse — kun det som er dokumentasjonspliktig.",
    helpText: "Husk: helsedata er Art. 9-særlig kategori. Bruk minimumsformulering.",
  },
  {
    key: "evaluering",
    title: "Evaluering og justering av planen",
    type: "summary",
    required: true,
    placeholder: "Når og hvordan skal planen revideres? Hvilke kriterier styrer justering?",
  },
];

// ─── Kommune — Individuell plan (IPL) ──────────────────────────────────────
// Pasient- og brukerrettighetsloven §2-5 + Helse- og omsorgstjenesteloven §7-1.
// Brukerens rett til IP når det er behov for langvarige + koordinerte tjenester.
const KOMMUNE_IPL_SECTIONS: Section[] = [
  {
    key: "hovedmal",
    title: "Brukerens hovedmål",
    type: "rich_text",
    required: true,
    placeholder: "Hva ønsker brukeren å oppnå? Skrives i brukerens egne ord der mulig.",
    helpText: "Lovkrav: IP-forskriften §4 — brukerens egne mål er fundamentet.",
  },
  {
    key: "delmaal",
    title: "Delmål",
    type: "goals_list",
    required: true,
    helpText: "Operasjonaliser hovedmålet i konkrete, målbare delmål.",
  },
  {
    key: "tjenester",
    title: "Aktuelle tjenester og tjenesteytere",
    type: "rich_text",
    required: true,
    placeholder: "Hvilke tjenester er involvert? Hvem gjør hva? Eks: hjemmesykepleie, fastlege, fysioterapeut, NAV.",
    helpText: "Lovkrav: IP-forskriften §4 — oversikt over tjenester og hvem som yter dem.",
  },
  {
    key: "koordinator",
    title: "Koordinator",
    type: "rich_text",
    required: true,
    placeholder: "Hvem er utnevnt som koordinator? Kontaktinformasjon (anonymisert i ekstern publisering).",
    helpText: "Lovkrav: Helse- og omsorgstjenesteloven §7-2 — koordinator skal utpekes når brukeren ønsker IP.",
  },
  {
    key: "tidsperiode",
    title: "Tidsperiode",
    type: "rich_text",
    required: true,
    placeholder: "Når starter planen? Når skal den evalueres / oppdateres?",
  },
  {
    key: "bruker_medvirkning",
    title: "Brukerens medvirkning og deltakelse",
    type: "rich_text",
    required: true,
    placeholder: "Hvordan har brukeren deltatt i utforming? Brukerens ønsker og prioriteringer.",
    helpText: "Lovkrav: Pasient- og brukerrettighetsloven §3-1 — bruker skal medvirke i utforming og gjennomføring.",
  },
  {
    key: "parorende",
    title: "Pårørendes deltakelse",
    type: "rich_text",
    required: false,
    placeholder: "Hvis aktuelt: hvilken rolle spiller pårørende? Samtykke til involvering?",
  },
  {
    key: "aktiviteter",
    title: "Aktivitetslogg",
    type: "activities_log",
    required: false,
    helpText: "Konkrete tiltak og kontaktpunkter i planperioden.",
  },
  {
    key: "samtykker",
    title: "Samtykker",
    type: "checklist",
    required: true,
    items: [
      "Bruker har samtykket til IP",
      "Samtykke til informasjonsdeling mellom tjenester",
      "Pårørendes informasjonsdeling avklart",
      "Brukeren kan trekke samtykker tilbake når som helst",
    ],
  },
  {
    key: "evaluering",
    title: "Evaluering og oppdateringsfrekvens",
    type: "summary",
    required: true,
    placeholder: "Når oppdateres planen? Hvem deltar i evalueringen? Hvordan loggføres endringer?",
  },
];

// ─── Generell (fleksibel, passer alle) ──────────────────────────────────────
const GENERELL_SECTIONS: Section[] = [
  {
    key: "innledning",
    title: "Innledning",
    type: "rich_text",
    required: false,
    placeholder: "Kontekst og oppsummering av perioden.",
  },
  {
    key: "maal",
    title: "Mål og tiltak",
    type: "goals_list",
    required: true,
  },
  {
    key: "aktiviteter",
    title: "Aktivitetslogg",
    type: "activities_log",
    required: true,
  },
  {
    key: "avslutning",
    title: "Oppsummering",
    type: "summary",
    required: false,
  },
];

const TEMPLATES = [
  {
    slug: "barnevern-standard",
    name: "Barnevern — standard",
    description: "Månedsrapport for miljøarbeid i regi av barneverntjenesten. Inkluderer fokus på trygghet, utvikling, samarbeid og risikomomenter.",
    suggestedInstitutionType: "barnevern",
    sections: BARNEVERN_SECTIONS,
  },
  {
    slug: "nav-arbeidsrettet",
    name: "NAV — arbeidsrettet oppfølging",
    description: "Rapport for arbeidsrettede tiltak, praksis og motivasjonsarbeid knyttet til NAV.",
    suggestedInstitutionType: "nav",
    sections: NAV_SECTIONS,
  },
  {
    slug: "kommune-adl",
    name: "Kommune — ADL og bo-oppfølging",
    description: "Oppfølging av daglige ferdigheter, bosituasjon og sosial deltakelse.",
    suggestedInstitutionType: "kommune",
    sections: KOMMUNE_SECTIONS,
  },
  {
    slug: "helsevesen-oppfolging",
    name: "Helsevesen — oppfølging",
    description: "Hjemmebesøk og oppfølging i samarbeid med helsetjenester. Fokus på medisinering og helseobservasjoner.",
    suggestedInstitutionType: "helsevesen",
    sections: HELSE_SECTIONS,
  },
  {
    slug: "generell",
    name: "Generell månedsrapport",
    description: "Fleksibel mal med basisseksjoner. Passer for private oppdragsgivere eller andre kontekster.",
    suggestedInstitutionType: null,
    sections: GENERELL_SECTIONS,
  },
  {
    slug: "barnevern-tiltaksplan-6-3",
    name: "Barnevern — Tiltaksplan (Bvl §6-3)",
    description:
      "Hjemmel: Barnevernsloven §6-3. Plikt til å utarbeide tiltaksplan for barn og unge med tiltak fra barneverntjenesten. " +
      "Dekker eksplisitt formål, innhold, tidsperiode, oppfølging, evaluering, samt barnets og foreldrenes medvirkning (§1-4 og §1-5). " +
      "Skal evalueres minst hvert år.",
    suggestedInstitutionType: "barnevern",
    sections: BARNEVERN_TILTAKSPLAN_SECTIONS,
  },
  {
    slug: "barnevern-evaluering-6-3",
    name: "Barnevern — Evaluering mot tiltaksplan (Bvl §6-3)",
    description:
      "Hjemmel: Barnevernsloven §6-3. Periodisk evaluering av tiltaksplanen. Brukes for å dokumentere fremdrift mot målene, " +
      "barnets og foreldrenes synspunkt, og forslag til justeringer. Underlagsmateriale for neste tiltaksplan-revisjon.",
    suggestedInstitutionType: "barnevern",
    sections: BARNEVERN_EVALUERING_SECTIONS,
  },
  {
    slug: "nav-aktivitetsplan",
    name: "NAV — Aktivitetsplan (NAV-loven §14a)",
    description:
      "Hjemmel: NAV-loven §14a + Folketrygdloven §11-9. Aktivitetsplan for arbeidsrettet bistand. Dokumenterer brukerens og " +
      "NAVs gjensidige forpliktelser, mål mot arbeid/utdanning, og evalueringskriterier.",
    suggestedInstitutionType: "nav",
    sections: NAV_AKTIVITETSPLAN_SECTIONS,
  },
  {
    slug: "kommune-individuell-plan",
    name: "Kommune — Individuell plan (IPL)",
    description:
      "Hjemmel: Pasient- og brukerrettighetsloven §2-5 + Helse- og omsorgstjenesteloven §7-1, jf. forskrift om habilitering, " +
      "rehabilitering og koordinator §4. Brukerens rett til samordnet plan ved langvarige og koordinerte tjenester. " +
      "Inkluderer brukerens hovedmål, koordinator, samtykker, og evalueringsfrekvens.",
    suggestedInstitutionType: "kommune",
    sections: KOMMUNE_IPL_SECTIONS,
  },
];

export async function seedSystemRapportTemplates() {
  for (const tpl of TEMPLATES) {
    try {
      await db
        .insert(rapportTemplates)
        .values({
          vendorId: null,
          slug: tpl.slug,
          name: tpl.name,
          description: tpl.description,
          suggestedInstitutionType: tpl.suggestedInstitutionType,
          sections: tpl.sections,
          isSystem: true,
          isActive: true,
          createdBy: "system",
        })
        .onConflictDoUpdate({
          target: [rapportTemplates.vendorId, rapportTemplates.slug],
          set: {
            name: tpl.name,
            description: tpl.description,
            suggestedInstitutionType: tpl.suggestedInstitutionType,
            sections: tpl.sections,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    } catch (e) {
      // Some drivers don't accept the compound conflict target syntax above.
      // Fall back to raw insert with a try/catch.
      try {
        await db.execute(sql`
          INSERT INTO rapport_templates (vendor_id, slug, name, description, suggested_institution_type, sections, is_system, is_active, created_by)
          VALUES (NULL, ${tpl.slug}, ${tpl.name}, ${tpl.description}, ${tpl.suggestedInstitutionType}, ${JSON.stringify(tpl.sections)}::jsonb, true, true, 'system')
          ON CONFLICT (vendor_id, slug) DO UPDATE
          SET name = EXCLUDED.name,
              description = EXCLUDED.description,
              suggested_institution_type = EXCLUDED.suggested_institution_type,
              sections = EXCLUDED.sections,
              is_active = true,
              updated_at = NOW()
        `);
      } catch (innerErr) {
        console.error(`Failed to seed template ${tpl.slug}:`, innerErr);
      }
    }
  }
  console.log(`✅ Seeded ${TEMPLATES.length} system rapport templates`);
}
