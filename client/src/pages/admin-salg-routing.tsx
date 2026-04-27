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

interface Routing {
  id: number;
  minUsers: number;
  maxUsers: number | null;
  assigneeLabel: string;
  assigneeEmail: string | null;
  responseTimeHours: number;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY: Omit<Routing, "id"> = {
  minUsers: 5,
  maxUsers: 25,
  assigneeLabel: "SDR",
  assigneeEmail: "",
  responseTimeHours: 24,
  notes: "",
  isActive: true,
  sortOrder: 0,
};

export default function AdminSalgRouting() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Omit<Routing, "id"> & { id?: number }) | null>(null);

  const { data: rows, isLoading } = useQuery<Routing[]>({
    queryKey: ["/api/admin/sales/routing"],
  });

  const upsert = useMutation({
    mutationFn: async (row: Omit<Routing, "id"> & { id?: number }) => {
      const isUpdate = row.id != null;
      const res = await fetch(
        isUpdate ? `/api/admin/sales/routing/${row.id}` : "/api/admin/sales/routing",
        {
          method: isUpdate ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            minUsers: row.minUsers,
            maxUsers: row.maxUsers,
            assigneeLabel: row.assigneeLabel,
            assigneeEmail: row.assigneeEmail || null,
            responseTimeHours: row.responseTimeHours,
            notes: row.notes,
            isActive: row.isActive,
            sortOrder: row.sortOrder,
          }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error || "Lagring feilet");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/sales/routing"] });
      setEditing(null);
      toast({ title: "Lagret" });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/sales/routing/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sletting feilet");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/sales/routing"] });
      toast({ title: "Slettet" });
    },
  });

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-8">
        <Link href="/admin/salg">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />Tilbake
          </Button>
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Salgs-routing</h1>
            <p className="mt-2 text-muted-foreground">
              Når kunden sender skjema, finner systemet første aktive regel som matcher
              brukerantallet og setter assignee-eposten på leaden.
            </p>
          </div>
          <Button onClick={() => setEditing(EMPTY)}>
            <Plus className="mr-2 h-4 w-4" />Ny regel
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Routing-regler</CardTitle>
            <CardDescription>Sortering avgjør prioritet ved overlapp.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground">Laster…</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brukere</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>E-post</TableHead>
                    <TableHead className="text-center">Responstid</TableHead>
                    <TableHead>Notater</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows?.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.maxUsers ? `${r.minUsers}–${r.maxUsers}` : `${r.minUsers}+`}</TableCell>
                      <TableCell><strong>{r.assigneeLabel}</strong></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.assigneeEmail || "—"}</TableCell>
                      <TableCell className="text-center">{r.responseTimeHours} t</TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {r.notes}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.isActive ? <Badge>Aktiv</Badge> : <Badge variant="outline">Inaktiv</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => confirm(`Slette ${r.assigneeLabel}?`) && remove.mutate(r.id)}
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Endre regel" : "Ny regel"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Min. brukere</Label>
                  <Input type="number" value={editing.minUsers}
                    onChange={(e) => setEditing({ ...editing, minUsers: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Maks. brukere (tom = ingen)</Label>
                  <Input type="number" value={editing.maxUsers ?? ""}
                    onChange={(e) => setEditing({
                      ...editing,
                      maxUsers: e.target.value === "" ? null : Number(e.target.value),
                    })} />
                </div>
                <div>
                  <Label>Sortering</Label>
                  <Input type="number" value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Assignee-rolle</Label>
                  <Input value={editing.assigneeLabel}
                    onChange={(e) => setEditing({ ...editing, assigneeLabel: e.target.value })}
                    placeholder="SDR / AE / Founder" />
                </div>
                <div>
                  <Label>Assignee-epost</Label>
                  <Input type="email" value={editing.assigneeEmail ?? ""}
                    onChange={(e) => setEditing({ ...editing, assigneeEmail: e.target.value })}
                    placeholder="sdr@firma.no" />
                </div>
              </div>
              <div>
                <Label>Mål-responstid (timer)</Label>
                <Input type="number" value={editing.responseTimeHours}
                  onChange={(e) => setEditing({ ...editing, responseTimeHours: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Notater (vises ikke til kunde)</Label>
                <Textarea value={editing.notes ?? ""} rows={2}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
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
