import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface RapportTemplateSection {
  key: string;
  title: string;
  type: "rich_text" | "structured_observations" | "goals_list" | "activities_log" | "checklist" | "summary";
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  items?: string[];
  minItems?: number;
}

export interface RapportTemplate {
  id: string;
  vendorId: number | null;
  slug: string;
  name: string;
  description: string | null;
  suggestedInstitutionType: string | null;
  sections: RapportTemplateSection[];
  branding: Record<string, any>;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
}

const KEY = ["/api/rapport-templates"];

export function useRapportTemplates() {
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery<RapportTemplate[]>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch("/api/rapport-templates", { credentials: "include" });
      if (!res.ok) throw new Error("Kunne ikke hente maler");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const clone = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/rapport-templates/${id}/clone`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kunne ikke klone");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RapportTemplate> }) => {
      const res = await fetch(`/api/rapport-templates/${id}`, {
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
      const res = await fetch(`/api/rapport-templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kunne ikke slette");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return { templates, isLoading, clone, update, remove };
}
