import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { registerFrist, cancelFrist } from "../lib/frist-engine";
import { loggTilgang, needToKnowVilkar, requireKommuneActor } from "./barnevern-melding-routes";

const PART_RELASJONER = new Set(["forelder", "barn", "verge", "fullmektig", "annet"]);
const BESLUTNINGER = new Set(["innvilget", "delvis_innvilget", "avslatt"]);
const UTLEVERINGSKANALER = new Set(["sikker_dialog", "utskrift", "manuell"]);

// Partsinnsyn skal besvares uten ugrunnet opphold (fvl. § 18/19);
// intern behandlingsfrist settes til 5 dager.
const BEHANDLINGSFRIST_DAGER = 5;

function validerUnntak(unntak: unknown): string | null {
  if (unntak == null) return null;
  if (!Array.isArray(unntak)) return "unntak må være en liste.";
  for (const u of unntak) {
    if (!u || typeof u.hjemmel !== "string" || u.hjemmel.trim().length === 0) {
      return "Hvert unntak må ha hjemmel.";
    }
    if (typeof u.beskrivelse !== "string" || u.beskrivelse.trim().length === 0) {
      return "Hvert unntak må ha beskrivelse av hva som unntas.";
    }
  }
  return null;
}

function toApiShape(row: any) {
  return {
    id: row.id,
    sakId: row.sak_id,
    partNavn: row.part_navn,
    partRelasjon: row.part_relasjon,
    mottattDato: row.mottatt_dato,
    behandlingsfrist: row.behandlingsfrist,
    status: row.status,
    unntak: row.unntak,
    beslutningBegrunnelse: row.beslutning_begrunnelse,
    besluttetAv: row.besluttet_av,
    besluttetDato: row.besluttet_dato,
    utlevertDato: row.utlevert_dato,
    utlevertVia: row.utlevert_via,
    klageMottattDato: row.klage_mottatt_dato,
    klageOversendtDato: row.klage_oversendt_dato,
    klageNotat: row.klage_notat,
    createdAt: row.created_at,
  };
}

export function registerBarnevernInnsynRoutes(app: Express): void {
  // Mottak av innsynsbegjæring — behandlingsfrist registreres i fristmotoren.
  app.post("/api/barnevern/saker/:sakId/innsynskrav", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { partNavn, partRelasjon } = req.body;
    if (!partNavn || typeof partNavn !== "string" || partNavn.trim().length === 0) {
      return res.status(400).json({ error: "partNavn er påkrevd." });
    }
    if (!partRelasjon || !PART_RELASJONER.has(partRelasjon)) {
      return res.status(400).json({ error: "Ugyldig partRelasjon." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
          const { rows: [sak] } = await client.query(
            `SELECT id FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2${ntk.clause}`,
            [req.params.sakId, actor.kommuneId, ...ntk.params],
          );
        if (!sak) throw new Error("SAK_NOT_FOUND");
        const behandlingsfrist = new Date(Date.now() + BEHANDLINGSFRIST_DAGER * 86400000);
        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_innsynskrav
             (kommune_id, sak_id, part_navn, part_relasjon, behandlingsfrist, opprettet_av)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [actor.kommuneId, req.params.sakId, partNavn, partRelasjon, behandlingsfrist, actor.userId],
        );
        await registerFrist({
          entityType: "barnevern_innsynskrav",
          entityId: created.id,
          kommuneId: actor.kommuneId,
          fristType: "innsyn",
          dueAt: behandlingsfrist,
          notifyUserId: actor.userId,
        }, client);
        return created;
      });
      res.status(201).json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "SAK_NOT_FOUND") {
        return res.status(404).json({ error: "Sak ikke funnet." });
      }
      console.error("[barnevern-innsyn] mottak feilet", err);
      res.status(500).json({ error: "Kunne ikke registrere innsynsbegjæringen." });
    }
  });

  app.get("/api/barnevern/saker/:sakId/innsynskrav", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
          const { rows: [sak] } = await client.query(
            `SELECT id FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2${ntk.clause}`,
            [req.params.sakId, actor.kommuneId, ...ntk.params],
          );
        if (!sak) return null;
        const { rows } = await client.query(
          `SELECT * FROM tidum_barnevern_innsynskrav
            WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at DESC`,
          [req.params.sakId, actor.kommuneId],
        );
        return rows;
      });
      if (!rows) return res.status(404).json({ error: "Sak ikke funnet." });
      res.json(rows.map(toApiShape));
    } catch (err) {
      console.error("[barnevern-innsyn] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente innsynskravene." });
    }
  });

  // Beslutning — kun barnevernsleder. Delvis innvilgelse krever unntak med
  // hjemmel; avslag og delvis innvilgelse krever begrunnelse. Beslutningen
  // journalføres på saken og behandlingsfristen kanselleres.
  app.post("/api/barnevern/innsynskrav/:id/beslutning", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan beslutte innsyn." });
    }

    const { utfall, unntak, begrunnelse } = req.body;
    if (!utfall || !BESLUTNINGER.has(utfall)) {
      return res.status(400).json({ error: "utfall må være innvilget, delvis_innvilget eller avslatt." });
    }
    const unntakFeil = validerUnntak(unntak);
    if (unntakFeil) return res.status(400).json({ error: unntakFeil });
    if (utfall === "delvis_innvilget" && (!Array.isArray(unntak) || unntak.length === 0)) {
      return res.status(400).json({ error: "Delvis innvilgelse krever minst ett unntak med hjemmel." });
    }
    if (utfall !== "innvilget" && (!begrunnelse || typeof begrunnelse !== "string" || begrunnelse.trim().length === 0)) {
      return res.status(400).json({ error: "Avslag og delvis innvilgelse krever begrunnelse." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_innsynskrav
              SET status = $1, unntak = $2, beslutning_begrunnelse = $3,
                  besluttet_av = $4, besluttet_dato = NOW(), updated_at = NOW()
            WHERE id = $5 AND kommune_id = $6 AND status = 'mottatt' RETURNING *`,
          [
            utfall, JSON.stringify(unntak ?? []), begrunnelse ?? null,
            actor.userId, req.params.id, actor.kommuneId,
          ],
        );
        if (!updated) throw new Error("KRAV_NOT_FOUND");
        await cancelFrist("barnevern_innsynskrav", req.params.id, "innsyn", { kommuneId: actor.kommuneId }, client);

        const unntakTekst = (unntak ?? []).length
          ? `\nUnntatt fra innsyn: ${(unntak as any[]).map((u) => `${u.beskrivelse} (${u.hjemmel})`).join("; ")}.`
          : "";
        await client.query(
          `INSERT INTO tidum_barnevern_sak_journal
             (sak_id, kommune_id, kategori, innhold, forfatter_user_id)
           VALUES ($1, $2, 'vedtak', $3, $4)`,
          [
            updated.sak_id, actor.kommuneId,
            `Innsynsbegjæring fra ${updated.part_navn} (${updated.part_relasjon}): ${utfall.replace("_", " ")}.`
              + (begrunnelse ? `\nBegrunnelse: ${begrunnelse}` : "") + unntakTekst,
            actor.userId,
          ],
        );
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "KRAV_NOT_FOUND") {
        return res.status(404).json({ error: "Innsynskrav ikke funnet eller allerede besluttet." });
      }
      console.error("[barnevern-innsyn] beslutning feilet", err);
      res.status(500).json({ error: "Kunne ikke beslutte innsynskravet." });
    }
  });

  // Utlevering etter innvilgelse — auditlogges (krav 15). Selve innholdet
  // hentes via saksuttrekket (krav 17), som selv er logget og hashet.
  app.post("/api/barnevern/innsynskrav/:id/utlever", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { via } = req.body;
    if (!via || !UTLEVERINGSKANALER.has(via)) {
      return res.status(400).json({ error: "via må være sikker_dialog, utskrift eller manuell." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_innsynskrav
              SET status = 'utlevert', utlevert_dato = NOW(), utlevert_via = $1, updated_at = NOW()
            WHERE id = $2 AND kommune_id = $3 AND status IN ('innvilget', 'delvis_innvilget')
            RETURNING *`,
          [via, req.params.id, actor.kommuneId],
        );
        if (!updated) throw new Error("KRAV_NOT_INNVILGET");
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "nedlastet", objektType: "innsynsutlevering", objektId: updated.id,
          detaljer: { sakId: updated.sak_id, partNavn: updated.part_navn, via, antallUnntak: (updated.unntak ?? []).length },
        });
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "KRAV_NOT_INNVILGET") {
        return res.status(409).json({ error: "Utlevering krever innvilget eller delvis innvilget beslutning." });
      }
      console.error("[barnevern-innsyn] utlevering feilet", err);
      res.status(500).json({ error: "Kunne ikke registrere utleveringen." });
    }
  });

  // Klage på avslag/delvis innvilgelse; deretter oversendelse til
  // statsforvalteren (leder).
  app.post("/api/barnevern/innsynskrav/:id/klage", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { notat } = req.body;
    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_innsynskrav
              SET status = 'klage_mottatt', klage_mottatt_dato = NOW(),
                  klage_notat = COALESCE($1, klage_notat), updated_at = NOW()
            WHERE id = $2 AND kommune_id = $3
              AND status IN ('avslatt', 'delvis_innvilget', 'utlevert')
            RETURNING *`,
          [notat ?? null, req.params.id, actor.kommuneId],
        );
        if (!updated) throw new Error("KRAV_IKKE_KLAGBART");
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "KRAV_IKKE_KLAGBART") {
        return res.status(409).json({ error: "Klage forutsetter en beslutning som kan påklages." });
      }
      console.error("[barnevern-innsyn] klage feilet", err);
      res.status(500).json({ error: "Kunne ikke registrere klagen." });
    }
  });

  app.post("/api/barnevern/innsynskrav/:id/oversend-klage", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan oversende klagen." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_innsynskrav
              SET status = 'oversendt_klageinstans', klage_oversendt_dato = NOW(), updated_at = NOW()
            WHERE id = $1 AND kommune_id = $2 AND status = 'klage_mottatt' RETURNING *`,
          [req.params.id, actor.kommuneId],
        );
        if (!updated) throw new Error("KLAGE_NOT_FOUND");
        await client.query(
          `INSERT INTO tidum_barnevern_sak_journal
             (sak_id, kommune_id, kategori, innhold, forfatter_user_id)
           VALUES ($1, $2, 'notat', $3, $4)`,
          [
            updated.sak_id, actor.kommuneId,
            `Klage på innsynsbeslutning fra ${updated.part_navn} oversendt statsforvalteren.`,
            actor.userId,
          ],
        );
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "KLAGE_NOT_FOUND") {
        return res.status(409).json({ error: "Ingen mottatt klage å oversende." });
      }
      console.error("[barnevern-innsyn] oversendelse feilet", err);
      res.status(500).json({ error: "Kunne ikke oversende klagen." });
    }
  });
}
