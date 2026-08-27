# Elements arkivprovider – aktivering etter avtale

**Status 27.08.2026:** Implementert og avslått som standard. Lokal
transportkontrakttest er på plass. Integrasjonen er ikke produksjonsverifisert
mot Haldens Elements-instans og kan ikke aktiveres før kontrakt, tilgang og
kundetest foreligger.

## Støttet kontrakt

Provideren støtter bare Nasjonalarkivets HATEOAS-baserte **Noark 5
tjenestegrensesnitt 1.1**, lagret som kontraktprofil
`elements-noark5-tg-1.1`. Endepunkter for arkivstruktur, sakarkiv, metadata,
opprettelse og filopplasting oppdages fra API-rotens relasjonslenker.

Sikri beskriver at Elements kan integreres via REST/SOAP, men offentlig
produktinformasjon angir ikke Haldens konkrete kontrakt. Dersom avtalen gir en
annen kontrakt enn tjenestegrensesnitt 1.1, skal ikke denne provideren
aktiveres; transportlaget må da tilpasses og kontrakttestes først.

## Sikker aktiveringsport

Elements er utilgjengelig inntil alle disse vilkårene er oppfylt:

1. Driftsmiljøet har `ELEMENTS_ARCHIVE_ENABLED=true`.
2. API- og IDP-verter er eksplisitt ført i `ARCHIVE_ALLOWED_HOSTS`.
3. `TIDUM_SECRET_KEYRING` og `TIDUM_SECRET_ACTIVE_KEY_ID` er konfigurert slik
   at OAuth-hemmeligheten lagres forseglet.
4. Kunden har levert API-rot, OAuth2 token-URL, client ID/secret, arkivdel-ID,
   eventuell klasse-ID og kodelister.
5. Elements har registrert en virksomhetsspesifikk strengmetadata for replay-
   sikker ekstern ID, normalt `vnd-tidum-v1:eksternid`.
6. Tjenestekontoen har minste nødvendige lese-/opprettelsesrettigheter til
   avtalt arkivdel.

Uten global aktivering returnerer API-et avslag før Elements-nettverket
kontaktes. Konfigurasjonen lagres bare etter at token, protokollversjon,
HATEOAS-relasjoner, metadata, arkivdel og opprettelsesrettighet er verifisert.

## Aktivering per kommune

En `barnevernsleder` eller annen autorisert konfigurasjonsrolle går til
innstillinger og velger **Elements** under Arkiv. Følgende lagres tenantbundet:

- provider `elements`;
- kontraktprofil `elements-noark5-tg-1.1`;
- API-rot og separat token-URL;
- client ID og forseglet client secret;
- arkivdel, eventuell primærklasse og journalenhet;
- ekstern-ID-metadata og standard skjerming.

Tidum bruker fortsatt ett aktivt arkivmål per kommune. Bytte av mål blokkeres
mens arkivjobber venter eller behandles; det samme gjelder frakobling. Ved
godkjent bytte slettes bare lokale provider-spesifikke mappekoblinger; ingen
eksterne arkivobjekter slettes.

## Implementert flyt

1. Hent OAuth2-token med `client_credentials`.
2. Verifiser Noark 5 tjenestegrensesnitt `1.1` og påkrevde relasjoner.
3. Verifiser avtalt ekstern-ID-metadata og arkivdel/klasse.
4. Finn eller opprett saksmappe med skjerming og ekstern ID.
5. Finn eller opprett journalpost med skjerming og ekstern ID.
6. Finn eller opprett dokumentbeskrivelse per fil og last opp innhold.
7. Verifiser SHA-256-kontrollsum og forventet variantformat i kvitteringen.
8. Ved tvetydig nettverksutfall søkes objektet opp igjen før retry, slik at en
   delvis fullført leveranse ikke blir feilaktig kvittert eller duplisert.

Rapporter, sakjournalnotater og avsluttede sikre dialoger bruker samme outbox,
backoff, tenantkontroll, arkivbevis og retensjonskobling som Documaster.

## Akseptanse før produksjon

- [ ] Signert avtale og bekreftet kontraktprofil.
- [ ] Migrasjon `076_elements_archive_provider.sql` er kjørt.
- [ ] Testtenant og syntetiske data er tilgjengelige.
- [ ] Normal arkivering av mappe, journalpost, hoveddokument og vedlegg.
- [ ] Sikker dialog gir manifest, transkript og korrekte kontrollsummer.
- [ ] Replay etter simulert timeout gir ingen duplikater og fullfører manglende
      dokumenter.
- [ ] Skjerming, offentlig tittel, klasse og journalenhet er arkivfaglig
      godkjent.
- [ ] Kryss-tenant status, logg, retry og konfigurasjon er avvist.
- [ ] Signert testprotokoll med eksterne ID-er og skjermbilder fra Elements.

Mock-/kontrakttest alene er ikke produksjonsakseptanse.

## Kilder for kontraktsvalget

- Nasjonalarkivet: `noark5-tjenestegrensesnitt-standard`, versjon 1.1.
- Sikri: Elements er Noark 5.5.0-godkjent og tilbyr integrasjon via REST/SOAP.
- Sikri: Elements Arkiv kan brukes som frittstående arkivkjerne med andre
  fagsystemer.
