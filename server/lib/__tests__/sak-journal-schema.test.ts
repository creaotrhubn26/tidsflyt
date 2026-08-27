import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { insertSakJournalSchema, sakJournal } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

describe("sakJournal schema", () => {
  const cleanupIds: string[] = [];
  const cleanupSakIds: string[] = [];
  afterEach(async () => {
    for (const id of cleanupIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_sak_journal WHERE id = $1`, [id]);
    }
    for (const id of cleanupSakIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_saker WHERE id = $1`, [id]);
    }
  });

  async function insertTestSak(): Promise<{ id: string; vendorId: number; tiltakslederId: string }> {
    const vendorId = 1;
    const tiltakslederId = "journal-schema-leader";
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_saker (saksnummer, tittel, vendor_id, tiltaksleder_id)
       VALUES ($1, 'Test-sak for journal', $2, $3) RETURNING id`,
      [`TEST-JOURNAL-${Date.now()}`, vendorId, tiltakslederId],
    );
    cleanupSakIds.push(row.id);
    return { id: row.id, vendorId, tiltakslederId };
  }

  it("insertSakJournalSchema validerer og default-verdier settes korrekt ved faktisk insert", async () => {
    const sak = await insertTestSak();
    const data = insertSakJournalSchema.parse({
      sakId: sak.id,
      userId: sak.tiltakslederId,
      content: "Første journalnotat.",
    });

    const [row] = await db.insert(sakJournal).values(data).returning();
    cleanupIds.push(row.id);

    expect(row.sakId).toBe(sak.id);
    expect(row.userId).toBe(sak.tiltakslederId);
    expect(row.content).toBe("Første journalnotat.");
    expect(row.correctsEntryId).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("en korreksjons-rad kan peke på originalen uten å endre den", async () => {
    const sak = await insertTestSak();
    const [original] = await db.insert(sakJournal).values(
      insertSakJournalSchema.parse({ sakId: sak.id, userId: sak.tiltakslederId, content: "Feilskrevet." }),
    ).returning();
    cleanupIds.push(original.id);

    const [correction] = await db.insert(sakJournal).values(
      insertSakJournalSchema.parse({
        sakId: sak.id,
        userId: sak.tiltakslederId,
        content: "Korrigert versjon.",
        correctsEntryId: original.id,
      }),
    ).returning();
    cleanupIds.push(correction.id);

    const [reloadedOriginal] = await db.select().from(sakJournal).where(eq(sakJournal.id, original.id));
    expect(reloadedOriginal.content).toBe("Feilskrevet.");
    expect(correction.correctsEntryId).toBe(original.id);
  });

  it("content over 10000 tegn avvises av valideringsskjemaet", () => {
    expect(() =>
      insertSakJournalSchema.parse({ sakId: "x", userId: "journal-schema-leader", content: "a".repeat(10001) }),
    ).toThrow();
  });
});
