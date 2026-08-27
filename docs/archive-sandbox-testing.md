# Documaster sandkassetest

**Formål:** Verifisere at arkivintegrasjonen fungerer mot en ekte
Documaster-instans. Se først
[`docs/runbooks/documaster-implementeringsoppstart.md`](runbooks/documaster-implementeringsoppstart.md)
for ansvar, beslutningsport, beviskrav og produksjonsaksept.

**Nåværende status:** Scriptet og transportkontrakten er verifisert lokalt,
men er ikke kjørt mot Haldens tenant. Scriptet oppretter testmappe og
journalpost i målmiljøet; bruk bare syntetiske, godkjente testdata.

## 1. Få Documaster Sandbox-tilgang

Kontakt Documaster support med følgende:

- **Hva:** OAuth2 test-klient (client_credentials flow) for Noark 5 REST API
- **Miljø:** Sandbox/test-instans
- **Scopes:** Lesing og skriving til Saksmappe, Journalpost, Dokument,
  Dokumentversjon, EksternId og filopplasting
- **Nettverk:** Be leverandøren bekrefte DNS, brannmur, VPN, mTLS og eventuell
  IP-allowlisting. HTTPS alene avgjør ikke nettverkskravene.

Du mottar:
- **Base URL** — f.eks. `https://sandbox-documaster.example.no`
- **Client ID** — ditt OAuth2 client_id
- **Client Secret** — ditt OAuth2 client_secret
- **Arkivdel-ID** — hvilken arkivdel journalposter skal arkiveres til

## 2. Lokalt oppsett

### Miljøvariabler

Opprett `.env.local` (eller `.env.test` hvis du kjører tests):

```env
# Dokumentaster sandbox
DOCUMASTER_BASE_URL=https://sandbox-documaster.example.no
DOCUMASTER_TOKEN_URL=https://idp.sandbox-documaster.example.no/oauth2/token
DOCUMASTER_CLIENT_ID=<ditt-client-id>
DOCUMASTER_CLIENT_SECRET=<ditt-client-secret>
DOCUMASTER_ARKIVDEL_ID=<arkivdel-id>

# Krypteringsnøkkel for test (kan være vilkårlig for dev)
TIDUM_SECRET_KEY=test-secret-key-32-chars-minimum-here
```

Ikke commit denne filen. Bruk helst midlertidige shellvariabler eller lokalt
hemmelighetshvelv, og roter test-secret dersom den er delt i en usikker kanal.

### Steg 1: Verifiser OAuth2 token-flow

Kjør curl-kommandoen manuelt:

```bash
curl -X POST \
  "${DOCUMASTER_TOKEN_URL:-${DOCUMASTER_BASE_URL}/idp/oauth2/token}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${DOCUMASTER_CLIENT_ID}&client_secret=${DOCUMASTER_CLIENT_SECRET}"
```

**Forventet respons:**

```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Hvis det feiler:**
- `401` → client_id/secret er feil
- `403` → klienten har ikke tilgang til OAuth2-endepunktet
- `500` → Documaster-server-feil — kontakt support

### Steg 2: Verifiser query-API (lese)

Med token fra steg 1:

```bash
curl -X POST \
  "${DOCUMASTER_BASE_URL}/rms/api/public/noark5/v1/query" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Documaster-Error-Response-Type: application/json" \
  -d '{
    "type": "Arkiv",
    "limit": 1
  }'
```

**Forventet respons:**

```json
{
  "results": [
    {
      "id": "12345",
      "type": "Arkiv",
      "fields": {
        "tittel": "Hoveddokumentalregisteret"
      }
    }
  ]
}
```

**Hvis det feiler:**
- `401/403` → token utløpt eller klienten mangler lesetilgang
- `400` → feil i query-syntaksen
- `404` → API-stien er feil (sjekk DOCUMASTER_BASE_URL)

### Steg 3: Verifiser transaction-API (skrive)

Med token fra steg 1. Merk at referanser (som `refArkivdel`) settes med egne
`link`-actions — ikke som felter i `save`:

```bash
curl -X POST \
  "${DOCUMASTER_BASE_URL}/rms/api/public/noark5/v1/transaction" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Documaster-Error-Response-Type: application/json" \
  -d '{
    "actions": [
      {
        "action": "save",
        "type": "Saksmappe",
        "id": "@test-mappe",
        "fields": {
          "tittel": "TEST: Tidum Sak 12345",
          "offentligTittel": "Sak 12345"
        }
      },
      {
        "action": "link",
        "type": "Saksmappe",
        "id": "@test-mappe",
        "ref": "refArkivdel",
        "linkToId": ["'${DOCUMASTER_ARKIVDEL_ID}'"]
      }
    ]
  }'
```

**Forventet respons:**

```json
{
  "saved": {
    "@test-mappe": {
      "id": "67890",
      "type": "Saksmappe",
      "fields": {
        "tittel": "TEST: Tidum Sak 12345",
        "mappeIdent": "2026/12345"
      }
    }
  }
}
```

**Hvis det feiler:**
- `401/403` → klienten mangler skrivetilgang
- `400` → refArkivdel er feil eller feltet finnes ikke
- `422` → data validerer ikke mot Noark 5-skjemaet

## 3. Kjør tester i Tidum

Når curl-kommandoene fungerer, kan du teste mot databasen:

### Alternativ A: Via API-endepunkt (enklest)

```bash
# 1. Start serveren
npm run dev

# 2. I en annen terminal — connect til Documaster sandbox
curl -X POST \
  "http://localhost:3000/api/integrations/arkiv/connect" \
  -H "Authorization: Bearer ${YOUR_BEARER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "documaster",
    "baseUrl": "'${DOCUMASTER_BASE_URL}'",
    "clientId": "'${DOCUMASTER_CLIENT_ID}'",
    "clientSecret": "'${DOCUMASTER_CLIENT_SECRET}'",
    "arkivdelId": "'${DOCUMASTER_ARKIVDEL_ID}'"
  }'
```

**Forventet respons:**

```json
{
  "id": 1,
  "vendorId": 1,
  "provider": "documaster",
  "baseUrl": "https://sandbox-documaster.example.no",
  "clientId": "...",
  "arkivdelId": "...",
  "connected": true,
  "status": "active",
  "lastVerifiedAt": "2026-08-03T10:30:00Z"
}
```

### Alternativ B: Via test-script (anbefalt først — ingen database kreves)

Ferdig script ligger i `scripts/test-documaster-integration.ts`. Det tester
token-flow, saksmappe-opprettelse, idempotens, journalpost med dummy-PDF og
feilhåndtering — kun mot provider-laget, uten Tidum-database.

```bash
DOCUMASTER_BASE_URL=https://sandbox-documaster.example.no \
DOCUMASTER_TOKEN_URL=https://idp.sandbox-documaster.example.no/oauth2/token \
DOCUMASTER_CLIENT_ID=... \
DOCUMASTER_CLIENT_SECRET=... \
DOCUMASTER_ARKIVDEL_ID=... \
npx tsx scripts/test-documaster-integration.ts
```

Hver kjøring bruker et unikt saksnummer (`TEST-<runId>`), så gjentatte
kjøringer kolliderer ikke. Ved feil skriver scriptet ut HTTP-status,
responskropp og et hint om sannsynlig årsak.

## 4. Verifiseringschecklist

Før du godtar integrasjonen:

- [ ] **OAuth2 token-flow** — `verify()` returnerer uten feil
- [ ] **Query-API** — kan spørre etter eksisterende Arkiv
- [ ] **Transaction-API** — kan lage test-saksmappe (save + link refArkivdel)
- [ ] **Upload-API** — kan laste opp dummy-PDF
- [ ] **Journalpost-opprettelse** — save + link for Journalpost, Dokument og Dokumentversjon
- [ ] **Idempotens** — kjør samme test 2 ganger, andre gang skal returnere samme IDs
- [ ] **Skjerming** — verifiser at skjermingskoden (M500) settes og at koden finnes i instansens kodeliste
- [ ] **eksternId-lookup** — query etter `refEksternId.eksternID = "tidum:sak:..."` finner posten
- [ ] **Error-handling** — test med feil client_secret, verifiser at `DocumasterError` har riktig status/message

## 5. Kjente problemer og fixes

### Token-endepunktet finnes ikke (404) eller feil grant_type

Token utstedes av Documaster IDP, som ofte kjører på **egen host** —
offisielt endepunkt er `https://{idpserver}/oauth2/token`
(github.com/documaster/idp-web-services). `tokenUrl` godtar en absolutt URL:

```typescript
createArchiveProvider("documaster", {
  baseUrl: "https://kunde.documaster.no",
  tokenUrl: "https://idp.kunde.documaster.no/oauth2/token",
  clientId: "...",
  clientSecret: "...",
})
```

Merk også: klassisk Documaster IDP dokumenterer authorization_code- og
password-flow; **client_credentials** hører til det nyere «Noark5 Compliant
API». Avklar med Documaster hvilken API-generasjon og flow sandkassen
bruker — dette er et konkret spørsmål å stille ved onboarding.

Standardstiene ellers er de offisielle
(`/rms/api/public/noark5/v1/{query,transaction,upload}`) og skal normalt
ikke overstyres.

### Skjerming godtas ikke

`skjerming` (M500) er en kode fra instansens kodeliste, og listen er **tom
som standard** — koden må konfigureres i Documaster før bruk. Sjekk gyldige
koder med:

```bash
curl "${DOCUMASTER_BASE_URL}/rms/api/public/noark5/v1/code-lists?type=Journalpost&field=skjerming" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

Klienten sender `tilgangsrestriksjon`-verdien fra Tidum-configen (f.eks.
`"UO"`) som kode — den må matche en kode i listen. Hjemmelen
(`skjermingshjemmel`) ligger som `authority` på selve kodeverdien i
Documaster.

### administrativEnhet avvises

`administrativEnhet` (M305) er påkrevd på Saksmappe og må finnes i
instansens kodeliste (også tom som standard). Klienten sender
`journalenhet`-verdien fra Tidum-configen; sjekk gyldige koder:

```bash
curl "${DOCUMASTER_BASE_URL}/rms/api/public/noark5/v1/code-lists?type=Saksmappe&field=administrativEnhet" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

### Instansen krever primærklasse på saksmapper

Noen Documaster-oppsett har et primært klassifikasjonssystem på arkivdelen
og krever at mapper knyttes til en Klasse. Sett `klasseId` i configen
(UI: «Primærklasse-ID» i connect-skjemaet, eller `DOCUMASTER_KLASSE_ID` i
testscriptet) — mappen får da en `refPrimaerKlasse`-link. Finn klasse-id:

```bash
curl -X POST "${DOCUMASTER_BASE_URL}/rms/api/public/noark5/v1/query" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Klasse",
    "limit": 10,
    "query": "refKlassifikasjonssystem.refArkivdelSomPrimaer.id = @arkivdel",
    "parameters": { "@arkivdel": "'${DOCUMASTER_ARKIVDEL_ID}'" }
  }'
```

### Arkivdel-ID finnes ikke

Verifiser at arkivdelen finnes via query:

```bash
curl -X POST "${DOCUMASTER_BASE_URL}/rms/api/public/noark5/v1/query" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Arkivdel",
    "limit": 10
  }'
```

## 6. Produksjon

Når sandkassetesting er OK:

1. **Få produksjon-credentials fra Documaster** — eget client_id/secret, annen base URL
2. **Oppdater dokumentasjonen** — fjern `[ ]` fra `docs/integrations/documaster.md` punkt «Sandkasseverifisering»
3. **Deploy** — legg API- og IDP-vert i `ARCHIVE_ALLOWED_HOSTS`, kontroller
   den versjonerte Tidum-nøkkelringen og registrer tenantconfig via arkivkortet
   i innstillinger. `DOCUMASTER_*` brukes av testscriptene, ikke av
   produksjonsserveren.
4. **Monitor** — følg `archive_entries`, arkivkvitteringene og relevante
   audit-hendelser de første timene.

Arkivarbeideren kjører hvert femte minutt; bruk arkivloggen i innstillinger for
status og kontrollert retry.
