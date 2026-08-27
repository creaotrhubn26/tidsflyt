import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { requireKommuneActor } from "./barnevern-melding-routes";

const KATEGORIER = new Set(["program", "prosjekt", "samarbeid", "kampanje", "annet"]);
const STATUSER = new Set(["planlagt", "pagar", "avsluttet"]);

function validerParter(parter: unknown): string | null {
  if (parter == null) return null;
  if (!Array.isArray(parter)) return "samarbeidsparter må være en liste.";
  for (const p of parter) {
    if (!p || typeof p.navn !== "string" || p.navn.trim().length === 0) {
      return "Hver samarbeidspart må ha navn.";
    }
  }
  return null;
}

function toApiShape(row: any) {
  return {
    id: row.id,
    tittel: row.tittel,
    beskrivelse: row.beskrivelse,
    kategori: row.kategori,
    samarbeidsparter: row.samarbeidsparter,
    ansvarligUserId: row.ansvarlig_user_id,
    startDato: row.start_dato,
    sluttDato: row.slutt_dato,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function registerBarnevernForebyggendeRoutes(app: Express): void {
  app.post("/api/barnevern/forebyggende", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { tittel, beskrivelse, kategori, samarbeidsparter, startDato, sluttDato } = req.body;
    if (!tittel || typeof tittel !== "string" || tittel.trim().length === 0) {
      return res.status(400).json({ error: "tittel er påkrevd." });
    }
    if (!kategori || !KATEGORIER.has(kategori)) {
      return res.status(400).json({ error: "Ugyldig kategori." });
    }
    const partFeil = validerParter(samarbeidsparter);
    if (partFeil) return res.status(400).json({ error: partFeil });

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_forebyggende
             (kommune_id, tittel, beskrivelse, kategori, samarbeidsparter, ansvarlig_user_id, start_dato, slutt_dato)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            actor.kommuneId, tittel, beskrivelse ?? null, kategori,
            JSON.stringify(samarbeidsparter ?? []), actor.userId,
            startDato ?? null, sluttDato ?? null,
          ],
        );
        return created;
      });
      res.status(201).json(toApiShape(row));
    } catch (err) {
      console.error("[barnevern-forebyggende] opprettelse feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette tiltaket." });
    }
  });

  app.get("/api/barnevern/forebyggende", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const status = typeof req.query.status === "string" ? req.query.status : null;
      if (status && !STATUSER.has(status)) return res.status(400).json({ error: "Ugyldig status." });
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows } = status
          ? await client.query(
              `SELECT * FROM tidum_barnevern_forebyggende
                WHERE kommune_id = $1 AND status = $2 ORDER BY created_at DESC`,
              [actor.kommuneId, status],
            )
          : await client.query(
              `SELECT * FROM tidum_barnevern_forebyggende
                WHERE kommune_id = $1 ORDER BY created_at DESC`,
              [actor.kommuneId],
            );
        return rows;
      });
      res.json(rows.map(toApiShape));
    } catch (err) {
      console.error("[barnevern-forebyggende] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente tiltakene." });
    }
  });

  app.get("/api/barnevern/forebyggende/statistikk", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const data = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: perKategori } = await client.query(
          `SELECT kategori, status, COUNT(*)::int AS antall
             FROM tidum_barnevern_forebyggende
            WHERE kommune_id = $1 GROUP BY kategori, status ORDER BY kategori, status`,
          [actor.kommuneId],
        );
        const { rows: aktivitet } = await client.query(
          `SELECT EXTRACT(YEAR FROM a.dato)::int AS aar,
                  COUNT(*)::int AS antall_aktiviteter,
                  COALESCE(SUM(a.antall_deltakere), 0)::int AS antall_deltakere
             FROM tidum_barnevern_forebyggende_aktiviteter a
            WHERE a.kommune_id = $1 GROUP BY 1 ORDER BY 1 DESC`,
          [actor.kommuneId],
        );
        return { perKategori, aktivitetPerAar: aktivitet };
      });
      res.json(data);
    } catch (err) {
      console.error("[barnevern-forebyggende] statistikk feilet", err);
      res.status(500).json({ error: "Kunne ikke hente statistikken." });
    }
  });

  app.get("/api/barnevern/forebyggende/:id", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const data = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [tiltak] } = await client.query(
          `SELECT * FROM tidum_barnevern_forebyggende WHERE id = $1 AND kommune_id = $2`,
          [req.params.id, actor.kommuneId],
        );
        if (!tiltak) return null;
        const { rows: aktiviteter } = await client.query(
          `SELECT id, dato, beskrivelse, antall_deltakere, notat, registrert_av, created_at
             FROM tidum_barnevern_forebyggende_aktiviteter
            WHERE forebyggende_id = $1 AND kommune_id = $2 ORDER BY dato DESC`,
          [req.params.id, actor.kommuneId],
        );
        return { tiltak, aktiviteter };
      });
      if (!data) return res.status(404).json({ error: "Tiltak ikke funnet." });
      res.json({
        ...toApiShape(data.tiltak),
        aktiviteter: data.aktiviteter.map((a: any) => ({
          id: a.id,
          dato: a.dato,
          beskrivelse: a.beskrivelse,
          antallDeltakere: a.antall_deltakere,
          notat: a.notat,
          registrertAv: a.registrert_av,
        })),
      });
    } catch (err) {
      console.error("[barnevern-forebyggende] henting feilet", err);
      res.status(500).json({ error: "Kunne ikke hente tiltaket." });
    }
  });

  app.patch("/api/barnevern/forebyggende/:id", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { tittel, beskrivelse, status, samarbeidsparter, startDato, sluttDato } = req.body;
    if (status != null && !STATUSER.has(status)) {
      return res.status(400).json({ error: "Ugyldig status." });
    }
    const partFeil = validerParter(samarbeidsparter);
    if (partFeil) return res.status(400).json({ error: partFeil });

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_forebyggende
              SET tittel = COALESCE($1, tittel),
                  beskrivelse = COALESCE($2, beskrivelse),
                  status = COALESCE($3, status),
                  samarbeidsparter = COALESCE($4, samarbeidsparter),
                  start_dato = COALESCE($5, start_dato),
                  slutt_dato = COALESCE($6, slutt_dato),
                  updated_at = NOW()
            WHERE id = $7 AND kommune_id = $8 RETURNING *`,
          [
            tittel ?? null, beskrivelse ?? null, status ?? null,
            samarbeidsparter ? JSON.stringify(samarbeidsparter) : null,
            startDato ?? null, sluttDato ?? null,
            req.params.id, actor.kommuneId,
          ],
        );
        if (!updated) throw new Error("TILTAK_NOT_FOUND");
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "TILTAK_NOT_FOUND") {
        return res.status(404).json({ error: "Tiltak ikke funnet." });
      }
      console.error("[barnevern-forebyggende] oppdatering feilet", err);
      res.status(500).json({ error: "Kunne ikke oppdatere tiltaket." });
    }
  });

  app.post("/api/barnevern/forebyggende/:id/aktiviteter", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { dato, beskrivelse, antallDeltakere, notat } = req.body;
    if (!dato || !/^\d{4}-\d{2}-\d{2}$/.test(dato)) {
      return res.status(400).json({ error: "dato må være YYYY-MM-DD." });
    }
    if (!beskrivelse || typeof beskrivelse !== "string" || beskrivelse.trim().length === 0) {
      return res.status(400).json({ error: "beskrivelse er påkrevd." });
    }
    if (antallDeltakere != null && (!Number.isInteger(antallDeltakere) || antallDeltakere < 0)) {
      return res.status(400).json({ error: "antallDeltakere må være et ikke-negativt heltall." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [tiltak] } = await client.query(
          `SELECT id FROM tidum_barnevern_forebyggende WHERE id = $1 AND kommune_id = $2`,
          [req.params.id, actor.kommuneId],
        );
        if (!tiltak) throw new Error("TILTAK_NOT_FOUND");
        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_forebyggende_aktiviteter
             (forebyggende_id, kommune_id, dato, beskrivelse, antall_deltakere, notat, registrert_av)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [req.params.id, actor.kommuneId, dato, beskrivelse, antallDeltakere ?? null, notat ?? null, actor.userId],
        );
        return created;
      });
      res.status(201).json({
        id: row.id,
        dato: row.dato,
        beskrivelse: row.beskrivelse,
        antallDeltakere: row.antall_deltakere,
        notat: row.notat,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "TILTAK_NOT_FOUND") {
        return res.status(404).json({ error: "Tiltak ikke funnet." });
      }
      console.error("[barnevern-forebyggende] aktivitet feilet", err);
      res.status(500).json({ error: "Kunne ikke registrere aktiviteten." });
    }
  });
}
