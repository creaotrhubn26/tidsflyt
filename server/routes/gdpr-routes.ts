/**
 * server/routes/gdpr-routes.ts
 *
 * GDPR + Personopplysningsloven (2018) endpoints. Tilpasset Datatilsynets
 * veiledning og norske særregler:
 *
 *   - Personopplysningsloven (2018) §1 implementerer GDPR + nasjonale tillegg
 *   - Datatilsynet er tilsynsmyndighet (datatilsynet.no)
 *   - GPS-sporing av ansatte regnes som "kontrolltiltak" etter Arbeidsmiljøloven
 *     §9-1 — krever saklig grunn, drøfting med ansatte, skriftlig informasjon,
 *     og forholdsmessighet. Samtykke alene er IKKE gyldig rettsgrunnlag i
 *     arbeidsforhold (Datatilsynet).
 *   - Bokføringsloven §13 krever 5 års oppbevaring av timebilag → vi sletter
 *     ikke tidum_log_row, vi anonymiserer brukeren rundt dem.
 *   - Barnevernsloven §10 har egne journal- og oppbevarings-regler for
 *     barnevernsdata; følges via per-vendor retensjons-overrides.
 *
 * Endpoints:
 *
 *   Bruker-selv (Art. 15 + 17):
 *     GET    /api/me/export                 — last ned all data om meg
 *     DELETE /api/me                        — anonymiser min konto
 *
 *   Admin/super_admin (på vegne av bruker):
 *     POST   /api/admin/users/:id/erase     — full pseudonymisering + filsletting
 *     GET    /api/admin/users/:id/data-export — Art. 20 portabilitet
 *     POST   /api/gdpr/purge/run            — manuell trigger av retensjons-cron
 *
 *   Cron: daglig 02:00 → coords-blurring + sletting av aldrede tidum_travel_legs,
 *   audit-rader og tidum_leave_attachments.
 */

import type { Express, Request, Response } from "express";
import cron from "node-cron";
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
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireSuperAdmin, requireVendorDataAdmin } from "../custom-auth";
import { runGdprPurge, eraseUser, exportUserData, RETENTION_POLICY_POLICY, GDPR_DEFAULTS } from "../lib/gdpr";
import {
  userBelongsToVendorDataScope,
  type FreshAdminActor,
} from "../lib/global-admin-authorization";

type GdprRequest = Request & { freshVendorActor?: FreshAdminActor };

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

function requestedUserId(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value && value.length <= 255 ? value : null;
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

      const filename = `tidum-mine-data-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(JSON.stringify(exportBundle, null, 2));
    } catch (error) {
      console.error("GDPR export failed:", error);
      res.status(500).json({ error: "Kunne ikke eksportere brukerdata" });
    }
  });

  /**
   * DELETE /api/me
   * GDPR art. 17 — right to erasure. Anonymises the user while preserving
   * referential integrity for audit/bookkeeping purposes. Requires explicit
   * confirmation via body { confirm: "SLETT" } to prevent accidental calls.
   *
   * Note: bokføringslovens 5-år regel overstyrer GDPR for timebilag. Vi sletter
   * derfor IKKE tidum_log_row-data, men anonymiserer profilen slik at timene ikke
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

      await eraseUser(
        String(userId),
        String(authed?.id ?? userId),
        "Egenbekreftet forespørsel via /api/me",
      );

      // eraseUser handles auth material, attachments, drafts, settings and
      // canonical pseudonymization. Remove the remaining preference tables.
      await Promise.all([
        db.delete(userGoalCategories).where(eq(userGoalCategories.userId, userId as any)),
        db.delete(notifications).where(eq(notifications.recipientId, String(userId))),
      ]);

      // Kill the current in-memory session too; eraseUser removed persisted
      // sessions before the response was produced.
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
    } catch (error) {
      console.error("GDPR delete failed:", error);
      res.status(500).json({ error: "Kunne ikke behandle sletteforespørselen" });
    }
  });

  // ── Admin / super_admin: act on behalf of a user ───────────────────────────

  /**
   * POST /api/admin/users/:id/erase
   *
   * Pseudonymisering på tvers av tabeller (tidum_log_row, tidum_travel_legs, audit,
   * tidum_leave_requests, tidum_leave_attachments, tidum_timer_sessions, tidum_user_settings,
   * tidum_poweroffice_employee_mappings). Sletter også vedleggsfiler fra disk.
   *
   * Kun super_admin — handlingen er irreversibel og skal være initiert av
   * dokumentert brukerforespørsel etter Art. 17.
   *
   * Body: { confirm: true, reason: string }
   */
  app.post('/api/admin/users/:id/erase', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      if (req.body?.confirm !== true) {
        return res.status(400).json({
          error: 'Manglende bekreftelse',
          hint: 'Send { "confirm": true, "reason": "…" } for å gjennomføre.',
        });
      }
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (reason.length < 10 || reason.length > 2_000) {
        return res.status(400).json({ error: "Dokumentert begrunnelse på 10–2000 tegn kreves" });
      }
      const userId = requestedUserId(req.params.id);
      if (!userId) return res.status(400).json({ error: 'Manglende user-id' });
      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId as any)).limit(1);
      if (!target) return res.status(404).json({ error: "Bruker ikke funnet" });
      const result = await eraseUser(userId, String(authedUser(req)?.id ?? "system"), reason);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('GDPR admin erase failed:', error);
      res.status(500).json({ error: "Kunne ikke gjennomføre sletting" });
    }
  });

  /**
   * GET /api/admin/users/:id/data-export
   *
   * Art. 20 — admin/tiltaksleder eksporterer på vegne av en bruker.
   * Returnerer JSON som vedlegg.
   */
  app.get('/api/admin/users/:id/data-export', requireAuth, requireVendorDataAdmin, async (req: GdprRequest, res: Response) => {
    try {
      const userId = requestedUserId(req.params.id);
      if (!userId) return res.status(400).json({ error: "Ugyldig bruker-ID" });
      const actor = req.freshVendorActor;
      if (!actor) return res.status(403).json({ error: "Krever lederrolle i virksomheten" });
      if (!(await userBelongsToVendorDataScope(userId, actor.vendorId!))) {
        return res.status(404).json({ error: "Bruker ikke funnet" });
      }
      const bundle = await exportUserData(userId);
      const filename = `tidum-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(JSON.stringify(bundle, null, 2));
    } catch (error) {
      console.error('GDPR admin export failed:', error);
      res.status(500).json({ error: "Kunne ikke eksportere brukerdata" });
    }
  });

  /**
   * POST /api/gdpr/purge/run
   *
   * Manuell kjøring av oppbevarings-cron'en. Super_admin only.
   * Brukes til testing eller før ekstern revisjon.
   */
  app.post('/api/gdpr/purge/run', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      if (req.body?.confirm !== "PURGE") {
        return res.status(400).json({ error: 'Send { "confirm": "PURGE" } for å kjøre global retensjon' });
      }
      const result = await runGdprPurge();
      res.json({
        ok: true,
        travelLegsCoordsBlurred: result.travelLegsCoordsBlurred,
        travelLegsDeleted: result.travelLegsDeleted,
        auditEntriesDeleted: result.auditEntriesDeleted,
        leaveAttachmentsDeleted: result.leaveAttachmentsDeleted,
        errorCount: result.errors.length,
      });
    } catch (error) {
      console.error('GDPR purge failed:', error);
      res.status(500).json({ error: "Kunne ikke kjøre retensjon" });
    }
  });

  /**
   * GET /api/gdpr/retention-policy
   *
   * Offentlig endepunkt — returnerer Tidums retensjons-policy som strukturert
   * JSON. Brukes til å auto-generere DPA-bilag og holde personvernerklæring
   * synkronisert. Ingen autentisering nødvendig.
   */
  app.get('/api/gdpr/retention-policy', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({
      policy: RETENTION_POLICY_POLICY,
      defaults: GDPR_DEFAULTS,
      authority: {
        name: 'Datatilsynet',
        url: 'https://www.datatilsynet.no',
      },
      sources: [
        { name: 'Personopplysningsloven (2018)', url: 'https://lovdata.no/lov/2018-06-15-38' },
        { name: 'Arbeidsmiljøloven §9-1 (kontrolltiltak)', url: 'https://lovdata.no/lov/2005-06-17-62/§9-1' },
        { name: 'Bokføringsloven §13', url: 'https://lovdata.no/lov/2004-11-19-73/§13' },
        { name: 'Barnevernsloven §10-1', url: 'https://lovdata.no/lov/2021-06-18-97/§10-1' },
      ],
    });
  });
}

// ── Retention cron ───────────────────────────────────────────────────────────

let cronStarted = false;
export function setupGdprCron() {
  if (cronStarted) return;
  // Daily at 02:00 — low-traffic window after midnight rollover
  cron.schedule('0 2 * * *', async () => {
    console.log('🔐 Running GDPR retention purge…');
    try {
      const result = await runGdprPurge();
      console.log(
        `[gdpr] coords-blurred=${result.travelLegsCoordsBlurred} `
        + `travel-deleted=${result.travelLegsDeleted} audit-deleted=${result.auditEntriesDeleted} `
        + `attachments-deleted=${result.leaveAttachmentsDeleted} errors=${result.errors.length}`,
      );
      if (result.errors.length > 0) console.warn('[gdpr] purge errors:', result.errors);
    } catch (e: any) {
      console.error('[gdpr] purge cron failed:', e);
    }
  });
  cronStarted = true;
  console.log('✅ GDPR retention cron scheduled (daily 02:00)');
}
