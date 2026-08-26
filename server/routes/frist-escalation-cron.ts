import type { Express, Request, Response } from "express";
import cron from "node-cron";
import { requireAuth } from "../middleware/auth";
import { runFristEscalations } from "../lib/frist-engine";

function isSuperAdmin(req: Request): boolean {
  const user = (req as any).authUser ?? (req as any).user;
  return user?.role === "super_admin";
}

let cronStarted = false;

export function setupFristEscalationCron(): void {
  if (cronStarted) return;
  cronStarted = true;
  cron.schedule("0 8 * * *", async () => {
    try {
      const result = await runFristEscalations();
      console.log(`[frist-escalation-cron] notified=${result.notified} expired=${result.expired}`);
    } catch (err) {
      console.error("[frist-escalation-cron] feilet:", err);
    }
  });
}

export function registerFristEscalationRoutes(app: Express): void {
  app.post("/api/admin/frist-escalation/run", requireAuth, async (req: Request, res: Response) => {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ error: "Kun super_admin kan trigge manuelt." });
    }
    try {
      const result = await runFristEscalations();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
