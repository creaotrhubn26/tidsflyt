# Visuell og funksjonell QA av Salg & CRM — juli 2026

> **Status:** Funnet under er rettet i denne branchen og verifisert
> programmatisk mot kjørende app.

Gjennomgang av hele «Salg & CRM»-adminsuiten under `/admin/salg/*` (12
sider: hub, Pris-tiers, Innstillinger, Inkluderte features, Salgs-routing,
Salgs-script, Kontraktsmaler, Pipeline-stages, Inntekts-analytics,
Sidetekster, Stripe-integrasjon, E-postmaler) — kun tilgjengelig for
super_admin.

Metodikk denne runden var todelt:

1. **Baseline-sveip** (manuell, Playwright): alle 12 sider besøkt på
   desktop (1440×900) og mobil (390×844), lys og mørk modus — DOM-overflow,
   konsoll-/nettverksfeil. Ingen overflow eller krasj funnet i denne
   passeringen, bortsett fra én reell 500-feil (se bug 1 under).
2. **Dyp gjennomgang** (Workflow — 12 parallelle agenter, én per side): hver
   side fikk kildekode- og server-endepunkt-gjennomgang kombinert med
   levende Playwright-interaksjon (opprette/redigere/slette rader, teste
   ugyldige verdier, sjekke feilhåndtering), etterfulgt av en uavhengig
   adversarial verifiseringsrunde per funn. 26 funn ble rapportert og
   bekreftet ekte (0 avvist) — alle er rettet og verifisert på nytt direkte
   mot en kjørende dev-server (inkl. gjenoppretting av testdata som ble
   utilsiktet påvirket under verifisering).

---

## Bugs

### 1. `/api/admin/leads/pipeline-summary` fullstendig utilgjengelig (Express-rekkefølge)

`GET /api/admin/leads/:id` var registrert *før*
`GET /api/admin/leads/pipeline-summary`, så Express matchet
`"pipeline-summary"` som `:id`-parameteren. `Number("pipeline-summary")`
ble `NaN`, som feilet mot en integer-kolonne i Postgres («invalid input
syntax for type integer: NaN»). Endepunktet var dermed fullstendig
utilgjengelig, og pipeline-snapshotet på `/admin/salg`-forsiden viste aldri
data.

**Fiks:** flyttet den statiske ruten foran `:id`-ruten.

### 2. Stille feilende sletting og forhåndsvisning (3 sider)

Slette-mutasjoner på Inkluderte features, Salgs-routing og Kontraktsmaler
hadde ingen feilhåndtering — en feilet sletting ga ingen tilbakemelding til
brukeren i det hele tatt. Kontrakt-forhåndsvisning manglet også en
try/catch rundt selve nettverkskallet, så en nettverksfeil der ga et
uhåndtert unntak og ingen feedback (dialogen «hang» uten forklaring).

**Fiks:** lagt til `onError`-toast på alle slette-mutasjoner, og
try/catch med feilmelding rundt kontrakt-forhåndsvisningen.

### 3. Valideringsfeil vist som «[object Object]» (6 sider)

16 steder i `pricing-routes.ts` returnerte `{ error: parsed.error.flatten() }`
ved en Zod-valideringsfeil — `error`-feltet var altså et objekt, ikke en
streng. Klientsiden bygger konsekvent `new Error(json.error)` direkte fra
dette feltet, og `new Error(objekt)` stringifiserer til det ubrukelige
«[object Object]». Admin fikk dermed aldri se den faktiske
valideringsfeilen på Pris-tiers, Salgs-routing, Salgs-script,
Kontraktsmaler, Pipeline-stages og E-postmaler.

**Fiks:** lagt til `zodErrorMessage()`, som formaterer Zod-feil til en
lesbar norsk streng, brukt konsekvent i alle 16 tilfeller.

### 4. Rå Postgres-feilmeldinger lekket til admin-UI (3 steder)

Duplikat-slug (unique constraint-brudd) og et ugyldig (ikke-numerisk)
tier-ID i Stripe-sync ga rå driverfeilmeldinger rett til klienten —
kolonnenavn, constraint-navn og lignende interne detaljer.

**Fiks:** lagt til `friendlyDbErrorMessage()`, som logger den fulle feilen
server-side men kun sender en generisk, lesbar melding til klienten
(spesifikk melding for duplikat-verdier); validerer nå tier-ID som et
gyldig heltall før spørring i Stripe-sync-endepunktet.

### 5. Ny/redigert pris-tier valideres ikke mot overlapp eller min>max

Verken UI eller server sjekket at et nytt brukerintervall for en pris-tier
ikke overlappet et eksisterende, eller at Maks. brukere var ≥ Min. brukere.
Reprodusert direkte: opprettet en tier med intervall 7–9 brukere til 1
øre/bruker (overlappende med den eksisterende «Starter»-tieren, 5–10
brukere), og en påfølgende pris-forespørsel for 8 brukere returnerte
1-øre-tieren i stedet for riktig Starter-pris — en reell kunde kunne fått
en nesten gratis pris pga. en admin-skrivefeil.

**Fiks:** lagt til `validateTierBand()` (overlapp + min/max) i
POST/PATCH for pris-tiers, og tilsvarende min/max-sjekk for
salgs-routing-regler (som har samme brukerintervall-mønster).

### 6. Data-loss race condition i Innstillinger

Lagring av ett innstillings-felt trigget en refetch av *hele*
innstillings-listen. `useEffect`-en som initialiserte skjema-state
overskrev deretter *hele* `edits`-objektet med ferske serververdier — inkl.
ulagrede endringer brukeren hadde gjort i *andre* felt i mellomtiden.

**Fiks:** `useEffect`-en fyller nå kun inn nøkler som ikke allerede finnes
i lokal state, i stedet for å overskrive alt ved hver refetch.

### 7. Ingen server-side validering av numeriske innstillinger

`PATCH /api/admin/settings/:key` aksepterte en hvilken som helst streng for
innstillinger typet `dataType: "number"` (negative tall, «abc», tom
streng) — disse verdiene brukes direkte i pris-gulv-sjekker og generert
kontraktstekst.

**Fiks:** validerer nå at verdien er et gyldig, ikke-negativt tall før
lagring når `dataType === "number"`.

### 8. PATCH på slettet/ikke-eksisterende rad returnerte 200 med tom body (6 endepunkter)

`const [updated] = await db.update(...).returning()` gir `undefined` når
raden ikke finnes (typisk en allerede slettet rad), men ingen av disse
endepunktene sjekket det — `res.json(undefined)` sender 200 med tom body,
og klienten krasjet på et objekt som ikke fantes. Rammet Salgs-script
(opprinnelig rapportert), Inkluderte features, Salgs-routing,
Kontraktsmaler, E-postmaler, Pipeline-stages og Leads.

**Fiks:** lagt til 404-sjekk på alle syv PATCH-endepunktene.

### 9. Sletting av pipeline-stage i bruk ga stille datakorrupsjon

`DELETE /api/admin/sales/pipeline/:id` slettet stagen ubetinget, selv om
leads fortsatt refererte til den — disse leadene ble stående med en
`pipeline_stage_id` som ikke lenger fantes, og ville vist som stille
«ukategorisert» uten noen feilmelding til noen.

**Fiks:** blokkerer nå sletting (400-feil med antall berørte leads) når
stagen fortsatt er i bruk.

### 10. `isWon` kunne være sann uten `isTerminal`

En pipeline-stage kunne stå igjen med `isWon: true` men `isTerminal:
false` — bl.a. ved å skru av Terminal-bryteren i UI-et *etter* at Won
allerede var satt, siden UI-et bare disabler (ikke nullstiller) Won-bryteren.
Dette ville korrumpert inntektsrapportering, som forutsetter at «vunnet»
alltid er en avsluttende tilstand.

**Fiks:** server validerer nå at `isWon` krever `isTerminal`; klienten
nullstiller Won automatisk når Terminal skrus av.

### 11. «Aktive leads»/«Pipeline (uvektet)»/«Vektet ARR» inkluderte lukkede leads

Pipeline-snapshotet på `/admin/salg`-forsiden filtrerte kun på om selve
stage-*konfigurasjonen* var aktiv, ikke om stagen var *terminal* (tapt/
vunnet). En tapt lead talte dermed som «aktiv pipeline», og en vunnet lead
ville blitt stående i «Vektet ARR» for alltid.

**Fiks:** lagt til `is_terminal` i API-responsen; de tre
toppsummeringene ekskluderer nå terminal-stages (de vises fortsatt i
per-stage-listen, merket «lukket, ikke i aktiv pipeline»).

### 12. Kontrakt viste feil brukerantall / DPA-mal med ufyllbare placeholders

`bruker_antall`-placeholderen i genererte kontrakter brukte rå,
usanitert input, mens prisfeltene beregnes fra en sanitert versjon
(`Math.max(0, Math.floor(...))`) — en kontrakt kunne vise f.eks. «7.8»
eller «-3» brukere mens prisen den oppga gjaldt for 7 eller 0. I tillegg
brukte databehandleravtale-malen (DPA, vedlegg 1) to placeholders
(`leverandor_drifter_tjeneste`, `leverandor_lovvalg_by`) som fantes som
ekte innstillinger i databasen, men manglet i rendrings-kartet — disse
endte som synlig `{{...}}`-tekst i enhver generert DPA.

**Fiks:** bruker nå den saniterte verdien fra prisberegningen for
brukerantall-placeholderen; lagt til de to manglende feltene i
innstillings-typen og rendrings-kartet.

### 13. Tomt tekstfelt i Sidetekster ga tom tekst, ikke lovet standardtekst

Sidetekst-editoren lover eksplisitt: «Tom verdi gir innebygd
standardtekst.» Men `/priser` brukte `cms?.title ?? "Priser"` (og
tilsvarende for 6 andre felt) — `??` faller kun tilbake til default ved
`null`/`undefined`, ikke ved en tom streng brukeren har tømt feltet til.
Et tømt felt viste dermed en blank seksjon på den offentlige prissiden.

**Fiks:** endret alle 7 felt fra `??` til `||`, slik at et tømt felt
faktisk gir standardteksten som lovet.

### 14. Analytics viste historisk topp/kryss i stedet for nåværende status

To steder i inntekts-analytics leste «på et tidspunkt i historikken» som
om det var «nåværende tilstand»:

- **Topp-kunder-tabellen:** `MAX(mrr_after_ore)` viste en kundes historiske
  toppnivå som «nåværende MRR» (en kunde som nedgraderte fra 10 000 til
  3 000 kr/mnd ville fortsatt vist 10 000), og `BOOL_OR(event_type =
  'churn')` markerte enhver kunde som noensinne har churnet som permanent
  churnet, selv etter en senere reaktivering.
- **KPI-raden «Aktive kunder»:** ekskluderte enhver kunde med en
  churn-hendelse i historikken uansett — en lead som ble vunnet på nytt
  etter å ha churnet forsvant fra «aktive kunder» for alltid, mens MRR-en
  fortsatt talte med i «Aktiv ARR» rett ved siden av — selvmotsigende tall.

**Fiks:** begge endepunktene bruker nå en `DISTINCT ON`-spørring som
henter hver kundes *siste* hendelse for å avgjøre nåværende MRR og
churn-status. Verifisert direkte mot en signup → churn → reaktivering-
sekvens: nåværende MRR viser nå siste hendelses verdi, churn-status
reflekterer korrekt reaktiveringen, og kunden telles som aktiv.

---

## Det som ser bra ut

- **Ingen overflow eller layout-brudd** på noen av de 12 sidene, desktop
  eller mobil, lys eller mørk modus.
- **Rolle-/tilgangskontroll** fungerer konsekvent — hele suiten er
  reservert for super_admin, håndhevet både server- og klientsiden.
- **DB-drevet arkitektur** («ingen pris, mal eller routing-regel er
  hardkodet», som forsiden selv sier) holder stikk — alle 12 sider henter
  reell konfigurasjon fra databasen, ingen hardkodede snarveier funnet.
- **Markdown-/placeholder-mønsteret** for kontraktsmaler og e-postmaler er
  konsistent og godt dokumentert i UI-et.

## Skjermbilder

Ingen skjermbilder i denne runden — verifisering skjedde utelukkende
tekst-/DOM-basert og via kildekodegjennomgang, av hensyn til samtalens
størrelse.
