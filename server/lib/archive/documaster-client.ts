/**
 * server/lib/archive/documaster-client.ts
 *
 * Documaster-provider for Noark 5-arkivering.
 *
 * Documasters integrasjons-API er Noark 5-webtjenestene:
 *   - Token:  POST {baseUrl}/idp/oauth2/token  (client_credentials)
 *   - Query:  POST {baseUrl}/rms/api/v2/query   (finn eksisterende objekter)
 *   - Save:   POST {baseUrl}/rms/api/v2/save    (opprett/oppdater objektgraf)
 *   - Upload: POST {baseUrl}/rms/api/v2/upload  (last opp fil, får temp-id)
 *
 * Stiene kan overstyres per config (apiPaths) siden de varierer mellom
 * Documaster-versjoner og andre Noark 5-kjerner med samme tjenesteform.
 * NB: Klienten er skrevet mot dokumentert tjenesteform, men er ikke
 * verifisert mot en Documaster-sandkasse ennå — se docs/integrations/
 * documaster.md for verifiseringsplanen. All transport er samlet i denne
 * filen slik at justeringer etter sandkassetest ikke berører resten av
 * arkivmodulen.
 *
 * Idempotens: mapper og journalposter merkes med Tidums eksternId
 * (virksomhetsspesifikk nøkkel), og provideren spør etter eksisterende
 * objekt før opprettelse.
 */

import type { ArchiveDocumentFile, JournalpostSpec, SaksmappeSpec } from "./noark";

export interface ArchiveProviderConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  arkivdelId?: string | null;
  journalenhet?: string | null;
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
  query: "/rms/api/v2/query",
  save: "/rms/api/v2/save",
  upload: "/rms/api/v2/upload",
};

export class DocumasterError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: unknown) {
    super(message);
    this.name = "DocumasterError";
  }
}

interface CachedToken { accessToken: string; expiresAt: number }

// Token-cache per clientId — Documaster-tokens er kortlevde.
const tokenCache = new Map<string, CachedToken>();

export class DocumasterProvider implements ArchiveProvider {
  private paths: typeof DEFAULT_PATHS;

  constructor(private cfg: ArchiveProviderConfig) {
    this.paths = { ...DEFAULT_PATHS, ...(cfg.apiPaths ?? {}) };
  }

  private url(path: string): string {
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

  private async api<T = any>(path: string, body: unknown, contentType = "application/json"): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
      },
      body: contentType === "application/json" ? JSON.stringify(body) : (body as any),
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
      query: "refEksternId.eksternID = @eksternId",
      parameters: { "@eksternId": eksternId },
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

    const saved: any = await this.api(this.paths.save, {
      actions: [
        {
          action: "save",
          type: "Saksmappe",
          id: "@mappe",
          fields: {
            tittel: spec.tittel,
            offentligTittel: spec.offentligTittel ?? spec.tittel,
            refArkivdel: arkivdelId,
            ...(spec.skjerming
              ? {
                  skjerming: {
                    skjermingshjemmel: spec.skjerming.skjermingshjemmel,
                    tilgangsrestriksjon: spec.skjerming.tilgangsrestriksjon,
                    skjermingMetadata: spec.skjerming.skjermingMetadata,
                  },
                }
              : {}),
          },
        },
        {
          action: "save",
          type: "EksternId",
          fields: { refMappe: "@mappe", eksternSystem: "Tidum", eksternID: spec.eksternId },
        },
      ],
    });

    const mappe = extractSaved(saved, "@mappe");
    if (!mappe?.id) throw new DocumasterError("Documaster returnerte ikke mappe-id ved opprettelse", undefined, saved);
    return { id: String(mappe.id), mappeIdent: mappe.fields?.mappeIdent ?? null };
  }

  private async uploadFile(file: ArchiveDocumentFile): Promise<string> {
    const token = await this.getToken();
    const res = await fetch(this.url(this.paths.upload), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
      },
      body: new Uint8Array(file.content),
    });
    if (!res.ok) {
      throw new DocumasterError(`Documaster filopplasting feilet (${res.status})`, res.status, await safeBody(res));
    }
    const json: any = await res.json();
    const id = json?.id ?? json?.uploadId;
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

    const skjerming = spec.skjerming
      ? {
          skjerming: {
            skjermingshjemmel: spec.skjerming.skjermingshjemmel,
            tilgangsrestriksjon: spec.skjerming.tilgangsrestriksjon,
            skjermingMetadata: spec.skjerming.skjermingMetadata,
          },
        }
      : {};

    const actions: any[] = [
      {
        action: "save",
        type: "Journalpost",
        id: "@jp",
        fields: {
          refMappe: mappeId,
          tittel: spec.tittel,
          offentligTittel: spec.offentligTittel ?? spec.tittel,
          journalposttype: spec.journalposttype,
          ...(spec.dokumentdato ? { dokumentetsDato: spec.dokumentdato } : {}),
          ...(spec.journalenhet ? { journalenhet: spec.journalenhet } : {}),
          ...skjerming,
        },
      },
      {
        action: "save",
        type: "EksternId",
        fields: { refRegistrering: "@jp", eksternSystem: "Tidum", eksternID: spec.eksternId },
      },
    ];

    spec.files.forEach((file, i) => {
      const bId = `@db${i}`;
      actions.push({
        action: "save",
        type: "Dokumentbeskrivelse",
        id: bId,
        fields: {
          refRegistrering: "@jp",
          tittel: file.filename,
          tilknyttetRegistreringSom: i === 0 ? "Hoveddokument" : "Vedlegg",
        },
      });
      actions.push({
        action: "save",
        type: "Dokumentobjekt",
        fields: {
          refDokumentbeskrivelse: bId,
          variantformat: file.variantformat,
          format: file.mimeType,
          refDokumentfil: uploadIds[i],
        },
      });
    });

    const saved: any = await this.api(this.paths.save, { actions });
    const jp = extractSaved(saved, "@jp");
    if (!jp?.id) throw new DocumasterError("Documaster returnerte ikke journalpost-id", undefined, saved);
    return { id: String(jp.id), journalpostIdent: jp.fields?.journalpostIdent ?? null };
  }
}

function extractSaved(response: any, tempId: string): any | null {
  // Save-responsen mapper temp-id → lagret objekt; formen varierer noe
  // mellom versjoner, så vi prøver de kjente feltene.
  return (
    response?.saved?.[tempId] ??
    response?.results?.find((r: any) => r?.tempId === tempId) ??
    null
  );
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
