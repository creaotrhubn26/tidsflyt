import type { Express, Request, Response } from "express";
import { requireSuperAdmin } from "../custom-auth";
import { isSecretBoxConfigured } from "../lib/secret-box";
import { lesFeltmapping } from "../fiks-io/fiks-melding-prosessor";

/**
 * Konfigurasjonsstatus for barnevern-integrasjonene (krav 1/9/10/28).
 * Viser per integrasjon hva som er satt og hvilke variabler som mangler —
 * ALDRI selve verdiene. Formål: lim inn endepunkter/nøkler fra
 * KS/Digdir/Bufdir/gateway-leverandøren i miljøet og verifiser her at de
 * plukkes opp; de fail-closed adapterne aktiverer seg selv når alt er på
 * plass.
 */

interface VarStatus {
  navn: string;
  satt: boolean;
  valgfri?: boolean;
  merknad?: string;
}

function sjekk(navn: string, opts: { valgfri?: boolean; merknad?: string } = {}): VarStatus {
  return { navn, satt: Boolean(process.env[navn]?.trim()), ...opts };
}

function oppsummer(vars: VarStatus[]): { klar: boolean; mangler: string[] } {
  const mangler = vars.filter((v) => !v.satt && !v.valgfri).map((v) => v.navn);
  return { klar: mangler.length === 0, mangler };
}

export function registerIntegrasjonStatusRoutes(app: Express): void {
  app.get("/api/admin/integrasjoner/status", requireSuperAdmin, async (_req: Request, res: Response) => {
    const maskinporten = [
      sjekk("FIKS_MASKINPORTEN_KLIENT_ID", { merknad: "Digdir selvbetjening, scope ks:fiks" }),
      sjekk("FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED", { merknad: "PEM forseglet med scripts/seal-secret.ts" }),
    ];
    const fiksIo = [
      sjekk("FIKS_IO_KONTO_ID", { merknad: "Kommunens Fiks IO-konto (forvaltning.fiks.ks.no)" }),
      sjekk("FIKS_IO_INTEGRASJON_ID"),
      sjekk("FIKS_IO_INTEGRASJON_PASSORD"),
      sjekk("FIKS_IO_HOST", { valgfri: true, merknad: "Default: api.fiks.test.ks.no utenfor produksjon" }),
      sjekk("FIKS_IO_AMQP_HOST", { valgfri: true, merknad: "Default: io.fiks.test.ks.no utenfor produksjon" }),
    ];
    const barnevernsregister = [
      sjekk("BVR_FIKS_MOTTAKER_KONTO_ID", { merknad: "Barnevernsregisterets FIKS-konto (fra Bufdir)" }),
      sjekk("BVR_FIKS_MELDINGSTYPE", { valgfri: true, merknad: "Default: no.bufdir.barnevernsregister.innrapportering.v1" }),
      sjekk("BVR_API_URL", { valgfri: true, merknad: "Fallback-REST for sandkasse uten FIKS" }),
      sjekk("BVR_API_TOKEN", { valgfri: true }),
    ];
    const fiksMottak = [
      sjekk("FIKS_MOTTAK_KOMMUNE_ID", { merknad: "Tidum-kommune-id for innkommende meldinger" }),
      sjekk("FIKS_KONTO_PRIVATE_KEY_SEALED", { merknad: "Kontonøkkel for CMS-dekryptering, forseglet" }),
      sjekk("FIKS_MOTTAK_MELDINGSTYPE", { merknad: "Avtalt DigiBarnevern-meldingstype" }),
      {
        navn: "FIKS_MOTTAK_FELTMAPPING",
        satt: lesFeltmapping() !== null,
        merknad: process.env.FIKS_MOTTAK_FELTMAPPING && lesFeltmapping() === null
          ? "SATT MEN UGYLDIG — må være JSON med minst {beskrivelse}"
          : "JSON-feltmapping fra DigiBarnevern-skjemaet",
      },
      sjekk("FIKS_IO_ENABLED", { merknad: "Sett til 'true' for å starte AMQP-abonnenten" }),
    ];
    const sms = [
      sjekk("SMS_GATEWAY_URL", { merknad: "Kundens gateway-endepunkt (POST)" }),
      sjekk("SMS_GATEWAY_TOKEN"),
      sjekk("SMS_GATEWAY_TO_FIELD", { valgfri: true, merknad: "Default: to" }),
      sjekk("SMS_GATEWAY_MESSAGE_FIELD", { valgfri: true, merknad: "Default: message" }),
    ];
    const driftsalarm = [
      sjekk("DRIFT_ALARM_EPOST", { merknad: "Mottaker for samle-epost ved terminale køfeil (arkiv/SMS/BVR)" }),
    ];
    const vedleggslager = [
      sjekk("BARNEVERN_S3_BUCKET", { merknad: "S3-bøtte i norsk/EU-region for barnevernsvedlegg" }),
      sjekk("BARNEVERN_S3_REGION", { valgfri: true, merknad: "Default: eu-central-1" }),
    ];
    const grunnmur = [
      { navn: "TIDUM_SECRET_KEY(RING)", satt: isSecretBoxConfigured(), merknad: "Kreves for all forsegling og FIKS-mottak" },
    ];

    // FIKS-sending trenger både Maskinporten, FIKS IO og mottakerkonto.
    const fiksSending = [...maskinporten, ...fiksIo.slice(0, 3), barnevernsregister[0]];

    res.setHeader("Cache-Control", "no-store");
    res.json({
      grunnmur: { vars: grunnmur, ...oppsummer(grunnmur) },
      maskinporten: { vars: maskinporten, ...oppsummer(maskinporten) },
      fiksIo: { vars: fiksIo, ...oppsummer(fiksIo) },
      barnevernsregisterSending: {
        vars: barnevernsregister,
        ...oppsummer(fiksSending),
        merknad: "Aktiveres automatisk når Maskinporten + FIKS IO + mottakerkonto er satt; ellers blir innsendinger stående i kø.",
      },
      fiksMottakBekymringsmelding: {
        vars: fiksMottak,
        ...oppsummer([...maskinporten, ...fiksIo.slice(0, 3), ...fiksMottak.filter((v) => !v.valgfri)]),
        merknad: "AMQP-abonnenten starter når alt er satt og FIKS_IO_ENABLED=true; prosessering til melding krever i tillegg meldingstype + feltmapping.",
      },
      smsGateway: {
        vars: sms,
        ...oppsummer(sms),
        merknad: "Uten oppsett blir SMS stående trygt i kø.",
      },
      vedleggslager: {
        vars: vedleggslager,
        ...oppsummer(vedleggslager),
        merknad: "Uten bøtte lagres vedlegg på flyktig lokal disk (kun dev/test).",
      },
      driftsalarm: {
        vars: driftsalarm,
        ...oppsummer(driftsalarm),
        merknad: "Uten mottaker logges alarmene kun; e-post tar med etterslepet når mottaker settes.",
      },
    });
  });
}
