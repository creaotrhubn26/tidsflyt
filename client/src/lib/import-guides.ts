/**
 * Innhold for de interaktive guidene i import-wizarden. Tekstene må verifiseres
 * mot ekte UI hos hver kilde — Planday-tekstene er basert på research fra
 * help.planday.com (engelsk + antatt norsk lokalisering). Se memory:
 * project_role_hierarchy_and_import.md.
 */

export type ImportSourceKey = 'planday' | 'visma' | 'quinyx' | 'csv';

export interface SourceMeta {
  key: ImportSourceKey;
  label: string;
  description: string;
  iconHint: 'planday' | 'visma' | 'quinyx' | 'csv';
}

export interface GuideStep {
  title: string;
  body: string;
  tip?: string;
  /**
   * Optional illustration. Hot-linked from kildens CDN — kan brytes hvis kilden
   * flytter bildet. Vis aldri som primær informasjon; teksten er sannheten.
   */
  imageUrl?: string;
  imageAlt?: string;
}

export interface SourceGuide {
  meta: SourceMeta;
  intro: string;
  steps: GuideStep[];
  helpUrl?: string;
  outro: string;
}

export const IMPORT_SOURCES: SourceMeta[] = [
  {
    key: 'planday',
    label: 'Planday',
    description: 'Eksporter ansatte fra Planday som Excel eller CSV',
    iconHint: 'planday',
  },
  {
    key: 'visma',
    label: 'Visma',
    description: 'Eksporter fra Visma Lønn / HR (kommer snart med eget oppsett)',
    iconHint: 'visma',
  },
  {
    key: 'quinyx',
    label: 'Quinyx',
    description: 'Eksporter ansatte fra Quinyx (kommer snart med eget oppsett)',
    iconHint: 'quinyx',
  },
  {
    key: 'csv',
    label: 'Excel / CSV (annet system)',
    description: 'Last opp en egen fil — vi mapper kolonner automatisk',
    iconHint: 'csv',
  },
];

export const PLANDAY_GUIDE: SourceGuide = {
  meta: IMPORT_SOURCES[0],
  intro:
    'Du må være Administrator eller HR Manager i Planday for å kjøre eksporten. Hvis du ikke ser "Tools"-menyen under Employees, mangler du tilgang.',
  steps: [
    {
      title: 'Åpne Planday og gå til Personer',
      body: 'I Planday-menyen øverst velger du Personer (Engelsk: People).',
    },
    {
      title: 'Klikk på Ansatte',
      body: 'I undermenyen velger du Ansatte (Employees) for å se alle medarbeidere.',
    },
    {
      title: 'Åpne Verktøy → Eksporter data',
      body: 'Klikk Verktøy (Tools) øverst til høyre. Velg Eksporter data (Export data) fra dropdown-menyen.',
      imageUrl: 'https://downloads.intercomcdn.eu/i/o/2452538/ac90fdaa91c2e67f6eff6e74/0abf7035-d05c-4aa4-8bbd-ea6d0ecf94e3',
      imageAlt: 'Planday-meny: People → Employees → Tools → Export data',
    },
    {
      title: 'Velg malen "Employee details"',
      body: 'I høyre kolonne under "Integration templates" — klikk Employee details. Dette gir oss alle feltene Tidum trenger.',
      imageUrl: 'https://downloads.intercomcdn.eu/i/o/2452539/f24061ad82d108b170f45013/395584c5-536e-4e12-8752-1b7ce5ca63f1',
      imageAlt: 'Eksport-side med Integration templates og Employee details i høyre kolonne',
    },
    {
      title: 'Hak av "Include deactivated employees"',
      body: 'VIKTIG: hak av denne avkrysningsboksen, ellers utelates ansatte som har vært midlertidig deaktivert i Planday.',
      tip: 'Uten denne haken risikerer dere at ansatte som var aktive forrige måned mangler i Tidum.',
      imageUrl: 'https://downloads.intercomcdn.eu/i/o/20722838/52c5705ec2136ab84d57760d/export+empl+data_001.jpeg',
      imageAlt: 'Konfigurasjons-skjerm med filter-opsjoner inkludert Include deactivated employees',
    },
    {
      title: 'Velg filformat',
      body: 'Velg Excel-format. CSV fungerer også, men Excel håndterer norske tegn (æøå) mer pålitelig — bruk det med mindre du har grunn til noe annet.',
    },
    {
      title: 'Klikk "Create report" og last ned filen',
      body: 'Trykk Create report. Filen lastes ned til datamaskinen din. Naviger tilbake til denne siden og last den opp i neste steg.',
    },
  ],
  helpUrl: 'https://help.planday.com/en/articles/30356-how-to-export-employee-data-from-planday',
  outro:
    'Når filen er lastet ned, klikker du Neste for å laste den opp her. Du kan alltids gå tilbake hvis noe gikk galt.',
};

export const CSV_GUIDE: SourceGuide = {
  meta: IMPORT_SOURCES[3],
  intro:
    'Tidum forsøker å gjenkjenne kolonnene automatisk. Filen bør inneholde minst e-post, fornavn og etternavn — ellers er det ikke mulig å opprette brukere.',
  steps: [
    {
      title: 'Åpne kildesystemet',
      body: 'Gå til kildesystemet og finn eksport-funksjonen for ansatt-data.',
    },
    {
      title: 'Eksporter til Excel eller CSV',
      body: 'Excel anbefales fordi norske tegn håndteres mer robust. CSV må være UTF-8 eller Windows-1252 — Tidum oppdager begge automatisk.',
    },
    {
      title: 'Inkluder minst disse feltene',
      body: 'Hver rad må ha e-post, fornavn og etternavn. Mobilnummer, avdeling og stilling er valgfritt men anbefalt.',
      tip: 'Tidum trenger IKKE personnummer, bankkonto eller adresse — utelat disse hvis filen har dem.',
    },
    {
      title: 'Last opp filen i neste steg',
      body: 'Tidum viser deg en preview før noe lagres. Du kan justere rolle per ansatt og overstyre eventuelle feil før du bekrefter.',
    },
  ],
  outro:
    'Hvis kolonnegjenkjenningen feiler, kan du laste ned malen vår og fylle inn manuelt — det går raskt for små lister.',
};

export const VISMA_GUIDE: SourceGuide = {
  ...CSV_GUIDE,
  meta: IMPORT_SOURCES[1],
  intro:
    'Visma-eksport er ikke ferdig konfigurert ennå — vi bruker generisk CSV-mapping inntil Visma-spesifikt oppsett er på plass. Bruk samme kolonner som Planday, så fungerer det stort sett.',
};

export const QUINYX_GUIDE: SourceGuide = {
  ...CSV_GUIDE,
  meta: IMPORT_SOURCES[2],
  intro:
    'Quinyx-eksport er ikke ferdig konfigurert ennå — vi bruker generisk CSV-mapping. Eksporter ansatte med standard-kolonnene fra Quinyx, så går det stort sett bra.',
};

export function guideForSource(source: ImportSourceKey): SourceGuide {
  switch (source) {
    case 'planday': return PLANDAY_GUIDE;
    case 'visma':   return VISMA_GUIDE;
    case 'quinyx':  return QUINYX_GUIDE;
    case 'csv':
    default:        return CSV_GUIDE;
  }
}
