# Oppstart av Documaster-integrasjon for Halden

**Status 27.08.2026:** Tidums Documaster-adapter, Noark-pakker, sikker
konfigurasjon, arkivkø, kvitteringer og lokale kontrakttester er implementert.
Integrasjonen er ikke testet mot Haldens faktiske arkivtenant. Dokumentet er
arbeidsgrunnlaget når Halden og arkivleverandøren åpner testmiljøet.

## Hva som allerede fungerer i Tidum

- Documaster Noark 5-webtjenester v1 for token, query, transaction og upload.
- Separat `tokenUrl` når IDP ligger på en annen vert enn arkiv-API-et.
- Saksmappe og journalpost med `EksternId` for idempotent replay.
- Dokument og Dokumentversjon med hoveddokument/vedlegg og arkiv-/produksjonsformat.
- Skjermede, pseudonyme titler og konfigurerbare Noark-koder.
- Avsluttet sikker dialog som deterministisk manifest, transkript og rene vedlegg.
- Tenantavgrenset, transaksjonell outbox med claim-token, backoff, retry og kvittering.
- Kryptert klienthemmelighet og eksplisitt vertsallowlist for både API og IDP.

Dette betyr at oppstarten ikke er et nytt utviklingsprosjekt. Arbeidet er å
avklare Haldens API-generasjon og koder, konfigurere testtenant, kjøre
akseptanseløpet og justere adapteren dersom tenantens kontrakt avviker.

## Beslutningsport før teknisk oppkobling

Halden eller arkivleverandøren må skriftlig bekrefte:

1. at målet er **Documaster Noark 5-webtjenester v1** eller en kompatibel API;
2. URL til arkiv-API og absolutt OAuth2-token-URL;
3. OAuth2-flow, scopes og eventuelle krav til mTLS, VPN, IP-allowlisting eller
   separat nettverksforbindelse;
4. arkivdel-ID, administrativ enhet/journalenhet og eventuell primærklasse;
5. gyldig skjermingskode og hjemmel for barnevern;
6. tillatte journalposttyper og filformater;
7. hvem som kan kontrollere resultatet i Documaster-grensesnittet.

Hvis Halden bruker Elements eller en annen API-kontrakt, er ikke det automatisk
dekket av Documaster-adapteren. Da beholdes Noark-domenet og arkivkøen, mens en
egen `ArchiveProvider`-adapter bygges og kontrakttestes før oppkobling. Dette er
beskrevet som [priset opsjon O1](../anbud/2026-112379-halden-opsjon-elements-adapter.md),
med ett alternativt arkivmål per kommune. Samtidig levering til både Elements
og Documaster er ikke inkludert i O1.

## Ansvarsdeling

| Part | Leveranse før test |
|---|---|
| Halden kommune | Produkteier, testgodkjenning, arkivfaglige koder, godkjente syntetiske testdata og kontrollør i arkiv-UI |
| Arkivleverandør | Testtenant, API-/IDP-adresser, klientlegitimasjon, scopes, nettverkskrav og versjonsspesifikk dokumentasjon |
| Tidum | Sikker konfigurasjon, feltmapping, kjøring, feilhåndtering, teknisk bevis og retting av dokumenterte kontraktsavvik |

Legitimasjon skal leveres i godkjent hemmelighetskanal. Client secret skal ikke
sendes i e-post, sakssystem, chat eller legges i repository-filer.

## Konfigurasjon når tilgangen kommer

### Plattformmiljø

1. Legg både arkivvert og separat IDP-vert i `ARCHIVE_ALLOWED_HOSTS`, kommaseparert.
2. Kontroller at `TIDUM_SECRET_KEYRING` og `TIDUM_SECRET_ACTIVE_KEY_ID` kommer
   fra produksjonens hemmelighetshvelv.
3. Avklar utgående DNS, brannmur, proxy, mTLS og leverandørens eventuelle
   IP-allowlisting før første kall.

Eksempel uten virkelige adresser:

```env
ARCHIVE_ALLOWED_HOSTS=arkiv.test.example.no,idp.test.example.no
```

### Tenantkonfigurasjon i Tidum

En `barnevernsleder` åpner arkivkortet i innstillinger og registrerer:

- Base-URL for arkiv-API;
- separat token-URL dersom leverandøren oppgir den;
- client ID og client secret;
- arkivdel-ID;
- administrativ enhet/journalenhet;
- eventuell primærklasse-ID;
- skjermingshjemmel og tilgangsrestriksjonskode.

`POST /api/integrations/arkiv/connect` gjør en tokenforespørsel og en minimal
lesespørring før config lagres. Secret returneres aldri fra API-et. En separat
token-URL kan bare peke til en HTTPS-vert som også finnes i vertsallowlisten.

`autoArchive` gjelder godkjente rapporter. En avsluttet sikker dialog skal
alltid til arkivkøen; den skal ikke behandles som en valgfri e-postfunksjon.

## Akseptanseløp i testtenant

Bruk bare syntetiske personer og dokumenter som Halden har godkjent.

### A. Provider-test uten Tidum-database

Kjør `scripts/test-documaster-integration.ts`. Testen oppretter faktiske
testobjekter i sandkassen og skal derfor først kjøres når arkivleverandøren har
godkjent testprefiks og oppryddingsmåte.

Den verifiserer:

1. token og lesetilgang;
2. opprettelse av skjermet saksmappe;
3. idempotent oppslag på samme mappe;
4. upload og journalpost med test-PDF;
5. forståelig avvisning av ugyldig secret.

Kjøringen er dokumentert i `docs/archive-sandbox-testing.md`.

### B. Ende-til-ende fra Tidum

1. Opprett en syntetisk barnevernsmelding.
2. Opprett sikker dialog, send én melding og ett rent testvedlegg.
3. Avslutt dialogen og noter Tidum conversation-ID og archive-entry-ID.
4. Kontroller at outbox går `pending` → `processing` → `archived`.
5. Kontroller i Documaster at mappe, journalpost, manifest, transkript og
   vedlegg finnes med riktig skjerming.
6. Sammenlign dokumentantall og SHA-256-bevis i arkivkvitteringen.
7. Kjør retry/replay og bekreft at det ikke opprettes en ny mappe eller
   journalpost.
8. Test ugyldig legitimasjon og midlertidig 5xx; Tidum skal beholde data lokalt
   og bruke backoff uten å duplisere eksterne objekter.
9. Test med bruker fra en annen kommune; status, logg og retry skal ikke røpe
   eller endre Haldens arkivoppføringer.

### C. Arkivfaglig kontroll

Haldens arkivansvarlige signerer på:

- korrekt arkivdel, administrativ enhet og klassifikasjon;
- korrekt journalposttype, dokumentrekkefølge og variantformat;
- at offentlig tittel ikke røper navn, emne eller barnevernsopplysninger;
- korrekt skjermingskode og hjemmel;
- søkbar ekstern-ID og forståelig sporbarhet;
- at replay ikke lager duplikater.

## Bevis som skal lagres

| Bevis | Minimum |
|---|---|
| Teknisk kjøring | dato, miljø, commit, API-generasjon og resultat per teststeg |
| Tidum-kvittering | archive-entry-ID, ekstern mappe/journalpost, payload-hash og dokumentantall |
| Arkivskjermbilder | mappe, journalpost, skjerming og dokumentliste uten virkelige personopplysninger |
| Avvik | HTTP-status, leverandørens korrelasjons-ID og redigert feilkropp uten tokens/secrets |
| Godkjenning | navngitt arkivfaglig og teknisk godkjenner hos Halden |

## Go/no-go for produksjon

Produksjon åpnes først når alle punktene er oppfylt:

- [ ] API-generasjon og autentiseringsflow er bekreftet.
- [ ] Provider-test og Tidum ende-til-ende-test er grønne i kundens testtenant.
- [ ] Halden har godkjent koder, titler, skjerming og dokumentstruktur.
- [ ] Begge verter er allowlistet og nettverkskrav er verifisert.
- [ ] Produksjonslegitimasjon ligger i godkjent hvelv og er forskjellig fra test.
- [ ] Overvåking, varsling, retry-eier og hendelseshåndtering er avtalt.
- [ ] Retensjonsvedtak og juridisk-sperring-prosedyre er godkjent separat.
- [ ] Rollback og kontaktpunkter er prøvd i test.

## Rollback og feilmodus

`Koble fra` fjerner aktiv tilkoblingskonfigurasjon og stopper eksterne
arkivkall. Eksisterende arkivobjekter slettes aldri av Tidum. Lokale
outbox-rader og kvitteringer beholdes slik at feilede oppføringer kan spores og
replayes etter at korrekt config er gjenopprettet.

Ved tvetydig nettverksutfall skal man ikke opprette posten manuelt. Gjenopprett
tilkoblingen og bruk retry: adapteren søker først etter Tidums `EksternId`.

## Det som fortsatt krever ekstern tilgang

- Bekreftelse av faktisk tokenrespons, API-stier og transaction-respons.
- Bekreftelse av Haldens kodelister og obligatoriske felter.
- Visuell kontroll i Haldens Documaster-grensesnitt.
- Nettverks-, last-, timeout- og leverandørfeil mot den faktiske tjenesten.

Ingen av disse punktene skal omtales som produksjonsverifisert før testbeviset
foreligger.
