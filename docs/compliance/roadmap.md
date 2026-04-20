# Tidum — Compliance & Integration Roadmap

Oversikt over kravene som gjør Tidum klar for norsk B2B-, offentlig- og helsesalg. Hver seksjon er sortert etter prioritet (**P0** = blokkerer salg, **P1** = sterk kjøpsfaktor, **P2** = nice-to-have). Siste oppdatering: 15. april 2026.

**Status-kodeks:**
- ✅ Ferdig
- 🚧 Under arbeid
- 📋 Planlagt
- ⏸️ Venter på ekstern input (credentials, DPIA, advokat)

---

## Fullført i dette releaset (15.04.2026)

| # | Leveranse | Hvor |
|---|---|---|
| ✅ | Turnstile prod-fix | `vite.config.ts` |
| ✅ | `/tilgjengelighet` (WCAG-erklæring) | `client/src/pages/tilgjengelighet.tsx` |
| ✅ | GDPR art. 15 + 17 API + UI | `server/routes/gdpr-routes.ts`, `client/src/pages/profile.tsx` |
| ✅ | Payroll CSV-eksport (Tripletex, Visma, PowerOffice) | `server/routes/payroll-export-routes.ts` |
| ✅ | Avvik / HMS-rapportering | migrasjon 033, `server/routes/avvik-routes.ts`, `client/src/pages/avvik.tsx` |
| ✅ | DPA-mal + behandlingsprotokoll | `docs/compliance/*.md` |
| ✅ | Invite-link sak-preassign | migrasjon 032 |
| ✅ | a11y-smoke-test-spec | `tests/a11y-public-pages.spec.ts` |
| ✅ | Blog-refresh (4 poster, SEO-optimalisert) | Neon `cms_posts` |

---

## P0 — Blokkerer offentlig sektor-salg (0–3 mnd)

### Identitet og innlogging

- ⏸️ **ID-porten (Digdir)** — OIDC. Kritisk for offentlig. Krever søknad til Digdir, får client_id/secret etter godkjenning (2–4 uker saksbehandling).
  - Issue: `int-id-porten`
  - Endepunkter: `/api/auth/idporten/login`, `/api/auth/idporten/callback`
  - Scopes: `openid`, `profile` (minimum). Evt. `krr` for kontaktinfo.
  - Dev-miljø: ver2.idporten.no (sandbox)

- ⏸️ **Microsoft Entra ID (Azure AD)** — SSO for bedriftskunder på 365. Multi-tenant app-registrering.
  - Issue: `int-entra`
  - Endepunkter: `/api/auth/entra/login`, `/api/auth/entra/callback`
  - App-registrering i Entra admin, redirect-URI whitelistes

- ⏸️ **BankID** (via Signicat eller Idfy) — pålogging + signering. BankID er standard for norsk tillit.
  - Issue: `int-bankid`
  - Leverandør-valg: Signicat (bedre docs, dyrere), Idfy (rimeligere), Verified (oppstart)
  - Scope-valg: autentisering vs. signering (signering dyrere)

### Compliance-dokumenter og rutiner

- 📋 **DPA digital signering** — la kunder signere DPA-malen ved onboarding, lagre signaturen i DB.
  - Issue: `comp-dpa-sign`
  - Integrerer med BankID (eller Signicat)
  - DB-tabell: `vendor_dpa_signatures`
  - UI: step i onboarding-flow + download-lenke

- 📋 **Innebygd sletterutine** — cron-jobb som anonymiserer brukerdata > 5 år gammel i henhold til bokføringsloven.
  - Issue: `comp-retention-cron`
  - `DELETE FROM log_row WHERE date < now() - interval '5 year 1 day'`
  - Audit-log ved hver kjøring

- 📋 **DPIA for barnevern / helse-data** — krever faktisk gjennomgang og dokumentasjon.
  - Issue: `comp-dpia`
  - Trenger juridisk input — ikke ren kode

- 📋 **Avviksvarsling-prosess** — interne rutiner + teknisk varsling til kunde innen 48 t ved sikkerhetsbrudd.
  - Issue: `comp-incident-response`
  - Runbook, varslingsmaler, kontaktpunkt (`security@tidum.no`)

### Tilgjengelighet

- 🚧 **WCAG-audit** — kjøre axe-core mot alle hovedsider, fikse kritiske/alvorlige brudd.
  - Issue: `a11y-audit-2026q2`
  - Test-spec finnes (`tests/a11y-public-pages.spec.ts`)
  - Kjør `npm run test:e2e -- tests/a11y-public-pages.spec.ts` etter `npm i -D @axe-core/playwright`

- 📋 **Tastaturnavigasjon rapport-editor** — Quill-editor har kjente svakheter. Bytte til tilgjengelig alternativ (TipTap, Lexical) eller egen lettvekts-editor.
  - Issue: `a11y-editor-replace`

### Lønnsintegrasjoner

- 🚧 **Tripletex API push** (CSV klar, OAuth-push neste)
  - Issue: `int-tripletex-api`
  - Docs: `https://tripletex.no/v2-docs`
  - Endepunkter: `/api/integrations/tripletex/{connect,callback,push-timer}`

- 🚧 **PowerOffice Go OAuth** — aktiv planlegging (se [PowerOffice-delen](#poweroffice-go-onboarding))
  - Issue: `int-poweroffice`
  - Whitelistede URL-er gitt til PowerOffice: se under

- 📋 **Visma Lønn SOAP/REST** — større selskap, lengre integrasjonstid.
  - Issue: `int-visma-lonn`
  - Krever Visma-partneravtale

---

## P1 — Sterk kjøpsfaktor (3–6 mnd)

### Offentlig sektor-integrasjoner

- 📋 **KS Fiks-plattformen** — sentral hub for kommunale integrasjoner.
  - Issue: `int-ks-fiks`
  - Tilgang: søk om klient-sertifikat fra KS
  - Moduler: FIKS IO (meldingsutveksling), FIKS Arkiv, FIKS Protokoll
  - Kritisk for salg til kommuner

- 📋 **Altinn 3** — roller og rettigheter, A-melding-utveksling.
  - Issue: `int-altinn-3`
  - Auto-fetch vendor-info fra Enhetsregisteret via Altinn
  - Skatteetaten A-melding-eksport (XSD)

- 📋 **EHF / PEPPOL-faktura** — lovpålagt for salg til offentlig sektor.
  - Issue: `int-ehf-peppol`
  - Access point: sannsynligvis via Tripletex/PowerOffice først, senere direkte
  - Format: UBL 2.1 invoice

### Sertifiseringer

- 📋 **ISO/IEC 27001** — 6–12 mnd prosess. Viktig for både konsern- og offentlig-salg.
  - Issue: `cert-iso-27001`
  - Velge sertifiserer (DNV, Bureau Veritas, Nemko)
  - Gap-analyse → tiltakspunkter → audit → sertifisering

- 📋 **Normen for helse- og omsorgstjenesten** (helsekundemarked)
  - Issue: `cert-normen`
  - Selv-deklarasjon mot Normens kontroller
  - Krever DPIA, incident-response og adekvat tilgangsstyring

- 📋 **Årlig penetrasjonstest** — Mnemonic, NetSecurity eller Watchcom
  - Issue: `sec-pentest-2026`
  - Budsjett: 80–150k NOK årlig
  - Leveranse: rapport med funnkategorisering + fixede issues

### Integrasjoner for dypbruk

- 📋 **Microsoft Graph (Outlook, Teams, SharePoint)** — kalender-synk, varsling, rapport-arkiv
  - Issue: `int-ms-graph`

- 📋 **Google Workspace** — tilsvarende for bedrifter som ikke bruker 365
  - Issue: `int-google-workspace`

- 📋 **SMS-varsling** (Link Mobility, Sendega eller Twilio)
  - Issue: `int-sms-varsling`
  - Rapport-reminder, innlogg-kode, kritiske avvik

---

## P2 — Vinn konsern + helse (6–12 mnd)

### Konsern-klare features

- 📋 **SCIM 2.0 for brukersynk** — Entra ID / Okta kan pushe bruker-tildelinger automatisk.
  - Issue: `feat-scim`

- 📋 **SAML 2.0 som alternativ til OIDC** — gamle ERP-er bruker fortsatt SAML
  - Issue: `int-saml`

- 📋 **Audit-log eksport** — full CSV/SIEM-eksport av alle endringer
  - Issue: `feat-audit-export`

### Helsesektor

- 📋 **DIPS integrasjon** — største EPJ i Norge (sykehus)
  - Issue: `int-dips`

- 📋 **Gerica (Visma)** — kommunal EPJ, brukes i hjemmetjeneste
  - Issue: `int-gerica`

### Barnevern-spesifikt

- 📋 **Familia (Visma)** — dominerer barnevernstjenesten i kommuner og Bufetat
  - Issue: `int-familia`
  - Lukket API — krever partneravtale med Visma

- 📋 **Modulus Barn** — alternativ til Familia
  - Issue: `int-modulus-barn`

- 📋 **Bufdir/Bufetat rapporterings-format** — standard XML for tiltaksrapport
  - Issue: `int-bufdir`

### Faktura og betaling

- 📋 **Egen EHF-generator** — uten å måtte gå via Tripletex
  - Issue: `feat-ehf-native`

- 📋 **Stripe for kort-betaling** — egne-abonnement
  - Issue: `int-stripe`

---

## Liste over P0/P1 issues klar for opprettelse i GitHub

Hvis du ønsker at jeg oppretter disse som faktiske GitHub-issues via `gh` CLI, kjør:

```
gh issue create --title "[P0] ID-porten OAuth integration" --label "compliance,p0,sales-blocker" --body-file <...>
```

Issues-listen (P0 først):

| Label | Tittel | Prioritet | Type |
|---|---|---|---|
| `int-id-porten` | ID-porten (Digdir) OIDC login | P0 | integration |
| `int-entra` | Microsoft Entra SSO (multi-tenant) | P0 | integration |
| `int-bankid` | BankID via Signicat/Idfy | P0 | integration, compliance |
| `int-tripletex-api` | Tripletex API push (beyond CSV) | P0 | integration |
| `int-poweroffice` | PowerOffice Go OAuth + push | P0 | integration |
| `comp-dpa-sign` | Digital DPA-signering | P0 | compliance |
| `comp-retention-cron` | Automatisk sletterutine (5-år) | P0 | compliance |
| `comp-dpia` | DPIA for barnevern-/helse-data | P0 | compliance, legal |
| `comp-incident-response` | Incident-response-prosess | P0 | compliance, security |
| `a11y-audit-2026q2` | WCAG 2.1 AA full audit + fixes | P0 | accessibility |
| `int-ks-fiks` | KS Fiks-plattformen | P1 | integration, public |
| `int-altinn-3` | Altinn 3 API (roller + A-melding) | P1 | integration, public |
| `int-ehf-peppol` | EHF/PEPPOL faktura-utgående | P1 | integration, invoicing |
| `cert-iso-27001` | ISO 27001 sertifisering | P1 | compliance, sales |
| `cert-normen` | Normen (helsesektor) | P1 | compliance, health |
| `int-ms-graph` | Microsoft Graph (Outlook/Teams) | P1 | integration |
| `int-visma-lonn` | Visma Lønn integrasjon | P1 | integration |
| `sec-pentest-2026` | Årlig penetrasjonstest | P1 | security |
| `int-sms-varsling` | SMS-varsling leverandør | P1 | integration |
| `feat-scim` | SCIM 2.0 bruker-synk | P2 | feature, enterprise |
| `int-saml` | SAML 2.0 alternativ | P2 | integration |
| `int-familia` | Familia (Visma) barnevern | P2 | integration, barnevern |
| `int-dips` | DIPS EPJ | P2 | integration, health |
| `int-bufdir` | Bufdir/Bufetat rapport-format | P2 | integration, barnevern |

---

## PowerOffice Go onboarding

**Status:** demo-klient "Creatorhub AS - API Test Client" mottatt 2026-04-20. Applikasjons-/klient-/abonnementsnøkler i Render (`tidum-backend`) env. Implementasjon pågår.

**Auth-flow (v2 — verifisert fra [docs](https://developer.poweroffice.net/documentation/authentication)):**

OAuth 2.0 **client_credentials** (RFC 6749 §4.4). Ingen bruker-redirect trengs.

```
POST {POWEROFFICE_AUTH_URL}
Authorization: Basic base64(POWEROFFICE_APPLICATION_KEY:POWEROFFICE_CLIENT_KEY)
Ocp-Apim-Subscription-Key: {POWEROFFICE_SUBSCRIPTION_KEY}
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
```

Access token: 20 min levetid. Cache per tenant, refresh on demand.

Subsequent API-kall:
```
Authorization: Bearer {access_token}
Ocp-Apim-Subscription-Key: {POWEROFFICE_SUBSCRIPTION_KEY}
```

**Per-tenant onboarding**: hver Tidum-kunde genererer sin egen `ClientKey` i egen PowerOffice-klient og limer den inn i Tidum (copy-paste, ingen OAuth-popup).

**Whitelistede URL-er (gitt til PowerOffice 2026-04-15, nå ubrukte):**
- `https://tidum.no/api/integrations/poweroffice/{callback,redirect}` — overflødige for client_credentials-flow, men harmløse å la stå registrert.

**Implementasjonsplan:**

1. DB: tabell `vendor_integrations` (vendor_id, provider, client_key, connected_at) — IKKE access/refresh tokens (caches i minne)
2. Server: `/api/integrations/poweroffice/{connect,status,disconnect,push-timer}` — dropp callback/redirect
3. Client: admin-UI for å lime inn ClientKey + "Push til PowerOffice"-knapp
4. Token-cache: in-memory per tenant, TTL ~19 min, refresh on demand

---

## Endringslogg

| Dato | Hva |
|---|---|
| 2026-04-15 | Første versjon. Dekker compliance-push, HMS, blog, payroll CSV, Turnstile-fix. |
| 2026-04-20 | PowerOffice Go demo-klient mottatt. Auth-flow korrigert til client_credentials (ikke auth_code). Env lagt til i Render. |

---

*Ansvarlig: produktteamet i Creatorhub AS (org.nr. 937 518 684).*
