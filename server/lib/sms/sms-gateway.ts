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

export interface SmsGateway {
  send(input: { telefon: string; melding: string }): Promise<{ gatewayMeldingId: string }>;
}

const MAX_FORSOK = 8;

/** Eksponentiell backoff: 5 min · 2^forsøk, tak 24 t. */
export function smsNesteForsokDelayMs(forsok: number): number {
  return Math.min(5 * 60_000 * 2 ** forsok, 24 * 3_600_000);
}

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
 * Prosesser forfalte utbokrader. Claim per rad (status-betinget UPDATE)
 * gjør kjøringen trygg mot parallelle instanser. Uten konfigurert
 * gateway gjøres ingenting — meldingene blir stående i kø.
 */
export async function processDueSms(limit = 20): Promise<{ sendt: number; feilet: number }> {
  const gateway = getSmsGateway();
  if (!gateway) return { sendt: 0, feilet: 0 };

  const due = await withSystemRlsContext("sms_outbox_scan", async (scoped) => {
    const { rows } = await scoped.query(
      `SELECT id, kommune_id, mottaker_telefon, melding, forsok
         FROM tidum_sms_utboks
        WHERE status = 'koet' AND neste_forsok <= NOW()
        ORDER BY created_at ASC LIMIT $1`,
      [limit],
    );
    return rows;
  });

  let sendt = 0;
  let feilet = 0;
  for (const rad of due) {
    try {
      const claimed = await withKommuneRlsContext(rad.kommune_id, (scoped) => scoped.query(
        `UPDATE tidum_sms_utboks SET forsok = forsok + 1, updated_at = NOW()
          WHERE id = $1 AND status = 'koet' RETURNING id`,
        [rad.id],
      ));
      if (!claimed.rowCount) continue;

      try {
        const resultat = await gateway.send({ telefon: rad.mottaker_telefon, melding: rad.melding });
        await withKommuneRlsContext(rad.kommune_id, (scoped) => scoped.query(
          `UPDATE tidum_sms_utboks
              SET status = 'sendt', gateway_melding_id = $1, sendt_dato = NOW(), feil = NULL, updated_at = NOW()
            WHERE id = $2`,
          [resultat.gatewayMeldingId, rad.id],
        ));
        sendt += 1;
      } catch (sendErr: any) {
        const forsok = rad.forsok + 1;
        const terminal = forsok >= MAX_FORSOK;
        await withKommuneRlsContext(rad.kommune_id, (scoped) => scoped.query(
          `UPDATE tidum_sms_utboks
              SET status = $1, feil = $2, neste_forsok = NOW() + ($3 || ' milliseconds')::interval, updated_at = NOW()
            WHERE id = $4`,
          [
            terminal ? "feilet" : "koet",
            String(sendErr?.message ?? sendErr),
            String(smsNesteForsokDelayMs(forsok)),
            rad.id,
          ],
        ));
        feilet += 1;
      }
    } catch (radErr) {
      console.error(`[sms] behandling av ${rad.id} feilet:`, radErr);
    }
  }
  return { sendt, feilet };
}
