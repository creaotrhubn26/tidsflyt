# Dynamisk rolle-/tilgangssystem — fase 1.6 (portalens canManageRole/canManageUsers)

## Bakgrunn og mål

Fase 1 og 1.5 bygde et dynamisk, databasedrevet tillatelsessystem
(`tidum_permissions`/`tidum_roles`/`tidum_role_permissions` + `hasPermission()`)
for det interne adminpanelet. Begge fase-spec-ene satte eksplisitt
portalens `canManageRole`/`canManageUsers` (`shared/roles.ts`) utenfor
omfang, med samme ordlyd: "egen spec senere."

`canManageRole`/`canManageUsers` styrer i dag hvem som kan invitere,
redigere rolle på, og slette leverandør-/selskaps-brukere
(`tidum_company_users`) — drevet av en hardkodet, statisk
rangordnings-tabell (`MANAGEABLE_BY_ROLE`, `shared/roles.ts:52-73`) med
6 forvalter-roller (`super_admin`, `hovedadmin`, `vendor_admin`,
`tiltaksleder`, `teamleder`, `case_manager`), hver med en fast liste over
hvilke av de 10 rollene (`TIDUM_ROLES`) de kan tildele/administrere.

Målet med denne fasen: erstatte den hardkodede tabellen med en
databasedrevet rangordning på `tidum_roles`, uten å endre eksisterende
oppførsel, og uten å røre `users.role`/`tidum_company_users.role` (begge
forblir tekstkolonner, som tidligere spec-er krevde).

## Global Constraints

- `users.role` og `tidum_company_users.role` er TEKST-kolonner og forblir
  det. Denne fasen legger IKKE til `role_id`-kobling for selskaps-/
  portal-brukere — rang slås opp på rollenavn (streng), ikke FK.
- Alle 10 roller i `TIDUM_ROLES` (`shared/roles.ts:1-12`) må ha en rad i
  `tidum_roles` med korrekt rang før noen kode leser derfra — kun 2 av 10
  (`super_admin`, `vendor_admin`) finnes der i dag.
- Dagens EKSAKTE hierarki-oppførsel fra `MANAGEABLE_BY_ROLE` skal bevares
  bit-for-bit — dette er en mekanisk migrering av datakilde, ikke en
  policy-endring. `tiltaksleder`/`teamleder`/`case_manager` er likestilte
  (samme rang) og skal fortsatt ikke kunne administrere hverandre.
- `resolveActorRoleForCompany()` (`server/smartTimingRoutes.ts:118-139`)
  endres IKKE — den returnerer fortsatt en rolle-streng (enten fra
  aktørens egen admin-rolle, eller slått opp fra
  `tidum_company_users.role` for gjeldende selskap). Kun det som gjøres
  MED strengen etterpå (rang-oppslag i stedet for statisk tabell-oppslag)
  endres.
- Ingen endring i `hasPermission()`, `PERMISSION_CATALOG`, eller det
  interne adminpanelets eksisterende `role.manage`-baserte flyt
  (`admin-roller.tsx`). Dette er et parallelt, rangbasert system for et
  annet formål (selskaps-hierarki, ikke binære tillatelser) — ikke en
  utvidelse av `PERMISSION_CATALOG`.

## A) Datamodell: rang på `tidum_roles`

**Migrasjon** (ny fil `migrations/058_role_hierarchy_rank.sql` — 057 er
høyeste eksisterende nummer per skrivende stund; verifiser dette ikke har
endret seg før implementering):

1. `ALTER TABLE tidum_roles ADD COLUMN IF NOT EXISTS rank INTEGER NOT NULL DEFAULT 0`.
2. Seed/oppdater (idempotent `INSERT ... ON CONFLICT (scope, vendor_id, name) DO UPDATE SET rank = EXCLUDED.rank`, samme mønster som migrasjon 054) alle 10 systemroller med `scope = 'global'`, `is_system_default = true`, og rang som speiler `MANAGEABLE_BY_ROLE` eksakt:

| Rolle | Rang | Kan i dag administrere (fra `MANAGEABLE_BY_ROLE`) |
|---|---|---|
| `super_admin` | 90 | alle 9 andre |
| `hovedadmin` | 80 | `vendor_admin`, `tiltaksleder`, `teamleder`, `case_manager`, `miljoarbeider`, `member`, `user` |
| `vendor_admin` | 70 | `tiltaksleder`, `teamleder`, `case_manager`, `miljoarbeider`, `member`, `user` |
| `tiltaksleder` | 60 | `miljoarbeider`, `member`, `user` |
| `teamleder` | 60 | `miljoarbeider`, `member`, `user` |
| `case_manager` | 60 | `miljoarbeider`, `member`, `user` |
| `miljoarbeider` | 0 | (ingen) |
| `prototype_tester` | 0 | (ingen) |
| `member` | 0 | (ingen) |
| `user` | 0 | (ingen) |

Rangtallene (90/80/70/60/0) er vilkårlige men monotont fallende og med
riktige "hull" — verifiseres ikke mot et eksakt tall, men mot at
`target.rank < actor.rank` gjenskaper `MANAGEABLE_BY_ROLE` nøyaktig for
alle 100 (10×10) kombinasjoner (se Testing).

`hovedadmin`/`tiltaksleder`/`teamleder`/`case_manager`/`miljoarbeider`/
`prototype_tester`/`member`/`user` legges til `tidum_roles` for første
gang av denne migrasjonen — sjekk om noen av disse allerede har blitt
opprettet manuelt før migrasjonen skrives (usannsynlig, men verifiser
mot ekte database før kjøring, samme forsiktighet som
tabell-omdøpings-initiativet lærte oss).

## B) Server-side: rangbasert erstatning

**Nye funksjoner** i `server/lib/permissions.ts` (samme fil som
`hasPermission()`, samme stil — fail-closed, valgfri per-request cache):

```ts
async function getRoleRank(roleName: string, cache?: Map<string, number>): Promise<number>
// SELECT rank FROM tidum_roles WHERE scope='global' AND name=$1 AND is_system_default=true
// Fail-closed: ukjent rolle eller DB-feil => rang -1 (kan aldri administrere noe, aldri bli administrert av rang 0)

async function canManageRoleDynamic(actorRoleName: string, targetRoleName: string, cache?: Map<string, number>): Promise<boolean>
// return (await getRoleRank(targetRoleName, cache)) < (await getRoleRank(actorRoleName, cache))
// OBS: rang -1 (ukjent rolle) < rang 0 (laveste kjente) er TRUE i tall,
// men skal aldri kunne administreres eller administrere noe — legg inn
// eksplisitt guard: ukjent aktør ELLER ukjent mål => false.

async function canManageUsersDynamic(actorRoleName: string, cache?: Map<string, number>): Promise<boolean>
// return (await getRoleRank(actorRoleName, cache)) > 0
```

**Kallsteder som erstattes** (import fra `server/lib/permissions.ts` i
stedet for `shared/roles.ts`, funksjonene blir `await`-et):

- `server/smartTimingRoutes.ts:120` (`resolveActorRoleForCompany`s
  interne `canManageUsers`-sjekk)
- `server/smartTimingRoutes.ts:2254, 2258` (`POST /api/company/users`)
- `server/smartTimingRoutes.ts:2337, 2362` (`POST /api/company/users/bulk`)
- `server/smartTimingRoutes.ts:2421, 2427` (`PATCH /api/company/users/:id`)
- `server/smartTimingRoutes.ts:2484` (`DELETE /api/company/users/:id`)
- `server/routes.ts:4367, 4380` (`GET`/`PATCH /api/suggestion-team-defaults`
  — disse leser `req.user.role` direkte, ikke via
  `resolveActorRoleForCompany`; erstatt kun selve
  `canManageUsers(role)`-kallet med `canManageUsersDynamic(role)`, la
  resten av lesingen være som den er)

En per-request `Map`-cache opprettes i hver rute-handler (samme mønster
som `hasPermission()`s eksisterende kallsteder) for å unngå gjentatte DB-
kall når flere sjekker skjer i samme request (f.eks. bulk-import-loopen).

## C) Nytt endepunkt: hvilke roller kan aktøren tildele

```
GET /api/company/users/manageable-roles?company_id=<id>
```

Auth: `authenticateAdmin` (samme som de andre company-user-rutene).
Aktør-rolle løses identisk til de andre rutene:
`resolveActorRoleForCompany(req, companyId)`.

Respons: `{ roles: string[] }` — listen over rollenavn (fra
`TIDUM_ROLES`) hvor `canManageRoleDynamic(actorRole, role)` er sann.
Beregnes ved å hente aktørens rang én gang og filtrere `TIDUM_ROLES` mot
alle rollers rang i én batch-spørring (unngå N+1 — hent alle 10 rollers
rang i én `SELECT ... WHERE name = ANY($1)`).

**Klient**: `client/src/pages/users.tsx:292` — `allowedInviteRoles`
bytter fra lokal `canManageRole`-filtrering til å bruke
`GET`-resultatet, hentet (React Query, samme mønster som resten av
filen) når inviter-dialogen åpnes, med `company_id` fra gjeldende
kontekst.

## Feilhåndtering

- `getRoleRank` fail-closed (ukjent rolle/DB-feil → rang -1, aldri
  administrerbar, kan aldri administrere) — samme filosofi som
  `hasPermission()`.
- Det nye endepunktet returnerer `{ roles: [] }` (ikke en feil) hvis
  aktørens rang ikke kan slås opp — inviter-dialogen viser da ingen
  rolle-alternativer i stedet for å krasje.
- Ingen endring i eksisterende 403-feilmeldinger (`"Rollen X kan ikke
  administrere Y"` osv.) — samme tekst, ny datakilde bak sjekken.

## Testing

- **Hierarki-parity-test**: for alle 100 (10 aktør × 10 mål)
  kombinasjoner, `canManageRoleDynamic(a, b)` (mot en test-seedet
  `tidum_roles` med rangene fra tabellen over) skal returnere EKSAKT
  samme verdi som dagens `canManageRole(a, b)` fra `shared/roles.ts`.
  Kjøres som én parametrisert test, ikke 100 separate.
- **Endepunkt-test**: `GET /api/company/users/manageable-roles` for minst
  3 aktør-roller (en topprolle, en midtre, en bunnrolle) returnerer
  forventet rolleliste.
- **Regresjon på eksisterende ruter**: alle eksisterende
  `POST/PATCH/DELETE /api/company/users*`-tester skal fortsatt bestå
  uendret (samme 403-oppførsel, ny mekanisme bak).
- **`resolveActorRoleForCompany`s to grener**: én test der aktøren er en
  intern admin (rolle fra `req.admin.role`), én der aktøren er en
  selskaps-bruker med rolle kun i `tidum_company_users` — begge skal gi
  korrekt rang-basert resultat.

## Ikke i omfang (denne fasen)

- Vendor-scopede egendefinerte roller (`tidum_roles.scope='vendor'`
  forblir ubrukt).
- Migrering av `users.role`/`tidum_company_users.role` til `role_id`-FK.
- Sletting av `shared/roles.ts`s gamle `canManageRole`/`canManageUsers` —
  vurderes etter at alle kallsteder er migrert og verifisert i produksjon
  en stund; kan gjøres i en liten oppfølgings-PR, ikke del av denne
  planen.
- Endring av selve `TIDUM_ROLES`-listen (nye roller, fjernede roller).
- Klient-side caching/optimalisering av det nye endepunktet utover
  standard React Query-oppførsel allerede i bruk i filen.
