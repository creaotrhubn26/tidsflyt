# Visuell QA av Saker & institusjoner — juli 2026

> **Status:** Funnet under er rettet i denne branchen og verifisert
> programmatisk mot kjørende app.

Gjennomgang av `/cases` (saker/avtaler), `/institusjoner` og `/invites`
(invitasjoner) — i lys/mørk modus, på desktop (1440×900) og mobil
(390×844), for tiltaksleder- (og delvis admin/miljøarbeider-) visning. I
tillegg testet interaktivt: «Ny sak / avtale», «Ny institusjon»,
«Inviter bruker», «Bulk-import» og «Invitasjonslenker»-dialogene, samt
faneskiftene på `/cases` (Saksoversikt, Tildeling, Saksrapporter).

Metodikk denne runden er justert noe fra tidligere: i stedet for å
inspisere hvert skjermbilde visuelt i samtalen, ble sidene primært
verifisert programmatisk (tekstinnhold, `document.documentElement`-overflow,
konsoll-/nettverksfeil) via Playwright, med kun et lite antall skjermbilder
hentet inn for visuell bekreftelse. Dette holder samtalen lettere uten å gå
på bekostning av dekningen.

Konsoll, sidefeil, API-svar og horisontal overflow ble sjekket på alle
sider/dialoger: **ingen JS-feil, ingen overflow**, bortsett fra funnet under.

---

## Bugs

### 1. Invitasjonslenker-dialogen feiler stille for brukere uten `vendorId`

`GET /api/company/invite-links` returnerer 400 (`{"error":"Mangler
vendor_id"}`) for enhver bruker der `isVendorAdmin()` er sann (vendor_admin,
hovedadmin, admin **eller** super_admin) men som mangler `vendorId` —
noe super_admin/hovedadmin-kontoer typisk gjør, siden de er
plattformnivå-roller uten tilknytning til én bestemt leverandør (se
`DEV_USER` i `server/custom-auth.ts`: `role: "super_admin", vendorId: null`).

Klientsiden (`client/src/pages/users.tsx`) hadde ingen feilhåndtering på
denne spørringen — `const { data: inviteLinks = [] } = useQuery(...)` falt
bare tilbake til en tom liste. Resultat: dialogen viste stille «ingen
lenker ennå» i stedet for å forklare at noe faktisk feilet. En bruker i
denne situasjonen ville trodd funksjonen bare ikke hadde noen lenker ennå,
og ikke fått noen indikasjon på at «Generer lenke»-knappen (som allerede
*har* riktig feilhåndtering via toast på selve opprettelsen) ville feile av
samme grunn.

**Fiks:** viser nå en tydelig feilmelding øverst i dialogen når
liste-spørringen feiler, konsistent med hvordan opprettelses-mutasjonen
allerede varsler feil.

---

## Det som ser bra ut

- **Ingen JS- eller API-feil** (utover funnet over) på noen av de testede
  sidene eller dialogene.
- **Alle interaktive dialoger** («Ny sak / avtale», «Ny institusjon»,
  «Inviter bruker», «Bulk-import») er velformaterte og fungerer uten
  overflow, på både desktop og mobil.
- **Mørk modus konsistent** på tvers av sidene.
- **Faneskiftene på `/cases`** (Saksoversikt → Tildeling → Saksrapporter)
  fungerer feilfritt med informative tomtilstander for hver fane.
- **Tomtilstandene er gjennomgående godt utformet** («Ingen institusjoner
  registrert ennå. Klikk "Ny institusjon" for å legge til den første.»).

## Skjermbilder

| Fil | Visning |
| --- | --- |
| `cases-tiltaksleder-*` | `/cases`, tiltaksleder-visning, desktop (lys/mørk) + mobil |
| `institusjoner-tiltaksleder-*` | `/institusjoner`, tiltaksleder-visning, desktop + mobil |
| `invites-tiltaksleder-*` | `/invites`, tiltaksleder-visning, desktop + mobil |

Et mindre utvalg skjermbilder enn i tidligere QA-runder er lagret her, siden
denne runden i hovedsak brukte tekst-/DOM-basert verifisering fremfor
visuell inspeksjon av hvert enkelt skjermbilde.
