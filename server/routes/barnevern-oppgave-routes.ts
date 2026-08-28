import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { registerFrist, cancelFrist } from "../lib/frist-engine";
import { needToKnowVilkar, requireKommuneActor } from "./barnevern-melding-routes";

const ENTITY_TABELLER: Record<string, string> = {
  melding: "tidum_barnevern_meldinger",
  sak: "tidum_barnevern_saker",
};

function toApiShape(row: any) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    tittel: row.tittel,
    beskrivelse: row.beskrivelse,
    tildeltUserId: row.tildelt_user_id,
    opprettetAv: row.opprettet_av,
    frist: row.frist,
    status: row.status,
    fullfortDato: row.fullfort_dato,
    fullfortAv: row.fullfort_av,
    createdAt: row.created_at,
  };
}

export function registerBarnevernOppgaveRoutes(app: Express): void {
  app.post("/api/barnevern/oppgaver", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { entityType, entityId, tittel, beskrivelse, tildeltUserId, frist } = req.body;
    if (!entityType || !(entityType in ENTITY_TABELLER)) {
      return res.status(400).json({ error: "entityType må være 'melding' eller 'sak'." });
    }
    if (!entityId || typeof entityId !== "string") {
      return res.status(400).json({ error: "entityId er påkrevd." });
    }
    if (!tittel || typeof tittel !== "string" || tittel.trim().length === 0) {
      return res.status(400).json({ error: "tittel er påkrevd." });
    }
    if (!tildeltUserId) return res.status(400).json({ error: "tildeltUserId er påkrevd." });
    let fristDato: Date | null = null;
    if (frist != null) {
      fristDato = new Date(frist);
      if (Number.isNaN(fristDato.getTime())) return res.status(400).json({ error: "Ugyldig frist." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
        const entity = await client.query(
          `SELECT id FROM ${ENTITY_TABELLER[entityType]} WHERE id = $1 AND kommune_id = $2${ntk.clause}`,
          [entityId, actor.kommuneId, ...ntk.params],
        );
        if (!entity.rowCount) throw new Error("ENTITY_NOT_FOUND");
        const assignee = await client.query(
          `SELECT id FROM users
            WHERE id = $1 AND kommune_id = $2
              AND role IN ('barnevernsleder', 'kommune_saksbehandler')`,
          [tildeltUserId, actor.kommuneId],
        );
        if (!assignee.rowCount) throw new Error("ASSIGNEE_NOT_IN_KOMMUNE");
        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_oppgaver
             (kommune_id, entity_type, entity_id, tittel, beskrivelse, tildelt_user_id, opprettet_av, frist)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [actor.kommuneId, entityType, entityId, tittel, beskrivelse ?? null, tildeltUserId, actor.userId, fristDato],
        );
        if (fristDato) {
          await registerFrist({
            entityType: "barnevern_oppgave",
            entityId: created.id,
            kommuneId: actor.kommuneId,
            fristType: "oppgave",
            dueAt: fristDato,
            notifyUserId: tildeltUserId,
          }, client);
        }
        return created;
      });
      res.status(201).json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "ENTITY_NOT_FOUND") {
        return res.status(404).json({ error: "Objektet ikke funnet." });
      }
      if (err instanceof Error && err.message === "ASSIGNEE_NOT_IN_KOMMUNE") {
        return res.status(400).json({ error: "Den tildelte tilhører ikke kommunen." });
      }
      console.error("[barnevern-oppgave] opprettelse feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette oppgaven." });
    }
  });

  app.get("/api/barnevern/oppgaver", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { entityType, entityId, mine } = req.query;
    try {
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const betingelser = ["kommune_id = $1"];
        const verdier: unknown[] = [actor.kommuneId];
        if (typeof entityType === "string" && typeof entityId === "string") {
          verdier.push(entityType, entityId);
          betingelser.push(`entity_type = $${verdier.length - 1}`, `entity_id = $${verdier.length}`);
        }
        if (mine === "true") {
          verdier.push(actor.userId);
          betingelser.push(`tildelt_user_id = $${verdier.length}`);
        }
        const { rows } = await client.query(
          `SELECT * FROM tidum_barnevern_oppgaver
            WHERE ${betingelser.join(" AND ")}
            ORDER BY status = 'apen' DESC, frist ASC NULLS LAST, created_at DESC`,
          verdier,
        );
        return rows;
      });
      res.json(rows.map(toApiShape));
    } catch (err) {
      console.error("[barnevern-oppgave] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente oppgaver." });
    }
  });

  app.patch("/api/barnevern/oppgaver/:id/fullfor", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_oppgaver
              SET status = 'fullfort', fullfort_dato = NOW(), fullfort_av = $1, updated_at = NOW()
            WHERE id = $2 AND kommune_id = $3 AND status = 'apen' RETURNING *`,
          [actor.userId, req.params.id, actor.kommuneId],
        );
        if (!updated) throw new Error("OPPGAVE_NOT_FOUND");
        await cancelFrist("barnevern_oppgave", req.params.id, "oppgave", { kommuneId: actor.kommuneId }, client);
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "OPPGAVE_NOT_FOUND") {
        return res.status(404).json({ error: "Oppgaven ikke funnet eller er ikke åpen." });
      }
      console.error("[barnevern-oppgave] fullføring feilet", err);
      res.status(500).json({ error: "Kunne ikke fullføre oppgaven." });
    }
  });

  app.patch("/api/barnevern/oppgaver/:id/kanseller", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_oppgaver
              SET status = 'kansellert', updated_at = NOW()
            WHERE id = $1 AND kommune_id = $2 AND status = 'apen' RETURNING *`,
          [req.params.id, actor.kommuneId],
        );
        if (!updated) throw new Error("OPPGAVE_NOT_FOUND");
        await cancelFrist("barnevern_oppgave", req.params.id, "oppgave", { kommuneId: actor.kommuneId }, client);
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "OPPGAVE_NOT_FOUND") {
        return res.status(404).json({ error: "Oppgaven ikke funnet eller er ikke åpen." });
      }
      console.error("[barnevern-oppgave] kansellering feilet", err);
      res.status(500).json({ error: "Kunne ikke kansellere oppgaven." });
    }
  });
}
