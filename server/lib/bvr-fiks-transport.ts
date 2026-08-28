/**
 * server/lib/bvr-fiks-transport.ts
 *
 * FIKS Protokoll-transport for Barnevernsregisteret (krav 10/28).
 * Bufdirs modell (bufdir.no/barnevernsregisteret): fagsystemet kobles til
 * registeret via KS FIKS Protokoll — Maskinporten-autentisert (ks:fiks),
 * integrasjons-id/-passord mot FIKS IO, og payload kryptert for
 * mottakerkontoens offentlige nøkkel.
 *
 * Konfigurasjon (leverandørens FIKS-oppsett, avtales i KS-portalen):
 *   FIKS_MASKINPORTEN_KLIENT_ID        — Maskinporten-integrasjonens klient-id
 *   FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED — privatnøkkel forseglet med secret-box
 *   FIKS_IO_KONTO_ID                   — avsenderkonto (Tidum/kommunen)
 *   FIKS_IO_INTEGRASJON_ID / _PASSORD  — FIKS IO-integrasjonen
 *   BVR_FIKS_MOTTAKER_KONTO_ID         — Barnevernsregisterets FIKS-konto
 *   BVR_FIKS_MELDINGSTYPE              — avtalt protokoll-/meldingstype
 *   FIKS_IO_HOST                       — default api.fiks.test.ks.no utenfor prod
 *
 * Payload-krypteringen er hybrid (AES-256-GCM + RSA-OAEP/SHA-256 mot
 * mottakers offentlige nøkkel). Eksakt konvoluttformat bekreftes i KS'
 * sandkassetest før produksjonsaktivering — strukturen her er isolert i
 * krypterFiksPayload slik at en formatjustering ikke rører resten.
 */
import { createCipheriv, publicEncrypt, randomBytes, constants as cryptoConstants } from "crypto";
import { getMaskinportenToken } from "../fiks-io/maskinporten-client";
import type { BvrTransport } from "./barnevernsregister";

interface FiksKonfig {
  klientId: string;
  privateKeySealed: string;
  kontoId: string;
  integrasjonId: string;
  integrasjonPassord: string;
  mottakerKontoId: string;
  meldingstype: string;
  host: string;
}

export function lesFiksKonfig(): FiksKonfig | null {
  const {
    FIKS_MASKINPORTEN_KLIENT_ID,
    FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED,
    FIKS_IO_KONTO_ID,
    FIKS_IO_INTEGRASJON_ID,
    FIKS_IO_INTEGRASJON_PASSORD,
    BVR_FIKS_MOTTAKER_KONTO_ID,
  } = process.env;
  if (
    !FIKS_MASKINPORTEN_KLIENT_ID || !FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED
    || !FIKS_IO_KONTO_ID || !FIKS_IO_INTEGRASJON_ID || !FIKS_IO_INTEGRASJON_PASSORD
    || !BVR_FIKS_MOTTAKER_KONTO_ID
  ) {
    return null;
  }
  return {
    klientId: FIKS_MASKINPORTEN_KLIENT_ID,
    privateKeySealed: FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED,
    kontoId: FIKS_IO_KONTO_ID,
    integrasjonId: FIKS_IO_INTEGRASJON_ID,
    integrasjonPassord: FIKS_IO_INTEGRASJON_PASSORD,
    mottakerKontoId: BVR_FIKS_MOTTAKER_KONTO_ID,
    meldingstype: process.env.BVR_FIKS_MELDINGSTYPE || "no.bufdir.barnevernsregister.innrapportering.v1",
    host: process.env.FIKS_IO_HOST
      || (process.env.NODE_ENV === "production" ? "https://api.fiks.ks.no" : "https://api.fiks.test.ks.no"),
  };
}

/**
 * Hybridkryptering av payload for mottakerkontoens offentlige nøkkel:
 * tilfeldig AES-256-GCM-datanøkkel krypterer innholdet; datanøkkelen
 * krypteres med RSA-OAEP(SHA-256). Konvolutt: [2 byte lengde på kryptert
 * nøkkel][kryptert nøkkel][12 byte IV][16 byte auth-tag][chiffertekst].
 */
export function krypterFiksPayload(payload: Buffer, mottakerPublicKeyPem: string): Buffer {
  const datanokkel = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", datanokkel, iv);
  const chiffer = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const kryptertNokkel = publicEncrypt(
    {
      key: mottakerPublicKeyPem,
      padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    datanokkel,
  );
  const lengde = Buffer.alloc(2);
  lengde.writeUInt16BE(kryptertNokkel.length);
  return Buffer.concat([lengde, kryptertNokkel, iv, authTag, chiffer]);
}

async function hentMottakerNokkel(konfig: FiksKonfig, token: string): Promise<string> {
  const res = await fetch(
    `${konfig.host}/fiks-io/api/v1/kontoer/${konfig.mottakerKontoId}/offentligNokkel`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        IntegrasjonId: konfig.integrasjonId,
        IntegrasjonPassord: konfig.integrasjonPassord,
      },
    },
  );
  if (!res.ok) throw new Error(`FIKS IO nøkkeloppslag feilet (${res.status})`);
  const body = await res.json() as { nokkel?: string };
  if (!body.nokkel) throw new Error("FIKS IO returnerte ingen offentlig nøkkel.");
  return body.nokkel;
}

/** FIKS Protokoll-implementasjon av BvrTransport. */
export function getFiksProtokollTransport(): BvrTransport | null {
  const konfig = lesFiksKonfig();
  if (!konfig) return null;

  return {
    async send(input) {
      const token = await getMaskinportenToken({
        fiksKontoId: konfig.klientId,
        fiksPrivateKeyEncrypted: konfig.privateKeySealed,
        fiksCertificatePem: "",
      });
      const mottakerNokkel = await hentMottakerNokkel(konfig, token);

      const payload = Buffer.from(JSON.stringify(input.datasett), "utf-8");
      const kryptert = krypterFiksPayload(payload, mottakerNokkel);

      const metadata = {
        avsenderKontoId: konfig.kontoId,
        mottakerKontoId: konfig.mottakerKontoId,
        meldingType: konfig.meldingstype,
        ttl: 48 * 3600 * 1000,
        headere: {
          kommunenummer: input.kommunenummer,
          rapportdato: input.rapportdato,
        },
      };

      const form = new FormData();
      form.append("metadata", JSON.stringify(metadata));
      form.append("data", new Blob([new Uint8Array(kryptert)]), "datasett.enc");

      const res = await fetch(
        `${konfig.host}/fiks-io/api/v1/kontoer/${konfig.kontoId}/meldinger`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            IntegrasjonId: konfig.integrasjonId,
            IntegrasjonPassord: konfig.integrasjonPassord,
          },
          body: form,
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`FIKS IO-sending feilet (${res.status}): ${detail.slice(0, 200)}`);
      }
      const kvittering = await res.json().catch(() => ({})) as Record<string, unknown>;
      return { kvittering: { transport: "fiks_protokoll", ...kvittering } };
    },
  };
}
