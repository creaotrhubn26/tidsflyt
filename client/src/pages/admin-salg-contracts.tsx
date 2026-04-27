import { useState, useMemo } from "react";
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
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowLeft, Eye } from "lucide-react";

interface Template {
  id: number;
  name: string;
  version: number;
  bodyMd: string;
  isDefault: boolean;
  isActive: boolean;
}

const PLACEHOLDERS = [
  "leverandor_navn", "leverandor_org_nr",
  "kunde_navn", "kunde_org_nr",
  "bruker_antall", "tier_navn",
  "pris_per_bruker_kr", "aarlig_lisens_kr",
  "onboarding_kr", "total_aar_1_kr",
  "binding_mnd", "oppsigelse_mnd", "prisendring_dager",
  "flex_pris_kr", "flex_max_dager",
  "sla_kritisk_timer", "sla_oppetid_pct",
];

const EMPTY: Omit<Template, "id"> = {
  name: "",
  version: 1,
  bodyMd: "",
  isDefault: false,
  isActive: true,
};

export default function AdminSalgContracts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Omit<Template, "id"> & { id?: number }) | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewUsers, setPreviewUsers] = useState(30);
  const [previewCustomer, setPreviewCustomer] = useState("Eksempel AS");
  const [previewOrgNr, setPreviewOrgNr] = useState("123 456 789");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery<Template[]>({
    queryKey: ["/api/admin/contracts/templates"],
  });

  const upsert = useMutation({
    mutationFn: async (row: Omit<Template, "id"> & { id?: number }) => {
      const isUpdate = row.id != null;
      const res = await fetch(
        isUpdate ? `/api/admin/contracts/templates/${row.id}` : "/api/admin/contracts/templates",
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
      qc.invalidateQueries({ queryKey: ["/api/admin/contracts/templates"] });
      setEditing(null);
      toast({ title: "Lagret" });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/contracts/templates/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Sletting feilet");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/contracts/templates"] }),
  });

  const runPreview = async (id: number) => {
    setPreviewId(id);
    const res = await fetch(`/api/admin/contracts/templates/${id}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        userCount: previewUsers,
        customerName: previewCustomer,
        customerOrgNr: previewOrgNr,
      }),
    });
    if (!res.ok) {
      toast({ title: "Feil", description: "Kunne ikke generere preview", variant: "destructive" });
      return;
    }
    const data = await res.json();
    setPreviewHtml(data.rendered);
  };

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
            <h1 className="text-3xl font-bold tracking-tight">Kontraktsmaler</h1>
            <p className="mt-2 text-muted-foreground">
              Markdown med {"{{placeholder}}"}-substitusjon. "Default"-malen brukes automatisk
              når selger genererer kontrakt fra et lead.
            </p>
          </div>
          <Button onClick={() => setEditing(EMPTY)}>
            <Plus className="mr-2 h-4 w-4" />Ny mal
          </Button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Laster…</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows?.map((t) => (
              <Card key={t.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {t.name}
                    {t.isDefault && <Badge>Default</Badge>}
                    {!t.isActive && <Badge variant="outline">Inaktiv</Badge>}
                  </CardTitle>
                  <CardDescription>v{t.version} · {t.bodyMd.length} tegn</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-32 overflow-hidden text-xs text-muted-foreground">
                    {t.bodyMd.slice(0, 240)}…
                  </pre>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => runPreview(t.id)}>
                      <Eye className="mr-1 h-4 w-4" />Preview
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                      <Pencil className="mr-1 h-4 w-4" />Endre
                    </Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => confirm(`Slette ${t.name}?`) && remove.mutate(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[95vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Endre mal" : "Ny mal"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label>Navn</Label>
                  <Input value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <Label>Versjon</Label>
                  <Input type="number" value={editing.version}
                    onChange={(e) => setEditing({ ...editing, version: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Markdown-mal</Label>
                <Textarea value={editing.bodyMd} rows={20}
                  className="font-mono text-sm"
                  onChange={(e) => setEditing({ ...editing, bodyMd: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Tilgjengelige placeholders: {PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <Switch checked={editing.isActive}
                    onCheckedChange={(v) => setEditing({ ...editing, isActive: v })} />
                  <span className="text-sm">Aktiv</span>
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={editing.isDefault}
                    onCheckedChange={(v) => setEditing({ ...editing, isDefault: v })} />
                  <span className="text-sm">Default-mal (brukes automatisk)</span>
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

      {/* Preview dialog */}
      <Dialog open={previewHtml != null} onOpenChange={(o) => { if (!o) { setPreviewHtml(null); setPreviewId(null); } }}>
        <DialogContent className="max-h-[95vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Forhåndsvisning</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 rounded border bg-muted/30 p-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Brukere</Label>
                <Input type="number" value={previewUsers}
                  onChange={(e) => setPreviewUsers(Number(e.target.value))} />
              </div>
              <div>
                <Label>Kunde-navn</Label>
                <Input value={previewCustomer}
                  onChange={(e) => setPreviewCustomer(e.target.value)} />
              </div>
              <div>
                <Label>Kunde org.nr</Label>
                <Input value={previewOrgNr}
                  onChange={(e) => setPreviewOrgNr(e.target.value)} />
              </div>
            </div>
            <Button size="sm" variant="outline"
              onClick={() => previewId && runPreview(previewId)}>
              Re-rendre
            </Button>
          </div>
          {previewHtml && (
            <pre className="mt-4 whitespace-pre-wrap rounded border bg-white p-4 text-sm">
              {previewHtml}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
