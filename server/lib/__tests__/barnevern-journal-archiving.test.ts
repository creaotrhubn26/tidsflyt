import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 4: arkiv-outbox for den kommunale barnevernssakens journal.
describe("queueBarnevernJournalArchiving", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupArchiveEntryIds: string[] = [];
  const cleanupArchiveConfigKommuneIds: number[] = [];

  afterEach(async () => {
    for (const id of cleanupArchiveEntryIds.splice(0)) {
      await pool.query(`DELETE FROM archive_entries WHERE id = $1`, [id]);
    }
    for (const kommuneId of cleanupArchiveConfigKommuneIds.splice(0)) {
      await pool.query(`DELETE FROM archive_case_links WHERE kommune_id = $1`, [kommuneId]);
      await pool.query(`DELETE FROM archive_configs WHERE kommune_id = $1`, [kommuneId]);
    }
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    await withSystemRlsContext("barnevern_arkiv_test_cleanup", async (client) => {
      for (const id of sakIds) {
        await client.query(`DELETE FROM tidum_barnevern_saker WHERE id = $1`, [id]);
      }
      for (const id of meldingIds) {
        await client.query(`DELETE FROM tidum_barnevern_meldinger WHERE id = $1`, [id]);
      }
    });
    for (const id of cleanupUserIds.splice(0)) await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    for (const id of cleanupKommuneIds.splice(0)) await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
  });

  async function setupSakMedJournal() {
    const { rows: [kommune] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9999') RETURNING id`,
      [`Arkivkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(kommune.id);
    const userId = `arkiv-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO users (id, username, password, email, kommune_id, role) VALUES ($1, $2, 'x', $3, $4, 'kommune_saksbehandler')`,
      [userId, userId, `${userId}@example.com`, kommune.id],
    );
    cleanupUserIds.push(userId);

    return withSystemRlsContext("barnevern_arkiv_test_setup", async (client) => {
      const { rows: [melding] } = await client.query(
        `INSERT INTO tidum_barnevern_meldinger
           (kommune_id, meldingsnummer, mottatt_dato, melder_kategori, beskrivelse, avklaringsfrist, status)
         VALUES ($1, $2, NOW(), 'skole', 'Arkivtest.', NOW() + interval '7 days', 'sendt_til_undersokelse')
         RETURNING id`,
        [kommune.id, `BVM-ARKIV-${Date.now()}`],
      );
      cleanupMeldingIds.push(melding.id);
      const { rows: [sak] } = await client.query(
        `INSERT INTO tidum_barnevern_saker (kommune_id, saksnummer, melding_id, barn_navn)
         VALUES ($1, $2, $3, 'Arkivbarn') RETURNING id`,
        [kommune.id, `BVS-ARKIV-${Date.now()}`, melding.id],
      );
      cleanupSakIds.push(sak.id);
      const { rows: [journal] } = await client.query(
        `INSERT INTO tidum_barnevern_sak_journal (sak_id, kommune_id, kategori, innhold, forfatter_user_id)
         VALUES ($1, $2, 'notat', 'Skal arkiveres.', $3) RETURNING id`,
        [sak.id, kommune.id, userId],
      );
      return { kommuneId: kommune.id, meldingId: melding.id, sakId: sak.id, journalId: journal.id };
    });
  }

  it("legger journaloppføringen i outboxen med kommune- og meldingsbinding når konfigurasjon er aktiv", async () => {
    const { kommuneId, meldingId, journalId } = await setupSakMedJournal();
    cleanupArchiveConfigKommuneIds.push(kommuneId);
    await pool.query(
      `INSERT INTO archive_configs (kommune_id, provider, base_url, client_id, client_secret, status, auto_archive)
       VALUES ($1, 'documaster', 'https://example.invalid', 'x', 'y', 'active', true)`,
      [kommuneId],
    );

    const { queueBarnevernJournalArchiving } = await import("../archive/archive-service");
    const result = await queueBarnevernJournalArchiving(journalId, kommuneId);
    expect(result.queued).toBe(true);
    cleanupArchiveEntryIds.push(result.entryId!);

    const { rows: [row] } = await pool.query(`SELECT * FROM archive_entries WHERE id = $1`, [result.entryId]);
    expect(row.entity_type).toBe("barnevern_journal");
    expect(row.entity_id).toBe(journalId);
    expect(row.kommune_id).toBe(kommuneId);
    expect(row.barnevern_melding_id).toBe(meldingId);
    expect(row.vendor_id).toBeNull();
  });

  it("køer ikke uten aktiv arkivkonfigurasjon for kommunen", async () => {
    const { kommuneId, journalId } = await setupSakMedJournal();

    const { queueBarnevernJournalArchiving } = await import("../archive/archive-service");
    const result = await queueBarnevernJournalArchiving(journalId, kommuneId);
    expect(result.queued).toBe(false);
    expect(result.reason).toBe("Arkivintegrasjon ikke konfigurert");
  });

  it("avviser journaloppføring fra annen kommune", async () => {
    const { journalId } = await setupSakMedJournal();
    const { rows: [annen] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '8888') RETURNING id`,
      [`Annen kommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(annen.id);

    const { queueBarnevernJournalArchiving } = await import("../archive/archive-service");
    const result = await queueBarnevernJournalArchiving(journalId, annen.id);
    expect(result.queued).toBe(false);
    expect(result.reason).toBe("Journaloppføring ikke funnet");
  });
});
