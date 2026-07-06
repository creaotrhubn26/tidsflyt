# Visuell QA av Tid & fravær — juli 2026

> **Status:** Alle 3 funn under er rettet i denne branchen og verifisert
> visuelt/programmatisk mot kjørende app. Skjermbildene i denne mappen er
> tatt **etter** fiksene, bortsett fra der «før»-tilstanden er eksplisitt
> nevnt under funnet.

Gjennomgang av `/time` (timeføring), `/overtime` (overtid), `/leave`
(fravær), `/recurring` (faste oppgaver) og `/timesheets` (timelister) — i
lys/mørk modus, på desktop (1440×900) og mobil (390×844), for admin-,
tiltaksleder- og miljøarbeider-visning der aktuelt. I tillegg testet
interaktivt: «Ny søknad»-dialogen (fravær) og «Ny oppføring»-dialogen (faste
oppgaver).

Konsoll, sidefeil og API-svar ble logget per visning, samt automatisk
`document.documentElement.scrollWidth`-sjekk for horisontal overflow:
**ingen JS-feil, ingen 4xx/5xx fra API-et, ingen automatisk oppdaget
overflow** i noen av de 22 kombinasjonene. De to overflow-bugene under ble
funnet ved visuell inspeksjon av skjermbildene — den automatiske sjekken
fanget dem ikke opp fordi en overordnet container klipper overflyten i
stedet for å vise en scrollbar (samme klasse feil som ble funnet i
rapporteringsflyten tidligere på denne branchen).

---

## Bugs

### 1. «Hei, dev!» — hilsen viste rå e-post-prefiks

`time-tracking.tsx`: hilsenen (`greetingName`) falt tilbake til
`user.email.split("@")[0]` (og til slutt et hardkodet «Maria») når brukeren
mangler fornavn — nøyaktig samme bugklasse som ble funnet og rettet i
dashbord- og rapporteringsflyten tidligere på denne branchen, bare med en
ekstra e-post-fallback i mellomleddet. Viser nå bare «Hei!» uten navn.
Identitetslinjen «Miljøarbeider: dev» beholder e-post-fallbacken siden den
fyller en annen funksjon (vise hvem som er innlogget); den siste hardkodede
«Maria L.»-fallbacken er byttet til «Ukjent bruker».

### 2. «Oppfølging i dag: 08:00 - 16:00» var en hardkodet tekststreng

Samme fil: teksten ble vist uendret for **alle** brukere uansett om de
faktisk hadde registrert noe i dag — eller om de i det hele tatt hadde
tildelte caser (motsa direkte «Du har ingen tildelte caser ennå»-meldingen
rett over i samme skjermbilde). Beregner nå faktisk første-inn/siste-ut fra
dagens registreringer, med en ærlig tomtilstand («—» / «Ingen registrering i
dag») når det ikke finnes noen — samme mønster som brukes ellers i appen for
tomme datatilstander.

### 3. «Ny oppføring»-knappen ble klippet av på mobil (Faste oppgaver)

Header-raden på `/recurring` (tittel + «Generer nå» / «Ny oppføring») brukte
`flex justify-between items-center` uten `flex-wrap`, i motsetning til de
andre Tid & fravær-sidene (`overtime.tsx`, `leave.tsx`) som allerede bruker
det trygge `flex-col md:flex-row`-mønsteret. Resultat: «Ny
oppføring»-knappen rant utenfor høyre skjermkant på 390px uten synlig
scrollbar. Lagt til `flex-wrap` på begge nivåer i header-raden.

---

## Det som ser bra ut

- **Ingen JS- eller API-feil** i noen av de 22 side/rolle/tema-kombinasjonene.
- **Mørk modus konsistent** på alle fem sidene.
- **De to interaktive dialogene** («Ny søknad» for fravær, «Ny oppføring»
  for faste oppgaver) er velformaterte, fullstendige og fungerer uten feil —
  ingen overflow selv med mange felt (ukedag-checkbokser, tidsvelgere,
  gjentagelsesmønster).
- **Rolledifferensiering fungerer riktig**: tiltaksleder får ekstra
  «Godkjenning»-faner på både `/leave` og `/timesheets`, og en
  «Innstillinger»-knapp på `/overtime`; miljøarbeider og tiltaksleder ser
  begge sin egen personlige timeføringswidget.
- **Tomtilstandene er informative** («Ingen saldo for 2026. Initialiser
  feriesaldoer for året via admin.» — en tydelig, actionable melding for
  tiltaksleder i stedet for en forvirrende taus tomhet).
- **Serverside-logikk for overtid/fravær** («Hvordan det fungerer»-seksjonene)
  er godt forklart og placeringen er konsistent på tvers av sidene.

## Merk: mock-data i skjermbildene

`timesheets-tiltaksleder-*`-skjermbildene viser to innsendte timelister
(«mock-martin», «mock-sofia») — dette er testdata fra
`migrations/021_mock_workflow_data.sql`, som **ikke** er del av den
automatiske oppstarts-migrasjonslisten (kun migrasjon 036+ kjører
automatisk). Dataene finnes bare fordi jeg kjørte alle migrasjonsfiler manuelt
for å sette opp QA-sandkassen — de vil ikke dukke opp på en ekte fersk
database. Ikke en bug, bare en artefakt av testoppsettet.

## Skjermbilder

| Fil | Visning |
| --- | --- |
| `time-*` | `/time` (timeføring), alle roller/temaer/mobil |
| `overtime-*` | `/overtime` (overtid), miljøarbeider + tiltaksleder |
| `leave-*` | `/leave` (fravær), inkl. «Ny søknad»-dialogen |
| `recurring-*` | `/recurring` (faste oppgaver), inkl. «Ny oppføring»-dialogen |
| `timesheets-*` | `/timesheets` (timelister), miljøarbeider + tiltaksleder |

Som i de forrige QA-rapportene: skjermbildene er full-side, så faste
elementer (mobil bunnav) kan se «avkuttet» ut midt i bildet — det er en
artefakt av full-side-skjermbilder, ikke en feil i appen.
