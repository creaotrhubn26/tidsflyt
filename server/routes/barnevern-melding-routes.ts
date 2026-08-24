import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { isKommuneRole, normalizeRole } from "../../shared/roles";
import { registerFrist, cancelFrist } from "../lib/frist-engine";

const MELDER_KATEGORIER = new Set([
  "skole", "barnehage", "helsepersonell", "lege", "politi", "nav", "familie_nabo", "anonym", "annet",
]);

interface KommuneActor {
  userId: string;
  role: string;
  kommuneId: number;
}

function requireKommuneActor(req: Request): KommuneActor | null {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const kommuneId = user?.kommuneId;
  if (!user?.id || !isKommuneRole(role) || kommuneId == null) return null;
  return { userId: user.id, role, kommuneId };
}

async function nextMeldingsnummer(kommunenummer: string | null): Promise<string> {
  const { rows: [row] } = await pool.query(`SELECT nextval('tidum_barnevern_meldingsnummer_seq') AS n`);
  return `BVM-${kommunenummer ?? "UKJENT"}-${row.n}`;
}

async function loadMeldingScoped(id: string, kommuneId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2`,
    [id, kommuneId],
  );
  return rows[0] ?? null;
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
    const actor = requireKommuneActor(req);
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
      const { rows: [kommune] } = await pool.query(
        `SELECT kommunenummer FROM tidum_kommuner WHERE id = $1`,
        [actor.kommuneId],
      );
      const meldingsnummer = await nextMeldingsnummer(kommune?.kommunenummer ?? null);
      const mottattDato = new Date();
      const avklaringsfrist = new Date(mottattDato.getTime() + 7 * 86400000);

      const { rows: [row] } = await pool.query(
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

      await registerFrist({
        entityType: "barnevern_melding",
        entityId: row.id,
        kommuneId: actor.kommuneId,
        fristType: "avklaring",
        dueAt: avklaringsfrist,
      });

      res.status(201).json(toApiShape(row));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/barnevern/meldinger", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const { rows } = status
        ? await pool.query(
            `SELECT * FROM tidum_barnevern_meldinger WHERE kommune_id = $1 AND status = $2 ORDER BY created_at DESC`,
            [actor.kommuneId, status],
          )
        : await pool.query(
            `SELECT * FROM tidum_barnevern_meldinger WHERE kommune_id = $1 ORDER BY created_at DESC`,
            [actor.kommuneId],
          );
      res.json(rows.map(toApiShape));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/barnevern/meldinger/:id", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const row = await loadMeldingScoped(req.params.id, actor.kommuneId);
    if (!row) return res.status(404).json({ error: "Melding ikke funnet." });
    res.json(toApiShape(row));
  });

  app.patch("/api/barnevern/meldinger/:id/tildel", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan tildele." });
    }

    const existing = await loadMeldingScoped(req.params.id, actor.kommuneId);
    if (!existing) return res.status(404).json({ error: "Melding ikke funnet." });

    const { tildeltSaksbehandlerId } = req.body;
    if (!tildeltSaksbehandlerId) return res.status(400).json({ error: "tildeltSaksbehandlerId er påkrevd." });

    const newStatus = existing.status === "mottatt" ? "under_avklaring" : existing.status;
    try {
      const { rows: [row] } = await pool.query(
        `UPDATE tidum_barnevern_meldinger SET tildelt_saksbehandler_id = $1, status = $2, updated_at = NOW()
         WHERE id = $3 AND kommune_id = $4 RETURNING *`,
        [tildeltSaksbehandlerId, newStatus, req.params.id, actor.kommuneId],
      );
      await pool.query(
        `UPDATE tidum_frister SET notify_user_id = $1, updated_at = NOW()
         WHERE entity_type = 'barnevern_melding' AND entity_id = $2 AND status = 'aktiv'`,
        [tildeltSaksbehandlerId, req.params.id],
      );
      res.json(toApiShape(row));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/barnevern/meldinger/:id/henlegg", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const existing = await loadMeldingScoped(req.params.id, actor.kommuneId);
    if (!existing) return res.status(404).json({ error: "Melding ikke funnet." });

    const { begrunnelse } = req.body;
    if (!begrunnelse || typeof begrunnelse !== "string" || begrunnelse.trim().length === 0) {
      return res.status(400).json({ error: "begrunnelse er påkrevd for henleggelse." });
    }

    try {
      const { rows: [row] } = await pool.query(
        `UPDATE tidum_barnevern_meldinger
         SET status = 'henlagt', henleggelse_begrunnelse = $1, avklart_dato = NOW(), avklart_av_user_id = $2, updated_at = NOW()
         WHERE id = $3 AND kommune_id = $4 RETURNING *`,
        [begrunnelse, actor.userId, req.params.id, actor.kommuneId],
      );
      await cancelFrist("barnevern_melding", req.params.id, "avklaring");
      res.json(toApiShape(row));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/barnevern/meldinger/:id/send-til-undersokelse", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const existing = await loadMeldingScoped(req.params.id, actor.kommuneId);
    if (!existing) return res.status(404).json({ error: "Melding ikke funnet." });

    try {
      const { rows: [row] } = await pool.query(
        `UPDATE tidum_barnevern_meldinger
         SET status = 'sendt_til_undersokelse', avklart_dato = NOW(), avklart_av_user_id = $1, updated_at = NOW()
         WHERE id = $2 AND kommune_id = $3 RETURNING *`,
        [actor.userId, req.params.id, actor.kommuneId],
      );
      await cancelFrist("barnevern_melding", req.params.id, "avklaring");
      res.json(toApiShape(row));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
