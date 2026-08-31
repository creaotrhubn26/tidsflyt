import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { requireKommuneActor } from "./barnevern-melding-routes";

/**
 * Krav 13: nøkkeltall med DOKUMENTERT herkomst. Katalogen under er selve
 * svaret på «beskriv hvordan nøkkeltall hentes»: hver KPI bærer kilde,
 * formel (den faktiske SQL-en som kjøres), eier og frekvens — og
 * endepunktet beregner alle i ÉN transaksjon mot de autoritative
 * saksdataene, så tallet og beskrivelsen aldri kan drifte fra hverandre.
 */

interface KpiDefinisjon {
  id: string;
  navn: string;
  beskrivelse: string;
  kilde: string;
  eier: string;
  frekvens: string;
  enhet: "antall" | "prosent" | "dager";
  /** SQL som returnerer én rad med kolonnen `verdi`; $1 = kommune_id. */
  sql: string;
  /** Valgfri: samme mål for forrige periode (én rad, kolonne `verdi`). */
  trendSql?: string;
  /** Valgfri: tidsserie for sparkline — rader med kolonnene `punkt` (sorterbar) og `verdi`. */
  serieSql?: string;
}

export const KPI_KATALOG: KpiDefinisjon[] = [
  {
    id: "meldinger_30d",
    navn: "Nye meldinger siste 30 dager",
    beskrivelse: "Antall bekymringsmeldinger mottatt siste 30 dager, alle kilder.",
    kilde: "tidum_barnevern_meldinger.mottatt_dato",
    eier: "Barnevernsleder",
    frekvens: "Løpende (beregnes ved oppslag)",
    enhet: "antall",
    sql: `SELECT COUNT(*)::float AS verdi FROM tidum_barnevern_meldinger
           WHERE kommune_id = $1 AND mottatt_dato >= NOW() - interval '30 days'`,
    trendSql: `SELECT COUNT(*)::float AS verdi FROM tidum_barnevern_meldinger
           WHERE kommune_id = $1
             AND mottatt_dato >= NOW() - interval '60 days'
             AND mottatt_dato < NOW() - interval '30 days'`,
    serieSql: `SELECT uke.start AS punkt,
                  (SELECT COUNT(*)::float FROM tidum_barnevern_meldinger
                    WHERE kommune_id = $1
                      AND mottatt_dato >= uke.start
                      AND mottatt_dato < uke.start + interval '7 days') AS verdi
             FROM generate_series(
                    date_trunc('week', NOW()) - interval '7 weeks',
                    date_trunc('week', NOW()), interval '7 days') AS uke(start)
            ORDER BY uke.start`,
  },
  {
    id: "avklart_innen_frist_90d",
    navn: "Andel meldinger avklart innen frist (90 d)",
    beskrivelse: "Avklarte meldinger siste 90 dager der avklaringen skjedde innen avklaringsfristen (bvl. § 2-1).",
    kilde: "tidum_barnevern_meldinger.avklart_dato vs avklaringsfrist",
    eier: "Barnevernsleder",
    frekvens: "Løpende",
    enhet: "prosent",
    sql: `SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                 ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE avklart_dato <= avklaringsfrist) / COUNT(*), 1)
                 END::float AS verdi
            FROM tidum_barnevern_meldinger
           WHERE kommune_id = $1 AND avklart_dato >= NOW() - interval '90 days'`,
  },
  {
    id: "snitt_avklaringstid_90d",
    navn: "Gjennomsnittlig avklaringstid (90 d)",
    beskrivelse: "Snitt antall dager fra mottak til avklaring for meldinger avklart siste 90 dager.",
    kilde: "tidum_barnevern_meldinger: avklart_dato − mottatt_dato",
    eier: "Barnevernsleder",
    frekvens: "Løpende",
    enhet: "dager",
    sql: `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (avklart_dato - mottatt_dato)) / 86400)::numeric, 1)::float AS verdi
            FROM tidum_barnevern_meldinger
           WHERE kommune_id = $1 AND avklart_dato >= NOW() - interval '90 days'`,
  },
  {
    id: "aktive_undersokelser",
    navn: "Aktive undersøkelser",
    beskrivelse: "Saker som står i fase undersøkelse nå.",
    kilde: "tidum_barnevern_saker.fase = 'undersokelse'",
    eier: "Barnevernsleder",
    frekvens: "Løpende",
    enhet: "antall",
    sql: `SELECT COUNT(*)::float AS verdi FROM tidum_barnevern_saker
           WHERE kommune_id = $1 AND fase = 'undersokelse'`,
  },
  {
    id: "undersokelser_over_frist",
    navn: "Undersøkelser over frist",
    beskrivelse: "Aktive undersøkelser der tremånedersfristen (bvl. § 2-2) er oversittet.",
    kilde: "tidum_barnevern_saker.undersokelsesfrist < NOW()",
    eier: "Barnevernsleder",
    frekvens: "Løpende",
    enhet: "antall",
    sql: `SELECT COUNT(*)::float AS verdi FROM tidum_barnevern_saker
           WHERE kommune_id = $1 AND fase = 'undersokelse'
             AND undersokelsesfrist IS NOT NULL AND undersokelsesfrist < NOW()`,
  },
  {
    id: "saker_i_tiltak",
    navn: "Saker i tiltak",
    beskrivelse: "Saker som står i fase tiltak nå.",
    kilde: "tidum_barnevern_saker.fase = 'tiltak'",
    eier: "Barnevernsleder",
    frekvens: "Løpende",
    enhet: "antall",
    sql: `SELECT COUNT(*)::float AS verdi FROM tidum_barnevern_saker
           WHERE kommune_id = $1 AND fase = 'tiltak'`,
  },
  {
    id: "planer_over_evalueringsfrist",
    navn: "Planer over evalueringsfrist",
    beskrivelse: "Godkjente tiltaks-/omsorgsplaner der evalueringsfristen er oversittet.",
    kilde: "tidum_barnevern_planer (status='godkjent', evalueringsfrist < NOW())",
    eier: "Barnevernsleder",
    frekvens: "Løpende",
    enhet: "antall",
    sql: `SELECT COUNT(*)::float AS verdi FROM tidum_barnevern_planer
           WHERE kommune_id = $1 AND status = 'godkjent'
             AND evalueringsfrist IS NOT NULL AND evalueringsfrist < NOW()`,
  },
  {
    id: "apne_oppgaver_over_frist",
    navn: "Åpne oppgaver over frist",
    beskrivelse: "Åpne oppgaver på melding/sak der fristen er passert.",
    kilde: "tidum_barnevern_oppgaver (status='apen', frist < NOW())",
    eier: "Barnevernsleder",
    frekvens: "Løpende",
    enhet: "antall",
    sql: `SELECT COUNT(*)::float AS verdi FROM tidum_barnevern_oppgaver
           WHERE kommune_id = $1 AND status = 'apen'
             AND frist IS NOT NULL AND frist < NOW()`,
  },
  {
    id: "innsyn_under_behandling",
    navn: "Innsynskrav under behandling",
    beskrivelse: "Mottatte innsynsbegjæringer som ennå ikke er besluttet.",
    kilde: "tidum_barnevern_innsynskrav.status = 'mottatt'",
    eier: "Barnevernsleder",
    frekvens: "Løpende",
    enhet: "antall",
    sql: `SELECT COUNT(*)::float AS verdi FROM tidum_barnevern_innsynskrav
           WHERE kommune_id = $1 AND status = 'mottatt'`,
  },
  {
    id: "forebyggende_deltakere_iaar",
    navn: "Forebyggende: deltakere i år",
    beskrivelse: "Sum deltakere på forebyggende aktiviteter hittil i år.",
    kilde: "tidum_barnevern_forebyggende_aktiviteter.antall_deltakere",
    eier: "Barnevernsleder",
    frekvens: "Løpende",
    enhet: "antall",
    sql: `SELECT COALESCE(SUM(antall_deltakere), 0)::float AS verdi
            FROM tidum_barnevern_forebyggende_aktiviteter
           WHERE kommune_id = $1 AND dato >= date_trunc('year', NOW())::date`,
  },
];

export function registerBarnevernKpiRoutes(app: Express): void {
  app.get("/api/barnevern/kpi", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan hente nøkkeltallene." });
    }

    try {
      const kpier = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const resultater = [];
        for (const kpi of KPI_KATALOG) {
          const { rows: [rad] } = await client.query(kpi.sql, [actor.kommuneId]);
          const forrige = kpi.trendSql
            ? (await client.query(kpi.trendSql, [actor.kommuneId])).rows[0]?.verdi ?? null
            : null;
          const serie = kpi.serieSql
            ? (await client.query(kpi.serieSql, [actor.kommuneId])).rows.map((r: any) => Number(r.verdi))
            : null;
          resultater.push({
            id: kpi.id,
            navn: kpi.navn,
            beskrivelse: kpi.beskrivelse,
            kilde: kpi.kilde,
            formel: kpi.sql.replace(/\s+/g, " ").trim(),
            eier: kpi.eier,
            frekvens: kpi.frekvens,
            enhet: kpi.enhet,
            verdi: rad?.verdi ?? null,
            forrigeVerdi: forrige,
            serie,
          });
        }
        return resultater;
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ generert: new Date().toISOString(), kpier });
    } catch (err) {
      console.error("[barnevern-kpi] beregning feilet", err);
      res.status(500).json({ error: "Kunne ikke beregne nøkkeltallene." });
    }
  });
}
