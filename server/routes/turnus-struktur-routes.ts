import type { Express, Request, Response } from "express";
import { withTurnusOrgRlsContext } from "../lib/database-rls-context";
import { requireTurnusActor } from "./turnus-actor";

export function registerTurnusStrukturRoutes(app: Express): void {
  app.get("/api/turnus/avdelinger", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(`SELECT * FROM tidum_turnus_avdelinger WHERE org_id = $1 ORDER BY navn`, [actor.orgId])).rows);
      res.json(rows);
    } catch (err) {
      console.error("[turnus-struktur] list avdelinger feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/avdelinger", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const { navn, parentId } = req.body ?? {};
    if (!navn || typeof navn !== "string") return res.status(400).json({ error: "navn kreves." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
        if (parentId != null) {
          const { rows } = await client.query(
            `SELECT 1 FROM tidum_turnus_avdelinger WHERE id = $1 AND org_id = $2`,
            [parentId, actor.orgId],
          );
          if (rows.length === 0) return "unknown_parent" as const;
        }
        return (await client.query(
          `INSERT INTO tidum_turnus_avdelinger (org_id, navn, parent_id) VALUES ($1,$2,$3) RETURNING *`,
          [actor.orgId, navn, parentId ?? null])).rows[0];
      });
      if (row === "unknown_parent") return res.status(400).json({ error: "Ukjent avdeling." });
      res.json(row);
    } catch (err) {
      console.error("[turnus-struktur] create avdeling feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.get("/api/turnus/ansatte", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(`SELECT * FROM tidum_turnus_ansatte WHERE org_id = $1 ORDER BY navn`, [actor.orgId])).rows);
      res.json(rows);
    } catch (err) {
      console.error("[turnus-struktur] list ansatte feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/ansatte", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const { navn, primarAvdelingId, stillingsprosent, userEmail } = req.body ?? {};
    if (!navn || typeof navn !== "string") return res.status(400).json({ error: "navn kreves." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
        if (primarAvdelingId != null) {
          const { rows } = await client.query(
            `SELECT 1 FROM tidum_turnus_avdelinger WHERE id = $1 AND org_id = $2`,
            [primarAvdelingId, actor.orgId],
          );
          if (rows.length === 0) return "unknown_avdeling" as const;
        }
        return (await client.query(
          `INSERT INTO tidum_turnus_ansatte (org_id, primar_avdeling_id, navn, stillingsprosent, user_email) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [actor.orgId, primarAvdelingId ?? null, navn, stillingsprosent ?? 100, userEmail ?? null])).rows[0];
      });
      if (row === "unknown_avdeling") return res.status(400).json({ error: "Ukjent avdeling." });
      res.json(row);
    } catch (err) {
      console.error("[turnus-struktur] create ansatt feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.get("/api/turnus/kompetanser", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(`SELECT * FROM tidum_turnus_kompetanser WHERE org_id = $1 ORDER BY navn`, [actor.orgId])).rows);
      res.json(rows);
    } catch (err) {
      console.error("[turnus-struktur] list kompetanser feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/kompetanser", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const { navn } = req.body ?? {};
    if (!navn || typeof navn !== "string") return res.status(400).json({ error: "navn kreves." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `INSERT INTO tidum_turnus_kompetanser (org_id, navn) VALUES ($1,$2) RETURNING *`,
          [actor.orgId, navn])).rows[0]);
      res.json(row);
    } catch (err) {
      console.error("[turnus-struktur] create kompetanse feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.get("/api/turnus/vaktkoder", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(`SELECT * FROM tidum_turnus_vaktkoder WHERE org_id = $1 ORDER BY kode`, [actor.orgId])).rows);
      res.json(rows);
    } catch (err) {
      console.error("[turnus-struktur] list vaktkoder feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/vaktkoder", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const { kode, navn, startTid, sluttTid, varighetTimer, type, tellerSomArbeid, farge } = req.body ?? {};
    if (!kode || typeof kode !== "string") return res.status(400).json({ error: "kode kreves." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `INSERT INTO tidum_turnus_vaktkoder (org_id, kode, navn, start_tid, slutt_tid, varighet_timer, type, teller_som_arbeid, farge) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [actor.orgId, kode, navn ?? null, startTid ?? null, sluttTid ?? null, varighetTimer ?? null, type ?? null, tellerSomArbeid ?? true, farge ?? null])).rows[0]);
      res.json(row);
    } catch (err) {
      console.error("[turnus-struktur] create vaktkode feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });
}
