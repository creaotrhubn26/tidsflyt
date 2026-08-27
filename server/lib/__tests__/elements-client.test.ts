import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createArchiveProvider,
  DEFAULT_ELEMENTS_EXTERNAL_ID_KEY,
  ELEMENTS_CONTRACT_PROFILE,
} from "../archive/archive-provider";
import type { JournalpostSpec, SaksmappeSpec } from "../archive/noark";
import { createHash } from "node:crypto";

const BASE = "https://elements.example.no/api";
const TOKEN = "https://idp.elements.example.no/oauth2/token";
const REL = "https://rel.arkivverket.no/noark5/v5/api";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/vnd.noark5+json" },
  });
}

function links(values: Record<string, string>) {
  return { _links: Object.fromEntries(Object.entries(values).map(([rel, href]) => [rel, { href }])) };
}

describe("Elements Noark 5 tjenestegrensesnitt 1.1", () => {
  const previousEnabled = process.env.ELEMENTS_ARCHIVE_ENABLED;

  beforeEach(() => {
    process.env.ELEMENTS_ARCHIVE_ENABLED = "true";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousEnabled == null) delete process.env.ELEMENTS_ARCHIVE_ENABLED;
    else process.env.ELEMENTS_ARCHIVE_ENABLED = previousEnabled;
  });

  it("er fail-closed inntil driftsmiljøet aktiverer avtalen", () => {
    delete process.env.ELEMENTS_ARCHIVE_ENABLED;
    expect(() => createArchiveProvider("elements", {
      baseUrl: BASE,
      tokenUrl: TOKEN,
      clientId: "disabled-client",
      clientSecret: "secret",
      arkivdelId: "arkivdel-1",
      contractProfile: ELEMENTS_CONTRACT_PROFILE,
      externalIdMetadataKey: DEFAULT_ELEMENTS_EXTERNAL_ID_KEY,
    })).toThrow(/ikke aktivert/);
  });

  it("avviser ukjent kontrakt og manglende idempotenskonfigurasjon", () => {
    expect(() => createArchiveProvider("elements", {
      baseUrl: BASE,
      tokenUrl: TOKEN,
      clientId: "bad-profile-client",
      clientSecret: "secret",
      arkivdelId: "arkivdel-1",
      contractProfile: "elements-ukjent",
      externalIdMetadataKey: DEFAULT_ELEMENTS_EXTERNAL_ID_KEY,
    })).toThrow(/kontraktprofil/);
    expect(() => createArchiveProvider("elements", {
      baseUrl: BASE,
      tokenUrl: TOKEN,
      clientId: "missing-id-client",
      clientSecret: "secret",
      arkivdelId: "arkivdel-1",
      contractProfile: ELEMENTS_CONTRACT_PROFILE,
    })).toThrow(/ekstern-ID/);
  });

  it("sender ikke bearer-token til en HATEOAS-relasjon på en annen origin", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === TOKEN) return json({ access_token: "origin-token", expires_in: 3600 });
      if (url === BASE) return json(links({
        [`${REL}/arkivstruktur/`]: `${BASE}/arkivstruktur`,
        [`${REL}/metadata/`]: `${BASE}/metadata`,
        [`${REL}/sakarkiv/`]: "https://attacker.example.org/sakarkiv",
        [`${REL}/admin/system/`]: `${BASE}/system`,
      }));
      if (url === `${BASE}/system`) return json({ produkt: "Elements", protokollversjon: "1.1" });
      return json({ error: "unexpected" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createArchiveProvider("elements", {
      baseUrl: BASE,
      tokenUrl: TOKEN,
      clientId: "origin-client",
      clientSecret: "origin-secret",
      arkivdelId: "arkivdel-1",
      contractProfile: ELEMENTS_CONTRACT_PROFILE,
      externalIdMetadataKey: DEFAULT_ELEMENTS_EXTERNAL_ID_KEY,
    });
    await expect(provider.verify()).rejects.toThrow(/utenfor avtalt API-origin/);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("attacker.example.org"))).toBe(false);
  });

  it("oppdager ressurser, arkiverer idempotent og verifiserer filkvittering", async () => {
    let mappe: Record<string, any> | null = null;
    let journalpost: Record<string, any> | null = null;
    const documents = new Map<string, Record<string, any>>();
    const uploadedChecksums = new Map<string, string>();
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url: url.toString(), init });
      if (url.toString() === TOKEN) return json({ access_token: "elements-token", expires_in: 3600 });
      expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer elements-token");

      if (url.toString() === BASE) return json(links({
        [`${REL}/arkivstruktur/`]: `${BASE}/arkivstruktur`,
        [`${REL}/metadata/`]: `${BASE}/metadata`,
        [`${REL}/sakarkiv/`]: `${BASE}/sakarkiv`,
        [`${REL}/admin/system/`]: `${BASE}/system`,
      }));
      if (url.pathname.endsWith("/system")) return json({ produkt: "Elements", protokollversjon: "1.1" });
      if (url.pathname.endsWith("/sakarkiv")) return json(links({
        [`${REL}/sakarkiv/saksmappe/`]: `${BASE}/saksmapper{?$filter&$top}`,
        [`${REL}/sakarkiv/journalpost/`]: `${BASE}/journalposter{?$filter&$top}`,
      }));
      if (url.pathname.endsWith("/arkivstruktur")) return json(links({
        [`${REL}/arkivstruktur/arkivdel/`]: `${BASE}/arkivdeler{?$filter&$top}`,
        [`${REL}/arkivstruktur/klasse/`]: `${BASE}/klasser{?$filter&$top}`,
        [`${REL}/arkivstruktur/dokumentbeskrivelse/`]: `${BASE}/dokumentbeskrivelser{?$filter&$top}`,
      }));
      if (url.pathname.endsWith("/metadata")) return json(links({
        [`${REL}/metadata/virksomhetsspesifikkeMetadata/`]: `${BASE}/metadatafelt{?$filter&$top}`,
      }));
      if (url.pathname.endsWith("/metadatafelt")) {
        return json({ results: [{ navn: DEFAULT_ELEMENTS_EXTERNAL_ID_KEY, type: "string" }], count: 1 });
      }
      if (url.pathname.endsWith("/arkivdeler")) return json({
        results: [{
          systemID: "arkivdel-1",
          ...links({ [`${REL}/sakarkiv/ny-saksmappe/`]: `${BASE}/ny-saksmappe` }),
        }],
        count: 1,
      });
      if (url.pathname.endsWith("/saksmapper")) {
        const filter = url.searchParams.get("$filter") ?? "";
        const found = mappe && (filter.includes("mappe-1") || filter.includes("tidum:sak:1"));
        return json({ results: found ? [mappe] : [], count: found ? 1 : 0 });
      }
      if (url.pathname.endsWith("/ny-saksmappe") && init?.method === "GET") {
        return json({ saksstatus: { kode: "B" }, virksomhetsspesifikkeMetadata: null });
      }
      if (url.pathname.endsWith("/ny-saksmappe") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual(expect.objectContaining({
          tittel: "Tiltakssak 1",
          saksstatus: { kode: "B" },
          virksomhetsspesifikkeMetadata: { [DEFAULT_ELEMENTS_EXTERNAL_ID_KEY]: "tidum:sak:1" },
        }));
        mappe = {
          ...body,
          systemID: "mappe-1",
          mappeID: "2026/1",
          ...links({ [`${REL}/sakarkiv/ny-journalpost/`]: `${BASE}/ny-journalpost` }),
        };
        return json(mappe, 201);
      }
      if (url.pathname.endsWith("/journalposter")) {
        const found = journalpost && (url.searchParams.get("$filter") ?? "").includes("tidum:rapport:1");
        return json({ results: found ? [journalpost] : [], count: found ? 1 : 0 });
      }
      if (url.pathname.endsWith("/ny-journalpost") && init?.method === "GET") {
        return json({ journalstatus: { kode: "J" }, virksomhetsspesifikkeMetadata: null });
      }
      if (url.pathname.endsWith("/ny-journalpost") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.journalposttype).toEqual({ kode: "X" });
        journalpost = {
          ...body,
          systemID: "journalpost-1",
          registreringsID: "JP-1",
          ...links({ [`${REL}/arkivstruktur/ny-dokumentbeskrivelse/`]: `${BASE}/ny-dokumentbeskrivelse` }),
        };
        return json(journalpost, 201);
      }
      if (url.pathname.endsWith("/dokumentbeskrivelser")) {
        const filter = url.searchParams.get("$filter") ?? "";
        const document = [...documents.entries()].find(([externalId]) => filter.includes(externalId))?.[1];
        return json({ results: document ? [document] : [], count: document ? 1 : 0 });
      }
      if (url.pathname.endsWith("/ny-dokumentbeskrivelse") && init?.method === "GET") {
        return json({ dokumentstatus: { kode: "F" }, virksomhetsspesifikkeMetadata: null });
      }
      if (url.pathname.endsWith("/ny-dokumentbeskrivelse") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const externalId = body.virksomhetsspesifikkeMetadata[DEFAULT_ELEMENTS_EXTERNAL_ID_KEY];
        const id = `dok-${documents.size + 1}`;
        const document = {
          ...body,
          systemID: id,
          ...links({
            [`${REL}/arkivstruktur/dokumentobjekt/`]: `${BASE}/dokumenter/${id}/objekter`,
            [`${REL}/arkivstruktur/fil/`]: `${BASE}/dokumenter/${id}/fil`,
          }),
        };
        documents.set(externalId, document);
        return json(document, 201);
      }
      const objectMatch = url.pathname.match(/\/dokumenter\/(dok-[0-9]+)\/objekter$/);
      if (objectMatch) {
        const checksum = uploadedChecksums.get(objectMatch[1]);
        return json({
          results: checksum ? [{ sjekksum: checksum, variantformat: { kode: "A" } }] : [],
          count: checksum ? 1 : 0,
        });
      }
      const uploadMatch = url.pathname.match(/\/dokumenter\/(dok-[0-9]+)\/fil$/);
      if (uploadMatch && init?.method === "POST") {
        const bytes = Buffer.from(init.body as Uint8Array);
        const checksum = createHash("sha256").update(bytes).digest("hex");
        uploadedChecksums.set(uploadMatch[1], checksum);
        return json({ sjekksum: checksum, variantformat: { kode: "A" } }, 201);
      }
      return json({ error: `unexpected ${url}` }, 500);
    }));

    const provider = createArchiveProvider("elements", {
      baseUrl: BASE,
      tokenUrl: TOKEN,
      clientId: "contract-client",
      clientSecret: "contract-secret",
      arkivdelId: "arkivdel-1",
      journalenhet: "BARNEVERN",
      contractProfile: ELEMENTS_CONTRACT_PROFILE,
      externalIdMetadataKey: DEFAULT_ELEMENTS_EXTERNAL_ID_KEY,
    });
    await provider.verify();

    const mappeSpec: SaksmappeSpec = {
      tittel: "Tiltakssak 1",
      offentligTittel: "Tiltakssak",
      eksternId: "tidum:sak:1",
      skjerming: { tilgangsrestriksjon: "UO", skjermingshjemmel: "Offl. § 13" },
    };
    expect(await provider.ensureSaksmappe(mappeSpec)).toEqual({ id: "mappe-1", mappeIdent: "2026/1" });
    expect(await provider.ensureSaksmappe(mappeSpec)).toEqual({ id: "mappe-1", mappeIdent: "2026/1" });

    const journalpostSpec: JournalpostSpec = {
      tittel: "Rapport",
      offentligTittel: "Rapport",
      journalposttype: "X",
      eksternId: "tidum:rapport:1",
      skjerming: { tilgangsrestriksjon: "UO", skjermingshjemmel: "Offl. § 13" },
      files: [{
        filename: "rapport.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-1.7"),
        variantformat: "Arkivformat",
      }],
    };
    expect(await provider.createJournalpost("mappe-1", journalpostSpec)).toEqual({
      id: "journalpost-1",
      journalpostIdent: "JP-1",
    });
    expect(await provider.createJournalpost("mappe-1", journalpostSpec)).toEqual({
      id: "journalpost-1",
      journalpostIdent: "JP-1",
    });

    expect(calls.filter((call) => call.url === TOKEN)).toHaveLength(1);
    expect(calls.filter((call) => call.url.endsWith("/ny-saksmappe") && call.init?.method === "POST")).toHaveLength(1);
    expect(calls.filter((call) => call.url.endsWith("/ny-journalpost") && call.init?.method === "POST")).toHaveLength(1);
    expect(calls.filter((call) => /\/dokumenter\/dok-1\/fil$/.test(new URL(call.url).pathname))).toHaveLength(1);
    expect(calls.every((call) => call.init?.redirect === "error")).toBe(true);
  });
});
