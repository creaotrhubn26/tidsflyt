import { DocumasterProvider } from "./documaster-client";
import { ElementsProvider } from "./elements-client";
import type { JournalpostSpec, SaksmappeSpec } from "./noark";

export const DOCUMASTER_CONTRACT_PROFILE = "documaster-noark5-ws-v1";
export const ELEMENTS_CONTRACT_PROFILE = "elements-noark5-tg-1.1";
export const DEFAULT_ELEMENTS_EXTERNAL_ID_KEY = "vnd-tidum-v1:eksternid";

export type ArchiveProviderName = "documaster" | "elements";

export interface ArchiveProviderConfig {
  baseUrl: string;
  tokenUrl?: string | null;
  clientId: string;
  clientSecret: string;
  arkivdelId?: string | null;
  journalenhet?: string | null;
  klasseId?: string | null;
  contractProfile?: string | null;
  externalIdMetadataKey?: string | null;
  apiPaths?: Partial<{
    token: string;
    query: string;
    transaction: string;
    upload: string;
  }>;
}

export interface ArchiveProvider {
  verify(): Promise<void>;
  ensureSaksmappe(spec: SaksmappeSpec): Promise<{ id: string; mappeIdent: string | null }>;
  createJournalpost(
    mappeId: string,
    spec: JournalpostSpec,
  ): Promise<{ id: string; journalpostIdent: string | null }>;
}

export interface ArchiveProviderCapability {
  id: ArchiveProviderName;
  label: string;
  enabled: boolean;
  contractProfile: string;
}

export function elementsArchiveEnabled(): boolean {
  return process.env.ELEMENTS_ARCHIVE_ENABLED?.trim().toLowerCase() === "true";
}

export function archiveProviderCapabilities(): ArchiveProviderCapability[] {
  return [
    {
      id: "documaster",
      label: "Documaster",
      enabled: true,
      contractProfile: DOCUMASTER_CONTRACT_PROFILE,
    },
    {
      id: "elements",
      label: "Elements",
      enabled: elementsArchiveEnabled(),
      contractProfile: ELEMENTS_CONTRACT_PROFILE,
    },
  ];
}

export function normalizeArchiveProvider(value: unknown): ArchiveProviderName {
  const provider = String(value ?? "").trim().toLowerCase();
  if (provider === "documaster" || provider === "elements") return provider;
  throw new Error("Ukjent arkivprovider");
}

export function defaultContractProfile(provider: ArchiveProviderName): string {
  return provider === "elements" ? ELEMENTS_CONTRACT_PROFILE : DOCUMASTER_CONTRACT_PROFILE;
}

export function createArchiveProvider(providerValue: string, cfg: ArchiveProviderConfig): ArchiveProvider {
  const provider = normalizeArchiveProvider(providerValue);
  const profile = cfg.contractProfile || defaultContractProfile(provider);

  if (provider === "documaster") {
    if (profile !== DOCUMASTER_CONTRACT_PROFILE) {
      throw new Error("Ustøttet Documaster-kontraktprofil");
    }
    return new DocumasterProvider(cfg);
  }

  if (!elementsArchiveEnabled()) {
    throw new Error("Elements-arkivering er ikke aktivert i driftsmiljøet");
  }
  if (profile !== ELEMENTS_CONTRACT_PROFILE) {
    throw new Error("Ustøttet Elements-kontraktprofil");
  }
  if (!cfg.tokenUrl || !cfg.arkivdelId || !cfg.externalIdMetadataKey) {
    throw new Error("Elements krever token-URL, arkivdel og ekstern-ID-metadata");
  }
  return new ElementsProvider({
    ...cfg,
    tokenUrl: cfg.tokenUrl,
    arkivdelId: cfg.arkivdelId,
    contractProfile: profile,
    externalIdMetadataKey: cfg.externalIdMetadataKey,
  });
}
