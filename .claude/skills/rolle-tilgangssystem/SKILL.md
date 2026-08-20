---
name: rolle-tilgangssystem
description: Bruk denne når du bygger, migrerer eller feilsøker Tidum sitt dynamiske rolle- og tilgangssystem (roles/permissions/role_permissions, hasPermission()). Gjelder også når noe er galt i overgangen fra den gamle hardkodede shared/roles.ts-modellen — brukere som mister tilgang, dev-mode som stopper å virke, roller som ikke matcher gammel oppførsel etter migrering.
---

# Tidum: dynamisk rolle- og tilgangssystem

Dette systemet erstatter den hardkodede rollelisten i `shared/roles.ts` med
database-rader super admin kan redigere, uten kodeendring eller deploy.
Bygges i faser — se
`docs/superpowers/specs/2026-08-18-rolle-tilgangssystem-design.md` for full
spec. Denne skillen dekker fase 1: det interne Tidum-adminpanelet
(`authenticateAdmin`-ruter i `server/smartTimingRoutes.ts`).

**Systemet er under bygging da denne skillen ble skrevet.** Fallgruvene i
`references/fallgruver.md` er derfor delt i to: én bekreftet under
design-selvgjennomgangen (dev-mode-hullet), resten er risikoer identifisert
på forhånd fra arkitekturvalgene — ikke ekte produksjonsincidenter ennå.
Oppdater den filen med ekte fallgruver etter hvert som de faktisk oppstår
under implementering, akkurat som `bankid-oidc-norsk-eid`-skillen ble bygget
opp fra reelle feil.

## Grunnmodellen på ett minutt

To ting som er lett å forveksle:

- **Tillatelser** (`permissions`-tabellen): en FAST katalog, definert av
  utviklere i `server/lib/permission-catalog.ts`. En admin kan aldri
  oppfinne en ny tillatelse — koden må faktisk sjekke den et sted først.
- **Roller** (`roles`-tabellen): DYNAMISK. Super admin oppretter, redigerer
  og sletter disse fritt, og bestemmer hvilke tillatelser hver rolle har
  via `role_permissions`.

Hvis noe føles feil under implementering, spør: hører dette til i
tillatelseskatalogen (kode) eller i en rolle (data)? De to skal aldri
blandes.

## To parallelle systemer i overgangsperioden

`users.role` (fri tekst, leses av portalen sin `canManageRole()`) og
`users.role_id` (leser det nye systemet, kun brukt av det interne
adminpanelet i fase 1) lever side ved side. En bruker med
`role = "vendor_admin"` OG `role_id` satt til den migrerte
`vendor_admin`-rollen er korrekt, ikke en motsigelse. Portalen og det
interne adminpanelet er fortsatt to uavhengige tilgangssystemer til fase 2
migrerer portalen også.

## Rekkefølgen du bør bygge i

1. **Datamodell + seed** — `permissions`, `roles`, `role_permissions`,
   `PERMISSION_CATALOG` i kode, migrer inn `super_admin`/`vendor_admin` som
   forhåndsutfylte roller. Verifiser migrering FØR du rører noen ruter —
   se sjekklisten i `references/fallgruver.md`.
2. **`hasPermission()`-motoren** — fail-closed, cachet per request.
3. **`authenticateAdmin`-utvidelsen** — sett `req.admin.roleId`. Håndter
   dev-mode-grenen samtidig, ikke som en separat oppfølging.
4. **Migrer én rute om gangen** fra `req.admin.role !== 'super_admin'` til
   `hasPermission(req.admin.roleId, "...")`. Ikke migrer alle på én gang —
   én rute per commit gjør det lett å se hvilken migrering som eventuelt
   endret oppførsel.
5. **Admin-UI** (`client/src/pages/admin-roller.tsx`) — bygg etter at minst
   én rute faktisk bruker motoren i praksis, ikke før.

## Når noe er galt

| Symptom | Se etter |
|---|---|
| Dev-mode/lokal utvikling stopper å virke etter migrering | `authenticateAdmin`s `isDevMode`-gren mangler `roleId` — se fallgruve 1 |
| En migrert super_admin-bruker får 403 på en rute som virket i går | Sjekk at ruten faktisk ble migrert til riktig `permissionKey`, og at seed-steget ga `super_admin`-rollen den tillatelsen |
| Ny rolle uten forventet tillatelse får likevel tilgang | Sjekk om ruten fortsatt har den gamle strengsjekken liggende IGJEN i tillegg til `hasPermission()` — begge kan feilaktig stå samtidig under migrering |
| Sletting av en rolle tar ned tilgangen for brukere ingen visste brukte den | Se «Feilhåndtering»-sjekk i spec-en — sletting skal blokkeres når brukere er tilknyttet, ikke kaskadere |

## Referansefiler

- `references/fallgruver.md` — identifiserte risikoer og (etter hvert)
  ekte fallgruver fra implementeringen
