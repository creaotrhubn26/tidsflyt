import type { Express, Request, Response } from "express";
import multer from "multer";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { cancelFrist } from "../lib/frist-engine";
import { requireAuth } from "../middleware/auth";
import { queueBarnevernJournalArchiving } from "../lib/archive/archive-service";
import { loggTilgang, needToKnowVilkar, nyttVedleggFilnavn, requireKommuneActor, type KommuneActor } from "./barnevern-melding-routes";
import { hentVedlegg, lagreVedlegg } from "../lib/barnevern-attachment-storage";

// Faseflyt for den kommunale barnevernssaken. En sak starter alltid i
// undersøkelse (opprettet fra «send til undersøkelse» på en melding).
// ponytail: overgangsreglene er kodefaste; per-kommune-konfigurasjon legges
// til som egen tabell når en kommune faktisk trenger avvikende flyt.
const TILLATTE_OVERGANGER: Record<string, string[]> = {
  undersokelse: ["tiltak", "henlagt"],
  tiltak: ["avsluttet"],
  avsluttet: [],
  henlagt: [],
};

// Overganger som er vedtak og krever barnevernsleders godkjenning.
const KREVER_LEDER = new Set(["henlagt", "avsluttet"]);

const AVSLUTTENDE_FASER = new Set(["avsluttet", "henlagt"]);

// Journalkategorier — kodefast kodeliste; utvides ved behov.
const JOURNAL_KATEGORIER = new Set([
  "notat", "telefonsamtale", "mote", "hjemmebesok", "samtale_med_barnet", "vedtak", "annet",
]);

// Journalvedlegg går via barnevern-attachment-storage (S3/EU-bøtte i
// drift, privat disk i dev) — samme filtyperegler som meldingsvedlegg.
const ALLOWED_VEDLEGG_MIME = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp",
]);

const journalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_VEDLEGG_MIME.has(file.mimetype)) {
      return cb(new Error("Ikke tillatt filtype."));
    }
    cb(null, true);
  },
});

async function loadSakScoped(id: string, kommuneId: number, actor?: KommuneActor) {
  return withKommuneRlsContext(kommuneId, async (client) => {
    const ntk = actor
      ? needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3)
      : { clause: "", params: [] as string[] };
    const { rows } = await client.query(
      `SELECT * FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2${ntk.clause}`,
      [id, kommuneId, ...ntk.params],
    );
    return rows[0] ?? null;
  });
}

function toApiShape(row: any) {
  return {
    id: row.id,
    kommuneId: row.kommune_id,
    saksnummer: row.saksnummer,
    meldingId: row.melding_id,
    barnFodselsnummer: row.barn_fodselsnummer,
    barnNavn: row.barn_navn,
    fase: row.fase,
    tildeltSaksbehandlerId: row.tildelt_saksbehandler_id,
    undersokelsesfrist: row.undersokelsesfrist,
    avsluttetDato: row.avsluttet_dato,
    avsluttetAvUserId: row.avsluttet_av_user_id,
    createdAt: row.created_at,
  };
}

export function registerBarnevernSakRoutes(app: Express): void {
  app.get("/api/barnevern/saker", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const fase = typeof req.query.fase === "string" ? req.query.fase : null;
      if (fase && !(fase in TILLATTE_OVERGANGER)) {
        return res.status(400).json({ error: "Ugyldig fase." });
      }
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntkMedFase = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
        const ntkUtenFase = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 2);
        const result = fase
          ? await client.query(
              `SELECT * FROM tidum_barnevern_saker WHERE kommune_id = $1 AND fase = $2${ntkMedFase.clause} ORDER BY created_at DESC`,
              [actor.kommuneId, fase, ...ntkMedFase.params],
            )
          : await client.query(
              `SELECT * FROM tidum_barnevern_saker WHERE kommune_id = $1${ntkUtenFase.clause} ORDER BY created_at DESC`,
              [actor.kommuneId, ...ntkUtenFase.params],
            );
        return result.rows;
      });
      res.json(rows.map(toApiShape));
    } catch (err) {
      console.error("[barnevern-sak] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente saker." });
    }
  });

  app.get("/api/barnevern/saker/:id", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const data = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
        const { rows: [sak] } = await client.query(
          `SELECT * FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2${ntk.clause}`,
          [req.params.id, actor.kommuneId, ...ntk.params],
        );
        if (!sak) return null;
        const { rows: historikk } = await client.query(
          `SELECT fra_fase, til_fase, begrunnelse, endret_av_user_id, created_at
             FROM tidum_barnevern_sak_fase_historikk
            WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at ASC`,
          [req.params.id, actor.kommuneId],
        );
        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "lest", objektType: "sak", objektId: sak.id,
        });
        return { sak, historikk };
      });
      if (!data) return res.status(404).json({ error: "Sak ikke funnet." });
      res.json({
        ...toApiShape(data.sak),
        faseHistorikk: data.historikk.map((h: any) => ({
          fraFase: h.fra_fase,
          tilFase: h.til_fase,
          begrunnelse: h.begrunnelse,
          endretAvUserId: h.endret_av_user_id,
          createdAt: h.created_at,
        })),
      });
    } catch (err) {
      console.error("[barnevern-sak] henting feilet", err);
      res.status(500).json({ error: "Kunne ikke hente saken." });
    }
  });

  app.patch("/api/barnevern/saker/:id/tildel", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan tildele." });
    }

    const { tildeltSaksbehandlerId } = req.body;
    if (!tildeltSaksbehandlerId) return res.status(400).json({ error: "tildeltSaksbehandlerId er påkrevd." });
    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const assignee = await client.query(
          `SELECT id FROM users
            WHERE id = $1 AND kommune_id = $2
              AND role IN ('barnevernsleder', 'kommune_saksbehandler')`,
          [tildeltSaksbehandlerId, actor.kommuneId],
        );
        if (!assignee.rowCount) throw new Error("ASSIGNEE_NOT_IN_KOMMUNE");
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_saker SET tildelt_saksbehandler_id = $1, updated_at = NOW()
           WHERE id = $2 AND kommune_id = $3 RETURNING *`,
          [tildeltSaksbehandlerId, req.params.id, actor.kommuneId],
        );
        if (!updated) throw new Error("SAK_NOT_FOUND");
        await client.query(
          `UPDATE tidum_frister SET notify_user_id = $1, updated_at = NOW()
           WHERE entity_type = 'barnevern_sak' AND entity_id = $2 AND kommune_id = $3 AND status = 'aktiv'`,
          [tildeltSaksbehandlerId, req.params.id, actor.kommuneId],
        );
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "SAK_NOT_FOUND") {
        return res.status(404).json({ error: "Sak ikke funnet." });
      }
      if (err instanceof Error && err.message === "ASSIGNEE_NOT_IN_KOMMUNE") {
        return res.status(400).json({ error: "Saksbehandleren tilhører ikke kommunen." });
      }
      console.error("[barnevern-sak] tildeling feilet", err);
      res.status(500).json({ error: "Kunne ikke tildele saken." });
    }
  });

  app.post("/api/barnevern/saker/:id/fase", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { tilFase, begrunnelse } = req.body;
    if (typeof tilFase !== "string" || !(tilFase in TILLATTE_OVERGANGER)) {
      return res.status(400).json({ error: "Ugyldig tilFase." });
    }
    if (!begrunnelse || typeof begrunnelse !== "string" || begrunnelse.trim().length === 0) {
      return res.status(400).json({ error: "begrunnelse er påkrevd for faseovergang." });
    }
    if (KREVER_LEDER.has(tilFase) && actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Overgangen krever barnevernsleders godkjenning." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
        const { rows: [sak] } = await client.query(
          `SELECT * FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2${ntk.clause} FOR UPDATE`,
          [req.params.id, actor.kommuneId, ...ntk.params],
        );
        if (!sak) throw new Error("SAK_NOT_FOUND");
        if (!TILLATTE_OVERGANGER[sak.fase].includes(tilFase)) {
          throw new Error("UGYLDIG_OVERGANG");
        }

        const avslutter = AVSLUTTENDE_FASER.has(tilFase);
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_saker
              SET fase = $1,
                  avsluttet_dato = CASE WHEN $2 THEN NOW() ELSE avsluttet_dato END,
                  avsluttet_av_user_id = CASE WHEN $2 THEN $3 ELSE avsluttet_av_user_id END,
                  updated_at = NOW()
            WHERE id = $4 AND kommune_id = $5 RETURNING *`,
          [tilFase, avslutter, actor.userId, req.params.id, actor.kommuneId],
        );
        await client.query(
          `INSERT INTO tidum_barnevern_sak_fase_historikk
             (sak_id, kommune_id, fra_fase, til_fase, begrunnelse, endret_av_user_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.params.id, actor.kommuneId, sak.fase, tilFase, begrunnelse, actor.userId],
        );
        if (sak.fase === "undersokelse") {
          await cancelFrist(
            "barnevern_sak",
            req.params.id,
            "undersokelse",
            { kommuneId: actor.kommuneId },
            client,
          );
        }
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "SAK_NOT_FOUND") {
        return res.status(404).json({ error: "Sak ikke funnet." });
      }
      if (err instanceof Error && err.message === "UGYLDIG_OVERGANG") {
        return res.status(400).json({ error: "Faseovergangen er ikke tillatt fra sakens nåværende fase." });
      }
      console.error("[barnevern-sak] faseovergang feilet", err);
      res.status(500).json({ error: "Kunne ikke gjennomføre faseovergangen." });
    }
  });

  // ── SAKSUTTREKK (krav 17) — komplett mappe, kontrollert utlevering ───────
  // Utlevering til part er en formell beslutning: kun barnevernsleder.
  // Hele uttrekket leses i ÉN transaksjon (konsistent snapshot) og logges
  // som nedlasting med innholds-hash i tilgangsloggen (krav 15).

  async function byggSaksuttrekk(
    client: any,
    actor: KommuneActor,
    sakId: string,
    objektType: string,
  ): Promise<any | null> {
        const { rows: [sak] } = await client.query(
          `SELECT s.*, k.navn AS kommune_navn
             FROM tidum_barnevern_saker s
             JOIN tidum_kommuner k ON k.id = s.kommune_id
            WHERE s.id = $1 AND s.kommune_id = $2`,
          [sakId, actor.kommuneId],
        );
        if (!sak) return null;

        const [melding, revisjoner, historikk, journal, journalVedlegg, planer, planTiltak, dokumenter, oppgaver] =
          await Promise.all([
            sak.melding_id
              ? client.query(
                  `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2`,
                  [sak.melding_id, actor.kommuneId],
                ).then((r: any) => r.rows[0] ?? null)
              : Promise.resolve(null),
            sak.melding_id
              ? client.query(
                  `SELECT begrunnelse, felt_endringer, endret_av_user_id, created_at
                     FROM tidum_barnevern_melding_revisjoner
                    WHERE melding_id = $1 AND kommune_id = $2 ORDER BY created_at`,
                  [sak.melding_id, actor.kommuneId],
                ).then((r: any) => r.rows)
              : Promise.resolve([]),
            client.query(
              `SELECT fra_fase, til_fase, begrunnelse, endret_av_user_id, created_at
                 FROM tidum_barnevern_sak_fase_historikk
                WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at`,
              [sakId, actor.kommuneId],
            ).then((r: any) => r.rows),
            client.query(
              `SELECT id, kategori, innhold, corrects_entry_id, forfatter_user_id, created_at
                 FROM tidum_barnevern_sak_journal
                WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at`,
              [sakId, actor.kommuneId],
            ).then((r: any) => r.rows),
            client.query(
              `SELECT v.id, v.journal_entry_id, v.filename, v.original_name, v.mime_type, v.size_bytes, v.uploaded_at
                 FROM tidum_barnevern_sak_journal_vedlegg v
                 JOIN tidum_barnevern_sak_journal j
                   ON j.id = v.journal_entry_id AND j.kommune_id = v.kommune_id
                WHERE j.sak_id = $1 AND v.kommune_id = $2 ORDER BY v.uploaded_at`,
              [sakId, actor.kommuneId],
            ).then((r: any) => r.rows),
            client.query(
              `SELECT id, plantype, versjon, status, formaal, deltakere, evalueringsfrist,
                      godkjent_av, godkjent_dato, created_at
                 FROM tidum_barnevern_planer
                WHERE sak_id = $1 AND kommune_id = $2 ORDER BY plantype, versjon`,
              [sakId, actor.kommuneId],
            ).then((r: any) => r.rows),
            client.query(
              `SELECT t.id, t.plan_id, t.beskrivelse, t.ansvarlig, t.frist, t.status, t.statusnotat
                 FROM tidum_barnevern_plan_tiltak t
                 JOIN tidum_barnevern_planer p ON p.id = t.plan_id AND p.kommune_id = t.kommune_id
                WHERE p.sak_id = $1 AND t.kommune_id = $2 ORDER BY t.created_at`,
              [sakId, actor.kommuneId],
            ).then((r: any) => r.rows),
            client.query(
              `SELECT id, dokumenttype, mal_id, tittel, hjemmel, innhold, mottaker, plan_id,
                      status, godkjent_av, godkjent_dato, ekspedert_dato, ekspedert_via, created_at
                 FROM tidum_barnevern_dokumenter
                WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at`,
              [sakId, actor.kommuneId],
            ).then((r: any) => r.rows),
            client.query(
              `SELECT id, entity_type, entity_id, tittel, beskrivelse, tildelt_user_id,
                      frist, status, fullfort_dato, created_at
                 FROM tidum_barnevern_oppgaver
                WHERE kommune_id = $1
                  AND ((entity_type = 'sak' AND entity_id = $2)
                    OR (entity_type = 'melding' AND entity_id = $3::uuid))
                ORDER BY created_at`,
              [actor.kommuneId, sakId, sak.melding_id],
            ).then((r: any) => r.rows),
          ]);

        const innhold = {
          sak, melding, meldingRevisjoner: revisjoner, faseHistorikk: historikk,
          journal, journalVedlegg, planer, planTiltak, dokumenter, oppgaver,
        };
        const { createHash } = await import("crypto");
        const innholdsHash = createHash("sha256").update(JSON.stringify(innhold)).digest("hex");

        await loggTilgang(client, {
          kommuneId: actor.kommuneId, userId: actor.userId,
          handling: "nedlastet", objektType, objektId: sak.id,
          detaljer: { innholdsHash, antallJournal: journal.length, antallDokumenter: dokumenter.length },
        });

        return {
          manifest: {
            saksnummer: sak.saksnummer,
            kommune: sak.kommune_navn,
            generertAv: actor.userId,
            generertDato: new Date().toISOString(),
            innholdsHash,
            merknad: "Vedleggsfiler utleveres separat via vedleggsrutene; dette uttrekket inneholder metadata om dem.",
            antall: {
              journaloppforinger: journal.length,
              journalvedlegg: journalVedlegg.length,
              planer: planer.length,
              dokumenter: dokumenter.length,
              oppgaver: oppgaver.length,
              fasehendelser: historikk.length,
            },
          },
          ...innhold,
        };
  }

  app.get("/api/barnevern/saker/:id/uttrekk", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan utlevere saksuttrekk." });
    }

    try {
      const manifest = await withKommuneRlsContext(actor.kommuneId, (client) =>
        byggSaksuttrekk(client, actor, req.params.id, "saksuttrekk"));
      if (!manifest) return res.status(404).json({ error: "Sak ikke funnet." });
      // Interne lagringsnøkler skal ikke ut i JSON-utleveringen.
      manifest.journalVedlegg = manifest.journalVedlegg.map(({ filename, ...rest }: any) => rest);
      res.setHeader("Cache-Control", "no-store");
      res.json(manifest);
    } catch (err) {
      console.error("[barnevern] saksuttrekk feilet", err);
      res.status(500).json({ error: "Kunne ikke generere saksuttrekket." });
    }
  });

  // ZIP-pakke (krav 17-rest): uttrekket + binærvedlegg + manifest med
  // SHA-256 per fil — én nedlastbar mappe for fysisk utlevering.
  app.get("/api/barnevern/saker/:id/uttrekk/pakke", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan utlevere saksuttrekk." });
    }

    try {
      const uttrekk = await withKommuneRlsContext(actor.kommuneId, (client) =>
        byggSaksuttrekk(client, actor, req.params.id, "saksuttrekk_pakke"));
      if (!uttrekk) return res.status(404).json({ error: "Sak ikke funnet." });

      const vedleggsfiler = uttrekk.journalVedlegg as any[];
      uttrekk.journalVedlegg = vedleggsfiler.map(({ filename, ...rest }: any) => rest);
      const uttrekkJson = Buffer.from(JSON.stringify(uttrekk, null, 2), "utf8");

      const filer: { navn: string; sha256: string }[] = [];
      const { createHash } = await import("crypto");
      const { ZipArchive } = (await import("archiver")) as any;
      const arkiv = new ZipArchive({ zlib: { level: 6 } });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Disposition", `attachment; filename="saksuttrekk-${uttrekk.manifest.saksnummer}.zip"`);
      arkiv.on("error", (err: Error) => { throw err; });
      arkiv.pipe(res);

      arkiv.append(uttrekkJson, { name: "saksuttrekk.json" });
      filer.push({ navn: "saksuttrekk.json", sha256: createHash("sha256").update(uttrekkJson).digest("hex") });

      for (const v of vedleggsfiler) {
        try {
          const innhold = await hentVedlegg("barnevern-sak-journal", v.filename);
          const navn = `vedlegg/${v.id}-${String(v.original_name).replace(/[^\w.\-æøåÆØÅ ]/g, "_")}`;
          arkiv.append(innhold, { name: navn });
          filer.push({ navn, sha256: createHash("sha256").update(innhold).digest("hex") });
        } catch (err) {
          // Manglende binær skal ikke velte hele pakken — noteres i manifestet.
          filer.push({ navn: `vedlegg/${v.id}-MANGLER`, sha256: "" });
          console.error(`[barnevern] vedlegg ${v.id} mangler i objektlageret:`, (err as Error)?.message);
        }
      }
      arkiv.append(Buffer.from(JSON.stringify({ ...uttrekk.manifest, filer }, null, 2), "utf8"), { name: "manifest.json" });
      await arkiv.finalize();
    } catch (err) {
      console.error("[barnevern] saksuttrekk-pakke feilet", err);
      if (!res.headersSent) res.status(500).json({ error: "Kunne ikke generere pakken." });
      else res.end();
    }
  });

  // ── TILGANGSLOGG (krav 15) — søkbar revisorflate, kun barnevernsleder ────

  app.get("/api/barnevern/tilgangslogg", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan lese tilgangsloggen." });
    }

    const { objektType, objektId, userId } = req.query;
    try {
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const betingelser = ["kommune_id = $1"];
        const verdier: unknown[] = [actor.kommuneId];
        if (typeof objektType === "string") {
          verdier.push(objektType);
          betingelser.push(`objekt_type = $${verdier.length}`);
        }
        if (typeof objektId === "string") {
          verdier.push(objektId);
          betingelser.push(`objekt_id = $${verdier.length}`);
        }
        if (typeof userId === "string") {
          verdier.push(userId);
          betingelser.push(`user_id = $${verdier.length}`);
        }
        const { rows } = await client.query(
          `SELECT * FROM tidum_barnevern_tilgangslogg
            WHERE ${betingelser.join(" AND ")}
            ORDER BY created_at DESC LIMIT 500`,
          verdier,
        );
        return rows;
      });
      res.json(rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        handling: r.handling,
        objektType: r.objekt_type,
        objektId: r.objekt_id,
        detaljer: r.detaljer,
        createdAt: r.created_at,
      })));
    } catch (err) {
      console.error("[barnevern] tilgangslogg feilet", err);
      res.status(500).json({ error: "Kunne ikke hente tilgangsloggen." });
    }
  });

  // ── JOURNAL (krav 4) — append-only, rettelser via correctsEntryId ────────

  app.post("/api/barnevern/saker/:id/journal", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { kategori, innhold, correctsEntryId } = req.body;
    if (!kategori || !JOURNAL_KATEGORIER.has(kategori)) {
      return res.status(400).json({ error: "Ugyldig kategori." });
    }
    if (!innhold || typeof innhold !== "string" || innhold.trim().length === 0) {
      return res.status(400).json({ error: "innhold er påkrevd." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
        const { rows: [sak] } = await client.query(
          `SELECT id, fase FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2${ntk.clause}`,
          [req.params.id, actor.kommuneId, ...ntk.params],
        );
        if (!sak) throw new Error("SAK_NOT_FOUND");
        if (correctsEntryId) {
          const { rows: [original] } = await client.query(
            `SELECT id FROM tidum_barnevern_sak_journal
              WHERE id = $1 AND sak_id = $2 AND kommune_id = $3`,
            [correctsEntryId, req.params.id, actor.kommuneId],
          );
          if (!original) throw new Error("CORRECTS_INVALID");
        }
        const { rows: [entry] } = await client.query(
          `INSERT INTO tidum_barnevern_sak_journal
             (sak_id, kommune_id, kategori, innhold, corrects_entry_id, forfatter_user_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [req.params.id, actor.kommuneId, kategori, innhold, correctsEntryId ?? null, actor.userId],
        );
        return entry;
      });
      // Best-effort arkiv-outbox etter commit — feiler stille med backoff.
      queueBarnevernJournalArchiving(row.id, actor.kommuneId).catch((err) =>
        console.error(`[barnevern-sak] arkivkø feilet for ${row.id}:`, err?.message ?? err),
      );
      res.status(201).json({
        id: row.id,
        sakId: row.sak_id,
        kategori: row.kategori,
        innhold: row.innhold,
        correctsEntryId: row.corrects_entry_id,
        forfatterUserId: row.forfatter_user_id,
        createdAt: row.created_at,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "SAK_NOT_FOUND") {
        return res.status(404).json({ error: "Sak ikke funnet." });
      }
      if (err instanceof Error && err.message === "CORRECTS_INVALID") {
        return res.status(400).json({ error: "correctsEntryId peker ikke på en oppføring på denne saken." });
      }
      console.error("[barnevern-sak] journalføring feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette journaloppføringen." });
    }
  });

  app.get("/api/barnevern/saker/:id/journal", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const sak = await loadSakScoped(req.params.id, actor.kommuneId, actor);
    if (!sak) return res.status(404).json({ error: "Sak ikke funnet." });

    const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM tidum_barnevern_sak_journal
          WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at ASC`,
        [req.params.id, actor.kommuneId],
      );
      await loggTilgang(client, {
        kommuneId: actor.kommuneId, userId: actor.userId,
        handling: "lest", objektType: "sak_journal", objektId: req.params.id,
        detaljer: { antallOppforinger: rows.length },
      });
      return rows;
    });
    res.json(rows.map((r: any) => ({
      id: r.id,
      kategori: r.kategori,
      innhold: r.innhold,
      correctsEntryId: r.corrects_entry_id,
      forfatterUserId: r.forfatter_user_id,
      createdAt: r.created_at,
    })));
  });

  app.post(
    "/api/barnevern/saker/:id/journal/:entryId/vedlegg",
    requireAuth, // FØR multer: uautentiserte skal ikke kunne fylle minne med 20 MB
    journalUpload.single("file"),
    async (req: Request, res: Response) => {
      const actor = await requireKommuneActor(req);
      if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
      if (!req.file) return res.status(400).json({ error: "Ingen fil sendt." });

      try {
        const filename = nyttVedleggFilnavn(req.file.originalname);
        const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
          const { rows: [entry] } = await client.query(
            `SELECT id FROM tidum_barnevern_sak_journal
              WHERE id = $1 AND sak_id = $2 AND kommune_id = $3`,
            [req.params.entryId, req.params.id, actor.kommuneId],
          );
          if (!entry) throw new Error("ENTRY_NOT_FOUND");
          await lagreVedlegg("barnevern-sak-journal", filename, req.file!.buffer, req.file!.mimetype);
          const { rows: [created] } = await client.query(
            `INSERT INTO tidum_barnevern_sak_journal_vedlegg
               (journal_entry_id, kommune_id, filename, original_name, mime_type, size_bytes, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
              req.params.entryId, actor.kommuneId, filename, req.file!.originalname,
              req.file!.mimetype, req.file!.size, actor.userId,
            ],
          );
          return created;
        });
        res.status(201).json({
          id: row.id,
          filename: row.filename,
          originalName: row.original_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          uploadedAt: row.uploaded_at,
        });
      } catch (err) {
        if (err instanceof Error && err.message === "ENTRY_NOT_FOUND") {
          return res.status(404).json({ error: "Journaloppføring ikke funnet." });
        }
        console.error("[barnevern-sak] journalvedlegg feilet", err);
        res.status(500).json({ error: "Kunne ikke lagre vedlegget." });
      }
    },
  );

  app.get(
    "/api/barnevern/saker/:id/journal/:entryId/vedlegg/:vedleggId",
    async (req: Request, res: Response) => {
      const actor = await requireKommuneActor(req);
      if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

      const vedlegg = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [entry] } = await client.query(
          `SELECT id FROM tidum_barnevern_sak_journal
            WHERE id = $1 AND sak_id = $2 AND kommune_id = $3`,
          [req.params.entryId, req.params.id, actor.kommuneId],
        );
        if (!entry) return null;
        const { rows: [row] } = await client.query(
          `SELECT * FROM tidum_barnevern_sak_journal_vedlegg
            WHERE id = $1 AND journal_entry_id = $2 AND kommune_id = $3`,
          [req.params.vedleggId, req.params.entryId, actor.kommuneId],
        );
        if (row) {
          await loggTilgang(client, {
            kommuneId: actor.kommuneId, userId: actor.userId,
            handling: "nedlastet", objektType: "journal_vedlegg", objektId: row.id,
            detaljer: { sakId: req.params.id, journalEntryId: req.params.entryId, filnavn: row.original_name },
          });
        }
        return row ?? null;
      });
      if (!vedlegg) return res.status(404).json({ error: "Vedlegg ikke funnet." });

      try {
        const innhold = await hentVedlegg("barnevern-sak-journal", vedlegg.filename);
        res.setHeader("Content-Type", vedlegg.mime_type);
        res.setHeader("Content-Disposition", `attachment; filename="${vedlegg.original_name}"`);
        res.send(innhold);
      } catch {
        res.status(404).json({ error: "Fil ikke funnet i vedleggslageret." });
      }
    },
  );
}
