/**
 * Elements-provider for Nasjonalarkivets Noark 5 tjenestegrensesnitt 1.1.
 *
 * Elements annonserer at produktet kan integreres via REST/SOAP, men den
 * kundespesifikke kontrakten må avklares med Sikri. Denne adapteren støtter
 * bare den standardiserte, HATEOAS-baserte REST-profilen. Alle ressurser
 * oppdages via relasjonsnøkler; ingen Elements-spesifikke URL-stier gjettes.
 */

import { createHash } from "node:crypto";
import { validateArchiveEndpointUrl } from "./archive-url-policy";
import type { ArchiveProvider, ArchiveProviderConfig } from "./archive-provider";
import type { ArchiveDocumentFile, JournalpostSpec, SaksmappeSpec, Skjerming } from "./noark";

const MEDIA_TYPE = "application/vnd.noark5+json";
const REL = "https://rel.arkivverket.no/noark5/v5/api";
const ROOT_ARCHIVE = `${REL}/arkivstruktur/`;
const ROOT_METADATA = `${REL}/metadata/`;
const ROOT_SAKARKIV = `${REL}/sakarkiv/`;
const SYSTEM = `${REL}/admin/system/`;
const ARCHIVE_PART = `${REL}/arkivstruktur/arkivdel/`;
const CLASS = `${REL}/arkivstruktur/klasse/`;
const SAKSMAPPE = `${REL}/sakarkiv/saksmappe/`;
const NEW_SAKSMAPPE = `${REL}/sakarkiv/ny-saksmappe/`;
const JOURNALPOST = `${REL}/sakarkiv/journalpost/`;
const NEW_JOURNALPOST = `${REL}/sakarkiv/ny-journalpost/`;
const DOCUMENT_DESCRIPTION = `${REL}/arkivstruktur/dokumentbeskrivelse/`;
const NEW_DOCUMENT_DESCRIPTION = `${REL}/arkivstruktur/ny-dokumentbeskrivelse/`;
const DOCUMENT_OBJECT = `${REL}/arkivstruktur/dokumentobjekt/`;
const FILE = `${REL}/arkivstruktur/fil/`;
const CUSTOM_METADATA = `${REL}/metadata/virksomhetsspesifikkeMetadata/`;

type JsonObject = Record<string, any>;
type ElementsConfig = ArchiveProviderConfig & {
  tokenUrl: string;
  arkivdelId: string;
  externalIdMetadataKey: string;
};

interface CachedToken { accessToken: string; expiresAt: number }
const tokenCache = new Map<string, CachedToken>();

export class ElementsError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ElementsError";
  }
}

function secretFingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function hrefOf(resource: JsonObject, rel: string): string | null {
  const raw = resource?._links?.[rel];
  const link = Array.isArray(raw) ? raw[0] : raw;
  return typeof link === "string" ? link : typeof link?.href === "string" ? link.href : null;
}

function withoutTemplate(href: string): string {
  return href.replace(/\{[^}]*\}/g, "");
}

function stripReadOnly(value: any): any {
  if (Array.isArray(value)) return value.map(stripReadOnly);
  if (!value || typeof value !== "object") return value;
  const result: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (child == null || key === "_links" || [
      "systemID", "mappeID", "registreringsID", "journalpostnummer",
      "opprettetDato", "opprettetAv", "referanseOpprettetAv",
      "tilknyttetDato", "tilknyttetAv", "referanseTilknyttetAv",
    ].includes(key)) continue;
    result[key] = stripReadOnly(child);
  }
  return result;
}

function code(kode: string): { kode: string } {
  return { kode };
}

function shielding(skjerming?: Skjerming): JsonObject | undefined {
  if (!skjerming) return undefined;
  return {
    tilgangsrestriksjon: code(skjerming.tilgangsrestriksjon),
    skjermingshjemmel: skjerming.skjermingshjemmel,
    skjermingMetadata: (skjerming.skjermingMetadata ?? ["tittel"]).map(code),
  };
}

function resultItems(response: JsonObject): JsonObject[] {
  if (Array.isArray(response?.results)) return response.results;
  return response?.systemID ? [response] : [];
}

export class ElementsProvider implements ArchiveProvider {
  private rootPromise: Promise<JsonObject> | null = null;

  constructor(private readonly cfg: ElementsConfig) {
    if (!/^vnd-[a-z0-9-]+-v[0-9]+:[a-z0-9]+$/.test(cfg.externalIdMetadataKey)) {
      throw new ElementsError("Ugyldig nøkkel for Elements ekstern-ID-metadata");
    }
  }

  private trustedUrl(raw: string, allowQuery = false, allowTokenOrigin = false): string {
    const absolute = new URL(withoutTemplate(raw), this.cfg.baseUrl).toString();
    const parsed = new URL(absolute);
    const archiveOrigin = new URL(this.cfg.baseUrl).origin;
    if (!allowTokenOrigin && parsed.origin !== archiveOrigin) {
      throw new ElementsError("Elements-relasjonen peker utenfor avtalt API-origin");
    }
    if (parsed.search && !allowQuery) throw new ElementsError("Elements-lenken har uventede query-parametre");
    const search = parsed.search;
    parsed.search = "";
    validateArchiveEndpointUrl(parsed.toString());
    parsed.search = search;
    return absolute;
  }

  private async getToken(): Promise<string> {
    const tokenUrl = this.trustedUrl(this.cfg.tokenUrl, false, true);
    const cacheKey = `${tokenUrl}:${this.cfg.clientId}:${secretFingerprint(this.cfg.clientSecret)}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.accessToken;

    const response = await fetch(tokenUrl, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
      }),
    });
    if (!response.ok) throw new ElementsError(`Elements token-feil (${response.status})`, response.status);
    const body = await response.json() as JsonObject;
    if (typeof body.access_token !== "string" || !body.access_token) {
      throw new ElementsError("Elements token-respons mangler access_token");
    }
    const ttlMs = Math.max(30_000, (Number(body.expires_in ?? 300) - 30) * 1000);
    tokenCache.set(cacheKey, { accessToken: body.access_token, expiresAt: Date.now() + ttlMs });
    return body.access_token;
  }

  private async json(
    method: "GET" | "POST",
    rawUrl: string,
    body?: unknown,
    allowQuery = false,
  ): Promise<JsonObject> {
    const url = this.trustedUrl(rawUrl, allowQuery);
    const token = await this.getToken();
    const response = await fetch(url, {
      method,
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: MEDIA_TYPE,
        ...(body === undefined ? {} : { "Content-Type": MEDIA_TYPE }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new ElementsError(`Elements API-feil (${response.status})`, response.status);
    return response.json() as Promise<JsonObject>;
  }

  private async root(): Promise<JsonObject> {
    this.rootPromise ??= this.json("GET", this.cfg.baseUrl);
    return this.rootPromise;
  }

  private async section(rel: string): Promise<JsonObject> {
    const root = await this.root();
    const href = hrefOf(root, rel);
    if (!href) throw new ElementsError(`Elements mangler påkrevd Noark-relasjon: ${rel}`);
    return this.json("GET", href);
  }

  private withFilter(rawHref: string, filter: string): string {
    const url = new URL(this.trustedUrl(rawHref));
    url.searchParams.set("$filter", filter);
    url.searchParams.set("$top", "2");
    return url.toString();
  }

  private async findFromList(rawHref: string, filter: string): Promise<JsonObject | null> {
    const response = await this.json("GET", this.withFilter(rawHref, filter), undefined, true);
    const items = resultItems(response);
    if (items.length > 1) throw new ElementsError("Elements returnerte flere objekter for en entydig arkivnøkkel");
    return items[0] ?? null;
  }

  private externalFilter(externalId: string): string {
    return `${this.cfg.externalIdMetadataKey} eq '${escapeOData(externalId)}'`;
  }

  private async globalList(sectionRel: string, listRel: string): Promise<string> {
    const section = await this.section(sectionRel);
    const href = hrefOf(section, listRel);
    if (!href) throw new ElementsError(`Elements mangler påkrevd Noark-liste: ${listRel}`);
    return href;
  }

  private async findGlobal(sectionRel: string, listRel: string, filter: string): Promise<JsonObject | null> {
    return this.findFromList(await this.globalList(sectionRel, listRel), filter);
  }

  private async parentForNewSaksmappe(): Promise<JsonObject> {
    const listRel = this.cfg.klasseId ? CLASS : ARCHIVE_PART;
    const id = this.cfg.klasseId || this.cfg.arkivdelId;
    const parent = await this.findGlobal(ROOT_ARCHIVE, listRel, `systemID eq '${escapeOData(id)}'`);
    if (!parent) throw new ElementsError(this.cfg.klasseId ? "Elements-klassen finnes ikke" : "Elements-arkivdelen finnes ikke");
    if (!hrefOf(parent, NEW_SAKSMAPPE)) {
      throw new ElementsError("Elements-brukeren mangler rettighet til å opprette saksmappe");
    }
    return parent;
  }

  private async verifyMetadataKey(): Promise<void> {
    const metadata = await this.section(ROOT_METADATA);
    const list = hrefOf(metadata, CUSTOM_METADATA);
    if (!list) throw new ElementsError("Elements annonserer ikke virksomhetsspesifikke metadata");
    const found = await this.findFromList(list, `navn eq '${escapeOData(this.cfg.externalIdMetadataKey)}'`);
    if (!found) throw new ElementsError("Avtalt ekstern-ID-metadata er ikke registrert i Elements");
  }

  async verify(): Promise<void> {
    const root = await this.root();
    for (const rel of [ROOT_ARCHIVE, ROOT_METADATA, ROOT_SAKARKIV, SYSTEM]) {
      if (!hrefOf(root, rel)) throw new ElementsError(`Elements mangler påkrevd Noark-relasjon: ${rel}`);
    }
    const system = await this.json("GET", hrefOf(root, SYSTEM)!);
    if (String(system.protokollversjon ?? "") !== "1.1") {
      throw new ElementsError("Elements må støtte Noark 5 tjenestegrensesnitt 1.1");
    }
    await this.globalList(ROOT_SAKARKIV, SAKSMAPPE);
    await this.globalList(ROOT_SAKARKIV, JOURNALPOST);
    await this.verifyMetadataKey();
    await this.parentForNewSaksmappe();
  }

  async ensureSaksmappe(spec: SaksmappeSpec): Promise<{ id: string; mappeIdent: string | null }> {
    const list = await this.globalList(ROOT_SAKARKIV, SAKSMAPPE);
    const find = () => this.findFromList(list, this.externalFilter(spec.eksternId));
    let mappe = await find();
    if (!mappe) {
      const parent = await this.parentForNewSaksmappe();
      const createHref = hrefOf(parent, NEW_SAKSMAPPE)!;
      const template = stripReadOnly(await this.json("GET", createHref));
      const payload = {
        ...template,
        tittel: spec.tittel,
        offentligTittel: spec.offentligTittel ?? spec.tittel,
        ...(this.cfg.journalenhet ? { journalenhet: this.cfg.journalenhet } : {}),
        ...(spec.skjerming ? { skjerming: shielding(spec.skjerming) } : {}),
        virksomhetsspesifikkeMetadata: {
          ...(template.virksomhetsspesifikkeMetadata ?? {}),
          [this.cfg.externalIdMetadataKey]: spec.eksternId,
        },
      };
      try {
        mappe = await this.json("POST", createHref, payload);
      } catch (error) {
        mappe = await find();
        if (!mappe) throw error;
      }
    }
    if (!mappe?.systemID) throw new ElementsError("Elements returnerte ikke systemID for saksmappe");
    return { id: String(mappe.systemID), mappeIdent: mappe.mappeID ? String(mappe.mappeID) : null };
  }

  private async ensureFile(journalpost: JsonObject, spec: JournalpostSpec, file: ArchiveDocumentFile, index: number): Promise<void> {
    const checksum = createHash("sha256").update(file.content).digest("hex");
    const documentExternalId = `${spec.eksternId}:fil:${index}:${checksum}`;
    const globalDocuments = await this.globalList(ROOT_ARCHIVE, DOCUMENT_DESCRIPTION);
    const findDocument = () => this.findFromList(globalDocuments, this.externalFilter(documentExternalId));
    let document = await findDocument();

    if (!document) {
      const createHref = hrefOf(journalpost, NEW_DOCUMENT_DESCRIPTION);
      if (!createHref) throw new ElementsError("Elements-brukeren mangler rettighet til å opprette dokumentbeskrivelse");
      const template = stripReadOnly(await this.json("GET", createHref));
      const payload = {
        ...template,
        tittel: file.filename,
        tilknyttetRegistreringSom: code(index === 0 ? "H" : "V"),
        virksomhetsspesifikkeMetadata: {
          ...(template.virksomhetsspesifikkeMetadata ?? {}),
          [this.cfg.externalIdMetadataKey]: documentExternalId,
        },
      };
      try {
        document = await this.json("POST", createHref, payload);
      } catch (error) {
        document = await findDocument();
        if (!document) throw error;
      }
    }

    if (!hrefOf(document, DOCUMENT_OBJECT) || !hrefOf(document, FILE)) {
      document = await findDocument() ?? document;
    }

    const expectedVariant = file.variantformat === "Arkivformat" ? "A" : "P";
    const hasMatchingFile = async (current: JsonObject): Promise<boolean> => {
      const objectsHref = hrefOf(current, DOCUMENT_OBJECT);
      if (!objectsHref) return false;
      const objects = resultItems(await this.json("GET", objectsHref));
      return objects.some((object) => (
        String(object.sjekksum ?? "").toLowerCase() === checksum
        && object.variantformat?.kode === expectedVariant
      ));
    };
    if (await hasMatchingFile(document)) return;

    const uploadHref = hrefOf(document, FILE);
    if (!uploadHref) throw new ElementsError("Elements annonserer ikke filopplasting for dokumentbeskrivelsen");
    try {
      const token = await this.getToken();
      const response = await fetch(this.trustedUrl(uploadHref), {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.mimeType,
          "Content-Length": String(file.content.byteLength),
          "Content-Disposition": `attachment; filename*=utf-8''${encodeURIComponent(file.filename)}`,
        },
        body: new Uint8Array(file.content),
      });
      if (!response.ok) throw new ElementsError(`Elements filopplasting feilet (${response.status})`, response.status);
      const uploaded = await response.json() as JsonObject;
      if (String(uploaded.sjekksum ?? "").toLowerCase() !== checksum) {
        throw new ElementsError("Elements-kvitteringen har feil eller manglende dokumentkontrollsum");
      }
      if (uploaded.variantformat?.kode !== expectedVariant) {
        throw new ElementsError("Elements-kvitteringen har uventet variantformat");
      }
    } catch (error) {
      const refreshed = await findDocument();
      if (!refreshed || !(await hasMatchingFile(refreshed))) throw error;
    }
  }

  async createJournalpost(mappeId: string, spec: JournalpostSpec): Promise<{ id: string; journalpostIdent: string | null }> {
    const list = await this.globalList(ROOT_SAKARKIV, JOURNALPOST);
    const find = () => this.findFromList(list, this.externalFilter(spec.eksternId));
    let journalpost = await find();
    if (!journalpost) {
      const mappe = await this.findGlobal(ROOT_SAKARKIV, SAKSMAPPE, `systemID eq '${escapeOData(mappeId)}'`);
      if (!mappe) throw new ElementsError("Elements-saksmappen finnes ikke");
      const createHref = hrefOf(mappe, NEW_JOURNALPOST);
      if (!createHref) throw new ElementsError("Elements-brukeren mangler rettighet til å opprette journalpost");
      const template = stripReadOnly(await this.json("GET", createHref));
      const payload = {
        ...template,
        tittel: spec.tittel,
        offentligTittel: spec.offentligTittel ?? spec.tittel,
        journalposttype: code(spec.journalposttype),
        ...(spec.dokumentdato ? { dokumentetsDato: spec.dokumentdato } : {}),
        ...(spec.journalenhet ? { journalenhet: spec.journalenhet } : {}),
        ...(spec.skjerming ? { skjerming: shielding(spec.skjerming) } : {}),
        virksomhetsspesifikkeMetadata: {
          ...(template.virksomhetsspesifikkeMetadata ?? {}),
          [this.cfg.externalIdMetadataKey]: spec.eksternId,
        },
      };
      try {
        journalpost = await this.json("POST", createHref, payload);
      } catch (error) {
        journalpost = await find();
        if (!journalpost) throw error;
      }
    }
    if (!journalpost?.systemID) throw new ElementsError("Elements returnerte ikke systemID for journalpost");

    if (spec.files.length > 0 && !hrefOf(journalpost, NEW_DOCUMENT_DESCRIPTION)) {
      journalpost = await find() ?? journalpost;
    }

    for (let index = 0; index < spec.files.length; index += 1) {
      await this.ensureFile(journalpost, spec, spec.files[index], index);
    }
    const ident = journalpost.registreringsID ?? journalpost.journalpostnummer ?? null;
    return { id: String(journalpost.systemID), journalpostIdent: ident == null ? null : String(ident) };
  }
}
