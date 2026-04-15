/**
 * server/routes/gdpr-routes.ts
 *
 * GDPR Article 15 (right of access) and Article 17 (right to erasure) endpoints.
 *
 * Public endpoints (for authenticated user acting on their own data):
 *   GET    /api/me/export   — returns all user data as JSON attachment
 *   DELETE /api/me           — anonymises user (preserves audit IDs)
 *
 * Anonymisation strategy:
 *   - users.email → 'deleted-<id>@anonymized.local'
 *   - users.firstName, lastName → 'Slettet bruker'
 *   - users.phone, addressLines, etc. → NULL
 *   - rapporter, saker.tildelteUserId: user-id preserved, but name references
 *     now resolve to the anonymised row (correctness preserved for audit trail)
 *   - Log the deletion in rapport_audit_log as a system event if the user
 *     had any rapporter, so compliance proof survives.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import {
  users,
  logRow,
  rapporter,
  rapportMaal,
  rapportAktiviteter,
  userSettings,
  userDrafts,
  userGoalCategories,
  timerSessions,
  recurringEntries,
  leaveRequests,
  overtimeEntries,
  notifications,
  rapportAuditLog,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

function authedUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}

function coerceId(raw: unknown): string | number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const s = String(raw);
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

export function registerGdprRoutes(app: Express) {
  /**
   * GET /api/me/export
   * GDPR art. 15 — right of access. Returns all personal data we hold about
   * the authenticated user, as a JSON download.
   */
  app.get("/api/me/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const authed = authedUser(req);
      const userId = coerceId(authed?.id);
      if (userId == null) return res.status(401).json({ error: "Ikke innlogget" });

      // Core profile
      const [profile] = await db.select().from(users).where(eq(users.id, userId as any)).limit(1);
      if (!profile) return res.status(404).json({ error: "Bruker ikke funnet" });

      // Parallel fetch of all domains where the user has data
      const [
        logRows,
        rapporterRows,
        settingsRow,
        draftsRows,
        goalCatRows,
        timerRows,
        recurringRows,
        leaveRows,
        overtimeRows,
        notificationRows,
      ] = await Promise.all([
        db.select().from(logRow).where(eq(logRow.userId, userId as any)),
        db.select().from(rapporter).where(eq(rapporter.userId, userId as any)),
        db.select().from(userSettings).where(eq(userSettings.userId, userId as any)).limit(1),
        db.select().from(userDrafts).where(eq(userDrafts.userId, userId as any)),
        db.select().from(userGoalCategories).where(eq(userGoalCategories.userId, userId as any)),
        db.select().from(timerSessions).where(eq(timerSessions.userId, userId as any)),
        db.select().from(recurringEntries).where(eq(recurringEntries.userId, userId as any)),
        db.select().from(leaveRequests).where(eq(leaveRequests.userId, userId as any)),
        db.select().from(overtimeEntries).where(eq(overtimeEntries.userId, userId as any)),
        db.select().from(notifications).where(eq(notifications.recipientId, String(userId))),
      ]);

      // For each rapport, also include its mål and aktiviteter (nested)
      const rapporterExpanded = await Promise.all(
        rapporterRows.map(async (r) => {
          const [maal, aktiviteter] = await Promise.all([
            db.select().from(rapportMaal).where(eq(rapportMaal.rapportId, r.id)),
            db.select().from(rapportAktiviteter).where(eq(rapportAktiviteter.rapportId, r.id)),
          ]);
          return { ...r, mål: maal, aktiviteter };
        }),
      );

      // Redact the password hash
      const { password: _pw, ...safeProfile } = profile as any;

      const exportBundle = {
        _meta: {
          exportedAt: new Date().toISOString(),
          user: String(userId),
          vendorId: (profile as any).vendorId ?? null,
          schemaVersion: 1,
          legalBasis: "GDPR art. 15 — right of access",
        },
        profile: safeProfile,
        settings: settingsRow ?? null,
        drafts: draftsRows,
        goalCategories: goalCatRows,
        timeEntries: logRows,
        timerSessions: timerRows,
        recurring: recurringRows,
        rapporter: rapporterExpanded,
        leaveRequests: leaveRows,
        overtimeEntries: overtimeRows,
        notifications: notificationRows,
      };

      const filename = `tidum-mine-data-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(exportBundle, null, 2));
    } catch (e: any) {
      console.error("GDPR export failed:", e);
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * DELETE /api/me
   * GDPR art. 17 — right to erasure. Anonymises the user while preserving
   * referential integrity for audit/bookkeeping purposes. Requires explicit
   * confirmation via body { confirm: "SLETT" } to prevent accidental calls.
   *
   * Note: bokføringslovens 5-år regel overstyrer GDPR for timebilag. Vi sletter
   * derfor IKKE log_row-data, men anonymiserer profilen slik at timene ikke
   * lenger er personidentifiserbare.
   */
  app.delete("/api/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const authed = authedUser(req);
      const userId = coerceId(authed?.id);
      if (userId == null) return res.status(401).json({ error: "Ikke innlogget" });

      const confirm = String(req.body?.confirm ?? "").toUpperCase();
      if (confirm !== "SLETT") {
        return res.status(400).json({
          error: "Bekreftelse kreves",
          hint: "Send body { \"confirm\": \"SLETT\" } for å gjennomføre sletting.",
        });
      }

      const [existing] = await db.select().from(users).where(eq(users.id, userId as any)).limit(1);
      if (!existing) return res.status(404).json({ error: "Bruker ikke funnet" });

      const anonymousEmail = `deleted-${userId}@anonymized.local`;
      const deletionTime = new Date();

      // 1. Anonymise users row (keep id FK-intact for audit trail)
      await db
        .update(users)
        .set({
          email: anonymousEmail,
          firstName: "Slettet",
          lastName: "bruker",
          password: null as any,
          phone: null as any,
          updatedAt: deletionTime,
          approved: false,
        } as any)
        .where(eq(users.id, userId as any));

      // 2. Delete personal soft data (drafts, notifications, goal categories)
      //    These are personal prefs, no retention requirement.
      await Promise.all([
        db.delete(userDrafts).where(eq(userDrafts.userId, userId as any)),
        db.delete(userGoalCategories).where(eq(userGoalCategories.userId, userId as any)),
        db.delete(notifications).where(eq(notifications.recipientId, String(userId))),
        db.delete(timerSessions).where(eq(timerSessions.userId, userId as any)),
      ]);

      // 3. Log the deletion in audit-log if rapport_audit_log table exists
      try {
        await db.insert(rapportAuditLog).values({
          rapportId: null as any,
          userId: userId as any,
          action: "gdpr_user_anonymized",
          details: {
            reason: "Article 17 request by user",
            anonymizedAt: deletionTime.toISOString(),
            retainedForRetention: ["log_row", "rapporter", "leave_requests", "overtime_entries"],
          } as any,
          createdAt: deletionTime,
        } as any);
      } catch (auditErr) {
        // Non-fatal — audit log may have different schema
        console.warn("Could not write GDPR audit entry:", auditErr);
      }

      // 4. Kill session so the anonymised user can't continue using the app
      (req as any).session?.destroy?.(() => {});
      res.clearCookie("connect.sid");

      res.json({
        ok: true,
        message: "Kontoen din er anonymisert. Takk for at du brukte Tidum.",
        retained: {
          reason: "Bokføringsloven § 13 krever oppbevaring av timebilag i 5 år fra regnskapsårets utløp.",
          scope: ["timeregistreringer", "rapporter", "fraværssøknader", "overtidsregistreringer"],
          slettefrist: `31.12.${new Date().getFullYear() + 5}`,
        },
      });
    } catch (e: any) {
      console.error("GDPR delete failed:", e);
      res.status(500).json({ error: e.message });
    }
  });
}
