# Halden 2026-112379 — oppstartsplan for anbudet

Status 28.08.2026. Alle 13 byggbare krav er implementert og merget til
main (PR #22–#39): saksflyt, meldingsmottak, journal, planer, dokumenter,
innsyn, saksuttrekk, forebyggende, KPI-katalog, SMS-kø, BVR-innrapportering,
FIKS-mottak, objektlager for vedlegg, sikker dialog-utsendelse,
driftsalarm, CI med isolert Postgres, Entra SSO og TOTP-MFA. Dette
dokumentet er handlingsplanen fra kode til innlevert tilbud.

## Fase 1 — eksterne bestillinger (start NÅ, lengst ledetid)

Alt her har dager-til-uker ledetid og er beskrevet i detalj i
[spor-d-bestillinger-fiks-bufdir.md](spor-d-bestillinger-fiks-bufdir.md):

1. **Virksomhetssertifikat** (Buypass/Commfides) på Tidums org.nr. —
   forutsetning for alt under. Bestill først.
2. **Maskinporten-klient** hos Digdir (scope `ks:fiks`) — Tidum.
3. **Fiks IO-integrasjon + konto** hos KS — Tidum søker integrasjon,
   Halden oppretter konto og autoriserer (denne biten krever dialog med
   Halden IT; i tilbudsfasen: beskriv modellen, be om testkonto i
   Fiks test-miljøet på eget org.nr.).
4. **Bufdir/Barnevernsregisteret**: meld interesse for
   leverandør-onboarding, be om meldingstype + testmottakerkonto.
5. **SMS-gateway-avtale** (leverandørnøytral REST — adapteren er ferdig).
6. **Entra ID**: registrer Tidums multi-tenant-app i egen Azure-katalog
   (ENTRA_ID_CLIENT_ID/SECRET) — ingen ekstern motpart nødvendig for demo.

Konfig limes inn per `.env.example`-seksjonene og verifiseres i
`GET /api/admin/integrasjoner/status` — koden er plug-in-klar og fail-closed.

## Fase 2 — demomiljø (parallelt, ~dager)

Tilbud i denne typen konkurranser vinner på demonstrerbarhet:

1. Deploy main til et dedikert demo-miljø (Render + Neon EU) med
   `BARNEVERN_S3_BUCKET` (EU-bøtte), `DRIFT_ALARM_EPOST`, TOTP aktiv.
2. Kjør `npm run seed:barnevern-demo` (kommune 3099, demo-leder/
   demo-saksbehandler/demo-kommune-admin) — hele kjeden melding →
   undersøkelse → plan → vedtak → innsyn → KPI er klikkbar.
3. Generer demo-manus av barnevern-UI-flyten (tests/barnevern-ui.spec.ts
   er allerede manuset steg for steg).

## Fase 3 — tilbudsdokumentene (skrivearbeid, 1–2 uker)

Kravbesvarelsen skrives RETT fra kravmatrisen — hver rad har allerede
status, implementasjonsreferanse og ærlig rest:

1. **Kravbesvarelse**: konverter «Krav 1–31»-tabellen til svarformatet i
   konkurransegrunnlaget. Grupper per seksjon 5-beslutningene:
   - 5.1 gjenbruk fra kjerne (krav 3–6, 11–19, 22, 24): beskriv konkret
     videreføring, oppgi kjent rest.
   - 5.2 ny barnevernsfunksjonalitet (krav 1, 2, 10, 16–18, 29): nå
     implementert — vis til demo.
   - 5.3 eksterne avtaler (krav 7–9, 20, 26–28): avhengighetsplan med
     bestillingsstatus fra fase 1, siste sikre dato, testmiljø.
   - 5.4 ledelsesbeslutninger (krav 19, 21, 23, 25): se fase 4.
2. **Bilag 4 (SLA)**: fyll med målbare verdier — driftsalarmen,
   healthchecks og backup-/restore-skript finnes; det som må BESLUTTES er
   99,5 %-målet, RPO ≤2 t (Neon PITR dekker dette — dokumenter), vakt og
   kreditt.
3. **Databehandleravtale + sikkerhetsvedlegg**: RLS-arkitekturen
   (FORCE RLS, tenant-isolasjon, append-only bevis, secret-box,
   tilgangslogg krav 15) er differensiatoren — skriv den ut som
   arkitekturnotat med referanse til migrasjonene.
4. **Opsjon Elements-adapter**: gjenbruk
   [2026-112379-halden-opsjon-elements-adapter.md](2026-112379-halden-opsjon-elements-adapter.md).

## Fase 4 — ledelsesbeslutninger (må tas før innlevering)

Krav 19/21/23/25 er beslutninger, ikke kode:

- Norsk/EU målplattform bekreftes skriftlig (dagens: Render + Neon
  eu-central-1 + EU-S3 — avklar om Halden krever norsk datasenter).
- Pris- og bemanningsmodell (support, vakt, videreutvikling).
- Ekstern sikkerhetsvurdering/pentest — bestill nå, rapport er
  tilbudsvedlegg.
- Avklar skriftlig med Halden (spørsmålsrunden i konkurransen!): krav om
  ID-porten for eksterne, norsk datasenter, og om Documaster/Elements er
  gitt som arkivkjerne.

## Fase 5 — innlevering

1. Intern gjennomgang: hver kravbesvarelse mot kravmatrisens «rest»-felt —
   ingen overselging; det som står som delvis, beskrives som delvis med plan.
2. Demo-gjennomkjøring med manus, opptak som backup.
3. Lever i god tid før frist (sjekk konkurransegrunnlaget i Mercell/EU
   Supply for eksakt frist og spørsmålsfrist — spørsmålene i fase 4 må inn
   FØR spørsmålsfristen).

## Ansvarsfordeling

| Spor | Eier | Kan startes |
|---|---|---|
| Fase 1 bestillinger | Daniel (org.-signatur kreves) | I dag |
| Fase 2 demomiljø | Claude-økter (deploy + seed) | I dag |
| Fase 3 dokumenter | Claude-økter utkast, Daniel godkjenner | Etter fase 2-start |
| Fase 4 beslutninger | Daniel/ledelse | I dag |
| Fase 5 innlevering | Daniel | Når 1–4 står |

Gjenstående kodearbeid (retention-jobber, PDF-generering, sladding,
BOLA-matrise — se fullføringsplanen) er kvalitet på toppen, ikke
blokkerende for tilbudet: kravmatrisen dokumenterer dem ærlig som rest.
