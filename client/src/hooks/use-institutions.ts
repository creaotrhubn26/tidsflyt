import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface InstitutionStats {
  institutionId: string;
  activeSaker: number;
  rapporterThisMonth: {
    total: number;
    utkast: number;
    til_godkjenning: number;
    godkjent: number;
    returnert: number;
  };
  approvedHoursTotal: number;
}

export interface Institution {
  id: string;
  vendorId: number;
  orgNumber: string | null;
  name: string;
  institutionType: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  autoForwardRapport: boolean;
  forwardEmail: string | null;
  overtimeApplicable: boolean;
  notes: string | null;
  active: boolean;
  brregVerified: boolean;
  createdAt: string;
}

const KEY = ["/api/institutions"];

async function fetchInstitutions(): Promise<Institution[]> {
  const res = await fetch("/api/institutions", { credentials: "include" });
  if (!res.ok) throw new Error("Kunne ikke hente institusjoner");
  return res.json();
}

export function useInstitutions() {
  const qc = useQueryClient();

  const { data: institutions = [], isLoading } = useQuery<Institution[]>({
    queryKey: KEY,
    queryFn: fetchInstitutions,
    staleTime: 1000 * 60,
  });

  const create = useMutation({
    mutationFn: async (data: Partial<Institution>) => {
      const res = await fetch("/api/institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kunne ikke opprette");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Institution> }) => {
      const res = await fetch(`/api/institutions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kunne ikke oppdatere");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/institutions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kunne ikke slette");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return {
    institutions,
    isLoading,
    create,
    update,
    remove,
  };
}

export function useInstitutionStats() {
  return useQuery<InstitutionStats[]>({
    queryKey: ["/api/institutions/stats"],
    queryFn: async () => {
      const res = await fetch("/api/institutions/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Kunne ikke hente statistikk");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });
}
