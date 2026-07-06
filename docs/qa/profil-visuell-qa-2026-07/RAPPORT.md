# Visuell QA av Profil/innstillinger — juli 2026

> **Status:** Funnet under er rettet i denne branchen og verifisert
> programmatisk mot kjørende app.

Gjennomgang av `/profile` (og regresjonssjekk av `/settings`, som rendrer
identisk komponent) — i lys/mørk modus, på desktop og mobil, for admin-,
tiltaksleder- og miljøarbeider-visning. Testet interaktivt: «Rediger
profil» (inline redigeringsmodus) og GDPR-seksjonen («Eksporter»,
«Slett konto»).

Metodikk: primært tekst-/DOM-basert programmatisk verifisering
(innhold, overflow-sjekk, nettverksfeil) via Playwright, med et lite antall
skjermbilder for visuell bekreftelse av mørk modus.

Ingen JS-feil, ingen overflow, i noen av de testede kombinasjonene.

---

## Bugs

### 1. Feil topplinjetittel og manglende sidebar-aktiv-status på `/profile`

Samme mønster som ble funnet og rettet for `/case-reports` tidligere på
denne branchen: `/profile` er ikke i den statiske `baseNavItems`-listen i
`portal-layout.tsx` (kun `/settings` — «Innstillinger» — er det, selv om
begge ruter rendrer identisk `Profile`-komponent per `App.tsx`). Topplinjen
viste derfor «Dashboard» i stedet for «Profil», og ingen sidebar-lenke ble
markert som aktiv når man befant seg på `/profile` — som man gjør etter å ha
klikket «Rediger profil» eller «Min profil» fra «Kom i gang med
Tidum»-onboardingen (som navigerer direkte til `/profile`).

**Fiks:** lagt til `/profile → "Profil"` i det eksisterende
`ORPHAN_ROUTE_LABELS`-oppslaget for topplinjetittelen, og en alias i
`activeNavPath` som gjør at `/profile` behandles som `/settings` i
sidebar-treffet. Verifisert: topplinjen viser nå «Profil», sidebaren
markerer «Innstillinger», og `/settings` fortsetter å fungere uendret (ingen
regresjon).

---

## Ikke en bug: `/api/me/export` returnerer 404 i QA-sandkassen

GDPR-eksportknappen («Last ned dine data») peker på `/api/me/export`, som i
denne sandkassen returnerer 404 «Bruker ikke funnet». Rotårsak: dev-modusens
`DEV_USER` (i `server/custom-auth.ts`) er et rent minne-objekt som aldri
persisteres til `users`-tabellen (som er tom, 0 rader, i denne sandkassen).
Endepunktet slår opp brukeren i databasen via `req.user.id`, noe som er
korrekt oppførsel — ekte innloggede brukere (via OAuth) har alltid en
tilhørende rad i `users`. Ikke rettet, siden det ikke er en applikasjonsbug.

---

## Det som ser bra ut

- **Ingen JS- eller API-feil** (utover den forklarte sandkasse-artefakten)
  på noen av de testede rollene/temaene/viewportene.
- **«Rediger profil»** bytter korrekt til inline redigeringsmodus med
  «Avbryt»-knapp og oppdatert hjelpetekst.
- **«Slett konto»** bruker en native `window.prompt()`-bekreftelse
  («Skriv "SLETT" for å bekrefte») — en bevisst høy terskel for en
  destruktiv handling, fungerer som forventet.
- **Mørk modus konsistent** på hele siden.
- **Siden er organisert i tydelige seksjoner** (Kontaktinformasjon,
  Preferanser, Forslag, Forslagseffekt, Team-standard for forslag,
  Integrasjoner, Varsler, GDPR) med god rollefiltrering — «Team-standard for
  forslag» og lignende admin-seksjoner er kun synlige for aktuelle roller.

## Skjermbilder

To skjermbilder er lagret her for visuell bekreftelse (mørk modus,
miljøarbeider-visning) — de fleste sidene/tilstandene i denne runden ble
verifisert programmatisk fremfor via skjermbilder i samtalen.
