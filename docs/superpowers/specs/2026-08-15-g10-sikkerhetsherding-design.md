# G-10 Sikkerhetsherding — Design

**Status:** Godkjent retning 15.08.2026
**RLS cutover-migrasjon (054) skrevet:** 16.08.2026 — FORCE ROW LEVEL SECURITY på alle 26 tabeller fra migrasjon 052, pluss ALTER DEFAULT PRIVILEGES-fiksen fra Task 9. IKKE kjørt mot staging/produksjon ennå (ingen ekte tidum_app/tidum_system-tilkobling tilgjengelig i denne sandboxen — samme aksepterte begrensning som Task 7-9). Se docs/security/rls-file-classification.md og migrations/054_force_rls.sql for gjenstående manuell verifikasjon før produksjonskjøring.
**Utløst av:** Gap-analyse [Halden-anbudet](anbud/2026-112379-halden-barnevern-gap-analyse.md) (branch `claude/anbudskrav-analyse-k52s1q`), punkt G-10
**Henger sammen med:** [Veikart: Barnevern som ny vertikal](veikart-barnevern-vertikal.md) Fase 0, [Compliance-roadmap](compliance/roadmap.md)

---

## 1. Hvorfor

G-10 i gap-analysen lister åtte uavhengige sikkerhetshull, funnet ved direkte kodesjekk mot `main` 15.08.2026, uavhengig av om Halden-anbudet vinnes: dev-mode auth-bypass, en JWT-hemmelighet som faller tilbake til tom streng, TLS som ikke validerer sertifikatet på databasetilkoblingen, ingen helmet/CSP/HSTS, ingen CSRF-vern, inkonsistent (i praksis fraværende, se `server/routes/export-routes.ts`) vendor-scoping i ruter, integrasjonshemmeligheter (PowerOffice client key, SMTP-passord) lagret i klartekst i databasen, og ingen 2FA for admin-roller. Dette er grunnmuren compliance-roadmapen allerede krever før salg til offentlig sektor — ikke noe som er spesifikt for barnevern.

## 2. Målbilde

Alle åtte punktene lukket, verifisert med automatiske tester der det er mulig og manuell verifikasjon der det ikke er (TLS mot faktisk Neon/Render-tilkobling, 2FA-enrollment-flyt i nettleser).

## 3. Arkitektur, del A — Feil-trygge enkeltfikser

Ingen nye avhengigheter, ingen skjemaendringer. Hver er en isolert, bakoverkompatibel endring til eksisterende kode.

### A1. Dev-mode auth-bypass

`server/middleware/auth.ts:26-29` setter i dag `authUser` automatisk til en hardkodet `super_admin` når `isDevMode` er sann, uten noe eksplisitt opt-in utover `NODE_ENV`. Endres til å kreve BÅDE `NODE_ENV !== "production"` OG en eksplisitt ny env-variabel `ALLOW_DEV_AUTH_BYPASS=true`. Mangler den andre, er bypasset av — ingen implisitt bypass lenger, selv i utvikling.

### A2. To separate JWT-hemmeligheter uten trygg fallback

To uavhengige funn, samme rotårsak (fallback til noe usikkert i stedet for å kreve konfigurasjon), samme fiksmønster:

- `server/custom-auth.ts`, funksjonen `getEmailLoginSecret()` faller i dag `EMAIL_MAGIC_LINK_SECRET || JWT_SECRET || SESSION_SECRET || ""` — en tom streng er en gyldig HMAC-nøkkel, som betyr at hvis ALLE tre env-variablene mangler, signeres magic-link-tokens med en kjent, offentlig nøkkel («»).
- `server/middleware/auth.ts:8` — `const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'change-me-in-production'`, brukt til å verifisere Bearer-tokens (`jwt.verify(...)` linje 42). Dette er alvorligere: hvis begge env-variablene mangler, kan HVEM SOM HELST signere et gyldig Bearer-token selv (nøkkelen er en offentlig kjent streng i kildekoden) og late som de er en hvilken som helst bruker/rolle.

Begge endres til å kreve sin egen dedikerte env-variabel eksplisitt og kaste ved oppstart hvis den mangler — samme mønster som `requireDatabaseConnectionString()` i `server/database-config.ts` (for `DATABASE_URL`) og `server/lib/mobile-auth.ts`s `requireSecret()`-funksjon (for `MOBILE_JWT_SECRET`) ALLEREDE bruker korrekt i denne kodebasen. `EMAIL_MAGIC_LINK_SECRET` for magic-link, en ny `AUTH_JWT_SECRET` for Bearer-token-verifiseringen i `middleware/auth.ts` (adskilt fra `JWT_SECRET`, som ikke lenger brukes som fallback-kilde noe sted). `JWT_SECRET`/`SESSION_SECRET` beholdes som egne variabler der de brukes til andre, allerede riktige formål (f.eks. express-session) — ikke fjernet, kun fjernet som fallback-kilde for disse to hemmelighetene.

### A3. `rejectUnauthorized: false` på databasetilkoblingen

`server/db.ts:19` — `ssl: useSsl ? { rejectUnauthorized: false } : false`. `useSsl` er allerede begrenset til ikke-lokale tilkoblinger (`isLocal`-sjekken over), så dette er en ren innstramming: `rejectUnauthorized: true`. Neon og Render Postgres har gyldige CA-signerte sertifikater; lokal utvikling (`localhost`/`127.0.0.1`) er upåvirket siden `useSsl` da er `false`.

## 4. Arkitektur, del B — helmet + CSRF

Ny avhengighet: `helmet`, `csrf-csrf` (`csurf` er avviklet siden 2022 og ikke vedlikeholdt).

- `helmet()` monteres i `server/index.ts` før rutene. CSP bygges restriktivt fra start (`default-src 'self'`), med eksplisitte unntak kartlagt ved implementasjon (Vite/React kan kreve `'unsafe-inline'` eller nonce for enkelte inline-stiler/scripts til dette er ryddet — dokumenteres som kjent, midlertidig unntak i planen, ikke en stille smutthull). HSTS med `includeSubDomains`.
- CSRF: `csrf-csrf`s double-submit-cookie-mønster, montert KUN på ruter som autentiserer via sesjons-cookie (dagens `req.isAuthenticated()`/passport-ruter). Bearer-token-ruter (mobil-JWT fra iOS-appen, se `server/lib/mobile-auth.ts` og `resolveBearerUser`) er ikke cookie-baserte og er strukturelt immune mot CSRF — disse ekskluderes eksplisitt fra CSRF-middlewaren, ikke ved et unntak lagt til i etterkant, men ved at middlewaren kun monteres på sesjons-ruter fra dag én.
- Offentlige GET-ruter (landingsside, offentlig innhold) trenger ikke CSRF-token; kun tilstandsendrende (`POST`/`PUT`/`PATCH`/`DELETE`) sesjons-autentiserte ruter får håndhevelsen.

## 5. Arkitektur, del C — Postgres Row-Level Security

Dette er det største punktet i planen — det endrer databasetilgangsmønsteret for hele appen, ikke bare ett hull.

### 5.1 Dagens tilstand

56 filer under `server/` importerer `db` (drizzle) eller `pool` (rå `pg`) direkte fra `server/db.ts` — verifisert via import-basert søk (et enklere søk etter bokstavelig `await db\.` på samme linje underrapporterte kraftig, siden mange kall er skrevet med metodekjeden på neste linje, og fanger heller ikke rå `pool.query(...)`-kall). Ingen per-request-transaksjon finnes noe sted. `server/routes/export-routes.ts:23-33` er det konkret påviste eksemplet: spørringen filtrerer på dato og valgfri `userId`, men ALDRI på `vendorId`, selv om `logRow.vendorId`-kolonnen finnes — enhver innlogget bruker kan hente tidsregistreringer for enhver `userId`, uansett vendor.

### 5.2 Hvorfor RLS, ikke bare app-nivå-filtre

App-nivå-filtre (som å legge til `eq(logRow.vendorId, vendorId)` i hver spørring) er like sterke som den svakeste linja kode noen skriver i fremtiden — nøyaktig den type glipp som skapte export-routes-hullet. RLS gjør Postgres selv til håndhevingslaget: en utviklerglipp i en fremtidig rute kan ikke lenger lekke data på tvers av vendors, fordi databasen filtrerer radene uansett hva spørringen selv ba om.

### 5.3 To Postgres-roller

- `tidum_app` — RLS håndheves ALLTID på denne rollen (`FORCE ROW LEVEL SECURITY` på hver berørt tabell, ikke bare `ENABLE`, slik at selv tabelleieren er underlagt policyene).
- `tidum_system` — `BYPASSRLS`. Brukes for: migrasjoner, seed-scripts, cron-jobber (GDPR-retensjon, varsler), OG autentiseringskode som kjører FØR `req.user` finnes (login-oppslag på e-post/eID-hash i `custom-auth.ts`, `eid-auth.ts`, `buypass-auth.ts`, `mobile-auth.ts` — disse må kunne slå opp en bruker på tvers av vendors ved innlogging, siden vendor-tilhørighet nettopp er det oppslaget skal *finne ut*, ikke noe som er kjent på forhånd). Denne rollen er IKKE en generell unntakslem — bruken er begrenset til kode som strukturelt kjører utenfor en autentisert request-kontekst.

Eksisterende `server/db.ts`-eksport (`db`, `pool`) knyttes til `tidum_system`-rollen og beholdes som i dag for disse formålene. Ny kobling/rolle `tidum_app` opprettes for alt autentisert forretningslogikk-arbeid.

### 5.4 Policy-mønster

Per vendor-scopet tabell (kartlagt i §5.6):
```sql
ALTER TABLE <tabell> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <tabell> FORCE ROW LEVEL SECURITY;
CREATE POLICY vendor_isolation ON <tabell>
  USING (
    vendor_id = current_setting('app.vendor_id', true)::int
    OR current_setting('app.is_super_admin', true) = 'true'
  );
```
`current_setting(name, true)` (missing_ok=true) returnerer NULL i stedet for å kaste hvis variabelen ikke er satt — en spørring på `tidum_app`-rollen uten satt sesjonsvariabel matcher da INGEN rader (fail-closed, ikke fail-open).

`users`-tabellen (`shared/models/auth.ts`) har `vendorId` som nullable (null for `super_admin`) — policyen over dekker den uendret: super_admin-raden selv har `vendor_id IS NULL`, som ikke matcher `vendor_id = ...`, men matcher `is_super_admin`-grenen når den innloggede brukeren selv er super_admin.

### 5.5 Per-request-transaksjon via AsyncLocalStorage — ikke eksplisitt `req.db`

`server/storage.ts` er IKKE et sentralt datalag alle 56 filene går gjennom (kun én rute importerer derfra) — db-tilgangen er spredt direkte i alle 56. Å kreve at hver av dem skriver om til en eksplisitt `req.db`-parameter ville også kreve å endre funksjonssignaturer i rene service-hjelpefiler (f.eks. `server/lib/pricing-service.ts`, `server/lib/seat-overrun.ts`) som ikke engang har `req` tilgjengelig i dag — en reell, stor mekanisk rewrite av alle 56 filer.

I stedet: gjør selve `db`- og `pool`-eksporten i `server/db.ts` om til en `Proxy` som leser den aktive request-scopede tilkoblingen fra en `AsyncLocalStorage`-kontekst, satt av en ny middleware, og faller tilbake til `tidum_system`-tilkoblingen når ingen kontekst er satt (cron, migrasjon, oppstart). Konsumerende filer endres IKKE i det hele tatt for selve tilkoblings-delen — de fortsetter å skrive `db.select()...`/`pool.query(...)` akkurat som i dag; proxyen avgjør usynlig hvilken faktiske tilkobling det kall lander på.

```ts
// server/lib/request-db-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { NodePgDatabase } from "drizzle-orm/node-pg";
import type { PoolClient } from "pg";

export interface RequestDbContext {
  db: NodePgDatabase<typeof schema>;
  client: PoolClient;
}

export const requestDbStorage = new AsyncLocalStorage<RequestDbContext>();
```

```ts
// server/db.ts (relevant del) — db/pool blir Proxy-objekter
export const db: NodePgDatabase<typeof schema> = new Proxy(systemDb, {
  get(target, prop, receiver) {
    const ctx = requestDbStorage.getStore();
    const actual = ctx ? ctx.db : target;
    return Reflect.get(actual, prop, receiver);
  },
});

export const pool: Pool | PoolClient = new Proxy(systemPool, {
  get(target, prop, receiver) {
    const ctx = requestDbStorage.getStore();
    const actual = ctx ? ctx.client : target;
    return Reflect.get(actual, prop, receiver);
  },
});
```

Middleware, montert RETT ETTER autentisering (dvs. etter at `req.user` er satt av passport/Bearer-middlewaren, IKKE globalt først i kjeden):

```ts
async function withVendorScopedDb(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next(); // uautentiserte ruter kjører uten kontekst -> proxy faller til tidum_system
  const user = req.user as AuthUser;
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.vendor_id = $1", [user.vendorId ?? -1]);
    await client.query("SET LOCAL app.is_super_admin = $1", [user.role === "super_admin" ? "true" : "false"]);
    const scopedDb = drizzle(client, { schema });
    res.on("finish", () => { client.query("COMMIT").finally(() => client.release()); });
    res.on("close", () => { client.query("ROLLBACK").finally(() => client.release()); });
    requestDbStorage.run({ db: scopedDb, client }, next);
  } catch (err) {
    client.release();
    next(err);
  }
}
```
(Eksakt plassering av `res.on` vs. try/catch-detaljer spikres i planen — prinsippet er: én pg-tilkobling hentes fra en egen `tidum_app`-pool per request, sesjonsvariablene settes med `SET LOCAL` (kun gyldig innenfor den åpne transaksjonen — derfor MÅ alt arbeid for requesten skje på samme tilkobling, ikke på den delte poolen), konteksten kjøres via `AsyncLocalStorage.run()` slik at ALLE videre kall i requesten (uansett hvor dypt nede i kallkjeden, inkludert service-hjelpefiler som aldri ser `req`) automatisk lander på riktig tilkobling, og transaksjonen committes ved vellykket respons, rulles tilbake ellers.)

### 5.6 Berørte tabeller — og hvorfor filantallet ikke lenger er en handlingsliste

18 tabeller har i dag en `vendorId`-kolonne (kartlagt via `grep vendorId shared/schema.ts shared/models/*.ts`): `companies`, `companyUsers`, `projectInfo`, `logRow`, `rapportTemplates`, `vendorInstitutions`, `vendorIntegrations`, `imports`, `vendorSeatLog`, `apiKeys`, `apiUsageLog`, `caseReports`, `feedbackRequests`, `feedbackResponses`, `timesheetSubmissions`, `vendorInviteLinks`, `rapportAvvik`, `vendorAvvikProtokoller`, `vendorTemplates`, pluss `saker` og `users` (nullable `vendorId`, håndtert som i §5.4).

Med ALS-proxy-mønsteret i §5.5 er 56-filslisten IKKE lenger en liste over filer som må skrives om — de fleste trenger ingen endring i det hele tatt, siden `db`/`pool` fortsetter å virke som før. Det som faktisk gjenstår å avklare per fil er kun: hører denne filens db-bruk til (a) autentiseringskode som strukturelt kjører før `req.user` finnes, (b) bakgrunnsjobber/cron/migrasjon uten request-kontekst, (c) kode som kun berører globale/ikke-vendor-scopede tabeller (f.eks. e-postmaler, SEO-/crawler-data — RLS-policyen er uansett irrelevant for disse), eller (d) ekte forretningslogikk mot en vendor-scopet tabell i en autentisert request (som SKAL og automatisk VIL bli RLS-håndhevet av proxyen, uten kodeendring). Kategori (a) og (b) må aktivt hoppe UT av ALS-konteksten (eller aldri kjøre inne i den) for å beholde `tidum_system`-tilgang — resten av arbeidet er verifikasjon, ikke omskriving. Denne klassifiseringen (fil for fil, med begrunnelse) er selve leveransen til den første RLS-oppgaven i implementeringsplanen — ikke noe som skal gjettes på forhånd her.

### 5.7 Migreringsrekkefølge (unngå nedetid/lockout)

1. Opprett `tidum_app`-databaserolle og `tidum_system`-databaserolle (system-rollen er ny navngiving av dagens rolle — ingen funksjonell endring der).
2. Legg til policyene MEN ikke slå på `FORCE ROW LEVEL SECURITY` ennå (kun `ENABLE`, som tabelleieren fortsatt omgår) — verifiser policyene mot skyggetrafikk/staging først.
3. Rull ut ALS-proxyen og per-request-transaksjonsmiddlewaren; klassifiser alle 56 filene (§5.6) og flytt auth-/cron-/migrasjonskode eksplisitt UT av ALS-konteksten der den feilaktig ville arvet den, mens `tidum_system`-rollen fortsatt kan lese alt (sikkerhetsnett under overgangen).
4. Når klassifiseringen er verifisert komplett og korrekt: slå på `FORCE ROW LEVEL SECURITY`.
5. Fjern `tidum_system`-rollens generelle lesetilgang til vendor-tabellene utover det auth-oppslagene faktisk trenger (prinsippet om minste privilegium — presiseres i planen).

## 6. Arkitektur, del D — Kryptering av integrasjonshemmeligheter

Ny env-variabel `SECRETS_ENCRYPTION_KEY` (32 byte, base64), samme etablerte mønster som `EID_SSN_HASH_PEPPER`. AES-256-GCM (autentisert kryptering — GCM sitt auth-tag oppdager manipulerte ciphertext, ikke bare CBC).

- Nytt bibliotek: `server/lib/secret-crypto.ts` med `encryptSecret(plaintext: string): string` og `decryptSecret(ciphertext: string): string`. Format: `iv:authTag:ciphertext`, alle base64, kolonseparert.
- `vendorIntegrations.clientKey` og `userSettings.smtpAppPassword` krypteres ved skriving (i innstillings-rutene som setter disse feltene), dekrypteres kun der de faktisk brukes (PowerOffice-klienten, e-postutsendingskoden).
- Migreringsscript (`scripts/encrypt-existing-secrets.ts`, kjøres én gang ved deploy): leser alle eksisterende rader, krypterer klartekstverdien, skriver tilbake. Idempotent — hopper over rader som allerede matcher det krypterte formatet (`iv:authTag:ciphertext`-strukturen), slik at scriptet trygt kan kjøres flere ganger.
- Kolonnetype endres ikke (fortsatt `text`) — kryptert verdi er en streng.

## 7. Arkitektur, del E — 2FA/TOTP for admin-roller

Nytt bibliotek: `otplib` (aktivt vedlikeholdt, ingen tunge avhengigheter).

- Ny tabell `admin_totp_credentials`: `userId` (unik), `totpSecretEncrypted` (kryptert med samme `secret-crypto.ts` som del D — hemmeligheten er like sensitiv som et passord), `recoveryCodesHashed` (jsonb-array av 10 SHA-256-hashede engangskoder), `enrolledAt`, `lastUsedAt`.
- Håndheving gjelder rollene `super_admin`, `hovedadmin`, `vendor_admin` (`canAccessVendorApiAdmin()` i `shared/roles.ts` identifiserer nøyaktig denne gruppen allerede).
- Innføring: ved innlogging, hvis brukerens rolle er admin OG ingen TOTP er registrert OG det er under 30 dager siden utrulling (sammenlignet mot en fast rolloutdato lagret i miljøvariabel eller migrasjonstidspunkt) → varsel med lenke til oppsett, men innlogging tillates. Etter 30-dagersvinduet → oppsett er obligatorisk før dashbordet vises (egen mellomsteg-side, sesjonen er «halvautentisert» inntil TOTP er verifisert).
- Oppsett: server genererer secret, viser QR-kode (via `otplib` + en QR-rendering-lib — sjekk om en allerede er en avhengighet før ny legges til), bruker bekrefter med én kode for å fullføre enrollment, får presentert 10 gjenopprettingskoder ÉN gang (ikke hentbare igjen — kun ny hashet visning ved regenerering).
- Innlogging etter enrollment: after passord/eID-steget, krev 6-sifret TOTP-kode ELLER én gjenopprettingskode (som da merkes brukt og ikke kan brukes igjen).

## 8. Testing

- A1-A3: enhetstester på hver av de tre isolerte endringene (bypass av/på, hemmelighet kaster ved mangel, `rejectUnauthorized` er `true` i konfigurasjonen som bygges).
- B: integrasjonstest som verifiserer at en tilstandsendrende sesjons-rute avviser forespørsler uten gyldig CSRF-token, og at en Bearer-autentisert mobilrute IKKE krever det.
- C: dette er det tyngste testarbeidet. Per tabell: en test som (a) oppretter data for vendor A og vendor B på `tidum_app`-tilkoblingen, (b) verifiserer at en spørring med `app.vendor_id` satt til A kun ser A sine rader, (c) verifiserer at samme spørring uten satt sesjonsvariabel (fail-closed) ser ingen rader. Egen test på selve ALS-proxyen: to samtidige "requests" (simulert med to parallelle `requestDbStorage.run()`-kall) må aldri lekke hverandres tilkobling/sesjonsvariabler. Migreringsplanens steg 3-4 (§5.7) gir et konkret sjekkpunkt: ALLE 56 filer sin klassifisering (§5.6) bekreftet komplett og korrekt FØR `FORCE ROW LEVEL SECURITY` slås på.
- D: rundtur-test (krypter → dekrypter → samme verdi), og en test som bekrefter migreringsscriptet er idempotent (kjør to ganger, verifiser ingen dobbel-kryptering).
- E: enrollment-flyt, login med gyldig TOTP-kode, login med gyldig gjenopprettingskode (og at den deretter er brukt opp), login-forsøk med utløpt/feil kode avvist.
- Kjent miljøbegrensning (samme som resten av sesjonen): DB-berørende tester kan ikke kjøre fullt i denne sandboxen (ingen lokal Postgres-rolle) — vurderes ved lesing der de ikke kan kjøre, samme akseptable mønster som tidligere i prosjektet.

## 9. Global Constraints

- Ingen av de fem delene (A-E) skal endre eksisterende offentlige API-kontrakter (ruter, respons-shape) utover de nye feil-tilstandene som er beskrevet over.
- `tidum_system`-rollens bruk begrenses eksplisitt til: migrasjoner, seed, cron, og auth-oppslag som strukturelt kjører før `req.user` finnes — kode i disse kategoriene skal eksplisitt IKKE kjøre inne i `requestDbStorage`-konteksten. Enhver fil som bevisst forblir på `tidum_system` utenfor disse kategoriene skal være eksplisitt unntatt og begrunnet i planen (§5.6-klassifiseringen).
- Alle nye hemmeligheter (`SECRETS_ENCRYPTION_KEY`, `EMAIL_MAGIC_LINK_SECRET`, `AUTH_JWT_SECRET`) er PÅKREVDE ved oppstart i produksjon — appen skal feile raskt og tydelig ved mangel, ikke falle stille tilbake til noe usikkert.
- Ingen klartekst-hemmelighet (SMTP-passord, PowerOffice-nøkkel, TOTP-secret) skal noensinne logges — samme prinsipp som allerede etablert for fnr i eID-integrasjonene.
- RLS-utrullingen følger rekkefølgen i §5.7 — `FORCE ROW LEVEL SECURITY` slås aldri på før §5.6-klassifiseringen av alle 56 filer er bekreftet komplett.

## 10. Hva vi bevisst IKKE gjør nå

- Ekstern secrets-tjeneste (KMS/Vault) — én env-basert masternøkkel er tilstrekkelig for dagens skala, vurderes på nytt ved reell skalering.
- RLS på tabeller UTEN vendor-grense (f.eks. rene systemtabeller, sessions) — ingen gevinst, kun kompleksitet.
- 2FA for ikke-admin-roller — kan vurderes senere, ikke del av dette gap-punktet.
