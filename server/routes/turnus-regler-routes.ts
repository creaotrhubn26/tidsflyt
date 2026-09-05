import type { Express, Request, Response } from "express";
import type { PoolClient } from "pg";
import { withTurnusOrgRlsContext } from "../lib/database-rls-context";
import { requireTurnusActor } from "./turnus-actor";

// table is always a fixed literal string passed by callers below, never req.body — no SQL-injection surface.
async function ownsRow(client: PoolClient, table: string, id: number, orgId: number): Promise<boolean> {
  const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE id = $1 AND org_id = $2`, [id, orgId]);
  return rows.length > 0;
}

export function registerTurnusReglerRoutes(app: Express): void {
  app.get("/api/turnus/regler", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          // DATE-kolonner castes til text: uten cast blir de JS Date og
          // serialiseres til UTC, så 2026-01-01 vises som 2025-12-31 i +01:00.
          `SELECT *, gyldig_fra::text AS gyldig_fra, gyldig_til::text AS gyldig_til
             FROM tidum_turnus_regler WHERE org_id = $1 AND aktiv ORDER BY created_at DESC`,
          [actor.orgId])).rows);
      res.json(rows);
    } catch (err) {
      console.error("[turnus-regler] list regler feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/regler", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const body = req.body ?? {};
    if (!body.regeltype || typeof body.regeltype !== "string") {
      return res.status(400).json({ error: "regeltype kreves." });
    }
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
        if (body.avdelingId != null && !(await ownsRow(client, "tidum_turnus_avdelinger", body.avdelingId, actor.orgId))) {
          return "unknown_avdeling" as const;
        }
        if (body.ansattId != null && !(await ownsRow(client, "tidum_turnus_ansatte", body.ansattId, actor.orgId))) {
          return "unknown_ansatt" as const;
        }
        return (await client.query(
          `INSERT INTO tidum_turnus_regler (org_id, avdeling_id, ansatt_id, regeltype, parametre, haard, vekt, kilde, gyldig_fra, gyldig_til, opprettet_av)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING *, gyldig_fra::text AS gyldig_fra, gyldig_til::text AS gyldig_til`,
          [
            actor.orgId,
            body.avdelingId ?? null,
            body.ansattId ?? null,
            body.regeltype,
            JSON.stringify(body.parametre ?? {}),
            body.haard ?? true,
            body.vekt ?? 0,
            body.kilde ?? "lov",
            body.gyldigFra ?? null,
            body.gyldigTil ?? null,
            actor.userId,
          ])).rows[0];
      });
      if (row === "unknown_avdeling") return res.status(400).json({ error: "Ukjent avdeling." });
      if (row === "unknown_ansatt") return res.status(400).json({ error: "Ukjent ansatt." });
      res.json(row);
    } catch (err) {
      console.error("[turnus-regler] create regel feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.delete("/api/turnus/regler/:id", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `UPDATE tidum_turnus_regler SET aktiv = false WHERE id = $1 AND org_id = $2 RETURNING id`,
          [req.params.id, actor.orgId])).rows[0]);
      if (!row) return res.status(404).json({ error: "Fant ikke regel." });
      res.json(row);
    } catch (err) {
      console.error("[turnus-regler] delete regel feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.get("/api/turnus/onsker", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `SELECT *, dato::text AS dato, periode_fra::text AS periode_fra, periode_til::text AS periode_til
             FROM tidum_turnus_onsker WHERE org_id = $1 ORDER BY created_at DESC`,
          [actor.orgId])).rows);
      res.json(rows);
    } catch (err) {
      console.error("[turnus-regler] list onsker feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/onsker", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const body = req.body ?? {};
    if (typeof body.ansattId !== "number") return res.status(400).json({ error: "ansattId kreves." });
    if (!body.type || typeof body.type !== "string") return res.status(400).json({ error: "type kreves." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
        if (!(await ownsRow(client, "tidum_turnus_ansatte", body.ansattId, actor.orgId))) {
          return "unknown_ansatt" as const;
        }
        if (body.planId != null && !(await ownsRow(client, "tidum_turnus_planer", body.planId, actor.orgId))) {
          return "unknown_plan" as const;
        }
        if (body.vaktkodeId != null && !(await ownsRow(client, "tidum_turnus_vaktkoder", body.vaktkodeId, actor.orgId))) {
          return "unknown_vaktkode" as const;
        }
        return (await client.query(
          `INSERT INTO tidum_turnus_onsker (org_id, ansatt_id, plan_id, type, dato, ukedag, periode_fra, periode_til, vaktkode_id, prioritet, begrunnelse)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING *, dato::text AS dato, periode_fra::text AS periode_fra, periode_til::text AS periode_til`,
          [
            actor.orgId,
            body.ansattId,
            body.planId ?? null,
            body.type,
            body.dato ?? null,
            body.ukedag ?? null,
            body.periodeFra ?? null,
            body.periodeTil ?? null,
            body.vaktkodeId ?? null,
            body.prioritet ?? "bor",
            body.begrunnelse ?? null,
          ])).rows[0];
      });
      if (row === "unknown_ansatt") return res.status(400).json({ error: "Ukjent ansatt." });
      if (row === "unknown_plan") return res.status(400).json({ error: "Ukjent plan." });
      if (row === "unknown_vaktkode") return res.status(400).json({ error: "Ukjent vaktkode." });
      res.json(row);
    } catch (err) {
      console.error("[turnus-regler] create onske feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  // Withdraw a wish. Hard delete (onsker has no aktiv-flag) — org-scoped, so a
  // forged id can never remove another tenant's row.
  app.delete("/api/turnus/onsker/:id", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Ugyldig id." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `DELETE FROM tidum_turnus_onsker WHERE id = $1 AND org_id = $2 RETURNING id`,
          [id, actor.orgId])).rows[0]);
      if (!row) return res.status(404).json({ error: "Fant ikke ønske." });
      res.json(row);
    } catch (err) {
      console.error("[turnus-regler] delete onske feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.get("/api/turnus/prioritering", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `SELECT * FROM tidum_turnus_prioriteringsprofil WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [actor.orgId])).rows[0]);
      res.json(row ?? null);
    } catch (err) {
      console.error("[turnus-regler] get prioritering feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/prioritering", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const body = req.body ?? {};
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
        if (body.planId != null && !(await ownsRow(client, "tidum_turnus_planer", body.planId, actor.orgId))) {
          return "unknown_plan" as const;
        }
        return (await client.query(
          `INSERT INTO tidum_turnus_prioriteringsprofil (org_id, plan_id, vekt_onsker, vekt_helgefrekvens, vekt_rettferdighet, vekt_kontinuitet, vekt_kostnad)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [
            actor.orgId,
            body.planId ?? null,
            body.vektOnsker ?? 5,
            body.vektHelgefrekvens ?? 5,
            body.vektRettferdighet ?? 5,
            body.vektKontinuitet ?? 5,
            body.vektKostnad ?? 5,
          ])).rows[0];
      });
      if (row === "unknown_plan") return res.status(400).json({ error: "Ukjent plan." });
      res.json(row);
    } catch (err) {
      console.error("[turnus-regler] create prioritering feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });
}
