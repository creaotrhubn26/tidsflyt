---
name: norsk-sprakvask
description: Bruk denne når du skriver, endrer eller gjennomgår norsk brukervendt tekst i Tidum — landingsside, offentlige sider, e-poster, PDF-er, varsler, feilmeldinger, rapportmaler. Dekker skrivefeil, grammatikk, formuleringer, binde-s og terminologi, med Språkrådet som kilde. Gjelder også når noe «ser rart ut» språklig, eller når du skal sjekke om et fagbegrep skrives riktig.
---

# Norsk språkvask i Tidum

Tidum selges til norske kommuner og omsorgsvirksomheter. Brukervendt tekst
leses av saksbehandlere, ledere og — via innsyns-PDF-er og varsler — av
private parter. Språkfeil i den teksten koster troverdighet i en
anbudskonkurranse, og feil fagterminologi ser ut som manglende domenekunnskap.

## Grunnregelen: slå opp, ikke gjett

**Ikke stol på hukommelsen for norsk rettskriving og fagterminologi.** Dette
er domenet der modell-hukommelse er svakest, og feilene er selvsikre.

Slå opp når du er det minste usikker:

| Spørsmål | Kilde |
|---|---|
| Rettskriving, binde-s, sammensetninger | [Språkrådets svardatabase](https://sprakradet.no/svardatabase/) |
| Ordbøker (bokmål/nynorsk) | [ordbokene.no](https://ordbokene.no/) |
| Offisielle lovnavn og korttitler | [lovdata.no](https://lovdata.no/) |
| Fagterminologi barnevern | [Bufdir](https://www.bufdir.no/) |

Verifiser med `WebSearch`/`WebFetch` og oppgi kilden i commit-meldingen når
du endrer terminologi. En påstand om norsk rettskriving uten kilde er en
gjetning.

## Arbeidsflyt ved gjennomgang

1. **Finn all brukervendt tekst** i filene du endrer — ikke bare det som er
   åpenbart. Tekst gjemmer seg i `alt`-attributter, `aria-label`, `title`,
   `placeholder`, toast-meldinger, e-postmaler, PDF-generatorer og
   seed-data (`server/seed/`).
2. **Les linje for linje.** Stikkprøver finner ikke feil som «Norsk språk -
   norsk flagg» (en utviklerlabel som lekket inn i en overskrift) — den satt
   i produksjon til noen faktisk leste hver linje.
3. **Sjekk konsistens på tvers**, ikke bare i én fil: samme begrep skal
   skrives likt overalt. `grep -roh "<begrep>[a-zæøå]*" client/src server/ shared/ | sort | uniq -c`
   avslører raskt at et begrep har to former.
4. **Kontroller den redigerte teksten på nytt, med friske øyne.** Dette er
   ikke valgfritt. Rettelser skaper nye feil, og du ser dem ikke selv rett
   etter at du har skrevet dem — du leser det du mente, ikke det som står.

   Faktiske eksempler fra denne kodebasen: «hvilke prioriteringer som
   styrte» manglet objekt, ble rettet til «som styrte forslaget» — og da
   sto «forslaget» to ganger i samme setning. «Da gjelder den bare der»
   (stedsadverb om en person) ble rettet til «bare for den ene» — som ga
   tvetydig referanse, siden både «regel» og «ansatt» er felleskjønn.
   Ingen av dem ble oppdaget av den som rettet.

   Bruk en subagent til kontrollrunden, med teksten *etter* redigering.
   Kostnaden er ett kall; alternativet er at feilen står i produksjon.
5. **Verifiser** med `tsc` + `npm run build` — tekstendringer i JSX kan
   bryte bygget hvis anførselstegn eller entiteter blir feil. Er teksten
   seed-data, sjekk også at den faktisk når ut: hent den fra API-et og let
   etter de rettede formuleringene.

## Verifiserte regler for dette prosjektet

Disse er slått opp mot kilde, ikke gjettet:

### barnevernstjeneste — med binde-s

Skriv **barnevernstjeneste(n)**, ikke «barneverntjeneste».
[Språkrådet](https://sprakradet.no/spraksporsmal-og-svar/barnevernstjeneste-eller-barneverntjeneste/):
Tanums store rettskrivningsordbok foreskriver binde-s i sammensetninger med
`barnevern`. Gjeldende lov (i kraft 1.1.2023) heter **barnevernsloven** med s
— 1992-loven het «barnevernloven» uten.

Nyanse fra samme kilde: «barneverntjeneste» uten s *kan neppe kalles feil*,
og formen dominerte skriftlig fram til nylig. Men velg s-formen for
konsistens med lovnavnet, og hold den konsekvent i hele kodebasen.

### KI, ikke AI

Skriv **KI** (kunstig intelligens). Språkrådet kåret
[«KI-generert» til årets ord](https://sprakradet.no/aktuelt/arets-ord-er-ki-generert/);
KI brukes mer enn AI i norske tekster, i motsetning til nabolandene som
beholdt AI. Gjelder også sammensetninger: `KI-basert`, `KI-turnus`.

### Desimalkomma

Norsk bruker **komma**: `37,5 t`, ikke `37.5 t`. Sjekk særlig tall som
kommer fra kode eller er kopiert fra engelske kilder. I klient-kode
finnes `nkomma()`-hjelperen i `client/src/pages/turnus.tsx` som mønster.

### Lovnavn med liten forbokstav

`arbeidsmiljøloven`, `barnevernsloven`, `forvaltningsloven` — små
bokstaver midt i setning, som vanlige substantiv.

## Feilklasser å lete etter

Rangert etter hvor ofte de faktisk dukket opp i denne kodebasen:

1. **Engelsk som lekker inn** — `Custom`-badge blant norske etiketter,
   `Vendor admin`/`Super admin` blant `Miljøarbeider`/`Tiltaksleder`,
   engelsk desimalpunktum. Oppstår når kode-identifikatorer brukes som
   visningstekst.
2. **Feilaktig bindestrek i sammensetninger** — `hjelpemiddel-teknologi`,
   `tredjeparts-editoren`, `tastaturnavigasjons-mangler`. Norsk skriver
   sammensatte ord i **ett ord**; bindestrek er unntaket (forkortelser,
   egennavn, tre like konsonanter). Motsatt feil — særskriving («røyk
   fritt» for «røykfritt») — kommer av engelsk påvirkning.
3. **Inkonsekvent terminologi** — `org.nr` vs `org.nummer` i samme skjema.
   Velg én form, bruk den overalt.
4. **Manglende hjelpeverb** — «Tooltips lagt til som del av oppgraderingen»
   mangler «er». Vanlig når en punktliste-formulering gjenbrukes som
   hovedsetning.
5. **Løse pronomen og partisipp** — «forklarer hvorfor» (hvorfor *hva*?),
   eller et partisipp som grammatisk peker på feil subjekt. Les setningen
   høyt: hvis du må gjette hva et ord viser til, skriv om.
6. **Negasjon som treffer feil** — «er sjelden vanskelig fordi noen mangler
   vilje» sier bokstavelig at noe *sjelden er vanskelig*. Negasjonen slår ut
   på hele setningen, ikke på årsaken. Stod i åpningssetningen på en
   bloggartikkel og påsto det motsatte av poenget.
7. **Partikkelverb med motsatt betydning** — «gis til slutt opp til manuell
   oppfølging» («gi opp» = forlate, ikke overlate); «motoren regner med dem»
   («regne med» = forvente, ikke ta med i beregningen); «stille om reglene».
   Disse leses riktig av forfatteren og galt av alle andre.
8. **Setninger som må leses to ganger** — «genererer forslag med CP-SAT,
   vekter ønsker, rettferdighet …»: `vekter` leses som substantiv i
   oppregningen til man skjønner det er verb. Del setningen.
9. **Gjentakelse innenfor én setning** — «Et *forslag* … blir aldri
   *foreslått*», «avvik *ved avtale* … *ved skriftlig avtale*», dobbelt
   «med». Oppstår særlig når man retter noe annet i samme setning.
10. **Haltende metaforer** — «Regnearket klarer ikke å holde alt i *hodet*»;
    «mennesker *står* i en floke av tråder». Sjekk at bildet henger sammen
    med det du nettopp skrev.
11. **Utellelige substantiv med artikkel** — «en ekstra finpuss».
12. **Hardkodede årstall** — `© 2025`. Bruk `{new Date().getFullYear()}`.
13. **Feil preposisjon** — «gjennomgang på fargekontrast» skal være «av»
   eller omformuleres.

## Prosjektkonvensjoner

- **Tankestrek:** landingssiden bruker em-dash (`—`) konsekvent i brødtekst.
  Følg den etablerte konvensjonen i filen du endrer framfor å innføre en
  avvikende variant. Sjekk med `grep -c "—" <fil>` mot `grep -c "–" <fil>`.
- **CMS-tekst:** noen offentlige sider henter tekst fra CMS med innebygde
  standardverdier (`pricing.tsx` bruker `cms?.subtitle ?? "..."`). Retter du
  standardverdien, kan en lagret CMS-rad fortsatt vise gammel tekst —
  nevn det for brukeren.
- **Brukervendte filer utenfor `client/src/pages/`:**
  `server/seed/rapport-templates.ts`, `server/lib/*-pdf.ts`,
  `server/lib/email-*.ts`, `server/routes/*-routes.ts` (dokumenttitler).
  Disse glemmes lett — innsyns-PDF-en går til private parter.

## Parallell gjennomgang av flere filer

Når flere sider skal gjennomgås, kjør én subagent per fil i parallell med
en presis instruks: *les hele filen linje for linje, rapporter kun reelle
funn som linjenummer + eksakt sitat + forslag, ikke stilistiske
preferanser*. Rett funnene selv etterpå — subagentene skal rapportere, ikke
endre, så du kan vurdere hvert forslag mot kilde før det går inn.
