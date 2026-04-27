import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";

interface Inclusion {
  id: number; slug: string; label: string;
  description: string | null; sortOrder: number; isActive: boolean;
}

const EMPTY: Omit<Inclusion, "id"> = {
  slug: "", label: "", description: "", sortOrder: 0, isActive: true,
};

export default function AdminSalgInclusions() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Omit<Inclusion, "id"> & { id?: number }) | null>(null);

  const { data: rows, isLoading } = useQuery<Inclusion[]>({
    queryKey: ["/api/admin/pricing/inclusions"],
  });

  const upsert = useMutation({
    mutationFn: async (row: Omit<Inclusion, "id"> & { id?: number }) => {
      const isUpdate = row.id != null;
      const res = await fetch(
        isUpdate ? `/api/admin/pricing/inclusions/${row.id}` : "/api/admin/pricing/inclusions",
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
      qc.invalidateQueries({ queryKey: ["/api/admin/pricing/inclusions"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/pricing/tiers"] });
      qc.invalidateQueries({ queryKey: ["/api/pricing/tiers"] });
      setEditing(null);
      toast({ title: "Lagret" });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/pricing/inclusions/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Sletting feilet");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/pricing/inclusions"] });
      qc.invalidateQueries({ queryKey: ["/api/pricing/tiers"] });
    },
  });

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-8">
        <Link href="/admin/salg">
          <Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="mr-2 h-4 w-4" />Tilbake</Button>
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inkluderte features</h1>
            <p className="mt-2 text-muted-foreground">
              Globale "hva er inkludert"-features. Kobles M:M til tiers under
              <Link href="/admin/salg/tiers" className="ml-1 underline">Tiers</Link>.
            </p>
          </div>
          <Button onClick={() => setEditing(EMPTY)}><Plus className="mr-2 h-4 w-4" />Ny feature</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
            <CardDescription>Vises på pris-side per tier som har dem.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="text-muted-foreground">Laster…</div> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead>Beskrivelse</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows?.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.sortOrder}</TableCell>
                      <TableCell>
                        <strong>{r.label}</strong>
                        <div className="text-xs text-muted-foreground">{r.slug}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.description}</TableCell>
                      <TableCell className="text-center">
                        {r.isActive ? <Badge>Aktiv</Badge> : <Badge variant="outline">Inaktiv</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => confirm(`Slette ${r.label}?`) && remove.mutate(r.id)}>
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
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Endre feature" : "Ny feature"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Slug</Label>
                  <Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
                </div>
                <div>
                  <Label>Sortering</Label>
                  <Input type="number" value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Visnings-navn</Label>
                <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              </div>
              <div>
                <Label>Beskrivelse</Label>
                <Textarea value={editing.description ?? ""} rows={2}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <label className="flex items-center gap-2">
                <Switch checked={editing.isActive}
                  onCheckedChange={(v) => setEditing({ ...editing, isActive: v })} />
                <span className="text-sm">Aktiv</span>
              </label>
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
