/**
 * server/lib/sms/sms-gateway.ts
 *
 * Krav 9: leverandørnøytralt SMS-gatewaygrensesnitt med tenant-bundet
 * utboks. Kundens gateway (Halden) plugges inn som adapter; uten
 * konfigurert gateway blir meldinger stående trygt i kø ('koet') —
 * aldri falsk «sendt».
 *
 * Konfigurasjon (generisk REST-adapter):
 *   SMS_GATEWAY_URL   — POST-endepunkt hos kundens gateway
 *   SMS_GATEWAY_TOKEN — Bearer-token
 * Payload: {"to": "<telefon>", "message": "<tekst>"} — feltnavn kan
 * overstyres med SMS_GATEWAY_TO_FIELD / SMS_GATEWAY_MESSAGE_FIELD.
 */
import type { PoolClient } from "pg";
import { withKommuneRlsContext, withSystemRlsContext } from "../database-rls-context";
// Samme backoff-policy som arkiv-outboxen (5 min · 2^n, tak 24 t) —
// gjenbrukt, ikke duplisert, så tuning treffer begge køene.
import { nextAttemptDelayMs } from "../archive/noark";

export interface SmsGateway {
  send(input: { telefon: string; melding: string }): Promise<{ gatewayMeldingId: string }>;
}

const MAX_FORSOK = 8;
// En enkelt SMS-kjede topper rundt 1600 tegn (10 sammenkjedede segmenter).
export const MAX_MELDING_LENGDE = 1600;
// In-flight-rader eldre enn dette antas å stamme fra en krasjet prosess og
// gjenopprettes til kø. At-least-once: en krasj ETTER vellykket gateway-send
// men FØR finalize kan gi dobbel utsendelse — akseptert fremfor tap.
const STALE_SENDER_MINUTTER = 10;

class HttpSmsGateway implements SmsGateway {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly toField: string,
    private readonly messageField: string,
  ) {}

  async send(input: { telefon: string; melding: string }): Promise<{ gatewayMeldingId: string }> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ [this.toField]: input.telefon, [this.messageField]: input.melding }),
    });
    if (!response.ok) {
      throw new Error(`SMS-gateway svarte ${response.status}`);
    }
    const body = await response.json().catch(() => ({})) as any;
    return { gatewayMeldingId: String(body.id ?? body.messageId ?? `http-${Date.now()}`) };
  }
}

let testGateway: SmsGateway | null = null;

/** Kun for tester — injiser en fake gateway. */
export function setSmsGatewayForTesting(gateway: SmsGateway | null): void {
  testGateway = gateway;
}

export function getSmsGateway(): SmsGateway | null {
  if (testGateway) return testGateway;
  const url = process.env.SMS_GATEWAY_URL;
  const token = process.env.SMS_GATEWAY_TOKEN;
  if (!url || !token) return null;
  return new HttpSmsGateway(
    url,
    token,
    process.env.SMS_GATEWAY_TO_FIELD || "to",
    process.env.SMS_GATEWAY_MESSAGE_FIELD || "message",
  );
}

/** Norsk mobil (8 siffer, ev. +47/0047-prefiks) eller internasjonalt +-nummer. */
export function normaliserTelefon(telefon: string): string | null {
  const stripped = telefon.replace(/[\s.-]/g, "");
  if (/^(\+47|0047)?[49]\d{7}$/.test(stripped)) {
    return `+47${stripped.slice(-8)}`;
  }
  // Norske numre som ikke er mobil (fasttelefon o.l.) skal ikke slippe
  // gjennom via landkode-prefiks til den generiske internasjonale grenen.
  if (/^(\+47|0047)/.test(stripped)) return null;
  if (/^\+\d{8,15}$/.test(stripped)) return stripped;
  return null;
}

/**
 * Legg en melding i utboksen. Kalles innenfor eksisterende
 * kommune-RLS-transaksjon når `client` gis; ellers åpnes egen kontekst.
 */
export async function queueSms(
  input: {
    kommuneId: number;
    telefon: string;
    melding: string;
    formaal: string;
    opprettetAv: string;
  },
  client?: Pick<PoolClient, "query">,
): Promise<{ queued: boolean; id?: string; reason?: string }> {
  const telefon = normaliserTelefon(input.telefon);
  if (!telefon) return { queued: false, reason: "Ugyldig telefonnummer." };
  if (!input.melding || input.melding.trim().length === 0) {
    return { queued: false, reason: "Tom melding." };
  }
  if (input.melding.length > MAX_MELDING_LENGDE) {
    return { queued: false, reason: `Meldingen er for lang (maks ${MAX_MELDING_LENGDE} tegn).` };
  }

  const insert = async (scoped: Pick<PoolClient, "query">) => {
    const { rows: [row] } = await scoped.query(
      `INSERT INTO tidum_sms_utboks (kommune_id, mottaker_telefon, melding, formaal, opprettet_av)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.kommuneId, telefon, input.melding, input.formaal, input.opprettetAv],
    );
    return row.id as string;
  };
  const id = client
    ? await insert(client)
    : await withKommuneRlsContext(input.kommuneId, insert);
  return { queued: true, id };
}

/**
 * Prosesser forfalte utbokrader. Claimet er EKSKLUSIVT: raden flippes
 * koet→sender i én betinget UPDATE, så parallelle kjøringer (cron,
 * umiddelbart forsøk fra ruta, flere instanser) aldri sender samme
 * melding to ganger. Reservasjon håndheves fail-closed: reserverte rader
 * blokkeres og når aldri gatewayen. Uten konfigurert gateway gjøres
 * ingenting — meldingene blir stående i kø.
 */
export async function processDueSms(limit = 20): Promise<{ sendt: number; feilet: number; blokkert: number }> {
  const gateway = getSmsGateway();
  if (!gateway) return { sendt: 0, feilet: 0, blokkert: 0 };

  const { due, blokkert } = await withSystemRlsContext("sms_outbox_scan", async (scoped) => {
    // Krasjede prosesser etterlater 'sender'-rader; gjenopprett til kø.
    await scoped.query(
      `UPDATE tidum_sms_utboks SET status = 'koet', updated_at = NOW()
        WHERE status = 'sender' AND updated_at < NOW() - ($1 || ' minutes')::interval`,
      [String(STALE_SENDER_MINUTTER)],
    );
    // Fail-closed reservasjonsgate (KRR-oppslaget selv er ekstern rest).
    const blokkertRes = await scoped.query(
      `UPDATE tidum_sms_utboks SET status = 'blokkert', feil = 'Mottaker er reservert.', updated_at = NOW()
        WHERE status = 'koet' AND reservasjon_status = 'reservert' RETURNING id`,
    );
    const { rows } = await scoped.query(
      `SELECT id, kommune_id, mottaker_telefon, melding, forsok
         FROM tidum_sms_utboks
        WHERE status = 'koet' AND neste_forsok <= NOW()
          AND reservasjon_status <> 'reservert'
        ORDER BY created_at ASC LIMIT $1`,
      [limit],
    );
    return { due: rows, blokkert: blokkertRes.rowCount ?? 0 };
  });

  let sendt = 0;
  let feilet = 0;
  for (const rad of due) {
    try {
      // Eksklusivt claim: koet → sender.
      const claimed = await withKommuneRlsContext(rad.kommune_id, (scoped) => scoped.query(
        `UPDATE tidum_sms_utboks SET status = 'sender', forsok = forsok + 1, updated_at = NOW()
          WHERE id = $1 AND status = 'koet' RETURNING forsok`,
        [rad.id],
      ));
      if (!claimed.rowCount) continue;
      const forsok: number = claimed.rows[0].forsok;

      let resultat: { gatewayMeldingId: string } | null = null;
      let sendFeil: unknown = null;
      try {
        resultat = await gateway.send({ telefon: rad.mottaker_telefon, melding: rad.melding });
      } catch (err) {
        sendFeil = err;
      }

      // Finalize UTENFOR send-forsøket: en DB-feil her skal ikke tolkes som
      // gatewayfeil og re-køe en allerede levert melding — raden blir
      // stående 'sender' og fanges av stale-gjenoppretting (at-least-once).
      if (resultat) {
        await withKommuneRlsContext(rad.kommune_id, (scoped) => scoped.query(
          `UPDATE tidum_sms_utboks
              SET status = 'sendt', gateway_melding_id = $1, sendt_dato = NOW(), feil = NULL, updated_at = NOW()
            WHERE id = $2 AND status = 'sender'`,
          [resultat.gatewayMeldingId, rad.id],
        ));
        sendt += 1;
      } else {
        const terminal = forsok >= MAX_FORSOK;
        await withKommuneRlsContext(rad.kommune_id, (scoped) => scoped.query(
          `UPDATE tidum_sms_utboks
              SET status = $1, feil = $2, neste_forsok = NOW() + ($3 || ' milliseconds')::interval, updated_at = NOW()
            WHERE id = $4 AND status = 'sender'`,
          [
            terminal ? "feilet" : "koet",
            String((sendFeil as any)?.message ?? sendFeil),
            String(nextAttemptDelayMs(forsok)),
            rad.id,
          ],
        ));
        feilet += 1;
      }
    } catch (radErr) {
      console.error(`[sms] behandling av ${rad.id} feilet:`, radErr);
    }
  }
  return { sendt, feilet, blokkert };
}
