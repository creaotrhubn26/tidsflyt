import { describe, it, expect, afterEach, vi } from "vitest";
import {
  createDecipheriv, generateKeyPairSync, privateDecrypt, constants as cryptoConstants,
} from "crypto";
import { krypterFiksPayload, lesFiksKonfig, getFiksProtokollTransport } from "../bvr-fiks-transport";

vi.mock("../../fiks-io/maskinporten-client", () => ({
  getMaskinportenToken: vi.fn().mockResolvedValue("maskinporten-test-token"),
}));

const FIKS_ENV = {
  FIKS_MASKINPORTEN_KLIENT_ID: "klient-123",
  FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED: "sealed-key",
  FIKS_IO_KONTO_ID: "konto-avsender",
  FIKS_IO_INTEGRASJON_ID: "integrasjon-1",
  FIKS_IO_INTEGRASJON_PASSORD: "hemmelig",
  BVR_FIKS_MOTTAKER_KONTO_ID: "konto-bufdir",
};

function settFiksEnv() {
  for (const [k, v] of Object.entries(FIKS_ENV)) process.env[k] = v;
}

function fjernFiksEnv() {
  for (const k of Object.keys(FIKS_ENV)) delete process.env[k];
  delete process.env.BVR_FIKS_MELDINGSTYPE;
}

describe("FIKS Protokoll-transport for Barnevernsregisteret", () => {
  afterEach(() => {
    fjernFiksEnv();
    vi.unstubAllGlobals();
  });

  it("hybridkrypteringen kan dekrypteres av mottakers privatnøkkel (roundtrip)", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicPem = publicKey.export({ type: "spki", format: "pem" }) as string;
    const payload = Buffer.from(JSON.stringify({ kommunenummer: "3001", tall: 42 }), "utf-8");

    const konvolutt = krypterFiksPayload(payload, publicPem);

    // Pakk opp konvolutten: [2B nøkkellengde][kryptert nøkkel][12B IV][16B tag][chiffer]
    const nokkelLengde = konvolutt.readUInt16BE(0);
    let offset = 2;
    const kryptertNokkel = konvolutt.subarray(offset, offset + nokkelLengde); offset += nokkelLengde;
    const iv = konvolutt.subarray(offset, offset + 12); offset += 12;
    const tag = konvolutt.subarray(offset, offset + 16); offset += 16;
    const chiffer = konvolutt.subarray(offset);

    const datanokkel = privateDecrypt(
      { key: privateKey, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      kryptertNokkel,
    );
    const decipher = createDecipheriv("aes-256-gcm", datanokkel, iv);
    decipher.setAuthTag(tag);
    const klartekst = Buffer.concat([decipher.update(chiffer), decipher.final()]);
    expect(JSON.parse(klartekst.toString("utf-8"))).toEqual({ kommunenummer: "3001", tall: 42 });

    // Samme payload gir ulik konvolutt (fersk datanøkkel/IV hver gang).
    expect(krypterFiksPayload(payload, publicPem).equals(konvolutt)).toBe(false);
  });

  it("konfigresolusjon: null uten fullt oppsett, defaults når alt er satt", () => {
    expect(lesFiksKonfig()).toBeNull();
    expect(getFiksProtokollTransport()).toBeNull();

    settFiksEnv();
    const konfig = lesFiksKonfig();
    expect(konfig).not.toBeNull();
    expect(konfig!.meldingstype).toBe("no.bufdir.barnevernsregister.innrapportering.v1");
    expect(konfig!.host).toBe("https://api.fiks.test.ks.no"); // ikke produksjon i test

    // Mangler én variabel → null igjen (fail-closed).
    delete process.env.BVR_FIKS_MOTTAKER_KONTO_ID;
    expect(lesFiksKonfig()).toBeNull();
  });

  it("send: Maskinporten-token, nøkkeloppslag, kryptert payload og integrasjonsheadere", async () => {
    settFiksEnv();
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicPem = publicKey.export({ type: "spki", format: "pem" }) as string;

    const kall: { url: string; init: any }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
      kall.push({ url: String(url), init });
      if (String(url).includes("offentligNokkel")) {
        return new Response(JSON.stringify({ nokkel: publicPem }), { status: 200 });
      }
      return new Response(JSON.stringify({ meldingId: "fiks-melding-1" }), { status: 200 });
    }));

    const transport = getFiksProtokollTransport();
    expect(transport).not.toBeNull();
    const resultat = await transport!.send({
      kommunenummer: "3001",
      rapportdato: "2026-08-27",
      datasett: { bestand: { sakerIUndersokelse: 1 } },
    });

    expect(resultat.kvittering.transport).toBe("fiks_protokoll");
    expect(resultat.kvittering.meldingId).toBe("fiks-melding-1");

    expect(kall).toHaveLength(2);
    expect(kall[0].url).toBe("https://api.fiks.test.ks.no/fiks-io/api/v1/kontoer/konto-bufdir/offentligNokkel");
    expect(kall[1].url).toBe("https://api.fiks.test.ks.no/fiks-io/api/v1/kontoer/konto-avsender/meldinger");
    for (const k of kall) {
      expect(k.init.headers.Authorization).toBe("Bearer maskinporten-test-token");
      expect(k.init.headers.IntegrasjonId).toBe("integrasjon-1");
      expect(k.init.headers.IntegrasjonPassord).toBe("hemmelig");
    }

    const form: FormData = kall[1].init.body;
    const metadata = JSON.parse(form.get("metadata") as string);
    expect(metadata.mottakerKontoId).toBe("konto-bufdir");
    expect(metadata.meldingType).toBe("no.bufdir.barnevernsregister.innrapportering.v1");
    expect(metadata.headere.kommunenummer).toBe("3001");
    // Payload er kryptert — klarteksten skal ikke finnes i forsendelsen.
    const blob = form.get("data") as Blob;
    const raa = Buffer.from(await blob.arrayBuffer());
    expect(raa.includes(Buffer.from("sakerIUndersokelse"))).toBe(false);
  });

  it("feil fra FIKS IO propagerer som kastet feil (backoff i køen)", async () => {
    settFiksEnv();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nede", { status: 503 })));

    const transport = getFiksProtokollTransport();
    await expect(transport!.send({
      kommunenummer: "3001", rapportdato: "2026-08-27", datasett: {},
    })).rejects.toThrow(/503/);
  });
});
