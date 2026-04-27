import type { Express, Request, Response } from "express";
import { eq, asc, desc, and, ne } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "../db";
import {
  pricingTiers,
  pricingInclusions,
  pricingTierInclusions,
  salgSettings,
  salesRoutingRules,
  salesScriptBlocks,
  salgContractTemplates,
  leadPipelineStages,
  accessRequests,
  salgEmailTemplates,
} from "@shared/schema";
import { requireSuperAdmin } from "../custom-auth";
import { publicReadRateLimit } from "../rate-limit";
import {
  computeQuote,
  loadActiveTiersWithInclusions,
  loadPricingSettings,
  loadSalgSettings,
} from "../lib/pricing-service";
import { renderContract } from "../lib/contract-renderer";
import { renderContractPdf } from "../lib/contract-pdf";

const upsertTierSchema = z.object({
  slug: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  minUsers: z.number().int().min(1),
  maxUsers: z.number().int().nullable().optional(),
  pricePerUserOre: z.number().int().min(0),
  onboardingOre: z.number().int().min(0).default(0),
  bindingMonths: z.number().int().min(0).default(12),
  isEnterprise: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  description: z.string().nullable().optional(),
  inclusionIds: z.array(z.number().int()).optional(),
});

const upsertInclusionSchema = z.object({
  slug: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const upsertRoutingSchema = z.object({
  minUsers: z.number().int().min(0),
  maxUsers: z.number().int().nullable().optional(),
  assigneeLabel: z.string().min(1).max(80),
  assigneeEmail: z.string().email().nullable().optional().or(z.literal("")),
  responseTimeHours: z.number().int().min(1).default(24),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const upsertScriptSchema = z.object({
  slug: z.string().min(1).max(64),
  category: z.enum(["discovery", "demo", "close", "objection"]),
  title: z.string().min(1).max(200),
  bodyMd: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const upsertContractSchema = z.object({
  name: z.string().min(1).max(200),
  version: z.number().int().min(1).default(1),
  bodyMd: z.string().min(1),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const upsertStageSchema = z.object({
  slug: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  probabilityPct: z.number().int().min(0).max(100).default(0),
  isTerminal: z.boolean().default(false),
  isWon: z.boolean().default(false),
  sortOrder: z.number().int(),
  isActive: z.boolean().default(true),
});

const upsertEmailTemplateSchema = z.object({
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  subject: z.string().min(1).max(500),
  badge: z.string().min(1).max(80).default("Tidum"),
  title: z.string().min(1).max(200),
  intro: z.string().min(1),
  bodyMd: z.string().min(1),
  ctaLabel: z.string().nullable().optional(),
  ctaUrl: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

const updateLeadSchema = z.object({
  pipelineStageId: z.number().int().nullable().optional(),
  assignedToEmail: z.string().email().nullable().optional().or(z.literal("")),
  assignedToLabel: z.string().nullable().optional(),
  expectedCloseDate: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  userCountEstimate: z.number().int().min(0).nullable().optional(),
});

const updateSettingSchema = z.object({
  value: z.string().nullable(),
});

export function registerPricingRoutes(app: Express): void {
  // ============================================================
  // PUBLIC API
  // ============================================================

  app.get("/api/pricing/tiers", publicReadRateLimit, async (_req: Request, res: Response) => {
    try {
      const [tiers, settings] = await Promise.all([
        loadActiveTiersWithInclusions(),
        loadPricingSettings(),
      ]);
      res.json({ tiers, settings });
    } catch (err: any) {
      console.error("GET /api/pricing/tiers error:", err);
      res.status(500).json({ error: "Could not load pricing" });
    }
  });

  app.post("/api/pricing/quote", publicReadRateLimit, async (req: Request, res: Response) => {
    try {
      const userCount = Number(req.body?.userCount ?? req.body?.user_count ?? 0);
      if (!Number.isFinite(userCount) || userCount < 0 || userCount > 10000) {
        return res.status(400).json({ error: "Invalid userCount" });
      }
      const quote = await computeQuote(userCount);
      res.json(quote);
    } catch (err: any) {
      console.error("POST /api/pricing/quote error:", err);
      res.status(500).json({ error: "Could not compute quote" });
    }
  });

  // ============================================================
  // ADMIN API — pricing tiers
  // ============================================================

  app.get("/api/admin/pricing/tiers", requireSuperAdmin, async (_req, res) => {
    try {
      const tiers = await db
        .select()
        .from(pricingTiers)
        .orderBy(asc(pricingTiers.sortOrder), asc(pricingTiers.minUsers));
      const links = await db.select().from(pricingTierInclusions);
      const byTier = new Map<number, number[]>();
      for (const link of links) {
        if (!byTier.has(link.tierId)) byTier.set(link.tierId, []);
        byTier.get(link.tierId)!.push(link.inclusionId);
      }
      res.json(
        tiers.map((t) => ({ ...t, inclusionIds: byTier.get(t.id) || [] })),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/pricing/tiers", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertTierSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const { inclusionIds, ...row } = parsed.data;
      const [created] = await db.insert(pricingTiers).values(row).returning();
      if (inclusionIds && inclusionIds.length) {
        await db.insert(pricingTierInclusions).values(
          inclusionIds.map((inclusionId) => ({ tierId: created.id, inclusionId })),
        );
      }
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/pricing/tiers/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const parsed = upsertTierSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const { inclusionIds, ...row } = parsed.data;
      const [updated] = await db
        .update(pricingTiers)
        .set({ ...row, updatedAt: new Date() })
        .where(eq(pricingTiers.id, id))
        .returning();
      if (inclusionIds) {
        await db.delete(pricingTierInclusions).where(eq(pricingTierInclusions.tierId, id));
        if (inclusionIds.length) {
          await db.insert(pricingTierInclusions).values(
            inclusionIds.map((inclusionId) => ({ tierId: id, inclusionId })),
          );
        }
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/pricing/tiers/:id", requireSuperAdmin, async (req, res) => {
    try {
      await db.delete(pricingTiers).where(eq(pricingTiers.id, Number(req.params.id)));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // ADMIN API — pricing inclusions
  // ============================================================

  app.get("/api/admin/pricing/inclusions", requireSuperAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(pricingInclusions)
        .orderBy(asc(pricingInclusions.sortOrder));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/pricing/inclusions", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertInclusionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [created] = await db.insert(pricingInclusions).values(parsed.data).returning();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/pricing/inclusions/:id", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertInclusionSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [updated] = await db
        .update(pricingInclusions)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(pricingInclusions.id, Number(req.params.id)))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/pricing/inclusions/:id", requireSuperAdmin, async (req, res) => {
    try {
      await db.delete(pricingInclusions).where(eq(pricingInclusions.id, Number(req.params.id)));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // ADMIN API — app_settings (key/value)
  // ============================================================

  app.get("/api/admin/settings", requireSuperAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(salgSettings)
        .orderBy(asc(salgSettings.category), asc(salgSettings.sortOrder));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/settings/:key", requireSuperAdmin, async (req: any, res) => {
    try {
      const parsed = updateSettingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const userId = req.user?.id || null;
      const [updated] = await db
        .update(salgSettings)
        .set({ value: parsed.data.value, updatedAt: new Date(), updatedBy: userId })
        .where(eq(salgSettings.key, req.params.key))
        .returning();
      if (!updated) return res.status(404).json({ error: "Setting not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // ADMIN API — sales routing rules
  // ============================================================

  app.get("/api/admin/sales/routing", requireSuperAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(salesRoutingRules)
        .orderBy(asc(salesRoutingRules.sortOrder), asc(salesRoutingRules.minUsers));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/sales/routing", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertRoutingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const data = { ...parsed.data, assigneeEmail: parsed.data.assigneeEmail || null };
      const [created] = await db.insert(salesRoutingRules).values(data).returning();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/sales/routing/:id", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertRoutingSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const data: any = { ...parsed.data, updatedAt: new Date() };
      if (parsed.data.assigneeEmail === "") data.assigneeEmail = null;
      const [updated] = await db
        .update(salesRoutingRules)
        .set(data)
        .where(eq(salesRoutingRules.id, Number(req.params.id)))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/sales/routing/:id", requireSuperAdmin, async (req, res) => {
    try {
      await db.delete(salesRoutingRules).where(eq(salesRoutingRules.id, Number(req.params.id)));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // ADMIN API — sales script blocks
  // ============================================================

  app.get("/api/admin/sales/scripts", requireSuperAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(salesScriptBlocks)
        .orderBy(asc(salesScriptBlocks.category), asc(salesScriptBlocks.sortOrder));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/sales/scripts", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertScriptSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [created] = await db.insert(salesScriptBlocks).values(parsed.data).returning();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/sales/scripts/:id", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertScriptSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [updated] = await db
        .update(salesScriptBlocks)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(salesScriptBlocks.id, Number(req.params.id)))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/sales/scripts/:id", requireSuperAdmin, async (req, res) => {
    try {
      await db.delete(salesScriptBlocks).where(eq(salesScriptBlocks.id, Number(req.params.id)));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // ADMIN API — contract templates
  // ============================================================

  app.get("/api/admin/contracts/templates", requireSuperAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(salgContractTemplates)
        .orderBy(desc(salgContractTemplates.isDefault), desc(salgContractTemplates.updatedAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/contracts/templates", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertContractSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      // Only one default at a time
      if (parsed.data.isDefault) {
        await db.update(salgContractTemplates).set({ isDefault: false });
      }
      const [created] = await db.insert(salgContractTemplates).values(parsed.data).returning();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/contracts/templates/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const parsed = upsertContractSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      if (parsed.data.isDefault === true) {
        await db
          .update(salgContractTemplates)
          .set({ isDefault: false })
          .where(ne(salgContractTemplates.id, id));
      }
      const [updated] = await db
        .update(salgContractTemplates)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(salgContractTemplates.id, id))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/contracts/templates/:id", requireSuperAdmin, async (req, res) => {
    try {
      await db.delete(salgContractTemplates).where(eq(salgContractTemplates.id, Number(req.params.id)));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Preview contract render with synthetic lead data (so admin can iterate
  // on the template without creating a fake lead first)
  app.post("/api/admin/contracts/templates/:id/preview", requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [template] = await db
        .select()
        .from(salgContractTemplates)
        .where(eq(salgContractTemplates.id, id))
        .limit(1);
      if (!template) return res.status(404).json({ error: "Template not found" });
      const userCount = Number(req.body?.userCount ?? 30);
      const customer = {
        name: req.body?.customerName || "[Kunde AS]",
        orgNumber: req.body?.customerOrgNr || "[XXX XXX XXX]",
      };
      const rendered = await renderContract({
        template,
        userCount,
        customer,
      });
      res.json({ rendered });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // ADMIN API — e-postmaler
  // ============================================================

  app.get("/api/admin/email-templates", requireSuperAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(salgEmailTemplates)
        .orderBy(asc(salgEmailTemplates.slug));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/email-templates", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertEmailTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [created] = await db.insert(salgEmailTemplates).values(parsed.data).returning();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/email-templates/:id", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertEmailTemplateSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [updated] = await db
        .update(salgEmailTemplates)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(salgEmailTemplates.id, Number(req.params.id)))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/email-templates/:id", requireSuperAdmin, async (req, res) => {
    try {
      await db.delete(salgEmailTemplates).where(eq(salgEmailTemplates.id, Number(req.params.id)));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // ADMIN API — pipeline stages
  // ============================================================

  app.get("/api/admin/sales/pipeline", requireSuperAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(leadPipelineStages)
        .orderBy(asc(leadPipelineStages.sortOrder));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/sales/pipeline", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertStageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [created] = await db.insert(leadPipelineStages).values(parsed.data).returning();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/sales/pipeline/:id", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = upsertStageSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [updated] = await db
        .update(leadPipelineStages)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(leadPipelineStages.id, Number(req.params.id)))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/sales/pipeline/:id", requireSuperAdmin, async (req, res) => {
    try {
      await db.delete(leadPipelineStages).where(eq(leadPipelineStages.id, Number(req.params.id)));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // ADMIN API — leads (extends access_requests with pipeline view)
  // ============================================================

  app.get("/api/admin/leads", requireSuperAdmin, async (req, res) => {
    try {
      const stageSlug = req.query.stage as string | undefined;
      const assignee = req.query.assignee as string | undefined;

      // Include tier + stage labels via SQL join for the pipeline view
      const sql = `
        SELECT
          ar.*,
          pt.label                 AS tier_label,
          pt.slug                  AS tier_slug,
          pt.price_per_user_ore    AS tier_price_ore,
          pt.onboarding_ore        AS tier_onboarding_ore,
          lps.label                AS stage_label,
          lps.slug                 AS stage_slug,
          lps.probability_pct      AS stage_probability_pct,
          lps.is_terminal          AS stage_is_terminal,
          lps.is_won               AS stage_is_won
        FROM access_requests ar
        LEFT JOIN pricing_tiers       pt  ON pt.id  = ar.tier_snapshot_id
        LEFT JOIN lead_pipeline_stages lps ON lps.id = ar.pipeline_stage_id
        WHERE ($1::text IS NULL OR lps.slug = $1)
          AND ($2::text IS NULL OR ar.assigned_to_email = $2)
        ORDER BY ar.created_at DESC
        LIMIT 500
      `;
      const { rows } = await pool.query(sql, [
        stageSlug || null,
        assignee || null,
      ]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/leads/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const sql = `
        SELECT
          ar.*,
          pt.label                 AS tier_label,
          pt.slug                  AS tier_slug,
          pt.price_per_user_ore    AS tier_price_ore,
          pt.onboarding_ore        AS tier_onboarding_ore,
          lps.label                AS stage_label,
          lps.slug                 AS stage_slug,
          lps.probability_pct      AS stage_probability_pct
        FROM access_requests ar
        LEFT JOIN pricing_tiers       pt  ON pt.id  = ar.tier_snapshot_id
        LEFT JOIN lead_pipeline_stages lps ON lps.id = ar.pipeline_stage_id
        WHERE ar.id = $1
        LIMIT 1
      `;
      const { rows } = await pool.query(sql, [id]);
      if (rows.length === 0) return res.status(404).json({ error: "Lead not found" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/leads/:id", requireSuperAdmin, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const parsed = updateLeadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const data: any = { ...parsed.data, updatedAt: new Date() };
      if (parsed.data.assignedToEmail === "") data.assignedToEmail = null;

      // Detect stage transition to log a revenue_events row.
      // Won → 'signup' event with full ARR snapshot.
      // Churn (terminal but !won, after a previous won) → 'churn' event.
      let stageChange: { newStageId: number | null; oldStageId: number | null } | null = null;
      if (parsed.data.pipelineStageId !== undefined) {
        const [before] = await db
          .select({ pipelineStageId: accessRequests.pipelineStageId })
          .from(accessRequests)
          .where(eq(accessRequests.id, id))
          .limit(1);
        stageChange = {
          newStageId: parsed.data.pipelineStageId ?? null,
          oldStageId: before?.pipelineStageId ?? null,
        };
      }

      const [updated] = await db
        .update(accessRequests)
        .set(data)
        .where(eq(accessRequests.id, id))
        .returning();

      // Emit revenue_event if stage changed to a "won" stage and we have
      // enough data (tier snapshot + user count) to compute MRR.
      if (stageChange && stageChange.newStageId && stageChange.newStageId !== stageChange.oldStageId) {
        try {
          await pool.query(
            `INSERT INTO revenue_events (
              lead_id, customer_email, customer_company, event_type,
              delta_mrr_ore, mrr_after_ore, tier_id,
              source, utm_source, utm_medium, utm_campaign, occurred_at, created_by
            )
            SELECT
              ar.id, ar.email, ar.company,
              CASE WHEN lps.is_won THEN 'signup' ELSE 'churn' END,
              CASE WHEN lps.is_won THEN (pt.price_per_user_ore::bigint * COALESCE(ar.user_count_estimate, 0))
                   ELSE -(pt.price_per_user_ore::bigint * COALESCE(ar.user_count_estimate, 0))
              END,
              CASE WHEN lps.is_won THEN (pt.price_per_user_ore::bigint * COALESCE(ar.user_count_estimate, 0))
                   ELSE 0
              END,
              ar.tier_snapshot_id,
              ar.source, ar.utm_source, ar.utm_medium, ar.utm_campaign,
              NOW(), $2
            FROM access_requests ar
            LEFT JOIN pricing_tiers pt ON pt.id = ar.tier_snapshot_id
            LEFT JOIN lead_pipeline_stages lps ON lps.id = ar.pipeline_stage_id
            WHERE ar.id = $1
              AND lps.is_terminal IS TRUE
              AND pt.id IS NOT NULL
              AND pt.is_enterprise IS NOT TRUE
              AND ar.user_count_estimate IS NOT NULL`,
            [id, req.user?.id || null],
          );
          if (parsed.data.pipelineStageId) {
            // Mark signed_at on first won transition
            await pool.query(
              `UPDATE access_requests
                 SET signed_at = COALESCE(signed_at,
                   CASE WHEN EXISTS (
                     SELECT 1 FROM lead_pipeline_stages
                     WHERE id = $2 AND is_won IS TRUE
                   ) THEN NOW() ELSE signed_at END
                 )
               WHERE id = $1`,
              [id, parsed.data.pipelineStageId],
            );
          }
        } catch (err) {
          console.error("revenue_event log failed (non-fatal):", err);
        }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate contract (rendered from default template + lead snapshot)
  app.post("/api/admin/leads/:id/generate-contract", requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [lead] = await db
        .select()
        .from(accessRequests)
        .where(eq(accessRequests.id, id))
        .limit(1);
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const templateId = req.body?.templateId
        ? Number(req.body.templateId)
        : null;
      let template;
      if (templateId) {
        const [t] = await db
          .select()
          .from(salgContractTemplates)
          .where(eq(salgContractTemplates.id, templateId))
          .limit(1);
        template = t;
      } else {
        const [t] = await db
          .select()
          .from(salgContractTemplates)
          .where(and(eq(salgContractTemplates.isDefault, true), eq(salgContractTemplates.isActive, true)))
          .limit(1);
        template = t;
      }
      if (!template) return res.status(404).json({ error: "No contract template available" });

      const userCount =
        lead.userCountEstimate || Number(req.body?.userCount) || 30;
      const rendered = await renderContract({
        template,
        userCount,
        customer: {
          name: lead.company || lead.fullName,
          orgNumber: lead.orgNumber || "",
        },
      });
      res.json({ rendered, templateId: template.id, templateName: template.name });
    } catch (err: any) {
      console.error("generate-contract error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // PDF-versjon av samme kontrakt — for nedlasting / signering
  app.get("/api/admin/leads/:id/contract.pdf", requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [lead] = await db
        .select()
        .from(accessRequests)
        .where(eq(accessRequests.id, id))
        .limit(1);
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const templateId = req.query.templateId ? Number(req.query.templateId) : null;
      const [template] = templateId
        ? await db.select().from(salgContractTemplates)
            .where(eq(salgContractTemplates.id, templateId)).limit(1)
        : await db.select().from(salgContractTemplates)
            .where(and(eq(salgContractTemplates.isDefault, true), eq(salgContractTemplates.isActive, true)))
            .limit(1);
      if (!template) return res.status(404).json({ error: "No contract template available" });

      const userCount = lead.userCountEstimate || Number(req.query.userCount) || 30;
      const customerName = lead.company || lead.fullName;
      const pdf = await renderContractPdf({
        template,
        userCount,
        customer: { name: customerName, orgNumber: lead.orgNumber || "" },
      });

      const safeName = customerName.replace(/[^\w\d_-]+/g, "-").slice(0, 50) || "kontrakt";
      const filename = `Tidum-avtale-${safeName}-${id}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(pdf.length));
      res.send(pdf);
    } catch (err: any) {
      console.error("contract-pdf error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ARR pipeline summary (sum of weighted leads by stage)
  app.get("/api/admin/leads/pipeline-summary", requireSuperAdmin, async (_req, res) => {
    try {
      const sql = `
        SELECT
          lps.slug                 AS stage_slug,
          lps.label                AS stage_label,
          lps.probability_pct      AS probability_pct,
          lps.sort_order           AS sort_order,
          COUNT(ar.id)             AS lead_count,
          COALESCE(SUM(
            CASE
              WHEN pt.id IS NULL OR pt.is_enterprise THEN 0
              ELSE (pt.price_per_user_ore::bigint
                    * COALESCE(ar.user_count_estimate, 0)
                    * 12) / 100
            END
          ), 0)                    AS weighted_arr_kr_unweighted,
          COALESCE(SUM(
            CASE
              WHEN pt.id IS NULL OR pt.is_enterprise THEN 0
              ELSE (pt.price_per_user_ore::bigint
                    * COALESCE(ar.user_count_estimate, 0)
                    * 12 * lps.probability_pct) / 10000
            END
          ), 0)                    AS weighted_arr_kr
        FROM lead_pipeline_stages lps
        LEFT JOIN access_requests ar ON ar.pipeline_stage_id = lps.id
        LEFT JOIN pricing_tiers   pt ON pt.id = ar.tier_snapshot_id
        WHERE lps.is_active = TRUE
        GROUP BY lps.slug, lps.label, lps.probability_pct, lps.sort_order
        ORDER BY lps.sort_order
      `;
      const { rows } = await pool.query(sql);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
