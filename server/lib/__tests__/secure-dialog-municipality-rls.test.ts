import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import {
  withKommuneRlsContext,
  withSecurePartyRlsContext,
  withSystemRlsContext,
} from "../database-rls-context";

const SECURE_TABLES = [
  "tidum_secure_parties",
  "tidum_secure_case_access",
  "tidum_secure_conversations",
  "tidum_secure_conversation_participants",
  "tidum_secure_messages",
  "tidum_secure_message_attachments",
  "tidum_secure_message_receipts",
  "tidum_secure_dialog_audit_events",
  "tidum_secure_notification_outbox",
  "tidum_secure_dialog_retention_policies",
  "tidum_secure_dialog_legal_holds",
  "tidum_secure_attachment_quarantine",
] as const;

describe("secure dialog municipality and party RLS migration 084", { timeout: 60_000 }, () => {
  const nonce = randomUUID();
  const staffA = `rls-secure-staff-a-${nonce}`;
  const staffB = `rls-secure-staff-b-${nonce}`;
  const portalA = `rls-secure-portal-a-${nonce}`;
  const portalOtherA = `rls-secure-portal-other-a-${nonce}`;
  const portalB = `rls-secure-portal-b-${nonce}`;
  let kommuneA = 0;
  let kommuneB = 0;
  let meldingA = "";
  let meldingOtherA = "";
  let meldingB = "";
  let partyA = "";
  let partyOtherA = "";
  let partyB = "";
  let conversationA = "";
  let conversationOtherA = "";
  let conversationB = "";

  async function countWithoutContext(): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      const { rows: [row] } = await client.query(
        `SELECT count(*)::int AS count
           FROM tidum_secure_conversations
          WHERE id = ANY($1::uuid[])`,
        [[conversationA, conversationOtherA, conversationB]],
      );
      await client.query("COMMIT");
      return Number(row.count);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    const phaseOne = readFileSync("migrations/083_barnevern_municipality_rls.sql", "utf8");
    const phaseTwo = readFileSync("migrations/084_secure_dialog_municipality_rls.sql", "utf8");
    await pool.query(phaseOne);
    await pool.query(phaseTwo);
    await pool.query(phaseTwo);

    const municipalityNumber = 9200 + Math.floor(Math.random() * 500);
    const kommuner = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer)
       VALUES ($1, $2, $3), ($4, $5, $6)
       RETURNING id, kommunenummer`,
      [
        `Secure RLS kommune A ${nonce}`,
        String(700000000 + Math.floor(Math.random() * 90_000_000)),
        String(municipalityNumber),
        `Secure RLS kommune B ${nonce}`,
        String(800000000 + Math.floor(Math.random() * 90_000_000)),
        String(municipalityNumber + 1),
      ],
    );
    kommuneA = Number(kommuner.rows.find((row) => row.kommunenummer === String(municipalityNumber)).id);
    kommuneB = Number(kommuner.rows.find((row) => row.kommunenummer === String(municipalityNumber + 1)).id);

    await pool.query(
      `INSERT INTO users (id, username, password, email, role, kommune_id)
       VALUES
         ($1::varchar, $1::text, 'x', $6, 'kommune_saksbehandler', $11),
         ($2::varchar, $2::text, 'x', $7, 'kommune_saksbehandler', $12),
         ($3::varchar, $3::text, 'x', $8, 'innbygger', NULL),
         ($4::varchar, $4::text, 'x', $9, 'innbygger', NULL),
         ($5::varchar, $5::text, 'x', $10, 'innbygger', NULL)`,
      [
        staffA,
        staffB,
        portalA,
        portalOtherA,
        portalB,
        `${staffA}@example.no`,
        `${staffB}@example.no`,
        `${portalA}@example.no`,
        `${portalOtherA}@example.no`,
        `${portalB}@example.no`,
        kommuneA,
        kommuneB,
      ],
    );

    await withSystemRlsContext("secure_rls_fixture", async (client) => {
      const messages = await client.query(
        `INSERT INTO tidum_barnevern_meldinger
           (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, beskrivelse, avklaringsfrist)
         VALUES
           ($1, $2, 'manuell', NOW(), 'annet', 'Secure RLS A', NOW() + INTERVAL '7 days'),
           ($1, $3, 'manuell', NOW(), 'annet', 'Secure RLS Other A', NOW() + INTERVAL '7 days'),
           ($4, $5, 'manuell', NOW(), 'annet', 'Secure RLS B', NOW() + INTERVAL '7 days')
         RETURNING id, meldingsnummer`,
        [
          kommuneA,
          `BVM-SECURE-A-${nonce}`,
          `BVM-SECURE-A2-${nonce}`,
          kommuneB,
          `BVM-SECURE-B-${nonce}`,
        ],
      );
      meldingA = String(messages.rows.find((row) => row.meldingsnummer === `BVM-SECURE-A-${nonce}`).id);
      meldingOtherA = String(messages.rows.find((row) => row.meldingsnummer === `BVM-SECURE-A2-${nonce}`).id);
      meldingB = String(messages.rows.find((row) => row.meldingsnummer === `BVM-SECURE-B-${nonce}`).id);

      const parties = await client.query(
        `INSERT INTO tidum_secure_parties
           (kommune_id, portal_user_id, display_name, notification_email, created_by)
         VALUES
           ($1, $2, 'Part A', $3, $4),
           ($1, $5, 'Part Other A', $6, $4),
           ($7, $8, 'Part B', $9, $10)
         RETURNING id, portal_user_id`,
        [
          kommuneA,
          portalA,
          `${portalA}@example.no`,
          staffA,
          portalOtherA,
          `${portalOtherA}@example.no`,
          kommuneB,
          portalB,
          `${portalB}@example.no`,
          staffB,
        ],
      );
      partyA = String(parties.rows.find((row) => row.portal_user_id === portalA).id);
      partyOtherA = String(parties.rows.find((row) => row.portal_user_id === portalOtherA).id);
      partyB = String(parties.rows.find((row) => row.portal_user_id === portalB).id);

      const accesses = await client.query(
        `INSERT INTO tidum_secure_case_access
           (kommune_id, party_id, barnevern_melding_id, party_role, created_by)
         VALUES
           ($1, $2, $3, 'forelder', $4),
           ($1, $5, $6, 'forelder', $4),
           ($7, $8, $9, 'forelder', $10)
         RETURNING id, party_id`,
        [kommuneA, partyA, meldingA, staffA, partyOtherA, meldingOtherA, kommuneB, partyB, meldingB, staffB],
      );
      const accessA = String(accesses.rows.find((row) => String(row.party_id) === partyA).id);
      const accessOtherA = String(accesses.rows.find((row) => String(row.party_id) === partyOtherA).id);
      const accessB = String(accesses.rows.find((row) => String(row.party_id) === partyB).id);

      const conversations = await client.query(
        `INSERT INTO tidum_secure_conversations
           (kommune_id, barnevern_melding_id, subject, created_by)
         VALUES ($1, $2, 'subject-a', $3), ($1, $4, 'subject-other-a', $3), ($5, $6, 'subject-b', $7)
         RETURNING id, barnevern_melding_id`,
        [kommuneA, meldingA, staffA, meldingOtherA, kommuneB, meldingB, staffB],
      );
      conversationA = String(conversations.rows.find((row) => String(row.barnevern_melding_id) === meldingA).id);
      conversationOtherA = String(conversations.rows.find((row) => String(row.barnevern_melding_id) === meldingOtherA).id);
      conversationB = String(conversations.rows.find((row) => String(row.barnevern_melding_id) === meldingB).id);

      await client.query(
        `INSERT INTO tidum_secure_conversation_participants
           (kommune_id, conversation_id, party_access_id, granted_by)
         VALUES ($1, $2, $3, $4), ($1, $5, $6, $4), ($7, $8, $9, $10)`,
        [kommuneA, conversationA, accessA, staffA, conversationOtherA, accessOtherA, kommuneB, conversationB, accessB, staffB],
      );

      const secureMessages = await client.query(
        `INSERT INTO tidum_secure_messages
           (kommune_id, conversation_id, sender_user_id, sender_kind, body_encrypted)
         VALUES ($1, $2, $3, 'staff', 'message-a'),
                ($1, $4, $3, 'staff', 'message-other-a'),
                ($5, $6, $7, 'staff', 'message-b')
         RETURNING id, conversation_id`,
        [kommuneA, conversationA, staffA, conversationOtherA, kommuneB, conversationB, staffB],
      );
      const messageA = String(secureMessages.rows.find((row) => String(row.conversation_id) === conversationA).id);
      const messageOtherA = String(secureMessages.rows.find((row) => String(row.conversation_id) === conversationOtherA).id);
      const messageB = String(secureMessages.rows.find((row) => String(row.conversation_id) === conversationB).id);

      for (const [messageId, scopedKommune, staffUser, label] of [
        [messageA, kommuneA, staffA, "a"],
        [messageOtherA, kommuneA, staffA, "other-a"],
        [messageB, kommuneB, staffB, "b"],
      ] as const) {
        await client.query(
          `INSERT INTO tidum_secure_message_attachments
             (kommune_id, message_id, storage_key, original_name, mime_type, size_bytes,
              checksum_sha256, uploaded_by, scan_status, scan_engine, scanned_at)
           VALUES ($1, $2, $3, 'fixture.pdf', 'application/pdf', 1, $4, $5, 'clean', 'test', NOW())`,
          [scopedKommune, messageId, `secure-rls-${label}-${nonce}`, "a".repeat(64), staffUser],
        );
        await client.query(
          `UPDATE tidum_secure_messages
              SET status = 'sent', sent_at = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [messageId],
        );
      }

      for (const fixture of [
        { kommuneId: kommuneA, conversationId: conversationA, messageId: messageA, partyId: partyA, portalId: portalA, staffId: staffA, label: "a" },
        { kommuneId: kommuneA, conversationId: conversationOtherA, messageId: messageOtherA, partyId: partyOtherA, portalId: portalOtherA, staffId: staffA, label: "other-a" },
        { kommuneId: kommuneB, conversationId: conversationB, messageId: messageB, partyId: partyB, portalId: portalB, staffId: staffB, label: "b" },
      ]) {
        await client.query(
          `INSERT INTO tidum_secure_message_receipts (kommune_id, message_id, reader_user_id, reader_party_id)
           VALUES ($1, $2, $3, $4)`,
          [fixture.kommuneId, fixture.messageId, fixture.portalId, fixture.partyId],
        );
        await client.query(
          `INSERT INTO tidum_secure_dialog_audit_events
             (kommune_id, actor_user_id, actor_kind, conversation_id, action)
           VALUES ($1, $2, 'staff', $3, 'conversation_created')`,
          [fixture.kommuneId, fixture.staffId, fixture.conversationId],
        );
        await client.query(
          `INSERT INTO tidum_secure_notification_outbox (kommune_id, message_id, party_id)
           VALUES ($1, $2, $3)`,
          [fixture.kommuneId, fixture.messageId, fixture.partyId],
        );
        await client.query(
          `INSERT INTO tidum_secure_dialog_legal_holds (kommune_id, conversation_id, reason, applied_by)
           VALUES ($1, $2, 'RLS fixture', $3)`,
          [fixture.kommuneId, fixture.conversationId, fixture.staffId],
        );
        const { rows: [draft] } = await client.query(
          `INSERT INTO tidum_secure_messages
             (kommune_id, conversation_id, sender_user_id, sender_kind, body_encrypted)
           VALUES ($1, $2, $3, 'staff', 'quarantine-draft') RETURNING id`,
          [fixture.kommuneId, fixture.conversationId, fixture.staffId],
        );
        await client.query(
          `INSERT INTO tidum_secure_attachment_quarantine
             (kommune_id, conversation_id, message_id, storage_key, original_name, mime_type,
              size_bytes, checksum_sha256, scan_engine, detected_signature, uploaded_by, expires_at)
           VALUES ($1, $2, $3, $4, 'infected.pdf', 'application/pdf', 1, $5,
                   'test', 'fixture', $6, NOW() + INTERVAL '1 day')`,
          [fixture.kommuneId, fixture.conversationId, draft.id, `secure-quarantine-${fixture.label}-${nonce}`, "b".repeat(64), fixture.staffId],
        );
      }
      await client.query(
        `INSERT INTO tidum_secure_dialog_retention_policies
           (kommune_id, enabled, retention_days, policy_reference, updated_by)
         VALUES ($1, FALSE, NULL, 'RLS fixture A', $2), ($3, FALSE, NULL, 'RLS fixture B', $4)`,
        [kommuneA, staffA, kommuneB, staffB],
      );
    });
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE tidum_secure_dialog_audit_events, tidum_secure_message_attachments, tidum_secure_messages IN ACCESS EXCLUSIVE MODE");
      await client.query("ALTER TABLE tidum_secure_dialog_audit_events DISABLE TRIGGER tidum_secure_audit_immutable_trigger");
      await client.query("ALTER TABLE tidum_secure_message_attachments DISABLE TRIGGER tidum_secure_attachment_draft_trigger");
      await client.query("ALTER TABLE tidum_secure_messages DISABLE TRIGGER tidum_secure_message_immutable_trigger");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await client.query(
        `SELECT set_config('tidum.rls_mode', 'system', true),
                set_config('tidum.kommune_id', '', true),
                set_config('tidum.rls_system_operation', 'secure_rls_cleanup', true),
                set_config('tidum.rls_actor_user_id', '', true)`,
      );
      const ids = [kommuneA, kommuneB];
      await client.query(`DELETE FROM tidum_secure_notification_outbox WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_message_receipts WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_attachment_quarantine WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_message_attachments WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_messages WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_dialog_legal_holds WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_conversation_participants WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_conversations WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_case_access WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_dialog_audit_events WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_parties WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_secure_dialog_retention_policies WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query(`DELETE FROM tidum_barnevern_meldinger WHERE kommune_id = ANY($1::int[])`, [ids]);
      await client.query("RESET ROLE");
      await client.query("ALTER TABLE tidum_secure_messages ENABLE TRIGGER tidum_secure_message_immutable_trigger");
      await client.query("ALTER TABLE tidum_secure_message_attachments ENABLE TRIGGER tidum_secure_attachment_draft_trigger");
      await client.query("ALTER TABLE tidum_secure_dialog_audit_events ENABLE TRIGGER tidum_secure_audit_immutable_trigger");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [[staffA, staffB, portalA, portalOtherA, portalB]]);
    await pool.query(`DELETE FROM tidum_kommuner WHERE id = ANY($1::int[])`, [[kommuneA, kommuneB]]);
  });

  it("enables and forces RLS on the complete secure-dialog graph", async () => {
    const { rows } = await pool.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              EXISTS (
                SELECT 1 FROM pg_policy policy
                 WHERE policy.polrelid = c.oid AND policy.polname = 'tidum_secure_staff_system_all'
              ) AS has_base_policy
         FROM pg_class c
        WHERE c.relname = ANY($1::text[])
        ORDER BY c.relname`,
      [[...SECURE_TABLES]],
    );
    expect(rows).toHaveLength(SECURE_TABLES.length);
    expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity && row.has_base_policy)).toBe(true);
    const migration = readFileSync("migrations/084_secure_dialog_municipality_rls.sql", "utf8");
    expect(migration).not.toMatch(/GRANT[\s\S]+ON ALL (TABLES|SEQUENCES|FUNCTIONS)/i);
    expect(migration).not.toContain("ALTER DEFAULT PRIVILEGES");
  });

  it("denies missing context and resets the party context after commit", async () => {
    expect(await countWithoutContext()).toBe(0);
    const visible = await withSecurePartyRlsContext(portalA, async (client) => Number((await client.query(
      `SELECT count(*)::int AS count FROM tidum_secure_conversations
        WHERE id = ANY($1::uuid[])`,
      [[conversationA, conversationOtherA, conversationB]],
    )).rows[0].count));
    expect(visible).toBe(1);
    expect(await countWithoutContext()).toBe(0);
  });

  it("isolates every secure-dialog table by municipality", async () => {
    const visible = await withKommuneRlsContext(kommuneA, async (client) => {
      const counts: Record<string, number> = {};
      for (const table of SECURE_TABLES) {
        const { rows: [row] } = await client.query(
          `SELECT count(*)::int AS count FROM ${table} WHERE kommune_id = ANY($1::int[])`,
          [[kommuneA, kommuneB]],
        );
        counts[table] = Number(row.count);
      }
      return counts;
    });
    expect(Object.values(visible).every((count) => count > 0)).toBe(true);

    const changed = await withKommuneRlsContext(kommuneA, (client) => client.query(
      `UPDATE tidum_secure_conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationB],
    ));
    expect(changed.rowCount).toBe(0);
  });

  it("limits an eID party to its own active object chain within the municipality", async () => {
    const visible = await withSecurePartyRlsContext(portalA, async (client) => {
      const parties = await client.query(
        `SELECT id FROM tidum_secure_parties WHERE kommune_id = $1`,
        [kommuneA],
      );
      const conversations = await client.query(
        `SELECT id FROM tidum_secure_conversations WHERE kommune_id = $1 ORDER BY id`,
        [kommuneA],
      );
      const messages = await client.query(
        `SELECT conversation_id FROM tidum_secure_messages WHERE kommune_id = $1`,
        [kommuneA],
      );
      const audit = await client.query(
        `SELECT id FROM tidum_secure_dialog_audit_events WHERE kommune_id = $1`,
        [kommuneA],
      );
      return { parties: parties.rows, conversations: conversations.rows, messages: messages.rows, audit: audit.rows };
    });
    expect(visible.parties.map((row) => String(row.id))).toEqual([partyA]);
    expect(visible.conversations.map((row) => String(row.id))).toEqual([conversationA]);
    expect(visible.messages.every((row) => String(row.conversation_id) === conversationA)).toBe(true);
    expect(visible.messages).toHaveLength(1);
    expect(visible.audit).toHaveLength(0);
  });

  it("allows party drafts only in an actively authorized conversation", async () => {
    const ownDraft = await withSecurePartyRlsContext(portalA, async (client) => {
      const { rows: [row] } = await client.query(
        `INSERT INTO tidum_secure_messages
           (kommune_id, conversation_id, sender_user_id, sender_party_id, sender_kind, body_encrypted)
         VALUES ($1, $2, $3, $4, 'party', 'own-draft') RETURNING id`,
        [kommuneA, conversationA, portalA, partyA],
      );
      return String(row.id);
    });
    expect(ownDraft).toMatch(/^[0-9a-f-]{36}$/);

    await expect(withSecurePartyRlsContext(portalA, (client) => client.query(
      `INSERT INTO tidum_secure_messages
         (kommune_id, conversation_id, sender_user_id, sender_party_id, sender_kind, body_encrypted)
       VALUES ($1, $2, $3, $4, 'party', 'blocked-draft')`,
      [kommuneA, conversationOtherA, portalA, partyA],
    ))).rejects.toThrow(/row-level security policy/i);

    await expect(withSecurePartyRlsContext(portalA, (client) => client.query(
      `INSERT INTO tidum_secure_messages
         (kommune_id, conversation_id, sender_user_id, sender_party_id, sender_kind, body_encrypted)
       VALUES ($1, $2, $3, $4, 'party', 'forged-party')`,
      [kommuneA, conversationA, portalA, partyOtherA],
    ))).rejects.toThrow(/row-level security policy/i);
  });
});
