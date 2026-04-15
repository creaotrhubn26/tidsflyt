# Implementation Pipeline for Tidum

Standard arbeidsflyt for å ta en ny integrasjon, feature eller compliance-leveranse fra idé til produksjon. Bruk dette som mal — hver integrasjon (ID-porten, BankID, KS Fiks, PowerOffice, o.l.) følger samme faser. Siste oppdatering: 15. april 2026.

---

## Faser i pipelinen

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  1. Scope     │→ │  2. Admin   │→ │  3. Design  │→ │  4. Build   │→ │  5. Verify  │→ │  6. Release │
│     &         │   │     &        │   │     &        │   │     &        │   │     &        │   │     &        │
│  Decision    │   │   Legal      │   │   Schema    │   │   Test       │   │   Handoff   │   │   Monitor   │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
     1–2 d             2–5 uker           1–2 d             3–10 d            1–3 d             løpende
```

Hver fase har inngangskriterier (forrige fase fullført), konkrete leveranser og et gate-krav før du kan gå videre.

---

## Fase 1 — Scope & Decision

**Mål:** Bestemme *om* og *hvorfor* integrasjonen skal bygges, og skrive ned forventet ROI + prioritet.

### Inngang
- Idé eller krav fra kunde / roadmap / compliance

### Leveranser
1. **En-sider** med følgende seksjoner:
   - Problem: hva kunden ikke kan gjøre i dag
   - Løsning: hva vi bygger (én setning)
   - Forretningsverdi: hvem som etterspør, anslag på lukking av salg
   - Avhengigheter: lov-/tech-krav, andre systemer
   - Risiko: hva som kan gå galt
   - Alternativer: er det enklere veier (CSV, webhook, manuell eksport)?
2. **Prioritet** satt i `docs/compliance/roadmap.md` (P0/P1/P2)
3. **Issue** i GitHub med label `integration|compliance|feature` og milestone

### Gate → Fase 2
- Eier signerer av på scope (tekst + prioritet)
- Pipelinen gir rett til å legge inn ressurser i Fase 2

---

## Fase 2 — Admin & Legal

**Mål:** Skaffe credentials, sertifikater, avtaler og godkjenninger som må være på plass *før* koden kan kjøres mot ekte system.

### Typiske oppgaver per integrasjon

| Integrasjon | Kritiske admin-steg | Ledetid |
|---|---|---|
| **ID-porten** | Virksomhetssertifikat (Buypass/Commfides) + klientregistrering i Samarbeidsportalen + DPA med Digdir | 3–5 uker |
| **BankID** (via Signicat/Idfy) | Kontrakt + client_id/secret + merchant-ID godkjent | 2–3 uker |
| **Tripletex API** | Partner-avtale + employee token + API-nøkkel | 1–2 uker |
| **PowerOffice Go** | Demo-konto → whitelisted URL-er → producer-token | 1 uke |
| **KS Fiks** | Søknad til KS + klient-sertifikat + mottaker-ID | 4–8 uker |
| **Altinn 3** | Maskinporten-klient + systemklave | 2–3 uker |
| **ISO 27001** | Sertifiserer valgt + gap-analyse + tiltak + audit | 6–12 mnd |
| **EHF/PEPPOL** | Access point-avtale + SMP-registrering | 2–4 uker |
| **DPIA** | Risk-vurdering skrevet + signert av personvernombud/ledelse | 1–3 uker |

### Leveranser
- Alle credentials lagret i **Render env-vars** med `sync: false` (manuelt, aldri i repo)
- Alle legaldokumenter scannet og lagret i `docs/legal/` (ikke committet) eller Drive
- Test-miljø-credentials tilgjengelig og testet med `curl` for basis-tilkobling

### Gate → Fase 3
- Credentials virker mot leverandørens **test-miljø** (ikke prod ennå)
- Databehandleravtale signert
- Alle env-var-navn + semantikk dokumentert i `docs/compliance/env-vars.md` (kun *navn*, aldri verdier)

### Trick
Start Fase 2 så snart beslutningen er tatt. Det er den klart lengste fasen, og blokkerer alt annet. Alt annet kan parallelliseres.

---

## Fase 3 — Design & Schema

**Mål:** Låse arkitektur, DB-endringer og API-flyt *før* du skriver produksjonskode.

### Leveranser
1. **Arkitekturdiagram** i `docs/diagrams/<feature>.svg` eller i issue (lavt detaljnivå — 3–7 bokser)
2. **DB-migrasjon** skissert i `migrations/XXX_<feature>.sql` (ikke kjørt ennå)
3. **Schema-endringer** i `shared/schema.ts` (nye tabeller eller kolonner som Drizzle-eksporter)
4. **API-endepunkter** listet med path + method + request/response eksempel
5. **UI-flyt** skissert i lo-fi mockup (Figma eller håndtegnet) for nye skjermer
6. **Sikkerhets- og rollescoping** — hvem kan kalle hvilket endepunkt? Hvilken data krysser vendor-grensen?

### Beslutninger som MÅ gjøres her

| Spørsmål | Eksempel (ID-porten) |
|---|---|
| Hvordan autentiserer klienten seg? | `private_key_jwt` med virksomhetssertifikat |
| Hvor lagres sensitive data? | `fnr_hash`, aldri rå fnr; `idporten_sub` som primærkobling |
| Hvilke roller kan initiere flyten? | Alle uinnloggede brukere (startpunkt) |
| Hva skjer ved feil? | Redirect til `/login?error=idporten_failed` med generisk feilmelding |
| Audit-krav? | Hver vellykket login logges i `rapport_audit_log` med ACR-nivå |
| Rollback-plan? | Miljøvariabel `IDPORTEN_DISABLED=true` skjuler knappen på login |

### Gate → Fase 4
- Schema-endringer reviewed av én annen dev (eller stub-reviewed hvis sologruppe)
- Migrasjon kjører idempotent lokalt (`IF NOT EXISTS` osv.)
- API-kontrakter dokumentert nok til at frontend kan mocke dem

---

## Fase 4 — Build & Test

**Mål:** Produksjonsklar kode, dekket av tester, klar til deploy.

### Leveranser per commit

- **Migrasjon** først — alltid bakoverkompatibel (ingen `DROP COLUMN` uten backup)
- **Server** — endepunkter + auth + validering + audit-logging
- **Client** — UI, state-håndtering, error-states, loading-states, disabled-states
- **Tests** — minimum én integrasjonstest som dekker happy path + én feil-case
- **Dokumentasjon** — README / CLAUDE-notat oppdatert med nye env-vars og bruksmønster

### Arbeidsflyt

```
feat/<integration>-branch
├── commit 1: migration (schema + shared/schema.ts)
├── commit 2: server endpoints (stub)
├── commit 3: server logic + audit
├── commit 4: client UI + wire-up
├── commit 5: tests
└── commit 6: docs
```

Alternativt: én stor commit med tydelig seksjonert melding (som vi har gjort i april-2026-releaset). Begge er ok for sologruppe — PR-delingen er fordelen ved brancher.

### Test-krav per integrasjon

| Test-type | Når kreves |
|---|---|
| **Unit** | All business logic som har forgreninger (permission checks, validering) |
| **Integration** | Minst én test mot leverandørens test-miljø (f.eks. mot `test.idporten.no`) |
| **E2E (Playwright)** | Happy path for nye UI-flyter, inkludert avkreving hvor mulig |
| **A11y** | Nye offentlige sider kjøres gjennom `tests/a11y-public-pages.spec.ts` |
| **Security** | Sjekk at nye endepunkter respekterer `requireAuth`, role-scoping og vendor-isolering |

### Typecheck-gate

```
npx tsc --noEmit
```
må passere (eller bare ha pre-eksisterende feil). Nye feil er blocker.

### Gate → Fase 5
- Alle tester grønne lokalt
- Ingen nye TypeScript-feil
- `render.yaml` oppdatert hvis nye env-vars
- `docs/compliance/env-vars.md` oppdatert
- `docs/compliance/roadmap.md` oppdatert (flytt fra 📋 til 🚧)

---

## Fase 5 — Verify & Handoff

**Mål:** Faktisk *sjekke* at det som er bygget virker, mot test-miljø, med realistiske data.

### Leveranser
1. **Staging-deploy** (eller prod-deploy med feature-flag `<INTEGRATION>_DISABLED=true` så knappen er skjult)
2. **Live-verifikasjon** — faktisk klikk-gjennomgang med loggbare bevis (screenshots eller console-output)
3. **Smoke-test-script** som kan kjøres manuelt etter hver deploy:
   ```bash
   bash scripts/smoke-test/<integration>.sh
   ```
4. **Operational runbook** — hvordan diagnostisere når det feiler i prod (feilkoder, logg-søk, fallbacks)

### Live-verifikasjon-sjekkliste (tilpasses per integrasjon)

For ID-porten spesifikt:
- [ ] Klikk "Logg inn med ID-porten" → omdirigerer til Digdir
- [ ] Logg inn med test-bruker → redirect tilbake til Tidum
- [ ] Session er satt, bruker er innlogget som riktig person
- [ ] `rapport_audit_log` har ny rad med `event_type=idporten_login`
- [ ] Logout → både Tidum og Digdir-session rensket
- [ ] Feil-path: avbryt i Digdir → redirect til `/login?error=cancelled` med pen melding
- [ ] Scope-test: `acr_values=Level4` tvinges gjennom

### Gate → Fase 6
- Live-verifikasjon passerer
- Runbook er skrevet
- Emergency rollback-prosedyre dokumentert

---

## Fase 6 — Release & Monitor

**Mål:** Åpne funksjonen for ekte brukere og følge med for regresjoner.

### Leveranser
1. **Fjerne feature-flag** eller sette til `false` (hvis scoping-modus)
2. **Announcement** — blogg-post, e-post til eksisterende kunder, endring på landingssiden hvis aktuelt
3. **Endringslogg** — `docs/compliance/roadmap.md` oppdatert (flytt fra 🚧 til ✅)
4. **Alerting** satt opp — minst error-log-filter for endepunktet, helst dedikerte metrics

### Første 72 timer etter release

```
monitor:
  - check every 4h:
      - logs for endpoint error rate
      - count of successful flows
      - any sustained 5xx
      - user-reported issues
  - rollback-trigger:
      - >2% error rate over 1h window
      - ny P0-bug rapportert
      - sikkerhets-issue funnet
```

### Rollback-prosedyre (generell)

1. `! render api/v1/services/<id>/rollback` — til forrige live-deploy
2. Disable env-flag: `INTEGRATION_DISABLED=true` → re-deploy (raskere enn full rollback)
3. Hvis DB-migrasjon er problemet: kjør rollback-SQL (som skal lages for alle migrasjoner P0+)

### Post-release

- Oppdater `docs/compliance/roadmap.md` — ✅ med dato
- Post incident / lesson-learned i team-kanal hvis noe brant

---

## Vedlegg — ID-porten konkret gjennom pipelinen

| Fase | Status akkurat nå | Eier | Klar til |
|---|---|---|---|
| 1. Scope & Decision | ✅ (roadmap.md P0) | Daniel | — |
| 2. Admin & Legal | 📋 Ikke startet | Daniel | Fase 3 når virksomhetssertifikat bestilt |
| 3. Design & Schema | 🚧 Skisse skrevet i denne tråden | Claude/Daniel | Start etter Fase 2 |
| 4. Build & Test | 📋 Avhengig av credentials | Claude | Etter Fase 2 |
| 5. Verify & Handoff | 📋 | Claude + Daniel | Etter Fase 4 |
| 6. Release & Monitor | 📋 | Daniel | Etter Fase 5 |

### Parallelliseringsmulighet
Fase 3 (DB-migrasjon 035 + stub-routes + klient-knapp) kan bygges **nå** som forberedelse — uten test-credentials. Dette gir:
- 50% ferdig kode når Fase 2 leverer credentials
- Mulighet til å teste den teknisk uten å ha en ekte idporten-token (mock-runs)

Se [ID-porten-tekniske-detaljer](#id-porten-tekniske-detaljer-detaljert-svar) i tidligere chat-svar for konkret fil-struktur.

---

## Sjekkliste-mal for nye integrasjoner (kopier og fyll ut)

```markdown
# [INTEGRASJON] — Implementation Tracker

## Fase 1 — Scope
- [ ] En-sider skrevet
- [ ] Prioritet satt (P0/P1/P2)
- [ ] GitHub-issue opprettet

## Fase 2 — Admin & Legal
- [ ] Leverandørkontrakt signert
- [ ] Credentials mottatt (test)
- [ ] DPA signert (hvis aktuelt)
- [ ] Env-vars lagt til i Render (test først, prod senere)

## Fase 3 — Design
- [ ] Migrasjons-SQL skissert
- [ ] Schema.ts-endringer skissert
- [ ] API-endepunkter listet
- [ ] UI-flyt skissert

## Fase 4 — Build
- [ ] Migrasjon skrevet og kjørt mot dev-DB
- [ ] Server-endepunkter implementert
- [ ] Client UI implementert
- [ ] Tester skrevet (unit + integration + E2E der aktuelt)
- [ ] Dokumentasjon oppdatert

## Fase 5 — Verify
- [ ] Staging/prod-deploy med feature-flag
- [ ] Live-verifikasjon passert
- [ ] Runbook skrevet
- [ ] Rollback-plan dokumentert

## Fase 6 — Release
- [ ] Feature-flag fjernet / aktivert
- [ ] Announcement publisert
- [ ] Endringslogg oppdatert
- [ ] 72-timers monitoring gjennomført

```

---

## Ressurser

- `docs/compliance/roadmap.md` — full oversikt over hva som ligger i hvilken fase
- `docs/compliance/databehandleravtale.md` — DPA-mal, skal oppdateres med nye underdatabehandlere ved hver integrasjon
- `docs/compliance/behandlingsprotokoll.md` — GDPR art. 30-protokoll, skal oppdateres med nye datakategorier
- `render.yaml` — spec for env-vars og build-konfig
- `scripts/smoke-test/` — en fil per integrasjon med basic tilkoblings-check

---

*Ansvarlig for pipeline-kvalitet: produktteamet i Creatorhub AS (org 937 518 684).*
*Oppdateres ved behov når vi lærer av nye integrasjoner.*
