/**
 * server/routes/barnevern-delegasjon-routes.ts
 *
 * Krav 15-rest: kontrollerte unntak fra need-to-know (migrasjon 102).
 *  - Delegasjon ved fravær: kun barnevernsleder, obligatorisk
 *    begrunnelse og sluttdato; oppheves — slettes aldri (tilgangsbevis).
 *  - Break-glass: selvbetjent nødtilgang til ÉN sak i maks 4 timer, med
 *    obligatorisk begrunnelse — høylytt auditlogget.
 *  - Skjermet adresse: leder markerer at bostedsopplysninger ikke skal
 *    utleveres; markøren følger sak, uttrekk og utleverings-PDF.
 * Håndhevelsen skjer i needToKnowVilkar (barnevern-melding-routes.ts).
 */
import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { loggTilgang, requireKommuneActor } from "./barnevern-melding-routes";

const BREAK_GLASS_TIMER = 4;

function toApiShape(row: any) {
  return {
    id: row.id,
    type: row.type,
    fraUserId: row.fra_user_id,
    tilUserId: row.til_user_id,
    sakId: row.sak_id,
    begrunnelse: row.begrunnelse,
    fraDato: row.fra_dato,
    tilDato: row.til_dato,
    opprettetAv: row.opprettet_av,
    opphevetAv: row.opphevet_av,
    opphevetAt: row.opphevet_at,
    createdAt: row.created_at,
  };
}

export function registerBarnevernDelegasjonRoutes(app: Express): void {
  // Opprett fraværsdelegasjon — kun barnevernsleder.
  app.post("/api/barnevern/delegasjoner", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan delegere tilgang." });
    }
    const { fraUserId, tilUserId, tilDato, fraDato, begrunnelse } = req.body;
    if (!fraUserId || !tilUserId || fraUserId === tilUserId) {
      return res.status(400).json({ error: "fraUserId og tilUserId må være to ulike brukere." });
    }
    if (!begrunnelse || typeof begrunnelse !== "string" || !begrunnelse.trim()) {
      return res.status(400).json({ error: "Begrunnelse er obligatorisk." });
    }
    const slutt = new Date(tilDato);
    if (Number.isNaN(slutt.getTime()) || slutt <= new Date()) {
      return res.status(400).json({ error: "tilDato må være et fremtidig tidspunkt." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        // Begge brukerne må tilhøre kommunen (fail-closed mot ID-gjetting).
        const { rows: brukere } = await client.query(
          `SELECT id FROM users WHERE id = ANY($1::varchar[]) AND kommune_id = $2`,
          [[fraUserId, tilUserId], actor.kommuneId],
        );
        if (brukere.length !== 2) throw new Error("BRUKER_NOT_FOUND");
        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_tilgangsdelegasjoner
             (kommune_id, type, fra_user_id, til_user_id, begrunnelse, fra_dato, til_dato, opprettet_av)
           VALUES ($1, 'delegasjon', $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7) RETURNING *`,
          [actor.kommuneId, fraUserId, tilUserId, begrunnelse.trim(), fraDato ?? null, slutt, actor.userId],
        );
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "endret", objektType: "delegasjon", objektId: created.id,
          detaljer: { fraUserId, tilUserId, tilDato: slutt.toISOString(), begrunnelse: begrunnelse.trim() },
        });
        return created;
      });
      res.status(201).json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "BRUKER_NOT_FOUND") {
        return res.status(400).json({ error: "Begge brukerne må tilhøre kommunen." });
      }
      console.error("[barnevern-delegasjon] opprettelse feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette delegasjonen." });
    }
  });

  // Liste (leder): aktive og historiske delegasjoner + break-glass-bruk.
  app.get("/api/barnevern/delegasjoner", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan se delegasjonene." });
    }
    try {
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows } = await client.query(
          `SELECT * FROM tidum_barnevern_tilgangsdelegasjoner
            WHERE kommune_id = $1 ORDER BY created_at DESC LIMIT 500`,
          [actor.kommuneId],
        );
        return rows;
      });
      res.json(rows.map(toApiShape));
    } catch (err) {
      console.error("[barnevern-delegasjon] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente delegasjonene." });
    }
  });

  // Opphev (leder) — raden beholdes som tilgangsbevis.
  app.post("/api/barnevern/delegasjoner/:id/opphev", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan oppheve." });
    }
    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_tilgangsdelegasjoner
              SET opphevet_av = $1, opphevet_at = NOW()
            WHERE id = $2 AND kommune_id = $3 AND opphevet_at IS NULL RETURNING *`,
          [actor.userId, req.params.id, actor.kommuneId],
        );
        if (!updated) return null;
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "endret", objektType: "delegasjon_opphevet", objektId: updated.id,
        });
        return updated;
      });
      if (!row) return res.status(404).json({ error: "Aktiv delegasjon ikke funnet." });
      res.json(toApiShape(row));
    } catch (err) {
      console.error("[barnevern-delegasjon] oppheving feilet", err);
      res.status(500).json({ error: "Kunne ikke oppheve delegasjonen." });
    }
  });

  // Break-glass: selvbetjent nødtilgang til én sak i 4 timer.
  app.post("/api/barnevern/saker/:id/nodtilgang", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const { begrunnelse } = req.body;
    if (!begrunnelse || typeof begrunnelse !== "string" || begrunnelse.trim().length < 10) {
      return res.status(400).json({ error: "Nødtilgang krever begrunnelse (minst 10 tegn)." });
    }
    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        // Saken må finnes i kommunen — men behovsprøvingen omgås bevisst her:
        // det ER nødtilgangen. Derfor høylytt audit i samme transaksjon.
        const { rows: [sak] } = await client.query(
          `SELECT id, saksnummer FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2`,
          [req.params.id, actor.kommuneId],
        );
        if (!sak) return null;
        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_tilgangsdelegasjoner
             (kommune_id, type, til_user_id, sak_id, begrunnelse, til_dato, opprettet_av)
           VALUES ($1, 'break_glass', $2, $3, $4, NOW() + make_interval(hours => $5), $2) RETURNING *`,
          [actor.kommuneId, actor.userId, sak.id, begrunnelse.trim(), BREAK_GLASS_TIMER],
        );
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "endret", objektType: "break_glass", objektId: created.id,
          detaljer: { sakId: sak.id, saksnummer: sak.saksnummer, begrunnelse: begrunnelse.trim(), timer: BREAK_GLASS_TIMER },
        });
        return created;
      });
      if (!row) return res.status(404).json({ error: "Sak ikke funnet." });
      console.warn(`[barnevern] BREAK-GLASS: ${actor.userId} åpnet nødtilgang til sak ${row.sak_id} (${BREAK_GLASS_TIMER} t)`);
      res.status(201).json(toApiShape(row));
    } catch (err) {
      console.error("[barnevern-delegasjon] nødtilgang feilet", err);
      res.status(500).json({ error: "Kunne ikke åpne nødtilgang." });
    }
  });

  // Skjermet adresse (leder): markér at bosted ikke skal utleveres.
  app.post("/api/barnevern/saker/:id/skjerming", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan endre skjerming." });
    }
    const { skjermet, merknad } = req.body;
    if (typeof skjermet !== "boolean") {
      return res.status(400).json({ error: "skjermet må være true/false." });
    }
    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_saker
              SET adresse_skjermet = $1, adresse_skjermet_merknad = $2, updated_at = NOW()
            WHERE id = $3 AND kommune_id = $4 RETURNING id, adresse_skjermet, adresse_skjermet_merknad`,
          [skjermet, merknad ?? null, req.params.id, actor.kommuneId],
        );
        if (!updated) return null;
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "endret", objektType: "adresse_skjerming", objektId: updated.id,
          detaljer: { skjermet, merknad: merknad ?? null },
        });
        return updated;
      });
      if (!row) return res.status(404).json({ error: "Sak ikke funnet." });
      res.json({ id: row.id, adresseSkjermet: row.adresse_skjermet, merknad: row.adresse_skjermet_merknad });
    } catch (err) {
      console.error("[barnevern-delegasjon] skjerming feilet", err);
      res.status(500).json({ error: "Kunne ikke endre skjermingen." });
    }
  });
}
