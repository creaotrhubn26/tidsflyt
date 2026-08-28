/**
 * server/lib/barnevernsregister.ts
 *
 * Krav 10/28: daglig automatisk innrapportering til Barnevernsregisteret
 * (Bufdir), samme modell som Flyt Barnevern/Modulus Barn — tjenesten
 * slipper KOSTRA-/halvårsfrister fordi registeret mates daglig med
 * kvalitetssikrede data.
 *
 * Datasettet snapshotes fra de autoritative saksdataene, KVALITETSSIKRES
 * FØR innsending (avvik → 'avvist' med feilliste, sendes aldri), og
 * transporteres via konfigurerbar adapter:
 *   BVR_API_URL   — Bufdirs mottaksendepunkt (avtales med Bufdir)
 *   BVR_API_TOKEN — Maskinporten-/API-token
 * Uten konfigurasjon blir innsendinger stående i kø — aldri falsk «sendt».
 */
import { createHash } from "crypto";
import { withKommuneRlsContext, withSystemRlsContext } from "./database-rls-context";
import { nextAttemptDelayMs } from "./archive/noark";

const MAX_FORSOK = 8;
const STALE_SENDER_MINUTTER = 10;

export interface BvrTransport {
  send(input: { kommunenummer: string; rapportdato: string; datasett: unknown }): Promise<{ kvittering: Record<string, unknown> }>;
}

let testTransport: BvrTransport | null = null;

/** Kun for tester. */
export function setBvrTransportForTesting(transport: BvrTransport | null): void {
  testTransport = transport;
}

export function getBvrTransport(): BvrTransport | null {
  if (testTransport) return testTransport;
  const url = process.env.BVR_API_URL;
  const token = process.env.BVR_API_TOKEN;
  if (!url || !token) return null;
  return {
    async send(input) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(`Barnevernsregisteret svarte ${response.status}`);
      const body = await response.json().catch(() => ({}));
      return { kvittering: body as Record<string, unknown> };
    },
  };
}

export interface BvrDatasett {
  kommunenummer: string;
  kommune: string;
  rapportdato: string;
  hendelserSisteDogn: {
    meldingerMottatt: number;
    meldingerAvklart: number;
    meldingerHenlagt: number;
    undersokelserStartet: number;
    undersokelserKonkludert: number;
    faseoverganger: Record<string, number>;
  };
  bestand: {
    meldingerUnderAvklaring: number;
    sakerIUndersokelse: number;
    sakerITiltak: number;
    aktiveGodkjentePlaner: number;
    meldingerOverFrist: number;
    undersokelserOverFrist: number;
  };
}

/** Bygg dagsnapshotet fra de autoritative saksdataene i én transaksjon. */
export async function byggDagsdatasett(kommuneId: number, rapportdato: string): Promise<BvrDatasett | null> {
  return withKommuneRlsContext(kommuneId, async (client) => {
    const { rows: [kommune] } = await client.query(
      `SELECT navn, kommunenummer FROM tidum_kommuner WHERE id = $1`,
      [kommuneId],
    );
    if (!kommune) return null;

    const { rows: [hendelser] } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM tidum_barnevern_meldinger
           WHERE kommune_id = $1 AND mottatt_dato >= $2::date AND mottatt_dato < ($2::date + 1)) AS meldinger_mottatt,
         (SELECT COUNT(*)::int FROM tidum_barnevern_meldinger
           WHERE kommune_id = $1 AND avklart_dato >= $2::date AND avklart_dato < ($2::date + 1)) AS meldinger_avklart,
         (SELECT COUNT(*)::int FROM tidum_barnevern_meldinger
           WHERE kommune_id = $1 AND status = 'henlagt'
             AND avklart_dato >= $2::date AND avklart_dato < ($2::date + 1)) AS meldinger_henlagt,
         (SELECT COUNT(*)::int FROM tidum_barnevern_saker
           WHERE kommune_id = $1 AND created_at >= $2::date AND created_at < ($2::date + 1)) AS undersokelser_startet,
         (SELECT COUNT(*)::int FROM tidum_barnevern_sak_fase_historikk
           WHERE kommune_id = $1 AND fra_fase = 'undersokelse'
             AND created_at >= $2::date AND created_at < ($2::date + 1)) AS undersokelser_konkludert`,
      [kommuneId, rapportdato],
    );

    const { rows: overganger } = await client.query(
      `SELECT COALESCE(fra_fase, 'ny') || '->' || til_fase AS overgang, COUNT(*)::int AS antall
         FROM tidum_barnevern_sak_fase_historikk
        WHERE kommune_id = $1 AND created_at >= $2::date AND created_at < ($2::date + 1)
        GROUP BY 1`,
      [kommuneId, rapportdato],
    );

    const { rows: [bestand] } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM tidum_barnevern_meldinger
           WHERE kommune_id = $1 AND status IN ('mottatt', 'under_avklaring')) AS meldinger_under_avklaring,
         (SELECT COUNT(*)::int FROM tidum_barnevern_saker
           WHERE kommune_id = $1 AND fase = 'undersokelse') AS saker_i_undersokelse,
         (SELECT COUNT(*)::int FROM tidum_barnevern_saker
           WHERE kommune_id = $1 AND fase = 'tiltak') AS saker_i_tiltak,
         (SELECT COUNT(*)::int FROM tidum_barnevern_planer
           WHERE kommune_id = $1 AND status = 'godkjent') AS aktive_godkjente_planer,
         (SELECT COUNT(*)::int FROM tidum_barnevern_meldinger
           WHERE kommune_id = $1 AND status IN ('mottatt', 'under_avklaring') AND avklaringsfrist < NOW()) AS meldinger_over_frist,
         (SELECT COUNT(*)::int FROM tidum_barnevern_saker
           WHERE kommune_id = $1 AND fase = 'undersokelse'
             AND undersokelsesfrist IS NOT NULL AND undersokelsesfrist < NOW()) AS undersokelser_over_frist`,
      [kommuneId],
    );

    return {
      kommunenummer: kommune.kommunenummer ?? "",
      kommune: kommune.navn,
      rapportdato,
      hendelserSisteDogn: {
        meldingerMottatt: hendelser.meldinger_mottatt,
        meldingerAvklart: hendelser.meldinger_avklart,
        meldingerHenlagt: hendelser.meldinger_henlagt,
        undersokelserStartet: hendelser.undersokelser_startet,
        undersokelserKonkludert: hendelser.undersokelser_konkludert,
        faseoverganger: Object.fromEntries(overganger.map((o: any) => [o.overgang, o.antall])),
      },
      bestand: {
        meldingerUnderAvklaring: bestand.meldinger_under_avklaring,
        sakerIUndersokelse: bestand.saker_i_undersokelse,
        sakerITiltak: bestand.saker_i_tiltak,
        aktiveGodkjentePlaner: bestand.aktive_godkjente_planer,
        meldingerOverFrist: bestand.meldinger_over_frist,
        undersokelserOverFrist: bestand.undersokelser_over_frist,
      },
    };
  });
}

/** Kvalitetssikring FØR innsending — Bufdirs modell er at data valideres
 * på vei inn; åpenbare avvik skal aldri sendes. */
export function validerDatasett(datasett: BvrDatasett): string[] {
  const feil: string[] = [];
  if (!/^\d{4}$/.test(datasett.kommunenummer)) {
    feil.push("Kommunenummer mangler eller er ikke fire siffer.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datasett.rapportdato)) {
    feil.push("Rapportdato er ikke YYYY-MM-DD.");
  }
  const alleTall = [
    ...Object.entries(datasett.hendelserSisteDogn).filter(([k]) => k !== "faseoverganger"),
    ...Object.entries(datasett.bestand),
  ];
  for (const [navn, verdi] of alleTall) {
    if (!Number.isInteger(verdi) || (verdi as number) < 0) {
      feil.push(`Feltet ${navn} er ikke et ikke-negativt heltall.`);
    }
  }
  if (datasett.hendelserSisteDogn.meldingerHenlagt > datasett.hendelserSisteDogn.meldingerAvklart) {
    feil.push("Henlagte meldinger overstiger avklarte i samme døgn.");
  }
  return feil;
}

/**
 * Kø dagens (eller angitt dags) innsending for en kommune. Idempotent per
 * (kommune, rapportdato): et ikke-sendt datasett oppdateres med ferskt
 * snapshot; et sendt datasett røres aldri.
 */
export async function queueBvrInnsending(
  kommuneId: number,
  rapportdato: string,
): Promise<{ queued: boolean; id?: string; status?: string; reason?: string }> {
  const datasett = await byggDagsdatasett(kommuneId, rapportdato);
  if (!datasett) return { queued: false, reason: "Kommune ikke funnet." };
  const valideringsfeil = validerDatasett(datasett);
  const innholdsHash = createHash("sha256").update(JSON.stringify(datasett)).digest("hex");
  const status = valideringsfeil.length ? "avvist" : "koet";

  const row = await withKommuneRlsContext(kommuneId, async (client) => {
    const { rows: [upserted] } = await client.query(
      `INSERT INTO tidum_barnevernsregister_innsendinger
         (kommune_id, rapportdato, datasett, innholds_hash, status, valideringsfeil)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (kommune_id, rapportdato) DO UPDATE SET
         datasett = EXCLUDED.datasett,
         innholds_hash = EXCLUDED.innholds_hash,
         status = EXCLUDED.status,
         valideringsfeil = EXCLUDED.valideringsfeil,
         forsok = 0,
         neste_forsok = NOW(),
         feil = NULL,
         updated_at = NOW()
       WHERE tidum_barnevernsregister_innsendinger.status <> 'sendt'
       RETURNING id, status`,
      [kommuneId, rapportdato, JSON.stringify(datasett), innholdsHash, status, valideringsfeil.length ? JSON.stringify(valideringsfeil) : null],
    );
    if (upserted) return upserted;
    const { rows: [eksisterende] } = await client.query(
      `SELECT id, status FROM tidum_barnevernsregister_innsendinger
        WHERE kommune_id = $1 AND rapportdato = $2`,
      [kommuneId, rapportdato],
    );
    return eksisterende;
  });
  return { queued: true, id: row.id, status: row.status };
}

/** Prosesser forfalte innsendinger — eksklusivt claim (koet→sender),
 * stale-gjenoppretting, backoff og lagret kvittering for avstemming. */
export async function processDueBvrInnsendinger(limit = 20): Promise<{ sendt: number; feilet: number }> {
  const transport = getBvrTransport();
  if (!transport) return { sendt: 0, feilet: 0 };

  const due = await withSystemRlsContext("bvr_outbox_scan", async (scoped) => {
    await scoped.query(
      `UPDATE tidum_barnevernsregister_innsendinger SET status = 'koet', updated_at = NOW()
        WHERE status = 'sender' AND updated_at < NOW() - ($1 || ' minutes')::interval`,
      [String(STALE_SENDER_MINUTTER)],
    );
    const { rows } = await scoped.query(
      `SELECT id, kommune_id, rapportdato, datasett, forsok
         FROM tidum_barnevernsregister_innsendinger
        WHERE status = 'koet' AND neste_forsok <= NOW()
        ORDER BY rapportdato ASC LIMIT $1`,
      [limit],
    );
    return rows;
  });

  let sendt = 0;
  let feilet = 0;
  for (const rad of due) {
    try {
      const claimed = await withKommuneRlsContext(rad.kommune_id, (scoped) => scoped.query(
        `UPDATE tidum_barnevernsregister_innsendinger
            SET status = 'sender', forsok = forsok + 1, updated_at = NOW()
          WHERE id = $1 AND status = 'koet' RETURNING forsok`,
        [rad.id],
      ));
      if (!claimed.rowCount) continue;
      const forsok: number = claimed.rows[0].forsok;

      let kvittering: Record<string, unknown> | null = null;
      let sendFeil: unknown = null;
      try {
        const rapportdato = rad.rapportdato instanceof Date
          ? rad.rapportdato.toISOString().slice(0, 10)
          : String(rad.rapportdato);
        const resultat = await transport.send({
          kommunenummer: rad.datasett.kommunenummer,
          rapportdato,
          datasett: rad.datasett,
        });
        kvittering = resultat.kvittering;
      } catch (err) {
        sendFeil = err;
      }

      if (kvittering) {
        await withKommuneRlsContext(rad.kommune_id, (scoped) => scoped.query(
          `UPDATE tidum_barnevernsregister_innsendinger
              SET status = 'sendt', kvittering = $1, sendt_dato = NOW(), feil = NULL, updated_at = NOW()
            WHERE id = $2 AND status = 'sender'`,
          [JSON.stringify(kvittering), rad.id],
        ));
        sendt += 1;
      } else {
        const terminal = forsok >= MAX_FORSOK;
        await withKommuneRlsContext(rad.kommune_id, (scoped) => scoped.query(
          `UPDATE tidum_barnevernsregister_innsendinger
              SET status = $1, feil = $2, neste_forsok = NOW() + ($3 || ' milliseconds')::interval, updated_at = NOW()
            WHERE id = $4 AND status = 'sender'`,
          [terminal ? "feilet" : "koet", String((sendFeil as any)?.message ?? sendFeil), String(nextAttemptDelayMs(forsok)), rad.id],
        ));
        feilet += 1;
      }
    } catch (radErr) {
      console.error(`[bvr] behandling av ${rad.id} feilet:`, radErr);
    }
  }
  return { sendt, feilet };
}

/** Kø gårsdagens datasett for alle kommuner med barnevernsdata. */
export async function queueDagligeBvrInnsendinger(): Promise<{ koet: number }> {
  const kommuner = await withSystemRlsContext("bvr_daily_scan", async (scoped) => {
    const { rows } = await scoped.query(
      `SELECT DISTINCT kommune_id FROM tidum_barnevern_meldinger`,
    );
    return rows;
  });
  const iGaar = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let koet = 0;
  for (const rad of kommuner) {
    try {
      const resultat = await queueBvrInnsending(rad.kommune_id, iGaar);
      if (resultat.queued) koet += 1;
    } catch (err) {
      console.error(`[bvr] køing for kommune ${rad.kommune_id} feilet:`, err);
    }
  }
  return { koet };
}
