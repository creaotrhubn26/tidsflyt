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

import { createHash, randomUUID } from "crypto";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  archiveCaseLinks,
  archiveConfigs,
  archiveEntries,
  barnevernMeldinger,
  rapportAktiviteter,
  rapportAuditLog,
  rapportMaal,
  rapportTemplates,
  rapporter,
  sakJournal,
  sakJournalAttachments,
  saker,
  secureConversations,
  secureDialogAuditEvents,
  secureMessageAttachments,
  secureMessages,
  vendorTemplates,
  type ArchiveConfig,
  type ArchiveEntry,
} from "@shared/schema";
import { generateRapportPDF } from "../../rapportGenerator";
import { downloadJournalAttachment } from "../journal-attachment-storage";
import { openSecureDialogContent } from "../secure-dialog-content";
import { downloadSecureDialogAttachment } from "../secure-dialog-storage";
import { openSecret } from "../secret-box";
import { createArchiveProvider, type ArchiveProvider } from "./documaster-client";
import {
  buildBarnevernMeldingMappeSpec,
  buildJournalJournalpost,
  buildRapportJournalpost,
  buildSaksmappeSpec,
  buildSecureDialogJournalpost,
  nextAttemptDelayMs,
  type SkjermingDefaults,
} from "./noark";
import { buildSecureDialogArchivePackage } from "./secure-dialog-package";
import { validateArchiveBaseUrl, validateArchiveEndpointUrl } from "./archive-url-policy";

const MAX_ATTEMPTS = 8;

export async function getArchiveConfig(vendorId: number): Promise<ArchiveConfig | null> {
  const [row] = await db
    .select()
    .from(archiveConfigs)
    .where(eq(archiveConfigs.vendorId, vendorId))
    .limit(1);
  return row ?? null;
}

export async function getMunicipalityArchiveConfig(kommuneId: number): Promise<ArchiveConfig | null> {
  const [row] = await db
    .select()
    .from(archiveConfigs)
    .where(eq(archiveConfigs.kommuneId, kommuneId))
    .limit(1);
  return row ?? null;
}

export type ArchiveTenant = { vendorId: number; kommuneId?: never } | { kommuneId: number; vendorId?: never };

export async function getArchiveConfigForTenant(tenant: ArchiveTenant): Promise<ArchiveConfig | null> {
  return tenant.kommuneId != null
    ? getMunicipalityArchiveConfig(tenant.kommuneId)
    : getArchiveConfig(tenant.vendorId);
}

function providerFor(cfg: ArchiveConfig): ArchiveProvider {
  validateArchiveBaseUrl(cfg.baseUrl);
  if (cfg.tokenUrl) validateArchiveEndpointUrl(cfg.tokenUrl);
  return createArchiveProvider(cfg.provider, {
    baseUrl: cfg.baseUrl,
    tokenUrl: cfg.tokenUrl,
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
        status: sql`CASE WHEN ${archiveEntries.status} IN ('archived', 'processing') THEN ${archiveEntries.status} ELSE 'pending' END`,
        triggerKind: trigger,
        attempts: sql`CASE WHEN ${archiveEntries.status} IN ('archived', 'processing') THEN ${archiveEntries.attempts} ELSE 0 END`,
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
        status: sql`CASE WHEN ${archiveEntries.status} IN ('archived', 'processing') THEN ${archiveEntries.status} ELSE 'pending' END`,
        attempts: sql`CASE WHEN ${archiveEntries.status} IN ('archived', 'processing') THEN ${archiveEntries.attempts} ELSE 0 END`,
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
  const [known] = await db.select().from(archiveEntries).where(eq(archiveEntries.id, entryId)).limit(1);
  if (!known) throw new Error(`archive_entry ${entryId} finnes ikke`);
  if (known.status === "archived" || known.status === "processing") return known;

  // Atomisk claim hindrer parallelle appinstanser i å laste opp samme pakke.
  // Provideren har i tillegg eksternId-idempotens ved tvetydig nettverksutfall.
  const processingToken = randomUUID();
  const [entry] = await db
    .update(archiveEntries)
    .set({
      status: "processing",
      processingStartedAt: new Date(),
      processingToken,
      updatedAt: new Date(),
    })
    .where(and(eq(archiveEntries.id, entryId), eq(archiveEntries.status, "pending")))
    .returning();
  if (!entry) {
    const [current] = await db.select().from(archiveEntries).where(eq(archiveEntries.id, entryId)).limit(1);
    if (!current) throw new Error(`archive_entry ${entryId} finnes ikke`);
    return current;
  }

  try {
    const cfg = entry.kommuneId != null
      ? await getMunicipalityArchiveConfig(entry.kommuneId)
      : entry.vendorId != null
        ? await getArchiveConfig(entry.vendorId)
        : null;
    if (!cfg || cfg.status !== "active") throw new Error("Arkivintegrasjon er ikke aktiv");
    const provider = providerFor(cfg);
    const defaults = skjermingDefaults(cfg);

    if (entry.entityType === "rapport") {
      const [rapport] = await db.select().from(rapporter).where(eq(rapporter.id, entry.entityId)).limit(1);
      if (!rapport) throw new Error("Rapporten finnes ikke lenger");
      if (!rapport.sakId) throw new Error("Rapporten er ikke knyttet til en sak");
      const [sak] = await db.select().from(saker).where(eq(saker.id, rapport.sakId)).limit(1);
      if (!sak) throw new Error("Saken finnes ikke lenger");

      let [link] = await db.select().from(archiveCaseLinks).where(eq(archiveCaseLinks.sakId, sak.id)).limit(1);

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
          processingStartedAt: null,
          processingToken: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(archiveEntries.id, entry.id),
          eq(archiveEntries.status, "processing"),
          eq(archiveEntries.processingToken, processingToken),
        ))
        .returning();

      if (!done) return (await db.select().from(archiveEntries).where(eq(archiveEntries.id, entry.id)).limit(1))[0];

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

      let [link] = await db.select().from(archiveCaseLinks).where(eq(archiveCaseLinks.sakId, sak.id)).limit(1);

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
          processingStartedAt: null,
          processingToken: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(archiveEntries.id, entry.id),
          eq(archiveEntries.status, "processing"),
          eq(archiveEntries.processingToken, processingToken),
        ))
        .returning();

      if (!done) return (await db.select().from(archiveEntries).where(eq(archiveEntries.id, entry.id)).limit(1))[0];

      console.log(`📁 Arkiverte journalnotat ${journalEntry.id} → journalpost ${jp.id}`);
      return done;
    }

    if (entry.entityType === "secure_dialog") {
      if (entry.kommuneId == null || !entry.barnevernMeldingId) {
        throw new Error("Sikker dialog mangler kommune- eller meldingsbinding");
      }
      const [conversation] = await db
        .select()
        .from(secureConversations)
        .where(and(
          eq(secureConversations.id, entry.entityId),
          eq(secureConversations.kommuneId, entry.kommuneId),
          eq(secureConversations.barnevernMeldingId, entry.barnevernMeldingId),
        ))
        .limit(1);
      if (!conversation || conversation.status !== "closed" || !conversation.closedAt || !conversation.subject) {
        throw new Error("Sikker dialog er ikke avsluttet eller finnes ikke lenger");
      }
      const [melding] = await db
        .select()
        .from(barnevernMeldinger)
        .where(and(
          eq(barnevernMeldinger.id, entry.barnevernMeldingId),
          eq(barnevernMeldinger.kommuneId, entry.kommuneId),
        ))
        .limit(1);
      if (!melding) throw new Error("Bekymringsmeldingen finnes ikke lenger");

      let [link] = await db
        .select()
        .from(archiveCaseLinks)
        .where(eq(archiveCaseLinks.barnevernMeldingId, melding.id))
        .limit(1);
      if (!link) {
        const mappe = await provider.ensureSaksmappe(
          buildBarnevernMeldingMappeSpec(melding, defaults, cfg.arkivdelId ?? undefined),
        );
        [link] = await db
          .insert(archiveCaseLinks)
          .values({
            vendorId: null,
            kommuneId: entry.kommuneId,
            sakId: null,
            barnevernMeldingId: melding.id,
            eksternMappeId: mappe.id,
            mappeIdent: mappe.mappeIdent,
          })
          .onConflictDoUpdate({
            target: archiveCaseLinks.barnevernMeldingId,
            set: { eksternMappeId: mappe.id, mappeIdent: mappe.mappeIdent },
          })
          .returning();
      }

      const messageRows = await db
        .select()
        .from(secureMessages)
        .where(and(
          eq(secureMessages.conversationId, conversation.id),
          eq(secureMessages.kommuneId, entry.kommuneId),
          eq(secureMessages.status, "sent"),
        ))
        .orderBy(asc(secureMessages.sentAt), asc(secureMessages.id));
      const attachmentRows = await db
        .select({ attachment: secureMessageAttachments })
        .from(secureMessageAttachments)
        .innerJoin(secureMessages, and(
          eq(secureMessages.id, secureMessageAttachments.messageId),
          eq(secureMessages.kommuneId, secureMessageAttachments.kommuneId),
        ))
        .where(and(
          eq(secureMessages.conversationId, conversation.id),
          eq(secureMessages.status, "sent"),
          eq(secureMessageAttachments.scanStatus, "clean"),
        ))
        .orderBy(asc(secureMessageAttachments.createdAt));
      const auditRows = await db
        .select()
        .from(secureDialogAuditEvents)
        .where(and(
          eq(secureDialogAuditEvents.conversationId, conversation.id),
          eq(secureDialogAuditEvents.kommuneId, entry.kommuneId),
        ))
        .orderBy(asc(secureDialogAuditEvents.createdAt), asc(secureDialogAuditEvents.id));

      const packagedAttachments = await Promise.all(attachmentRows.map(async ({ attachment }) => {
        const content = await downloadSecureDialogAttachment(attachment.storageKey);
        const actualChecksum = createHash("sha256").update(content).digest("hex");
        if (actualChecksum !== attachment.checksumSha256) {
          throw new Error("Vedleggskontrollsum samsvarer ikke før arkivering");
        }
        return {
          id: attachment.id,
          messageId: attachment.messageId,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          checksumSha256: attachment.checksumSha256,
          content,
        };
      }));
      const archivePackage = buildSecureDialogArchivePackage({
        conversationId: conversation.id,
        kommuneId: entry.kommuneId,
        barnevernMeldingId: melding.id,
        meldingsnummer: melding.meldingsnummer,
        subject: openSecureDialogContent(conversation.subject),
        closedAt: conversation.closedAt.toISOString(),
        messages: messageRows.map((message) => ({
          id: message.id,
          senderKind: message.senderKind as "staff" | "party",
          sentAt: message.sentAt!.toISOString(),
          content: openSecureDialogContent(message.bodyEncrypted),
        })),
        attachments: packagedAttachments,
        auditEvents: auditRows.map((event) => ({
          id: event.id,
          action: event.action,
          actorKind: event.actorKind,
          messageId: event.messageId,
          attachmentId: event.attachmentId,
          createdAt: event.createdAt.toISOString(),
        })),
      });
      const spec = buildSecureDialogJournalpost(
        conversation,
        melding,
        archivePackage.files,
        defaults,
        { journalenhet: cfg.journalenhet ?? undefined },
      );
      const jp = await provider.createJournalpost(link.eksternMappeId, spec);

      const done = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(archiveEntries)
          .set({
            status: "archived",
            eksternMappeId: link.eksternMappeId,
            eksternJournalpostId: jp.id,
            journalpostIdent: jp.journalpostIdent,
            payloadHash: archivePackage.payloadHash,
            skjerming: spec.skjerming as any,
            archiveManifest: archivePackage.manifest as any,
            archiveEvidence: {
              provider: cfg.provider,
              externalMappeId: link.eksternMappeId,
              externalJournalpostId: jp.id,
              journalpostIdent: jp.journalpostIdent,
              documentCount: archivePackage.files.length,
            } as any,
            error: null,
            archivedAt: new Date(),
            processingStartedAt: null,
            processingToken: null,
            updatedAt: new Date(),
          })
          .where(and(
            eq(archiveEntries.id, entry.id),
            eq(archiveEntries.status, "processing"),
            eq(archiveEntries.processingToken, processingToken),
          ))
          .returning();
        if (!updated) return null;
        await tx.insert(secureDialogAuditEvents).values({
          kommuneId: entry.kommuneId!,
          actorUserId: null,
          actorKind: "system",
          conversationId: conversation.id,
          action: "archive_completed",
          metadata: { documentCount: archivePackage.files.length },
        });
        return updated;
      });
      if (!done) return (await db.select().from(archiveEntries).where(eq(archiveEntries.id, entry.id)).limit(1))[0];
      console.log(`📁 Arkiverte sikker dialog ${conversation.id} → journalpost ${jp.id}`);
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
        processingStartedAt: null,
        processingToken: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(archiveEntries.id, entry.id),
        eq(archiveEntries.status, "processing"),
        eq(archiveEntries.processingToken, processingToken),
      ))
      .returning();
    if (!failed) {
      return (await db.select().from(archiveEntries).where(eq(archiveEntries.id, entry.id)).limit(1))[0];
    }
    if (terminal && entry.entityType === "secure_dialog" && entry.kommuneId != null) {
      await db.insert(secureDialogAuditEvents).values({
        kommuneId: entry.kommuneId,
        actorUserId: null,
        actorKind: "system",
        conversationId: entry.entityId,
        action: "archive_failed",
        metadata: { attempts },
      }).catch(() => undefined);
    }
    console.error(
      `[arkiv] arkivering av ${entry.entityType} ${entry.entityId} feilet (forsøk ${attempts}${terminal ? ", gir opp" : ""}):`,
      err?.message ?? err,
    );
    return failed;
  }
}

/** Prosesser forfalte pending-rader. Kalles fra cron. */
export async function processDueArchiveEntries(limit = 10): Promise<{ processed: number; archived: number }> {
  await db
    .update(archiveEntries)
    .set({
      status: "pending",
      processingStartedAt: null,
      processingToken: null,
      nextAttemptAt: new Date(),
      error: "stale_claim",
      updatedAt: new Date(),
    })
    .where(and(
      eq(archiveEntries.status, "processing"),
      lte(archiveEntries.processingStartedAt, new Date(Date.now() - 15 * 60 * 1000)),
    ));
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
export async function retryArchiveEntry(entryId: string, tenant: ArchiveTenant): Promise<ArchiveEntry | null> {
  const tenantCondition = tenant.kommuneId != null
    ? eq(archiveEntries.kommuneId, tenant.kommuneId)
    : eq(archiveEntries.vendorId, tenant.vendorId);
  const [entry] = await db
    .update(archiveEntries)
    .set({
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
      processingStartedAt: null,
      processingToken: null,
      error: null,
      triggerKind: "retry",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(archiveEntries.id, entryId),
        tenantCondition,
        inArray(archiveEntries.status, ["pending", "failed"]),
      ),
    )
    .returning();
  if (!entry) return null;
  return processArchiveEntry(entry.id);
}
