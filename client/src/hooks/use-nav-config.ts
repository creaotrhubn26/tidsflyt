/**
 * useNavConfig — fetches CMS-edited navigation overrides. Defaults to
 * an empty override object so the baked-in nav structure is unchanged
 * until an admin explicitly customizes it.
 */
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_NAV_CONFIG, mergeNavConfig, type NavConfig } from "@shared/nav-config";

const KEY = ["/api/cms/nav-config"];

export function useNavConfig(): NavConfig {
  const { data } = useQuery<NavConfig>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch("/api/cms/nav-config");
      if (!res.ok) return DEFAULT_NAV_CONFIG;
      return mergeNavConfig(await res.json());
    },
    staleTime: 5 * 60_000,
  });
  return data ?? DEFAULT_NAV_CONFIG;
}
