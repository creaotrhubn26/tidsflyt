import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface GoalCategory {
  id: string;
  navn: string;
  ikon: string | null;
}

const KEY = ["/api/user-state/goal-categories"];

async function fetchCategories(): Promise<GoalCategory[]> {
  const res = await fetch("/api/user-state/goal-categories", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load goal categories");
  return res.json();
}

async function createCategory(navn: string): Promise<GoalCategory> {
  const res = await fetch("/api/user-state/goal-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ navn }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to create category");
  }
  return res.json();
}

async function deleteCategory(id: string): Promise<void> {
  const res = await fetch(`/api/user-state/goal-categories/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete category");
}

export function useGoalCategories() {
  const qc = useQueryClient();
  const { data: categories = [], isLoading } = useQuery<GoalCategory[]>({
    queryKey: KEY,
    queryFn: fetchCategories,
    staleTime: 1000 * 60 * 5,
  });

  const create = useMutation({
    mutationFn: createCategory,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const remove = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return {
    categories,
    isLoading,
    addCategory: create.mutateAsync,
    removeCategory: remove.mutate,
  };
}
