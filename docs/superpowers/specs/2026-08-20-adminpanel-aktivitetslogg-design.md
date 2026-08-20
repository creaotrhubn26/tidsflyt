# Aktivitetslogg for internt adminpanel

## Bakgrunn og mål

Sub-prosjekt 2 fra den opprinnelige rolle-/tilgangssystem-brainstormingen
(`docs/superpowers/specs/2026-08-18-rolle-tilgangssystem-design.md`), utsatt
til nå: en oversikt over hva en admin-panel-bruker faktisk har gjort og vært
inne på, ikke bare hvilke tillatelser de HAR (fase 1/1.5). Bekreftet omfang:

- **Både mutasjoner OG sidevisninger/navigasjon** — ikke bare
  opprett/endre/slett, men også hvilke sider/moduler en bruker åpnet.
- **Kun det interne adminpanelet** (`authenticateAdmin`-ruter) — samme
  avgrensning som fase 1/1.5. Portal-/leverandørbrukeres aktivitet dekkes
  ikke nå.
- **Kun super_admin kan se loggen**, gatet på en NY, dedikert tillatelse
  `activity_log.view` (ikke `role.manage` — konseptuelt en annen ting, åpner
  for å senere gi innsyn uten rolleadministrasjon).
- **Separat system** fra `server/lib/log-row-audit.ts` (som fortsatt kun
  dekker timeliste-rad-endringer med full before/after-diff for compliance
  — et annet, mer detaljert behov). Log_row_audit røres IKKE.
- **90 dagers oppbevaring**, automatisk opprydding fra dag én.

## Kartlegging av eksisterende infrastruktur

Verifisert før denne spec-en ble skrevet, avgjørende for arkitekturen:

- **node-cron er allerede i bruk** (`package.json`), med 5 eksisterende
  cron-jobber i `server/routes/*.ts`, alle registrert samlet i
  `server/routes.ts:6557-6566`. `server/routes/gdpr-routes.ts:358-375`s
  daglige oppbevarings-opprydding (`cron.schedule('0 2 * * *', ...)`, en
  `cronStarted`-vaktflagg-variabel) er nøyaktig mønsteret denne spec-ens
  90-dagers opprydding gjenbruker — ingen ny job-infrastruktur oppfinnes.
- **Ruting er wouter**, ett sentralt registreringspunkt i
  `client/src/App.tsx`s `Router()`-funksjon (linje 124). Det finnes allerede
  en global rute-endring-lytter, `client/src/components/analytics-runtime.tsx`,
  montert én gang i `App()` (`App.tsx:248`). Den er BEVISST ikke gjenbrukt
  her — den er samtykke-banner-gatet markedsføringsanalyse for de OFFENTLIGE
  sidene (`tidum.no`), en annen bekymring enn en obligatorisk, intern
  revisjonslogg som ikke skal kreve samtykke. Denne spec-en bygger en egen,
  liten søskenkomponent, avgrenset til `/admin`-stier.
- **3 andre, smale revisjonslogg-tabeller finnes allerede**
  (`company_audit_log`, `cms_activity_log`, `rapport_audit_log` i
  `shared/schema.ts`) — ingen av dem passer denne bredere,
  adminpanel-dekkende bruken (alle er modul-spesifikke). Bekrefter valget om
  et separat system fremfor å generalisere en av dem.
- **Navnekollisjon verifisert mot ekte produksjonsdatabase FØR denne
  spec-en ble skrevet** (samme disiplin som resten av denne økten): over 50
  eksisterende tabeller med `activity`/`audit` i navnet, fra flere andre
  urelaterte produkter som deler samme database (`admin_activity_log`,
  `activity_logs`, `user_activity_logs`, `user_activity` m.fl. er ALLE
  allerede tatt av andre). Navnet denne spec-en bruker,
  `tidum_admin_activity_log`, er verifisert IKKE i bruk.

## Global Constraints

- Kun `authenticateAdmin`-ruter (internt adminpanel). Portalens
  autentiseringsvei røres ikke.
- `server/lib/log-row-audit.ts` røres IKKE — helt separat system.
- Alle nye tabeller/ruter følger `tidum_`-navnekonvensjonen (verifisert mot
  ekte database før bruk, se over) — deles med et urelatert produkts
  database.
- `public.users` har skjulte NOT NULL-kolonner uten default (`username`,
  `password`) — ikke relevant her siden denne spec-en ikke setter inn nye
  `users`-rader, men nevnt for kontekst.
- Ingen ny cron-/job-infrastruktur — gjenbruk `node-cron`-mønsteret fra
  `server/routes/gdpr-routes.ts`.
- Sidevisning-sporing MÅ ikke bruke `analytics-runtime.tsx` sin
  samtykke-/consent-mekanisme — dette er en obligatorisk, intern logg, ikke
  tredjeparts-analyse.

## Datamodell

Ny migrasjon `migrations/056_admin_activity_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS tidum_admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  event_type VARCHAR NOT NULL CHECK (event_type IN ('mutation', 'page_view')),
  method VARCHAR,       -- HTTP-metode for mutasjoner, NULL for page_view
  path TEXT NOT NULL,   -- API-sti for mutasjoner, klient-rute for page_view
  status_code INTEGER,  -- respons-statuskode for mutasjoner, NULL for page_view
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tidum_admin_activity_log_user_id
  ON tidum_admin_activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_tidum_admin_activity_log_created_at
  ON tidum_admin_activity_log (created_at DESC);

-- Engangs-frø-merke: en ny tillatelse introdusert i en SENERE migrasjon enn
-- 054 kan IKKE gjenbruke 054s "tidum_role_permissions er tabellbred tom"-vakt
-- — den tabellen er aldri tom etter at 054 selv har kjørt (den seeder alltid
-- super_admin/vendor_admin sine 8 rader først). En slik gjenbrukt vakt ville
-- ALDRI utløst på noe reelt miljø, og uten NOEN vakt ville denne migrasjonen
-- (som kjører på hvert oppstart, som alle migrations/*.sql) stille
-- gjenopprettet activity_log.view for super_admin hver gang en admin
-- eksplisitt fjernet den via UI-et — nøyaktig samme feilklasse fase 1.5s
-- sluttgjennomgang fant og fikset for 054 (Kritisk 2), oppdaget her under
-- denne spec-ens selvgjennomgang før noe ble bygget. Denne lille
-- merke-tabellen sporer "har denne spesifikke tillatelsen blitt seedet inn
-- FØR" per nøkkel, uavhengig av om noen senere fjernet den — generelt
-- gjenbrukbart mønster for enhver fremtidig ny tillatelse lagt til i en
-- senere migrasjon, ikke bare denne.
CREATE TABLE IF NOT EXISTS tidum_permission_seed_log (
  permission_key VARCHAR PRIMARY KEY,
  seeded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO tidum_permissions (key, label, module) VALUES
  ('activity_log.view', 'Se aktivitetslogg', 'systemadministrasjon')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, module = EXCLUDED.module;

INSERT INTO tidum_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM tidum_roles r, tidum_permissions p
WHERE r.name = 'super_admin' AND r.scope = 'global' AND p.key = 'activity_log.view'
  AND NOT EXISTS (SELECT 1 FROM tidum_permission_seed_log WHERE permission_key = 'activity_log.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tidum_permission_seed_log (permission_key) VALUES ('activity_log.view')
ON CONFLICT (permission_key) DO NOTHING;
```

`user_id` har bevisst INGEN FK til `users.id` — samme valg som resten av
denne kodebasen gjør for `vendor_id`-kolonner (unngår FK-typemismatch-risiko
mot en delt database med uforutsigbar skjemadrift, se
`.claude/skills/rolle-tilgangssystem/references/fallgruver.md`).

`server/lib/permission-catalog.ts` sin `PERMISSION_CATALOG`-liste får en ny
rad: `{ key: "activity_log.view", label: "Se aktivitetslogg", module: "systemadministrasjon" }`.

## Mutasjonslogging (server, automatisk)

Lagt inn i selve `authenticateAdmin`
(`server/smartTimingRoutes.ts:297-370`), som ALLE
`authenticateAdmin`-gatede ruter allerede kaller — null endring i noen av de
~100 individuelle rutene. Én delt hjelpefunksjon kalt fra alle 3
suksess-utgangene (dev-mode, JWT, sesjon) rett før `return next()`, for å
unngå tredobling av samme kode (samme leksjon som
`pairAdminUserWithUsersTable` i fase 1.5):

```ts
// server/smartTimingRoutes.ts, modul-nivå, nær authenticateAdmin
function attachActivityLogging(req: AuthRequest, res: Response): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
  const userId = req.admin?.id;
  if (!userId) return;
  res.on("finish", () => {
    pool
      .query(
        `INSERT INTO tidum_admin_activity_log (user_id, event_type, method, path, status_code)
         VALUES ($1, 'mutation', $2, $3, $4)`,
        [userId, req.method, req.path, res.statusCode],
      )
      .catch((err) => console.error("[activity-log] failed to write mutation entry", err));
  });
}
```

Kalt som `attachActivityLogging(req, res);` rett før hver av de 3
`return next();`-linjene i `authenticateAdmin` (linje ~327 dev-mode, ~350
JWT-gren, ~367 sesjon-gren — eksakte linjenumre bekreftes i
implementeringsplanen mot koden slik den faktisk står når planen skrives).
Logger ALLE mutasjonsforsøk, også mislykkede (statuskoden lagres) — en 403
fra `hasPermission()` er like interessant som en vellykket handling for
"hva prøvde denne brukeren å gjøre".

`isDevMode`-grenen logger også (samme "dev-mode har full tilgang, men skal
fortsatt spores"-prinsipp som resten av bypass-en) — nyttig for å teste
loggen lokalt, og fjerner ikke reell dekning siden dev-mode uansett kun
kjører lokalt, aldri i prod.

## Sidevisning-logging (klient)

Ny fil `client/src/components/admin-activity-tracker.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

async function postPageView(path: string): Promise<void> {
  const token = sessionStorage.getItem("cms_admin_token");
  try {
    await fetch("/api/admin/activity/page-view", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ path }),
    });
  } catch {
    // Best-effort — en tapt sidevisning skal aldri påvirke brukeropplevelsen.
  }
}

export function AdminActivityTracker() {
  const [location] = useLocation();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!location.startsWith("/admin")) return;
    if (lastTrackedPath.current === location) return;
    lastTrackedPath.current = location;
    postPageView(location);
  }, [location]);

  return null;
}
```

Montert i `client/src/App.tsx`, som en søsken-linje til `<AnalyticsRuntime />`
(`App.tsx:248`): `<AdminActivityTracker />`. Ingen samtykke-logikk — dette er
en obligatorisk, intern logg for en avgrenset brukergruppe (adminpanel-
brukere), ikke tredjeparts sporing av offentlige besøkende.

**Ny rute** `POST /api/admin/activity/page-view`
(`server/smartTimingRoutes.ts`, samme fil som resten av de nye
adminrutene): `authenticateAdmin`-gated (ingen ekstra tillatelse — enhver
gyldig admin kan logge sin EGEN sidevisning, det er kun INNSYN i andres som
krever `activity_log.view`), validerer at `path` er en streng som starter
med `/admin`, setter inn én rad med `event_type = 'page_view'`.

## Innsyn

**`GET /api/admin/activity`** — `activity_log.view`-gated, paginert
(`?limit=50&offset=0`, maks limit 200), valgfrie filtre `?userId=` og
`?since=`/`?until=` (ISO-datoer). Returnerer
`{ id, userId, userEmail, eventType, method, path, statusCode, createdAt }[]`
(join mot `users` for e-post — samme mønster som
`GET /api/admin/roles/:id/members` fra fase 1.5).

**Ny side** `client/src/pages/admin-aktivitetslogg.tsx`, mønster hentet fra
`admin-roller.tsx`: tabell over hendelser, filter-dropdown for bruker
(gjenbruker `GET /api/admin/users/search` fra fase 1.5), enkel dato-filter.
Registreres i `client/src/App.tsx` som `/admin/aktivitetslogg`, gatet på
`activity_log.view` server-side (klient-siden viser en tydelig
"ingen tilgang"-melding fremfor å skjule ruten helt — samme mønster
adminpanelet allerede bruker andre steder).

## Oppbevaring — 90 dagers automatisk sletting

Ny fil `server/routes/activity-log-cron.ts`, modellert direkte på
`server/routes/gdpr-routes.ts:357-375`:

```ts
import cron from "node-cron";
import { pool } from "../db";

let cronStarted = false;
export function setupActivityLogCron() {
  if (cronStarted) return;
  // Daglig 02:30 — samme lav-trafikk-vindu som GDPR-jobben (02:00), forskjøvet
  // 30 minutter for å unngå at begge treffer databasen samtidig.
  cron.schedule("30 2 * * *", async () => {
    console.log("🗑️  Running admin activity log retention purge…");
    try {
      const result = await pool.query(
        `DELETE FROM tidum_admin_activity_log WHERE created_at < NOW() - INTERVAL '90 days'`,
      );
      console.log(`[activity-log] purged ${result.rowCount} row(s) older than 90 days`);
    } catch (err: any) {
      console.error("[activity-log] retention purge failed:", err);
    }
  });
  cronStarted = true;
  console.log("✅ Admin activity log retention cron scheduled (daily 02:30)");
}
```

Registrert i `server/routes.ts` sin eksisterende cron-oppsettsblokk
(`server/routes.ts:6557-6566`), som en ny linje `setupActivityLogCron();`
ved siden av `setupGdprCron()`/`setupSeatOverrunCron()`, samme
`RECURRING_CRON_DISABLED`-miljøflagg-vakt som de andre 5.

## Migrering

Registrert i `server/lib/run-startup-migrations.ts` sin
`STARTUP_MIGRATIONS`-liste, etter `"055_admin_users_role_id_unification.sql"`.

## Feilhåndtering

- All logging er best-effort — en feilet loggskriving skal ALDRI kaste eller
  blokkere den faktiske handlingen brukeren utførte (samme prinsipp som
  `log-row-audit.ts` allerede etablerer, `auditLogRow()`s kommentar: "Audit
  must never break a user-facing mutation").
- `GET /api/admin/activity` returnerer `403` (ikke stille tom liste) for en
  bruker uten `activity_log.view` — samme mønster som alle andre
  `hasPermission()`-gatede ruter i denne kodebasen.

## Testing

- Enhetstest: `attachActivityLogging()` skriver én rad med korrekt
  `event_type='mutation'`, `method`, `path`, `status_code` etter en
  POST/PUT/PATCH/DELETE mot en `authenticateAdmin`-gated rute — inkludert
  når ruten selv returnerer 403 (statuskoden må reflektere DET, ikke bare
  200-tilfellet).
- Enhetstest: en GET-forespørsel utløser IKKE en mutasjonsrad.
- Integrasjonstest: `POST /api/admin/activity/page-view` setter inn én
  `event_type='page_view'`-rad, avviser en `path` som ikke starter med
  `/admin`.
- Integrasjonstest: `GET /api/admin/activity` — `403` uten
  `activity_log.view`, `200` med korrekt paginering/filtrering med den.
- Migreringstest: `activity_log.view` seedes korrekt til `super_admin`, ikke
  til `vendor_admin`; `tidum_permission_seed_log`-merket hindrer re-seeding
  etter en super admin har redigert tillatelsen bort (fjern grant → kjør
  migrasjonen på nytt → verifiser grant IKKE kommer tilbake, mens
  merke-raden fortsatt finnes) — dette er selve feilklassen denne spec-ens
  egen selvgjennomgang fant og fikset før implementering, verifiseres derfor
  eksplisitt.

## Ikke i omfang (denne fasen)

- Portalens/leverandørbrukeres aktivitet — kun internt adminpanel.
- `vendor_admin`-innsyn i egen leverandørs aktivitet (kun super_admin ser
  loggen i denne fasen).
- Konsolidering av de 4 (nå 5, inkludert denne) parallelle
  revisjonslogg-systemene i kodebasen (`log_row_audit`, `company_audit_log`,
  `cms_activity_log`, `rapport_audit_log`, og nå `tidum_admin_activity_log`)
  — observert, ikke adressert. Egen vurdering senere om dette bør ryddes opp.
- Eksport/nedlasting av loggen (CSV e.l.) — kun visning i UI-et denne fasen.
