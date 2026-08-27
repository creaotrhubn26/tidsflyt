import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { requireKommuneActor } from "./barnevern-melding-routes";

/**
 * Krav 10: autoritativt datagrunnlag for rapportering til ledelse,
 * statsforvalteren (halvårsrapportering) og Bufdir/SSB. Tallene beregnes
 * direkte fra saksdataene i én transaksjon — ingen sidekopier som kan
 * drifte. Selve innsendingsformatene mot Bufdir/SSB er ekstern restanse
 * (autoritative skjema/kodeverk); dette er kildetallene med metadata.
 */

function periodeFor(aar: number, halvaar: 1 | 2): { fra: Date; til: Date } {
  return halvaar === 1
    ? { fra: new Date(Date.UTC(aar, 0, 1)), til: new Date(Date.UTC(aar, 6, 1)) }
    : { fra: new Date(Date.UTC(aar, 6, 1)), til: new Date(Date.UTC(aar + 1, 0, 1)) };
}

export function registerBarnevernRapporteringRoutes(app: Express): void {
  app.get("/api/barnevern/rapportering/halvaar", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan hente rapporteringsgrunnlaget." });
    }

    const aar = Number(req.query.aar);
    const halvaar = Number(req.query.halvaar);
    if (!Number.isInteger(aar) || aar < 2020 || aar > 2100) {
      return res.status(400).json({ error: "aar er påkrevd (2020–2100)." });
    }
    if (halvaar !== 1 && halvaar !== 2) {
      return res.status(400).json({ error: "halvaar må være 1 eller 2." });
    }
    const { fra, til } = periodeFor(aar, halvaar as 1 | 2);

    try {
      const grunnlag = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [kommune] } = await client.query(
          `SELECT navn, kommunenummer FROM tidum_kommuner WHERE id = $1`,
          [actor.kommuneId],
        );

        // Meldinger mottatt i perioden, med utfall og fristkontroll.
        const { rows: [meldinger] } = await client.query(
          `SELECT
             COUNT(*)::int AS mottatt,
             COUNT(*) FILTER (WHERE prioritet = 'akutt')::int AS akutte,
             COUNT(*) FILTER (WHERE ufodt_barn)::int AS ufodt_barn,
             COUNT(*) FILTER (WHERE forelder_melding_id IS NOT NULL)::int AS tilleggsmeldinger,
             COUNT(*) FILTER (WHERE status = 'henlagt')::int AS henlagt,
             COUNT(*) FILTER (WHERE status = 'sendt_til_undersokelse')::int AS til_undersokelse,
             COUNT(*) FILTER (WHERE status IN ('mottatt', 'under_avklaring'))::int AS under_avklaring,
             COUNT(*) FILTER (
               WHERE (avklart_dato IS NOT NULL AND avklart_dato > avklaringsfrist)
                  OR (avklart_dato IS NULL AND avklaringsfrist < NOW())
             )::int AS fristbrudd
           FROM tidum_barnevern_meldinger
          WHERE kommune_id = $1 AND mottatt_dato >= $2 AND mottatt_dato < $3`,
          [actor.kommuneId, fra, til],
        );

        // Undersøkelser: startet i perioden, konkludert i perioden (fase
        // forlatt undersøkelse iht. historikken) og fristbrudd.
        const { rows: [undersokelser] } = await client.query(
          `SELECT
             (SELECT COUNT(*)::int FROM tidum_barnevern_saker
               WHERE kommune_id = $1 AND created_at >= $2 AND created_at < $3) AS startet,
             (SELECT COUNT(*)::int FROM tidum_barnevern_sak_fase_historikk
               WHERE kommune_id = $1 AND fra_fase = 'undersokelse'
                 AND created_at >= $2 AND created_at < $3) AS konkludert,
             (SELECT COUNT(*)::int FROM tidum_barnevern_sak_fase_historikk h
                JOIN tidum_barnevern_saker s ON s.id = h.sak_id AND s.kommune_id = h.kommune_id
               WHERE h.kommune_id = $1 AND h.fra_fase = 'undersokelse'
                 AND h.created_at >= $2 AND h.created_at < $3
                 AND s.undersokelsesfrist IS NOT NULL AND h.created_at > s.undersokelsesfrist) AS konkludert_etter_frist,
             (SELECT COUNT(*)::int FROM tidum_barnevern_saker
               WHERE kommune_id = $1 AND fase = 'undersokelse'
                 AND undersokelsesfrist IS NOT NULL AND undersokelsesfrist < NOW()) AS aktive_over_frist`,
          [actor.kommuneId, fra, til],
        );

        // Konklusjonsutfall i perioden.
        const { rows: konklusjoner } = await client.query(
          `SELECT til_fase, COUNT(*)::int AS antall
             FROM tidum_barnevern_sak_fase_historikk
            WHERE kommune_id = $1 AND fra_fase = 'undersokelse'
              AND created_at >= $2 AND created_at < $3
            GROUP BY til_fase`,
          [actor.kommuneId, fra, til],
        );

        // Sakstilstand ved uttrekkstidspunktet + planer.
        const { rows: [bestand] } = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE fase = 'undersokelse')::int AS i_undersokelse,
             COUNT(*) FILTER (WHERE fase = 'tiltak')::int AS i_tiltak,
             (SELECT COUNT(*)::int FROM tidum_barnevern_planer
               WHERE kommune_id = $1 AND status = 'godkjent') AS godkjente_planer,
             (SELECT COUNT(*)::int FROM tidum_barnevern_planer
               WHERE kommune_id = $1 AND status = 'godkjent'
                 AND evalueringsfrist IS NOT NULL AND evalueringsfrist < NOW()) AS planer_over_evalueringsfrist
           FROM tidum_barnevern_saker WHERE kommune_id = $1`,
          [actor.kommuneId],
        );

        // Innsyn og forebyggende i perioden.
        const { rows: [ovrig] } = await client.query(
          `SELECT
             (SELECT COUNT(*)::int FROM tidum_barnevern_innsynskrav
               WHERE kommune_id = $1 AND mottatt_dato >= $2 AND mottatt_dato < $3) AS innsynskrav,
             (SELECT COUNT(*)::int FROM tidum_barnevern_forebyggende_aktiviteter
               WHERE kommune_id = $1 AND dato >= $2::date AND dato < $3::date) AS forebyggende_aktiviteter,
             (SELECT COALESCE(SUM(antall_deltakere), 0)::int FROM tidum_barnevern_forebyggende_aktiviteter
               WHERE kommune_id = $1 AND dato >= $2::date AND dato < $3::date) AS forebyggende_deltakere`,
          [actor.kommuneId, fra, til],
        );

        return {
          metadata: {
            kommune: kommune?.navn,
            kommunenummer: kommune?.kommunenummer,
            periode: { aar, halvaar, fra: fra.toISOString(), til: til.toISOString() },
            generert: new Date().toISOString(),
            kilde: "tidum_barnevern (autoritative saksdata, beregnet ved uttrekk)",
          },
          meldinger,
          undersokelser: {
            ...undersokelser,
            konklusjoner: Object.fromEntries(konklusjoner.map((k: any) => [k.til_fase, k.antall])),
          },
          bestand,
          ovrig,
        };
      });
      res.setHeader("Cache-Control", "no-store");
      res.json(grunnlag);
    } catch (err) {
      console.error("[barnevern-rapportering] uttrekk feilet", err);
      res.status(500).json({ error: "Kunne ikke generere rapporteringsgrunnlaget." });
    }
  });
}
