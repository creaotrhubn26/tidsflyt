/**
 * useGuideConfig — fetches the CMS-editable guide/tour/stuck-detection
 * config from /api/cms/guide-config. Falls back to DEFAULT_GUIDE_CONFIG
 * (baked-in defaults from shared/guide-config.ts) on error or while
 * loading, so consumers never see undefined values.
 *
 * Live preview: when the URL contains `?preview=cms`, the hook reads
 * the draft from sessionStorage (key="cms_guide_preview") instead of
 * the API. The CMS GuideEditor stashes the in-memory draft there and
 * opens /guide in a new tab to give admins a click-through preview
 * without needing to save first.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_GUIDE_CONFIG, mergeGuideConfig, type GuideConfig } from "@shared/guide-config";

const KEY = ["/api/cms/guide-config"];
export const PREVIEW_STORAGE_KEY = "cms_guide_preview";

function readPreviewDraft(): GuideConfig | null {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("preview") !== "cms") return null;
    const raw = sessionStorage.getItem(PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    return mergeGuideConfig(JSON.parse(raw));
  } catch { return null; }
}

export function useGuideConfig(): { config: GuideConfig; isLoading: boolean; isPreview: boolean } {
  const [previewDraft, setPreviewDraft] = useState<GuideConfig | null>(() =>
    typeof window !== "undefined" ? readPreviewDraft() : null,
  );

  // Live-update if the CMS posts a fresh draft via storage events
  // (cross-tab reactivity).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREVIEW_STORAGE_KEY) setPreviewDraft(readPreviewDraft());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const { data, isLoading } = useQuery<GuideConfig>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch("/api/cms/guide-config");
      if (!res.ok) return DEFAULT_GUIDE_CONFIG;
      return mergeGuideConfig(await res.json());
    },
    staleTime: 5 * 60_000,
    enabled: !previewDraft,
  });

  if (previewDraft) {
    return { config: previewDraft, isLoading: false, isPreview: true };
  }
  return { config: data ?? DEFAULT_GUIDE_CONFIG, isLoading, isPreview: false };
}
