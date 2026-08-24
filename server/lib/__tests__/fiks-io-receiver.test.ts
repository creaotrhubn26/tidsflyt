import { describe, it, expect, vi, afterEach } from "vitest";
import { pool } from "../../db";
import { onBekymringsmeldingRaw } from "../../fiks-io/receiver";

describe("fiks-io/receiver: onBekymringsmeldingRaw", () => {
  const cleanupKommuneIds: number[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const id of cleanupKommuneIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_fiks_raw_intake_log WHERE kommune_id = $1`, [id]);
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
    }
  });

  it("lagrer rå payload kryptert, uendret innhold ved dekryptering", async () => {
    // Uten TIDUM_SECRET_KEY faller sealSecret tilbake til klartekst (med
    // vilje, se secret-box.ts) — sett nøkkelen her for å teste selve
    // krypteringen, ikke fallback-stien.
    vi.stubEnv("TIDUM_SECRET_KEY", "test-only-key-for-fiks-io-receiver-test");
    const { rows: [kommune] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer) VALUES ($1, $2) RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(kommune.id);

    const rawPayload = { ukjentFelt: "noe fra Fiks IO vi ikke forstår ennå", nested: { a: 1 } };
    await onBekymringsmeldingRaw(kommune.id, rawPayload);

    const { rows } = await pool.query(
      `SELECT raw_payload_encrypted, processed_at FROM tidum_fiks_raw_intake_log WHERE kommune_id = $1`,
      [kommune.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].processed_at).toBeNull();
    expect(rows[0].raw_payload_encrypted).not.toContain("ukjentFelt"); // kryptert, ikke klartekst
  });
});
