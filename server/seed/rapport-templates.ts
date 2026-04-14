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
