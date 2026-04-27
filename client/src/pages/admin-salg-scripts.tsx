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
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";

interface Script {
  id: number;
  slug: string;
  category: "discovery" | "demo" | "close" | "objection";
  title: string;
  bodyMd: string;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY: Omit<Script, "id"> = {
  slug: "",
  category: "discovery",
  title: "",
  bodyMd: "",
  sortOrder: 0,
  isActive: true,
};

const CATEGORIES: Array<{ value: Script["category"]; label: string }> = [
  { value: "discovery", label: "Discovery" },
  { value: "demo", label: "Demo" },
  { value: "close", label: "Close" },
  { value: "objection", label: "Innvendinger" },
];

export default function AdminSalgScripts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Omit<Script, "id"> & { id?: number }) | null>(null);

  const { data: rows, isLoading } = useQuery<Script[]>({
    queryKey: ["/api/admin/sales/scripts"],
  });

  const upsert = useMutation({
    mutationFn: async (row: Omit<Script, "id"> & { id?: number }) => {
      const isUpdate = row.id != null;
      const res = await fetch(
        isUpdate ? `/api/admin/sales/scripts/${row.id}` : "/api/admin/sales/scripts",
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
      qc.invalidateQueries({ queryKey: ["/api/admin/sales/scripts"] });
      setEditing(null);
      toast({ title: "Lagret" });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/sales/scripts/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Sletting feilet");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/sales/scripts"] }),
  });

  const grouped = (rows ?? []).reduce<Record<string, Script[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

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
            <h1 className="text-3xl font-bold tracking-tight">Salgs-script</h1>
            <p className="mt-2 text-muted-foreground">
              Discovery-spørsmål, demo-flyt, close-replikker og innvendingshåndtering.
              Markdown støttes. Bruk {"{{user_count}}"} og andre placeholders.
            </p>
          </div>
          <Button onClick={() => setEditing(EMPTY)}>
            <Plus className="mr-2 h-4 w-4" />Ny replikk
          </Button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Laster…</div>
        ) : (
          <div className="space-y-6">
            {CATEGORIES.map((cat) => (
              <Card key={cat.value}>
                <CardHeader>
                  <CardTitle>{cat.label}</CardTitle>
                  <CardDescription>{(grouped[cat.value] ?? []).length} replikker</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(grouped[cat.value] ?? []).map((s) => (
                    <div key={s.id} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <strong>{s.title}</strong>
                            {!s.isActive && <Badge variant="outline">Inaktiv</Badge>}
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                            {s.bodyMd}
                          </pre>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost"
                            onClick={() => confirm(`Slette "${s.title}"?`) && remove.mutate(s.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Endre replikk" : "Ny replikk"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Slug</Label>
                  <Input value={editing.slug}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
                </div>
                <div>
                  <Label>Kategori</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editing.category}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value as any })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label>Tittel</Label>
                <Input value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <Label>Innhold (Markdown)</Label>
                <Textarea value={editing.bodyMd} rows={10}
                  onChange={(e) => setEditing({ ...editing, bodyMd: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Placeholders: {"{{user_count}}"}, {"{{annual_total_kr}}"}, {"{{tier_navn}}"}.
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Label>Sortering</Label>
                  <Input className="w-24" type="number" value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} />
                </div>
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
