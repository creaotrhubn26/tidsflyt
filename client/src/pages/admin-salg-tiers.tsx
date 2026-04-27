import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";

interface Tier {
  id: number;
  slug: string;
  label: string;
  minUsers: number;
  maxUsers: number | null;
  pricePerUserOre: number;
  onboardingOre: number;
  bindingMonths: number;
  isEnterprise: boolean;
  isActive: boolean;
  sortOrder: number;
  description: string | null;
  inclusionIds: number[];
}

interface Inclusion {
  id: number;
  slug: string;
  label: string;
}

const EMPTY: Omit<Tier, "id"> = {
  slug: "",
  label: "",
  minUsers: 5,
  maxUsers: 10,
  pricePerUserOre: 13900,
  onboardingOre: 500000,
  bindingMonths: 12,
  isEnterprise: false,
  isActive: true,
  sortOrder: 0,
  description: "",
  inclusionIds: [],
};

export default function AdminSalgTiers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Omit<Tier, "id"> & { id?: number }) | null>(null);

  const { data: tiers, isLoading } = useQuery<Tier[]>({
    queryKey: ["/api/admin/pricing/tiers"],
  });
  const { data: inclusions } = useQuery<Inclusion[]>({
    queryKey: ["/api/admin/pricing/inclusions"],
  });

  const upsert = useMutation({
    mutationFn: async (row: Omit<Tier, "id"> & { id?: number }) => {
      const isUpdate = row.id != null;
      const res = await fetch(
        isUpdate ? `/api/admin/pricing/tiers/${row.id}` : "/api/admin/pricing/tiers",
        {
          method: isUpdate ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            slug: row.slug,
            label: row.label,
            minUsers: row.minUsers,
            maxUsers: row.maxUsers,
            pricePerUserOre: row.pricePerUserOre,
            onboardingOre: row.onboardingOre,
            bindingMonths: row.bindingMonths,
            isEnterprise: row.isEnterprise,
            isActive: row.isActive,
            sortOrder: row.sortOrder,
            description: row.description ?? null,
            inclusionIds: row.inclusionIds,
          }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error || "Lagring feilet");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/pricing/tiers"] });
      qc.invalidateQueries({ queryKey: ["/api/pricing/tiers"] });
      setEditing(null);
      toast({ title: "Lagret", description: "Tier oppdatert." });
    },
    onError: (err: any) =>
      toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/pricing/tiers/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Sletting feilet");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/pricing/tiers"] });
      qc.invalidateQueries({ queryKey: ["/api/pricing/tiers"] });
      toast({ title: "Slettet" });
    },
    onError: (err: any) =>
      toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-8">
        <Link href="/admin/salg">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tilbake til Salg & Priser
          </Button>
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pris-tiers</h1>
            <p className="mt-2 text-muted-foreground">
              Brukerintervall, pris per bruker, onboarding-honorar og binding.
              Endringer slår inn umiddelbart i public pris-side og lead-routing.
            </p>
          </div>
          <Button onClick={() => setEditing(EMPTY)}>
            <Plus className="mr-2 h-4 w-4" />
            Ny tier
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Aktive og inaktive tiers</CardTitle>
            <CardDescription>
              Alle tall er øre internt; vises som kr i UI. Pris × brukerantall × 12 = årlig lisens.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center text-muted-foreground">Laster…</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tier</TableHead>
                    <TableHead>Brukere</TableHead>
                    <TableHead className="text-right">Pris/bruker/mnd</TableHead>
                    <TableHead className="text-right">Onboarding</TableHead>
                    <TableHead className="text-center">Binding</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tiers?.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.slug}</div>
                      </TableCell>
                      <TableCell>
                        {t.maxUsers ? `${t.minUsers}–${t.maxUsers}` : `${t.minUsers}+`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.isEnterprise ? "—" : `${Math.round(t.pricePerUserOre / 100)} kr`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Math.round(t.onboardingOre / 100).toLocaleString("no-NO")} kr
                      </TableCell>
                      <TableCell className="text-center">{t.bindingMonths} mnd</TableCell>
                      <TableCell className="text-center">
                        {t.isActive ? (
                          <Badge>Aktiv</Badge>
                        ) : (
                          <Badge variant="outline">Inaktiv</Badge>
                        )}
                        {t.isEnterprise && (
                          <Badge variant="secondary" className="ml-2">Custom</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Slette ${t.label}?`)) remove.mutate(t.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit/create dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Endre tier" : "Ny tier"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Slug</Label>
                  <Input
                    value={editing.slug}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                    placeholder="starter"
                  />
                </div>
                <div>
                  <Label>Visnings-navn</Label>
                  <Input
                    value={editing.label}
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    placeholder="Starter (5–10 brukere)"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Min. brukere</Label>
                  <Input
                    type="number"
                    value={editing.minUsers}
                    onChange={(e) => setEditing({ ...editing, minUsers: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Maks. brukere (tom = ingen)</Label>
                  <Input
                    type="number"
                    value={editing.maxUsers ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        maxUsers: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Sortering</Label>
                  <Input
                    type="number"
                    value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Pris/bruker/mnd (øre)</Label>
                  <Input
                    type="number"
                    value={editing.pricePerUserOre}
                    onChange={(e) =>
                      setEditing({ ...editing, pricePerUserOre: Number(e.target.value) })
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    = {Math.round(editing.pricePerUserOre / 100)} kr
                  </p>
                </div>
                <div>
                  <Label>Onboarding (øre)</Label>
                  <Input
                    type="number"
                    value={editing.onboardingOre}
                    onChange={(e) =>
                      setEditing({ ...editing, onboardingOre: Number(e.target.value) })
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    = {Math.round(editing.onboardingOre / 100).toLocaleString("no-NO")} kr
                  </p>
                </div>
                <div>
                  <Label>Binding (mnd)</Label>
                  <Input
                    type="number"
                    value={editing.bindingMonths}
                    onChange={(e) =>
                      setEditing({ ...editing, bindingMonths: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Beskrivelse (vises på pris-side)</Label>
                <Textarea
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <Switch
                    checked={editing.isActive}
                    onCheckedChange={(v) => setEditing({ ...editing, isActive: v })}
                  />
                  <span className="text-sm">Aktiv</span>
                </label>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={editing.isEnterprise}
                    onCheckedChange={(v) => setEditing({ ...editing, isEnterprise: v })}
                  />
                  <span className="text-sm">Enterprise / Custom (ingen pris vises)</span>
                </label>
              </div>

              {inclusions && inclusions.length > 0 && (
                <div>
                  <Label>Inkluderte features</Label>
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded border p-3">
                    {inclusions.map((inc) => (
                      <label key={inc.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={editing.inclusionIds.includes(inc.id)}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...editing.inclusionIds, inc.id]
                              : editing.inclusionIds.filter((x) => x !== inc.id);
                            setEditing({ ...editing, inclusionIds: next });
                          }}
                        />
                        {inc.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Avbryt
            </Button>
            <Button onClick={() => editing && upsert.mutate(editing)} disabled={upsert.isPending}>
              {upsert.isPending ? "Lagrer…" : "Lagre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
