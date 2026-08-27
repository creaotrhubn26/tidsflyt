# Documaster-integrasjon (Noark 5-arkivering)

**Status:** Implementert, venter på verifisering mot Documaster-sandkasse
**Veikart:** [Fase 2 — Samhandlingsvertikalen](../veikart-barnevern-vertikal.md)

Godkjente rapporter, journalnotater og avsluttede sikre dialoger kan arkiveres
som **journalposter** i tenantens arkivkjerne, i en mappe per sak eller
bekymringsmelding, med **skjerming/gradering**.
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
| `server/lib/secret-box.ts` | Versjonert AES-256-GCM-forsegling av client_secret og datanøkler |
| `server/lib/archive/secure-dialog-package.ts` | Deterministisk manifest, transkript og dokumentkontrollsummer |
| `migrations/052_archive_integration.sql` | Grunnskjema for `archive_configs`, `archive_case_links`, `archive_entries` |
| `migrations/074_secure_dialog_archive_retention_keys.sql` | Kommune-tenant, sikker dialog, kvitteringsbevis og retensjonsvakter |

## Endepunkter

| Metode | Sti | Roller | Beskrivelse |
|---|---|---|---|
| GET | `/api/integrations/arkiv/status` | tenantens arkivoperatører | Tenantens config (uten secret) |
| POST | `/api/integrations/arkiv/connect` | vendor_admin+ / barnevernsleder | Verifiser tilkobling + lagre. Body: `{ baseUrl, clientId, clientSecret, arkivdelId?, journalenhet?, klasseId?, skjermingshjemmel?, tilgangsrestriksjon?, autoArchive? }` |
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

- **Outbox-mønster:** `archive_entries` har UNIQUE(entity_type, entity_id),
  atomisk `processing`-claim og gjenoppretting av foreldede claims;
  feilede forsøk får eksponentiell backoff (5 min · 2^n, tak 24 t), etter
  8 forsøk kreves manuell retry.
- **Idempotens mot arkivkjernen:** alle objekter merkes med `EksternId`
  (`tidum:sak:<uuid>` / `tidum:rapport:<uuid>`) og slås opp før opprettelse —
  replays dobbeltarkiverer ikke.
- Arkivering er **best-effort i godkjenningsflyten**: feil i arkivet blokkerer
  aldri godkjenning av rapporten.

## Oppsett

1. Sett versjonert `TIDUM_SECRET_KEYRING` og `TIDUM_SECRET_ACTIVE_KEY_ID` i
   hemmelighetshvelvet. `TIDUM_SECRET_KEY` beholdes bare under overgang fra
   eldre `enc:v1`-data. Se runbooken for sikker nøkkelrotasjon.
2. Legg Documaster-vertsnavnet i `ARCHIVE_ALLOWED_HOSTS`; produksjon nekter
   alle arkivmål som ikke er eksplisitt allowlistet.
3. Vendor-admin eller barnevernsleder henter fra Documaster: base-URL for instansen, OAuth2
   client_id/secret (client_credentials) og id for arkivdelen journalposter
   skal inn i.
4. `POST /api/integrations/arkiv/connect` — verifiserer tilkoblingen før noe
   lagres.
5. Fra nå arkiveres godkjente rapporter automatisk (skru av med
   `autoArchive: false`; manuell arkivering er alltid tilgjengelig).

## Gjenstår før produksjon

- [ ] **Sandkasseverifisering mot Documaster** — klienten er skrevet mot
      den offisielle spesifikasjonen (github.com/documaster/noark5-web-services,
      v1): `/rms/api/public/noark5/v1/{query,transaction,upload}`, referanser
      som `link`-actions, Dokument+Dokumentversjon, kodeliste-koder (H/V, P/A)
      og `eksterntSystem`/`eksternID`. Gjenstår å kjøre
      `scripts/test-documaster-integration.ts` mot en reell instans — særlig
      token-stien (instansens IdP), skjermingskoder og `administrativEnhet`
      er instans-konfigurert. `apiPaths` i config kan overstyre stier.
- [ ] Partneravtale/API-tilgang med Documaster (jf. veikartets steg 5).
- [x] UI i innstillinger — `ArkivConnectCard` på `/settings` for vendor_admin+
      (`client/src/components/integrations/arkiv-connect-card.tsx`): connect-skjema
      med hjemmel-forslag, auto-arkivering av/på, tilkoblingstest, arkivlogg med retry.
- [x] Sikker dialog arkiveres som manifest, transkript og rene vedlegg med
      kontrollsummer og idempotent ekstern-ID. Faktisk kundesandkasse gjenstår.
- [ ] Utvide til `vedtak` og øvrige dokumenttyper når de domenene finnes.

Se [runbook for sikker dialog, arkiv, retensjon og nøkkelrotasjon](../runbooks/sikker-dialog-arkiv-retensjon-og-nokkelrotasjon.md).
