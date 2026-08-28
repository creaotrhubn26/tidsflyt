/**
 * server/fiks-io/fiks-io-subscriber.ts
 *
 * Krav 1: ekte FIKS IO-mottak av bekymringsmeldinger over AMQP.
 * Tilkoblingsdetaljene er hentet fra KS' offisielle, åpne klientkode
 * (ks-no/fiks-io-client-dotnet):
 *   - host io.fiks.ks.no / io.fiks.test.ks.no, port 5671, TLS
 *   - username = integrasjons-id
 *   - password = "<integrasjonspassord> <maskinporten-token>" (mellomrom)
 *   - kø: fiksio.konto.<kontoId>, manuell ack
 *
 * Mottaket lagrer payloaden KRYPTERT som levert (CMS for kontoens
 * offentlige nøkkel), forseglet med secret-box, sammen med
 * konvoluttmetadata — og acker FØRST etter vellykket persist
 * (fail-closed: nack + requeue ved feil). Dekryptering og faglig
 * parsing skjer i prosesseringssteget (fiks-melding-prosessor.ts),
 * aldri i leveringsbanen.
 */
import amqplib, { type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { getMaskinportenToken } from "./maskinporten-client";
import { lagreInnkommendeFiksMelding } from "./fiks-melding-prosessor";

interface MottakKonfig {
  klientId: string;
  privateKeySealed: string;
  integrasjonId: string;
  integrasjonPassord: string;
  kontoId: string;
  kommuneId: number;
  host: string;
}

export function lesMottakKonfig(): MottakKonfig | null {
  const {
    FIKS_MASKINPORTEN_KLIENT_ID,
    FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED,
    FIKS_IO_INTEGRASJON_ID,
    FIKS_IO_INTEGRASJON_PASSORD,
    FIKS_IO_KONTO_ID,
    FIKS_MOTTAK_KOMMUNE_ID,
  } = process.env;
  if (
    !FIKS_MASKINPORTEN_KLIENT_ID || !FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED
    || !FIKS_IO_INTEGRASJON_ID || !FIKS_IO_INTEGRASJON_PASSORD
    || !FIKS_IO_KONTO_ID || !FIKS_MOTTAK_KOMMUNE_ID
  ) {
    return null;
  }
  const kommuneId = Number(FIKS_MOTTAK_KOMMUNE_ID);
  if (!Number.isInteger(kommuneId) || kommuneId <= 0) return null;
  return {
    klientId: FIKS_MASKINPORTEN_KLIENT_ID,
    privateKeySealed: FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED,
    integrasjonId: FIKS_IO_INTEGRASJON_ID,
    integrasjonPassord: FIKS_IO_INTEGRASJON_PASSORD,
    kontoId: FIKS_IO_KONTO_ID,
    kommuneId,
    host: process.env.FIKS_IO_AMQP_HOST
      || (process.env.NODE_ENV === "production" ? "io.fiks.ks.no" : "io.fiks.test.ks.no"),
  };
}

/** Konvoluttmetadata fra AMQP-headere (KS' headernavn). */
export function lesKonvolutt(msg: Pick<ConsumeMessage, "properties">): {
  fiksMeldingId: string | null;
  meldingType: string | null;
  avsenderKontoId: string | null;
  svarPaMeldingId: string | null;
} {
  const headers = msg.properties.headers ?? {};
  const hent = (navn: string): string | null => {
    const verdi = headers[navn];
    return verdi == null ? null : String(verdi);
  };
  return {
    fiksMeldingId: msg.properties.messageId ? String(msg.properties.messageId) : hent("melding-id"),
    meldingType: hent("type"),
    avsenderKontoId: hent("avsender-id"),
    svarPaMeldingId: hent("svar-til"),
  };
}

let tilkobling: ChannelModel | null = null;
let stopping = false;

async function kobleTil(konfig: MottakKonfig): Promise<void> {
  const token = await getMaskinportenToken({
    fiksKontoId: konfig.klientId,
    fiksPrivateKeyEncrypted: konfig.privateKeySealed,
    fiksCertificatePem: "",
  });

  const conn = await amqplib.connect({
    protocol: "amqps",
    hostname: konfig.host,
    port: 5671,
    username: konfig.integrasjonId,
    // KS' MaskinportenCredentialsProvider: "<integrasjonspassord> <token>".
    password: `${konfig.integrasjonPassord} ${token}`,
    heartbeat: 30,
  });
  tilkobling = conn;

  const kanal: Channel = await conn.createChannel();
  await kanal.prefetch(10);

  const ko = `fiksio.konto.${konfig.kontoId}`;
  await kanal.consume(ko, async (msg) => {
    if (!msg) return;
    try {
      const konvolutt = lesKonvolutt(msg);
      await lagreInnkommendeFiksMelding(konfig.kommuneId, konvolutt, msg.content);
      kanal.ack(msg);
    } catch (err) {
      console.error("[fiks-io] mottak feilet — nack med requeue:", (err as any)?.message ?? err);
      // Fail-closed: meldingen forblir i køen; idempotensnøkkelen
      // (fiks_melding_id) hindrer duplikat ved omlevering.
      kanal.nack(msg, false, true);
    }
  }, { noAck: false });

  conn.on("close", () => {
    tilkobling = null;
    if (stopping) return;
    // Reconnect med fersk Maskinporten-token (utløper etter ~2 min).
    console.warn("[fiks-io] AMQP-tilkobling lukket — kobler til på nytt om 15 s.");
    setTimeout(() => startFiksIoSubscriber().catch((err) =>
      console.error("[fiks-io] reconnect feilet:", err?.message ?? err),
    ), 15_000);
  });
  conn.on("error", (err) => {
    console.error("[fiks-io] AMQP-feil:", err?.message ?? err);
  });

  console.log(`[fiks-io] abonnerer på ${ko} via ${konfig.host}`);
}

/** Starter abonnenten dersom full konfigurasjon finnes — ellers inert. */
export async function startFiksIoSubscriber(): Promise<boolean> {
  const konfig = lesMottakKonfig();
  if (!konfig) return false;
  if (tilkobling) return true;
  await kobleTil(konfig);
  return true;
}

export async function stopFiksIoSubscriber(): Promise<void> {
  stopping = true;
  await tilkobling?.close().catch(() => {});
  tilkobling = null;
}
