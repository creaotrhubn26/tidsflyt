/**
 * PowerOffice Mappings Table
 *
 * Én rad per miljøarbeider/tiltaksleder i vendoren. Viser Tidum-bruker +
 * PO-ansatt-ID som en redigerbar input. Lagring via PATCH-stil upsert.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Trash2, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VendorUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  poEmployeeId: string | null;
  mappingUpdatedAt: string | null;
}

const USERS_KEY = ["/api/integrations/poweroffice/vendor-users"];

function displayName(u: VendorUser): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || u.id;
}

function roleLabel(role: string | null): string {
  if (!role) return "—";
  const r = role.toLowerCase().replace(/[\s-]/g, "_");
  if (r === "miljoarbeider") return "Miljøarbeider";
  if (r === "tiltaksleder") return "Tiltaksleder";
  if (r === "teamleder") return "Teamleder";
  return role;
}

export function PowerOfficeMappingsTable() {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery<VendorUser[]>({
    queryKey: USERS_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/integrations/poweroffice/vendor-users");
      return res.json();
    },
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (args: { user: VendorUser; poEmployeeId: string }) => {
      const res = await apiRequest("POST", "/api/integrations/poweroffice/mappings", {
        tidumUserId: args.user.id,
        poEmployeeId: args.poEmployeeId,
        employeeName: displayName(args.user),
      });
      return res.json();
    },
    onSuccess: (_data, args) => {
      toast({
        title: "Mapping lagret",
        description: `${displayName(args.user)} → PO ${args.poEmployeeId}`,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[args.user.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
    },
    onError: (err: any) => {
      toast({
        title: "Kunne ikke lagre mapping",
        description: String(err?.message || err).replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (user: VendorUser) => {
      await apiRequest("DELETE", `/api/integrations/poweroffice/mappings/${encodeURIComponent(user.id)}`);
      return user;
    },
    onSuccess: (user) => {
      toast({ title: "Mapping fjernet", description: displayName(user) });
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
    },
    onError: (err: any) => {
      toast({
        title: "Kunne ikke fjerne",
        description: String(err?.message || err),
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laster brukere…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Ingen miljøarbeidere eller tiltaksledere funnet for denne vendoren.
      </p>
    );
  }

  const mappedCount = rows.filter((r) => r.poEmployeeId).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {mappedCount} av {rows.length} mappet
        </span>
        <span>Ansatt-ID hentes fra PowerOffice Go</span>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        {rows.map((u) => {
          const draft = drafts[u.id];
          const hasDraft = draft !== undefined;
          const current = hasDraft ? draft : u.poEmployeeId ?? "";
          const dirty = hasDraft && (draft || "").trim() !== (u.poEmployeeId ?? "");
          const isSaving = upsertMutation.isPending && upsertMutation.variables?.user.id === u.id;
          const isDeleting = deleteMutation.isPending && deleteMutation.variables?.id === u.id;

          return (
            <div
              key={u.id}
              className={cn(
                "flex items-center gap-3 p-3",
                !u.poEmployeeId && "bg-amber-50/50 dark:bg-amber-950/20",
              )}
              data-testid={`po-mapping-row-${u.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{displayName(u)}</span>
                  {u.poEmployeeId && (
                    <Badge variant="outline" className="h-5 gap-1 border-emerald-300 text-emerald-700 text-[10px]">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Mappet
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {roleLabel(u.role)} · {u.email ?? "—"}
                </div>
              </div>

              <Input
                className="max-w-[140px] h-8 text-sm"
                value={current}
                placeholder="PO ansatt-ID"
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && dirty && (draft || "").trim()) {
                    upsertMutation.mutate({ user: u, poEmployeeId: (draft || "").trim() });
                  }
                }}
                data-testid={`po-mapping-input-${u.id}`}
              />

              <Button
                size="sm"
                variant="outline"
                disabled={!dirty || !(draft || "").trim() || isSaving}
                onClick={() =>
                  upsertMutation.mutate({ user: u, poEmployeeId: (draft || "").trim() })
                }
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
              </Button>

              {u.poEmployeeId && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isDeleting}
                  onClick={() => deleteMutation.mutate(u)}
                  aria-label="Fjern mapping"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
