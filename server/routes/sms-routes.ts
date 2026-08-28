import type { Express, Request, Response } from "express";
import cron from "node-cron";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { processDueSms, queueSms } from "../lib/sms/sms-gateway";
import { requireKommuneActor } from "./barnevern-melding-routes";
import { requireSuperAdmin } from "../custom-auth";

let cronStarted = false;

export function setupSmsOutboxCron(): void {
  if (cronStarted) return;
  cronStarted = true;
  // Hvert 5. minutt — no-op når ingen gateway er konfigurert.
  cron.schedule("*/5 * * * *", async () => {
    try {
      const resultat = await processDueSms();
      if (resultat.sendt || resultat.feilet) {
        console.log(`[sms-cron] sendt=${resultat.sendt} feilet=${resultat.feilet}`);
      }
    } catch (err) {
      console.error("[sms-cron] feilet:", err);
    }
  });
}

export function registerSmsRoutes(app: Express): void {
  app.post("/api/sms/send", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { telefon, melding, formaal } = req.body;
    if (!formaal || typeof formaal !== "string" || formaal.trim().length === 0) {
      return res.status(400).json({ error: "formaal er påkrevd (personvernsporbarhet)." });
    }
    if (!telefon || typeof telefon !== "string") {
      return res.status(400).json({ error: "telefon er påkrevd." });
    }
    if (!melding || typeof melding !== "string") {
      return res.status(400).json({ error: "melding er påkrevd." });
    }

    try {
      const resultat = await queueSms({
        kommuneId: actor.kommuneId,
        telefon,
        melding,
        formaal,
        opprettetAv: actor.userId,
      });
      if (!resultat.queued) return res.status(400).json({ error: resultat.reason });
      // Umiddelbart forsøk uten å blokkere svaret.
      processDueSms().catch((err) => console.error("[sms] umiddelbar prosessering feilet:", err));
      res.status(202).json({ id: resultat.id, status: "koet" });
    } catch (err) {
      console.error("[sms] køing feilet", err);
      res.status(500).json({ error: "Kunne ikke legge meldingen i kø." });
    }
  });

  app.get("/api/sms/utboks", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan se utboksen." });
    }

    try {
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, mottaker_telefon, formaal, status, reservasjon_status,
                  forsok, feil, sendt_dato, created_at
             FROM tidum_sms_utboks
            WHERE kommune_id = $1 ORDER BY created_at DESC LIMIT 200`,
          [actor.kommuneId],
        );
        return rows;
      });
      // Meldingsinnholdet eksponeres bevisst ikke i listeflaten.
      res.json(rows.map((r: any) => ({
        id: r.id,
        mottakerTelefon: r.mottaker_telefon,
        formaal: r.formaal,
        status: r.status,
        reservasjonStatus: r.reservasjon_status,
        forsok: r.forsok,
        feil: r.feil,
        sendtDato: r.sendt_dato,
        createdAt: r.created_at,
      })));
    } catch (err) {
      console.error("[sms] utboks-listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente utboksen." });
    }
  });

  app.post("/api/admin/sms/prosesser", requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      res.json(await processDueSms());
    } catch (err) {
      console.error("[sms] manuell prosessering feilet", err);
      res.status(500).json({ error: "Kunne ikke prosessere utboksen." });
    }
  });
}
