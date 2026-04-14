import { useMemo, useState } from "react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRapportTemplates, type RapportTemplate } from "@/hooks/use-rapport-templates";
import { useRolePreview } from "@/hooks/use-role-preview";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Copy, Pencil, Trash2, Loader2,
  Home, Briefcase, Building2, HeartPulse, Sparkles,
  ClipboardList, Activity, CheckSquare, MessageSquare, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_ROLES = ["vendor_admin", "hovedadmin", "admin", "super_admin"];

const TYPE_ICON: Record<string, any> = {
  barnevern:  Home,
  nav:        Briefcase,
  kommune:    Building2,
  helsevesen: HeartPulse,
  annet:      Sparkles,
};

const SECTION_ICON: Record<string, any> = {
  rich_text:                MessageSquare,
  structured_observations:  ClipboardList,
  goals_list:               Target,
  activities_log:           Activity,
  checklist:                CheckSquare,
  summary:                  FileText,
};

const SECTION_LABEL: Record<string, string> = {
  rich_text:                "Fritekst",
  structured_observations:  "Strukturerte observasjoner",
  goals_list:               "Mål-liste",
  activities_log:           "Aktivitetslogg",
  checklist:                "Sjekkliste",
  summary:                  "Oppsummering",
};

export default function AdminRapportTemplatesPage() {
  const { toast } = useToast();
  const { effectiveRole } = useRolePreview();
  const isAdmin = ADMIN_ROLES.includes(effectiveRole);
  const { templates, isLoading, clone, remove } = useRapportTemplates();
  const [preview, setPreview] = useState<RapportTemplate | null>(null);

  const grouped = useMemo(() => {
    const system = templates.filter(t => t.isSystem);
    const custom = templates.filter(t => !t.isSystem);
    return { system, custom };
  }, [templates]);

  const handleClone = async (id: string) => {
    try {
      await clone.mutateAsync(id);
      toast({ title: "Kopiert", description: "Du kan nå redigere den nye malen." });
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (t: RapportTemplate) => {
    if (!confirm(`Slett malen "${t.name}"?`)) return;
    try {
      await remove.mutateAsync(t.id);
      toast({ title: "Slettet" });
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            Rapport-maler
          </h1>
          <p className="text-muted-foreground mt-1">
            Strukturen på månedsrapporter per sektor. System-maler kan klones og tilpasses.
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Laster…</div>
        ) : (
          <>
            {/* System templates */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">System-maler</h2>
                <Badge variant="outline" className="text-[10px]">{grouped.system.length}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {grouped.system.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    isAdmin={isAdmin}
                    onPreview={() => setPreview(t)}
                    onClone={() => handleClone(t.id)}
                  />
                ))}
              </div>
            </div>

            {/* Custom templates */}
            {grouped.custom.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">Dine egne maler</h2>
                  <Badge variant="outline" className="text-[10px]">{grouped.custom.length}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {grouped.custom.map(t => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      isAdmin={isAdmin}
                      onPreview={() => setPreview(t)}
                      onClone={() => handleClone(t.id)}
                      onDelete={() => handleDelete(t)}
                    />
                  ))}
                </div>
              </div>
            )}

            {grouped.custom.length === 0 && grouped.system.length > 0 && isAdmin && (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Ingen egne maler ennå. Klon en system-mal for å tilpasse.
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Preview dialog */}
        <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            {preview && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {(() => {
                      const Icon = TYPE_ICON[preview.suggestedInstitutionType ?? "annet"] ?? Sparkles;
                      return <Icon className="h-5 w-5 text-primary" />;
                    })()}
                    {preview.name}
                  </DialogTitle>
                  <DialogDescription>
                    {preview.description}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {preview.suggestedInstitutionType && (
                      <Badge variant="outline">{preview.suggestedInstitutionType}</Badge>
                    )}
                    {preview.isSystem && <Badge variant="secondary">System</Badge>}
                    <Badge variant="outline" className="font-mono">{preview.slug}</Badge>
                  </div>
                  <Label>Seksjoner ({preview.sections.length})</Label>
                  <div className="space-y-2">
                    {preview.sections.map((s, i) => {
                      const Icon = SECTION_ICON[s.type] ?? MessageSquare;
                      return (
                        <div key={s.key} className="rounded-lg border p-3 bg-muted/20">
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-mono text-muted-foreground mt-0.5">{i + 1}.</span>
                            <Icon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold">{s.title}</span>
                                {s.required && <Badge variant="destructive" className="text-[9px]">Påkrevd</Badge>}
                                <Badge variant="outline" className="text-[9px]">{SECTION_LABEL[s.type] ?? s.type}</Badge>
                              </div>
                              {s.helpText && <p className="text-xs text-muted-foreground mt-1">{s.helpText}</p>}
                              {s.placeholder && (
                                <p className="text-[11px] italic text-muted-foreground/70 mt-1 line-clamp-2">{s.placeholder}</p>
                              )}
                              {s.items && s.items.length > 0 && (
                                <ul className="mt-1.5 space-y-0.5">
                                  {s.items.map((item, j) => (
                                    <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                      <CheckSquare className="h-3 w-3 mt-0.5 flex-shrink-0" /> {item}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}

function TemplateCard({ template, isAdmin, onPreview, onClone, onDelete }: {
  template: RapportTemplate;
  isAdmin: boolean;
  onPreview: () => void;
  onClone: () => void;
  onDelete?: () => void;
}) {
  const Icon = TYPE_ICON[template.suggestedInstitutionType ?? "annet"] ?? Sparkles;
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group" onClick={onPreview}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg p-2 bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              {template.name}
              {template.isSystem && <Badge variant="outline" className="text-[9px]">System</Badge>}
            </CardTitle>
            {template.suggestedInstitutionType && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Foreslått for <span className="font-medium">{template.suggestedInstitutionType}</span>
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {template.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ClipboardList className="h-3 w-3" />
            {template.sections.length} seksjoner
          </span>
          <span>{template.sections.filter(s => s.required).length} påkrevd</span>
        </div>
        {isAdmin && (
          <div className="flex justify-end gap-1 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" onClick={onClone}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Klon
            </Button>
            {onDelete && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}
