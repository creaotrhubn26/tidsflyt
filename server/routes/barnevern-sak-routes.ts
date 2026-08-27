import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { cancelFrist } from "../lib/frist-engine";
import { requireKommuneActor } from "./barnevern-melding-routes";

// Faseflyt for den kommunale barnevernssaken. En sak starter alltid i
// undersøkelse (opprettet fra «send til undersøkelse» på en melding).
// ponytail: overgangsreglene er kodefaste; per-kommune-konfigurasjon legges
// til som egen tabell når en kommune faktisk trenger avvikende flyt.
const TILLATTE_OVERGANGER: Record<string, string[]> = {
  undersokelse: ["tiltak", "henlagt"],
  tiltak: ["avsluttet"],
  avsluttet: [],
  henlagt: [],
};

// Overganger som er vedtak og krever barnevernsleders godkjenning.
const KREVER_LEDER = new Set(["henlagt", "avsluttet"]);

const AVSLUTTENDE_FASER = new Set(["avsluttet", "henlagt"]);

function toApiShape(row: any) {
  return {
    id: row.id,
    kommuneId: row.kommune_id,
    saksnummer: row.saksnummer,
    meldingId: row.melding_id,
    barnFodselsnummer: row.barn_fodselsnummer,
    barnNavn: row.barn_navn,
    fase: row.fase,
    tildeltSaksbehandlerId: row.tildelt_saksbehandler_id,
    undersokelsesfrist: row.undersokelsesfrist,
    avsluttetDato: row.avsluttet_dato,
    avsluttetAvUserId: row.avsluttet_av_user_id,
    createdAt: row.created_at,
  };
}

export function registerBarnevernSakRoutes(app: Express): void {
  app.get("/api/barnevern/saker", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const fase = typeof req.query.fase === "string" ? req.query.fase : null;
      if (fase && !(fase in TILLATTE_OVERGANGER)) {
        return res.status(400).json({ error: "Ugyldig fase." });
      }
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const result = fase
          ? await client.query(
              `SELECT * FROM tidum_barnevern_saker WHERE kommune_id = $1 AND fase = $2 ORDER BY created_at DESC`,
              [actor.kommuneId, fase],
            )
          : await client.query(
              `SELECT * FROM tidum_barnevern_saker WHERE kommune_id = $1 ORDER BY created_at DESC`,
              [actor.kommuneId],
            );
        return result.rows;
      });
      res.json(rows.map(toApiShape));
    } catch (err) {
      console.error("[barnevern-sak] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente saker." });
    }
  });

  app.get("/api/barnevern/saker/:id", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const data = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [sak] } = await client.query(
          `SELECT * FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2`,
          [req.params.id, actor.kommuneId],
        );
        if (!sak) return null;
        const { rows: historikk } = await client.query(
          `SELECT fra_fase, til_fase, begrunnelse, endret_av_user_id, created_at
             FROM tidum_barnevern_sak_fase_historikk
            WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at ASC`,
          [req.params.id, actor.kommuneId],
        );
        return { sak, historikk };
      });
      if (!data) return res.status(404).json({ error: "Sak ikke funnet." });
      res.json({
        ...toApiShape(data.sak),
        faseHistorikk: data.historikk.map((h: any) => ({
          fraFase: h.fra_fase,
          tilFase: h.til_fase,
          begrunnelse: h.begrunnelse,
          endretAvUserId: h.endret_av_user_id,
          createdAt: h.created_at,
        })),
      });
    } catch (err) {
      console.error("[barnevern-sak] henting feilet", err);
      res.status(500).json({ error: "Kunne ikke hente saken." });
    }
  });

  app.patch("/api/barnevern/saker/:id/tildel", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan tildele." });
    }

    const { tildeltSaksbehandlerId } = req.body;
    if (!tildeltSaksbehandlerId) return res.status(400).json({ error: "tildeltSaksbehandlerId er påkrevd." });
    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const assignee = await client.query(
          `SELECT id FROM users
            WHERE id = $1 AND kommune_id = $2
              AND role IN ('barnevernsleder', 'kommune_saksbehandler')`,
          [tildeltSaksbehandlerId, actor.kommuneId],
        );
        if (!assignee.rowCount) throw new Error("ASSIGNEE_NOT_IN_KOMMUNE");
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_saker SET tildelt_saksbehandler_id = $1, updated_at = NOW()
           WHERE id = $2 AND kommune_id = $3 RETURNING *`,
          [tildeltSaksbehandlerId, req.params.id, actor.kommuneId],
        );
        if (!updated) throw new Error("SAK_NOT_FOUND");
        await client.query(
          `UPDATE tidum_frister SET notify_user_id = $1, updated_at = NOW()
           WHERE entity_type = 'barnevern_sak' AND entity_id = $2 AND kommune_id = $3 AND status = 'aktiv'`,
          [tildeltSaksbehandlerId, req.params.id, actor.kommuneId],
        );
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "SAK_NOT_FOUND") {
        return res.status(404).json({ error: "Sak ikke funnet." });
      }
      if (err instanceof Error && err.message === "ASSIGNEE_NOT_IN_KOMMUNE") {
        return res.status(400).json({ error: "Saksbehandleren tilhører ikke kommunen." });
      }
      console.error("[barnevern-sak] tildeling feilet", err);
      res.status(500).json({ error: "Kunne ikke tildele saken." });
    }
  });

  app.post("/api/barnevern/saker/:id/fase", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { tilFase, begrunnelse } = req.body;
    if (typeof tilFase !== "string" || !(tilFase in TILLATTE_OVERGANGER)) {
      return res.status(400).json({ error: "Ugyldig tilFase." });
    }
    if (!begrunnelse || typeof begrunnelse !== "string" || begrunnelse.trim().length === 0) {
      return res.status(400).json({ error: "begrunnelse er påkrevd for faseovergang." });
    }
    if (KREVER_LEDER.has(tilFase) && actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Overgangen krever barnevernsleders godkjenning." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [sak] } = await client.query(
          `SELECT * FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2 FOR UPDATE`,
          [req.params.id, actor.kommuneId],
        );
        if (!sak) throw new Error("SAK_NOT_FOUND");
        if (!TILLATTE_OVERGANGER[sak.fase].includes(tilFase)) {
          throw new Error("UGYLDIG_OVERGANG");
        }

        const avslutter = AVSLUTTENDE_FASER.has(tilFase);
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_saker
              SET fase = $1,
                  avsluttet_dato = CASE WHEN $2 THEN NOW() ELSE avsluttet_dato END,
                  avsluttet_av_user_id = CASE WHEN $2 THEN $3 ELSE avsluttet_av_user_id END,
                  updated_at = NOW()
            WHERE id = $4 AND kommune_id = $5 RETURNING *`,
          [tilFase, avslutter, actor.userId, req.params.id, actor.kommuneId],
        );
        await client.query(
          `INSERT INTO tidum_barnevern_sak_fase_historikk
             (sak_id, kommune_id, fra_fase, til_fase, begrunnelse, endret_av_user_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.params.id, actor.kommuneId, sak.fase, tilFase, begrunnelse, actor.userId],
        );
        if (sak.fase === "undersokelse") {
          await cancelFrist(
            "barnevern_sak",
            req.params.id,
            "undersokelse",
            { kommuneId: actor.kommuneId },
            client,
          );
        }
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "SAK_NOT_FOUND") {
        return res.status(404).json({ error: "Sak ikke funnet." });
      }
      if (err instanceof Error && err.message === "UGYLDIG_OVERGANG") {
        return res.status(400).json({ error: "Faseovergangen er ikke tillatt fra sakens nåværende fase." });
      }
      console.error("[barnevern-sak] faseovergang feilet", err);
      res.status(500).json({ error: "Kunne ikke gjennomføre faseovergangen." });
    }
  });
}
