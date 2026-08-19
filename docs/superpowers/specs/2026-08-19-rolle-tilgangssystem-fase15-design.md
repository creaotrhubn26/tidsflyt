# Dynamisk rolle-/tilgangssystem — fase 1.5 (rolletildeling + systemrolle-redigering)

## Bakgrunn og mål

Fase 1 (`docs/superpowers/specs/2026-08-18-rolle-tilgangssystem-design.md`,
implementert og merget via PR #16) bygde motoren: `hasPermission()`,
tillatelseskatalogen, `tidum_roles`/`tidum_permissions`/`tidum_role_permissions`,
og migrerte `authenticateAdmin` + en håndfull ruter til å sjekke `role.manage`
og andre tillatelser via databasen i stedet for hardkodede rollestrenger.

Fase 1s sluttgjennomgang (opus, whole-branch review) fant at systemet
likevel ikke kan brukes til det det ble bygget for: ingen kode setter
`users.role_id` utover én engangs-backfill ved migrering, og systemrollene
(`super_admin`, `vendor_admin` — de eneste to rollene som faktisk er
tildelt noen) kan ikke redigeres (blokkert med 409). Netto: en super admin
kan opprette en ny rolle i `/admin/roller`-UI-et, men kan aldri faktisk gi
den til noen, og kan ikke justere hva de to eksisterende rollene gir
tilgang til uten en kodeendring og deploy — nøyaktig det fase 1 skulle
fjerne behovet for.

Samme gjennomgang avdekket at det interne adminpanelet har to separate
kontokilder med hver sin id-rekke: `users`-tabellen (der `role_id` bor) og
`admin_users`-tabellen (separat `serial`-id-rekke, brukt av
`/api/admin/login`, f.eks. CMS-innlogging). `authenticateAdmin`s
JWT-gren har i dag en tre-stegs fallback-kjede (`users.id`-direkte-oppslag
→ `admin_users`→`users`-e-post-join → navnebasert systemrolle-fallback) for
å håndtere begge — men kun `vendor_admin`-kontoer opprettet via
`/api/vendors/:id/admins` har en paret `users`-rad. Kontoer opprettet via
`/api/admin/create-super`, `/api/admin/bootstrap` eller `/api/cms/setup`
har KUN en `admin_users`-rad, ingen `users`-rad, og faller derfor alltid
tilbake til navnebasert tilnærmet rolle-oppslag — aldri en ekte,
individuelt tildelt `role_id`.

Målet med denne fasen:

- En super admin skal faktisk kunne tildele en (eksisterende eller
  nyopprettet) rolle til en bruker — både `users`-tabell-kontoer og
  `admin_users`-tabell-kontoer — uten kodeendring eller deploy.
- Systemrollene (`super_admin`, `vendor_admin`) skal kunne redigeres som
  enhver annen rolle, med én beskyttelse: det skal ikke være mulig å ende
  opp i en tilstand der INGEN rolle med tildelte brukere har
  `role.manage`-tillatelsen (selvlås).
- De to kontokildene (`users`/`admin_users`) samles på én sannhetskilde for
  `role_id` (`users.role_id`), slik at den skjøre fallback-kjeden fase 1s
  sluttgjennomgang fant en reell (om enn sovende) bug i, blir en
  sikkerhetsventil i stedet for normalveien.

## Global Constraints

- Samme scope-avgrensning som fase 1: kun det interne adminpanelet
  (`authenticateAdmin`-ruter). Portalens `canManageRole`/`canManageUsers`
  (leverandøransattes tilgang, `shared/roles.ts`) røres **ikke**.
- Migreringen MÅ ikke endre noen eksisterende kontos faktiske tilgang —
  samme prinsipp som fase 1s migreringsstrategi.
- `role.manage`-tillatelsen dekker BÅDE rolleredigering OG tildeling (ingen
  ny tillatelse i katalogen denne fasen).
- Alle nye/endrede tabeller følger eksisterende konvensjon: idempotent SQL
  i `migrations/`, kjørt via `server/lib/run-startup-migrations.ts`.
- Ingen ny UI-side — utvidelse av eksisterende `client/src/pages/admin-roller.tsx`.

## A) Datamodell-unifisering: paring av `admin_users` mot `users`

**Migrasjon `migrations/055_admin_users_role_id_unification.sql`** (idempotent):

For hver rad i `admin_users` uten en matchende `users`-rad på e-post:
opprett en ny `users`-rad med `role` kopiert fra `admin_users.role`, og
`role_id` satt via samme oppslag fase 1s migrasjon 054 brukte (matchende
`tidum_roles`-rad på rollenavn). For hver rad i `admin_users` MED en
matchende `users`-rad som mangler `role_id`: sett `role_id` på den
eksisterende raden i stedet for å opprette en duplikat.

```sql
-- Opprett users-rad for admin_users-rader uten paret users-rad
INSERT INTO users (id, email, role, role_id, created_at, updated_at)
SELECT
  gen_random_uuid(),
  a.email,
  a.role,
  (SELECT id FROM tidum_roles WHERE name = a.role AND scope = 'global' AND is_system_default = true),
  a.created_at,
  now()
FROM admin_users a
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = a.email)
  AND a.role IN ('super_admin', 'vendor_admin');

-- Backfill role_id på users-rader som allerede er paret på e-post men mangler role_id
UPDATE users u
SET role_id = (SELECT id FROM tidum_roles WHERE name = a.role AND scope = 'global' AND is_system_default = true)
FROM admin_users a
WHERE u.email = a.email
  AND u.role_id IS NULL
  AND a.role IN ('super_admin', 'vendor_admin');
```

E-post er unik på begge tabeller (`admin_users.email` og `users.email` har
begge DB-nivå `UNIQUE`-constraints — verifisert i fase 1s sluttgjennomgang),
så `WHERE NOT EXISTS`/joinen over kan ikke treffe mer enn én rad per side.

Kun `super_admin`/`vendor_admin` behandles — samme avgrensning som fase 1s
migrasjon 054 (andre `admin_users.role`-verdier som `'hovedadmin'`/`'admin'`
— identifisert som mulig dødt/legacy i fase 1s sluttgjennomgang — røres
ikke, og fortsetter å falle tilbake til dagens (manglende) oppløsning,
uendret oppførsel).

**Fremtidige kontoopprettinger** — tre ruter i `server/smartTimingRoutes.ts`
endres til å alltid opprette/oppdatere en paret `users`-rad samtidig med
`admin_users`-raden, samme mønster `POST /api/vendors/:id/admins` allerede
bruker (innsetting/upsert på e-post):

- `POST /api/admin/create-super` (`:1687`)
- `POST /api/admin/bootstrap` (`:1708`)
- `POST /api/cms/setup` (`:2154`)

**`resolveJwtAdminRoleId`** (`smartTimingRoutes.ts:254`) endres ikke i
denne fasen — steg 2 (e-post-join) fungerer allerede riktig og vil nå
faktisk finne en `role_id` for alle admin_users-kontoer opprettet etter
denne migreringen, siden en paret `users`-rad med satt `role_id` nå alltid
finnes. Steg 3 (navnebasert fallback) forblir som sikkerhetsventil for
edge-caset der e-postene skulle divergere i fremtiden.

## B) Tildelings-API

**`PATCH /api/admin/users/:id/role`** — `role.manage`-gated.

```ts
app.patch("/api/admin/users/:id/role", authenticateAdmin, async (req: AuthRequest, res) => {
  if (!(await hasPermission(req.admin.roleId, "role.manage"))) {
    return res.status(403).json({ error: "Ingen tilgang" });
  }
  const { roleId } = req.body as { roleId: string | null };
  if (roleId !== null) {
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) return res.status(404).json({ error: "Rolle ikke funnet" });
  }
  const [updated] = await db
    .update(users)
    .set({ roleId: roleId })
    .where(eq(users.id, req.params.id))
    .returning({ id: users.id, email: users.email, roleId: users.roleId });
  if (!updated) return res.status(404).json({ error: "Bruker ikke funnet" });
  res.json(updated);
});
```

`roleId: null` fjerner tildelingen (brukeren mister all `hasPermission`-
avledet adminpanel-tilgang — fail-closed, konsistent med resten av systemet).

**`GET /api/admin/roles/:id/members`** — `role.manage`-gated, returnerer
`{ id, email, firstName, lastName }[]` for `users`-rader med
`role_id = :id`, brukt av admin-roller.tsx sin medlemsvisning.

**`GET /api/admin/users/search?q=`** — `role.manage`-gated, søker
`users.email ILIKE '%'||q||'%'`, maks 20 treff, returnerer
`{ id, email, firstName, lastName, roleId }[]`. Brukes av
admin-roller.tsx sitt "legg til medlem"-søkefelt. Implementeringsplanen
sjekker først om `users.tsx` allerede har et tilsvarende søk-endepunkt å
gjenbruke fremfor å duplisere — hvis et slikt finnes, brukes det i stedet
og dette punktet droppes fra planen.

## C) Systemrolle-redigering + selvlås-guard

**`PUT /api/admin/roles/:id/permissions`** — den eksisterende
`is_system_default`-409-sperren (lagt til i fase 1 for å hindre at
`role.manage` forsvinner sporløst) fjernes og erstattes med en generell
sjekk som gjelder ALLE roller, ikke bare systemroller:

```ts
app.put("/api/admin/roles/:id/permissions", authenticateAdmin, async (req: AuthRequest, res) => {
  if (!(await hasPermission(req.admin.roleId, "role.manage"))) {
    return res.status(403).json({ error: "Ingen tilgang" });
  }
  const { permissionIds } = req.body as { permissionIds: string[] };
  const roleManagePermission = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.key, "role.manage"))
    .limit(1);
  const removingRoleManage = !permissionIds.includes(roleManagePermission[0].id);

  if (removingRoleManage) {
    const [{ count: membersOfThisRole }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.roleId, req.params.id));

    if (Number(membersOfThisRole) > 0) {
      const otherRolesWithRoleManageAndMembers = await db
        .select({ roleId: users.roleId })
        .from(users)
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, users.roleId))
        .where(and(
          eq(rolePermissions.permissionId, roleManagePermission[0].id),
          ne(users.roleId, req.params.id),
        ))
        .limit(1);

      if (otherRolesWithRoleManageAndMembers.length === 0) {
        return res.status(409).json({
          error: "Kan ikke fjerne role.manage — ingen andre roller med tildelte brukere har den. Tildel en annen bruker først.",
        });
      }
    }
  }
  // ... resten uendret (transaksjon: slett gamle role_permissions-rader, sett inn nye)
});
```

Sjekken kjører KUN når `role.manage` faktisk fjernes fra settet og rollen
har ≥1 tildelt bruker — å legge til/fjerne andre tillatelser, eller endre
en rolle uten medlemmer, er upåvirket.

**`DELETE /api/admin/roles/:id`** — den eksisterende `is_system_default`-
sperren beholdes UENDRET (systemroller kan fortsatt ikke slettes, kun
redigeres) — dette var aldri del av det som blokkerte tildeling/redigering.

## D) UI — utvidelse av `admin-roller.tsx`

Ingen ny side. Rediger-dialogen per rolle får en ny seksjon under
tillatelses-avkrysningsboksene:

- **Medlemmer**: liste hentet fra `GET /api/admin/roles/:id/members`
  (e-post + navn), med en "fjern"-knapp per rad (kaller
  `PATCH /api/admin/users/:id/role` med `roleId: null`).
- **Legg til medlem**: søkefelt (e-post), viser treff, klikk kaller
  `PATCH /api/admin/users/:id/role` med denne rollens id.
- "Systemrolle"-badge beholdes som informasjon, men fjerner ikke lenger
  noen UI-sperre på selve rediger-tillatelser-knappen.

Siden er fortsatt kun synlig for `role.manage`-innehavere (uendret fra fase 1).

## Feilhåndtering

- `PATCH .../role` med ukjent `roleId` → 404, ikke stille no-op.
- `PATCH .../role` med ukjent bruker-id → 404.
- Selvlås-sjekken (C) → 409 med forklarende norsk feiltekst, ikke en
  kaskaderende/stille avvisning.
- Migreringen (A) rører aldri en eksisterende `users`-rad sin `role`-verdi
  (kun `role_id`, kun når `NULL`) — ingen risiko for å endre portalens
  `canManageRole`-oppførsel, som fortsatt leser `users.role` uendret.

## Testing

- **Migreringstest**: kjør migrering 055 mot et fixture-sett med (a) en
  `admin_users`-rad uten paret `users`-rad, (b) en `admin_users`-rad MED
  paret `users`-rad men `role_id IS NULL`, (c) en allerede fullt migrert
  rad. Verifiser: (a) får en ny `users`-rad med korrekt `role_id`, (b) får
  `role_id` satt uten duplikat, (c) er uendret (idempotent — kjør
  migreringen to ganger, verifiser ingen duplikater/feil andre gang).
- **Tildeling-API-test**: `role.manage`-innehaver kan tildele/fjerne en
  rolle; en rolle uten `role.manage` får 403; ukjent `roleId`/bruker-id
  gir 404 (ikke stille suksess).
- **Selvlås-guard-test**: fjerning av `role.manage` fra den ENESTE rollen
  med tildelte brukere som har den → 409. Samme fjerning når en ANNEN
  rolle med ≥1 medlem fortsatt har `role.manage` → tillatt. Fjerning fra en
  rolle med 0 medlemmer → alltid tillatt (ingen sjekk kjører).
- **Regresjonstest**: en migrert `admin_users`-only super_admin-konto
  (opprettet før denne fasen, ingen paret `users`-rad før migrering 055)
  logger inn via `/api/admin/login` og når en `role.manage`-gated rute
  uendret før/etter migreringen (verifiserer at unifiseringen ikke er en
  tilgangsregresjon for akkurat den kontotypen fase 1s sluttgjennomgang
  fant sårbar).

## Ikke i omfang (denne fasen)

- Leverandør-scopede egne roller (`scope = 'vendor'`) — fortsatt utsatt,
  som i fase 1.
- Portalens `canManageRole`/`canManageUsers`-migrering — egen spec senere.
- Aktivitets-/handlingslogg per bruker — eget delsystem, egen spec senere.
- Rydding av `'hovedadmin'`/`'admin'`-rollestrengene i `admin_users.role`
  (identifisert som mulig dødt/legacy i fase 1s sluttgjennomgang, ikke
  undersøkt videre her — de fortsetter uendret å falle tilbake til dagens
  (manglende) oppløsning).
