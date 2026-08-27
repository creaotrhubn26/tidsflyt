import { describe, it, expect, afterEach, vi } from "vitest";
import { pool } from "../../db";
import { db } from "../../db";
import { sakJournal, archiveEntries, archiveConfigs } from "@shared/schema";
import { eq } from "drizzle-orm";

vi.mock("../journal-attachment-storage", () => ({
  downloadJournalAttachment: vi.fn().mockResolvedValue(Buffer.from("x")),
}));

describe("queueJournalEntryArchiving", () => {
  const cleanupSakIds: string[] = [];
  const cleanupJournalIds: string[] = [];
  const cleanupArchiveEntryIds: string[] = [];
  const cleanupArchiveConfigVendorIds: number[] = [];

  afterEach(async () => {
    for (const id of cleanupArchiveEntryIds.splice(0)) {
      await pool.query(`DELETE FROM archive_entries WHERE id = $1`, [id]);
    }
    for (const vendorId of cleanupArchiveConfigVendorIds.splice(0)) {
      await pool.query(`DELETE FROM archive_configs WHERE vendor_id = $1`, [vendorId]);
    }
    for (const id of cleanupJournalIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_sak_journal WHERE id = $1`, [id]);
    }
    for (const id of cleanupSakIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_saker WHERE id = $1`, [id]);
    }
  });

  it("legger en journaloppføring i arkiv-outboxen med entityType 'journal' når arkivkonfigurasjon er aktiv", async () => {
    const vendorId = 900001 + Math.floor(Math.random() * 1000);
    cleanupArchiveConfigVendorIds.push(vendorId);
    await db.insert(archiveConfigs).values({
      vendorId,
      provider: "documaster",
      baseUrl: "https://example.invalid",
      clientId: "x",
      clientSecret: "y",
      status: "active",
      autoArchive: true,
    });

    const { rows: [sakRow] } = await pool.query(
      `INSERT INTO tidum_saker (saksnummer, tittel, vendor_id, tiltaksleder_id)
       VALUES ($1, 'Arkiv-test-sak', $2, 'archive-test-leader') RETURNING id`,
      [`TEST-ARCH-${Date.now()}`, vendorId],
    );
    cleanupSakIds.push(sakRow.id);

    const [entry] = await db.insert(sakJournal).values({ sakId: sakRow.id, userId: "archive-test-leader", content: "Arkiveres." }).returning();
    cleanupJournalIds.push(entry.id);

    const { queueJournalEntryArchiving } = await import("../archive/archive-service");
    const result = await queueJournalEntryArchiving(entry.id);
    expect(result.queued).toBe(true);
    expect(result.entryId).toBeDefined();
    cleanupArchiveEntryIds.push(result.entryId!);

    const [row] = await db.select().from(archiveEntries).where(eq(archiveEntries.id, result.entryId!));
    expect(row.entityType).toBe("journal");
    expect(row.entityId).toBe(entry.id);
    expect(row.sakId).toBe(sakRow.id);
  });

  it("returnerer queued:false uten å kaste hvis arkivkonfigurasjon mangler for vendoren", async () => {
    const vendorId = 800001 + Math.floor(Math.random() * 1000); // ingen archive_configs-rad for denne
    const { rows: [sakRow] } = await pool.query(
      `INSERT INTO tidum_saker (saksnummer, tittel, vendor_id, tiltaksleder_id)
       VALUES ($1, 'Uten arkiv-config', $2, 'archive-test-leader') RETURNING id`,
      [`TEST-NOARCH-${Date.now()}`, vendorId],
    );
    cleanupSakIds.push(sakRow.id);

    const [entry] = await db.insert(sakJournal).values({ sakId: sakRow.id, userId: "archive-test-leader", content: "Ikke arkivert." }).returning();
    cleanupJournalIds.push(entry.id);

    const { queueJournalEntryArchiving } = await import("../archive/archive-service");
    const result = await queueJournalEntryArchiving(entry.id);
    expect(result.queued).toBe(false);
    expect(result.reason).toMatch(/ikke konfigurert/i);
  });
});
