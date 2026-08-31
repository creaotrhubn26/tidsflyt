import type { Express, Request, Response } from "express";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { registerFrist, cancelFrist } from "../lib/frist-engine";
import { loggTilgang, needToKnowVilkar, requireKommuneActor } from "./barnevern-melding-routes";
import {
  SikkerUtsendelseError,
  processSecureNotificationOutbox,
  sendSystemmeldingViaSikkerDialog,
} from "./secure-dialog-routes";
import { lagSladdetInnsynPdf } from "../lib/barnevern-innsyn-pdf";
import { hentVedlegg } from "../lib/barnevern-attachment-storage";

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
    // Valgfri kobling til konkrete journaloppføringer — styrer fysisk
    // sladding i utleverings-PDF-en (krav 16-rest).
    if (u.journalEntryIds != null && (
      !Array.isArray(u.journalEntryIds) || u.journalEntryIds.some((id: unknown) => typeof id !== "string")
    )) {
      return "journalEntryIds må være en liste med journaloppførings-id-er.";
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

  // Sladdet utleverings-PDF (krav 16-rest): journalen med FYSISK maskerte
  // oppføringer der beslutningens unntak peker (journalEntryIds). Kun
  // barnevernsleder; hver generering auditlogges. Krever besluttet krav.
  app.get("/api/barnevern/innsynskrav/:id/sladdet-pdf", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan utlevere innsyns-PDF." });
    }

    try {
      const data = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [krav] } = await client.query(
          `SELECT krav.*, sak.saksnummer, sak.adresse_skjermet, kommune.navn AS kommune_navn
             FROM tidum_barnevern_innsynskrav krav
             JOIN tidum_barnevern_saker sak ON sak.id = krav.sak_id AND sak.kommune_id = krav.kommune_id
             JOIN tidum_kommuner kommune ON kommune.id = krav.kommune_id
            WHERE krav.id = $1 AND krav.kommune_id = $2`,
          [req.params.id, actor.kommuneId],
        );
        if (!krav) return null;
        if (krav.status === "mottatt" || krav.status === "avslatt") throw new Error("IKKE_INNVILGET");

        const [journal, dokumenter] = await Promise.all([
          client.query(
            `SELECT id, kategori, innhold, created_at FROM tidum_barnevern_sak_journal
              WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at`,
            [krav.sak_id, actor.kommuneId],
          ).then((r: any) => r.rows),
          client.query(
            `SELECT tittel, dokumenttype, status, created_at FROM tidum_barnevern_dokumenter
              WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at`,
            [krav.sak_id, actor.kommuneId],
          ).then((r: any) => r.rows),
        ]);
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "nedlastet", objektType: "innsyn_sladdet_pdf", objektId: krav.id,
          detaljer: { sakId: krav.sak_id, antallUnntak: (krav.unntak ?? []).length },
        });
        return { krav, journal, dokumenter };
      });
      if (!data) return res.status(404).json({ error: "Innsynskrav ikke funnet." });

      const pdf = await lagSladdetInnsynPdf({
        kommuneNavn: data.krav.kommune_navn,
        saksnummer: data.krav.saksnummer,
        partNavn: data.krav.part_navn,
        beslutningStatus: data.krav.status,
        beslutningBegrunnelse: data.krav.beslutning_begrunnelse,
        besluttetDato: data.krav.besluttet_dato,
        unntak: [
          ...(data.krav.adresse_skjermet
            ? [{ hjemmel: "skjermet adresse", beskrivelse: "Opplysninger om bosted er skjermet og utleveres ikke." }]
            : []),
          ...(data.krav.unntak ?? []),
        ],
        journal: data.journal,
        dokumenter: data.dokumenter,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Disposition", `inline; filename="innsyn-${data.krav.id}.pdf"`);
      res.send(pdf);
    } catch (err) {
      if (err instanceof Error && err.message === "IKKE_INNVILGET") {
        return res.status(409).json({ error: "Utleverings-PDF krever innvilget eller delvis innvilget beslutning." });
      }
      console.error("[barnevern-innsyn] sladdet PDF feilet", err);
      res.status(500).json({ error: "Kunne ikke generere utleverings-PDF." });
    }
  });

  // Utleveringspakke (krav 16/17): én ZIP til parten — sladdet PDF +
  // journalvedlegg, der vedlegg på SLADDEDE journaloppføringer utelates
  // (fysisk fraværende, som teksten). Kun barnevernsleder; auditlogget.
  app.get("/api/barnevern/innsynskrav/:id/utleveringspakke", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan utlevere pakken." });
    }

    try {
      const data = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [krav] } = await client.query(
          `SELECT krav.*, sak.saksnummer, sak.adresse_skjermet, kommune.navn AS kommune_navn
             FROM tidum_barnevern_innsynskrav krav
             JOIN tidum_barnevern_saker sak ON sak.id = krav.sak_id AND sak.kommune_id = krav.kommune_id
             JOIN tidum_kommuner kommune ON kommune.id = krav.kommune_id
            WHERE krav.id = $1 AND krav.kommune_id = $2`,
          [req.params.id, actor.kommuneId],
        );
        if (!krav) return null;
        if (krav.status === "mottatt" || krav.status === "avslatt") throw new Error("IKKE_INNVILGET");

        const [journal, dokumenter, vedlegg] = await Promise.all([
          client.query(
            `SELECT id, kategori, innhold, created_at FROM tidum_barnevern_sak_journal
              WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at`,
            [krav.sak_id, actor.kommuneId],
          ).then((r: any) => r.rows),
          client.query(
            `SELECT tittel, dokumenttype, status, created_at FROM tidum_barnevern_dokumenter
              WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at`,
            [krav.sak_id, actor.kommuneId],
          ).then((r: any) => r.rows),
          client.query(
            `SELECT v.id, v.journal_entry_id, v.filename, v.original_name
               FROM tidum_barnevern_sak_journal_vedlegg v
               JOIN tidum_barnevern_sak_journal j
                 ON j.id = v.journal_entry_id AND j.kommune_id = v.kommune_id
              WHERE j.sak_id = $1 AND v.kommune_id = $2 ORDER BY v.uploaded_at`,
            [krav.sak_id, actor.kommuneId],
          ).then((r: any) => r.rows),
        ]);
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "nedlastet", objektType: "innsyn_utleveringspakke", objektId: krav.id,
          detaljer: { sakId: krav.sak_id, antallUnntak: (krav.unntak ?? []).length, antallVedlegg: vedlegg.length },
        });
        return { krav, journal, dokumenter, vedlegg };
      });
      if (!data) return res.status(404).json({ error: "Innsynskrav ikke funnet." });

      const unntak = [
        ...(data.krav.adresse_skjermet
          ? [{ hjemmel: "skjermet adresse", beskrivelse: "Opplysninger om bosted er skjermet og utleveres ikke." }]
          : []),
        ...(data.krav.unntak ?? []),
      ];
      const sladdedeIds = new Set(unntak.flatMap((u: any) => u.journalEntryIds ?? []));

      const pdf = await lagSladdetInnsynPdf({
        kommuneNavn: data.krav.kommune_navn,
        saksnummer: data.krav.saksnummer,
        partNavn: data.krav.part_navn,
        beslutningStatus: data.krav.status,
        beslutningBegrunnelse: data.krav.beslutning_begrunnelse,
        besluttetDato: data.krav.besluttet_dato,
        unntak,
        journal: data.journal,
        dokumenter: data.dokumenter,
      });

      const archiverMod: any = await import("archiver");
      const arkiv = new archiverMod.ZipArchive({ zlib: { level: 6 } });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Disposition", `attachment; filename="innsyn-${data.krav.id}.zip"`);
      arkiv.pipe(res);
      arkiv.append(pdf, { name: "innsynsutlevering.pdf" });

      const { createHash } = await import("crypto");
      const filer: { navn: string; sha256: string }[] = [
        { navn: "innsynsutlevering.pdf", sha256: createHash("sha256").update(pdf).digest("hex") },
      ];
      let utelatt = 0;
      for (const v of data.vedlegg) {
        if (sladdedeIds.has(v.journal_entry_id)) { utelatt += 1; continue; }
        try {
          const innhold = await hentVedlegg("barnevern-sak-journal", v.filename);
          const navn = `vedlegg/${v.id}-${String(v.original_name).replace(/[^\w.\-æøåÆØÅ ]/g, "_")}`;
          arkiv.append(innhold, { name: navn });
          filer.push({ navn, sha256: createHash("sha256").update(innhold).digest("hex") });
        } catch (err) {
          filer.push({ navn: `vedlegg/${v.id}-MANGLER`, sha256: "" });
          console.error(`[barnevern-innsyn] vedlegg ${v.id} mangler i objektlageret:`, (err as Error)?.message);
        }
      }
      arkiv.append(Buffer.from(JSON.stringify({
        saksnummer: data.krav.saksnummer,
        part: data.krav.part_navn,
        generertDato: new Date().toISOString(),
        vedleggUtelattPgaSladding: utelatt,
        filer,
      }, null, 2), "utf8"), { name: "manifest.json" });
      await arkiv.finalize();
    } catch (err) {
      if (err instanceof Error && err.message === "IKKE_INNVILGET") {
        return res.status(409).json({ error: "Utleveringspakke krever innvilget eller delvis innvilget beslutning." });
      }
      console.error("[barnevern-innsyn] utleveringspakke feilet", err);
      if (!res.headersSent) res.status(500).json({ error: "Kunne ikke generere utleveringspakken." });
      else res.end();
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
          `UPDATE tidum_barnevern_innsynskrav krav
              SET status = 'utlevert', utlevert_dato = NOW(), utlevert_via = $1, updated_at = NOW()
             FROM (SELECT id, status AS beslutning_status FROM tidum_barnevern_innsynskrav
                    WHERE id = $2 AND kommune_id = $3 AND status IN ('innvilget', 'delvis_innvilget')
                    FOR UPDATE) gammel
            WHERE krav.id = gammel.id
            RETURNING krav.*, gammel.beslutning_status`,
          [via, req.params.id, actor.kommuneId],
        );
        if (!updated) throw new Error("KRAV_NOT_INNVILGET");
        let sikkerMeldingId: string | null = null;
        if (via === "sikker_dialog") {
          const unntak = updated.unntak ?? [];
          const sendt = await sendSystemmeldingViaSikkerDialog(client, {
            kommuneId: actor.kommuneId,
            sakId: updated.sak_id,
            senderUserId: actor.userId,
            subject: `Innsyn ${updated.beslutning_status === "delvis_innvilget" ? "delvis innvilget" : "innvilget"}`,
            content:
              `Innsynskravet fra ${updated.part_navn} er ${updated.beslutning_status === "delvis_innvilget" ? "delvis innvilget" : "innvilget"} og utlevert via sikker dialog.` +
              (unntak.length ? `\n\nUnntatt fra innsyn (${unntak.length}): ${unntak.join("; ")}` : "") +
              (updated.beslutning_begrunnelse ? `\n\nBegrunnelse: ${updated.beslutning_begrunnelse}` : ""),
          });
          sikkerMeldingId = sendt.messageId;
        }
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "nedlastet", objektType: "innsynsutlevering", objektId: updated.id,
          detaljer: { sakId: updated.sak_id, partNavn: updated.part_navn, via, antallUnntak: (updated.unntak ?? []).length },
        });
        return { ...updated, sikkerMeldingId };
      });
      // Best-effort varsel-utsendelse for sikker dialog-meldingen etter commit.
      if (row.sikkerMeldingId) {
        processSecureNotificationOutbox(row.sikkerMeldingId).catch((err) =>
          console.error(`[barnevern-innsyn] varselkø feilet for ${row.sikkerMeldingId}:`, err?.message ?? err),
        );
      }
      res.json({ ...toApiShape(row), sikkerMeldingId: row.sikkerMeldingId ?? null });
    } catch (err) {
      if (err instanceof Error && err.message === "KRAV_NOT_INNVILGET") {
        return res.status(409).json({ error: "Utlevering krever innvilget eller delvis innvilget beslutning." });
      }
      if (err instanceof SikkerUtsendelseError) {
        return res.status(409).json({ error: err.message, code: err.code });
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
