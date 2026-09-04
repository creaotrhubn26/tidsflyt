import type { Express, Request, Response } from "express";
import type { PoolClient } from "pg";
import { withTurnusOrgRlsContext } from "../lib/database-rls-context";
import { requireTurnusActor } from "./turnus-actor";

// table is always a fixed literal string passed by callers below, never req.body — no SQL-injection surface.
async function ownsRow(client: PoolClient, table: string, id: number, orgId: number): Promise<boolean> {
  const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE id = $1 AND org_id = $2`, [id, orgId]);
  return rows.length > 0;
}

export function registerTurnusPlanRoutes(app: Express): void {
  app.get("/api/turnus/planer", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `SELECT * FROM tidum_turnus_planer WHERE org_id = $1 ORDER BY created_at DESC`,
          [actor.orgId])).rows);
      res.json(rows);
    } catch (err) {
      console.error("[turnus-plan] list planer feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/planer", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const body = req.body ?? {};
    if (!body.navn || typeof body.navn !== "string") return res.status(400).json({ error: "navn kreves." });
    if (typeof body.avdelingId !== "number") return res.status(400).json({ error: "avdelingId kreves." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
        if (!(await ownsRow(client, "tidum_turnus_avdelinger", body.avdelingId, actor.orgId))) {
          return "unknown_avdeling" as const;
        }
        return (await client.query(
          `INSERT INTO tidum_turnus_planer (org_id, avdeling_id, navn, rotasjon_uker, start_dato)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [actor.orgId, body.avdelingId, body.navn, body.rotasjonUker ?? 6, body.startDato ?? null])).rows[0];
      });
      if (row === "unknown_avdeling") return res.status(400).json({ error: "Ukjent avdeling." });
      res.json(row);
    } catch (err) {
      console.error("[turnus-plan] create plan feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.get("/api/turnus/planer/:id/behov", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `SELECT b.* FROM tidum_turnus_bemanningsbehov b
           JOIN tidum_turnus_planer p ON p.avdeling_id = b.avdeling_id
           WHERE p.id = $1 AND b.org_id = $2`,
          [req.params.id, actor.orgId])).rows);
      res.json(rows);
    } catch (err) {
      console.error("[turnus-plan] list behov feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/bemanningsbehov", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const body = req.body ?? {};
    if (typeof body.avdelingId !== "number") return res.status(400).json({ error: "avdelingId kreves." });
    if (typeof body.vaktkodeId !== "number") return res.status(400).json({ error: "vaktkodeId kreves." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
        if (!(await ownsRow(client, "tidum_turnus_avdelinger", body.avdelingId, actor.orgId))) {
          return "unknown_avdeling" as const;
        }
        if (!(await ownsRow(client, "tidum_turnus_vaktkoder", body.vaktkodeId, actor.orgId))) {
          return "unknown_vaktkode" as const;
        }
        if (body.kompetanseKravId != null && !(await ownsRow(client, "tidum_turnus_kompetanser", body.kompetanseKravId, actor.orgId))) {
          return "unknown_kompetanse" as const;
        }
        return (await client.query(
          `INSERT INTO tidum_turnus_bemanningsbehov (org_id, avdeling_id, ukedag, dato, vaktkode_id, antall_krevd, kompetanse_krav_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [
            actor.orgId,
            body.avdelingId,
            body.ukedag ?? null,
            body.dato ?? null,
            body.vaktkodeId,
            body.antallKrevd ?? 1,
            body.kompetanseKravId ?? null,
          ])).rows[0];
      });
      if (row === "unknown_avdeling") return res.status(400).json({ error: "Ukjent avdeling." });
      if (row === "unknown_vaktkode") return res.status(400).json({ error: "Ukjent vaktkode." });
      if (row === "unknown_kompetanse") return res.status(400).json({ error: "Ukjent kompetansekrav." });
      res.json(row);
    } catch (err) {
      console.error("[turnus-plan] create behov feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.get("/api/turnus/planer/:id/vaktlinjer", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `SELECT * FROM tidum_turnus_vaktlinjer WHERE plan_id = $1 AND org_id = $2 ORDER BY linjenr`,
          [req.params.id, actor.orgId])).rows);
      res.json(rows);
    } catch (err) {
      console.error("[turnus-plan] list vaktlinjer feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/planer/:id/vaktlinjer", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const body = req.body ?? {};
    if (typeof body.linjenr !== "number") return res.status(400).json({ error: "linjenr kreves." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
        if (!(await ownsRow(client, "tidum_turnus_planer", Number(req.params.id), actor.orgId))) {
          return "unknown_plan" as const;
        }
        if (body.tildeltAnsattId != null && !(await ownsRow(client, "tidum_turnus_ansatte", body.tildeltAnsattId, actor.orgId))) {
          return "unknown_ansatt" as const;
        }
        return (await client.query(
          `INSERT INTO tidum_turnus_vaktlinjer (org_id, plan_id, linjenr, stillingsprosent, tildelt_ansatt_id)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [actor.orgId, req.params.id, body.linjenr, body.stillingsprosent ?? 100, body.tildeltAnsattId ?? null])).rows[0];
      });
      if (row === "unknown_plan") return res.status(400).json({ error: "Ukjent plan." });
      if (row === "unknown_ansatt") return res.status(400).json({ error: "Ukjent ansatt." });
      res.json(row);
    } catch (err) {
      console.error("[turnus-plan] create vaktlinje feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.get("/api/turnus/planer/:id/readiness", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `SELECT
             (SELECT count(*) FROM tidum_turnus_vaktkoder WHERE org_id = $2) AS vaktkoder,
             (SELECT count(*) FROM tidum_turnus_bemanningsbehov b JOIN tidum_turnus_planer p ON p.avdeling_id = b.avdeling_id WHERE p.id = $1 AND b.org_id = $2) AS behov,
             (SELECT count(*) FROM tidum_turnus_ansatte WHERE org_id = $2) AS ansatte,
             (SELECT count(*) FROM tidum_turnus_regler WHERE org_id = $2 AND aktiv) AS regler`,
          [req.params.id, actor.orgId])).rows[0]);
      const mangler: string[] = [];
      if (Number(row.vaktkoder) === 0) mangler.push("vaktkoder");
      if (Number(row.behov) === 0) mangler.push("bemanningsbehov");
      if (Number(row.ansatte) === 0) mangler.push("ansatte");
      if (Number(row.regler) === 0) mangler.push("aktive regler");
      res.json({ ready: mangler.length === 0, mangler });
    } catch (err) {
      console.error("[turnus-plan] readiness feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });
}
