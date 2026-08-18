# Fallgruver — rolle-/tilgangssystemet

Systemet er under bygging. Fallgruve 1 er bekreftet (funnet under
spec-selvgjennomgangen, før noe kode er skrevet). Resten er identifiserte
risikoer fra arkitekturvalgene, ikke ekte produksjonsincidenter ennå.

**Oppdater denne filen med ekte fallgruver etter hvert som de faktisk
oppstår under implementering og drift** — samme metode som
`bankid-oidc-norsk-eid`-skillens fallgruve-liste ble bygget opp fra reelle
feil, ikke skrevet på forhånd.

---

## 1. Dev-mode har ingen ekte bruker å slå opp `role_id` fra

**Status:** Bekreftet under design-selvgjennomgang, 18. august 2026 — fikset
i spec-en før implementering startet.

**Symptom (hvis ufikset):** Hele det interne adminpanelet stopper å virke i
lokal utvikling etter migrering til `hasPermission()`. Alt i produksjon
virker fint.

**Årsak:** `authenticateAdmin`s `isDevMode`-gren
(`server/smartTimingRoutes.ts:196`) hardkoder
`req.admin = { id: '1', email: 'dev@tidum.no', role: 'super_admin' }` uten
noe databaseoppslag. `role_id` ville vært `undefined`, og
`hasPermission(undefined, ...)` returnerer alltid `false` (fail-closed per
design).

**Fiks:** Dev-mode-grenen slår opp den migrerte `super_admin`-systemrollens
faktiske `id` (cachet i en modul-variabel, slått opp én gang, ikke per
request) og setter den som `req.admin.roleId` — samme «dev-mode har alltid
full tilgang»-prinsipp som resten av bypass-en.

**Regel:** enhver ny sjekk som leser et felt `authenticateAdmin` setter, må
verifiseres mot BÅDE JWT-grenen, sesjons-grenen OG dev-mode-grenen. Det er
tre forskjellige steder samme felt settes, og det er lett å oppdatere kun
to av dem.

---

## 2. (Risiko, ikke bekreftet) Migrering gir feil tilgang hvis seed-rekkefølgen er feil

**Symptom å se etter:** En migrert `vendor_admin`-bruker får 403 på en rute
de tidligere hadde tilgang til, eller — verre — en migrert bruker får
tilgang til noe de IKKE skulle ha.

**Sannsynlig årsak:** `UPDATE users SET role_id = ...`-migreringen
(migrasjonssteg 4 i spec-en) kjører før `role_permissions`-seed-steget er
fullført, eller seed-steget ga `vendor_admin`-systemrollen en tillatelse
den ikke skulle hatt (f.eks. `vendor.create`, som per spec kun
`super_admin` skal ha).

**Forebygging:** Kjør migreringstesten fra spec-en («Testing»-seksjonen) mot
et representativt fixture-sett FØR produksjonsmigrering — sammenlign
eksplisitt hvilke ruter en migrert bruker kan nå, før og etter.

---

## 3. (Risiko, ikke bekreftet) Gammel strengsjekk og ny `hasPermission()`-sjekk lever samtidig i samme rute

**Symptom å se etter:** En rute oppfører seg inkonsekvent — noen ganger
gammel logikk vinner, noen ganger ny, avhengig av hvilken sjekk står først
i handleren.

**Sannsynlig årsak:** Under migrering («én rute om gangen», se SKILL.md)
er det lett å legge til `hasPermission()`-sjekken uten å fjerne den gamle
`req.admin.role !== 'super_admin'`-sjekken i samme handler. Begge kjører
da, og feilen som oppstår avhenger av hvilken av dem returnerer først.

**Forebygging:** Hver migrerings-commit skal FJERNE den gamle sjekken i
samme endring den legger til den nye — aldri la begge stå «for
sikkerhets skyld». Diff-review bør alltid vise et minus for den gamle
linjen.

---

## 4. (Risiko, ikke bekreftet) Sletting av en rolle kaskaderer og tar bort tilgang uten varsel

**Symptom å se etter:** Brukere rapporterer plutselig 403 på ting som
fungerte i går, uten at noen migrerte eller endret deres egen konto.

**Sannsynlig årsak:** En rolle ble slettet fra admin-UI mens brukere
fortsatt hadde `role_id` satt til den. `ON DELETE CASCADE` på
`role_permissions` er riktig (fjerner tillatelses-koblingene), men
`users.role_id` bør IKKE tillate kaskade-sletting av selve rollen mens
brukere er tilknyttet — se «Feilhåndtering» i spec-en.

**Forebygging:** Slette-endepunktet for roller skal telle tilknyttede
brukere og blokkere med en tydelig feilmelding hvis tallet er > 0, aldri
kaskadere stille.
