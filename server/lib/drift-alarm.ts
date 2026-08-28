/**
 * server/lib/drift-alarm.ts
 *
 * Driftsalarm (krav 3/25): oppdager kø-oppføringer som har endt i
 * terminal feil — arkiv ('failed'), SMS ('feilet') og
 * Barnevernsregisteret ('feilet'/'avvist') — og varsler drift per
 * e-post (DRIFT_ALARM_EPOST). Dedup via tidum_drift_alarmer:
 * hver feilede oppføring gir nøyaktig én alarmrad, og alle uvarslede
 * rader samles i én e-post per kjøring. Uten konfigurert mottaker
 * logges alarmene høylytt og blir stående uvarslet til mottaker er
 * satt — første utsendelse tar da med hele etterslepet.
 */
import cron from "node-cron";
import { emailService } from "./email-service";
import { withSystemRlsContext } from "./database-rls-context";

const KILDE_NAVN: Record<string, string> = {
  arkiv: "Noark-arkivering",
  sms: "SMS-utboks",
  barnevernsregister: "Barnevernsregisteret",
};

// Én SELECT per kø: (kilde, entity_id, kommune_id, feil) for terminale rader.
const KILDER: { kilde: string; sql: string }[] = [
  {
    kilde: "arkiv",
    sql: `SELECT id::text AS entity_id, kommune_id, error AS feil
            FROM archive_entries WHERE status = 'failed'`,
  },
  {
    kilde: "sms",
    sql: `SELECT id::text AS entity_id, kommune_id, feil
            FROM tidum_sms_utboks WHERE status = 'feilet'`,
  },
  {
    kilde: "barnevernsregister",
    sql: `SELECT id::text AS entity_id, kommune_id,
                 COALESCE(feil, valideringsfeil::text) AS feil
            FROM tidum_barnevernsregister_innsendinger
           WHERE status IN ('feilet', 'avvist')`,
  },
];

export function driftAlarmMottaker(): string | null {
  return process.env.DRIFT_ALARM_EPOST?.trim() || null;
}

/**
 * Én kjøring: registrer nye terminale feil, send samle-epost for alle
 * uvarslede alarmer. Returnerer antall nye og antall varslede.
 */
export async function sjekkDriftAlarmer(): Promise<{ nye: number; varslede: number }> {
  // Fase 1 (transaksjon): registrer nye feil og hent uvarslede.
  const { nye, uvarslede } = await withSystemRlsContext("drift_alarm_sjekk", async (client) => {
    let antallNye = 0;
    for (const { kilde, sql } of KILDER) {
      const res = await client.query(
        `INSERT INTO tidum_drift_alarmer (kilde, entity_id, kommune_id, feil)
         SELECT $1, kandidat.entity_id, kandidat.kommune_id, kandidat.feil
           FROM (${sql}) kandidat
         ON CONFLICT (kilde, entity_id) DO NOTHING`,
        [kilde],
      );
      antallNye += res.rowCount ?? 0;
    }
    const { rows } = await client.query(
      `SELECT id, kilde, entity_id, kommune_id, feil, created_at
         FROM tidum_drift_alarmer WHERE varslet = FALSE
        ORDER BY created_at LIMIT 200`,
    );
    return { nye: antallNye, uvarslede: rows };
  });
  if (uvarslede.length === 0) return { nye, varslede: 0 };

  const mottaker = driftAlarmMottaker();
  if (!mottaker) {
    console.error(
      `[drift-alarm] ${uvarslede.length} uvarslet(e) køfeil (${nye} nye) — ` +
      `DRIFT_ALARM_EPOST er ikke satt, ingen e-post sendt. ` +
      uvarslede.slice(0, 5).map((a: any) => `${a.kilde}:${a.entity_id}`).join(", "),
    );
    return { nye, varslede: 0 };
  }

  // Fase 2 (utenfor transaksjon): send e-post, merk varslet ved suksess.
  {
    const rader = uvarslede.map((a: any) =>
      `<tr><td style="padding:4px 8px;">${KILDE_NAVN[a.kilde] ?? a.kilde}</td>` +
      `<td style="padding:4px 8px;font-family:monospace;">${a.entity_id}</td>` +
      `<td style="padding:4px 8px;">${a.kommune_id ?? "—"}</td>` +
      `<td style="padding:4px 8px;">${String(a.feil ?? "ukjent").slice(0, 300)}</td></tr>`,
    ).join("");
    const sendt = await emailService.sendEmail({
      purpose: "administrative",
      to: mottaker,
      subject: `Driftsalarm: ${uvarslede.length} køfeil krever oppfølging`,
      html:
        `<div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto;">` +
        `<h2 style="color:#0f172a;">Terminale køfeil</h2>` +
        `<p>Følgende oppføringer har stoppet permanent (etter backoff) og krever manuell oppfølging:</p>` +
        `<table style="border-collapse:collapse;font-size:13px;" border="1" cellspacing="0">` +
        `<tr><th style="padding:4px 8px;">Kø</th><th style="padding:4px 8px;">Id</th>` +
        `<th style="padding:4px 8px;">Kommune</th><th style="padding:4px 8px;">Feil</th></tr>` +
        rader +
        `</table></div>`,
    });
    if (!sendt) {
      console.error(`[drift-alarm] e-postutsendelse feilet for ${uvarslede.length} alarm(er) — prøver igjen neste kjøring.`);
      return { nye, varslede: 0 };
    }
    await withSystemRlsContext("drift_alarm_merk_varslet", (client) => client.query(
      `UPDATE tidum_drift_alarmer SET varslet = TRUE, varslet_at = NOW()
        WHERE id = ANY($1::uuid[])`,
      [uvarslede.map((a: any) => a.id)],
    ));
    return { nye, varslede: uvarslede.length };
  }
}

let cronStarted = false;
export function setupDriftAlarmCron(): void {
  if (cronStarted) return;
  cronStarted = true;
  cron.schedule("*/5 * * * *", async () => {
    try {
      await sjekkDriftAlarmer();
    } catch (error) {
      console.error("[drift-alarm] sjekk feilet", error instanceof Error ? error.message : error);
    }
  });
}
