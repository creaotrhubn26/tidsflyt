# Runbook — Auto-kjøregodt i prod (første ekte miljøarbeider-test)

Sjekkliste for å verifisere at auto-kjøregodt-flyten fungerer ende-til-ende
mot et faktisk miljøarbeider-besøk hos en klient. Følg stegene i rekkefølge.

**Forutsetning:** GDPR-retention-cron, GPS-samtykke-dialog, og sak-default-
lokasjon-UI er deployet i prod (commit `90769bc` eller nyere).

---

## 1. Vendor + sak-oppsett (10 min)

Som **vendor_admin** eller **tiltaksleder**:

- [ ] Logg inn på Tidum → `/cases`
- [ ] Opprett ny sak ELLER velg eksisterende. Sett:
  - Saksnummer: f.eks. `S-2026-001`
  - Tittel: kort beskrivelse av tiltaket
  - Klient-ref: pseudonym (f.eks. `Kund-1`) — IKKE klientens navn
  - Tildel saken til **én** miljøarbeider (testpersonen)
- [ ] Klikk 📍-knappen på saken → "Standard arbeidssted"-dialogen åpnes
- [ ] Søk i Kartverket — bruk klientens reelle adresse
  - **Forventet:** lat/lng fylles inn automatisk når du velger et søketreff
- [ ] Klikk "Lagre"
  - **Forventet:** Liten grønn prikk vises på 📍-knappen
- [ ] Verifiser i DB at adressen ble lagret:
  ```sql
  SELECT id, saksnummer, ekstra_felter
  FROM saker
  WHERE saksnummer = 'S-2026-001';
  ```
  - **Forventet:** `ekstra_felter.defaultLocation` har `address`, `lat`, `lng` satt

---

## 2. Miljøarbeider-onboarding (5 min)

Som **miljøarbeider** (testpersonen):

- [ ] Logg inn på Tidum (rolle: `miljoarbeider`)
- [ ] Sjekk at vendor-id er satt på brukeren:
  ```sql
  SELECT id, email, role, vendor_id FROM users WHERE email = '<testpersonens-email>';
  ```
- [ ] Åpne Tidum på telefonen (PWA — legg til på hjemmeskjerm hvis ønsket)
- [ ] Naviger til `/dashboard`
  - **Forventet:** "Hei, [fornavn]!"-overskrift over timer-kortet
  - **Forventet:** "Aktiv sak"-velger over timer-kortet med saken fra steg 1 i nedtrekksmenyen
  - **Forventet:** "Mangler arbeidssted"-merket vises IKKE (siden vi satte adresse i steg 1) — i stedet skal det stå **"Auto-kjøring aktiv"** med grønn pin

---

## 3. Klokk-inn på klientbesøk (det ekte testet)

Miljøarbeider drar til klientens adresse (eller en testlokasjon med samme
koordinater hvis de jobber fra hjemmekontor i dag).

- [ ] Når miljøarbeider er **fysisk hos klienten**, åpne Tidum
- [ ] Velg saken i sak-velgeren
- [ ] Trykk **"Fortsett"**
  - **Første gang:** GPS-samtykke-dialog vises
    - Les teksten — den siterer Arbeidsmiljøloven §9-1
    - Trykk **"Aktiver auto-kjøring"**
    - Mobile browser ber om GPS-tilgang → tillat
  - **Senere ganger:** ingen dialog
- [ ] Verifiser at timer kjører (klokken roterer)

---

## 4. Klokk-ut + auto-leg (DEN VIKTIGE SJEKKEN)

Etter at klientbesøket er ferdig:

- [ ] Trykk **"Ferdig"**
- [ ] Vent 1–2 sekunder
- [ ] **Forventet toast 1:** "Lagret — Timene er lagret i databasen"
- [ ] **Forventet toast 2 (auto-leg):** "Kjøring auto-registrert: X.X km til [adresse]"
  - Dette viser at:
    - GPS ble fanget ved klokk-inn
    - Sakens defaultLocation ble lest
    - Distansen ble beregnet med Haversine
    - Travel-leg ble opprettet via `POST /api/travel-legs`
  - Hvis kun toast 1 vises (ingen kjøring): GPS ble ikke fanget eller avstanden var < 0,3 km

---

## 5. Verifiser i DB (kritisk)

Som administrator (gjerne via psql eller Neon SQL editor):

- [ ] Sjekk at log_row-oppføringen ble laget:
  ```sql
  SELECT id, date, project, title, user_id, created_at
  FROM log_row
  WHERE user_id = '<testpersonens-id>'
    AND date = CURRENT_DATE
  ORDER BY created_at DESC
  LIMIT 1;
  ```
  - **Forventet:** `project` = saksnummer, `title` = "Registrert fra Min arbeidsdag — [tittel]"

- [ ] Sjekk at travel_legs-oppføringen ble laget:
  ```sql
  SELECT id, date, from_name, to_name, kilometers, total_amount,
         from_lat, from_lng, to_lat, to_lng,
         source, calculated_by, sak_id
  FROM travel_legs
  WHERE user_id = '<testpersonens-id>'
    AND date = CURRENT_DATE
  ORDER BY created_at DESC
  LIMIT 1;
  ```
  - **Forventet:**
    - `from_name` = "Stempling-posisjon"
    - `to_name` = klientens adresse (samme som i sak)
    - `kilometers` = realistisk tall (sjekk mot Google Maps)
    - `total_amount` = `kilometers × 3.50` (uten passasjer)
    - `from_lat/lng` = nær miljøarbeiderens fysiske posisjon ved klokk-inn
    - `to_lat/lng` = sakens registrerte koordinater
    - `source` = `primary`
    - `calculated_by` = `haversine`
    - `sak_id` = sakens UUID

---

## 6. Verifiser i UI

Tilbake i Tidum-appen:

- [ ] Naviger til `/dashboard` igjen
- [ ] Scroll ned til "Kjøring i dag"-boksen
  - **Forventet:** Dagens kjøretur listet med km + kr
- [ ] Trykk på kjøreturen → ledelse skal navigere til kjøreloggen
  - (Hvis ikke implementert ennå, dataen er minst tilgjengelig via `GET /api/travel-legs?date=YYYY-MM-DD`)

Som **tiltaksleder** (admin-rolle på samme vendor):

- [ ] Logg inn → `/timesheets` (når miljøarbeider sender inn månedsrapport)
- [ ] Verifiser at timeoppføringen er synlig
- [ ] Trykk "Vis historikk" → audit-trail viser opprettelsen

---

## 7. Edge cases å teste

Etter hovedflyten er bekreftet, kjør gjennom disse for å fange regresjoner:

- [ ] **Avslag på GPS-samtykke:**
  - Slett `userSettings.dashboardPrefs.gpsCaptureEnabled` for testpersonen i DB
  - Klokk inn → samtykke-dialog → trykk "Nei takk"
  - Klokk ut
  - **Forventet:** time_entry opprettes, men **ingen** travel_leg
  - DB:
    ```sql
    SELECT dashboard_prefs FROM user_settings WHERE user_id = '<id>';
    ```
    Skal vise `gpsCaptureEnabled: false`, `gpsConsentAt: <timestamp>`

- [ ] **Sak uten defaultLocation:**
  - Lag en ny sak uten å sette adresse
  - Tildel til testperson
  - Klokk inn på den → sak-velger viser "Mangler arbeidssted"
  - Klokk ut
  - **Forventet:** time_entry, men ingen travel_leg

- [ ] **Avstand under 0,3 km:**
  - Klokk inn fra hjemmekontor med en sak som har defaultLocation < 300m unna (eller manipuler GPS via DevTools til samme koordinat)
  - **Forventet:** time_entry, men ingen travel_leg (under terskel)

- [ ] **Edit-lock test:**
  - Etter at månedsrapporten er innsendt og godkjent, prøv å redigere en time-oppføring fra den måneden
  - **Forventet:** 423 Locked

- [ ] **GDPR-blur test (kjør om mange måneder, eller manipuler created_at):**
  ```sql
  -- For å teste manuelt:
  UPDATE travel_legs SET created_at = NOW() - INTERVAL '95 days' WHERE id = '<test-leg-id>';
  -- Trigger purge:
  curl -X POST $BASE/api/gdpr/purge/run -H "Cookie: …"
  -- Verifiser:
  SELECT from_lat, from_lng FROM travel_legs WHERE id = '<test-leg-id>';
  ```
  - **Forventet:** Koordinater avrundet til 3 desimaler

---

## 8. Rull tilbake / cleanup hvis testen feiler

Hvis noe gikk galt og du vil rydde:

```sql
-- Slett test-data
DELETE FROM travel_legs WHERE user_id = '<test-id>' AND date = CURRENT_DATE;
DELETE FROM log_row WHERE user_id = '<test-id>' AND date = CURRENT_DATE;
DELETE FROM timer_sessions WHERE user_id = '<test-id>';

-- Reset GPS-samtykke
UPDATE user_settings
SET dashboard_prefs = dashboard_prefs - 'gpsCaptureEnabled' - 'gpsConsentAt'
WHERE user_id = '<test-id>';
```

---

## 9. Hva skal det føre til

Hvis alle stegene over passerer mot prod, dere har:

- ✅ Bekreftet at auto-kjøregodt fungerer ende-til-ende mot ekte data
- ✅ Bekreftet at GPS-samtykke-flyten er compliance-trygg
- ✅ Bekreftet at edit-lock håndhever bokføringsloven §13
- ✅ Bekreftet at retention-cron rydder GPS-koordinater
- ✅ Et levende eksempel å vise potensielle barnevern-/kommune-kunder

**Klar for å onboarde flere miljøarbeidere etter dette.** Hvis ikke — log
hva som gikk galt med skjermbilder og DB-tilstand før hver feil.

---

## 10. Vanlige problemer

| Symptom | Sannsynlig årsak | Løsning |
|---|---|---|
| Sak-velger vises ikke | Bruker har ikke vendor_id i users-tabellen | `UPDATE users SET vendor_id = X WHERE id = ...` |
| Sak vises ikke i picker | `tildelteUserId` mangler bruker-id | `POST /api/saker/:id/tildel` med riktig userIds |
| GPS fanges ikke (stille) | OS-nivå GPS-tilgang er avslått | iOS Settings → Safari → Tilgang til posisjon |
| Auto-leg opprettes ikke selv om GPS ble fanget | Avstand < 0,3 km eller sak mangler `defaultLocation.lat/lng` | Sjekk `saker.ekstra_felter.defaultLocation` |
| `423 Locked` på senere edit | Måneden er allerede godkjent (riktig oppførsel) | Tiltaksleder eller admin bypasser |

---

*Sist oppdatert: 2026-04-25 — første prod-test av auto-kjøregodt-flyten.*
