import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";

interface Stage {
  id: number;
  slug: string;
  label: string;
  probabilityPct: number;
  isTerminal: boolean;
  isWon: boolean;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY: Omit<Stage, "id"> = {
  slug: "", label: "", probabilityPct: 0,
  isTerminal: false, isWon: false, sortOrder: 0, isActive: true,
};

export default function AdminSalgPipeline() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Omit<Stage, "id"> & { id?: number }) | null>(null);

  const { data: rows, isLoading } = useQuery<Stage[]>({
    queryKey: ["/api/admin/sales/pipeline"],
  });

  const upsert = useMutation({
    mutationFn: async (row: Omit<Stage, "id"> & { id?: number }) => {
      const isUpdate = row.id != null;
      const res = await fetch(
        isUpdate ? `/api/admin/sales/pipeline/${row.id}` : "/api/admin/sales/pipeline",
        {
          method: isUpdate ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(row),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error || "Lagring feilet");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/sales/pipeline"] });
      setEditing(null);
      toast({ title: "Lagret" });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/sales/pipeline/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Sletting feilet");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/sales/pipeline"] }),
  });

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-8">
        <Link href="/admin/salg">
          <Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="mr-2 h-4 w-4" />Tilbake</Button>
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pipeline-stages</h1>
            <p className="mt-2 text-muted-foreground">
              Sannsynligheten brukes for vektet ARR-prognose. Første aktive stage (lavest sort-order)
              tildeles automatisk nye leads.
            </p>
          </div>
          <Button onClick={() => setEditing(EMPTY)}><Plus className="mr-2 h-4 w-4" />Ny stage</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Stages</CardTitle>
            <CardDescription>Sortert etter rekkefølge. Terminale stages avslutter leadet.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="text-muted-foreground">Laster…</div> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-center">Sannsynlighet</TableHead>
                    <TableHead className="text-center">Type</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows?.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.sortOrder}</TableCell>
                      <TableCell><strong>{s.label}</strong> <span className="text-xs text-muted-foreground">({s.slug})</span></TableCell>
                      <TableCell className="text-center">{s.probabilityPct}%</TableCell>
                      <TableCell className="text-center">
                        {s.isWon ? <Badge>Won</Badge> : s.isTerminal ? <Badge variant="destructive">Lost</Badge> : <span className="text-muted-foreground">Åpen</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {s.isActive ? <Badge>Aktiv</Badge> : <Badge variant="outline">Inaktiv</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => confirm(`Slette ${s.label}?`) && remove.mutate(s.id)}>
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Endre stage" : "Ny stage"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Slug</Label>
                  <Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
                </div>
                <div>
                  <Label>Visnings-navn</Label>
                  <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sannsynlighet (%)</Label>
                  <Input type="number" min={0} max={100} value={editing.probabilityPct}
                    onChange={(e) => setEditing({ ...editing, probabilityPct: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Sortering</Label>
                  <Input type="number" value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <Switch checked={editing.isTerminal}
                    onCheckedChange={(v) => setEditing({ ...editing, isTerminal: v })} />
                  <span className="text-sm">Terminal (lukker leadet)</span>
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={editing.isWon} disabled={!editing.isTerminal}
                    onCheckedChange={(v) => setEditing({ ...editing, isWon: v })} />
                  <span className="text-sm">Won (telles som vunnet kunde)</span>
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={editing.isActive}
                    onCheckedChange={(v) => setEditing({ ...editing, isActive: v })} />
                  <span className="text-sm">Aktiv</span>
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Avbryt</Button>
            <Button onClick={() => editing && upsert.mutate(editing)} disabled={upsert.isPending}>
              {upsert.isPending ? "Lagrer…" : "Lagre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
