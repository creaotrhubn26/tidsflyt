import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { runTaskEscalations } from "../../routes/task-escalation-cron";

describe("runTaskEscalations", () => {
  const cleanupIds: number[] = [];
  const cleanupNotificationUserIds: string[] = [];
  afterEach(async () => {
    for (const id of cleanupIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_dashboard_tasks WHERE id = $1`, [id]);
    }
    for (const uid of cleanupNotificationUserIds.splice(0)) {
      await pool.query(`DELETE FROM notifications WHERE recipient_id = $1`, [uid]);
    }
  });

  async function insertTask(overrides: {
    userId: string; assignedByUserId: string | null; dueAt: Date | null; done?: boolean; escalatedAt?: Date | null;
  }) {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_dashboard_tasks (user_id, title, done, assigned_by_user_id, due_at, escalated_at)
       VALUES ($1, 'Test oppgave', $2, $3, $4, $5) RETURNING id`,
      [overrides.userId, overrides.done ?? false, overrides.assignedByUserId, overrides.dueAt, overrides.escalatedAt ?? null],
    );
    cleanupIds.push(row.id);
    return row.id;
  }

  it("eskalerer en forfalt, tildelt, ikke-fullført oppgave og varsler tildeleren", async () => {
    const assignerId = `test_esc_assigner_${Date.now()}`;
    const assigneeId = `test_esc_assignee_${Date.now()}`;
    cleanupNotificationUserIds.push(assignerId);
    const yesterday = new Date(Date.now() - 86_400_000);
    const taskId = await insertTask({ userId: assigneeId, assignedByUserId: assignerId, dueAt: yesterday });

    const result = await runTaskEscalations();
    expect(result.escalated).toBeGreaterThanOrEqual(1);

    const { rows: [task] } = await pool.query(`SELECT escalated_at FROM tidum_dashboard_tasks WHERE id = $1`, [taskId]);
    expect(task.escalated_at).not.toBeNull();

    const { rows: notifs } = await pool.query(
      `SELECT * FROM notifications WHERE recipient_id = $1 AND type = 'task_overdue'`,
      [assignerId],
    );
    expect(notifs.length).toBe(1);
  });

  it("eskalerer IKKE på nytt en oppgave som allerede har escalated_at satt (idempotens)", async () => {
    const assignerId = `test_esc_idempotent_${Date.now()}`;
    cleanupNotificationUserIds.push(assignerId);
    const yesterday = new Date(Date.now() - 86_400_000);
    await insertTask({ userId: `test_esc_u_${Date.now()}`, assignedByUserId: assignerId, dueAt: yesterday, escalatedAt: new Date() });

    await runTaskEscalations();

    const { rows: notifs } = await pool.query(
      `SELECT * FROM notifications WHERE recipient_id = $1 AND type = 'task_overdue'`,
      [assignerId],
    );
    expect(notifs.length).toBe(0);
  });

  it("eskalerer IKKE en selvopprettet oppgave (assigned_by_user_id er NULL)", async () => {
    const userId = `test_esc_self_${Date.now()}`;
    const yesterday = new Date(Date.now() - 86_400_000);
    await insertTask({ userId, assignedByUserId: null, dueAt: yesterday });

    const before = (await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE recipient_id = $1`, [userId])).rows[0].n;
    await runTaskEscalations();
    const after = (await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE recipient_id = $1`, [userId])).rows[0].n;

    expect(after).toBe(before);
  });

  it("eskalerer IKKE en fullført oppgave selv om fristen er passert", async () => {
    const assignerId = `test_esc_done_${Date.now()}`;
    cleanupNotificationUserIds.push(assignerId);
    const yesterday = new Date(Date.now() - 86_400_000);
    await insertTask({ userId: `test_esc_done_u_${Date.now()}`, assignedByUserId: assignerId, dueAt: yesterday, done: true });

    await runTaskEscalations();

    const { rows: notifs } = await pool.query(`SELECT * FROM notifications WHERE recipient_id = $1`, [assignerId]);
    expect(notifs.length).toBe(0);
  });
});
