/**
 * server/routes/task-escalation-cron.ts
 *
 * Daglig: finn tildelte oppgaver hvor fristen er passert uten at
 * oppgaven er fullført, og varsle den som tildelte den. Eskalerer
 * NØYAKTIG ÉN GANG per oppgave — escalated_at er idempotens-vakten
 * (rapport-reminder-cron.ts sitt mønster har bevisst ingen slik vakt;
 * denne cronen trenger en, siden gjentatt daglig eskalering av samme
 * oppgave ville vært spam, ikke en påminnelse).
 */

import type { Express, Request, Response } from "express";
import cron from "node-cron";
import { db } from "../db";
import { and, eq, isNull, isNotNull, lt } from "drizzle-orm";
import { dashboardTasks } from "@shared/schema";
import { createNotification } from "./notification-routes";
import { requireAuth, ADMIN_ROLES } from "../middleware/auth";

function isAdminRole(req: Request): boolean {
  const role = String(((req as any).authUser ?? (req as any).user)?.role || "")
    .toLowerCase().replace(/[\s-]/g, "_");
  return ADMIN_ROLES.includes(role);
}

export async function runTaskEscalations(): Promise<{ escalated: number }> {
  const overdue = await db
    .select()
    .from(dashboardTasks)
    .where(and(
      lt(dashboardTasks.dueAt, new Date()),
      eq(dashboardTasks.done, false),
      isNull(dashboardTasks.escalatedAt),
      isNotNull(dashboardTasks.assignedByUserId),
    ));

  let escalated = 0;
  for (const task of overdue) {
    try {
      await createNotification({
        userId: task.assignedByUserId!,
        type: "task_overdue",
        title: "Oppgave forfalt",
        message: task.title,
        link: "/dashboard",
      });
      await db
        .update(dashboardTasks)
        .set({ escalatedAt: new Date(), updatedAt: new Date() })
        .where(eq(dashboardTasks.id, task.id));
      escalated++;
    } catch (err) {
      console.error(`Failed to escalate task ${task.id}:`, err);
    }
  }
  return { escalated };
}

let cronStarted = false;
export function setupTaskEscalationCron() {
  if (cronStarted) return;
  cron.schedule("0 8 * * *", async () => {
    console.log("⏰ Running task escalation cron…");
    const result = await runTaskEscalations();
    console.log(`Tasks escalated: ${result.escalated}`);
  });
  cronStarted = true;
  console.log("✅ Task escalation cron scheduled (daily 08:00)");
}

/** Manuell trigger-rute for admins til å teste + tvinge en kjøring. */
export function registerTaskEscalationRoutes(app: Express) {
  app.post("/api/task-escalations/run", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: "Kun admin+ kan kjøre eskalering manuelt" });
      const result = await runTaskEscalations();
      res.json({ ok: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
