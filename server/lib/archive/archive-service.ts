/**
 * server/lib/archive/archive-service.ts
 *
 * Orkestrering av Noark 5-arkivering: outbox-mønster der godkjente
 * rapporter legges i archive_entries og prosesseres asynkront mot
 * vendorens arkivkjerne (Documaster). Feil gir eksponentiell backoff;
 * etter MAX_ATTEMPTS settes raden til 'failed' og krever manuell retry.
 *
 * Idempotens i tre lag:
 *   1. archive_entries har UNIQUE(entity_type, entity_id) — én rad per rapport.
 *   2. archive_case_links husker saksmappen per sak.
 *   3. Provideren slår opp eksternId før opprettelse (trygt ved replay).
 */

import { createHash } from "crypto";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  archiveCaseLinks,
  archiveConfigs,
  archiveEntries,
  rapportAktiviteter,
  rapportAuditLog,
  rapportMaal,
  rapportTemplates,
  rapporter,
  sakJournal,
  sakJournalAttachments,
  saker,
  vendorTemplates,
  type ArchiveConfig,
  type ArchiveEntry,
} from "@shared/schema";
import { generateRapportPDF } from "../../rapportGenerator";
import { downloadJournalAttachment } from "../journal-attachment-storage";
import { openSecret } from "../secret-box";
import { createArchiveProvider, type ArchiveProvider } from "./documaster-client";
import {
  buildJournalJournalpost,
  buildRapportJournalpost,
  buildSaksmappeSpec,
  nextAttemptDelayMs,
  type SkjermingDefaults,
} from "./noark";

const MAX_ATTEMPTS = 8;

export async function getArchiveConfig(vendorId: number): Promise<ArchiveConfig | null> {
  const [row] = await db
    .select()
    .from(archiveConfigs)
    .where(eq(archiveConfigs.vendorId, vendorId))
    .limit(1);
  return row ?? null;
}

function providerFor(cfg: ArchiveConfig): ArchiveProvider {
  return createArchiveProvider(cfg.provider, {
    baseUrl: cfg.baseUrl,
    clientId: cfg.clientId,
    clientSecret: openSecret(cfg.clientSecret),
    arkivdelId: cfg.arkivdelId,
    journalenhet: cfg.journalenhet,
    klasseId: cfg.klasseId,
  });
}

function skjermingDefaults(cfg: ArchiveConfig): SkjermingDefaults {
  return {
    skjermingshjemmel: cfg.skjermingshjemmel ?? "Offl. § 13 jf. fvl. § 13",
    tilgangsrestriksjon: cfg.tilgangsrestriksjon ?? "UO",
  };
}

/**
 * Legg en godkjent rapport i arkiv-outboxen. Kalles fra godkjennings-
 * flyten (trigger 'approved', respekterer auto_archive) og fra manuell
 * arkivering (trigger 'manual', ignorerer auto_archive). Best-effort å
 * prosessere umiddelbart; cronen tar resten.
 */
export async function queueRapportArchiving(
  rapportId: string,
  trigger: "approved" | "manual",
  createdBy?: string,
): Promise<{ queued: boolean; reason?: string; entryId?: string }> {
  const [rapport] = await db.select().from(rapporter).where(eq(rapporter.id, rapportId)).limit(1);
  if (!rapport) return { queued: false, reason: "Rapport ikke funnet" };
  if (!rapport.sakId) return { queued: false, reason: "Rapporten er ikke knyttet til en sak" };

  const [sak] = await db.select().from(saker).where(eq(saker.id, rapport.sakId)).limit(1);
  if (!sak) return { queued: false, reason: "Sak ikke funnet" };

  const cfg = await getArchiveConfig(sak.vendorId);
  if (!cfg || cfg.status !== "active") return { queued: false, reason: "Arkivintegrasjon ikke konfigurert" };
  if (trigger === "approved" && !cfg.autoArchive) return { queued: false, reason: "Automatisk arkivering er avslått" };

  const [entry] = await db
    .insert(archiveEntries)
    .values({
      vendorId: sak.vendorId,
      entityType: "rapport",
      entityId: rapportId,
      sakId: sak.id,
      status: "pending",
      triggerKind: trigger,
      nextAttemptAt: new Date(),
      createdBy: createdBy ?? null,
    })
    .onConflictDoUpdate({
      target: [archiveEntries.entityType, archiveEntries.entityId],
      set: {
        // Allerede arkivert forblir arkivert; alt annet re-aktiveres.
        status: sql`CASE WHEN ${archiveEntries.status} = 'archived' THEN 'archived' ELSE 'pending' END`,
        triggerKind: trigger,
        attempts: sql`CASE WHEN ${archiveEntries.status} = 'archived' THEN ${archiveEntries.attempts} ELSE 0 END`,
        nextAttemptAt: new Date(),
        error: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (entry.status === "archived") return { queued: false, reason: "Allerede arkivert", entryId: entry.id };

  // Umiddelbart forsøk uten å blokkere kalleren.
  processArchiveEntry(entry.id).catch((err) =>
    console.error(`[arkiv] umiddelbar prosessering feilet for ${entry.id}:`, err?.message ?? err),
  );

  return { queued: true, entryId: entry.id };
}

/**
 * Legg en journaloppføring i arkiv-outboxen. Kalles umiddelbart ved
 * opprettelse (ingen godkjenningsflyt å vente på, i motsetning til
 * rapporter) — best-effort, samme outbox/backoff-mekanikk.
 */
export async function queueJournalEntryArchiving(
  journalEntryId: string,
): Promise<{ queued: boolean; reason?: string; entryId?: string }> {
  const [entry] = await db.select().from(sakJournal).where(eq(sakJournal.id, journalEntryId)).limit(1);
  if (!entry) return { queued: false, reason: "Journaloppføring ikke funnet" };

  const [sak] = await db.select().from(saker).where(eq(saker.id, entry.sakId)).limit(1);
  if (!sak) return { queued: false, reason: "Sak ikke funnet" };

  const cfg = await getArchiveConfig(sak.vendorId);
  if (!cfg || cfg.status !== "active") return { queued: false, reason: "Arkivintegrasjon ikke konfigurert" };

  const [archiveEntry] = await db
    .insert(archiveEntries)
    .values({
      vendorId: sak.vendorId,
      entityType: "journal",
      entityId: journalEntryId,
      sakId: sak.id,
      status: "pending",
      triggerKind: "manual",
      nextAttemptAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [archiveEntries.entityType, archiveEntries.entityId],
      set: {
        status: sql`CASE WHEN ${archiveEntries.status} = 'archived' THEN 'archived' ELSE 'pending' END`,
        attempts: sql`CASE WHEN ${archiveEntries.status} = 'archived' THEN ${archiveEntries.attempts} ELSE 0 END`,
        nextAttemptAt: new Date(),
        error: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (archiveEntry.status === "archived") return { queued: false, reason: "Allerede arkivert", entryId: archiveEntry.id };

  processArchiveEntry(archiveEntry.id).catch((err) =>
    console.error(`[arkiv] umiddelbar prosessering feilet for ${archiveEntry.id}:`, err?.message ?? err),
  );

  return { queued: true, entryId: archiveEntry.id };
}

/** Prosesser én outbox-rad. Trygg å kalle flere ganger. */
export async function processArchiveEntry(entryId: string): Promise<ArchiveEntry> {
  const [entry] = await db.select().from(archiveEntries).where(eq(archiveEntries.id, entryId)).limit(1);
  if (!entry) throw new Error(`archive_entry ${entryId} finnes ikke`);
  if (entry.status === "archived") return entry;

  try {
    const cfg = await getArchiveConfig(entry.vendorId);
    if (!cfg || cfg.status !== "active") throw new Error("Arkivintegrasjon er ikke aktiv");
    const provider = providerFor(cfg);
    const defaults = skjermingDefaults(cfg);

    let [link] = await db.select().from(archiveCaseLinks).where(eq(archiveCaseLinks.sakId, entry.sakId!)).limit(1);

    if (entry.entityType === "rapport") {
      const [rapport] = await db.select().from(rapporter).where(eq(rapporter.id, entry.entityId)).limit(1);
      if (!rapport) throw new Error("Rapporten finnes ikke lenger");
      if (!rapport.sakId) throw new Error("Rapporten er ikke knyttet til en sak");
      const [sak] = await db.select().from(saker).where(eq(saker.id, rapport.sakId)).limit(1);
      if (!sak) throw new Error("Saken finnes ikke lenger");

      if (!link) {
        const mappe = await provider.ensureSaksmappe(buildSaksmappeSpec(sak, defaults, cfg.arkivdelId ?? undefined));
        [link] = await db
          .insert(archiveCaseLinks)
          .values({ vendorId: sak.vendorId, sakId: sak.id, eksternMappeId: mappe.id, mappeIdent: mappe.mappeIdent })
          .onConflictDoUpdate({
            target: archiveCaseLinks.sakId,
            set: { eksternMappeId: mappe.id, mappeIdent: mappe.mappeIdent },
          })
          .returning();
      }

      const [aktiviteter, maal] = await Promise.all([
        db.select().from(rapportAktiviteter).where(eq(rapportAktiviteter.rapportId, rapport.id)).orderBy(rapportAktiviteter.dato),
        db.select().from(rapportMaal).where(eq(rapportMaal.rapportId, rapport.id)).orderBy(rapportMaal.nummer),
      ]);
      const template = rapport.templateId
        ? (await db.select().from(vendorTemplates).where(eq(vendorTemplates.id, rapport.templateId)).limit(1))[0]
        : undefined;
      const rapportTemplate = rapport.rapportTemplateId
        ? (await db.select().from(rapportTemplates).where(eq(rapportTemplates.id, rapport.rapportTemplateId)).limit(1))[0]
        : null;
      const pdf = await generateRapportPDF(template, { rapport, aktiviteter, maal, rapportTemplate: rapportTemplate as any });

      const spec = buildRapportJournalpost(rapport, sak, pdf, defaults, { journalenhet: cfg.journalenhet ?? undefined });
      const jp = await provider.createJournalpost(link.eksternMappeId, spec);

      const [done] = await db
        .update(archiveEntries)
        .set({
          status: "archived",
          eksternMappeId: link.eksternMappeId,
          eksternJournalpostId: jp.id,
          journalpostIdent: jp.journalpostIdent,
          payloadHash: createHash("sha256").update(pdf).digest("hex"),
          skjerming: spec.skjerming as any,
          error: null,
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(archiveEntries.id, entry.id))
        .returning();

      await db
        .insert(rapportAuditLog)
        .values({
          rapportId: rapport.id,
          userId: null,
          userName: "Tidum (system)",
          userRole: "system",
          eventType: "archived",
          eventLabel: `Arkivert som journalpost${jp.journalpostIdent ? ` ${jp.journalpostIdent}` : ""}`,
          details: { provider: cfg.provider, eksternJournalpostId: jp.id, eksternMappeId: link.eksternMappeId, skjerming: spec.skjerming },
        })
        .catch((e: unknown) => console.error("[arkiv] audit-logg feilet:", e));

      console.log(`📁 Arkiverte rapport ${rapport.id} → journalpost ${jp.id}`);
      return done;
    }

    if (entry.entityType === "journal") {
      const [journalEntry] = await db.select().from(sakJournal).where(eq(sakJournal.id, entry.entityId)).limit(1);
      if (!journalEntry) throw new Error("Journaloppføringen finnes ikke lenger");
      const [sak] = await db.select().from(saker).where(eq(saker.id, journalEntry.sakId)).limit(1);
      if (!sak) throw new Error("Saken finnes ikke lenger");

      if (!link) {
        const mappe = await provider.ensureSaksmappe(buildSaksmappeSpec(sak, defaults, cfg.arkivdelId ?? undefined));
        [link] = await db
          .insert(archiveCaseLinks)
          .values({ vendorId: sak.vendorId, sakId: sak.id, eksternMappeId: mappe.id, mappeIdent: mappe.mappeIdent })
          .onConflictDoUpdate({
            target: archiveCaseLinks.sakId,
            set: { eksternMappeId: mappe.id, mappeIdent: mappe.mappeIdent },
          })
          .returning();
      }

      const attachmentRows = await db
        .select()
        .from(sakJournalAttachments)
        .where(eq(sakJournalAttachments.journalEntryId, journalEntry.id));
      const attachments = await Promise.all(
        attachmentRows.map(async (a) => ({
          originalName: a.originalName,
          mimeType: a.mimeType,
          content: await downloadJournalAttachment(a.filename),
        })),
      );

      const spec = buildJournalJournalpost(journalEntry, sak, attachments, defaults, { journalenhet: cfg.journalenhet ?? undefined });
      const jp = await provider.createJournalpost(link.eksternMappeId, spec);

      const [done] = await db
        .update(archiveEntries)
        .set({
          status: "archived",
          eksternMappeId: link.eksternMappeId,
          eksternJournalpostId: jp.id,
          journalpostIdent: jp.journalpostIdent,
          payloadHash: createHash("sha256").update(journalEntry.content).digest("hex"),
          skjerming: spec.skjerming as any,
          error: null,
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(archiveEntries.id, entry.id))
        .returning();

      console.log(`📁 Arkiverte journalnotat ${journalEntry.id} → journalpost ${jp.id}`);
      return done;
    }

    throw new Error(`Ustøttet entity_type: ${entry.entityType}`);
  } catch (err: any) {
    const attempts = entry.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    const [failed] = await db
      .update(archiveEntries)
      .set({
        status: terminal ? "failed" : "pending",
        attempts,
        nextAttemptAt: new Date(Date.now() + nextAttemptDelayMs(attempts)),
        error: String(err?.message ?? err).slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(archiveEntries.id, entry.id))
      .returning();
    console.error(
      `[arkiv] arkivering av ${entry.entityType} ${entry.entityId} feilet (forsøk ${attempts}${terminal ? ", gir opp" : ""}):`,
      err?.message ?? err,
    );
    return failed;
  }
}

/** Prosesser forfalte pending-rader. Kalles fra cron. */
export async function processDueArchiveEntries(limit = 10): Promise<{ processed: number; archived: number }> {
  const due = await db
    .select()
    .from(archiveEntries)
    .where(and(eq(archiveEntries.status, "pending"), lte(archiveEntries.nextAttemptAt, new Date())))
    .orderBy(asc(archiveEntries.nextAttemptAt))
    .limit(limit);

  let archived = 0;
  for (const entry of due) {
    const result = await processArchiveEntry(entry.id);
    if (result.status === "archived") archived++;
  }
  return { processed: due.length, archived };
}

/** Manuell retry av en failed/pending rad — nullstiller backoff. */
export async function retryArchiveEntry(entryId: string, vendorId: number): Promise<ArchiveEntry | null> {
  const [entry] = await db
    .update(archiveEntries)
    .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), error: null, triggerKind: "retry", updatedAt: new Date() })
    .where(
      and(
        eq(archiveEntries.id, entryId),
        eq(archiveEntries.vendorId, vendorId),
        inArray(archiveEntries.status, ["pending", "failed"]),
      ),
    )
    .returning();
  if (!entry) return null;
  return processArchiveEntry(entry.id);
}
