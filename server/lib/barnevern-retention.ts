/**
 * server/lib/barnevern-retention.ts
 *
 * Dataminimering med definerte oppbevaringsperioder (krav 22/24) for
 * barnevernsvertikalens TEKNISKE sidedata — aldri selve saksdataene:
 * barnevernssaker, journal, meldinger, planer og vedtak er underlagt
 * lovpålagt langtidsoppbevaring (barnevernsloven/arkivlova) og slettes
 * kun via kommunens kassasjonsvedtak og arkivflyten — bevisst utenfor
 * denne modulen.
 *
 * Minimeres/slettes automatisk (døgn-cron, konfigurerbart via env):
 *  1. SMS-utboks: meldingsteksten (kan inneholde personinfo) erstattes
 *     med '[minimert]' på terminale rader eldre enn
 *     SMS_RETENTION_DAGER (default 90). Leveringsbevis (status,
 *     mottaker, tidspunkt) beholdes.
 *  2. FIKS-rålogg: kryptert råpayload nulles på PROSESSERTE rader eldre
 *     enn FIKS_RAALOGG_RETENTION_DAGER (default 90) — bekymringsmeldingen
 *     selv lever videre som strukturert melding. Uprosesserte rader
 *     røres aldri (fail-safe).
 *  3. Driftsalarmer: varslede rader slettes etter
 *     DRIFT_ALARM_RETENTION_DAGER (default 180).
 */
import cron from "node-cron";
import { withSystemRlsContext } from "./database-rls-context";

function dager(navn: string, fallback: number): number {
  const v = parseInt(process.env[navn] || "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export async function kjorBarnevernRetention(): Promise<{ sms: number; fiks: number; alarmer: number }> {
  const smsDager = dager("SMS_RETENTION_DAGER", 90);
  const fiksDager = dager("FIKS_RAALOGG_RETENTION_DAGER", 90);
  const alarmDager = dager("DRIFT_ALARM_RETENTION_DAGER", 180);

  return withSystemRlsContext("barnevern_retention", async (client) => {
    const sms = await client.query(
      `UPDATE tidum_sms_utboks
          SET melding = '[minimert]', updated_at = NOW()
        WHERE status IN ('sendt', 'feilet', 'blokkert')
          AND melding <> '[minimert]'
          AND created_at < NOW() - make_interval(days => $1)`,
      [smsDager],
    );
    const fiks = await client.query(
      `UPDATE tidum_fiks_raw_intake_log
          SET raw_payload_encrypted = '[minimert]'
        WHERE processed_at IS NOT NULL
          AND raw_payload_encrypted <> '[minimert]'
          AND received_at < NOW() - make_interval(days => $1)`,
      [fiksDager],
    );
    const alarmer = await client.query(
      `DELETE FROM tidum_drift_alarmer
        WHERE varslet = TRUE
          AND created_at < NOW() - make_interval(days => $1)`,
      [alarmDager],
    );
    const resultat = { sms: sms.rowCount ?? 0, fiks: fiks.rowCount ?? 0, alarmer: alarmer.rowCount ?? 0 };
    if (resultat.sms || resultat.fiks || resultat.alarmer) {
      console.log(`[barnevern-retention] minimert: ${resultat.sms} SMS, ${resultat.fiks} FIKS-rålogg; slettet ${resultat.alarmer} driftsalarmer`);
    }
    return resultat;
  });
}

let cronStarted = false;
export function setupBarnevernRetentionCron(): void {
  if (cronStarted) return;
  cronStarted = true;
  cron.schedule("17 3 * * *", async () => {
    try {
      await kjorBarnevernRetention();
    } catch (error) {
      console.error("[barnevern-retention] kjøring feilet", error instanceof Error ? error.message : error);
    }
  });
}
