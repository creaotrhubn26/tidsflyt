import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { cancelFrist } from "../lib/frist-engine";
import { requireAuth } from "../middleware/auth";
import { queueBarnevernJournalArchiving } from "../lib/archive/archive-service";
import { requireKommuneActor } from "./barnevern-melding-routes";

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

// Samme private diskrot og filtyperegler som barnevernsvedlegg for meldinger
// (se barnevern-melding-routes.ts). ponytail: lokal disk nå, norsk/EU
// objektlager når krav 23-plattformen er valgt.
const JOURNAL_UPLOAD_DIR = path.join(process.cwd(), "private-uploads", "barnevern-sak-journal");
if (!fs.existsSync(JOURNAL_UPLOAD_DIR)) fs.mkdirSync(JOURNAL_UPLOAD_DIR, { recursive: true });

const ALLOWED_VEDLEGG_MIME = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp",
]);

const journalUpload = multer({
  storage: multer.diskStorage({
    destination: JOURNAL_UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_VEDLEGG_MIME.has(file.mimetype)) {
      return cb(new Error("Ikke tillatt filtype."));
    }
    cb(null, true);
  },
});

async function loadSakScoped(id: string, kommuneId: number) {
  return withKommuneRlsContext(kommuneId, async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2`,
      [id, kommuneId],
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
        const result = fase
          ? await client.query(
              `SELECT * FROM tidum_barnevern_saker WHERE kommune_id = $1 AND fase = $2 ORDER BY created_at DESC`,
              [actor.kommuneId, fase],
            )
          : await client.query(
              `SELECT * FROM tidum_barnevern_saker WHERE kommune_id = $1 ORDER BY created_at DESC`,
              [actor.kommuneId],
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
        const { rows: [sak] } = await client.query(
          `SELECT * FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2`,
          [req.params.id, actor.kommuneId],
        );
        if (!sak) return null;
        const { rows: historikk } = await client.query(
          `SELECT fra_fase, til_fase, begrunnelse, endret_av_user_id, created_at
             FROM tidum_barnevern_sak_fase_historikk
            WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at ASC`,
          [req.params.id, actor.kommuneId],
        );
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
        const { rows: [sak] } = await client.query(
          `SELECT * FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2 FOR UPDATE`,
          [req.params.id, actor.kommuneId],
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
        const { rows: [sak] } = await client.query(
          `SELECT id, fase FROM tidum_barnevern_saker WHERE id = $1 AND kommune_id = $2`,
          [req.params.id, actor.kommuneId],
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

    const sak = await loadSakScoped(req.params.id, actor.kommuneId);
    if (!sak) return res.status(404).json({ error: "Sak ikke funnet." });

    const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM tidum_barnevern_sak_journal
          WHERE sak_id = $1 AND kommune_id = $2 ORDER BY created_at ASC`,
        [req.params.id, actor.kommuneId],
      );
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
    requireAuth, // FØR multer: uautentiserte skal ikke kunne skrive 20 MB til disk
    journalUpload.single("file"),
    async (req: Request, res: Response) => {
      const actor = await requireKommuneActor(req);
      if (!actor) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: "Ikke tilgang." });
      }
      if (!req.file) return res.status(400).json({ error: "Ingen fil sendt." });

      try {
        const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
          const { rows: [entry] } = await client.query(
            `SELECT id FROM tidum_barnevern_sak_journal
              WHERE id = $1 AND sak_id = $2 AND kommune_id = $3`,
            [req.params.entryId, req.params.id, actor.kommuneId],
          );
          if (!entry) throw new Error("ENTRY_NOT_FOUND");
          const { rows: [created] } = await client.query(
            `INSERT INTO tidum_barnevern_sak_journal_vedlegg
               (journal_entry_id, kommune_id, filename, original_name, mime_type, size_bytes, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
              req.params.entryId, actor.kommuneId, req.file!.filename, req.file!.originalname,
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
        if (req.file) fs.unlink(req.file.path, () => {});
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
        return row ?? null;
      });
      if (!vedlegg) return res.status(404).json({ error: "Vedlegg ikke funnet." });

      const filePath = path.join(JOURNAL_UPLOAD_DIR, vedlegg.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Fil ikke funnet på disk." });

      res.setHeader("Content-Type", vedlegg.mime_type);
      res.setHeader("Content-Disposition", `attachment; filename="${vedlegg.original_name}"`);
      fs.createReadStream(filePath).pipe(res);
    },
  );
}
