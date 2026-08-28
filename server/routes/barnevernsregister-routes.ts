import type { Express, Request, Response } from "express";
import cron from "node-cron";
import {
  processDueBvrInnsendinger,
  queueBvrInnsending,
  queueDagligeBvrInnsendinger,
} from "../lib/barnevernsregister";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { requireKommuneActor } from "./barnevern-melding-routes";
import { requireSuperAdmin } from "../custom-auth";

let cronStarted = false;

export function setupBarnevernsregisterCron(): void {
  if (cronStarted) return;
  cronStarted = true;
  // Daglig 06:00: kø gårsdagens datasett for alle kommuner og prosesser.
  cron.schedule("0 6 * * *", async () => {
    try {
      const koet = await queueDagligeBvrInnsendinger();
      const resultat = await processDueBvrInnsendinger();
      console.log(`[bvr-cron] koet=${koet.koet} sendt=${resultat.sendt} feilet=${resultat.feilet}`);
    } catch (err) {
      console.error("[bvr-cron] feilet:", err);
    }
  });
  // Retry-pass hver time for rader i backoff.
  cron.schedule("30 * * * *", async () => {
    try {
      await processDueBvrInnsendinger();
    } catch (err) {
      console.error("[bvr-retry] feilet:", err);
    }
  });
}

export function registerBarnevernsregisterRoutes(app: Express): void {
  // Innsendingslogg med status/kvittering/valideringsfeil — kun leder.
  app.get("/api/barnevern/innrapportering", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan se innrapporteringen." });
    }

    try {
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, rapportdato, status, innholds_hash, valideringsfeil,
                  forsok, kvittering, feil, sendt_dato, created_at
             FROM tidum_barnevernsregister_innsendinger
            WHERE kommune_id = $1 ORDER BY rapportdato DESC LIMIT 100`,
          [actor.kommuneId],
        );
        return rows;
      });
      res.json(rows.map((r: any) => ({
        id: r.id,
        rapportdato: r.rapportdato,
        status: r.status,
        innholdsHash: r.innholds_hash,
        valideringsfeil: r.valideringsfeil,
        forsok: r.forsok,
        kvittering: r.kvittering,
        feil: r.feil,
        sendtDato: r.sendt_dato,
        createdAt: r.created_at,
      })));
    } catch (err) {
      console.error("[bvr] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente innrapporteringen." });
    }
  });

  // Manuell kjøring for egen kommune (leder) — kø valgt dato og prosesser.
  app.post("/api/barnevern/innrapportering/kjor", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan trigge innrapportering." });
    }

    const rapportdato = typeof req.body?.rapportdato === "string"
      ? req.body.rapportdato
      : new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rapportdato)) {
      return res.status(400).json({ error: "rapportdato må være YYYY-MM-DD." });
    }

    try {
      const resultat = await queueBvrInnsending(actor.kommuneId, rapportdato);
      if (!resultat.queued) return res.status(400).json({ error: resultat.reason });
      processDueBvrInnsendinger().catch((err) =>
        console.error("[bvr] umiddelbar prosessering feilet:", err),
      );
      res.status(202).json({ id: resultat.id, status: resultat.status });
    } catch (err) {
      console.error("[bvr] manuell kjøring feilet", err);
      res.status(500).json({ error: "Kunne ikke starte innrapporteringen." });
    }
  });

  app.post("/api/admin/barnevernsregister/prosesser", requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const koet = await queueDagligeBvrInnsendinger();
      const resultat = await processDueBvrInnsendinger();
      res.json({ ...koet, ...resultat });
    } catch (err) {
      console.error("[bvr] admin-prosessering feilet", err);
      res.status(500).json({ error: "Kunne ikke prosessere innsendingene." });
    }
  });
}
