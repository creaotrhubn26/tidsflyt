/**
 * Section templates for common case report scenarios.
 * Each template provides pre-written content for a specific report type and section.
 */

export interface SectionTemplate {
  id: string;
  label: string;
  /** Short description shown in the dropdown */
  description: string;
  /** The template content (HTML) keyed by form field name */
  content: Record<string, string>;
}

export const REPORT_TEMPLATES: SectionTemplate[] = [
  {
    id: "standard_monthly",
    label: "Standard månedlig rapport",
    description: "Vanlig oppfølgingsrapport for løpende saker",
    content: {
      background:
        "<p>Brukeren mottar [type tiltak] som ble iverksatt [dato]. Tiltaket har vært aktivt i [antall] måneder.</p>",
      actions:
        "<p>I denne perioden har følgende tiltak blitt gjennomført:</p><ul><li>Individuelle samtaler ([antall])</li><li>Samarbeidsmøter med [instans]</li><li>Oppfølging av [aktivitet/mål]</li></ul>",
      progress:
        "<p>Brukeren viser [positiv/stabil/varierende] utvikling på følgende områder:</p><ul><li>[Område 1]: [beskrivelse]</li><li>[Område 2]: [beskrivelse]</li></ul>",
      challenges:
        "<p>Følgende utfordringer er identifisert i perioden:</p><ul><li>[Utfordring 1]</li><li>[Utfordring 2]</li></ul>",
      factors:
        "<p>Faktorer som påvirker situasjonen:</p><ul><li>Beskyttelsesfaktorer: [liste]</li><li>Risikofaktorer: [liste]</li></ul>",
      assessment:
        "<p>Samlet vurdering: Tiltaket fungerer [godt/tilfredsstillende/utilstrekkelig]. Det anbefales [fortsettelse/justering/avslutning] av tiltaket.</p>",
      recommendations:
        "<p>Anbefalinger for videre oppfølging:</p><ul><li>[Anbefaling 1]</li><li>[Anbefaling 2]</li></ul>",
    },
  },
  {
    id: "incident_followup",
    label: "Hendelsesoppfølging",
    description: "Rapport etter en spesifikk hendelse som krever dokumentasjon",
    content: {
      background:
        "<p>Denne rapporten omhandler en hendelse som fant sted [dato]. Hendelsen involverte [kort beskrivelse uten personopplysninger].</p>",
      actions:
        "<p>Følgende tiltak ble iverksatt etter hendelsen:</p><ul><li>Umiddelbare tiltak: [beskrivelse]</li><li>Oppfølgingssamtaler: [beskrivelse]</li><li>Kontakt med [instans]: [beskrivelse]</li></ul>",
      progress:
        "<p>Status etter hendelsen: [beskrivelse av nåsituasjon]</p>",
      challenges:
        "<p>Utfordringer knyttet til hendelsen:</p><ul><li>[Utfordring 1]</li></ul>",
      factors:
        "<p>Faktorer som bidro til hendelsen:</p><ul><li>[Faktor 1]</li></ul><p>Faktorer som kan forebygge gjentakelse:</p><ul><li>[Faktor 1]</li></ul>",
      assessment:
        "<p>Hendelsen vurderes som [alvorlig/moderat/mindre alvorlig]. Brukeren har [god/begrenset] innsikt i hendelsen.</p>",
      recommendations:
        "<p>For å forebygge tilsvarende hendelser anbefales:</p><ul><li>[Anbefaling 1]</li><li>[Anbefaling 2]</li></ul>",
    },
  },
  {
    id: "coordination_meeting",
    label: "Samarbeidsmøte",
    description: "Oppsummering fra ansvarsgruppemøte eller samarbeidsmøte",
    content: {
      background:
        "<p>Samarbeidsmøte ble avholdt [dato]. Personer til stede: [roller, ikke navn — f.eks. kontaktperson, lærer, helsesykepleier].</p>",
      actions:
        "<p>Følgende ble gjennomgått og besluttet i møtet:</p><ul><li>Gjennomgang av [tema]</li><li>Avtalt: [ny avtale/tiltak]</li><li>Ansvar fordelt: [rolle → oppgave]</li></ul>",
      progress:
        "<p>Status som ble presentert i møtet:</p><ul><li>[Område]: [status]</li></ul>",
      challenges:
        "<p>Utfordringer diskutert i møtet:</p><ul><li>[Utfordring 1]</li></ul>",
      factors: "",
      assessment:
        "<p>Møtet vurderes som [produktivt/nyttig]. Det er [enighet/delvis enighet] om videre plan.</p>",
      recommendations:
        "<p>Neste møte: [dato/tidsramme]. Oppfølgingspunkter:</p><ul><li>[Punkt 1]</li><li>[Punkt 2]</li></ul>",
    },
  },
  {
    id: "case_closure",
    label: "Avslutningsrapport",
    description: "Sluttrapport ved avslutning av tiltak eller sak",
    content: {
      background:
        "<p>Tiltaket ble iverksatt [dato] grunnet [bakgrunn]. Tiltaket avsluttes [dato] etter [varighet].</p>",
      actions:
        "<p>Gjennomførte tiltak gjennom hele perioden:</p><ul><li>[Tiltak 1]: [beskrivelse og resultat]</li><li>[Tiltak 2]: [beskrivelse og resultat]</li></ul>",
      progress:
        "<p>Brukerens utvikling gjennom tiltaksperioden:</p><ul><li>Ved oppstart: [beskrivelse]</li><li>Ved avslutning: [beskrivelse]</li></ul>",
      challenges:
        "<p>Gjenstående utfordringer ved avslutning:</p><ul><li>[Utfordring 1]</li></ul>",
      factors:
        "<p>Faktorer som har bidratt til [positiv/negativ] utvikling:</p><ul><li>[Faktor 1]</li></ul>",
      assessment:
        "<p>Samlet vurdering av tiltaksperioden: Målene er [oppnådd/delvis oppnådd/ikke oppnådd]. Brukeren [beskrivelse av nåsituasjon].</p>",
      recommendations:
        "<p>Anbefalinger ved avslutning:</p><ul><li>[Eventuell viderehenvisning]</li><li>[Oppfølgingspunkter]</li></ul>",
    },
  },
];

/** Get template content for a specific section and template */
export function getTemplateContent(templateId: string, sectionKey: string): string {
  const template = REPORT_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return "";
  return template.content[sectionKey] ?? "";
}
