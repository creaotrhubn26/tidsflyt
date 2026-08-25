# BOLA-sikkerhetsfikser — fremdriftsstatus

Branch: `claude/integrasjoner-innhold` (PR #21)
Sist oppdatert: 2026-08-25

## Oppsummering

To uavhengige BOLA-funn (broken object-level authorization) ble diagnostisert og fikset, hver gjennom flere runder der en fersk, uavhengig sikkerhetsgjennomgang fant nye hull i forrige runders fiks før den ble ansett lukket. Alle runder er verifisert (tester + `tsc` + live probe mot ekte dev-DB) og pushet.

## 1. `server/smartTimingRoutes.ts` — company logs/audit + vendor-admin-invite

**Funn:**
- `GET /api/company/logs` og `GET /api/company/audit` manglet tenant-scoping — enhver innlogget admin kunne lese en annen virksomhets logger.
- `POST /api/vendors/:id/admins` tillot kontoovertakelse: en angriper kunne invitere en e-post som allerede tilhørte en annen virksomhet, og UPDATE-en overskrev offerets `vendor_id`/rolle ubetinget.

**Fiksrunder (commits `0ff6779` → `9ff5798` → `570ceb9`):**
1. La til `vendorId` i `authenticate()`s sesjonsgren + tenant-sjekk på de to GET-rutene + første TENANT_MISMATCH-vakt på invite-ruten (kun `users`-tabellen).
2. Utvidet vakten til også å sjekke `tidum_company_users` og `tidum_admin_users`.
3. Kollapset de tre separate oppslagene til én `UNION ALL`-spørring med `::text`-cast (løste `tidum_admin_users.vendor_id` varchar-vs-number-mismatch og en `LIMIT 1`-uten-`ORDER BY`-bypass).

**Status:** Lukket, verifisert (26/26 tester, `tsc` rent), pushet.

## 2. `server/routes.ts` — access-request-godkjenning (confused deputy → kontoovertakelse)

**Funn:** `POST /api/access-requests` lar en angriper oppgi en vilkårlig e-post (`alt_hovedadmin_email`). Når en super_admin godkjenner forespørselen, skrev `ensureHovedadminForAccessRequest`/`syncApprovedPortalUser` ubetinget offerets `tidum_admin_users`/`users`-rad med angriperens `vendorId` og et passord angriperen kontrollerte.

**Fiksrunder:**
1. (`bacfc79`) TENANT_MISMATCH-vakter i begge hjelpefunksjonene + kompensernde revert av `access_requests`-raden i en manuell try/catch.
2. (`890df42`, runde 4) Uavhengig gjennomgang av runde 1 fant: delvis skriving kunne overleve en 409 (en foreldreløs `tidum_admin_users`-rad ble stående og kunne senere kapres via det ubeskyttede `POST /api/auth/email/request-link`-endepunktet), en case-sensitivitets-bypass i én av vaktene, og en brukket INSERT-gren (manglet NOT NULL `username`/`password`, som også hindret kompenserende revert fra å trigge). Løst ved å:
   - Pakke hele skrivesekvensen (`accessRequests`-oppdatering + begge hjelpefunksjoner) i én `db.transaction(...)` — enhver feil ruller nå automatisk tilbake ALT, ikke bare navngitte feilstrenger.
   - Normalisere e-post til lowercase én gang i `applyAccessRequestDecision`, og gjøre `syncApprovedPortalUser`s oppslag case-insensitivt.
   - Fikse INSERT-grenen til å speile det etablerte mønsteret i `smartTimingRoutes.ts` (username/password-placeholder for `users`-tabellens legacy NOT NULL-kolonner).
   - Fjerne rå SQL/feilmeldinger fra 500-responser i begge kallende ruter.

**Status:** Lukket. Uavhengig gjennomgang av runde 4 bekreftet kjeden dødt end-to-end via live probe (godkjenning → 409 → forsøk på `request-link` → offerets konto uendret). 4/4 regresjonstester grønne, `tsc` rent, `npm run build` grønn. Pushet i `890df42`.

## Kjent, bevisst uadressert (egne oppgaver)

- `ensureVendorForAccessRequest` er brukket mot faktisk databaseskjema (`org_number`/`institution_type` finnes ikke på `vendors`-tabellen) — blokkerer godkjenning uten eksplisitt valgt vendor. Ikke en sikkerhetslekkasje (feiler lukket), men en funksjonell bug.
- Samme funksjon kjører fortsatt utenfor transaksjonen (kan etterlate en foreldreløs `vendors`-rad ved en senere feil) — lav alvorlighetsgrad, ikke kontoovertakelse.
- `syncApprovedPortalUser`s tvillingfunksjon i `smartTimingRoutes.ts` har allerede riktig username/password-håndtering; ingen ytterligere handling nødvendig der.
- Predikerbar invite-passord-entropi (`bcrypt.hash(\`invite-${email}-${Date.now()}\`, 10)`) — egen, lavere prioritert oppgave.
