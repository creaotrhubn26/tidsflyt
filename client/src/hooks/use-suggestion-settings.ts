import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  normalizeSuggestionSettings,
  type SuggestionBlockCategory,
  type SuggestionFrequency,
  type SuggestionMode,
  type SuggestionSettings,
} from "@/lib/suggestion-settings";

export interface SuggestionSettingsPatch {
  mode?: SuggestionMode;
  frequency?: SuggestionFrequency;
  confidenceThreshold?: number;
}

interface SuggestionBlockPayload {
  category: SuggestionBlockCategory;
  value: string;
}

async function patchSuggestionSettings(patch: SuggestionSettingsPatch): Promise<SuggestionSettings> {
  const response = await apiRequest("PATCH", "/api/suggestion-settings", patch);
  const payload = await response.json();
  return normalizeSuggestionSettings(payload);
}

async function addSuggestionBlock(payload: SuggestionBlockPayload): Promise<SuggestionSettings> {
  const response = await apiRequest("POST", "/api/suggestion-settings/blocks", payload);
  const body = await response.json();
  return normalizeSuggestionSettings(body);
}

async function removeSuggestionBlock(payload: SuggestionBlockPayload): Promise<SuggestionSettings> {
  const response = await apiRequest("DELETE", "/api/suggestion-settings/blocks", payload);
  const body = await response.json();
  return normalizeSuggestionSettings(body);
}

async function resetSuggestionSettingsToTeamDefault(): Promise<SuggestionSettings> {
  const response = await apiRequest("POST", "/api/suggestion-settings/reset", {});
  const body = await response.json();
  return normalizeSuggestionSettings(body);
}

export function useSuggestionSettings() {
  const queryClient = useQueryClient();

  const query = useQuery<SuggestionSettings | Record<string, unknown>>({
    queryKey: ["/api/suggestion-settings"],
    staleTime: 60_000,
  });

  const settings = useMemo(
    () => normalizeSuggestionSettings(query.data),
    [query.data],
  );

  const mutation = useMutation({
    mutationFn: patchSuggestionSettings,
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(["/api/suggestion-settings"], nextSettings);
    },
  });

  const blockMutation = useMutation({
    mutationFn: addSuggestionBlock,
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(["/api/suggestion-settings"], nextSettings);
    },
  });

  const unblockMutation = useMutation({
    mutationFn: removeSuggestionBlock,
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(["/api/suggestion-settings"], nextSettings);
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetSuggestionSettingsToTeamDefault,
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(["/api/suggestion-settings"], nextSettings);
    },
  });

  return {
    settings,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    saveSettings: mutation.mutate,
    saveSettingsAsync: mutation.mutateAsync,
    blockSuggestion: blockMutation.mutate,
    blockSuggestionAsync: blockMutation.mutateAsync,
    unblockSuggestion: unblockMutation.mutate,
    unblockSuggestionAsync: unblockMutation.mutateAsync,
    resetToTeamDefault: resetMutation.mutate,
    resetToTeamDefaultAsync: resetMutation.mutateAsync,
    isSaving: mutation.isPending || blockMutation.isPending || unblockMutation.isPending || resetMutation.isPending,
  };
}
