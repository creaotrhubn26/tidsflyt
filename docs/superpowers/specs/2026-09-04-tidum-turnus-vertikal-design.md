# Tidum Turnus — designspesifikasjon

**Dato:** 2026-09-04
**Vertikal:** Tidum Turnus — KI-basert turnus- og bemanningsplanlegging
**Kontekst:** Ny vertikal i `tidsflyt`-monorepo, bygget for anbudet «KI Turnus 2026» (Ålesund kommune, Doffin 2026-113925). Gjenbruker plattformens multi-tenant-, RLS-, auth-, audit- og OpenAI-infrastruktur.
**Relatert:** `docs/anbud/2026-113925-alesund-ki-turnus-byggeplan.md` (byggeplan, estimat, kravmatrise)

---

## 1. Mål og avgrensning

Tidum Turnus lar en organisasjon (kommune eller privat) definere turnusregler, bemanningsbehov og ansattes ønsker, og få en KI-motor til å **generere en lovlig og optimalisert turnus** som kan forklares, justeres og overstyres med synlige konsekvenser.

**Valgt produktform (bekreftet med bruker):**
- **Hybrid turnusmodell:** rotasjonsturnus (vaktlinjer) som grunnstruktur + kalenderlag for avvik, vikar og enkeltvakter.
- **Flere avdelinger** med delt ressurspool (vikar på tvers).
- **Generisk organisasjon** som tenant (kommune *eller* privat virksomhet).

**Utenfor scope for første leveranse (Spor A / demo):** lønn/HR-integrasjoner, ferieplanleggingsmodul utover ønsker, mobilapp. Se byggeplanens Spor B.

**Ufravikelige korrekthetskrav (aldri forenkles bort):**
- Harde arbeidstidsregler (AML kap. 10, tariff) skal *aldri* brytes av en generert turnus.
- Tenant-isolasjon mellom organisasjoner skal håndheves på databasenivå (FORCE RLS).

---

## 2. Tenant- og RLS-arkitektur

Plattformen har allerede to RLS-tenant-moduser i `server/lib/database-rls-context.ts`: `kommune` (barnevern) og `vendor` (companies). Denne pathen ble nylig sikkerhetsherdet og skal **ikke** endres.

**Tidum Turnus får sitt eget tenant-lag:**
- Ny tabell `tidum_turnus_organisasjoner` (org = tenant). Hver org peker valgfritt til `kommune_id` (offentlig, f.eks. Ålesund) eller står som privat org.
- Alle turnus-tabeller bærer `org_id` og har `FORCE ROW LEVEL SECURITY`.
- RLS håndheves via **egen** transaksjonslokal kontekst `tidum.turnus_org_id`, satt gjennom samme hjelpefunksjon (`withRlsContext` / `SET LOCAL`) som eksisterende kontekster, men med egen config-nøkkel.

**Begrunnelse:** unngår regresjonsrisiko i den nylig herdede barnevern-RLS-pathen; korrekt semantikk (turnus-org ≠ kommune); isolert testbarhet.

**Kjent forenkling (ceiling):** to RLS-kontekstmønstre sameksisterer. De deler infrastruktur og skiller kun på config-nøkkel. Konsolideres senere hvis mønstrene konvergerer.

---

## 3. Domenemodell

Alle tabeller: prefiks `tidum_turnus_`, `org_id integer NOT NULL`, `created_at`, FORCE RLS. Definert i `shared/schema.ts` (Drizzle) + egen migrasjonsfil med RLS-policy (mønster fra barnevern).

### 3.1 Struktur
| Tabell | Nøkkelfelt | Rolle |
|--------|-----------|-------|
| `tidum_turnus_organisasjoner` | id, navn, kommune_id?, orgnr | Tenant |
| `tidum_turnus_avdelinger` | id, org_id, navn, parent_id? | Avdelingshierarki |

### 3.2 Ressurser
| Tabell | Nøkkelfelt | Rolle |
|--------|-----------|-------|
| `tidum_turnus_ansatte` | id, org_id, primar_avdeling_id, navn, stillingsprosent, user_email? | Person som kan tildeles; valgfri kobling til plattform-bruker for selvbetjening |
| `tidum_turnus_kompetanser` | id, org_id, navn | Kompetansetype |
| `tidum_turnus_ansatt_kompetanser` | ansatt_id, kompetanse_id | M:N ansatt↔kompetanse |
| `tidum_turnus_vaktkoder` | id, org_id, kode, start_tid, slutt_tid, varighet, type, teller_som_arbeid, farge | Definerer hva en vakt er |

### 3.3 Turnus — rotasjon (grunnstruktur)
| Tabell | Nøkkelfelt | Rolle |
|--------|-----------|-------|
| `tidum_turnus_planer` | id, org_id, avdeling_id, navn, rotasjon_uker, start_dato, status (utkast/generert/godkjent/aktiv) | Rotasjonsplan |
| `tidum_turnus_vaktlinjer` | id, plan_id, org_id, linjenr, stillingsprosent, tildelt_ansatt_id? | «25 linjer» — repeterende mønster |
| `tidum_turnus_linje_vakter` | id, vaktlinje_id, org_id, uke, ukedag (1–7), vaktkode_id? | Ruter i rotasjonsrutenettet (null = fri) |

### 3.4 Kalender — hybrid (avvik/vikar/enkeltvakt)
| Tabell | Nøkkelfelt | Rolle |
|--------|-----------|-------|
| `tidum_turnus_kalendervakter` | id, org_id, avdeling_id, dato, vaktkode_id, ansatt_id?, kilde (rotasjon/manuell/vikar), erstatter_linje_id?, generering_id?, status | Konkrete datovakter: materialisert rotasjon + overstyringer + delt vikarpool |

### 3.5 Behov
| Tabell | Nøkkelfelt | Rolle |
|--------|-----------|-------|
| `tidum_turnus_bemanningsbehov` | id, org_id, avdeling_id, ukedag/dato, vaktkode_id, antall_krevd, kompetanse_krav? | Deknings-constraint til solver |

**Delt vikarpool:** ansatt er org-scoped med primær avdeling, men kan tildeles kalendervakter i hvilken som helst avdeling i org.

---

## 4. Regelmotor og ansatt-innspill

**Prinsipp:** regler lagres som **data, ikke kode**, slik at kunden selv registrerer/administrerer/vedlikeholder (K-01). Én regeltabell dekker turnusregler, arbeidstidsregler, lokale avtaler, særavtaler, dispensasjoner og individuelle unntak — de skiller seg på `kilde`, `scope` og `haard`.

| Tabell | Nøkkelfelt | Dekker |
|--------|-----------|--------|
| `tidum_turnus_regler` | id, org_id, avdeling_id?, ansatt_id?, regeltype (enum), parametre (jsonb), haard (bool), vekt (int), kilde (lov/lokal_avtale/saeravtale/dispensasjon), gyldig_fra/til, aktiv, opprettet_av | K-01/02/03; `ansatt_id`-scope = individuelt unntak |
| `tidum_turnus_onsker` | id, org_id, ansatt_id, plan_id?, type (onske_vakt/onske_fri/ferie/tilrettelegging), dato ell. ukedag/periode, vaktkode_id?, prioritet (maa/bor/kan), begrunnelse?, status (registrert/vurdert/innfridd/avslaatt) | K-05, K-10 |
| `tidum_turnus_prioriteringsprofil` | id, org_id, plan_id?, vekt_onsker, vekt_helgefrekvens, vekt_rettferdighet, vekt_kontinuitet, vekt_kostnad | K-11 |

**`regeltype`-katalog** (utvidbar; params i jsonb, validert per type i app — ikke én kolonne per type):
- Harde: `aml_daglig_hvile_11t`, `aml_ukentlig_hvile_35t`, `aml_max_uketimer`, `aml_max_daglig`, `dekning`, `kompetansekrav`
- Myke: `helgefrekvens`, `rettferdig_fordeling`, `kontinuitet`, `kostnad`, `onske`

**AML-kobling:** `server/lib/arbeidstidsloven.ts` utvides fra enkelt-timeføring til å evaluere en **hel turnus**. Samme motor brukes to steder: (a) generere CP-SAT-constraints, (b) re-validere en manuelt endret turnus (K-04, K-16).

**Skille ønsker vs regler:** ønsker = ansattes tidsspesifikke stemme per periode (myke som standard; godkjent ferie/tilrettelegging → hard). Regler m/`ansatt_id` = varige individuelle constraints. Begge mater solveren.

**Prioritering:** `prioriteringsprofil` gjør avveiningen synlig og justerbar som én enhet, og er grunnlaget for XAI-forklaringen «slik prioriterte vi».

---

## 5. Generator, genereringskjøringer og XAI

### 5.1 Solver-sidecar
Egen Python-tjeneste (`turnus-solver/`, OR-Tools CP-SAT, FastAPI + Dockerfile, egen Render-tjeneste). Versjonert JSON-kontrakt, speilet som typer i `shared/turnus-solver-contract.ts`.

- **Inn:** scope (plan/avdelinger), ansatte, vaktkoder, bemanningsbehov, regler (hard+myke), ønsker, prioriteringsprofil, rotasjonsparametre, låste vakter.
- **Ut:** tildeling + metadata: hvilke harde constraints binder, hvilke myke mål er uoppfylt (og hvor mye), objektiv-breakdown per prioriteringsdimensjon, solve-tid.
- **Determinisme:** harde constraints holder, ellers `INFEASIBLE` + konfliktsett (grunnlag for K-17). Fast seed → reproduserbart resultat.

Node bygger modell-input via regelmotoren (regler → constraint-spec), kaller sidecar, persisterer resultat. Genererte vakter lander i `tidum_turnus_kalendervakter` (kilde=rotasjon), tagget med `generering_id`.

### 5.2 Genereringskjøringer
| Tabell | Rolle |
|--------|-------|
| `tidum_turnus_genereringer` | id, org_id, plan_id, status (kø/kjører/fullført/infeasible/feilet), utløst_av, solver_versjon, solve_tid_ms, objektiv_json, startet/fullført |
| `tidum_turnus_genereringsavvik` | id, generering_id, org_id, type (uoppfylt_onske/uoppfylt_maal/manuell_kreves/infeasible_constraint), alvor, referanse, forklaring — K-12, K-17 |

**Async:** `tidum_turnus_genereringer`-raden fungerer som kø. Synkront sidecar-kall for små planer (~25 linjer), async for store; UI poller `status`.
**Ceiling:** ingen egen jobbkø-infra nå; dedikert kø legges til i Spor B kun ved behov for store planer.

**Gating (K-06/07):** «generer» aktiveres når planen har vaktkoder + bemanningsbehov + ansatte + aktive regler. Beregnet readiness på `plan.status`-overganger; ingen egen tabell.

### 5.3 XAI-lag (strukturert først — aldri fri generering)
- **Strukturert forklaring** (deterministisk, fra solver-fakta): hvilke regler gjaldt, hvilke prioriteringer dominerte, hva kunne ikke oppfylles (K-14, K-17). Leser `objektiv_json` + `genereringsavvik`.
- **Narrasjon** (OpenAI, allerede integrert): oversetter strukturerte fakta til lesbar norsk (K-13). Narrerer fakta, finner ikke på.
- **Overstyring m/konsekvens (K-15/16):** manuell endring av en kalendervakt → kjør AML-full-turnus-validator + deknings-sjekk på **deltaet** → returner konsekvens (nytt AML-brudd? dekningshull? uoppfylt behov?) **før** commit. Ingen solver for enkelt-endring — kun re-validering.

---

## 6. API- og UI-flater

### 6.1 API (Express, RLS-wrappet via turnus-kontekst) — 4 rutemoduler
| Modul | Dekker |
|-------|--------|
| `server/routes/turnus-struktur-routes.ts` | org, avdeling, ansatt, kompetanse, vaktkode CRUD |
| `server/routes/turnus-regler-routes.ts` | regler (K-01/02/03), prioriteringsprofil (K-11), ønsker (K-05) |
| `server/routes/turnus-plan-routes.ts` | turnusplan, bemanningsbehov, vaktlinjer, gating/readiness (K-06/07) |
| `server/routes/turnus-generering-routes.ts` | start/status/resultat, avvik, XAI-forklaring (K-13/14/17), konsekvens-preview (K-15/16) |

### 6.2 UI (React) — speiler `client/src/pages/barnevern.tsx` + `client/src/lib/turnus-api.ts`
- **Planlegger-flate (K-06):** plan-oversikt, turnus-rutenett (vaktlinjer × dager), generer-knapp m/readiness, forslag/avvik/varsler-panel (K-09), manuell justering m/konsekvens-forhåndsvisning (K-15/16), XAI-forklaringspanel (K-13/14/17).
- **Ansatt-selvbetjening (K-05):** registrere ønsker/preferanser/helgefrekvens/tilrettelegging.
- **Regel-admin (K-01/02/03):** registrere/vedlikeholde regler, avtaler, dispensasjoner.
- **WCAG (K-19):** gjenbruk eksisterende tokens + axe i CI.

---

## 7. Teststrategi

To korrekthetsbaner får eksplisitt dekning og forenkles aldri: **AML full-turnus-validering** og **RLS tenant-isolasjon**.

| Nivå | Fokus |
|------|-------|
| Unit | `arbeidstidsloven.ts` full-turnus-utvidelse (harde constraints — kritisk), regel→constraint-oversettelse, vaktkode/varighet |
| Solver | Golden tests: kjent scenario → forventet feasibility + bindende constraints; infeasible → korrekt konfliktsett; determinisme (fast seed) |
| Integrasjon | Generering e2e mot isolert Postgres (eksisterende CI-mønster) → sidecar → persistert kjøring → XAI strukturert utdata |
| RLS-isolasjon | Turnus-tabeller tenant-isolert (kritisk — speiler barnevern-herdingstestene) |
| Override | Endring → korrekt AML/deknings-delta |
| Playwright | Planlegger generer-flyt + ansatt ønske-flyt (demo-kritisk, tildelingsvekt 60 %) |

### 7.1 Demo-videoer
Per ferdig funksjon lages demo-videoer med samme pipeline som barnevern-videoene: Playwright med synlig muse-peker-overlay (teal punkt, rødt ved klikk via `addInitScript`) → webm → ffmpeg → mp4 → QC-frame-uttrekk. Videoene brukes til anbudets løsningspresentasjon (tildelingskriterium 2, vekt 60 %). Scenarier: turnusgenerering ende-til-ende, ansatt-ønske-registrering, regel-/dispensasjon-admin, XAI-forklaring, overstyring m/konsekvens.

---

## 8. Feilhåndtering

- **Solver INFEASIBLE:** ikke en systemfeil — persister som `genereringer.status=infeasible` + konfliktsett i `genereringsavvik`; XAI forklarer hva som ikke lot seg oppfylle (K-17). UI viser dette konstruktivt, ikke som krasj.
- **Sidecar utilgjengelig/timeout:** `genereringer.status=feilet` med årsak; UI tilbyr ny kjøring. Turnusdata forblir uendret (idempotent — genererte vakter skrives først ved fullført kjøring).
- **Manuell overstyring som bryter AML:** konsekvens-preview blokkerer ikke, men varsler tydelig (leder kan ha dispensasjonsgrunnlag); bruddet logges på vakten for revisjon.
- **RLS:** fail-closed. Manglende/ugyldig `turnus_org_id`-kontekst gir ingen rader, aldri kryss-org-lekkasje.

---

## 9. Avhengigheter og deploy

- **Ny tjeneste:** `turnus-solver` (Python/OR-Tools) på Render, egen URL i env (`TURNUS_SOLVER_URL`).
- **Gjenbruk:** Postgres/Neon, Drizzle, RLS-infrastruktur, auth/roller, audit, OpenAI-klient, WCAG-CI.
- **Migrasjoner:** nye filer registreres i `server/lib/run-startup-migrations.ts` (fail-closed-kjede), kjøres ved boot.

---

## 10. Faseplan (fra byggeplan)

Spor A (presentasjonsklar demo, ~9–12 dev-uker): A0 domenemodell+regel-CRUD+ønsker → A1 solver harde constraints → A2 myke mål+prioritering → A3 XAI+overstyring → A4 UI+polish.
Spor B (produksjonsklar, ~13–18 dev-uker): fullt regelverk, skala 3 500, integrasjoner, kontinuitet/kostnad, herding.

**Åpne go/no-go-avklaringer (utenfor kode):** referansekrav K-21 (≥1 KI-turnusleveranse siste 2 år) og tidslinje mot 05.10-frist. Se byggeplan §2.
