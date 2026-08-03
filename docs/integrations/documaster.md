# Documaster-integrasjon (Noark 5-arkivering)

**Status:** Implementert, venter på verifisering mot Documaster-sandkasse
**Veikart:** [Fase 2 — Samhandlingsvertikalen](../veikart-barnevern-vertikal.md)

Godkjente rapporter arkiveres automatisk som **journalposter** i vendorens
arkivkjerne, i en **saksmappe per Tidum-sak**, med **skjerming/gradering**.
Modulen er provider-uavhengig (`ArchiveProvider`-grensesnitt) — Documaster er
første implementasjon; Fiks Arkiv m.fl. kan legges til i samme fabrikk.

## Arkitektur

```
godkjenn rapport ──► queueRapportArchiving() ──► archive_entries (outbox)
                                                      │
                          archive-cron (hvert 5. min) │ processArchiveEntry()
                                                      ▼
                    ┌──────────────── archive-service ────────────────┐
                    │ 1. archive_case_links → finn/opprett saksmappe  │
                    │ 2. generateRapportPDF (samme som videresending) │
                    │ 3. journalpost m/skjerming + PDF som arkivformat│
                    └──────────────► DocumasterProvider ──────────────┘
                                       (token → upload → save)
```

| Fil | Rolle |
|---|---|
| `server/lib/archive/noark.ts` | Noark 5-typer og payload-byggere (rene funksjoner, enhetstestet) |
| `server/lib/archive/documaster-client.ts` | Transport mot Documasters Noark 5-webtjenester + provider-fabrikk |
| `server/lib/archive/archive-service.ts` | Outbox-orkestrering, idempotens, backoff, audit-logg |
| `server/routes/archive-routes.ts` | API-endepunkter + cron |
| `server/lib/secret-box.ts` | AES-256-GCM-forsegling av client_secret (krever `TIDUM_SECRET_KEY`) |
| `migrations/052_archive_integration.sql` | `archive_configs`, `archive_case_links`, `archive_entries` |

## Endepunkter

| Metode | Sti | Roller | Beskrivelse |
|---|---|---|---|
| GET | `/api/integrations/arkiv/status` | admin + tiltaksleder-tier | Vendorens config (uten secret) |
| POST | `/api/integrations/arkiv/connect` | vendor_admin+ | Verifiser tilkobling + lagre. Body: `{ baseUrl, clientId, clientSecret, arkivdelId?, journalenhet?, skjermingshjemmel?, tilgangsrestriksjon?, autoArchive? }` |
| DELETE | `/api/integrations/arkiv/disconnect` | vendor_admin+ | Fjern config |
| GET | `/api/integrations/arkiv/entries?status=` | admin + tiltaksleder-tier | Arkivlogg (outbox-rader) |
| POST | `/api/integrations/arkiv/entries/:id/retry` | admin + tiltaksleder-tier | Manuell retry, nullstiller backoff |
| POST | `/api/rapporter/:id/arkiver` | admin + tiltaksleder-tier | Manuell arkivering av godkjent rapport |

## Personvern og skjerming

- **Titler er pseudonyme:** journalpost- og mappetitler bygges av saksnummer,
  klientreferanse og periode — aldri navn (samme prinsipp som resten av Tidum).
- **Skjerming settes alltid**: standard `Offl. § 13 jf. fvl. § 13` / `UO`,
  konfigurerbar per vendor (barnevern: `Offl. § 13 jf. bvl. § 13-1`).
  `offentligTittel` er ytterligere generalisert; tittel og korrespondansepart
  skjermes i offentlig journal.
- **Sporbarhet:** hver arkivering logges i `rapport_audit_log`
  (event `archived` med journalpost-id og skjerming) og i `archive_entries`
  med SHA-256-hash av arkivert PDF.

## Pålitelighet

- **Outbox-mønster:** `archive_entries` har UNIQUE(entity_type, entity_id);
  feilede forsøk får eksponentiell backoff (5 min · 2^n, tak 24 t), etter
  8 forsøk kreves manuell retry.
- **Idempotens mot arkivkjernen:** alle objekter merkes med `EksternId`
  (`tidum:sak:<uuid>` / `tidum:rapport:<uuid>`) og slås opp før opprettelse —
  replays dobbeltarkiverer ikke.
- Arkivering er **best-effort i godkjenningsflyten**: feil i arkivet blokkerer
  aldri godkjenning av rapporten.

## Oppsett

1. Sett `TIDUM_SECRET_KEY` (vilkårlig sterk streng) i miljøet — uten den
   lagres client_secret i klartekst (kun akseptabelt i dev).
2. Vendor-admin henter fra Documaster: base-URL for instansen, OAuth2
   client_id/secret (client_credentials) og id for arkivdelen journalposter
   skal inn i.
3. `POST /api/integrations/arkiv/connect` — verifiserer tilkoblingen før noe
   lagres.
4. Fra nå arkiveres godkjente rapporter automatisk (skru av med
   `autoArchive: false`; manuell arkivering er alltid tilgjengelig).

## Gjenstår før produksjon

- [ ] **Sandkasseverifisering mot Documaster** — API-stiene
      (`/idp/oauth2/token`, `/rms/api/v2/{query,save,upload}`) og felt-/
      responsformen i `documaster-client.ts` er skrevet mot dokumentert
      tjenesteform, men må bekreftes mot en reell instans. All transport er
      isolert i den ene filen; `apiPaths` i config kan overstyre stier.
- [ ] Partneravtale/API-tilgang med Documaster (jf. veikartets steg 5).
- [ ] UI i innstillinger (connect-skjema + arkivlogg) — API-et er klart.
- [ ] Utvide til `vedtak` og `dialog` som entity_types når de modulene
      finnes (fase 3 i veikartet) — outbox og provider støtter det allerede.
