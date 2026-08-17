# G-10 sikkerhetsherding — utrullingsrunbook

Sjekkliste for å rulle branchen `claude/g10-sikkerhetsherding` ut i et ekte
miljø. Rekkefølgen er ikke valgfri: flere av stegene er blokkerende
forutsetninger for de neste.

Kildene for detaljene under er `migrations/052_rls_roles_and_policies.sql`,
`migrations/054_force_rls.sql`, `migrations/056_hardened_vendor_isolation_policy.sql`
og `docs/security/rls-file-classification.md` — denne filen konsoliderer,
den finner ikke opp nye krav.

---

## Steg 0 — sett alle nye hemmeligheter FØR deploy

Alle fem er påkrevd ved kjøretid. De kastes fra selve request-håndteringen
(`requireAuthJwtSecret()`, `requireEmailLoginSecret()`, `requireCsrfSecret()`,
`secret-crypto.ts`), IKKE ved oppstart — mangler en av dem, får du opake
500-er i stedet for en tydelig oppstartsfeil. Se `.env.example`.

| Variabel | Formål | Merk |
|---|---|---|
| `AUTH_JWT_SECRET` | Signering/verifisering av Bearer-tokens | **Stille omdøping**: erstatter `JWT_SECRET`/`SESSION_SECRET` for dette formålet. Et miljø som allerede setter `JWT_SECRET` får den nå ignorert → alle eksisterende Bearer-tokens blir ugyldige. |
| `EMAIL_MAGIC_LINK_SECRET` | Signering av magic-link-tokens | **Stille omdøping**, samme som over. Magic-lenker sendt før deploy slutter å virke. |
| `SECRETS_ENCRYPTION_KEY` | AES-256-GCM for hemmeligheter i DB | Nøyaktig 32 byte, base64: `openssl rand -base64 32`. |
| `CSRF_SECRET` | CSRF-token-signering | Var allerede i `.env.example`. |
| `TIDUM_APP_DATABASE_URL` | Tilkobling som RLS-rollen `tidum_app` | Faller tilbake til `DATABASE_URL` hvis usatt — se steg 7. |

`ALLOW_DEV_AUTH_BYPASS` skal IKKE settes i produksjon (dev-innloggingen krever
både denne og `NODE_ENV != production`).

**Kompatibilitetsvindu:** vil du unngå at innloggede brukere kastes ut, sett
`AUTH_JWT_SECRET`/`EMAIL_MAGIC_LINK_SECRET` til de SAMME verdiene som dagens
`JWT_SECRET` ved første deploy, og roter dem som et separat, planlagt steg
etterpå.

---

## Steg 1 — krypter eksisterende hemmeligheter i databasen

```bash
npx tsx scripts/encrypt-existing-secrets.ts
```

Krypterer `vendor_integrations.client_key` og
`user_settings.smtp_app_password` in-place. Idempotent (hopper over rader som
allerede er krypterte via `isEncryptedSecret`). Krever at
`SECRETS_ENCRYPTION_KEY` er satt, og må kjøres FØR appen begynner å lese de
kolonnene gjennom `secret-crypto`.

---

## Steg 2 — kjør `052_rls_roles_and_policies.sql` MANUELT

Oppretter rollene `tidum_app` og `tidum_system`, gir grants, og oppretter
`vendor_isolation`-policyen på 26 vendor-scopede tabeller (ENABLE, ikke FORCE).

- **Manuelt** via Neon/Render sitt administrasjonsgrensesnitt — filen er
  bevisst IKKE i `STARTUP_MIGRATIONS` i
  `server/lib/run-startup-migrations.ts`.
- **Krever CREATEROLE eller superuser.** En app-kjørt migrasjonsrolle har
  typisk ikke dette på en administrert Postgres. Verifiser privilegiet før
  kjøring.
- **IKKE trygg å kjøre på nytt.** Postgres har ingen
  `CREATE POLICY IF NOT EXISTS`; rolleblokken er idempotent, policy-løkken er
  det ikke. Kjør filen nøyaktig én gang per database.

---

## Steg 3 — la `053_admin_totp_credentials.sql` kjøre automatisk

Står i `STARTUP_MIGRATIONS` (`server/lib/run-startup-migrations.ts`) og kjøres
av appen ved oppstart. Ingen manuell handling — bare bekreft i oppstartsloggen
at den gikk gjennom.

---

## Steg 4 — soak: kjør `withVendorScopedDb` i produksjon i ~7 dager

`054_force_rls.sql` forutsetter selv at Task 8s middleware har vært utrullet og
stabil «i en periode (anbefalt: minst 7 dager)». Varigheten er en anbefaling,
ikke en hardkodet sannhet — avgjør den ut fra hvor mye av trafikken og hvor
mange av kodestiene som faktisk har blitt dekket.

Det du ser etter i loggene i soak-perioden:

- `permission denied for table …` → `tidum_app` mangler en grant (steg 5 del 1
  fikser de kjente tilfellene).
- `invalid input syntax for type integer: ""` → en spørring kjører uten aktiv
  scoping på en gjenbrukt tilkobling (se steg 6).
- Tomme resultater der det burde vært data → en tvers-vendor-sti som mangler
  `requestDbStorage.exit()`-unntak (se «Kjente, bevisste unntak» i
  `docs/security/rls-file-classification.md`).

---

## Steg 5 — kjør `054_force_rls.sql` MANUELT

To deler: (1) `GRANT CREATE ON SCHEMA public TO tidum_system` +
`ALTER DEFAULT PRIVILEGES FOR ROLE tidum_system …` + innhentende
`GRANT … ON ALL TABLES`, (2) `FORCE ROW LEVEL SECURITY` på de samme 26
tabellene.

- **Manuelt**, samme grunn som 052 — ikke i `STARTUP_MIGRATIONS`.
- **Rollekravet er strengere enn «admin»:** `ALTER DEFAULT PRIVILEGES FOR ROLE
  tidum_system` krever at kjørende rolle enten ER `tidum_system`, ER superuser,
  eller er MEDLEM AV `tidum_system`. En vanlig admin-rolle uten ett av disse
  tre feiler ikke synlig — den setter bare default privileges for FEIL rolle.
  **Verifiser hvilken rolle som faktisk kjører filen før du kjører den.**
- Trygg å kjøre på nytt (FORCE/ENABLE/GRANT/ALTER DEFAULT PRIVILEGES er alle
  idempotente), i motsetning til 052.

---

## Steg 6 — kjør `056_hardened_vendor_isolation_policy.sql` MANUELT

Erstatter `current_setting('app.vendor_id', true)::int` med
`NULLIF(current_setting('app.vendor_id', true), '')::int` i alle 26 policyene.
Uten den gir en spørring uten aktiv scoping på en GJENBRUKT pooled tilkobling
en hard SQL-feil (`invalid input syntax for type integer: ""`) i stedet for
null rader, fordi GUC-en tilbakestilles til tom streng — ikke NULL — ved
transaksjonsslutt.

- **Manuelt** (krever eierskap av tabellene for `DROP`/`CREATE POLICY`).
- Trygg å kjøre på nytt (`DROP POLICY IF EXISTS`).
- Kan kjøres før eller etter 054; helst før, siden 054 er selve cutoveren.

---

## Steg 7 — verifiseringer etter utrulling

Kjør disse mot det ekte miljøet, ikke lokalt.

1. **`lock_timeout` er faktisk satt på app-tilkoblingen.** `server/db.ts`
   setter `SET lock_timeout = 3000` i en `connect`-lytter på system-poolen —
   nødvendig fordi lat DDL rutes dit og ellers kan henge for alltid mot
   requestens egen åpne transaksjon. Bekreft på en ekte app-tilkobling:

   ```sql
   SHOW lock_timeout;  -- forventet: 3s
   ```

2. **Produksjonsbrukeren er IKKE superuser** (og ikke `BYPASSRLS`). Er den
   det, er FORCE RLS stille virkningsløs — ingen feilmelding, ingen
   isolasjon.

   ```sql
   SELECT current_user, rolsuper, rolbypassrls
     FROM pg_roles WHERE rolname = current_user;
   -- forventet for tidum_app: rolsuper = f, rolbypassrls = f
   ```

   Sett `TIDUM_APP_DATABASE_URL` eksplisitt til `tidum_app`. Uten den kjører
   alle requests som `DATABASE_URL`-rollen, som på en administrert Postgres
   typisk er tabelleier eller superuser.

3. **Policyene er faktisk i kraft:**

   ```sql
   SELECT relname, relrowsecurity, relforcerowsecurity
     FROM pg_class WHERE relname IN ('log_row','users','api_usage_log');
   -- forventet: begge kolonner = t
   ```

---

## Ikke i denne runbooken

Innstrammingen av `tidum_system` til minste privilegium (REVOKE) er bevisst
utsatt til en egen migrasjon (055 er reservert til dette), og skal først
skrives etter at klassifiseringen i
`docs/security/rls-file-classification.md` har stått i produksjon minst én uke
uten feilmeldinger om manglende tilgang. Se `migrations/054_force_rls.sql`,
siste avsnitt.
