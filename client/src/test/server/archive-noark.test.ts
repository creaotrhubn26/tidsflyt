/**
 * Unit-tester for Noark 5-byggerne og secret-box — de rene modulene i
 * arkivintegrasjonen (Documaster). Transport/DB testes ikke her.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildJournalJournalpost,
  buildRapportJournalpost,
  buildSaksmappeSpec,
  formatPeriode,
  nextAttemptDelayMs,
} from "../../../../server/lib/archive/noark";

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
});

describe("secret-box", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.TIDUM_SECRET_KEY;
  });

  it("forsegler og åpner rundtur med nøkkel satt", async () => {
    process.env.TIDUM_SECRET_KEY = "test-key-with-plenty-of-entropy-123";
    const { sealSecret, openSecret, isSecretBoxConfigured } = await import("../../../../server/lib/secret-box");
    expect(isSecretBoxConfigured()).toBe(true);
    const sealed = sealSecret("super-hemmelig-client-secret");
    expect(sealed).toMatch(/^enc:v1:/);
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
    expect(() => second.openSecret(sealed)).toThrow(/TIDUM_SECRET_KEY/);
  });
});
