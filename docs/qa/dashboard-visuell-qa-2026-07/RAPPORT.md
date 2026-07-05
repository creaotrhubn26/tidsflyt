# Visuell QA av dashbordene — juli 2026

Gjennomgang av `/dashboard` (admin-, tiltaksleder- og miljøarbeider-visning) og
`/tiltaksleder`, i lys og mørk modus, på desktop (1440×900) og mobil (390×844).
Appen ble kjørt lokalt mot en frisk Postgres-database (alle migreringer + mock-data),
og skjermbildene i denne mappen ble tatt med Playwright/Chromium som dev-brukeren
(super_admin) med rolle-forhåndsvisning for de ulike visningene.

Konsoll, sidefeil og API-svar ble logget per visning: **ingen JS-feil, ingen
4xx/5xx fra API-et**. Én React-advarsel (nestet `<button>`, se funn 4).

---

## Blokkerende funn

### 1. `npm run dev` krasjer ved første sidelast (fikset i denne branchen)

`vite.config.ts` eksporterer en *funksjon* (`defineConfig(async ({ mode }) => …)`),
men `server/vite.ts` sprer eksporten direkte inn i `createViteServer({ ...viteConfig })`.
Å spre en funksjon gir et tomt objekt, så `root: client/` forsvinner — Vite leter da
etter `/src/main.tsx` i repo-roten, feiler, og den egendefinerte loggeren i
`server/vite.ts` kjører `process.exit(1)` på Vite-feil. Resultat: dev-serveren dør
på første forespørsel. Begge filene kom inn i commit `eabd050` (april 2026), så
dev-modus har vært ødelagt siden — dette brekker også Playwright-oppsettet i
`playwright.config.ts`, som starter `npm run dev` som webServer.

**Fiks (inkludert her):** `server/vite.ts` kaller nå config-funksjonen
(`command: "serve", mode: "development"`) før spredning.

---

## Bugs

### 2. «Hei, Maria!» — hardkodet navnefallback

`client/src/pages/dashboard.tsx:1424`:

```tsx
userName={user?.firstName || "Maria"}
```

Alle brukere uten fornavn (f.eks. dev-brukeren, e-post-innloggede uten profilnavn)
hilses med «Hei, Maria!» i miljøarbeider-mobilvisningen. Merk at linje 1097 i samme
fil gjør det riktig (`user?.firstName || undefined`).
Se `dashboard-worker-mobile-light.png`.

### 3. Valgt periodeknapp er en tom blå pille på mobil

I `client/src/components/dashboard/dashboard-hero.tsx` (to forekomster, ca. linje
209–210 og 388–389) skjules etiketten på mobil (`hidden sm:inline`), og det valgte
segmentets overlegg (`absolute inset-0 … bg-primary`) tegnes *oppå* ikonet fordi
tekst-spanen har `relative` (som løfter den over overlegget), mens `<Icon>` ikke
har det. Valgt segment («Denne uken») vises derfor som en tom blå pille uten ikon.
Se toppen av `dashboard-worker-mobile-light.png` og
`dashboard-tiltaksleder-mobile-light.png`. Fiks: legg `relative` på ikonet.

### 4. Nestet `<button>` i statusflisene i «Mine oppgaver»

`client/src/components/dashboard/dashboard-tasks.tsx`: hver statusflis er en
`<button>` (linje ~580), og når `hasItems` rendres en indre `<button>`
(«Lag oppgave fra dette», linje ~611) inne i den. Ugyldig HTML som gir
`validateDOMNesting`-advarsel i konsollen (reproduserbar på admin-dashbordet når
«Godkjenninger» > 0), uforutsigbar klikk-/tastaturoppførsel og problemer for
skjermlesere. Fiks: gjør fliskortet til en `div` med `onClick`/`role`, eller flytt
den indre handlingen ut av knappen.

### 5. Cookie-/analysebanner vises inne i innlogget app

På `/tiltaksleder` dukker samtykkebanneret «Analyse og innsikt for Tidum» opp —
teksten handler eksplisitt om «den offentlige Tidum-siden», men banneret dekker
store deler av det innloggede dashbordet (nesten hele skjermen på mobil, og
«Team»-panelet på desktop). Banneret vises ikke på `/dashboard`. Bør begrenses til
offentlige sider. (Skjermbildene her er tatt med samtykke forhåndssatt for å vise
innholdet bak.)

### 6. Feil sidetittel i topplinjen på `/tiltaksleder`

Topplinjen viser «Dashboard / Pålogget som systemadmin» selv om siden er
«Tiltaksleder-oversikt». Tittelen i topplinjen følger ikke ruten.
Se `tiltaksleder-page-desktop-light.png`.

---

## Mindre / kosmetiske funn

7. **Ukesintervall mangler måned på startdato:** «Denne uken (29–5 juli)» når uken
   krysser månedsgrense. `getPeriodLabel` i `dashboard-hero.tsx` formaterer start
   med kun `"d"`. Bør være f.eks. «29. juni–5. juli».
8. **KPI-tittel trunkeres på desktop (1440px):** «Rapporter mangler/…» i
   tiltaksleder-visningen. Full tekst («Rapporter mangler/venter») vises på mobil.
   Se `dashboard-tiltaksleder-desktop-light.png`.
9. **Undertittel kuttes uten ellipse på mobil:** «Status på tiltak, klientsaker og»
   (tiltaksleder-visning, mobil).
10. **Verktøylinjen bryter dårlig på mobil:** «Ny/Tiltak/Oppfølging»-knappen ender
    som en enslig, umerket «+»-knapp sentrert på egen rad under periodevelgeren.
11. **Desimaler på antall:** «0.0 / 15 saker», «0.0 / 1 saker» i «Mål og
    fremdrift» / «Min fremdrift». Antall saker bør ikke vises med én desimal.
12. **«Utkast i arbeid: 0» viser 100 % fylt fremdriftslinje** i «Min fremdrift»
    (worker desktop). Sannsynligvis invers metrikk («ingen utkast er bra»), men
    en full blå linje ved verdien 0 leses som feil.
    Se `dashboard-worker-desktop-light.png`.
13. **«Faglig logg»-tomtilstanden viser et halvgjennomsiktig eksempel**
    («Bruker registrerte 2.5 timer — nettopp») under teksten «Ingen aktivitet
    ennå» — kan leses som ekte data. Bør merkes tydeligere som eksempel eller
    fjernes.
14. **Duplisert status «Registrering pauset»** vises to ganger rett etter
    hverandre i worker-mobilvisningen (kortoverskrift + eget statuskort).
15. **Profilblokken i sidemenyen viser e-post på begge linjer** for brukere uten
    visningsnavn (samme rotårsak som funn 2: `firstName`/visningsnavn mangler
    fallback til `name`).
16. **Trendchip «— 0.0 %» vises i alle tomtilstander** på KPI-kortene — støy når
    det ikke finnes data å sammenlikne med; vurder å skjule chippen uten datagrunnlag.

---

## Det som ser bra ut

- **Mørk modus er gjennomført konsistent** i alle tre visningene — ingen
  kontrastproblemer eller «glemte» lyse flater funnet.
- **Tomtilstandene er gjennomgående vennlige og informative** («Alt under
  kontroll», «Ingen rapporter venter», forklarende undertekster).
- **Rollevisningene er tydelig differensiert** (admin/tiltaksleder/miljøarbeider)
  med egne KPI-sett og «Viser som …»-merking i topplinjen og profilblokken.
- `/tiltaksleder`-siden er ren og fungerer godt på mobil (kortene stables pent).
- Ingen API-feil eller JS-runtime-feil i noen av visningene.

## Skjermbilder

| Fil | Visning |
| --- | --- |
| `dashboard-admin-desktop-light.png` / `-dark.png` | `/dashboard` som admin, desktop |
| `dashboard-tiltaksleder-desktop-light.png` | `/dashboard` i institusjonsvisning, desktop |
| `dashboard-tiltaksleder-mobile-light.png` | `/dashboard` i institusjonsvisning, mobil |
| `dashboard-worker-mobile-light.png` / `-dark.png` | `/dashboard` som miljøarbeider, mobil |
| `dashboard-worker-desktop-light.png` | `/dashboard` som miljøarbeider, desktop |
| `tiltaksleder-page-desktop-light.png` / `-dark.png` | `/tiltaksleder`, desktop |
| `tiltaksleder-page-mobile-light.png` | `/tiltaksleder`, mobil |

Merk: skjermbildene er tatt i full sidehøyde; faste elementer (sidemeny,
bunnavigasjon på mobil) kan derfor se «avkuttet» eller feilplassert ut midt i
bildet — det er en artefakt av full-side-skjermbilder, ikke en feil i appen.
