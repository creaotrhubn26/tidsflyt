#!/usr/bin/env node
/**
 * Sandkassetest for Documaster-arkivintegrasjonen.
 *
 * Kjøring:
 *   DOCUMASTER_BASE_URL=... DOCUMASTER_CLIENT_ID=... \
 *   DOCUMASTER_CLIENT_SECRET=... DOCUMASTER_ARKIVDEL_ID=... \
 *   [DOCUMASTER_KLASSE_ID=...] [DOCUMASTER_TOKEN_URL=...] \
 *   npx tsx scripts/test-documaster-integration.ts
 *
 * DOCUMASTER_KLASSE_ID er valgfri — settes hvis instansen krever
 * primærklasse på saksmapper.
 *
 * DOCUMASTER_TOKEN_URL er valgfri — Documasters IdP kjører ofte på en
 * annen host/port enn selve arkiv-API-et (f.eks. Integration Test-
 * miljøet: IdP uten port, RMS-API på :8083). Sett denne til den
 * absolutte token-URL-en hvis DOCUMASTER_BASE_URL peker på RMS-hosten.
 *
 * Testene:
 * 1. OAuth2 token-flow + verify()
 * 2. Opprett test-saksmappe
 * 3. Idempotens — samme mappe to ganger gir samme id
 * 4. Opprett journalpost med dummy-PDF (upload + save)
 * 5. Feilhåndtering med ugyldig secret
 *
 * Scriptet bruker kun provider-laget (documaster-client + noark) —
 * ingen database kreves.
 */

import { createArchiveProvider } from "../server/lib/archive/archive-provider";
import { buildSaksmappeSpec, buildRapportJournalpost } from "../server/lib/archive/noark";

const c = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", blue: "\x1b[34m" };
const ok = (m: string) => console.log(`${c.green}✅ ${m}${c.reset}`);
const fail = (m: string) => console.log(`${c.red}❌ ${m}${c.reset}`);
const hint = (m: string) => console.log(`${c.yellow}   → ${m}${c.reset}`);
const section = (m: string) => console.log(`\n${c.blue}━━ ${m} ━━${c.reset}`);

const SKJERMING = {
  skjermingshjemmel: "Offl. § 13 jf. fvl. § 13",
  tilgangsrestriksjon: "UO",
};

async function main() {
  const baseUrl = process.env.DOCUMASTER_BASE_URL;
  const clientId = process.env.DOCUMASTER_CLIENT_ID;
  const clientSecret = process.env.DOCUMASTER_CLIENT_SECRET;
  const arkivdelId = process.env.DOCUMASTER_ARKIVDEL_ID;

  if (!baseUrl || !clientId || !clientSecret || !arkivdelId) {
    fail("Mangler miljøvariabler. Sett:");
    console.error(`
  DOCUMASTER_BASE_URL      ${baseUrl ?? "(ikke satt)"}
  DOCUMASTER_CLIENT_ID     ${clientId ?? "(ikke satt)"}
  DOCUMASTER_CLIENT_SECRET ${clientSecret ? "***" : "(ikke satt)"}
  DOCUMASTER_ARKIVDEL_ID   ${arkivdelId ?? "(ikke satt)"}
`);
    process.exit(1);
  }

  const klasseId = process.env.DOCUMASTER_KLASSE_ID || undefined;
  const tokenUrl = process.env.DOCUMASTER_TOKEN_URL || undefined;

  ok(`Base URL: ${baseUrl}`);
  ok(`Arkivdel: ${arkivdelId}`);
  if (klasseId) ok(`Primærklasse: ${klasseId}`);
  if (tokenUrl) ok(`Token-URL (overstyrt): ${tokenUrl}`);

  const provider = createArchiveProvider("documaster", {
    baseUrl,
    tokenUrl,
    clientId,
    clientSecret,
    arkivdelId,
    klasseId,
  });

  // En unik test-sak per kjøring, så gjentatte kjøringer ikke kolliderer.
  const runId = Date.now().toString(36);
  const testSak = {
    id: `sandkasse-${runId}`,
    saksnummer: `TEST-${runId}`,
    klientRef: "K-TEST",
  };

  section("Test 1: OAuth2 token + verify()");
  try {
    await provider.verify();
    ok("Token hentet og Arkiv-query svarte");
  } catch (err: any) {
    fail(`verify() feilet: ${err.message}`);
    if (err.status === 401) hint("Sjekk DOCUMASTER_CLIENT_ID / DOCUMASTER_CLIENT_SECRET");
    if (err.status === 403) hint("Klienten mangler lesetilgang til Noark 5-tjenestene");
    if (err.status === 404) hint("API- eller token-stien er feil — sjekk baseUrl og DOCUMASTER_TOKEN_URL");
    if (err.body) console.error("   Respons:", err.body);
    process.exit(1);
  }

  section("Test 2: Opprett saksmappe");
  const mappeSpec = buildSaksmappeSpec(testSak, SKJERMING, arkivdelId);
  console.log(`   tittel:    ${mappeSpec.tittel}`);
  console.log(`   eksternId: ${mappeSpec.eksternId}`);
  let mappe: { id: string; mappeIdent: string | null };
  try {
    mappe = await provider.ensureSaksmappe(mappeSpec);
    ok(`Saksmappe opprettet: id=${mappe.id}, ident=${mappe.mappeIdent}`);
  } catch (err: any) {
    fail(`ensureSaksmappe feilet: ${err.message}`);
    if (err.status === 400) hint("Sjekk arkivdelId og feltnavn (refArkivdel)");
    if (err.status === 422) hint("Skjermingsverdiene godtas kanskje ikke — spør Documaster om gyldige koder");
    if (err.status === 422 || err.status === 400)
      hint("Kan også skyldes at instansen krever refSekundaerKlasse (sekundær klassifisering) — se test-bootstrap.http steg 2.0/2.1. Denne klienten setter i dag kun refPrimaerKlasse.");
    if (err.body) console.error("   Respons:", err.body);
    process.exit(1);
  }

  section("Test 3: Idempotens (samme mappe på nytt)");
  const mappe2 = await provider.ensureSaksmappe(mappeSpec);
  if (mappe2.id === mappe.id) {
    ok(`Andre kall returnerte samme id (${mappe2.id}) uten å opprette duplikat`);
  } else {
    fail(`Idempotens brutt: ${mappe2.id} ≠ ${mappe.id}`);
    hint("eksternId-lookup (refEksternId.eksternID) treffer ikke — sjekk query-syntaks mot din versjon");
    process.exit(1);
  }

  section("Test 4: Journalpost med dummy-PDF (upload + save)");
  const dummyPdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n" +
      "trailer<</Size 4/Root 1 0 R>>\n%%EOF",
  );
  const jpSpec = buildRapportJournalpost(
    { id: `sandkasse-rapport-${runId}`, klientRef: "K-TEST", periodeFrom: new Date(), godkjent: new Date() },
    testSak,
    dummyPdf,
    SKJERMING,
  );
  console.log(`   tittel:    ${jpSpec.tittel}`);
  console.log(`   fil:       ${jpSpec.files[0].filename}`);
  try {
    const jp = await provider.createJournalpost(mappe.id, jpSpec);
    ok(`Journalpost opprettet: id=${jp.id}, ident=${jp.journalpostIdent}`);
  } catch (err: any) {
    fail(`createJournalpost feilet: ${err.message}`);
    if (err.status === 400) hint("Sjekk feltnavn (refMappe/journalposttype) mot din Documaster-versjon");
    if (err.status === 422) hint("Upload-id-referansen (refDokumentfil) kan ha annen form");
    if (err.body) console.error("   Respons:", err.body);
    process.exit(1);
  }

  section("Test 5: Feilhåndtering (ugyldig secret)");
  const badProvider = createArchiveProvider("documaster", {
    baseUrl,
    tokenUrl,
    clientId,
    clientSecret: "feil-secret",
    arkivdelId,
  });
  try {
    await badProvider.verify();
    fail("verify() med feil secret burde ha feilet");
    process.exit(1);
  } catch (err: any) {
    if (err.status === 400 || err.status === 401) {
      ok(`Fikk forventet feil (${err.status}): ${err.message}`);
    } else {
      console.log(`${c.yellow}⚠️  Fikk ${err.status ?? "ukjent"}-feil i stedet for 400/401 — sjekk at meldingen er forståelig${c.reset}`);
    }
  }

  section("Alle tester passerte 🎉");
  console.log(`
  Verifiser manuelt i Documaster-UI:
  • Saksmappen «${mappeSpec.tittel}» finnes i arkivdel ${arkivdelId}
  • Journalposten har skjerming (${SKJERMING.tilgangsrestriksjon} / ${SKJERMING.skjermingshjemmel})
  • PDF-en ligger som Hoveddokument i Arkivformat

  Neste steg: se docs/archive-sandbox-testing.md (full sjekkliste).
`);
}

main().catch((err) => {
  fail(`Uventet feil: ${err?.message ?? err}`);
  console.error(err);
  process.exit(1);
});
