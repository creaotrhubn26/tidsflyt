import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { isKommuneRole, normalizeRole } from "../../shared/roles";
import { registerFrist, cancelFrist } from "../lib/frist-engine";
import { requireAuth } from "../middleware/auth";
import { withKommuneRlsContext } from "../lib/database-rls-context";

const MELDER_KATEGORIER = new Set([
  "skole", "barnehage", "helsepersonell", "lege", "politi", "nav", "familie_nabo", "anonym", "annet",
]);

// IKKE under uploads/ — den roten monteres som statisk, UAUTENTISERT katalog i
// server/smartTimingRoutes.ts ("/uploads"). Barnevernsvedlegg inneholder PII og
// skal kun ut via den kommune-scopede GET .../vedlegg/:vedleggId-ruten under.
const BARNEVERN_UPLOAD_DIR = path.join(process.cwd(), "private-uploads", "barnevern-meldinger");
if (!fs.existsSync(BARNEVERN_UPLOAD_DIR)) fs.mkdirSync(BARNEVERN_UPLOAD_DIR, { recursive: true });

const ALLOWED_VEDLEGG_MIME = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp",
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: BARNEVERN_UPLOAD_DIR,
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

export interface KommuneActor {
  userId: string;
  role: string;
  kommuneId: number;
}

/**
 * Rolle og kommunetilhørighet hentes ALLTID på nytt fra users via req.user.id —
 * aldri fra et sesjonsbåret felt (AuthUser har bevisst ingen kommuneId, se
 * server/lib/auth-types.ts). Feiler lukket: mangler bruker, kommune_id eller
 * kommune-rolle, er svaret null → 403.
 */
export async function requireKommuneActor(req: Request): Promise<KommuneActor | null> {
  const user = (req as any).user;
  if (!user?.id) return null;
  const { rows: [row] } = await pool.query(
    `SELECT role, kommune_id FROM users WHERE id = $1`,
    [user.id],
  );
  if (!row) return null;
  const role = normalizeRole(row.role);
  if (!isKommuneRole(role) || row.kommune_id == null) return null;
  return { userId: user.id, role, kommuneId: row.kommune_id };
}

async function nextMeldingsnummer(client: Pick<PoolClient, "query">, kommunenummer: string | null): Promise<string> {
  const { rows: [row] } = await client.query(`SELECT nextval('tidum_barnevern_meldingsnummer_seq') AS n`);
  return `BVM-${kommunenummer ?? "UKJENT"}-${row.n}`;
}

async function loadMeldingScoped(id: string, kommuneId: number) {
  return withKommuneRlsContext(kommuneId, async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2`,
      [id, kommuneId],
    );
    return rows[0] ?? null;
  });
}

function toApiShape(row: any) {
  return {
    id: row.id,
    kommuneId: row.kommune_id,
    meldingsnummer: row.meldingsnummer,
    kilde: row.kilde,
    mottattDato: row.mottatt_dato,
    melderKategori: row.melder_kategori,
    melderNavn: row.melder_navn,
    melderKontakt: row.melder_kontakt,
    barnFodselsnummer: row.barn_fodselsnummer,
    barnNavn: row.barn_navn,
    beskrivelse: row.beskrivelse,
    status: row.status,
    tildeltSaksbehandlerId: row.tildelt_saksbehandler_id,
    avklaringsfrist: row.avklaringsfrist,
    avklartDato: row.avklart_dato,
    avklartAvUserId: row.avklart_av_user_id,
    henleggelseBegrunnelse: row.henleggelse_begrunnelse,
  };
}

export function registerBarnevernMeldingRoutes(app: Express): void {
  app.post("/api/barnevern/meldinger", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { melderKategori, melderNavn, melderKontakt, barnFodselsnummer, barnNavn, beskrivelse } = req.body;
    if (!melderKategori || !MELDER_KATEGORIER.has(melderKategori)) {
      return res.status(400).json({ error: "Ugyldig melderKategori." });
    }
    if (!beskrivelse || typeof beskrivelse !== "string") {
      return res.status(400).json({ error: "beskrivelse er påkrevd." });
    }
    if (barnFodselsnummer && !/^\d{11}$/.test(barnFodselsnummer)) {
      return res.status(400).json({ error: "barnFodselsnummer må være 11 siffer." });
    }

    try {
      const mottattDato = new Date();
      const avklaringsfrist = new Date(mottattDato.getTime() + 7 * 86400000);
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [kommune] } = await client.query(
          `SELECT kommunenummer FROM tidum_kommuner WHERE id = $1`,
          [actor.kommuneId],
        );
        const meldingsnummer = await nextMeldingsnummer(client, kommune?.kommunenummer ?? null);
        const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_meldinger
             (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, melder_navn, melder_kontakt,
              barn_fodselsnummer, barn_navn, beskrivelse, avklaringsfrist)
           VALUES ($1, $2, 'manuell', $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            actor.kommuneId, meldingsnummer, mottattDato, melderKategori,
            melderNavn ?? null, melderKontakt ?? null, barnFodselsnummer ?? null, barnNavn ?? null,
            beskrivelse, avklaringsfrist,
          ],
        );
        // Utildelt melding varsler kommunens barnevernsleder inntil tildeling.
        const { rows: [leder] } = await client.query(
          `SELECT id FROM users WHERE kommune_id = $1 AND role = 'barnevernsleder' ORDER BY id LIMIT 1`,
          [actor.kommuneId],
        );
        await registerFrist({
          entityType: "barnevern_melding",
          entityId: created.id,
          kommuneId: actor.kommuneId,
          fristType: "avklaring",
          dueAt: avklaringsfrist,
          notifyUserId: leder?.id,
        }, client);
        return created;
      });

      res.status(201).json(toApiShape(row));
    } catch (err) {
      console.error("[barnevern] opprettelse feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette meldingen." });
    }
  });

  app.get("/api/barnevern/meldinger", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const result = status
          ? await client.query(
              `SELECT * FROM tidum_barnevern_meldinger WHERE kommune_id = $1 AND status = $2 ORDER BY created_at DESC`,
              [actor.kommuneId, status],
            )
          : await client.query(
              `SELECT * FROM tidum_barnevern_meldinger WHERE kommune_id = $1 ORDER BY created_at DESC`,
              [actor.kommuneId],
            );
        return result.rows;
      });
      res.json(rows.map(toApiShape));
    } catch (err) {
      console.error("[barnevern] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente meldinger." });
    }
  });

  app.get("/api/barnevern/meldinger/:id", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const row = await loadMeldingScoped(req.params.id, actor.kommuneId);
    if (!row) return res.status(404).json({ error: "Melding ikke funnet." });
    res.json(toApiShape(row));
  });

  app.patch("/api/barnevern/meldinger/:id/tildel", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan tildele." });
    }

    const { tildeltSaksbehandlerId } = req.body;
    if (!tildeltSaksbehandlerId) return res.status(400).json({ error: "tildeltSaksbehandlerId er påkrevd." });
    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [existing] } = await client.query(
          `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2 FOR UPDATE`,
          [req.params.id, actor.kommuneId],
        );
        if (!existing) throw new Error("MELDING_NOT_FOUND");
        const assignee = await client.query(
          `SELECT id FROM users
            WHERE id = $1 AND kommune_id = $2
              AND role IN ('barnevernsleder', 'kommune_saksbehandler')`,
          [tildeltSaksbehandlerId, actor.kommuneId],
        );
        if (!assignee.rowCount) throw new Error("ASSIGNEE_NOT_IN_KOMMUNE");
        const newStatus = existing.status === "mottatt" ? "under_avklaring" : existing.status;
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_meldinger SET tildelt_saksbehandler_id = $1, status = $2, updated_at = NOW()
           WHERE id = $3 AND kommune_id = $4 RETURNING *`,
          [tildeltSaksbehandlerId, newStatus, req.params.id, actor.kommuneId],
        );
        await client.query(
          `UPDATE tidum_frister SET notify_user_id = $1, updated_at = NOW()
           WHERE entity_type = 'barnevern_melding' AND entity_id = $2 AND kommune_id = $3 AND status = 'aktiv'`,
          [tildeltSaksbehandlerId, req.params.id, actor.kommuneId],
        );
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "MELDING_NOT_FOUND") {
        return res.status(404).json({ error: "Melding ikke funnet." });
      }
      if (err instanceof Error && err.message === "ASSIGNEE_NOT_IN_KOMMUNE") {
        return res.status(400).json({ error: "Saksbehandleren tilhører ikke kommunen." });
      }
      console.error("[barnevern] tildeling feilet", err);
      res.status(500).json({ error: "Kunne ikke tildele meldingen." });
    }
  });

  app.post("/api/barnevern/meldinger/:id/henlegg", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { begrunnelse } = req.body;
    if (!begrunnelse || typeof begrunnelse !== "string" || begrunnelse.trim().length === 0) {
      return res.status(400).json({ error: "begrunnelse er påkrevd for henleggelse." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        // Allerede avklart melding kan ikke henlegges — «sendt til
        // undersøkelse» har opprettet en sak som da ville blitt foreldreløs.
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_meldinger
           SET status = 'henlagt', henleggelse_begrunnelse = $1, avklart_dato = NOW(), avklart_av_user_id = $2, updated_at = NOW()
           WHERE id = $3 AND kommune_id = $4
             AND status NOT IN ('henlagt', 'sendt_til_undersokelse')
           RETURNING *`,
          [begrunnelse, actor.userId, req.params.id, actor.kommuneId],
        );
        if (!updated) throw new Error("MELDING_NOT_FOUND");
        await cancelFrist(
          "barnevern_melding",
          req.params.id,
          "avklaring",
          { kommuneId: actor.kommuneId },
          client,
        );
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "MELDING_NOT_FOUND") {
        return res.status(404).json({ error: "Melding ikke funnet." });
      }
      console.error("[barnevern] henleggelse feilet", err);
      res.status(500).json({ error: "Kunne ikke henlegge meldingen." });
    }
  });

  app.post("/api/barnevern/meldinger/:id/send-til-undersokelse", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const result = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [existing] } = await client.query(
          `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2 FOR UPDATE`,
          [req.params.id, actor.kommuneId],
        );
        if (!existing) throw new Error("MELDING_NOT_FOUND");
        if (existing.status === "sendt_til_undersokelse" || existing.status === "henlagt") {
          throw new Error("MELDING_ALLEREDE_AVKLART");
        }
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_meldinger
           SET status = 'sendt_til_undersokelse', avklart_dato = NOW(), avklart_av_user_id = $1, updated_at = NOW()
           WHERE id = $2 AND kommune_id = $3 RETURNING *`,
          [actor.userId, req.params.id, actor.kommuneId],
        );
        await cancelFrist(
          "barnevern_melding",
          req.params.id,
          "avklaring",
          { kommuneId: actor.kommuneId },
          client,
        );

        // Krav 2: beslutningen oppretter den kommunale barnevernssaken i samme
        // transaksjon. Undersøkelsesfristen er tre måneder (bvl. § 2-2).
        const { rows: [kommune] } = await client.query(
          `SELECT kommunenummer FROM tidum_kommuner WHERE id = $1`,
          [actor.kommuneId],
        );
        const { rows: [seq] } = await client.query(`SELECT nextval('tidum_barnevern_saksnummer_seq') AS n`);
        const saksnummer = `BVS-${kommune?.kommunenummer ?? "UKJENT"}-${seq.n}`;
        const undersokelsesfrist = new Date();
        undersokelsesfrist.setMonth(undersokelsesfrist.getMonth() + 3);
        const { rows: [sak] } = await client.query(
          `INSERT INTO tidum_barnevern_saker
             (kommune_id, saksnummer, melding_id, barn_fodselsnummer, barn_navn, fase,
              tildelt_saksbehandler_id, undersokelsesfrist)
           VALUES ($1, $2, $3, $4, $5, 'undersokelse', $6, $7)
           RETURNING *`,
          [
            actor.kommuneId, saksnummer, existing.id, existing.barn_fodselsnummer,
            existing.barn_navn, existing.tildelt_saksbehandler_id, undersokelsesfrist,
          ],
        );
        await client.query(
          `INSERT INTO tidum_barnevern_sak_fase_historikk
             (sak_id, kommune_id, fra_fase, til_fase, begrunnelse, endret_av_user_id)
           VALUES ($1, $2, NULL, 'undersokelse', 'Opprettet fra bekymringsmelding', $3)`,
          [sak.id, actor.kommuneId, actor.userId],
        );
        await registerFrist({
          entityType: "barnevern_sak",
          entityId: sak.id,
          kommuneId: actor.kommuneId,
          fristType: "undersokelse",
          dueAt: undersokelsesfrist,
          notifyUserId: existing.tildelt_saksbehandler_id ?? undefined,
        }, client);
        return { melding: updated, sak };
      });
      res.json({ ...toApiShape(result.melding), sak: { id: result.sak.id, saksnummer: result.sak.saksnummer } });
    } catch (err) {
      if (err instanceof Error && err.message === "MELDING_NOT_FOUND") {
        return res.status(404).json({ error: "Melding ikke funnet." });
      }
      if (err instanceof Error && err.message === "MELDING_ALLEREDE_AVKLART") {
        return res.status(409).json({ error: "Meldingen er allerede avklart." });
      }
      console.error("[barnevern] videresending feilet", err);
      res.status(500).json({ error: "Kunne ikke sende meldingen til undersøkelse." });
    }
  });

  app.post(
    "/api/barnevern/meldinger/:id/vedlegg",
    requireAuth, // FØR multer: uautentiserte skal ikke kunne skrive 20 MB til disk
    upload.single("file"),
    async (req: Request, res: Response) => {
      const actor = await requireKommuneActor(req);
      if (!actor) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: "Ikke tilgang." });
      }

      const melding = await loadMeldingScoped(req.params.id, actor.kommuneId);
      if (!melding) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: "Melding ikke funnet." });
      }
      if (!req.file) return res.status(400).json({ error: "Ingen fil sendt." });

      try {
        const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
          const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_melding_vedlegg
             (melding_id, kommune_id, filename, original_name, mime_type, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            req.params.id, actor.kommuneId, req.file!.filename, req.file!.originalname,
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
        fs.unlink(req.file.path, () => {});
        console.error("[barnevern] vedleggsopplasting feilet", err);
        res.status(500).json({ error: "Kunne ikke lagre vedlegget." });
      }
    },
  );

  app.get(
    "/api/barnevern/meldinger/:id/vedlegg/:vedleggId",
    async (req: Request, res: Response) => {
      const actor = await requireKommuneActor(req);
      if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

      const melding = await loadMeldingScoped(req.params.id, actor.kommuneId);
      if (!melding) return res.status(404).json({ error: "Melding ikke funnet." });

      const vedlegg = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [row] } = await client.query(
          `SELECT * FROM tidum_barnevern_melding_vedlegg
            WHERE id = $1 AND melding_id = $2 AND kommune_id = $3`,
          [req.params.vedleggId, req.params.id, actor.kommuneId],
        );
        return row ?? null;
      });
      if (!vedlegg) return res.status(404).json({ error: "Vedlegg ikke funnet." });

      const filePath = path.join(BARNEVERN_UPLOAD_DIR, vedlegg.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Fil ikke funnet på disk." });

      res.setHeader("Content-Type", vedlegg.mime_type);
      res.setHeader("Content-Disposition", `attachment; filename="${vedlegg.original_name}"`);
      fs.createReadStream(filePath).pipe(res);
    },
  );
}
