# Visuell QA av rapportering — juli 2026

> **Status:** Alle 7 funn under er rettet i denne branchen og verifisert
> visuelt/programmatisk mot kjørende app. Skjermbildene i denne mappen er tatt
> **etter** fiksene (samme oppsett som dashboard-QA-en); se «Rettet i denne
> branchen» for før/etter-beskrivelse av hvert funn.

Gjennomgang av hele rapporteringsflyten: `/rapporter` (liste), `/rapporter/ny`
(skriv rapport), `/rapporter/godkjenning` (tiltaksleder-godkjenning),
`/case-reports` (saksrapport-byggeren) og `/admin/rapport-maler`
(mal-administrasjon) — i lys/mørk modus, på desktop (1440×900) og mobil
(390×844), for admin-, tiltaksleder- og miljøarbeider-visning der aktuelt.
Samme metode som dashboard-QA-en: appen kjørt lokalt mot en frisk
Postgres-database, skjermbilder tatt med Playwright/Chromium.

Konsoll, sidefeil og API-svar ble logget per visning: **ingen JS-feil, ingen
4xx/5xx fra API-et** i noen av de 19 kombinasjonene som ble testet.

---

## Kritisk funn

### 1. Systemmalene («Rapport-maler») var tomme på enhver fersk database

`rapport_templates`-tabellen manglet `UNIQUE(vendor_id, slug)`. Rå SQL-
migrasjonen `028_rapport_templates.sql` definerer denne constrainten korrekt,
men den migrasjonen kjører **ikke** automatisk ved oppstart (kun migrasjon
036 og oppover står i `STARTUP_MIGRATIONS` i
`server/lib/run-startup-migrations.ts`). Drizzle-schemaet i `shared/schema.ts`
(brukt av `npm run db:push`, som er den praktiske veien til å provisjonere en
fersk database) definerte heller ikke constrainten.

Konsekvens: `seedSystemRapportTemplates()` sitt
`ON CONFLICT (vendor_id, slug) DO UPDATE` feilet med
*"there is no unique or exclusion constraint matching the ON CONFLICT
specification"* for **alle 9 systemmalene** ved hver oppstart — logget som
`Failed to seed template …`, men startup-loggen skrev likevel
`✅ Seeded 9 system rapport templates` uansett (den teller forsøk, ikke faktiske
suksesser). Resultat: `/admin/rapport-maler` viste «System-maler 0», og
«Rapport-mal»-nedtrekket i `/rapporter/ny` hadde bare «— generell struktur —»
— ingen av sektor-malene (barnevern, NAV, kommune, helsevesen) var
tilgjengelige for noen bruker på et ferskt miljø (ny kunde-database,
disaster-recovery-gjenoppretting, staging-reset).

**Fiks:** ny migrasjon `050_rapport_templates_unique_constraint.sql`
(idempotent, `ALTER TABLE … ADD CONSTRAINT` med
`EXCEPTION WHEN duplicate_object THEN NULL`) lagt til i
`STARTUP_MIGRATIONS`, og Drizzle-schemaet synket med en tilsvarende
`uniqueIndex`. Verifisert: alle 9 systemmaler vises nå korrekt med riktig
seksjonsantall og «Foreslått for …»-merking.

---

## Bugs

### 2. Rapportskjemaet brøt fullstendig sammen på mobil

`/rapporter/ny` (og `/rapporter/:id`) sin to-kolonne-layout
(`lg:grid-cols-[minmax(0,1fr)_320px]` i `RapportSkrivePage.tsx`) manglet en
eksplisitt kolonnedefinisjon under `lg`-breakpointet. Tailwind faller da
tilbake til en ubegrenset implisitt kolonnebredde, og ett bredt underelement
(de to dato-inputtene side ved side i «Periode») blåste opp **hele** kolonnen
forbi viewport-bredden på mobil — og dro statuspanelet (som stables under
skjemaet på mobil) med seg. Verdiene i statuspanelet («Utkast», «Ikke valgt»,
antall aktiviteter/mål) ble dermed presset usynlige utenfor skjermen, uten at
det viste seg som en synlig scrollbar (klippet av en overordnet container).
I tillegg manglet tre knappegrupper (verktøylinjen øverst, og overskriftene
for «Aktivitetslogg» og «Mål og tiltak») `flex-wrap`, så knappene ble klippet
av eller presset sammen på smale skjermer.

**Fiks:** `grid-cols-1` lagt til som eksplisitt fallback; Periode-radens to
datofelt stables i kolonne under `sm`; `flex-wrap` lagt til de tre
knappegruppene. Verifisert: ingen horisontal overflow (`scrollWidth ===
clientWidth` på 390px), alle statusverdier og knapper synlige.

### 3. «Rapporter» og «Godkjenning» lyste opp samtidig i navigasjonen

Både i sidebaren (desktop) og bunnnavigasjonen (mobil) ble to nav-elementer
markert som aktive samtidig på `/rapporter/godkjenning`: «Rapporter»
(`/rapporter`) matchet via sin egen `startsWith`-prefikssjekk, mens
«Godkjenning» (`/rapporter/godkjenning`) matchet eksakt — begge sjekket
uavhengig av hverandre. Reproduserbart både i `portal-layout.tsx` (sidebar)
og `mobile-bottom-nav.tsx` (bunnnav, der «Godkjenning» ligger under «Mer»).

**Fiks:** Sidebaren beregner nå ett felles «lengste prefiks vinner»-oppslag
(`activeNavPath`) på tvers av alle nav-elementer i stedet for at hvert element
sjekker seg selv uavhengig — dekker automatisk ethvert fremtidig
overlapp-tilfelle, ikke bare dette ene. Bunnnavigasjonen fikk en direkte
eksklusjon av `/rapporter/godkjenning` fra «Rapporter»-prefikset. Verifisert:
kun ett element aktivt per side, sjekket på `/dashboard`, `/rapporter`,
`/tiltaksleder` og `/rapporter/godkjenning`.

### 4. «Liste / Tidslinje / Kanban»-velgeren rant utenfor skjermen på mobil

I saksrapport-byggeren (`advanced-case-report-builder.tsx`, brukt av
`/case-reports`) manglet toolbar-raden som grupperer «Mine utkast»-nedtrekket
og visningsvelgeren `flex-wrap`. «Kanban»-knappen ble klippet av i høyre
kant på 390px. Fiks: `flex-wrap` lagt til. Verifisert: ingen overflow, alle
tre knappene synlige på egen rad under nedtrekket.

### 5. Feil topplinjetittel på `/case-reports`

Samme mønster som ble funnet og rettet i dashboard-QA-en (`/tiltaksleder`):
topplinjen viste «Dashboard» i stedet for sidens faktiske innhold, fordi
`/case-reports` er en CMS-konfigurerbar sidebar-oppføring
(`cms.tsx: { path: '/case-reports', label: 'Saksrapporter' }`) og derfor ikke
del av den statiske `baseNavItems`-listen som topplinje-tittelen slår opp i.
Siden er likevel svært aktivt brukt — direkte lenket fra dashbord-widgetene
for miljøarbeider, «Saker»-siden og onboarding-flyten.

**Fiks:** lagt til en liten fallback-tabell (`ORPHAN_ROUTE_LABELS`) for slike
sider som er reelle og nåbare, men ikke del av den statiske nav-listen.
Verifisert: viser nå «Saksrapporter».

---

## Det som ser bra ut

- **Ingen JS- eller API-feil** i noen av de 19 side/rolle/tema-kombinasjonene.
- **Mørk modus konsistent** i alle rapporteringssidene.
- **Tomtilstandene er informative** («Ingen rapporter ennå», «Ingen rapporter
  venter», med tydelige call-to-action-knapper).
- **Serverside-validering fungerer riktig**: «Send til godkjenning» er
  korrekt deaktivert før rapporten er lagret, og backend blokkerer innsending
  uten valgt sak (`sak_unassigned`) selv om dette ikke håndheves i UI-et før
  klikk — grei UX-forbedring å vurdere senere, men ingen funksjonell bug.
- **GDPR-varsling og sjekkliste** i rapportskjemaet er tydelig og godt
  plassert.
- **Rolledifferensiering** fungerer riktig: tiltaksleder ser en ekstra
  «Rapporter»-eksport-fane i saksrapport-byggeren som ikke vises for andre
  roller; `/rapporter/godkjenning` er korrekt rollesperret bak
  tiltaksleder+-roller.

## Skjermbilder

| Fil | Visning |
| --- | --- |
| `rapporter-liste-*` | `/rapporter` (listen), alle roller/temaer |
| `rapporter-ny-*` | `/rapporter/ny` (skjema), miljøarbeider, alle temaer/mobil |
| `rapporter-godkjenning-*` | `/rapporter/godkjenning`, tiltaksleder |
| `case-reports-*` | `/case-reports` (saksrapport-byggeren), alle roller |
| `admin-rapport-maler-*` | `/admin/rapport-maler`, alle temaer/mobil |

Skjermbildene i denne mappen er tatt **etter** fiksene over — se commit-
historikken på branchen for før/etter hvis du vil sammenligne. Merk: som i
dashboard-rapporten er skjermbildene full-side; faste elementer (bunnav på
mobil) kan se «avkuttet» ut midt i bildet — det er en artefakt av
full-side-skjermbilder, ikke en feil i appen.
