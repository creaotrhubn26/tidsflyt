/**
 * Unit-tester for Noark 5-byggerne og secret-box — de rene modulene i
 * arkivintegrasjonen (Documaster). Transport/DB testes ikke her.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "crypto";
import {
  buildBarnevernMeldingMappeSpec,
  buildJournalJournalpost,
  buildRapportJournalpost,
  buildSaksmappeSpec,
  buildSecureDialogJournalpost,
  formatPeriode,
  nextAttemptDelayMs,
} from "../../../../server/lib/archive/noark";
import { buildSecureDialogArchivePackage } from "../../../../server/lib/archive/secure-dialog-package";
import { validateArchiveBaseUrl } from "../../../../server/lib/archive/archive-url-policy";

const DEFAULTS = {
  skjermingshjemmel: "Offl. § 13 jf. bvl. § 13-1",
  tilgangsrestriksjon: "UO",
};

const SAK = {
  id: "11111111-1111-1111-1111-111111111111",
  saksnummer: "SAK-2026-042",
  tittel: "Oppfølging",
  klientRef: "Kund-7",
};

describe("noark builders", () => {
  it("bygger saksmappe med pseudonym tittel og skjerming", () => {
    const spec = buildSaksmappeSpec(SAK, DEFAULTS, "arkivdel-1");
    expect(spec.tittel).toBe("Tiltakssak SAK-2026-042 — Kund-7");
    expect(spec.offentligTittel).toBe("Tiltakssak SAK-2026-042");
    expect(spec.eksternId).toBe(`tidum:sak:${SAK.id}`);
    expect(spec.arkivdelId).toBe("arkivdel-1");
    expect(spec.skjerming?.skjermingshjemmel).toBe(DEFAULTS.skjermingshjemmel);
    expect(spec.skjerming?.tilgangsrestriksjon).toBe("UO");
    expect(spec.skjerming?.skjermingMetadata).toContain("tittel");
  });

  it("bygger journalpost med periode, klientref og PDF som arkivformat", () => {
    const rapport = {
      id: "22222222-2222-2222-2222-222222222222",
      klientRef: "Kund-7",
      periodeFrom: "2026-01-01",
      godkjent: new Date("2026-02-03T10:00:00Z"),
    };
    const pdf = Buffer.from("%PDF-1.4 test");
    const spec = buildRapportJournalpost(rapport, SAK, pdf, DEFAULTS);

    expect(spec.tittel).toBe("Rapport for januar 2026 — sak SAK-2026-042 (Kund-7)");
    expect(spec.offentligTittel).toBe("Rapport for januar 2026");
    expect(spec.journalposttype).toBe("X");
    expect(spec.eksternId).toBe(`tidum:rapport:${rapport.id}`);
    expect(spec.dokumentdato).toBe("2026-02-03");
    expect(spec.files).toHaveLength(1);
    expect(spec.files[0].variantformat).toBe("Arkivformat");
    expect(spec.files[0].mimeType).toBe("application/pdf");
    expect(spec.files[0].content).toBe(pdf);
    // Filnavn skal være trygt (ingen mellomrom/spesialtegn utover tillatt sett)
    expect(spec.files[0].filename).toMatch(/^[a-zA-Z0-9åæøÅÆØ._-]+\.pdf$/);
  });

  it("bygger journalpost for en sak-journaloppføring med tekstinnhold og eventuelle vedlegg", () => {
    const entry = {
      id: "33333333-3333-3333-3333-333333333333",
      content: "Hjemmebesøk gjennomført, ingen bekymringer.",
      createdAt: new Date("2026-03-10T09:00:00Z"),
    };
    const attachments = [
      { filename: "journal/x/y.pdf", originalName: "vedtak.pdf", mimeType: "application/pdf", content: Buffer.from("%PDF-1.4") },
    ];
    const spec = buildJournalJournalpost(entry, SAK, attachments, DEFAULTS);

    expect(spec.tittel).toBe("Journalnotat — sak SAK-2026-042 (Kund-7)");
    expect(spec.journalposttype).toBe("X");
    expect(spec.eksternId).toBe(`tidum:journal:${entry.id}`);
    expect(spec.dokumentdato).toBe("2026-03-10");
    expect(spec.files).toHaveLength(2);
    expect(spec.files[0].mimeType).toBe("text/plain");
    expect(spec.files[0].content.toString()).toBe(entry.content);
    expect(spec.files[0].variantformat).toBe("Produksjonsformat");
    expect(spec.files[1].originalName ?? spec.files[1].filename).toContain("vedtak");
  });

  it("tåler rapport uten sak og uten periode", () => {
    const spec = buildRapportJournalpost({ id: "abc" }, null, Buffer.from("x"), DEFAULTS);
    expect(spec.tittel).toBe("Rapport");
    expect(spec.offentligTittel).toBe("Rapport");
    expect(spec.dokumentdato).toBeUndefined();
  });

  it("formatPeriode håndterer ugyldige datoer", () => {
    expect(formatPeriode(null)).toBeNull();
    expect(formatPeriode("ikke-en-dato")).toBeNull();
    expect(formatPeriode("2026-06-15")).toBe("juni 2026");
  });

  it("backoff dobles per forsøk og har 24t-tak", () => {
    expect(nextAttemptDelayMs(0)).toBe(5 * 60 * 1000);
    expect(nextAttemptDelayMs(1)).toBe(10 * 60 * 1000);
    expect(nextAttemptDelayMs(3)).toBe(40 * 60 * 1000);
    expect(nextAttemptDelayMs(20)).toBe(24 * 60 * 60 * 1000);
  });

  it("bygger skjermet mappe og journalpost for sikker dialog", () => {
    const melding = { id: "44444444-4444-4444-4444-444444444444", meldingsnummer: "BVM-0101-42" };
    const mappe = buildBarnevernMeldingMappeSpec(melding, DEFAULTS, "arkivdel-1");
    expect(mappe.eksternId).toBe(`tidum:barnevern-melding:${melding.id}`);
    expect(mappe.offentligTittel).toBe("Barnevernssak");
    const files = [{
      filename: "dialog-manifest.json",
      mimeType: "application/json",
      content: Buffer.from("{}"),
      variantformat: "Produksjonsformat" as const,
    }];
    const journalpost = buildSecureDialogJournalpost(
      { id: "55555555-5555-5555-5555-555555555555", closedAt: "2026-08-27T10:00:00Z" },
      melding,
      files,
      DEFAULTS,
    );
    expect(journalpost.eksternId).toBe("tidum:secure-dialog:55555555-5555-5555-5555-555555555555");
    expect(journalpost.offentligTittel).toBe("Sikker dialog");
    expect(journalpost.files).toBe(files);
  });

  it("bygger deterministisk dialogmanifest med dokument- og auditkontrollsummer", () => {
    const input = {
      conversationId: "55555555-5555-5555-5555-555555555555",
      kommuneId: 7,
      barnevernMeldingId: "44444444-4444-4444-4444-444444444444",
      meldingsnummer: "BVM-0101-42",
      subject: "Oppfølging",
      closedAt: "2026-08-27T10:00:00.000Z",
      messages: [{
        id: "66666666-6666-6666-6666-666666666666",
        senderKind: "staff" as const,
        sentAt: "2026-08-27T09:00:00.000Z",
        content: "Sensitiv tekst",
      }],
      attachments: [{
        id: "77777777-7777-7777-7777-777777777777",
        messageId: "66666666-6666-6666-6666-666666666666",
        originalName: "vedtak.pdf",
        mimeType: "application/pdf",
        checksumSha256: "1c6c9d7b4a4a1dd8b807db0c21ff3d152b497639946022cc0ad090fb76c0a5ba",
        content: Buffer.from("%PDF-test"),
      }],
      auditEvents: [{
        id: "88888888-8888-8888-8888-888888888888",
        action: "message_sent",
        actorKind: "staff",
        messageId: "66666666-6666-6666-6666-666666666666",
        attachmentId: null,
        createdAt: "2026-08-27T09:00:01.000Z",
      }],
    };
    // Pakken verifiserer lagringskontrollsummen i service-laget. Bruk den
    // faktiske SHA-en her slik at manifesttesten også er realistisk.
    input.attachments[0].checksumSha256 = createHash("sha256").update(input.attachments[0].content).digest("hex");
    const first = buildSecureDialogArchivePackage(input);
    const second = buildSecureDialogArchivePackage(input);
    expect(first.payloadHash).toBe(second.payloadHash);
    expect(first.files.map((file) => file.filename)).toEqual(second.files.map((file) => file.filename));
    expect(first.manifest.documents).toHaveLength(2);
    expect(first.manifest.auditEventCount).toBe(1);
    expect(first.manifest.auditTrailSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first.manifest)).not.toContain("Sensitiv tekst");
  });
});

describe("archive URL policy", () => {
  it("avviser lokale/private mål og URL-legitimasjon", () => {
    expect(() => validateArchiveBaseUrl("http://documaster.example.no")).toThrow();
    expect(() => validateArchiveBaseUrl("https://127.0.0.1")).toThrow();
    expect(() => validateArchiveBaseUrl("https://169.254.169.254/latest/meta-data")).toThrow();
    expect(() => validateArchiveBaseUrl("https://user:secret@documaster.example.no")).toThrow();
    expect(validateArchiveBaseUrl("https://documaster.example.no").hostname).toBe("documaster.example.no");
  });

  it("krever eksplisitt vertsallowlist i produksjon", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllowed = process.env.ARCHIVE_ALLOWED_HOSTS;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ARCHIVE_ALLOWED_HOSTS;
      expect(() => validateArchiveBaseUrl("https://documaster.example.no")).toThrow(/ALLOWLISTED/);
      process.env.ARCHIVE_ALLOWED_HOSTS = "documaster.example.no";
      expect(validateArchiveBaseUrl("https://documaster.example.no").hostname).toBe("documaster.example.no");
    } finally {
      if (previousNodeEnv == null) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousAllowed == null) delete process.env.ARCHIVE_ALLOWED_HOSTS;
      else process.env.ARCHIVE_ALLOWED_HOSTS = previousAllowed;
    }
  });
});

describe("secret-box", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.TIDUM_SECRET_KEY;
    delete process.env.TIDUM_SECRET_KEYRING;
    delete process.env.TIDUM_SECRET_ACTIVE_KEY_ID;
  });

  it("forsegler og åpner rundtur med nøkkel satt", async () => {
    process.env.TIDUM_SECRET_KEY = "test-key-with-plenty-of-entropy-123";
    const { sealSecret, openSecret, isSecretBoxConfigured } = await import("../../../../server/lib/secret-box");
    expect(isSecretBoxConfigured()).toBe(true);
    const sealed = sealSecret("super-hemmelig-client-secret");
    expect(sealed).toMatch(/^enc:v2:legacy-v1:/);
    expect(sealed).not.toContain("super-hemmelig");
    expect(openSecret(sealed)).toBe("super-hemmelig-client-secret");
  });

  it("returnerer legacy klartekst uendret", async () => {
    process.env.TIDUM_SECRET_KEY = "test-key-with-plenty-of-entropy-123";
    const { openSecret } = await import("../../../../server/lib/secret-box");
    expect(openSecret("gammel-klartekst")).toBe("gammel-klartekst");
  });

  it("faller tilbake til klartekst uten nøkkel (dev)", async () => {
    const { sealSecret, isSecretBoxConfigured } = await import("../../../../server/lib/secret-box");
    expect(isSecretBoxConfigured()).toBe(false);
    expect(sealSecret("verdi")).toBe("verdi");
  });

  it("nekter å åpne forseglet verdi uten nøkkel", async () => {
    process.env.TIDUM_SECRET_KEY = "key-a-with-plenty-of-entropy-456789";
    const first = await import("../../../../server/lib/secret-box");
    const sealed = first.sealSecret("hemmelig");

    vi.resetModules();
    delete process.env.TIDUM_SECRET_KEY;
    const second = await import("../../../../server/lib/secret-box");
    expect(() => second.openSecret(sealed)).toThrow(/krypteringsnøkkel/);
  });

  it("åpner gammel nøkkelversjon og pakker om til aktiv versjon", async () => {
    process.env.TIDUM_SECRET_KEYRING = JSON.stringify({
      "2026-08": "old-test-key-with-plenty-of-entropy",
      "2026-11": "new-test-key-with-plenty-of-entropy",
    });
    process.env.TIDUM_SECRET_ACTIVE_KEY_ID = "2026-08";
    const secretBox = await import("../../../../server/lib/secret-box");
    const oldEnvelope = secretBox.sealSecret("rotasjonsklar");
    expect(secretBox.sealedSecretKeyId(oldEnvelope)).toBe("2026-08");

    process.env.TIDUM_SECRET_ACTIVE_KEY_ID = "2026-11";
    expect(secretBox.openSecret(oldEnvelope)).toBe("rotasjonsklar");
    const rotated = secretBox.rewrapSecret(oldEnvelope);
    expect(secretBox.sealedSecretKeyId(rotated)).toBe("2026-11");
    expect(secretBox.openSecret(rotated)).toBe("rotasjonsklar");
  });

  it("pakker om sikker dialog uten å endre innholdschifferet", async () => {
    process.env.TIDUM_SECRET_KEYRING = JSON.stringify({
      "2026-08": "old-dialog-key-with-plenty-of-entropy",
      "2026-11": "new-dialog-key-with-plenty-of-entropy",
    });
    process.env.TIDUM_SECRET_ACTIVE_KEY_ID = "2026-08";
    const content = await import("../../../../server/lib/secure-dialog-content");
    const sealed = content.sealSecureDialogContent("uforanderlig dialogtekst");
    const before = sealed.split(":");
    expect(before).toHaveLength(7);

    process.env.TIDUM_SECRET_ACTIVE_KEY_ID = "2026-11";
    const rotated = content.rewrapSecureDialogContent(sealed);
    const after = rotated.split(":");
    expect(after.slice(4)).toEqual(before.slice(4));
    expect(after[2]).toBe("2026-11");
    expect(content.openSecureDialogContent(rotated)).toBe("uforanderlig dialogtekst");
  });
});
