import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { withKommuneRlsContext } from "../database-rls-context";

describe("Barnevern meldingsmottak: datamodell", () => {
  const cleanupIds: { table: string; id: string }[] = [];
  let testKommuneId: number | null = null;

  afterEach(async () => {
    for (const { table, id } of cleanupIds.splice(0)) {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    }
    if (testKommuneId) {
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [testKommuneId]);
      testKommuneId = null;
    }
  });

  async function insertTestKommune(): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer) VALUES ($1, $2) RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    return row.id;
  }

  it("kan opprette en tidum_barnevern_meldinger-rad med alle felt", async () => {
    testKommuneId = await insertTestKommune();
    const row = await withKommuneRlsContext(testKommuneId, async (client) => {
      const { rows: [created] } = await client.query(
        `INSERT INTO tidum_barnevern_meldinger
           (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, beskrivelse, avklaringsfrist)
         VALUES ($1, $2, 'manuell', NOW(), 'skole', 'Test-beskrivelse', NOW() + interval '7 days')
         RETURNING id, status, kilde`,
        [testKommuneId, `BVM-TEST-${Date.now()}`],
      );
      return created;
    });
    cleanupIds.push({ table: "tidum_barnevern_meldinger", id: row.id });
    expect(row.status).toBe("mottatt");
    expect(row.kilde).toBe("manuell");
  });

  it("tidum_barnevern_meldingsnummer_seq gir strengt økende verdier", async () => {
    const { rows: [a] } = await pool.query(`SELECT nextval('tidum_barnevern_meldingsnummer_seq') AS n`);
    const { rows: [b] } = await pool.query(`SELECT nextval('tidum_barnevern_meldingsnummer_seq') AS n`);
    expect(Number(b.n)).toBe(Number(a.n) + 1);
  });

  it("tidum_frister håndhever unik (entity_type, entity_id, frist_type)", async () => {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_frister (entity_type, entity_id, kommune_id, frist_type, due_at)
       VALUES ('test_entity', 'abc-123', NULL, 'avklaring', NOW() + interval '7 days')
       RETURNING id`,
    );
    cleanupIds.push({ table: "tidum_frister", id: row.id });
    await expect(
      pool.query(
        `INSERT INTO tidum_frister (entity_type, entity_id, kommune_id, frist_type, due_at)
         VALUES ('test_entity', 'abc-123', NULL, 'avklaring', NOW())`,
      ),
    ).rejects.toThrow();
  });

  it("tidum_kommuner har nye Fiks-kolonner, default fiks_enabled=false", async () => {
    const kommuneId = await insertTestKommune();
    const { rows: [row] } = await pool.query(
      `SELECT fiks_konto_id, fiks_enabled FROM tidum_kommuner WHERE id = $1`,
      [kommuneId],
    );
    expect(row.fiks_konto_id).toBeNull();
    expect(row.fiks_enabled).toBe(false);
    await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [kommuneId]);
  });

  it("tidum_fiks_raw_intake_log kan lagre en rad", async () => {
    testKommuneId = await insertTestKommune();
    const row = await withKommuneRlsContext(testKommuneId, async (client) => {
      const { rows: [created] } = await client.query(
        `INSERT INTO tidum_fiks_raw_intake_log (kommune_id, raw_payload_encrypted) VALUES ($1, 'enc:v1:test') RETURNING id`,
        [testKommuneId],
      );
      return created;
    });
    cleanupIds.push({ table: "tidum_fiks_raw_intake_log", id: row.id });
    expect(row.id).toBeDefined();
  });
});
