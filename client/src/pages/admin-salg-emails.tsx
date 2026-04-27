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
import { Plus, Pencil, Trash2, ArrowLeft, Mail } from "lucide-react";

interface EmailTemplate {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  subject: string;
  badge: string;
  title: string;
  intro: string;
  bodyMd: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  isActive: boolean;
}

const EMPTY: Omit<EmailTemplate, "id"> = {
  slug: "", name: "", description: "",
  subject: "", badge: "Tidum", title: "", intro: "", bodyMd: "",
  ctaLabel: null, ctaUrl: null, isActive: true,
};

const SYSTEM_SLUGS = new Set(["access-request-received", "lead-assigned", "access-approved", "access-rejected"]);

const PLACEHOLDERS_BY_SLUG: Record<string, string[]> = {
  "lead-assigned": [
    "assignee_label", "response_time_hours",
    "kunde_company", "kunde_navn", "kunde_email", "kunde_phone",
    "kunde_org_nr", "kunde_institution", "bruker_antall", "tier_label",
    "lead_source", "lead_message_section", "lead_id", "app_url",
  ],
  "access-request-received": ["kunde_navn", "kunde_company"],
  "access-approved": ["kunde_navn", "kunde_company", "app_url"],
  "access-rejected": ["kunde_navn", "rejection_reason_section"],
};

export default function AdminSalgEmails() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Omit<EmailTemplate, "id"> & { id?: number }) | null>(null);

  const { data: rows, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/admin/email-templates"],
  });

  const upsert = useMutation({
    mutationFn: async (row: Omit<EmailTemplate, "id"> & { id?: number }) => {
      const isUpdate = row.id != null;
      const res = await fetch(
        isUpdate ? `/api/admin/email-templates/${row.id}` : "/api/admin/email-templates",
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
      qc.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      setEditing(null);
      toast({ title: "Lagret" });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/email-templates/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Sletting feilet");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/email-templates"] }),
  });

  const placeholders = editing?.slug && PLACEHOLDERS_BY_SLUG[editing.slug]
    ? PLACEHOLDERS_BY_SLUG[editing.slug]
    : ["leverandor_navn", "leverandor_org_nr", "app_url"];

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
            <h1 className="text-3xl font-bold tracking-tight">E-postmaler</h1>
            <p className="mt-2 text-muted-foreground">
              Tekst som sendes ut automatisk fra Tidum (lead-tildelinger, kvitteringer,
              godkjenning/avslag). Layout og branding ligger i koden — bare innholdet er her.
              Markdown med <code>{"{{placeholders}}"}</code> støttes.
            </p>
          </div>
          <Button onClick={() => setEditing(EMPTY)}>
            <Plus className="mr-2 h-4 w-4" />Ny mal
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Maler</CardTitle>
            <CardDescription>
              System-maler (slug starter med kjent prefiks) brukes automatisk av server-koden.
              Egendefinerte maler kan sendes manuelt via API.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground">Laster…</div>
            ) : (
              <div className="space-y-3">
                {rows?.map((t) => (
                  <div key={t.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-primary" />
                          <strong>{t.name}</strong>
                          <code className="text-xs text-muted-foreground">{t.slug}</code>
                          {SYSTEM_SLUGS.has(t.slug) && <Badge variant="secondary">System</Badge>}
                          {!t.isActive && <Badge variant="outline">Inaktiv</Badge>}
                        </div>
                        {t.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                        )}
                        <div className="mt-2 text-xs text-muted-foreground">
                          <strong>Subject:</strong> {t.subject}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!SYSTEM_SLUGS.has(t.slug) && (
                          <Button size="sm" variant="ghost"
                            onClick={() => confirm(`Slette ${t.name}?`) && remove.mutate(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[95vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Endre mal" : "Ny mal"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Slug</Label>
                  <Input value={editing.slug}
                    disabled={!!editing.id && SYSTEM_SLUGS.has(editing.slug)}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
                </div>
                <div>
                  <Label>Navn</Label>
                  <Input value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Beskrivelse (intern)</Label>
                <Input value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div>
                <Label>Subject (e-post-emne)</Label>
                <Input value={editing.subject}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Badge (header-tag)</Label>
                  <Input value={editing.badge}
                    onChange={(e) => setEditing({ ...editing, badge: e.target.value })} />
                </div>
                <div>
                  <Label>Tittel (h1 i e-post)</Label>
                  <Input value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Intro (under tittel)</Label>
                <Textarea value={editing.intro} rows={2}
                  onChange={(e) => setEditing({ ...editing, intro: e.target.value })} />
              </div>
              <div>
                <Label>Body (Markdown)</Label>
                <Textarea value={editing.bodyMd} rows={10}
                  className="font-mono text-sm"
                  onChange={(e) => setEditing({ ...editing, bodyMd: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Tilgjengelige variabler: {placeholders.map((p) => `{{${p}}}`).join(", ")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CTA-tekst (knapp)</Label>
                  <Input value={editing.ctaLabel ?? ""}
                    placeholder="(valgfritt)"
                    onChange={(e) => setEditing({ ...editing, ctaLabel: e.target.value || null })} />
                </div>
                <div>
                  <Label>CTA-URL</Label>
                  <Input value={editing.ctaUrl ?? ""}
                    placeholder="(valgfritt)"
                    onChange={(e) => setEditing({ ...editing, ctaUrl: e.target.value || null })} />
                </div>
              </div>
              <label className="flex items-center gap-2">
                <Switch checked={editing.isActive}
                  onCheckedChange={(v) => setEditing({ ...editing, isActive: v })} />
                <span className="text-sm">
                  Aktiv {!editing.isActive && "(server faller tilbake til hardkodet tekst hvis system-mal er deaktivert)"}
                </span>
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
