/**
 * useGuideConfig — fetches the CMS-editable guide/tour/stuck-detection
 * config from /api/cms/guide-config. Falls back to DEFAULT_GUIDE_CONFIG
 * (baked-in defaults from shared/guide-config.ts) on error or while
 * loading, so consumers never see undefined values.
 */
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_GUIDE_CONFIG, mergeGuideConfig, type GuideConfig } from "@shared/guide-config";

const KEY = ["/api/cms/guide-config"];

export function useGuideConfig(): { config: GuideConfig; isLoading: boolean } {
  const { data, isLoading } = useQuery<GuideConfig>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch("/api/cms/guide-config");
      if (!res.ok) return DEFAULT_GUIDE_CONFIG;
      return mergeGuideConfig(await res.json());
    },
    staleTime: 5 * 60_000,
  });
  return { config: data ?? DEFAULT_GUIDE_CONFIG, isLoading };
}
