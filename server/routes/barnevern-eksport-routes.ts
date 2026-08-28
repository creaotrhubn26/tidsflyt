import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { spreadsheetSafe } from "../lib/export-service";
import { loggTilgang, requireKommuneActor } from "./barnevern-melding-routes";

/**
 * Krav 12: tidsavgrenset CSV-eksport av barnevernsdatasett — kun
 * barnevernsleder, obligatorisk periode, fødselsnummer maskeres
 * (fødselsdato beholdes, personnummerdelen fjernes), regnearkformler
 * nøytraliseres og hver eksport auditlogges (krav 15).
 */

const DATO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** DDMMYY***** — beholder fødselsdato, maskerer personnummerdelen. */
function maskerFnr(fnr: string | null): string {
  if (!fnr) return "";
  return `${fnr.slice(0, 6)}*****`;
}

function csvCelle(value: unknown): string {
  const safe = spreadsheetSafe(value);
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function tilCsv(header: string[], rader: unknown[][]): string {
  return [header, ...rader]
    .map((rad) => rad.map(csvCelle).join(";"))
    .join("\r\n");
}

function periodeFraQuery(req: Request): { fra: string; til: string } | null {
  const { fra, til } = req.query;
  if (typeof fra !== "string" || typeof til !== "string") return null;
  if (!DATO_REGEX.test(fra) || !DATO_REGEX.test(til)) return null;
  if (fra > til) return null;
  return { fra, til };
}

function sendCsv(res: Response, filnavn: string, innhold: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filnavn}"`);
  res.setHeader("Cache-Control", "no-store");
  // BOM for korrekte æøå i Excel.
  res.send(`﻿${innhold}`);
}

export function registerBarnevernEksportRoutes(app: Express): void {
  app.get("/api/barnevern/eksport/meldinger.csv", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan eksportere." });
    }
    const periode = periodeFraQuery(req);
    if (!periode) return res.status(400).json({ error: "fra og til (YYYY-MM-DD, fra <= til) er påkrevd." });

    try {
      const csv = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows } = await client.query(
          `SELECT meldingsnummer, mottatt_dato, kilde, prioritet, melder_kategori,
                  barn_navn, barn_fodselsnummer, ufodt_barn, status,
                  avklaringsfrist, avklart_dato,
                  ((avklart_dato IS NOT NULL AND avklart_dato > avklaringsfrist)
                    OR (avklart_dato IS NULL AND avklaringsfrist < NOW())) AS fristbrudd
             FROM tidum_barnevern_meldinger
            WHERE kommune_id = $1 AND mottatt_dato >= $2::date AND mottatt_dato < ($3::date + 1)
            ORDER BY mottatt_dato ASC`,
          [actor.kommuneId, periode.fra, periode.til],
        );
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "nedlastet", objektType: "eksport_meldinger",
          objektId: "00000000-0000-0000-0000-000000000000",
          detaljer: { periode, antallRader: rows.length },
        });
        return tilCsv(
          ["meldingsnummer", "mottatt", "kilde", "prioritet", "melderkategori",
           "barn", "fodselsnummer", "ufodt_barn", "status", "avklaringsfrist", "avklart", "fristbrudd"],
          rows.map((r: any) => [
            r.meldingsnummer, r.mottatt_dato?.toISOString?.() ?? r.mottatt_dato, r.kilde, r.prioritet,
            r.melder_kategori, r.barn_navn ?? "", maskerFnr(r.barn_fodselsnummer),
            r.ufodt_barn ? "ja" : "nei", r.status,
            r.avklaringsfrist?.toISOString?.() ?? "", r.avklart_dato?.toISOString?.() ?? "",
            r.fristbrudd ? "ja" : "nei",
          ]),
        );
      });
      sendCsv(res, `barnevern-meldinger-${periode.fra}-${periode.til}.csv`, csv);
    } catch (err) {
      console.error("[barnevern-eksport] meldinger feilet", err);
      res.status(500).json({ error: "Kunne ikke generere eksporten." });
    }
  });

  app.get("/api/barnevern/eksport/saker.csv", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan eksportere." });
    }
    const periode = periodeFraQuery(req);
    if (!periode) return res.status(400).json({ error: "fra og til (YYYY-MM-DD, fra <= til) er påkrevd." });

    try {
      const csv = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows } = await client.query(
          `SELECT s.saksnummer, s.created_at, s.barn_navn, s.barn_fodselsnummer, s.fase,
                  s.undersokelsesfrist, s.avsluttet_dato,
                  (SELECT COUNT(*)::int FROM tidum_barnevern_sak_journal j
                    WHERE j.sak_id = s.id AND j.kommune_id = s.kommune_id) AS journaloppforinger
             FROM tidum_barnevern_saker s
            WHERE s.kommune_id = $1 AND s.created_at >= $2::date AND s.created_at < ($3::date + 1)
            ORDER BY s.created_at ASC`,
          [actor.kommuneId, periode.fra, periode.til],
        );
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "nedlastet", objektType: "eksport_saker",
          objektId: "00000000-0000-0000-0000-000000000000",
          detaljer: { periode, antallRader: rows.length },
        });
        return tilCsv(
          ["saksnummer", "opprettet", "barn", "fodselsnummer", "fase",
           "undersokelsesfrist", "avsluttet", "journaloppforinger"],
          rows.map((r: any) => [
            r.saksnummer, r.created_at?.toISOString?.() ?? "", r.barn_navn ?? "",
            maskerFnr(r.barn_fodselsnummer), r.fase,
            r.undersokelsesfrist?.toISOString?.() ?? "", r.avsluttet_dato?.toISOString?.() ?? "",
            r.journaloppforinger,
          ]),
        );
      });
      sendCsv(res, `barnevern-saker-${periode.fra}-${periode.til}.csv`, csv);
    } catch (err) {
      console.error("[barnevern-eksport] saker feilet", err);
      res.status(500).json({ error: "Kunne ikke generere eksporten." });
    }
  });
}
