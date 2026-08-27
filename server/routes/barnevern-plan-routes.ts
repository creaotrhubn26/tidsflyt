import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { registerFrist, cancelFrist } from "../lib/frist-engine";
import { loggTilgang, needToKnowVilkar, requireKommuneActor } from "./barnevern-melding-routes";

const PLANTYPER = new Set(["tiltaksplan", "omsorgsplan"]);
const TILTAK_STATUSER = new Set(["planlagt", "pagar", "fullfort", "avbrutt"]);
const DELTAKER_ROLLER = new Set(["forelder", "barn", "saksbehandler", "annet"]);

function validerDeltakere(deltakere: unknown): string | null {
  if (deltakere == null) return null;
  if (!Array.isArray(deltakere)) return "deltakere må være en liste.";
  for (const d of deltakere) {
    if (!d || typeof d.navn !== "string" || d.navn.trim().length === 0) {
      return "Hver deltaker må ha navn.";
    }
    if (!DELTAKER_ROLLER.has(d.rolle)) {
      return "Deltakerrolle må være forelder, barn, saksbehandler eller annet.";
    }
  }
  return null;
}

function toApiShape(row: any) {
  return {
    id: row.id,
    sakId: row.sak_id,
    plantype: row.plantype,
    versjon: row.versjon,
    status: row.status,
    formaal: row.formaal,
    deltakere: row.deltakere,
    evalueringsfrist: row.evalueringsfrist,
    godkjentAv: row.godkjent_av,
    godkjentDato: row.godkjent_dato,
    opprettetAv: row.opprettet_av,
    createdAt: row.created_at,
  };
}

function tiltakApiShape(row: any) {
  return {
    id: row.id,
    planId: row.plan_id,
    beskrivelse: row.beskrivelse,
    ansvarlig: row.ansvarlig,
    frist: row.frist,
    status: row.status,
    statusnotat: row.statusnotat,
  };
}

export function registerBarnevernPlanRoutes(app: Express): void {
  // Opprett planutkast på sak. Finnes et åpent utkast av samme type → 409.
  app.post("/api/barnevern/saker/:sakId/planer", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { plantype, formaal, deltakere, evalueringsfrist } = req.body;
    if (plantype != null && !PLANTYPER.has(plantype)) {
      return res.status(400).json({ error: "Ugyldig plantype." });
    }
    const deltakerFeil = validerDeltakere(deltakere);
    if (deltakerFeil) return res.status(400).json({ error: deltakerFeil });

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
          const { rows: [sak] } = await client.query(
            `SELECT id FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2${ntk.clause}`,
            [req.params.sakId, actor.kommuneId, ...ntk.params],
          );
        if (!sak) throw new Error("SAK_NOT_FOUND");
        const valgtType = plantype ?? "tiltaksplan";
        const { rows: [eksisterende] } = await client.query(
          `SELECT id FROM tidum_barnevern_planer
            WHERE sak_id = $1 AND kommune_id = $2 AND plantype = $3 AND status = 'utkast'`,
          [req.params.sakId, actor.kommuneId, valgtType],
        );
        if (eksisterende) throw new Error("UTKAST_FINNES");
        const { rows: [maks] } = await client.query(
          `SELECT COALESCE(MAX(versjon), 0) AS v FROM tidum_barnevern_planer
            WHERE sak_id = $1 AND kommune_id = $2 AND plantype = $3`,
          [req.params.sakId, actor.kommuneId, valgtType],
        );
        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_planer
             (kommune_id, sak_id, plantype, versjon, formaal, deltakere, evalueringsfrist, opprettet_av)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            actor.kommuneId, req.params.sakId, valgtType, Number(maks.v) + 1,
            formaal ?? null, JSON.stringify(deltakere ?? []),
            evalueringsfrist ? new Date(evalueringsfrist) : null, actor.userId,
          ],
        );
        return created;
      });
      res.status(201).json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "SAK_NOT_FOUND") {
        return res.status(404).json({ error: "Sak ikke funnet." });
      }
      if (err instanceof Error && err.message === "UTKAST_FINNES") {
        return res.status(409).json({ error: "Det finnes allerede et utkast av denne plantypen." });
      }
      console.error("[barnevern-plan] opprettelse feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette planen." });
    }
  });

  // Alle versjoner av sakens planer, med tiltak.
  app.get("/api/barnevern/saker/:sakId/planer", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const data = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
          const { rows: [sak] } = await client.query(
            `SELECT id FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2${ntk.clause}`,
            [req.params.sakId, actor.kommuneId, ...ntk.params],
          );
        if (!sak) return null;
        const { rows: planer } = await client.query(
          `SELECT * FROM tidum_barnevern_planer
            WHERE sak_id = $1 AND kommune_id = $2 ORDER BY plantype, versjon DESC`,
          [req.params.sakId, actor.kommuneId],
        );
        const { rows: tiltak } = planer.length
          ? await client.query(
              `SELECT * FROM tidum_barnevern_plan_tiltak
                WHERE kommune_id = $1 AND plan_id = ANY($2::uuid[]) ORDER BY created_at ASC`,
              [actor.kommuneId, planer.map((p: any) => p.id)],
            )
          : { rows: [] };
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "lest", objektType: "plan", objektId: req.params.sakId,
        });
        return { planer, tiltak };
      });
      if (!data) return res.status(404).json({ error: "Sak ikke funnet." });
      res.json(data.planer.map((p: any) => ({
        ...toApiShape(p),
        tiltak: data.tiltak.filter((t: any) => t.plan_id === p.id).map(tiltakApiShape),
      })));
    } catch (err) {
      console.error("[barnevern-plan] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente planene." });
    }
  });

  // Rediger utkast (godkjente versjoner er uforanderlige).
  app.patch("/api/barnevern/planer/:id", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { formaal, deltakere, evalueringsfrist } = req.body;
    const deltakerFeil = validerDeltakere(deltakere);
    if (deltakerFeil) return res.status(400).json({ error: deltakerFeil });

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_planer
              SET formaal = COALESCE($1, formaal),
                  deltakere = COALESCE($2, deltakere),
                  evalueringsfrist = COALESCE($3, evalueringsfrist),
                  updated_at = NOW()
            WHERE id = $4 AND kommune_id = $5 AND status = 'utkast' RETURNING *`,
          [
            formaal ?? null,
            deltakere ? JSON.stringify(deltakere) : null,
            evalueringsfrist ? new Date(evalueringsfrist) : null,
            req.params.id, actor.kommuneId,
          ],
        );
        if (!updated) throw new Error("UTKAST_NOT_FOUND");
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "UTKAST_NOT_FOUND") {
        return res.status(404).json({ error: "Utkast ikke funnet — godkjente versjoner endres via ny versjon." });
      }
      console.error("[barnevern-plan] redigering feilet", err);
      res.status(500).json({ error: "Kunne ikke oppdatere planen." });
    }
  });

  // Faglig godkjenning — kun barnevernsleder. Forrige godkjente versjon
  // settes 'erstattet' og dens evalueringsfrist kanselleres.
  app.post("/api/barnevern/planer/:id/godkjenn", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan godkjenne planer." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [plan] } = await client.query(
          `SELECT * FROM tidum_barnevern_planer
            WHERE id = $1 AND kommune_id = $2 AND status = 'utkast' FOR UPDATE`,
          [req.params.id, actor.kommuneId],
        );
        if (!plan) throw new Error("UTKAST_NOT_FOUND");

        const { rows: forrige } = await client.query(
          `UPDATE tidum_barnevern_planer SET status = 'erstattet', updated_at = NOW()
            WHERE sak_id = $1 AND kommune_id = $2 AND plantype = $3 AND status = 'godkjent'
            RETURNING id`,
          [plan.sak_id, actor.kommuneId, plan.plantype],
        );
        for (const gammel of forrige) {
          await cancelFrist("barnevern_plan", gammel.id, "evaluering", { kommuneId: actor.kommuneId }, client);
        }

        const { rows: [godkjent] } = await client.query(
          `UPDATE tidum_barnevern_planer
              SET status = 'godkjent', godkjent_av = $1, godkjent_dato = NOW(), updated_at = NOW()
            WHERE id = $2 AND kommune_id = $3 RETURNING *`,
          [actor.userId, req.params.id, actor.kommuneId],
        );
        if (godkjent.evalueringsfrist) {
          await registerFrist({
            entityType: "barnevern_plan",
            entityId: godkjent.id,
            kommuneId: actor.kommuneId,
            fristType: "evaluering",
            dueAt: new Date(godkjent.evalueringsfrist),
            notifyUserId: godkjent.opprettet_av,
          }, client);
        }
        return godkjent;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "UTKAST_NOT_FOUND") {
        return res.status(404).json({ error: "Utkast ikke funnet." });
      }
      console.error("[barnevern-plan] godkjenning feilet", err);
      res.status(500).json({ error: "Kunne ikke godkjenne planen." });
    }
  });

  // Ny versjon: kopier godkjent plan (med tiltak) som nytt utkast.
  app.post("/api/barnevern/planer/:id/ny-versjon", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [plan] } = await client.query(
          `SELECT * FROM tidum_barnevern_planer
            WHERE id = $1 AND kommune_id = $2 AND status = 'godkjent'`,
          [req.params.id, actor.kommuneId],
        );
        if (!plan) throw new Error("GODKJENT_NOT_FOUND");
        const { rows: [eksisterende] } = await client.query(
          `SELECT id FROM tidum_barnevern_planer
            WHERE sak_id = $1 AND kommune_id = $2 AND plantype = $3 AND status = 'utkast'`,
          [plan.sak_id, actor.kommuneId, plan.plantype],
        );
        if (eksisterende) throw new Error("UTKAST_FINNES");
        const { rows: [maks] } = await client.query(
          `SELECT MAX(versjon) AS v FROM tidum_barnevern_planer
            WHERE sak_id = $1 AND kommune_id = $2 AND plantype = $3`,
          [plan.sak_id, actor.kommuneId, plan.plantype],
        );
        const { rows: [kopi] } = await client.query(
          `INSERT INTO tidum_barnevern_planer
             (kommune_id, sak_id, plantype, versjon, formaal, deltakere, evalueringsfrist, opprettet_av)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            actor.kommuneId, plan.sak_id, plan.plantype, Number(maks.v) + 1,
            plan.formaal, JSON.stringify(plan.deltakere), plan.evalueringsfrist, actor.userId,
          ],
        );
        await client.query(
          `INSERT INTO tidum_barnevern_plan_tiltak (plan_id, kommune_id, beskrivelse, ansvarlig, frist, status, statusnotat)
           SELECT $1, kommune_id, beskrivelse, ansvarlig, frist, status, statusnotat
             FROM tidum_barnevern_plan_tiltak WHERE plan_id = $2 AND kommune_id = $3`,
          [kopi.id, plan.id, actor.kommuneId],
        );
        return kopi;
      });
      res.status(201).json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "GODKJENT_NOT_FOUND") {
        return res.status(404).json({ error: "Godkjent plan ikke funnet." });
      }
      if (err instanceof Error && err.message === "UTKAST_FINNES") {
        return res.status(409).json({ error: "Det finnes allerede et utkast av denne plantypen." });
      }
      console.error("[barnevern-plan] ny versjon feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette ny versjon." });
    }
  });

  // Tiltak på utkast.
  app.post("/api/barnevern/planer/:id/tiltak", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { beskrivelse, ansvarlig, frist } = req.body;
    if (!beskrivelse || typeof beskrivelse !== "string") {
      return res.status(400).json({ error: "beskrivelse er påkrevd." });
    }
    if (!ansvarlig || typeof ansvarlig !== "string") {
      return res.status(400).json({ error: "ansvarlig er påkrevd." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [plan] } = await client.query(
          `SELECT id FROM tidum_barnevern_planer
            WHERE id = $1 AND kommune_id = $2 AND status = 'utkast'`,
          [req.params.id, actor.kommuneId],
        );
        if (!plan) throw new Error("UTKAST_NOT_FOUND");
        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_plan_tiltak (plan_id, kommune_id, beskrivelse, ansvarlig, frist)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [req.params.id, actor.kommuneId, beskrivelse, ansvarlig, frist ?? null],
        );
        return created;
      });
      res.status(201).json(tiltakApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "UTKAST_NOT_FOUND") {
        return res.status(404).json({ error: "Utkast ikke funnet — tiltak legges til før godkjenning." });
      }
      console.error("[barnevern-plan] tiltak feilet", err);
      res.status(500).json({ error: "Kunne ikke legge til tiltaket." });
    }
  });

  // Statusrapportering på tiltak — tillatt også på godkjent plan (det er
  // oppfølgingen); selve tiltaksbeskrivelsen endres kun via ny versjon.
  app.patch("/api/barnevern/plan-tiltak/:id/status", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { status, statusnotat } = req.body;
    if (!status || !TILTAK_STATUSER.has(status)) {
      return res.status(400).json({ error: "Ugyldig status." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_plan_tiltak
              SET status = $1, statusnotat = COALESCE($2, statusnotat), updated_at = NOW()
            WHERE id = $3 AND kommune_id = $4 RETURNING *`,
          [status, statusnotat ?? null, req.params.id, actor.kommuneId],
        );
        if (!updated) throw new Error("TILTAK_NOT_FOUND");
        return updated;
      });
      res.json(tiltakApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "TILTAK_NOT_FOUND") {
        return res.status(404).json({ error: "Tiltak ikke funnet." });
      }
      console.error("[barnevern-plan] tiltaksstatus feilet", err);
      res.status(500).json({ error: "Kunne ikke oppdatere tiltaksstatus." });
    }
  });
}
