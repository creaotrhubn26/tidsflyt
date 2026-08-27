import { afterEach, describe, expect, it, vi } from "vitest";
import { createArchiveProvider } from "../archive/archive-provider";
import type { JournalpostSpec, SaksmappeSpec } from "../archive/noark";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Documaster transport contract", () => {
  it("bruker separat IDP, riktige Noark-actions og ekstern-ID-idempotens", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let mappeQueries = 0;
    let journalpostQueries = 0;
    let uploads = 0;
    let mappeTransactions = 0;
    let journalpostTransactions = 0;

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "https://idp.example.no/oauth2/token") {
        return jsonResponse({ access_token: "contract-token", expires_in: 3600 });
      }
      if (url.endsWith("/query")) {
        const body = JSON.parse(String(init?.body));
        if (body.type === "Arkiv") return jsonResponse({ results: [{ id: "arkiv-1" }] });
        if (body.type === "Saksmappe") {
          mappeQueries += 1;
          return jsonResponse({
            results: mappeQueries === 1
              ? []
              : [{ id: "mappe-1", fields: { mappeIdent: "2026/1" } }],
          });
        }
        if (body.type === "Journalpost") {
          journalpostQueries += 1;
          return jsonResponse({
            results: journalpostQueries === 1
              ? []
              : [{ id: "journalpost-1", fields: { journalpostIdent: "JP-1" } }],
          });
        }
      }
      if (url.endsWith("/upload")) {
        uploads += 1;
        return jsonResponse({ id: `upload-${uploads}` });
      }
      if (url.endsWith("/transaction")) {
        const body = JSON.parse(String(init?.body));
        if (body.actions.some((action: any) => action.type === "Saksmappe")) {
          mappeTransactions += 1;
          expect(body.actions).toEqual(expect.arrayContaining([
            expect.objectContaining({
              action: "save",
              type: "Saksmappe",
              fields: expect.objectContaining({ administrativEnhet: "BARNEVERN", skjerming: "UO" }),
            }),
            expect.objectContaining({ action: "link", ref: "refArkivdel", linkToId: ["arkivdel-1"] }),
            expect.objectContaining({ action: "link", ref: "refPrimaerKlasse", linkToId: ["klasse-1"] }),
            expect.objectContaining({
              action: "save",
              type: "EksternId",
              fields: { eksterntSystem: "Tidum", eksternID: "tidum:sak:contract-1" },
            }),
          ]));
          return jsonResponse({ saved: { "@mappe": { id: "mappe-1", fields: { mappeIdent: "2026/1" } } } });
        }

        journalpostTransactions += 1;
        expect(body.actions).toEqual(expect.arrayContaining([
          expect.objectContaining({
            action: "save",
            type: "Journalpost",
            fields: expect.objectContaining({ journalposttype: "X", skjerming: "UO" }),
          }),
          expect.objectContaining({ action: "link", ref: "refMappe", linkToId: ["mappe-1"] }),
          expect.objectContaining({
            action: "save",
            type: "EksternId",
            fields: { eksterntSystem: "Tidum", eksternID: "tidum:dialog:contract-1" },
          }),
          expect.objectContaining({
            action: "save",
            type: "Dokument",
            fields: expect.objectContaining({ tilknyttetRegistreringSom: "H" }),
          }),
          expect.objectContaining({
            action: "save",
            type: "Dokument",
            fields: expect.objectContaining({ tilknyttetRegistreringSom: "V" }),
          }),
          expect.objectContaining({
            action: "save",
            type: "Dokumentversjon",
            fields: expect.objectContaining({ variantformat: "A", referanseDokumentfil: "upload-1" }),
          }),
          expect.objectContaining({
            action: "save",
            type: "Dokumentversjon",
            fields: expect.objectContaining({ variantformat: "P", referanseDokumentfil: "upload-2" }),
          }),
        ]));
        return jsonResponse({ saved: { "@jp": { id: "journalpost-1", fields: { journalpostIdent: "JP-1" } } } });
      }
      return jsonResponse({ error: "unexpected test request" }, 500);
    }));

    const provider = createArchiveProvider("documaster", {
      baseUrl: "https://archive.example.no",
      tokenUrl: "https://idp.example.no/oauth2/token",
      clientId: "contract-client",
      clientSecret: "contract-secret",
      arkivdelId: "arkivdel-1",
      journalenhet: "BARNEVERN",
      klasseId: "klasse-1",
    });
    await provider.verify();

    const mappeSpec: SaksmappeSpec = {
      tittel: "Kontrakttest",
      offentligTittel: "Sak",
      eksternId: "tidum:sak:contract-1",
      skjerming: { skjermingshjemmel: "Offl. § 13", tilgangsrestriksjon: "UO" },
      arkivdelId: "arkivdel-1",
    };
    expect(await provider.ensureSaksmappe(mappeSpec)).toEqual({ id: "mappe-1", mappeIdent: "2026/1" });
    expect(await provider.ensureSaksmappe(mappeSpec)).toEqual({ id: "mappe-1", mappeIdent: "2026/1" });

    const journalpostSpec: JournalpostSpec = {
      tittel: "Sikker dialog",
      offentligTittel: "Sikker dialog",
      journalposttype: "X",
      eksternId: "tidum:dialog:contract-1",
      skjerming: { skjermingshjemmel: "Offl. § 13", tilgangsrestriksjon: "UO" },
      files: [
        { filename: "dialog.pdf", mimeType: "application/pdf", content: Buffer.from("pdf"), variantformat: "Arkivformat" },
        { filename: "manifest.json", mimeType: "application/json", content: Buffer.from("{}"), variantformat: "Produksjonsformat" },
      ],
    };
    expect(await provider.createJournalpost("mappe-1", journalpostSpec)).toEqual({ id: "journalpost-1", journalpostIdent: "JP-1" });
    expect(await provider.createJournalpost("mappe-1", journalpostSpec)).toEqual({ id: "journalpost-1", journalpostIdent: "JP-1" });

    expect(calls.filter((call) => call.url === "https://idp.example.no/oauth2/token")).toHaveLength(1);
    const tokenBody = calls.find((call) => call.url === "https://idp.example.no/oauth2/token")?.init?.body;
    expect(String(tokenBody)).toContain("grant_type=client_credentials");
    expect(String(tokenBody)).toContain("client_id=contract-client");
    expect(calls.every((call) => call.init?.redirect === "error")).toBe(true);
    expect(calls.filter((call) => call.url.includes("archive.example.no"))
      .every((call) => (call.init?.headers as Record<string, string>)?.Authorization === "Bearer contract-token"))
      .toBe(true);
    expect({ mappeTransactions, journalpostTransactions, uploads }).toEqual({
      mappeTransactions: 1,
      journalpostTransactions: 1,
      uploads: 2,
    });
  });

  it("skiller token-cache når IDP-adressen endres", async () => {
    const tokenCalls: string[] = [];
    const queryAuthorizations: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("idp-a.example.no")) {
        tokenCalls.push(url);
        return jsonResponse({ access_token: "token-a", expires_in: 3600 });
      }
      if (url.includes("idp-b.example.no")) {
        tokenCalls.push(url);
        return jsonResponse({ access_token: "token-b", expires_in: 3600 });
      }
      queryAuthorizations.push((init?.headers as Record<string, string>).Authorization);
      return jsonResponse({ results: [{ id: "arkiv-1" }] });
    }));

    const common = {
      baseUrl: "https://archive-cache.example.no",
      clientId: "same-client-for-cache-contract",
      clientSecret: "same-secret-for-cache-contract",
    };
    await createArchiveProvider("documaster", {
      ...common,
      tokenUrl: "https://idp-a.example.no/oauth2/token",
    }).verify();
    await createArchiveProvider("documaster", {
      ...common,
      tokenUrl: "https://idp-b.example.no/oauth2/token",
    }).verify();

    expect(tokenCalls).toEqual([
      "https://idp-a.example.no/oauth2/token",
      "https://idp-b.example.no/oauth2/token",
    ]);
    expect(queryAuthorizations).toEqual(["Bearer token-a", "Bearer token-b"]);
  });
});
