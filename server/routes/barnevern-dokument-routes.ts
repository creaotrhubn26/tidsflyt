import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { queueBarnevernJournalArchiving } from "../lib/archive/archive-service";
import { loggTilgang, needToKnowVilkar, requireKommuneActor } from "./barnevern-melding-routes";
import {
  SikkerUtsendelseError,
  processSecureNotificationOutbox,
  sendSystemmeldingViaSikkerDialog,
} from "./secure-dialog-routes";
import { lagDokumentPdf } from "../lib/barnevern-dokument-pdf";

/**
 * Kodefaste standardmaler (krav 6). Malinnholdet flettes og snapshotes inn
 * i dokumentet ved opprettelse, så malendringer i kode aldri endrer
 * utstedte dokumenter — det er versjonssikringen.
 * ponytail: kommune-egne maler i DB legges til når en kommune ber om det.
 */
export const DOKUMENTMALER: Record<string, {
  dokumenttype: "vedtak" | "brev";
  tittel: string;
  hjemmel?: string;
  innhold: string;
}> = {
  vedtak_hjelpetiltak: {
    dokumenttype: "vedtak",
    tittel: "Vedtak om hjelpetiltak",
    hjemmel: "barnevernsloven § 3-1",
    innhold: [
      "VEDTAK I BARNEVERNSSAK {{saksnummer}}",
      "",
      "Barneverntjenesten i {{kommune}} har {{dato}} fattet følgende vedtak for {{barnNavn}}:",
      "",
      "Med hjemmel i {{hjemmel}} innvilges hjelpetiltak i henhold til gjeldende tiltaksplan.",
      "",
      "Vedtaket kan påklages til statsforvalteren innen tre uker etter mottak, jf. forvaltningsloven §§ 28 og 29.",
    ].join("\n"),
  },
  vedtak_henleggelse_undersokelse: {
    dokumenttype: "vedtak",
    tittel: "Vedtak om henleggelse etter undersøkelse",
    hjemmel: "barnevernsloven § 2-5",
    innhold: [
      "VEDTAK I BARNEVERNSSAK {{saksnummer}}",
      "",
      "Barneverntjenesten i {{kommune}} har {{dato}} avsluttet undersøkelsen for {{barnNavn}}.",
      "",
      "Med hjemmel i {{hjemmel}} henlegges saken uten videre tiltak.",
      "",
      "Vedtaket kan påklages til statsforvalteren innen tre uker etter mottak, jf. forvaltningsloven §§ 28 og 29.",
    ].join("\n"),
  },
  brev_innkalling_samtale: {
    dokumenttype: "brev",
    tittel: "Innkalling til samtale",
    innhold: [
      "Innkalling til samtale — sak {{saksnummer}}",
      "",
      "Barneverntjenesten i {{kommune}} inviterer til samtale i forbindelse med saken som gjelder {{barnNavn}}.",
      "",
      "Ta kontakt for å avtale tidspunkt. Du kan ha med deg en person du stoler på.",
    ].join("\n"),
  },
  brev_orientering: {
    dokumenttype: "brev",
    tittel: "Orientering fra barneverntjenesten",
    innhold: [
      "Orientering — sak {{saksnummer}}",
      "",
      "Barneverntjenesten i {{kommune}} orienterer med dette om status i saken som gjelder {{barnNavn}}.",
    ].join("\n"),
  },
};

/**
 * Malkatalogen for en kommune: kodefaste standardmaler + kommunens egne
 * aktive maler fra migrasjon 104. Kommunens mal overstyrer en kodefast
 * ved samme mal_id.
 */
async function hentMalKatalog(client: any, kommuneId: number): Promise<Map<string, {
  dokumenttype: "vedtak" | "brev"; tittel: string; hjemmel?: string | null; innhold: string; egen: boolean;
}>> {
  const katalog = new Map<string, any>();
  for (const [malId, mal] of Object.entries(DOKUMENTMALER)) {
    katalog.set(malId, { ...mal, egen: false });
  }
  const { rows } = await client.query(
    `SELECT mal_id, dokumenttype, tittel, hjemmel, innhold
       FROM tidum_barnevern_dokumentmaler
      WHERE kommune_id = $1 AND aktiv = TRUE ORDER BY mal_id`,
    [kommuneId],
  );
  for (const r of rows) {
    katalog.set(r.mal_id, { dokumenttype: r.dokumenttype, tittel: r.tittel, hjemmel: r.hjemmel, innhold: r.innhold, egen: true });
  }
  return katalog;
}

function flett(mal: string, felter: Record<string, string>): string {
  return mal.replace(/\{\{(\w+)\}\}/g, (_m, nokkel) => felter[nokkel] ?? `{{${nokkel}}}`);
}

function toApiShape(row: any) {
  return {
    id: row.id,
    sakId: row.sak_id,
    dokumenttype: row.dokumenttype,
    malId: row.mal_id,
    tittel: row.tittel,
    hjemmel: row.hjemmel,
    innhold: row.innhold,
    mottaker: row.mottaker,
    planId: row.plan_id,
    status: row.status,
    godkjentAv: row.godkjent_av,
    godkjentDato: row.godkjent_dato,
    ekspedertDato: row.ekspedert_dato,
    ekspedertVia: row.ekspedert_via,
    journalEntryId: row.journal_entry_id,
    createdAt: row.created_at,
  };
}

export function registerBarnevernDokumentRoutes(app: Express): void {
  app.get("/api/barnevern/dokumentmaler", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const katalog = await withKommuneRlsContext(actor.kommuneId, (client) =>
        hentMalKatalog(client, actor.kommuneId));
      res.json([...katalog.entries()].map(([malId, mal]) => ({
        malId,
        dokumenttype: mal.dokumenttype,
        tittel: mal.tittel,
        hjemmel: mal.hjemmel ?? null,
        egen: mal.egen,
      })));
    } catch (err) {
      console.error("[barnevern-dokument] malkatalog feilet", err);
      res.status(500).json({ error: "Kunne ikke hente malene." });
    }
  });

  // Kommune-egne maler (krav 6-rest): kun barnevernsleder. Malinnholdet
  // snapshotes fortsatt inn i dokumentet — endringer her rører aldri
  // utstedte dokumenter.
  app.post("/api/barnevern/dokumentmaler", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan administrere maler." });
    }
    const { malId, dokumenttype, tittel, hjemmel, innhold } = req.body;
    if (typeof malId !== "string" || !/^[a-z0-9_]{2,64}$/.test(malId)) {
      return res.status(400).json({ error: "malId må være 2–64 tegn a-z, 0-9 og _." });
    }
    if (dokumenttype !== "vedtak" && dokumenttype !== "brev") {
      return res.status(400).json({ error: "dokumenttype må være vedtak eller brev." });
    }
    if (!tittel?.trim() || !innhold?.trim()) {
      return res.status(400).json({ error: "tittel og innhold er påkrevd." });
    }
    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_dokumentmaler
             (kommune_id, mal_id, dokumenttype, tittel, hjemmel, innhold, opprettet_av)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (kommune_id, mal_id) DO UPDATE
             SET dokumenttype = EXCLUDED.dokumenttype, tittel = EXCLUDED.tittel,
                 hjemmel = EXCLUDED.hjemmel, innhold = EXCLUDED.innhold,
                 aktiv = TRUE, updated_at = NOW()
           RETURNING *`,
          [actor.kommuneId, malId, dokumenttype, tittel.trim(), hjemmel ?? null, innhold, actor.userId],
        );
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "endret", objektType: "dokumentmal", objektId: created.id,
          detaljer: { malId, dokumenttype },
        });
        return created;
      });
      res.status(201).json({ id: row.id, malId: row.mal_id, dokumenttype: row.dokumenttype, tittel: row.tittel, hjemmel: row.hjemmel, egen: true });
    } catch (err) {
      console.error("[barnevern-dokument] mal-lagring feilet", err);
      res.status(500).json({ error: "Kunne ikke lagre malen." });
    }
  });

  app.delete("/api/barnevern/dokumentmaler/:malId", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan administrere maler." });
    }
    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_dokumentmaler SET aktiv = FALSE, updated_at = NOW()
            WHERE kommune_id = $1 AND mal_id = $2 AND aktiv = TRUE RETURNING id`,
          [actor.kommuneId, req.params.malId],
        );
        return updated ?? null;
      });
      if (!row) return res.status(404).json({ error: "Kommunemal ikke funnet." });
      res.json({ ok: true });
    } catch (err) {
      console.error("[barnevern-dokument] mal-deaktivering feilet", err);
      res.status(500).json({ error: "Kunne ikke deaktivere malen." });
    }
  });

  // Opprett dokument fra mal — flettes med saksdata ved opprettelse.
  app.post("/api/barnevern/saker/:sakId/dokumenter", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { malId, mottaker, planId, hjemmel } = req.body;
    if (typeof malId !== "string") return res.status(400).json({ error: "Ukjent malId." });

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const mal = (await hentMalKatalog(client, actor.kommuneId)).get(malId);
        if (!mal) throw new Error("MAL_NOT_FOUND");
        const ntk = needToKnowVilkar(actor, "s.tildelt_saksbehandler_id", 3, "s.id");
        const { rows: [sak] } = await client.query(
          `SELECT s.*, k.navn AS kommune_navn
             FROM tidum_barnevern_saker s
             JOIN tidum_kommuner k ON k.id = s.kommune_id
            WHERE s.id = $1 AND s.kommune_id = $2${ntk.clause}`,
          [req.params.sakId, actor.kommuneId, ...ntk.params],
        );
        if (!sak) throw new Error("SAK_NOT_FOUND");
        if (planId) {
          const { rows: [plan] } = await client.query(
            `SELECT id FROM tidum_barnevern_planer
              WHERE id = $1 AND sak_id = $2 AND kommune_id = $3`,
            [planId, req.params.sakId, actor.kommuneId],
          );
          if (!plan) throw new Error("PLAN_NOT_FOUND");
        }

        const valgtHjemmel = hjemmel ?? mal.hjemmel ?? null;
        const innhold = flett(mal.innhold, {
          saksnummer: sak.saksnummer,
          barnNavn: sak.barn_navn ?? "barnet",
          kommune: sak.kommune_navn,
          dato: new Intl.DateTimeFormat("nb-NO", { dateStyle: "long" }).format(new Date()),
          hjemmel: valgtHjemmel ?? "",
        });

        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_dokumenter
             (kommune_id, sak_id, dokumenttype, mal_id, tittel, hjemmel, innhold, mottaker, plan_id, opprettet_av)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
          [
            actor.kommuneId, req.params.sakId, mal.dokumenttype, malId, mal.tittel,
            valgtHjemmel, innhold, mottaker ? JSON.stringify(mottaker) : null,
            planId ?? null, actor.userId,
          ],
        );
        return created;
      });
      res.status(201).json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "MAL_NOT_FOUND") {
        return res.status(400).json({ error: "Ukjent malId." });
      }
      if (err instanceof Error && err.message === "SAK_NOT_FOUND") {
        return res.status(404).json({ error: "Sak ikke funnet." });
      }
      if (err instanceof Error && err.message === "PLAN_NOT_FOUND") {
        return res.status(400).json({ error: "planId peker ikke på en plan på denne saken." });
      }
      console.error("[barnevern-dokument] opprettelse feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette dokumentet." });
    }
  });

  // PDF-nedlasting (krav 6): behovsprøvd via sakens saksbehandler-vilkår,
  // hver nedlasting auditlogges. Utkast har vannmerke-status i topplinjen.
  app.get("/api/barnevern/dokumenter/:id/pdf", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const data = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntk = needToKnowVilkar(actor, "sak.tildelt_saksbehandler_id", 3, "sak.id");
        const { rows: [row] } = await client.query(
          `SELECT dokument.*, sak.saksnummer, kommune.navn AS kommune_navn
             FROM tidum_barnevern_dokumenter dokument
             JOIN tidum_barnevern_saker sak ON sak.id = dokument.sak_id AND sak.kommune_id = dokument.kommune_id
             JOIN tidum_kommuner kommune ON kommune.id = dokument.kommune_id
            WHERE dokument.id = $1 AND dokument.kommune_id = $2${ntk.clause}`,
          [req.params.id, actor.kommuneId, ...ntk.params],
        );
        if (!row) return null;
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "nedlastet", objektType: "dokument_pdf", objektId: row.id,
          detaljer: { sakId: row.sak_id, dokumenttype: row.dokumenttype, status: row.status },
        });
        return row;
      });
      if (!data) return res.status(404).json({ error: "Dokument ikke funnet." });

      const pdf = await lagDokumentPdf({
        kommuneNavn: data.kommune_navn,
        saksnummer: data.saksnummer,
        dokumenttype: data.dokumenttype,
        tittel: data.status === "utkast" ? `${data.tittel} (UTKAST)` : data.tittel,
        hjemmel: data.hjemmel,
        innhold: data.innhold,
        mottaker: data.mottaker,
        status: data.status,
        godkjentDato: data.godkjent_dato,
        ekspedertDato: data.ekspedert_dato,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store");
      // inline: åpnes i nettleserens PDF-visning (nedlasting via viewerens egen knapp)
      res.setHeader("Content-Disposition", `inline; filename="dokument-${data.id}.pdf"`);
      res.send(pdf);
    } catch (err) {
      console.error("[barnevern-dokument] PDF feilet", err);
      res.status(500).json({ error: "Kunne ikke generere PDF." });
    }
  });

  app.get("/api/barnevern/saker/:sakId/dokumenter", async (req: Request, res: Response) => {
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
          `SELECT * FROM tidum_barnevern_dokumenter
            WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at DESC`,
          [req.params.sakId, actor.kommuneId],
        );
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "lest", objektType: "dokumenter", objektId: req.params.sakId,
        });
        return rows;
      });
      if (!rows) return res.status(404).json({ error: "Sak ikke funnet." });
      res.json(rows.map(toApiShape));
    } catch (err) {
      console.error("[barnevern-dokument] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente dokumentene." });
    }
  });

  // Rediger utkast (godkjente/ekspederte dokumenter er uforanderlige).
  app.patch("/api/barnevern/dokumenter/:id", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { tittel, innhold, hjemmel, mottaker } = req.body;
    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_dokumenter
              SET tittel = COALESCE($1, tittel),
                  innhold = COALESCE($2, innhold),
                  hjemmel = COALESCE($3, hjemmel),
                  mottaker = COALESCE($4, mottaker),
                  updated_at = NOW()
            WHERE id = $5 AND kommune_id = $6 AND status = 'utkast' RETURNING *`,
          [
            tittel ?? null, innhold ?? null, hjemmel ?? null,
            mottaker ? JSON.stringify(mottaker) : null,
            req.params.id, actor.kommuneId,
          ],
        );
        if (!updated) throw new Error("UTKAST_NOT_FOUND");
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "UTKAST_NOT_FOUND") {
        return res.status(404).json({ error: "Utkast ikke funnet — godkjente dokumenter endres ikke." });
      }
      console.error("[barnevern-dokument] redigering feilet", err);
      res.status(500).json({ error: "Kunne ikke oppdatere dokumentet." });
    }
  });

  // Godkjenning: vedtak krever barnevernsleder; brev kan godkjennes av
  // saksbehandler selv.
  app.post("/api/barnevern/dokumenter/:id/godkjenn", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [dokument] } = await client.query(
          `SELECT * FROM tidum_barnevern_dokumenter
            WHERE id = $1 AND kommune_id = $2 AND status = 'utkast' FOR UPDATE`,
          [req.params.id, actor.kommuneId],
        );
        if (!dokument) throw new Error("UTKAST_NOT_FOUND");
        if (dokument.dokumenttype === "vedtak" && actor.role !== "barnevernsleder") {
          throw new Error("KREVER_LEDER");
        }
        const { rows: [godkjent] } = await client.query(
          `UPDATE tidum_barnevern_dokumenter
              SET status = 'godkjent', godkjent_av = $1, godkjent_dato = NOW(), updated_at = NOW()
            WHERE id = $2 AND kommune_id = $3 RETURNING *`,
          [actor.userId, req.params.id, actor.kommuneId],
        );
        return godkjent;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "UTKAST_NOT_FOUND") {
        return res.status(404).json({ error: "Utkast ikke funnet." });
      }
      if (err instanceof Error && err.message === "KREVER_LEDER") {
        return res.status(403).json({ error: "Vedtak krever barnevernsleders godkjenning." });
      }
      console.error("[barnevern-dokument] godkjenning feilet", err);
      res.status(500).json({ error: "Kunne ikke godkjenne dokumentet." });
    }
  });

  // Ekspedering: journalfører dokumentet (som igjen går i arkiv-outboxen).
  app.post("/api/barnevern/dokumenter/:id/ekspeder", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { via } = req.body;
    if (via !== "sikker_dialog" && via !== "manuell") {
      return res.status(400).json({ error: "via må være 'sikker_dialog' eller 'manuell'." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [dokument] } = await client.query(
          `SELECT * FROM tidum_barnevern_dokumenter
            WHERE id = $1 AND kommune_id = $2 AND status = 'godkjent' FOR UPDATE`,
          [req.params.id, actor.kommuneId],
        );
        if (!dokument) throw new Error("GODKJENT_NOT_FOUND");

        const mottakerNavn = dokument.mottaker?.navn ? ` til ${dokument.mottaker.navn}` : "";
        if (via === "sikker_dialog") {
          const sendt = await sendSystemmeldingViaSikkerDialog(client, {
            kommuneId: actor.kommuneId,
            sakId: dokument.sak_id,
            senderUserId: actor.userId,
            subject: dokument.tittel,
            content: `${dokument.tittel}\n\n${dokument.innhold}`,
          });
          (dokument as any).sikkerMeldingId = sendt.messageId;
        }
        const { rows: [journalEntry] } = await client.query(
          `INSERT INTO tidum_barnevern_sak_journal
             (sak_id, kommune_id, kategori, innhold, forfatter_user_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [
            dokument.sak_id, actor.kommuneId,
            dokument.dokumenttype === "vedtak" ? "vedtak" : "notat",
            `${dokument.tittel} — ekspedert ${via === "sikker_dialog" ? "via sikker dialog" : "manuelt"}${mottakerNavn}.\n\n${dokument.innhold}`,
            actor.userId,
          ],
        );
        const { rows: [ekspedert] } = await client.query(
          `UPDATE tidum_barnevern_dokumenter
              SET status = 'ekspedert', ekspedert_dato = NOW(), ekspedert_via = $1,
                  journal_entry_id = $2, updated_at = NOW()
            WHERE id = $3 AND kommune_id = $4 RETURNING *`,
          [via, journalEntry.id, req.params.id, actor.kommuneId],
        );
        return { ...ekspedert, sikkerMeldingId: (dokument as any).sikkerMeldingId };
      });
      // Best-effort varsel-utsendelse for sikker dialog-meldingen etter commit.
      if (row.sikkerMeldingId) {
        processSecureNotificationOutbox(row.sikkerMeldingId).catch((err) =>
          console.error(`[barnevern-dokument] varselkø feilet for ${row.sikkerMeldingId}:`, err?.message ?? err),
        );
      }
      // Best-effort arkiv-outbox for journalføringen etter commit.
      if (row.journal_entry_id) {
        queueBarnevernJournalArchiving(row.journal_entry_id, actor.kommuneId).catch((err) =>
          console.error(`[barnevern-dokument] arkivkø feilet for ${row.journal_entry_id}:`, err?.message ?? err),
        );
      }
      res.json({ ...toApiShape(row), sikkerMeldingId: row.sikkerMeldingId ?? null });
    } catch (err) {
      if (err instanceof Error && err.message === "GODKJENT_NOT_FOUND") {
        return res.status(404).json({ error: "Godkjent dokument ikke funnet — godkjenn før ekspedering." });
      }
      if (err instanceof SikkerUtsendelseError) {
        return res.status(409).json({ error: err.message, code: err.code });
      }
      console.error("[barnevern-dokument] ekspedering feilet", err);
      res.status(500).json({ error: "Kunne ikke ekspedere dokumentet." });
    }
  });
}
