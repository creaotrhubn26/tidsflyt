import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";

describe("tidum_dashboard_tasks: assignedByUserId/dueAt/escalatedAt", () => {
  const cleanupIds: number[] = [];
  afterEach(async () => {
    for (const id of cleanupIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_dashboard_tasks WHERE id = $1`, [id]);
    }
  });

  it("selvopprettet oppgave (uten assignedByUserId/dueAt) er uendret", async () => {
    const { storage } = await import("../../storage");
    const userId = `test_selfcreate_${Date.now()}`;
    const task = await storage.createDashboardTask(userId, "Test selvopprettet");
    cleanupIds.push(task.id);

    expect(task.assignedByUserId).toBeNull();
    expect(task.dueAt).toBeNull();
    expect(task.escalatedAt).toBeNull();
  });

  it("tildelt oppgave lagrer assignedByUserId og dueAt korrekt", async () => {
    const { storage } = await import("../../storage");
    const assigneeId = `test_assignee_${Date.now()}`;
    const assignerId = `test_assigner_${Date.now()}`;
    const due = new Date(Date.now() + 86_400_000);

    const task = await storage.createDashboardTask(assigneeId, "Følg opp sak X", undefined, undefined, assignerId, due);
    cleanupIds.push(task.id);

    expect(task.userId).toBe(assigneeId);
    expect(task.assignedByUserId).toBe(assignerId);
    expect(task.dueAt?.getTime()).toBe(due.getTime());

    const fetched = await storage.getDashboardTasks(assigneeId);
    expect(fetched.some((t) => t.id === task.id)).toBe(true);
  });

  it("updateDashboardTask kan sette escalatedAt", async () => {
    const { storage } = await import("../../storage");
    const userId = `test_escalate_update_${Date.now()}`;
    const task = await storage.createDashboardTask(userId, "Test", undefined, undefined, userId, new Date());
    cleanupIds.push(task.id);

    const now = new Date();
    const updated = await storage.updateDashboardTask(task.id, userId, { escalatedAt: now });
    expect(updated?.escalatedAt?.getTime()).toBe(now.getTime());
  });
});
