/**
 * server/lib/archive/noark.ts
 *
 * Noark 5-domenetyper og payload-byggere for arkivering av Tidum-innhold
 * som journalposter. Provider-uavhengig: Documaster-klienten (og senere
 * andre arkivkjerner / Fiks Arkiv) konsumerer disse strukturene.
 *
 * Personvern er styrende for titler: journalpost- og mappetitler bygges
 * av saksnummer, klientreferanse og periode — aldri navn eller annen
 * direkte identifiserende informasjon. Skjerming settes alltid på
 * innhold som stammer fra klientrettet arbeid ("uansett grad av
 * sensitivitet" — jf. kravene i offentlige anskaffelser på feltet).
 */

// Skjerming/gradering per Noark 5 (M500/M501/M503).
export interface Skjerming {
  /** Hjemmel, f.eks. "Offl. § 13 jf. fvl. § 13" eller "Offl. § 13 jf. bvl. § 13-1" */
  skjermingshjemmel: string;
  /** Kode for tilgangsrestriksjon, f.eks. "UO" (unntatt offentlighet) */
  tilgangsrestriksjon: string;
  /** Hvilke metadata som skjermes i offentlig journal */
  skjermingMetadata?: string[];
}

export type Journalposttype =
  | "I"  // Inngående dokument
  | "U"  // Utgående dokument
  | "X"  // Organinternt dokument uten oppfølging
  | "N"; // Organinternt dokument for oppfølging

export interface SaksmappeSpec {
  tittel: string;
  offentligTittel?: string;
  /** Ekstern nøkkel for idempotens — Tidums sak-id */
  eksternId: string;
  skjerming?: Skjerming;
  arkivdelId?: string;
}

export interface ArchiveDocumentFile {
  filename: string;
  mimeType: string;
  content: Buffer;
  /** Noark 5 variantformat — PDF regnes som arkivformat her */
  variantformat: "Arkivformat" | "Produksjonsformat";
}

export interface JournalpostSpec {
  tittel: string;
  offentligTittel?: string;
  journalposttype: Journalposttype;
  /** Ekstern nøkkel for idempotens — f.eks. "rapport:<uuid>" */
  eksternId: string;
  dokumentdato?: string; // ISO date
  skjerming?: Skjerming;
  journalenhet?: string;
  files: ArchiveDocumentFile[];
}

// ── Byggere ──────────────────────────────────────────────────────────────────

export interface RapportLike {
  id: string;
  klientRef?: string | null;
  periodeFrom?: string | Date | null;
  periodeTo?: string | Date | null;
  godkjent?: Date | null;
}

export interface SakLike {
  id: string;
  saksnummer: string;
  tittel?: string | null;
  klientRef?: string | null;
}

export interface BarnevernMeldingLike {
  id: string;
  meldingsnummer: string;
}

export interface SecureDialogLike {
  id: string;
  closedAt?: string | Date | null;
}

export interface SkjermingDefaults {
  skjermingshjemmel: string;
  tilgangsrestriksjon: string;
}

/** "januar 2026" fra en dato, eller null. */
export function formatPeriode(from?: string | Date | null): string | null {
  if (!from) return null;
  const d = typeof from === "string" ? new Date(from) : from;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
}

export function buildDefaultSkjerming(defaults: SkjermingDefaults): Skjerming {
  return {
    skjermingshjemmel: defaults.skjermingshjemmel,
    tilgangsrestriksjon: defaults.tilgangsrestriksjon,
    // Tittel og parter skjermes i offentlig journal; selve eksistensen
    // av journalposten er offentlig.
    skjermingMetadata: ["tittel", "korrespondansepart"],
  };
}

/**
 * Saksmappe for en Tidum-sak. Tittel bruker saksnummer + klientreferanse
 * (pseudonym), aldri navn. Offentlig tittel er ytterligere generalisert.
 */
export function buildSaksmappeSpec(sak: SakLike, defaults: SkjermingDefaults, arkivdelId?: string): SaksmappeSpec {
  const klient = sak.klientRef ? ` — ${sak.klientRef}` : "";
  return {
    tittel: `Tiltakssak ${sak.saksnummer}${klient}`,
    offentligTittel: `Tiltakssak ${sak.saksnummer}`,
    eksternId: `tidum:sak:${sak.id}`,
    skjerming: buildDefaultSkjerming(defaults),
    arkivdelId,
  };
}

export function buildBarnevernMeldingMappeSpec(
  melding: BarnevernMeldingLike,
  defaults: SkjermingDefaults,
  arkivdelId?: string,
): SaksmappeSpec {
  return {
    tittel: `Barnevernssak ${melding.meldingsnummer}`,
    offentligTittel: "Barnevernssak",
    eksternId: `tidum:barnevern-melding:${melding.id}`,
    skjerming: buildDefaultSkjerming(defaults),
    arkivdelId,
  };
}

export function buildSecureDialogJournalpost(
  conversation: SecureDialogLike,
  melding: BarnevernMeldingLike,
  files: ArchiveDocumentFile[],
  defaults: SkjermingDefaults,
  opts: { journalenhet?: string } = {},
): JournalpostSpec {
  const dokumentdato = conversation.closedAt
    ? new Date(conversation.closedAt).toISOString().slice(0, 10)
    : undefined;
  return {
    tittel: `Sikker dialog — melding ${melding.meldingsnummer}`,
    offentligTittel: "Sikker dialog",
    journalposttype: "X",
    eksternId: `tidum:secure-dialog:${conversation.id}`,
    dokumentdato,
    skjerming: buildDefaultSkjerming(defaults),
    journalenhet: opts.journalenhet,
    files,
  };
}

/**
 * Journalpost for en godkjent rapport. Registreres som organinternt
 * dokument (X); blir rapporten i tillegg ekspedert til oppdragsgiver er
 * "U" riktig — velges av kalleren via `journalposttype`.
 */
export function buildRapportJournalpost(
  rapport: RapportLike,
  sak: SakLike | null,
  pdf: Buffer,
  defaults: SkjermingDefaults,
  opts: { journalposttype?: Journalposttype; journalenhet?: string } = {},
): JournalpostSpec {
  const periode = formatPeriode(rapport.periodeFrom);
  const klient = rapport.klientRef || sak?.klientRef || null;
  const parts = [
    "Rapport",
    periode ? `for ${periode}` : null,
    sak ? `— sak ${sak.saksnummer}` : null,
    klient ? `(${klient})` : null,
  ].filter(Boolean);

  const dokumentdato = rapport.godkjent
    ? new Date(rapport.godkjent).toISOString().slice(0, 10)
    : undefined;

  return {
    tittel: parts.join(" "),
    offentligTittel: periode ? `Rapport for ${periode}` : "Rapport",
    journalposttype: opts.journalposttype ?? "X",
    eksternId: `tidum:rapport:${rapport.id}`,
    dokumentdato,
    skjerming: buildDefaultSkjerming(defaults),
    journalenhet: opts.journalenhet,
    files: [
      {
        filename: `rapport-${sak?.saksnummer ?? rapport.id}-${periode ?? "ukjent-periode"}.pdf`
          .replace(/[^a-zA-Z0-9åæøÅÆØ._-]+/g, "_"),
        mimeType: "application/pdf",
        content: pdf,
        variantformat: "Arkivformat",
      },
    ],
  };
}

export interface JournalEntryLike {
  id: string;
  content: string;
  createdAt?: string | Date | null;
}

export interface JournalAttachmentLike {
  originalName: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Journalpost for én sak-journal-oppføring. Alltid organinternt (X) — en
 * journaloppføring har ingen godkjennings-/ekspederingsflyt slik rapporter
 * har. Selve journalteksten er ALLTID første fil (Produksjonsformat, ikke
 * Arkivformat — ren tekst uten PDF/A-konvertering i denne runden); eventuelle
 * vedlegg følger etter i sin opprinnelige mimeType.
 */
export function buildJournalJournalpost(
  entry: JournalEntryLike,
  sak: SakLike | null,
  attachments: JournalAttachmentLike[],
  defaults: SkjermingDefaults,
  opts: { journalenhet?: string } = {},
): JournalpostSpec {
  const klient = sak?.klientRef || null;
  const parts = [
    "Journalnotat",
    sak ? `— sak ${sak.saksnummer}` : null,
    klient ? `(${klient})` : null,
  ].filter(Boolean);

  const dokumentdato = entry.createdAt
    ? new Date(entry.createdAt).toISOString().slice(0, 10)
    : undefined;

  const textFile: ArchiveDocumentFile = {
    filename: `journal-${sak?.saksnummer ?? entry.id}.txt`.replace(/[^a-zA-Z0-9åæøÅÆØ._-]+/g, "_"),
    mimeType: "text/plain",
    content: Buffer.from(entry.content, "utf-8"),
    variantformat: "Produksjonsformat",
  };

  const attachmentFiles: ArchiveDocumentFile[] = attachments.map((a) => ({
    filename: a.originalName.replace(/[^a-zA-Z0-9åæøÅÆØ._-]+/g, "_"),
    mimeType: a.mimeType,
    content: a.content,
    variantformat: a.mimeType === "application/pdf" ? "Arkivformat" : "Produksjonsformat",
  }));

  return {
    tittel: parts.join(" "),
    offentligTittel: "Journalnotat",
    journalposttype: "X",
    eksternId: `tidum:journal:${entry.id}`,
    dokumentdato,
    skjerming: buildDefaultSkjerming(defaults),
    journalenhet: opts.journalenhet,
    files: [textFile, ...attachmentFiles],
  };
}

/** Eksponentiell backoff for arkiv-outboxen: 5 min · 2^attempts, tak 24 t. */
export function nextAttemptDelayMs(attempts: number): number {
  const base = 5 * 60 * 1000;
  const capped = Math.min(attempts, 10);
  return Math.min(base * 2 ** capped, 24 * 60 * 60 * 1000);
}
