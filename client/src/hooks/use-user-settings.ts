import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface UserStateSettings {
  gdprAutoReplace: boolean;
  onboardingCompleted: boolean;
  dashboardPrefs: Record<string, any>;
}

const KEY = ["/api/user-state/settings"];

async function fetchSettings(): Promise<UserStateSettings> {
  const res = await fetch("/api/user-state/settings", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load user settings");
  return res.json();
}

async function patchSettings(patch: Partial<UserStateSettings>): Promise<void> {
  const res = await fetch("/api/user-state/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to update user settings");
}

export function useUserSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<UserStateSettings>({
    queryKey: KEY,
    queryFn: fetchSettings,
    staleTime: 1000 * 60 * 5,
  });

  const update = useMutation({
    mutationFn: patchSettings,
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<UserStateSettings>(KEY);
      if (prev) qc.setQueryData<UserStateSettings>(KEY, { ...prev, ...patch });
      return { prev };
    },
    onError: (_err, _patch, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return {
    settings: data ?? { gdprAutoReplace: false, onboardingCompleted: false, dashboardPrefs: {} },
    isLoading,
    update: update.mutate,
  };
}
