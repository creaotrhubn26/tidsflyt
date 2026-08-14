import { useQuery } from "@tanstack/react-query";

interface EidStatus {
  linked: boolean;
  required: boolean;
}

async function fetchEidStatus(): Promise<EidStatus | null> {
  const response = await fetch("/api/auth/eid/status", { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
  return response.json();
}

export function useEidStatus(enabled: boolean) {
  return useQuery<EidStatus | null>({
    queryKey: ["/api/auth/eid/status"],
    queryFn: fetchEidStatus,
    enabled,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}
