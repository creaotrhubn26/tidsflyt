import type { Express, Request, Response } from "express";
import cron from "node-cron";
import { requireSuperAdmin } from "../custom-auth";
import { runFristEscalations } from "../lib/frist-engine";

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
  app.post("/api/admin/frist-escalation/run", requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await runFristEscalations();
      res.json(result);
    } catch (error) {
      console.error("[frist-escalation] manual run failed", error);
      res.status(500).json({ error: "Kunne ikke kjøre fristeskalering" });
    }
  });
}
