import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { isKommuneFagRolle, normalizeRole } from "../../shared/roles";
import { registerFrist, cancelFrist } from "../lib/frist-engine";
import { requireAuth } from "../middleware/auth";
import { withKommuneRlsContext } from "../lib/database-rls-context";
import { hentVedlegg, lagreVedlegg } from "../lib/barnevern-attachment-storage";

const MELDER_KATEGORIER = new Set([
  "skole", "barnehage", "helsepersonell", "lege", "politi", "nav", "familie_nabo", "anonym", "annet",
]);

// Vedlegg går via barnevern-attachment-storage (S3/EU-bøtte i drift,
// privat disk i dev) — ALDRI under uploads/, som monteres statisk og
// uautentisert i server/smartTimingRoutes.ts. Multer holder filen i
// minne (20 MB-cap) til den er autorisert og lagret.
const ALLOWED_VEDLEGG_MIME = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp",
]);

export function nyttVedleggFilnavn(originalname: string): string {
  const ext = path.extname(originalname);
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
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
  // Kun FAGROLLER: kommune_admin administrerer brukere/oppsett og har
  // bevisst ingen tilgang til saksdata (krav 14, need-to-know).
  if (!isKommuneFagRolle(role) || row.kommune_id == null) return null;
  return { userId: user.id, role, kommuneId: row.kommune_id };
}

async function nextMeldingsnummer(client: Pick<PoolClient, "query">, kommunenummer: string | null): Promise<string> {
  const { rows: [row] } = await client.query(`SELECT nextval('tidum_barnevern_meldingsnummer_seq') AS n`);
  return `BVM-${kommunenummer ?? "UKJENT"}-${row.n}`;
}

/**
 * Krav 15: append-only logg over lesing/nedlasting. Skrives i SAMME
 * transaksjon som lesingen — feiler loggen, feiler lesingen (fail-closed).
 * Logges kun der innhold faktisk returneres til brukeren, ikke ved rene
 * autorisasjonsoppslag.
 */
export async function loggTilgang(
  client: Pick<PoolClient, "query">,
  input: {
    kommuneId: number;
    userId: string;
    handling: "lest" | "nedlastet" | "endret";
    objektType: string;
    objektId: string;
    detaljer?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO tidum_barnevern_tilgangslogg
       (kommune_id, user_id, handling, objekt_type, objekt_id, detaljer)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.kommuneId, input.userId, input.handling, input.objektType, input.objektId,
      input.detaljer ? JSON.stringify(input.detaljer) : null,
    ],
  );
}

/**
 * Krav 14, need-to-know på saksnivå: barnevernsleder ser alt i kommunen;
 * saksbehandler ser kun objekter tildelt seg selv eller utildelte (mottak
 * må kunne plukkes). Returnerer et AND-fragment + params, med
 * parameternummerering fra `nesteParam`.
 */
/**
 * Need-to-know (krav 14/15): saksbehandler ser egne/utildelte saker, PLUSS
 * to kontrollerte unntak fra migrasjon 102 (begge tidsavgrenset, opphevbare
 * og auditlogget ved opprettelse):
 *  - delegasjon: stedfortreder ser fraværende kollegas saker
 *  - break_glass: nødtilgang til én konkret sak (krever sakIdKolonne —
 *    kall uten sak-id-kolonne får kun delegasjonsunntaket)
 */
export function needToKnowVilkar(
  actor: KommuneActor,
  kolonne: string,
  nesteParam: number,
  sakIdKolonne?: string,
): { clause: string; params: string[] } {
  if (actor.role !== "kommune_saksbehandler") return { clause: "", params: [] };
  const breakGlass = sakIdKolonne
    ? ` OR (d.type = 'break_glass' AND d.sak_id = ${sakIdKolonne})`
    : "";
  return {
    clause:
      ` AND (${kolonne} = $${nesteParam} OR ${kolonne} IS NULL OR EXISTS (` +
      `SELECT 1 FROM tidum_barnevern_tilgangsdelegasjoner d` +
      ` WHERE d.til_user_id = $${nesteParam} AND d.opphevet_at IS NULL` +
      ` AND NOW() >= d.fra_dato AND NOW() < d.til_dato` +
      ` AND ((d.type = 'delegasjon' AND d.fra_user_id = ${kolonne})${breakGlass})))`,
    params: [actor.userId],
  };
}

async function loadMeldingScoped(id: string, kommuneId: number, actor?: KommuneActor) {
  return withKommuneRlsContext(kommuneId, async (client) => {
    const ntk = actor
      ? needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3)
      : { clause: "", params: [] as string[] };
    const { rows } = await client.query(
      `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2${ntk.clause}`,
      [id, kommuneId, ...ntk.params],
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
    prioritet: row.prioritet,
    ufodtBarn: row.ufodt_barn,
    termindato: row.termindato,
    forelderMeldingId: row.forelder_melding_id,
    soskenkopiAvMeldingId: row.soskenkopi_av_melding_id,
  };
}

interface NyMeldingFelter {
  melderKategori: string;
  melderNavn: string | null;
  melderKontakt: string | null;
  barnFodselsnummer: string | null;
  barnNavn: string | null;
  beskrivelse: string;
  prioritet: "akutt" | "normal";
  ufodtBarn: boolean;
  termindato: string | null;
  forelderMeldingId?: string | null;
  soskenkopiAvMeldingId?: string | null;
}

/** Validerer felles meldingsfelter; returnerer feilmelding eller null. */
function validerMeldingFelter(body: any): string | null {
  if (!body.melderKategori || !MELDER_KATEGORIER.has(body.melderKategori)) {
    return "Ugyldig melderKategori.";
  }
  if (!body.beskrivelse || typeof body.beskrivelse !== "string") {
    return "beskrivelse er påkrevd.";
  }
  if (body.barnFodselsnummer && !/^\d{11}$/.test(body.barnFodselsnummer)) {
    return "barnFodselsnummer må være 11 siffer.";
  }
  if (body.prioritet != null && body.prioritet !== "akutt" && body.prioritet !== "normal") {
    return "prioritet må være 'akutt' eller 'normal'.";
  }
  if (body.ufodtBarn && body.barnFodselsnummer) {
    return "Ufødt barn kan ikke ha fødselsnummer.";
  }
  if (body.termindato != null) {
    if (!body.ufodtBarn) return "termindato krever ufodtBarn.";
    // pg leverer DATE-kolonner som Date-objekt; API-et tar imot YYYY-MM-DD.
    const termin = body.termindato instanceof Date
      ? body.termindato.toISOString().slice(0, 10)
      : body.termindato;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(termin)) return "termindato må være YYYY-MM-DD.";
  }
  return null;
}

/**
 * Oppretter melding + avklaringsfrist i én transaksjon. Gjenbrukes av
 * ordinær opprettelse, tilleggsmelding og søskenkopi. Akutt prioritet gir
 * 24 timers avklaringsfrist; normal gir 7 dager (bvl. § 2-1: snarest og
 * senest innen en uke).
 */
async function opprettMelding(actor: KommuneActor, felter: NyMeldingFelter) {
  const mottattDato = new Date();
  const fristTimer = felter.prioritet === "akutt" ? 24 : 7 * 24;
  const avklaringsfrist = new Date(mottattDato.getTime() + fristTimer * 3600000);
  return withKommuneRlsContext(actor.kommuneId, async (client) => {
    const { rows: [kommune] } = await client.query(
      `SELECT kommunenummer FROM tidum_kommuner WHERE id = $1`,
      [actor.kommuneId],
    );
    const meldingsnummer = await nextMeldingsnummer(client, kommune?.kommunenummer ?? null);
    const { rows: [created] } = await client.query(
      `INSERT INTO tidum_barnevern_meldinger
         (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, melder_navn, melder_kontakt,
          barn_fodselsnummer, barn_navn, beskrivelse, avklaringsfrist,
          prioritet, ufodt_barn, termindato, forelder_melding_id, soskenkopi_av_melding_id)
       VALUES ($1, $2, 'manuell', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        actor.kommuneId, meldingsnummer, mottattDato, felter.melderKategori,
        felter.melderNavn, felter.melderKontakt, felter.barnFodselsnummer, felter.barnNavn,
        felter.beskrivelse, avklaringsfrist,
        felter.prioritet, felter.ufodtBarn, felter.termindato,
        felter.forelderMeldingId ?? null, felter.soskenkopiAvMeldingId ?? null,
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
}

export function registerBarnevernMeldingRoutes(app: Express): void {
  app.post("/api/barnevern/meldinger", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const feil = validerMeldingFelter(req.body);
    if (feil) return res.status(400).json({ error: feil });

    try {
      const row = await opprettMelding(actor, {
        melderKategori: req.body.melderKategori,
        melderNavn: req.body.melderNavn ?? null,
        melderKontakt: req.body.melderKontakt ?? null,
        barnFodselsnummer: req.body.barnFodselsnummer ?? null,
        barnNavn: req.body.barnNavn ?? null,
        beskrivelse: req.body.beskrivelse,
        prioritet: req.body.prioritet ?? "normal",
        ufodtBarn: req.body.ufodtBarn === true,
        termindato: req.body.termindato ?? null,
      });
      res.status(201).json(toApiShape(row));
    } catch (err) {
      console.error("[barnevern] opprettelse feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette meldingen." });
    }
  });

  // Tilleggsmelding: ny informasjon til en eksisterende melding. Arver barnet
  // fra forelderen; kjedes alltid flatt til den opprinnelige meldingen.
  app.post("/api/barnevern/meldinger/:id/tillegg", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const forelder = await loadMeldingScoped(req.params.id, actor.kommuneId, actor);
    if (!forelder) return res.status(404).json({ error: "Melding ikke funnet." });

    const body = {
      ...req.body,
      melderKategori: req.body.melderKategori ?? forelder.melder_kategori,
      barnFodselsnummer: forelder.barn_fodselsnummer,
      ufodtBarn: forelder.ufodt_barn,
      termindato: forelder.termindato,
    };
    const feil = validerMeldingFelter(body);
    if (feil) return res.status(400).json({ error: feil });

    try {
      const row = await opprettMelding(actor, {
        melderKategori: body.melderKategori,
        melderNavn: req.body.melderNavn ?? forelder.melder_navn,
        melderKontakt: req.body.melderKontakt ?? forelder.melder_kontakt,
        barnFodselsnummer: forelder.barn_fodselsnummer,
        barnNavn: forelder.barn_navn,
        beskrivelse: req.body.beskrivelse,
        prioritet: req.body.prioritet ?? forelder.prioritet,
        ufodtBarn: forelder.ufodt_barn,
        termindato: forelder.termindato,
        forelderMeldingId: forelder.forelder_melding_id ?? forelder.id,
      });
      res.status(201).json(toApiShape(row));
    } catch (err) {
      console.error("[barnevern] tilleggsmelding feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette tilleggsmeldingen." });
    }
  });

  // Søskenkopi: samme melder og bekymring registrert for et søsken.
  app.post("/api/barnevern/meldinger/:id/soskenkopi", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const kilde = await loadMeldingScoped(req.params.id, actor.kommuneId, actor);
    if (!kilde) return res.status(404).json({ error: "Melding ikke funnet." });

    const body = {
      ...req.body,
      melderKategori: kilde.melder_kategori,
      beskrivelse: kilde.beskrivelse,
    };
    const feil = validerMeldingFelter(body);
    if (feil) return res.status(400).json({ error: feil });
    if (!req.body.barnNavn && !req.body.barnFodselsnummer && !req.body.ufodtBarn) {
      return res.status(400).json({ error: "Søskenkopi krever barnNavn, barnFodselsnummer eller ufodtBarn." });
    }

    try {
      const row = await opprettMelding(actor, {
        melderKategori: kilde.melder_kategori,
        melderNavn: kilde.melder_navn,
        melderKontakt: kilde.melder_kontakt,
        barnFodselsnummer: req.body.barnFodselsnummer ?? null,
        barnNavn: req.body.barnNavn ?? null,
        beskrivelse: kilde.beskrivelse,
        prioritet: req.body.prioritet ?? kilde.prioritet,
        ufodtBarn: req.body.ufodtBarn === true,
        termindato: req.body.termindato ?? null,
        soskenkopiAvMeldingId: kilde.id,
      });
      res.status(201).json(toApiShape(row));
    } catch (err) {
      console.error("[barnevern] søskenkopi feilet", err);
      res.status(500).json({ error: "Kunne ikke opprette søskenkopien." });
    }
  });

  app.get("/api/barnevern/meldinger", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntkMedStatus = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
        const ntkUtenStatus = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 2);
        const result = status
          ? await client.query(
              `SELECT * FROM tidum_barnevern_meldinger WHERE kommune_id = $1 AND status = $2${ntkMedStatus.clause} ORDER BY created_at DESC`,
              [actor.kommuneId, status, ...ntkMedStatus.params],
            )
          : await client.query(
              `SELECT * FROM tidum_barnevern_meldinger WHERE kommune_id = $1${ntkUtenStatus.clause} ORDER BY created_at DESC`,
              [actor.kommuneId, ...ntkUtenStatus.params],
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

    const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
      const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
      const { rows: [melding] } = await client.query(
        `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2${ntk.clause}`,
        [req.params.id, actor.kommuneId, ...ntk.params],
      );
      if (!melding) return null;
      await loggTilgang(client, {
        kommuneId: actor.kommuneId, userId: actor.userId,
        handling: "lest", objektType: "melding", objektId: melding.id,
      });
      return melding;
    });
    if (!row) return res.status(404).json({ error: "Melding ikke funnet." });
    res.json(toApiShape(row));
  });

  // Kontrollert redigering: kun utvalgte felter, kun før avklaring, krever
  // begrunnelse, og hver endring logges append-only med før-/etterverdier.
  const REDIGERBARE_FELTER: Record<string, string> = {
    melderKategori: "melder_kategori",
    melderNavn: "melder_navn",
    melderKontakt: "melder_kontakt",
    barnFodselsnummer: "barn_fodselsnummer",
    barnNavn: "barn_navn",
    beskrivelse: "beskrivelse",
    prioritet: "prioritet",
    termindato: "termindato",
  };

  app.patch("/api/barnevern/meldinger/:id", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { begrunnelse, endringer } = req.body;
    if (!begrunnelse || typeof begrunnelse !== "string" || begrunnelse.trim().length === 0) {
      return res.status(400).json({ error: "begrunnelse er påkrevd for redigering." });
    }
    if (!endringer || typeof endringer !== "object" || Array.isArray(endringer)) {
      return res.status(400).json({ error: "endringer må være et objekt med felter som skal endres." });
    }
    const ukjente = Object.keys(endringer).filter((k) => !(k in REDIGERBARE_FELTER));
    if (ukjente.length > 0) {
      return res.status(400).json({ error: `Feltene kan ikke redigeres: ${ukjente.join(", ")}.` });
    }
    if (Object.keys(endringer).length === 0) {
      return res.status(400).json({ error: "endringer er tom." });
    }

    try {
      const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
          const { rows: [existing] } = await client.query(
            `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2${ntk.clause} FOR UPDATE`,
            [req.params.id, actor.kommuneId, ...ntk.params],
        );
        if (!existing) throw new Error("MELDING_NOT_FOUND");
        if (existing.status === "henlagt" || existing.status === "sendt_til_undersokelse") {
          throw new Error("MELDING_ALLEREDE_AVKLART");
        }

        // Valider den samlede sluttilstanden med samme regler som opprettelse.
        const sluttilstand = {
          melderKategori: endringer.melderKategori ?? existing.melder_kategori,
          beskrivelse: endringer.beskrivelse ?? existing.beskrivelse,
          barnFodselsnummer: "barnFodselsnummer" in endringer ? endringer.barnFodselsnummer : existing.barn_fodselsnummer,
          prioritet: endringer.prioritet ?? existing.prioritet,
          ufodtBarn: existing.ufodt_barn,
          termindato: "termindato" in endringer ? endringer.termindato : existing.termindato,
        };
        const feil = validerMeldingFelter(sluttilstand);
        if (feil) throw Object.assign(new Error("VALIDERING"), { detalj: feil });

        const feltEndringer: Record<string, { fra: unknown; til: unknown }> = {};
        const setDeler: string[] = [];
        const verdier: unknown[] = [];
        for (const [apiFelt, kolonne] of Object.entries(REDIGERBARE_FELTER)) {
          if (!(apiFelt in endringer)) continue;
          const nyVerdi = endringer[apiFelt] ?? null;
          if (existing[kolonne] === nyVerdi) continue;
          feltEndringer[apiFelt] = { fra: existing[kolonne], til: nyVerdi };
          verdier.push(nyVerdi);
          setDeler.push(`${kolonne} = $${verdier.length}`);
        }
        if (setDeler.length === 0) return existing;

        verdier.push(req.params.id, actor.kommuneId);
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_meldinger
              SET ${setDeler.join(", ")}, updated_at = NOW()
            WHERE id = $${verdier.length - 1} AND kommune_id = $${verdier.length}
            RETURNING *`,
          verdier,
        );
        await client.query(
          `INSERT INTO tidum_barnevern_melding_revisjoner
             (melding_id, kommune_id, begrunnelse, felt_endringer, endret_av_user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.params.id, actor.kommuneId, begrunnelse, JSON.stringify(feltEndringer), actor.userId],
        );
        return updated;
      });
      res.json(toApiShape(row));
    } catch (err) {
      if (err instanceof Error && err.message === "MELDING_NOT_FOUND") {
        return res.status(404).json({ error: "Melding ikke funnet." });
      }
      if (err instanceof Error && err.message === "MELDING_ALLEREDE_AVKLART") {
        return res.status(409).json({ error: "Avklart melding kan ikke redigeres." });
      }
      if (err instanceof Error && err.message === "VALIDERING") {
        return res.status(400).json({ error: (err as any).detalj });
      }
      console.error("[barnevern] redigering feilet", err);
      res.status(500).json({ error: "Kunne ikke redigere meldingen." });
    }
  });

  app.get("/api/barnevern/meldinger/:id/revisjoner", async (req: Request, res: Response) => {
    const actor = await requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const melding = await loadMeldingScoped(req.params.id, actor.kommuneId, actor);
    if (!melding) return res.status(404).json({ error: "Melding ikke funnet." });

    const rows = await withKommuneRlsContext(actor.kommuneId, async (client) => {
      const { rows } = await client.query(
        `SELECT begrunnelse, felt_endringer, endret_av_user_id, created_at
           FROM tidum_barnevern_melding_revisjoner
          WHERE melding_id = $1 AND kommune_id = $2 ORDER BY created_at ASC`,
        [req.params.id, actor.kommuneId],
      );
      await loggTilgang(client, {
        kommuneId: actor.kommuneId, userId: actor.userId,
        handling: "lest", objektType: "melding_revisjoner", objektId: req.params.id,
      });
      return rows;
    });
    res.json(rows.map((r: any) => ({
      begrunnelse: r.begrunnelse,
      feltEndringer: r.felt_endringer,
      endretAvUserId: r.endret_av_user_id,
      createdAt: r.created_at,
    })));
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
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
          const { rows: [existing] } = await client.query(
            `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2${ntk.clause} FOR UPDATE`,
            [req.params.id, actor.kommuneId, ...ntk.params],
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
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 5);
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_barnevern_meldinger
           SET status = 'henlagt', henleggelse_begrunnelse = $1, avklart_dato = NOW(), avklart_av_user_id = $2, updated_at = NOW()
           WHERE id = $3 AND kommune_id = $4
             AND status NOT IN ('henlagt', 'sendt_til_undersokelse')${ntk.clause}
           RETURNING *`,
          [begrunnelse, actor.userId, req.params.id, actor.kommuneId, ...ntk.params],
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
        const ntk = needToKnowVilkar(actor, "tildelt_saksbehandler_id", 3);
          const { rows: [existing] } = await client.query(
            `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2${ntk.clause} FOR UPDATE`,
            [req.params.id, actor.kommuneId, ...ntk.params],
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
    requireAuth, // FØR multer: uautentiserte skal ikke kunne fylle minne med 20 MB
    upload.single("file"),
    async (req: Request, res: Response) => {
      const actor = await requireKommuneActor(req);
      if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

      const melding = await loadMeldingScoped(req.params.id, actor.kommuneId, actor);
      if (!melding) return res.status(404).json({ error: "Melding ikke funnet." });
      if (!req.file) return res.status(400).json({ error: "Ingen fil sendt." });

      try {
        const filename = nyttVedleggFilnavn(req.file.originalname);
        await lagreVedlegg("barnevern-meldinger", filename, req.file.buffer, req.file.mimetype);
        const row = await withKommuneRlsContext(actor.kommuneId, async (client) => {
          const { rows: [created] } = await client.query(
          `INSERT INTO tidum_barnevern_melding_vedlegg
             (melding_id, kommune_id, filename, original_name, mime_type, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            req.params.id, actor.kommuneId, filename, req.file!.originalname,
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

      const melding = await loadMeldingScoped(req.params.id, actor.kommuneId, actor);
      if (!melding) return res.status(404).json({ error: "Melding ikke funnet." });

      const vedlegg = await withKommuneRlsContext(actor.kommuneId, async (client) => {
        const { rows: [row] } = await client.query(
          `SELECT * FROM tidum_barnevern_melding_vedlegg
            WHERE id = $1 AND melding_id = $2 AND kommune_id = $3`,
          [req.params.vedleggId, req.params.id, actor.kommuneId],
        );
        if (row) {
          await loggTilgang(client, {
            kommuneId: actor.kommuneId, userId: actor.userId,
            handling: "nedlastet", objektType: "melding_vedlegg", objektId: row.id,
            detaljer: { meldingId: req.params.id, filnavn: row.original_name },
          });
        }
        return row ?? null;
      });
      if (!vedlegg) return res.status(404).json({ error: "Vedlegg ikke funnet." });

      try {
        const innhold = await hentVedlegg("barnevern-meldinger", vedlegg.filename);
        res.setHeader("Content-Type", vedlegg.mime_type);
        res.setHeader("Content-Disposition", `attachment; filename="${vedlegg.original_name}"`);
        res.send(innhold);
      } catch {
        res.status(404).json({ error: "Fil ikke funnet i vedleggslageret." });
      }
    },
  );
}
