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
import { and, eq, isNull, isNotNull, lt, inArray } from "drizzle-orm";
import { dashboardTasks } from "@shared/schema";
import { createNotification } from "./notification-routes";
import { requireAuth } from "../middleware/auth";

function isSuperAdmin(req: Request): boolean {
  const role = String(((req as any).authUser ?? (req as any).user)?.role || "")
    .toLowerCase().replace(/[\s-]/g, "_");
  return role === "super_admin";
}

// taskIds is test-only: runTaskEscalations() with no filter scans every
// vendor's overdue tasks (needed for the real daily cron), which makes it
// unsafe for tests to call unfiltered against the shared database — a test
// run would escalate real users' real overdue tasks and permanently burn
// their idempotency guard. Tests pass their own inserted ids to scope the
// scan to rows they own and can clean up.
export async function runTaskEscalations(taskIds?: number[]): Promise<{ escalated: number }> {
  const overdue = await db
    .select()
    .from(dashboardTasks)
    .where(and(
      lt(dashboardTasks.dueAt, new Date()),
      eq(dashboardTasks.done, false),
      isNull(dashboardTasks.escalatedAt),
      isNotNull(dashboardTasks.assignedByUserId),
      ...(taskIds ? [inArray(dashboardTasks.id, taskIds)] : []),
    ));

  let escalated = 0;
  for (const task of overdue) {
    try {
      // Claim the row before notifying, conditioned on escalated_at still
      // being NULL: two overlapping runs (a manual admin trigger racing the
      // 08:00 cron, or a brief two-instance overlap during a deploy) would
      // otherwise both see the same overdue row and both notify. Only the
      // run that actually flips escalated_at proceeds to notify.
      const [claimed] = await db
        .update(dashboardTasks)
        .set({ escalatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(dashboardTasks.id, task.id), isNull(dashboardTasks.escalatedAt)))
        .returning({ id: dashboardTasks.id });
      if (!claimed) continue;

      // createNotification() catches and swallows its own errors (never
      // throws), so escalated_at above is set regardless of whether the
      // notification actually got persisted — "escalated" here means
      // "attempted", not "delivered". Accepted limitation (see progress
      // ledger for this feature); fixing it would mean changing
      // createNotification's error contract for every caller in the app.
      await createNotification({
        userId: task.assignedByUserId!,
        type: "task_overdue",
        title: "Oppgave forfalt",
        message: task.title,
        link: "/dashboard",
      });
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

// Manuell trigger-rute til å teste + tvinge en kjøring. runTaskEscalations()
// er ikke vendor-scopet (den ekte daglige cronen skal treffe alle
// tenanter), så denne ruten kan tvinge eskalering av ENHVER tenants
// forfalte oppgaver — begrenset til super_admin, ikke ADMIN_ROLES for
// øvrig (som inkluderer vendor-lokale roller som tiltaksleder/teamleder,
// som ellers kunne tvinge kryss-tenant-varsling på et tidspunkt de velger).
export function registerTaskEscalationRoutes(app: Express) {
  app.post("/api/task-escalations/run", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isSuperAdmin(req)) return res.status(403).json({ error: "Kun super_admin kan kjøre eskalering manuelt" });
      const result = await runTaskEscalations();
      res.json({ ok: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
