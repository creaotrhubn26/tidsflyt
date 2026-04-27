import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireSuperAdmin } from "../custom-auth";

// Helper: parse from/to ISO date params; default to last 90 days.
function getDateRange(req: Request): { from: string; to: string } {
  const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
  const fromDefault = new Date();
  fromDefault.setDate(fromDefault.getDate() - 90);
  const from = (req.query.from as string) || fromDefault.toISOString().slice(0, 10);
  return { from, to };
}

// "ARR-estimat for et lead" SQL fragment used across endpoints.
// Snapshots tier price × estimated user count × 12. Skips Enterprise (no
// price stored) and rows missing data.
const LEAD_ARR_FRAGMENT = `
  CASE
    WHEN pt.id IS NULL OR pt.is_enterprise OR ar.user_count_estimate IS NULL
    THEN 0
    ELSE (pt.price_per_user_ore::bigint * ar.user_count_estimate * 12) / 100
  END
`;

const LEAD_WEIGHTED_ARR_FRAGMENT = `
  CASE
    WHEN pt.id IS NULL OR pt.is_enterprise OR ar.user_count_estimate IS NULL OR lps.id IS NULL
    THEN 0
    ELSE (pt.price_per_user_ore::bigint * ar.user_count_estimate * 12 * lps.probability_pct) / 10000
  END
`;

export function registerAnalyticsRoutes(app: Express): void {
  // ============================================================
  // Summary KPIs (top-row of analytics dashboard)
  // ============================================================
  app.get("/api/admin/analytics/summary", requireSuperAdmin, async (req, res) => {
    try {
      const { from, to } = getDateRange(req);

      const [pipelineResult, revenueResult, customerResult] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(ar.id) AS lead_count,
             COALESCE(SUM(${LEAD_ARR_FRAGMENT}), 0) AS pipeline_arr,
             COALESCE(SUM(${LEAD_WEIGHTED_ARR_FRAGMENT}), 0) AS weighted_arr,
             COALESCE(AVG(NULLIF(${LEAD_ARR_FRAGMENT}, 0)), 0) AS avg_deal_size
           FROM access_requests ar
           LEFT JOIN pricing_tiers pt ON pt.id = ar.tier_snapshot_id
           LEFT JOIN lead_pipeline_stages lps ON lps.id = ar.pipeline_stage_id
           WHERE ar.created_at::date BETWEEN $1 AND $2
             AND (lps.is_terminal IS NOT TRUE OR lps.is_won IS TRUE)`,
          [from, to],
        ),
        pool.query(
          `SELECT
             COALESCE(SUM(mrr_after_ore) FILTER (
               WHERE event_type IN ('signup','upgrade','expansion','reactivation')
             ), 0) -
             COALESCE(SUM(ABS(delta_mrr_ore)) FILTER (
               WHERE event_type IN ('downgrade','churn')
             ), 0) AS net_mrr_ore,
             COALESCE(SUM(delta_mrr_ore), 0) AS new_mrr_ore_in_range
           FROM revenue_events
           WHERE occurred_at::date BETWEEN $1 AND $2`,
          [from, to],
        ),
        pool.query(
          `SELECT COUNT(DISTINCT customer_email) AS active_customers
           FROM revenue_events
           WHERE event_type IN ('signup','upgrade','expansion','reactivation')
             AND customer_email NOT IN (
               SELECT customer_email FROM revenue_events WHERE event_type = 'churn'
             )`,
        ),
      ]);

      const r = pipelineResult.rows[0] ?? {};
      const rev = revenueResult.rows[0] ?? {};
      const cust = customerResult.rows[0] ?? {};

      const netMrrOre = Number(rev.net_mrr_ore || 0);
      const arrFromMrr = (Math.max(0, netMrrOre) * 12) / 100;
      const newMrrInRange = Number(rev.new_mrr_ore_in_range || 0);

      res.json({
        leadCount: Number(r.lead_count || 0),
        pipelineArrKr: Math.round(Number(r.pipeline_arr || 0)),
        weightedArrKr: Math.round(Number(r.weighted_arr || 0)),
        avgDealSizeKr: Math.round(Number(r.avg_deal_size || 0)),
        activeCustomers: Number(cust.active_customers || 0),
        currentArrKr: Math.round(arrFromMrr),
        currentMrrKr: Math.round(Math.max(0, netMrrOre) / 100),
        newMrrInRangeKr: Math.round(newMrrInRange / 100),
        from, to,
      });
    } catch (err: any) {
      console.error("analytics/summary error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // ARR / pipeline grouped BY tier
  // ============================================================
  app.get("/api/admin/analytics/by-tier", requireSuperAdmin, async (req, res) => {
    try {
      const { from, to } = getDateRange(req);
      const { rows } = await pool.query(
        `SELECT
           COALESCE(pt.label, 'Ingen tier')      AS tier_label,
           COALESCE(pt.slug, 'none')             AS tier_slug,
           COUNT(ar.id)                          AS lead_count,
           COALESCE(SUM(${LEAD_ARR_FRAGMENT}), 0) AS pipeline_arr,
           COALESCE(SUM(${LEAD_WEIGHTED_ARR_FRAGMENT}), 0) AS weighted_arr,
           COUNT(ar.id) FILTER (WHERE lps.is_won = TRUE) AS won_count
         FROM access_requests ar
         LEFT JOIN pricing_tiers pt ON pt.id = ar.tier_snapshot_id
         LEFT JOIN lead_pipeline_stages lps ON lps.id = ar.pipeline_stage_id
         WHERE ar.created_at::date BETWEEN $1 AND $2
         GROUP BY pt.id, pt.label, pt.slug, pt.sort_order
         ORDER BY pt.sort_order NULLS LAST`,
        [from, to],
      );
      res.json(rows.map((r: any) => ({
        tierLabel: r.tier_label,
        tierSlug: r.tier_slug,
        leadCount: Number(r.lead_count),
        pipelineArrKr: Math.round(Number(r.pipeline_arr || 0)),
        weightedArrKr: Math.round(Number(r.weighted_arr || 0)),
        wonCount: Number(r.won_count),
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // BY source (utm_source / referrer / direct)
  // ============================================================
  app.get("/api/admin/analytics/by-source", requireSuperAdmin, async (req, res) => {
    try {
      const { from, to } = getDateRange(req);
      const { rows } = await pool.query(
        `SELECT
           COALESCE(NULLIF(ar.utm_source, ''), ar.source, 'direct') AS source,
           COUNT(ar.id) AS lead_count,
           COUNT(ar.id) FILTER (WHERE lps.is_won = TRUE) AS won_count,
           COALESCE(SUM(${LEAD_ARR_FRAGMENT}), 0) AS pipeline_arr,
           COALESCE(SUM(${LEAD_WEIGHTED_ARR_FRAGMENT}), 0) AS weighted_arr
         FROM access_requests ar
         LEFT JOIN pricing_tiers pt ON pt.id = ar.tier_snapshot_id
         LEFT JOIN lead_pipeline_stages lps ON lps.id = ar.pipeline_stage_id
         WHERE ar.created_at::date BETWEEN $1 AND $2
         GROUP BY 1
         ORDER BY weighted_arr DESC NULLS LAST
         LIMIT 20`,
        [from, to],
      );
      res.json(rows.map((r: any) => ({
        source: r.source,
        leadCount: Number(r.lead_count),
        wonCount: Number(r.won_count),
        conversionPct: r.lead_count > 0 ? Math.round((Number(r.won_count) / Number(r.lead_count)) * 100) : 0,
        pipelineArrKr: Math.round(Number(r.pipeline_arr || 0)),
        weightedArrKr: Math.round(Number(r.weighted_arr || 0)),
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // BY institution type
  // ============================================================
  app.get("/api/admin/analytics/by-institution", requireSuperAdmin, async (req, res) => {
    try {
      const { from, to } = getDateRange(req);
      const { rows } = await pool.query(
        `SELECT
           COALESCE(ar.institution_type, 'ukjent') AS institution_type,
           COUNT(ar.id) AS lead_count,
           COUNT(ar.id) FILTER (WHERE lps.is_won = TRUE) AS won_count,
           COALESCE(SUM(${LEAD_ARR_FRAGMENT}), 0) AS pipeline_arr,
           COALESCE(SUM(${LEAD_WEIGHTED_ARR_FRAGMENT}), 0) AS weighted_arr
         FROM access_requests ar
         LEFT JOIN pricing_tiers pt ON pt.id = ar.tier_snapshot_id
         LEFT JOIN lead_pipeline_stages lps ON lps.id = ar.pipeline_stage_id
         WHERE ar.created_at::date BETWEEN $1 AND $2
         GROUP BY 1
         ORDER BY weighted_arr DESC NULLS LAST`,
        [from, to],
      );
      res.json(rows.map((r: any) => ({
        institutionType: r.institution_type,
        leadCount: Number(r.lead_count),
        wonCount: Number(r.won_count),
        pipelineArrKr: Math.round(Number(r.pipeline_arr || 0)),
        weightedArrKr: Math.round(Number(r.weighted_arr || 0)),
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // BY assignee (sales-rep leaderboard)
  // ============================================================
  app.get("/api/admin/analytics/by-assignee", requireSuperAdmin, async (req, res) => {
    try {
      const { from, to } = getDateRange(req);
      const { rows } = await pool.query(
        `SELECT
           COALESCE(ar.assigned_to_label, 'Ingen') AS assignee_label,
           ar.assigned_to_email                    AS assignee_email,
           COUNT(ar.id)                            AS lead_count,
           COUNT(ar.id) FILTER (WHERE lps.is_won = TRUE) AS won_count,
           COALESCE(SUM(${LEAD_ARR_FRAGMENT}), 0)         AS pipeline_arr,
           COALESCE(SUM(${LEAD_WEIGHTED_ARR_FRAGMENT}), 0) AS weighted_arr
         FROM access_requests ar
         LEFT JOIN pricing_tiers pt ON pt.id = ar.tier_snapshot_id
         LEFT JOIN lead_pipeline_stages lps ON lps.id = ar.pipeline_stage_id
         WHERE ar.created_at::date BETWEEN $1 AND $2
         GROUP BY ar.assigned_to_label, ar.assigned_to_email
         ORDER BY weighted_arr DESC NULLS LAST`,
        [from, to],
      );
      res.json(rows.map((r: any) => ({
        assigneeLabel: r.assignee_label,
        assigneeEmail: r.assignee_email,
        leadCount: Number(r.lead_count),
        wonCount: Number(r.won_count),
        pipelineArrKr: Math.round(Number(r.pipeline_arr || 0)),
        weightedArrKr: Math.round(Number(r.weighted_arr || 0)),
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Funnel — count and conversion per stage
  // ============================================================
  app.get("/api/admin/analytics/funnel", requireSuperAdmin, async (req, res) => {
    try {
      const { from, to } = getDateRange(req);
      const { rows } = await pool.query(
        `SELECT
           lps.slug             AS stage_slug,
           lps.label            AS stage_label,
           lps.sort_order       AS sort_order,
           lps.probability_pct  AS probability_pct,
           lps.is_won           AS is_won,
           COUNT(ar.id)         AS lead_count,
           COALESCE(SUM(${LEAD_ARR_FRAGMENT}), 0) AS pipeline_arr
         FROM lead_pipeline_stages lps
         LEFT JOIN access_requests ar
           ON ar.pipeline_stage_id = lps.id
           AND ar.created_at::date BETWEEN $1 AND $2
         LEFT JOIN pricing_tiers pt ON pt.id = ar.tier_snapshot_id
         WHERE lps.is_active = TRUE
         GROUP BY lps.slug, lps.label, lps.sort_order, lps.probability_pct, lps.is_won
         ORDER BY lps.sort_order`,
        [from, to],
      );

      const total = rows.reduce((s: number, r: any) => s + Number(r.lead_count), 0);

      res.json(rows.map((r: any) => ({
        stageSlug: r.stage_slug,
        stageLabel: r.stage_label,
        sortOrder: r.sort_order,
        probabilityPct: Number(r.probability_pct),
        isWon: r.is_won,
        leadCount: Number(r.lead_count),
        pipelineArrKr: Math.round(Number(r.pipeline_arr || 0)),
        sharePct: total > 0 ? Math.round((Number(r.lead_count) / total) * 100) : 0,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // MRR timeline (month-by-month, summed from revenue_events)
  // ============================================================
  app.get("/api/admin/analytics/mrr-timeline", requireSuperAdmin, async (req, res) => {
    try {
      const months = Math.min(60, Math.max(1, Number(req.query.months) || 12));
      const { rows } = await pool.query(
        `WITH months AS (
           SELECT generate_series(
             date_trunc('month', NOW()) - ($1::int - 1) * INTERVAL '1 month',
             date_trunc('month', NOW()),
             INTERVAL '1 month'
           )::date AS month
         )
         SELECT
           m.month,
           COALESCE(SUM(re.delta_mrr_ore) FILTER (
             WHERE re.event_type IN ('signup','upgrade','expansion','reactivation')
           ), 0) / 100 AS new_mrr_kr,
           COALESCE(SUM(ABS(re.delta_mrr_ore)) FILTER (
             WHERE re.event_type IN ('downgrade','churn')
           ), 0) / 100 AS churned_mrr_kr,
           COUNT(DISTINCT re.customer_email) FILTER (
             WHERE re.event_type = 'signup'
           ) AS new_customers,
           COUNT(DISTINCT re.customer_email) FILTER (
             WHERE re.event_type = 'churn'
           ) AS churned_customers
         FROM months m
         LEFT JOIN revenue_events re
           ON date_trunc('month', re.occurred_at)::date = m.month
         GROUP BY m.month
         ORDER BY m.month`,
        [months],
      );

      // Compute cumulative net MRR
      let runningMrrKr = 0;
      const series = rows.map((r: any) => {
        const newK = Number(r.new_mrr_kr || 0);
        const churnK = Number(r.churned_mrr_kr || 0);
        runningMrrKr += newK - churnK;
        return {
          month: r.month,
          newMrrKr: newK,
          churnedMrrKr: churnK,
          netMrrKr: newK - churnK,
          cumulativeMrrKr: Math.max(0, Math.round(runningMrrKr)),
          cumulativeArrKr: Math.max(0, Math.round(runningMrrKr * 12)),
          newCustomers: Number(r.new_customers || 0),
          churnedCustomers: Number(r.churned_customers || 0),
        };
      });
      res.json(series);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Top customers by ARR
  // ============================================================
  app.get("/api/admin/analytics/top-customers", requireSuperAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT
           customer_email,
           MAX(customer_company)               AS customer_company,
           MAX(mrr_after_ore)                  AS current_mrr_ore,
           SUM(delta_mrr_ore)                  AS net_mrr_ore,
           MIN(occurred_at) FILTER (WHERE event_type = 'signup') AS signup_at,
           MAX(occurred_at)                    AS last_event_at,
           COUNT(*)                            AS event_count,
           BOOL_OR(event_type = 'churn')       AS is_churned
         FROM revenue_events
         GROUP BY customer_email
         ORDER BY current_mrr_ore DESC NULLS LAST
         LIMIT 50`,
      );
      res.json(rows.map((r: any) => ({
        customerEmail: r.customer_email,
        customerCompany: r.customer_company,
        currentMrrKr: Math.round(Number(r.current_mrr_ore || 0) / 100),
        currentArrKr: Math.round((Number(r.current_mrr_ore || 0) * 12) / 100),
        signupAt: r.signup_at,
        lastEventAt: r.last_event_at,
        eventCount: Number(r.event_count),
        isChurned: r.is_churned,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // CSV export
  // ============================================================
  app.get("/api/admin/analytics/export.csv", requireSuperAdmin, async (req, res) => {
    try {
      const { from, to } = getDateRange(req);
      const { rows } = await pool.query(
        `SELECT
           ar.id, ar.created_at, ar.full_name, ar.email, ar.company, ar.org_number,
           ar.institution_type, ar.user_count_estimate,
           pt.label AS tier_label, pt.price_per_user_ore,
           lps.label AS stage_label, lps.probability_pct,
           ar.assigned_to_label, ar.assigned_to_email,
           ar.source, ar.utm_source, ar.utm_medium, ar.utm_campaign, ar.referrer,
           ${LEAD_ARR_FRAGMENT} AS arr_kr,
           ${LEAD_WEIGHTED_ARR_FRAGMENT} AS weighted_arr_kr
         FROM access_requests ar
         LEFT JOIN pricing_tiers pt ON pt.id = ar.tier_snapshot_id
         LEFT JOIN lead_pipeline_stages lps ON lps.id = ar.pipeline_stage_id
         WHERE ar.created_at::date BETWEEN $1 AND $2
         ORDER BY ar.created_at DESC`,
        [from, to],
      );

      const headers = [
        "id","created_at","full_name","email","company","org_number","institution_type",
        "user_count","tier","price_per_user_ore","stage","probability_pct",
        "assignee","assignee_email","source","utm_source","utm_medium","utm_campaign",
        "referrer","arr_kr","weighted_arr_kr",
      ];
      const escape = (v: unknown): string => {
        if (v == null) return "";
        const s = String(v);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const csv = [headers.join(",")];
      for (const r of rows) {
        csv.push([
          r.id, r.created_at, r.full_name, r.email, r.company, r.org_number,
          r.institution_type, r.user_count_estimate, r.tier_label, r.price_per_user_ore,
          r.stage_label, r.probability_pct, r.assigned_to_label, r.assigned_to_email,
          r.source, r.utm_source, r.utm_medium, r.utm_campaign, r.referrer,
          r.arr_kr, r.weighted_arr_kr,
        ].map(escape).join(","));
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="leads_${from}_${to}.csv"`);
      res.send(csv.join("\n"));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
