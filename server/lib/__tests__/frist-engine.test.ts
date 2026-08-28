import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { pool } from "../../db";
import { registerFrist, cancelFrist, runFristEscalations } from "../frist-engine";
import * as notificationRoutes from "../../routes/notification-routes";

describe("frist-engine", () => {
  const cleanupEntityIds: string[] = [];
  // tidum_frister.notify_user_id has a real FK to users.id (unlike
  // tidum_dashboard_tasks.assigned_by_user_id, which has none) — these two
  // fixture users must exist for the FK to accept them.
  const nonce = randomUUID();
  const testUserIds = [`frist-user-1-${nonce}`, `frist-user-2-${nonce}`];
  let kommuneId = 0;

  beforeAll(async () => {
    const { rows: [kommune] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer)
       VALUES ($1, $2, $3) RETURNING id`,
      [
        `Fristmotor testkommune ${nonce}`,
        String(700_000_000 + Math.floor(Math.random() * 90_000_000)),
        String(100_000 + Math.floor(Math.random() * 800_000)),
      ],
    );
    kommuneId = Number(kommune.id);
    for (const id of testUserIds) {
      await pool.query(
        `INSERT INTO users (id, username, password, kommune_id, role)
         VALUES ($1, $2, 'unused', $3, 'kommune_saksbehandler')`,
        [id, id, kommuneId],
      );
    }
  });

  afterAll(async () => {
    for (const id of testUserIds) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [kommuneId]);
  });

  afterEach(async () => {
    for (const id of cleanupEntityIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
    }
    vi.restoreAllMocks();
  });

  it("registerFrist oppretter en aktiv rad", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    await registerFrist({
      entityType: "test_entity",
      entityId,
      kommuneId,
      fristType: "avklaring",
      dueAt: new Date(Date.now() + 7 * 86400000),
    });
    const { rows } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'test_entity' AND entity_id = $1`,
      [entityId],
    );
    expect(rows[0].status).toBe("aktiv");
  });

  it("cancelFrist setter status til kansellert", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    await registerFrist({ entityType: "test_entity", entityId, kommuneId, fristType: "avklaring", dueAt: new Date() });
    await cancelFrist("test_entity", entityId, "avklaring", { kommuneId });
    const { rows } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'test_entity' AND entity_id = $1`,
      [entityId],
    );
    expect(rows[0].status).toBe("kansellert");
  });

  it("runFristEscalations varsler ved offset 0 (på forfallsdagen) for fristType 'avklaring', ikke to ganger", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    const createSpy = vi.spyOn(notificationRoutes, "createNotification").mockResolvedValue(undefined);
    const dueAt = new Date();
    await registerFrist({
      entityType: "test_entity",
      entityId,
      kommuneId,
      fristType: "avklaring",
      dueAt,
      notifyUserId: testUserIds[0],
    });

    const first = await runFristEscalations(dueAt, [entityId]);
    expect(first.notified).toBeGreaterThanOrEqual(1);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: testUserIds[0], type: "frist_eskalering" }),
    );

    const callCountAfterFirst = createSpy.mock.calls.length;
    await runFristEscalations(dueAt, [entityId]);
    expect(createSpy.mock.calls.length).toBe(callCountAfterFirst); // ingen ny varsling samme offset
  });

  it("runFristEscalations rører ALDRI status (kun domenekoden avgjør oppfylt/brutt)", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    vi.spyOn(notificationRoutes, "createNotification").mockResolvedValue(undefined);
    const overdue = new Date(Date.now() - 10 * 86400000);
    await registerFrist({ entityType: "test_entity", entityId, kommuneId, fristType: "avklaring", dueAt: overdue });
    await runFristEscalations(undefined, [entityId]);
    const { rows } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'test_entity' AND entity_id = $1`,
      [entityId],
    );
    expect(rows[0].status).toBe("aktiv");
  });

  it("en sterkt oversittet frist får ALLE 4 eskaleringsterskler i én kjøring (-2, 0, 1, 3)", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    const createSpy = vi.spyOn(notificationRoutes, "createNotification").mockResolvedValue(undefined);
    const dueAt = new Date(Date.now() - 10 * 86400000); // 10 dager oversittet — alle 4 offsets ligger i fortiden
    await registerFrist({
      entityType: "test_entity",
      entityId,
      kommuneId,
      fristType: "avklaring",
      dueAt,
      notifyUserId: testUserIds[1],
    });

    const result = await runFristEscalations(undefined, [entityId]);
    expect(result.notified).toBeGreaterThanOrEqual(4);
    expect(createSpy).toHaveBeenCalledTimes(4);

    const { rows } = await pool.query(
      `SELECT varslet_offsets FROM tidum_frister WHERE entity_type = 'test_entity' AND entity_id = $1`,
      [entityId],
    );
    expect(rows[0].varslet_offsets.sort((a: number, b: number) => a - b)).toEqual([-2, 0, 1, 3]);
  });

  it("to samtidige kjøringer av runFristEscalations varsler ikke dobbelt (claim-guard)", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    const createSpy = vi.spyOn(notificationRoutes, "createNotification").mockResolvedValue(undefined);
    const dueAt = new Date(Date.now() - 10 * 86400000); // 4 offsets forfalt
    await registerFrist({
      entityType: "test_entity",
      entityId,
      kommuneId,
      fristType: "avklaring",
      dueAt,
      notifyUserId: testUserIds[0],
    });

    await Promise.all([runFristEscalations(undefined, [entityId]), runFristEscalations(undefined, [entityId])]);

    expect(createSpy).toHaveBeenCalledTimes(4); // ikke 8 — kun én kjøring claimer hver offset
  });
});
