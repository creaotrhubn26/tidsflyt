# Dynamisk rolle- og tilgangssystem — fase 1 (internt adminpanel)

## Bakgrunn og mål

Tidum sine roller (`super_admin`, `vendor_admin`, `tiltaksleder`, `teamleder`,
`case_manager`, `miljoarbeider`, `member`, m.fl.) er i dag hardkodet i
`shared/roles.ts` som en fast liste, med tilgang avgjort av statiske
funksjoner (`canManageRole`, `canManageUsers`) som sjekker rollestrengen
direkte. Å endre hvem som har tilgang til hva krever en kodeendring og en
deploy.

Målet er et system der:

- **Roller er database-rader**, ikke kode. Tidum sin egen `super_admin`
  oppretter og redigerer globale roller. Leverandører (tiltaksbedrifter) kan
  på sikt opprette egne roller for sine ansatte (utenfor omfanget til denne
  spec-en — se «Ikke i omfang»).
- **Tillatelser er en fast katalog**, definert av utviklere i kode etter hvert
  som funksjoner bygger støtte for dem. En admin kan ikke oppfinne en ny
  tillatelse uten at koden faktisk sjekker den et sted.
- **Hvilke roller som har hvilke tillatelser er dynamisk** — dette er selve
  poenget. En super admin skal kunne gi eller fjerne en tillatelse fra en
  rolle uten kodeendring eller deploy.

Dette er identifisert som ett av to relaterte delsystemer (det andre er en
full aktivitets-/handlingslogg per bruker, spec'es separat senere). Denne
spec-en dekker **kun** rolle-/tilgangsmotoren, faset til det interne
Tidum-adminpanelet (`authenticateAdmin`-ruter i `smartTimingRoutes.ts`).
Portalens `canManageRole`/`canManageUsers`-sjekker (rapporter, timelister,
brukerinvitasjon) migreres i en egen, senere spec.

## Kartlegging av eksisterende system

Se den publiserte referanseartifakten
(`tidum-auth-arkitektur.html`, seksjon «Hva det nye systemet erstatter») for
full kartlegging av dagens `users`/`eid_identities`/`company_users`-struktur
og de to parallelle admin-autentiseringsveiene (`authenticateAdmin` i
`smartTimingRoutes.ts` vs. `hasSessionAuth`/passport i `custom-auth.ts`).

Kort oppsummert, det som er relevant for denne fasen:

- `authenticateAdmin` (definert i `smartTimingRoutes.ts:196`) autentiserer med
  JWT Bearer-token ELLER vanlig sesjon, og setter `req.admin = { id, email,
  role }`.
- Alle ruter som i dag sjekker `req.admin.role !== 'super_admin'` eller
  tilsvarende strenge sjekker, er kandidater for migrering i denne fasen:
  leverandøradministrasjon (`/api/vendors`, `/api/vendors/:id/admins`),
  prototype-testere (`/api/prototype-testers/*`), personnummer-forhånds­
  registrering (`/api/admin/users/expected-ssn`), og tilsvarende.

## Global Constraints

- Fødselsnummer, passord-hasher og andre sensitive felt er **utenfor omfang**
  for denne spec-en — ingenting her rører eksisterende sensitive datamodeller.
- Migreringen av eksisterende roller MÅ ikke endre noen brukers faktiske
  tilgang ved lansering — se «Migreringsstrategi».
- Portalens `canManageRole`/`canManageUsers`-kall (i `users.tsx`,
  `smartTimingRoutes.ts`s `/api/company/users`-ruter, m.fl.) rører vi
  **ikke** i denne fasen. De fortsetter å lese `shared/roles.ts` som i dag.
- Alle nye tabeller følger eksisterende konvensjon: Drizzle-skjema i
  `shared/models/`, idempotent SQL-migrasjon i `migrations/`, kjørt via
  `server/lib/run-startup-migrations.ts`.

## Datamodell

Ny fil `shared/models/permissions.ts`:

```ts
import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

// Fast katalog — kun utviklere legger til rader her, i en seed-liste i kode
// (se "Tillatelseskatalogen" under). Aldri redigerbar fra admin-UI.
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(), // f.eks. "vendor.admin.create"
  label: text("label").notNull(),          // norsk visningstekst
  module: varchar("module").notNull(),     // gruppering i UI: "leverandorer", "prototype_testere", ...
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Roller — DETTE er den dynamiske delen. super_admin oppretter/redigerer.
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name").notNull(),
    scope: varchar("scope").notNull(), // 'global' | 'vendor' (kun 'global' brukes i fase 1)
    vendorId: integer("vendor_id"),    // null for globale roller
    isSystemDefault: boolean("is_system_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Samme rollenavn kan finnes én gang globalt, og én gang per vendor.
    uniqueIndex("roles_scope_vendor_name_key").on(table.scope, table.vendorId, table.name),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("role_permissions_role_permission_key").on(table.roleId, table.permissionId),
  ],
);

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
```

`users.role` (dagens frie tekstkolonne) endres IKKE i denne fasen — den
fortsetter å style portalens `canManageRole`-logikk uendret. En ny, separat
kolonne `users.role_id` (nullable, `references(() => roles.id)`) legges til
for admin-panel-brukere som migreres til det nye systemet. To brukere kan
altså i en overgangsperiode ha `role = "vendor_admin"` (leses av portalen)
OG `role_id` satt til den migrerte `vendor_admin`-rollen (leses av det
interne adminpanelet) samtidig — dette er forventet og ufarlig, ikke en
motsigelse, fordi de to systemene fortsatt er uavhengige i fase 1.

## Tillatelseskatalogen

Definert som en enkel, kommentert konstant-liste i kode — ikke noe admin kan
redigere:

```ts
// server/lib/permission-catalog.ts
export const PERMISSION_CATALOG = [
  { key: "vendor.create", label: "Opprette leverandør", module: "leverandorer" },
  { key: "vendor.admin.create", label: "Opprette leverandøradmin", module: "leverandorer" },
  { key: "vendor.poweroffice_visibility.toggle", label: "Skjule/vise PowerOffice for leverandør", module: "leverandorer" },
  { key: "prototype_tester.invite", label: "Invitere prototype-tester", module: "prototype_testere" },
  { key: "prototype_tester.convert", label: "Konvertere tester til leverandøradmin", module: "prototype_testere" },
  { key: "user.expected_ssn.set", label: "Forhåndsregistrere fødselsnummer på konto", module: "eid" },
  { key: "role.manage", label: "Administrere roller og tillatelser", module: "systemadministrasjon" },
] as const;

export type PermissionKey = typeof PERMISSION_CATALOG[number]["key"];
```

Seedes idempotent ved oppstart (samme `ON CONFLICT (key) DO UPDATE`-mønster
som `ensureDefaultBlogSeed()` i `server/lib/default-blog-seed.ts`), slik at
å legge til en ny tillatelse i denne listen og deploye er den eneste
kodeendringen som trengs når en ny funksjon skal bli tilgangsstyrt.

## hasPermission()-motoren

```ts
// server/lib/permissions.ts
import { db } from "../db";
import { roles, rolePermissions, permissions } from "@shared/models/permissions";
import { eq, and } from "drizzle-orm";

// Enkel per-request cache — motoren kalles typisk flere ganger per
// forespørsel (én gang per rutehandler i en kjede). Ikke persistent,
// ikke delt mellom forespørsler.
export async function hasPermission(
  roleId: string | null | undefined,
  permissionKey: string,
  cache?: Map<string, boolean>,
): Promise<boolean> {
  if (!roleId) return false;
  const cacheKey = `${roleId}:${permissionKey}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey)!;

  const [row] = await db
    .select({ id: rolePermissions.roleId })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(rolePermissions.roleId, roleId), eq(permissions.key, permissionKey)))
    .limit(1);

  const result = !!row;
  cache?.set(cacheKey, result);
  return result;
}
```

Brukssted (eksempel, migrert `/api/vendors/:id/admins`):

```ts
app.post("/api/vendors/:id/admins", authenticateAdmin, async (req: AuthRequest, res) => {
  if (!(await hasPermission(req.admin.roleId, "vendor.admin.create"))) {
    return res.status(403).json({ error: "Ingen tilgang" });
  }
  // ... resten uendret
});
```

`authenticateAdmin` utvides til også å slå opp og sette `req.admin.roleId`
fra `users.role_id` (samme sted den i dag setter `req.admin.role`).

**Dev-mode-hullet:** `authenticateAdmin`s `isDevMode`-gren (øverst i
funksjonen) hardkoder `req.admin = { id: '1', email: 'dev@tidum.no', role:
'super_admin' }` uten noe ekte databaseoppslag. Uten en tilsvarende
`roleId` her ville `hasPermission()` alltid returnert `false` i dev-mode,
og hele det interne adminpanelet ville stoppet å virke lokalt. Fiksen:
dev-mode-grenen slår opp den migrerte `super_admin`-systemrollens `id` én
gang (cachet i en modul-variabel, ikke per request) og setter den som
`req.admin.roleId` — samme «dev-mode har alltid full tilgang»-prinsipp som
resten av bypass-en, bare utvidet til å dekke det nye feltet også.

## Admin-UI

Ny side i det interne adminpanelet, `client/src/pages/admin-roller.tsx`
(mønster hentet fra `vendors.tsx`s eksisterende dialog-struktur):

- Liste over globale roller (navn, antall brukere, «systemrolle»-badge for
  de migrerte standardrollene)
- «Ny rolle»-knapp — navn + tomt tillatelsessett
- Rediger-dialog per rolle: avkrysningsbokser gruppert per `module`
  (leverandorer, prototype_testere, eid, systemadministrasjon), lest fra
  `PERMISSION_CATALOG` via et nytt `GET /api/admin/permissions`-endepunkt
- Lagre kaller `PUT /api/admin/roles/:id/permissions` med hele det nye
  settet av `permission_id`-er (enklere og mer robust enn individuelle
  legg-til/fjern-kall — hele settet skrives, gammelt slettes, i én
  transaksjon)

Kun synlig for brukere med `role.manage`-tillatelsen (systemrollen
`super_admin` får denne ved migrering).

## Migreringsstrategi

Én idempotent migrasjon (`migrations/054_role_permission_system.sql` +
tilhørende seed-kode kjørt fra `run-startup-migrations.ts` eller en egen
`ensureDefaultRoleSeed()`):

1. Opprett `permissions`, `roles`, `role_permissions`-tabellene.
2. Seed `PERMISSION_CATALOG` inn i `permissions`.
3. Opprett to systemroller: `super_admin` (alle tillatelser) og
   `vendor_admin` (kun `vendor.admin.create` og
   `vendor.poweroffice_visibility.toggle` — IKKE `role.manage` eller
   `vendor.create`, som matcher dagens faktiske `req.admin.role !==
   'super_admin'`-sjekker).
4. `UPDATE users SET role_id = (SELECT id FROM roles WHERE name = users.role
   AND scope = 'global') WHERE role IN ('super_admin', 'vendor_admin')` —
   kobler eksisterende kontoer til de migrerte rollene automatisk, uten
   manuelt admin-arbeid.

Steg 4 er skrevet slik at en konto med `role = 'super_admin'` får nøyaktig
samme tilgang gjennom `role_id` som den hadde gjennom strengsjekken —
verifiseres i implementeringsplanen med en direkte før/etter-sammenligning
av hvilke ruter en migrert bruker kan nå.

## Feilhåndtering

- `hasPermission()` returnerer `false` (ikke kaster) ved manglende `roleId`
  eller DB-feil — fail-closed, samme filosofi som resten av eID-koden i
  `eid-auth.ts` (aldri åpne tilgang ved usikkerhet).
- Sletting av en rolle som fortsatt har brukere tilknyttet: blokkeres med en
  tydelig feilmelding («N brukere har denne rollen — flytt dem først»), ikke
  en kaskade-sletting som usynlig fjerner alle brukeres tilgang.

## Testing

- Enhetstest på `hasPermission()`: rolle med/uten tillatelsen, ukjent
  `roleId`, DB-feil (mocket) → alle skal returnere `false` unntatt det ekte
  positive tilfellet.
- Integrasjonstest: migrert `super_admin`-bruker kan fortsatt nå
  `/api/vendors/:id/admins`; en ny rolle uten `vendor.admin.create`
  får 403.
- Migreringstest: kjør migreringen mot en kopi av produksjonsdata (eller et
  representativt fixture-sett), verifiser at ALLE eksisterende
  `super_admin`/`vendor_admin`-kontoer får `role_id` satt til riktig
  migrert rolle — ingen `NULL`-rader igjen for disse to rollene.

## Ikke i omfang (denne fasen)

- Leverandør-spesifikke egne roller (`scope = 'vendor'` er modellert i
  skjemaet for å unngå en fremtidig migrering, men UI og API for å
  opprette dem bygges ikke nå).
- Portalens `canManageRole`/`canManageUsers`-migrering (rapporter,
  timelister, brukerinvitasjon i `users.tsx`) — egen spec senere.
- Aktivitets-/handlingslogg per bruker — eget delsystem, egen spec senere.
