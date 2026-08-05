/**
 * server/lib/archive/documaster-client.ts
 *
 * Documaster-provider for Noark 5-arkivering, skrevet mot Documasters
 * offisielle Noark 5-webtjenester v1 (github.com/documaster/noark5-web-services):
 *
 *   - Token:       POST {idp}/oauth2/token — Documaster IDP kan kjøre på egen
 *                  host; sett apiPaths.token til absolutt URL ved behov.
 *                  NB: klassisk Documaster IDP (idp-web-services) dokumenterer
 *                  authorization_code/password-flow; client_credentials hører
 *                  til det nyere «Noark5 Compliant API». Avklar flow og
 *                  token-URL med Documaster ved onboarding.
 *   - Query:       POST {baseUrl}/rms/api/public/noark5/v1/query
 *   - Transaction: POST {baseUrl}/rms/api/public/noark5/v1/transaction
 *                  (save/link/unlink/delete i én transaksjon)
 *   - Upload:      POST {baseUrl}/rms/api/public/noark5/v1/upload
 *
 * Viktige trekk ved tjenesteformen (fra spesifikasjonen):
 *   - Referansefelter (refArkivdel, refMappe, ...) settes med egne
 *     `link`-actions — aldri som felter i `save`.
 *   - Dokumenter modelleres som Dokument + Dokumentversjon (ikke
 *     Dokumentbeskrivelse/Dokumentobjekt); filen refereres via
 *     `referanseDokumentfil` = id fra upload.
 *   - Kodelister bruker koder: journalposttype I/U/X/N/S,
 *     tilknyttetRegistreringSom H/V, variantformat P/A.
 *   - `skjerming` (M500) er én kode fra instansens konfigurerte
 *     skjermings-kodeliste (koden bærer navn + hjemmel i Documaster);
 *     vi sender spec-ens tilgangsrestriksjon (f.eks. "UO") som kode.
 *   - EksternId har feltene `eksterntSystem` + `eksternID` og kobles til
 *     eieren med link (refMappe/refRegistrering).
 *
 * Idempotens: mapper og journalposter merkes med Tidums eksternId og slås
 * opp (refEksternId.eksternID = @id) før opprettelse.
 */

import type { ArchiveDocumentFile, JournalpostSpec, SaksmappeSpec } from "./noark";

export interface ArchiveProviderConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  arkivdelId?: string | null;
  journalenhet?: string | null;
  /** Valgfri primærklasse — settes hvis instansen krever klassifikasjon på mapper. */
  klasseId?: string | null;
  apiPaths?: Partial<typeof DEFAULT_PATHS>;
}

export interface ArchiveProvider {
  /** Verifiser at tilkobling og rettigheter fungerer (token + enkel query). */
  verify(): Promise<void>;
  /** Finn eller opprett saksmappe. Returnerer ekstern id + ident. */
  ensureSaksmappe(spec: SaksmappeSpec): Promise<{ id: string; mappeIdent: string | null }>;
  /** Opprett journalpost m/dokument i gitt mappe. Idempotent på eksternId. */
  createJournalpost(
    mappeId: string,
    spec: JournalpostSpec,
  ): Promise<{ id: string; journalpostIdent: string | null }>;
}

const DEFAULT_PATHS = {
  token: "/idp/oauth2/token",
  query: "/rms/api/public/noark5/v1/query",
  transaction: "/rms/api/public/noark5/v1/transaction",
  upload: "/rms/api/public/noark5/v1/upload",
};

const EKSTERNT_SYSTEM = "Tidum";

export class DocumasterError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: unknown) {
    super(message);
    this.name = "DocumasterError";
  }
}

interface CachedToken { accessToken: string; expiresAt: number }

// Token-cache per clientId — Documaster-tokens er kortlevde.
const tokenCache = new Map<string, CachedToken>();

const VARIANTFORMAT_CODES: Record<ArchiveDocumentFile["variantformat"], string> = {
  Arkivformat: "A",
  Produksjonsformat: "P",
};

export class DocumasterProvider implements ArchiveProvider {
  private paths: typeof DEFAULT_PATHS;

  constructor(private cfg: ArchiveProviderConfig) {
    this.paths = { ...DEFAULT_PATHS, ...(cfg.apiPaths ?? {}) };
  }

  private url(path: string): string {
    // apiPaths kan inneholde en absolutt URL — IdP-en (token) kjører ofte
    // på en annen host enn arkivet (github.com/documaster/idp-web-services).
    if (/^https?:\/\//.test(path)) return path;
    return this.cfg.baseUrl.replace(/\/+$/, "") + path;
  }

  private async getToken(): Promise<string> {
    const cacheKey = `${this.cfg.baseUrl}:${this.cfg.clientId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.accessToken;

    const res = await fetch(this.url(this.paths.token), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
      }),
    });
    if (!res.ok) {
      throw new DocumasterError(`Documaster token-feil (${res.status})`, res.status, await safeBody(res));
    }
    const json: any = await res.json();
    if (!json.access_token) throw new DocumasterError("Documaster token-respons mangler access_token");
    const ttlMs = Math.max(30_000, ((json.expires_in ?? 300) - 30) * 1000);
    tokenCache.set(cacheKey, { accessToken: json.access_token, expiresAt: Date.now() + ttlMs });
    return json.access_token;
  }

  private async api<T = any>(path: string, body: unknown): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // JSON-feilmeldinger gir errorId + beskrivelse i stedet for ren tekst.
        "X-Documaster-Error-Response-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new DocumasterError(`Documaster API-feil (${res.status}) på ${path}`, res.status, await safeBody(res));
    }
    return res.json() as Promise<T>;
  }

  async verify(): Promise<void> {
    // Token + en minimal query er nok til å bevise tilkobling og lesetilgang.
    await this.api(this.paths.query, {
      type: "Arkiv",
      limit: 1,
    });
  }

  /** Finn objekt av gitt type via virksomhetsspesifikk nøkkel (eksternId). */
  private async findByEksternId(type: string, eksternId: string): Promise<any | null> {
    const result: any = await this.api(this.paths.query, {
      type,
      limit: 1,
      query: "refEksternId.eksternID = @eksternId && refEksternId.eksterntSystem = @system",
      parameters: { "@eksternId": eksternId, "@system": EKSTERNT_SYSTEM },
    });
    return result?.results?.[0] ?? null;
  }

  async ensureSaksmappe(spec: SaksmappeSpec): Promise<{ id: string; mappeIdent: string | null }> {
    const existing = await this.findByEksternId("Saksmappe", spec.eksternId);
    if (existing) {
      return { id: String(existing.id), mappeIdent: existing.fields?.mappeIdent ?? null };
    }

    const arkivdelId = spec.arkivdelId ?? this.cfg.arkivdelId;
    if (!arkivdelId) throw new DocumasterError("arkivdelId mangler i arkivkonfigurasjonen");

    const saved: any = await this.api(this.paths.transaction, {
      actions: [
        {
          action: "save",
          type: "Saksmappe",
          id: "@mappe",
          fields: {
            tittel: spec.tittel,
            offentligTittel: spec.offentligTittel ?? spec.tittel,
            // administrativEnhet (M305) er påkrevd i Documasters modell;
            // verdien må finnes i instansens kodeliste.
            ...(this.cfg.journalenhet ? { administrativEnhet: this.cfg.journalenhet } : {}),
            ...(spec.skjerming ? { skjerming: spec.skjerming.tilgangsrestriksjon } : {}),
          },
        },
        { action: "link", type: "Saksmappe", id: "@mappe", ref: "refArkivdel", linkToId: [String(arkivdelId)] },
        // Valgfri primærklasse (Klasse fra arkivdelens primære
        // klassifikasjonssystem) — kreves i noen instans-oppsett.
        ...(this.cfg.klasseId
          ? [{ action: "link", type: "Saksmappe", id: "@mappe", ref: "refPrimaerKlasse", linkToId: [String(this.cfg.klasseId)] }]
          : []),
        {
          action: "save",
          type: "EksternId",
          id: "@eid",
          fields: { eksterntSystem: EKSTERNT_SYSTEM, eksternID: spec.eksternId },
        },
        { action: "link", type: "EksternId", id: "@eid", ref: "refMappe", linkToId: ["@mappe"] },
      ],
    });

    const mappe = extractSaved(saved, "@mappe");
    if (!mappe?.id) throw new DocumasterError("Documaster returnerte ikke mappe-id ved opprettelse", undefined, saved);
    return { id: String(mappe.id), mappeIdent: mappe.fields?.mappeIdent ?? null };
  }

  private async uploadFile(file: ArchiveDocumentFile): Promise<string> {
    const token = await this.getToken();
    // RFC 6266/5987: filename (ASCII-fallback) + filename* (UTF-8).
    const asciiName = file.filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    const res = await fetch(this.url(this.paths.upload), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Content-Disposition":
          `attachment; filename="${asciiName}"; filename*=utf-8''${encodeURIComponent(file.filename)}`,
      },
      body: new Uint8Array(file.content),
    });
    if (!res.ok) {
      throw new DocumasterError(`Documaster filopplasting feilet (${res.status})`, res.status, await safeBody(res));
    }
    const json: any = await res.json();
    const id = json?.id;
    if (!id) throw new DocumasterError("Documaster upload-respons mangler id", undefined, json);
    return String(id);
  }

  async createJournalpost(
    mappeId: string,
    spec: JournalpostSpec,
  ): Promise<{ id: string; journalpostIdent: string | null }> {
    const existing = await this.findByEksternId("Journalpost", spec.eksternId);
    if (existing) {
      return { id: String(existing.id), journalpostIdent: existing.fields?.journalpostIdent ?? null };
    }

    const uploadIds: string[] = [];
    for (const file of spec.files) {
      uploadIds.push(await this.uploadFile(file));
    }

    const actions: any[] = [
      {
        action: "save",
        type: "Journalpost",
        id: "@jp",
        fields: {
          tittel: spec.tittel,
          offentligTittel: spec.offentligTittel ?? spec.tittel,
          journalposttype: spec.journalposttype,
          ...(spec.dokumentdato ? { dokumentetsDato: spec.dokumentdato } : {}),
          ...(spec.skjerming ? { skjerming: spec.skjerming.tilgangsrestriksjon } : {}),
        },
      },
      { action: "link", type: "Journalpost", id: "@jp", ref: "refMappe", linkToId: [String(mappeId)] },
      {
        action: "save",
        type: "EksternId",
        id: "@eid",
        fields: { eksterntSystem: EKSTERNT_SYSTEM, eksternID: spec.eksternId },
      },
      { action: "link", type: "EksternId", id: "@eid", ref: "refRegistrering", linkToId: ["@jp"] },
    ];

    spec.files.forEach((file, i) => {
      const dokId = `@dok${i}`;
      const versjonId = `@dv${i}`;
      actions.push(
        {
          action: "save",
          type: "Dokument",
          id: dokId,
          fields: {
            tittel: file.filename,
            tilknyttetRegistreringSom: i === 0 ? "H" : "V",
          },
        },
        { action: "link", type: "Dokument", id: dokId, ref: "refRegistrering", linkToId: ["@jp"] },
        {
          action: "save",
          type: "Dokumentversjon",
          id: versjonId,
          fields: {
            variantformat: VARIANTFORMAT_CODES[file.variantformat],
            format: file.mimeType,
            referanseDokumentfil: uploadIds[i],
          },
        },
        { action: "link", type: "Dokumentversjon", id: versjonId, ref: "refDokument", linkToId: [dokId] },
      );
    });

    const saved: any = await this.api(this.paths.transaction, { actions });
    const jp = extractSaved(saved, "@jp");
    if (!jp?.id) throw new DocumasterError("Documaster returnerte ikke journalpost-id", undefined, saved);
    return { id: String(jp.id), journalpostIdent: jp.fields?.journalpostIdent ?? null };
  }
}

function extractSaved(response: any, tempId: string): any | null {
  // Transaction-responsen mapper temp-id → lagret objekt i `saved`.
  return response?.saved?.[tempId] ?? null;
}

async function safeBody(res: Response): Promise<unknown> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}

/** Fabrikk — utvides når flere arkivkjerner støttes (Fiks Arkiv m.fl.). */
export function createArchiveProvider(provider: string, cfg: ArchiveProviderConfig): ArchiveProvider {
  switch (provider) {
    case "documaster":
      return new DocumasterProvider(cfg);
    default:
      throw new Error(`Ukjent arkivprovider: ${provider}`);
  }
}
