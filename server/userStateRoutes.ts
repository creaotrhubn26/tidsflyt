/**
 * server/userStateRoutes.ts
 *
 * Endpoints for cross-device user state previously held in localStorage.
 * Add to server/routes.ts:
 *   import { userStateRouter } from "./userStateRoutes";
 *   app.use("/api/user-state", userStateRouter);
 */

import { Router } from "express";
import { db } from "./db";
import { eq, and, lt, sql } from "drizzle-orm";
import {
  userSettings, userGoalCategories, userDrafts,
} from "../shared/schema";

function requireAuth(req: any, res: any, next: any) {
  if (!req.user) return res.status(401).json({ error: "Ikke innlogget" });
  next();
}

export const userStateRouter = Router();

// ── USER SETTINGS (gdpr_auto_replace, onboarding, dashboard prefs) ───────────

userStateRouter.get("/settings", requireAuth, async (req: any, res) => {
  try {
    const userId = String(req.user.id);
    let [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (!row) {
      [row] = await db.insert(userSettings).values({ userId }).returning();
    }
    const prefs = (row.dashboardPrefs ?? {}) as Record<string, any>;
    res.json({
      gdprAutoReplace: row.gdprAutoReplace ?? false,
      onboardingCompleted: row.onboardingCompleted ?? false,
      dashboardPrefs: prefs,
      tourCompleted: !!prefs.tourCompleted,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

userStateRouter.patch("/settings", requireAuth, async (req: any, res) => {
  try {
    const userId = String(req.user.id);
    const allowed: any = {};
    if (typeof req.body.gdprAutoReplace === "boolean") allowed.gdprAutoReplace = req.body.gdprAutoReplace;
    if (typeof req.body.onboardingCompleted === "boolean") allowed.onboardingCompleted = req.body.onboardingCompleted;
    if (req.body.dashboardPrefs && typeof req.body.dashboardPrefs === "object") allowed.dashboardPrefs = req.body.dashboardPrefs;
    // tourCompleted is stored as a key inside dashboardPrefs jsonb (no schema change needed)
    if (typeof req.body.tourCompleted === "boolean") {
      const [existingRow] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);
      const currentPrefs = (existingRow?.dashboardPrefs ?? {}) as Record<string, any>;
      allowed.dashboardPrefs = { ...currentPrefs, tourCompleted: req.body.tourCompleted };
    }
    if (Object.keys(allowed).length === 0) return res.status(400).json({ error: "Ingen gyldige felter" });
    allowed.updatedAt = new Date();

    const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (existing) {
      await db.update(userSettings).set(allowed).where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values({ userId, ...allowed });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── CUSTOM GOAL CATEGORIES ────────────────────────────────────────────────────

userStateRouter.get("/goal-categories", requireAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select()
      .from(userGoalCategories)
      .where(eq(userGoalCategories.userId, req.user.id));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

userStateRouter.post("/goal-categories", requireAuth, async (req: any, res) => {
  try {
    const navn = String(req.body.navn ?? "").trim();
    if (!navn) return res.status(400).json({ error: "Navn er påkrevd" });
    const ikon = req.body.ikon ? String(req.body.ikon) : null;
    try {
      const [row] = await db
        .insert(userGoalCategories)
        .values({ userId: req.user.id, navn, ikon })
        .returning();
      res.json(row);
    } catch (e: any) {
      if (String(e).includes("unique") || String(e).includes("duplicate")) {
        return res.status(409).json({ error: "Kategorien finnes allerede" });
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

userStateRouter.delete("/goal-categories/:id", requireAuth, async (req: any, res) => {
  try {
    await db.delete(userGoalCategories).where(
      and(eq(userGoalCategories.id, req.params.id), eq(userGoalCategories.userId, req.user.id))
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── FORM DRAFTS ───────────────────────────────────────────────────────────────

userStateRouter.get("/drafts/:storageKey", requireAuth, async (req: any, res) => {
  try {
    // Lazy-clean expired drafts for this user
    await db.delete(userDrafts).where(
      and(eq(userDrafts.userId, req.user.id), lt(userDrafts.expiresAt, new Date()))
    );
    const [row] = await db
      .select()
      .from(userDrafts)
      .where(and(eq(userDrafts.userId, req.user.id), eq(userDrafts.storageKey, req.params.storageKey)))
      .limit(1);
    res.json(row ?? null);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

userStateRouter.put("/drafts/:storageKey", requireAuth, async (req: any, res) => {
  try {
    const { payload, editingId, expiresAt } = req.body;
    if (payload === undefined) return res.status(400).json({ error: "payload er påkrevd" });

    const values = {
      userId: req.user.id,
      storageKey: req.params.storageKey,
      payload,
      editingId: editingId ?? null,
      savedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    };

    // Upsert manually since we don't have ON CONFLICT helper here
    const [existing] = await db
      .select()
      .from(userDrafts)
      .where(and(eq(userDrafts.userId, req.user.id), eq(userDrafts.storageKey, req.params.storageKey)))
      .limit(1);

    if (existing) {
      await db.update(userDrafts).set(values).where(eq(userDrafts.id, existing.id));
    } else {
      await db.insert(userDrafts).values(values);
    }
    res.json({ ok: true, savedAt: values.savedAt.toISOString() });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

userStateRouter.delete("/drafts/:storageKey", requireAuth, async (req: any, res) => {
  try {
    await db.delete(userDrafts).where(
      and(eq(userDrafts.userId, req.user.id), eq(userDrafts.storageKey, req.params.storageKey))
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
