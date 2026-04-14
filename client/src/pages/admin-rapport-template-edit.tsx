import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FileText, Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft,
  Save, Loader2, CheckSquare, ClipboardList, Activity, MessageSquare, Target,
  GripVertical, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRapportTemplates, type RapportTemplate, type RapportTemplateSection } from "@/hooks/use-rapport-templates";
import { cn } from "@/lib/utils";

const SECTION_TYPES: { value: RapportTemplateSection["type"]; label: string; icon: typeof MessageSquare; description: string }[] = [
  { value: "rich_text",                label: "Fritekst",                icon: MessageSquare,  description: "Fri tekst med GDPR-sjekk" },
  { value: "summary",                  label: "Oppsummering",            icon: FileText,       description: "Avsluttende oppsummering" },
  { value: "structured_observations",  label: "Observasjoner",           icon: ClipboardList,  description: "Dato + område + beskrivelse" },
  { value: "checklist",                label: "Sjekkliste",              icon: CheckSquare,    description: "Punkter med ja/nei og merknad" },
  { value: "goals_list",               label: "Mål-liste",               icon: Target,         description: "Bruker standard mål-system (legg til kun én gang)" },
  { value: "activities_log",           label: "Aktivitetslogg",          icon: Activity,       description: "Bruker standard aktivitet-system (legg til kun én gang)" },
];

const SYSTEM_KEYS = ["innledning", "maal", "aktiviteter", "avslutning"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[æå]/g, "a").replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `seksjon-${Date.now()}`;
}

export default function AdminRapportTemplateEditPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { templates, update } = useRapportTemplates();

  const { data: fullTemplate } = useQuery<RapportTemplate>({
    queryKey: [`/api/rapport-templates/${params.id}`],
    queryFn: async () => {
      const res = await fetch(`/api/rapport-templates/${params.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!params.id,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [suggestedType, setSuggestedType] = useState<string>("");
  const [sections, setSections] = useState<RapportTemplateSection[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  useEffect(() => {
    if (!fullTemplate) return;
    setName(fullTemplate.name);
    setDescription(fullTemplate.description ?? "");
    setSuggestedType(fullTemplate.suggestedInstitutionType ?? "");
    setSections(fullTemplate.sections ?? []);
  }, [fullTemplate]);

  const isSystem = fullTemplate?.isSystem ?? false;
  const readOnly = isSystem;

  const move = (idx: number, dir: -1 | 1) => {
    if (readOnly) return;
    const next = [...sections];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSections(next);
  };

  const updateSection = (idx: number, patch: Partial<RapportTemplateSection>) => {
    if (readOnly) return;
    setSections(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeSection = (idx: number) => {
    if (readOnly) return;
    if (!confirm(`Fjern seksjonen "${sections[idx].title}"?`)) return;
    setSections(sections.filter((_, i) => i !== idx));
  };

  const addSection = (type: RapportTemplateSection["type"]) => {
    if (readOnly) return;
    const defaultTitles: Record<string, string> = {
      rich_text: "Ny tekstseksjon",
      summary: "Oppsummering",
      structured_observations: "Observasjoner",
      checklist: "Sjekkliste",
      goals_list: "Mål og tiltak",
      activities_log: "Aktivitetslogg",
    };
    const defaultKeys: Record<string, string> = {
      goals_list: "maal",
      activities_log: "aktiviteter",
    };
    const title = defaultTitles[type];
    const key = defaultKeys[type] ?? slugify(title) + "-" + Math.random().toString(36).slice(2, 6);

    // Prevent duplicate goals_list or activities_log
    if ((type === "goals_list" || type === "activities_log") && sections.some(s => s.type === type)) {
      toast({ title: "Allerede lagt til", description: `Malen har allerede en ${type === "goals_list" ? "mål-liste" : "aktivitetslogg"}`, variant: "destructive" });
      return;
    }

    const newSection: RapportTemplateSection = {
      key,
      title,
      type,
      required: false,
      ...(type === "checklist" ? { items: ["Punkt 1"] } : {}),
    };
    setSections([...sections, newSection]);
    setAddDialogOpen(false);
  };

  const handleSave = async () => {
    try {
      if (!name.trim()) {
        toast({ title: "Navn er påkrevd", variant: "destructive" });
        return;
      }
      await update.mutateAsync({
        id: params.id!,
        data: {
          name,
          description,
          suggestedInstitutionType: suggestedType || null,
          sections,
        } as any,
      });
      toast({ title: "Lagret", description: "Malen er oppdatert" });
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  if (!fullTemplate) {
    return (
      <PortalLayout>
        <div className="text-center py-12 text-muted-foreground">Laster mal…</div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/rapport-maler")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Tilbake
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                {name || "Mal"}
                {isSystem && <Badge variant="secondary">System</Badge>}
              </h1>
              <p className="text-muted-foreground text-sm">
                {isSystem ? "System-maler kan ikke redigeres — klon først" : "Dra seksjoner for å endre rekkefølge"}
              </p>
            </div>
          </div>
          {!readOnly && (
            <Button onClick={handleSave} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Lagre endringer
            </Button>
          )}
        </div>

        {/* Metadata */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Grunnleggende info</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Navn</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-2">
              <Label>Foreslått institusjonstype</Label>
              <Select value={suggestedType || "__none__"} onValueChange={(v) => setSuggestedType(v === "__none__" ? "" : v)} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— ingen —</SelectItem>
                  <SelectItem value="barnevern">Barnevern</SelectItem>
                  <SelectItem value="nav">NAV</SelectItem>
                  <SelectItem value="kommune">Kommune</SelectItem>
                  <SelectItem value="helsevesen">Helsevesen</SelectItem>
                  <SelectItem value="privat">Privat</SelectItem>
                  <SelectItem value="annet">Annet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Beskrivelse</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} disabled={readOnly} />
            </div>
          </CardContent>
        </Card>

        {/* Sections */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Seksjoner ({sections.length})</h2>
            {!readOnly && (
              <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Legg til seksjon
              </Button>
            )}
          </div>

          {sections.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">
              Ingen seksjoner. Klikk "Legg til seksjon" for å starte.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {sections.map((section, idx) => (
                <SectionEditor
                  key={`${section.key}-${idx}`}
                  section={section}
                  idx={idx}
                  total={sections.length}
                  readOnly={readOnly}
                  isSystemKey={SYSTEM_KEYS.includes(section.key)}
                  onChange={(patch) => updateSection(idx, patch)}
                  onMoveUp={() => move(idx, -1)}
                  onMoveDown={() => move(idx, 1)}
                  onRemove={() => removeSection(idx)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Add section dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Legg til seksjon</DialogTitle>
              <DialogDescription>Velg seksjonstype — du kan redigere detaljene etterpå.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 md:grid-cols-2">
              {SECTION_TYPES.map(({ value, label, icon: Icon, description }) => (
                <button
                  key={value}
                  className="flex items-start gap-3 rounded-lg border p-3 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                  onClick={() => addSection(value)}
                >
                  <div className="rounded-lg p-2 bg-primary/10 text-primary flex-shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                  </div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}

// ─── Section editor row ─────────────────────────────────────────────────────

function SectionEditor({
  section, idx, total, readOnly, isSystemKey,
  onChange, onMoveUp, onMoveDown, onRemove,
}: {
  section: RapportTemplateSection;
  idx: number;
  total: number;
  readOnly: boolean;
  isSystemKey: boolean;
  onChange: (patch: Partial<RapportTemplateSection>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const TypeMeta = SECTION_TYPES.find(t => t.value === section.type);
  const Icon = TypeMeta?.icon ?? MessageSquare;

  return (
    <Card className={cn("border-border/70", isSystemKey && "bg-primary/5 border-primary/25")}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-0.5 flex-shrink-0 pt-1">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onMoveUp} disabled={readOnly || idx === 0} aria-label="Flytt opp">
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onMoveDown} disabled={readOnly || idx === total - 1} aria-label="Flytt ned">
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="rounded-lg p-2 bg-primary/10 text-primary flex-shrink-0 h-9 w-9 flex items-center justify-center">
            <Icon className="h-4 w-4" />
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                value={section.title}
                onChange={(e) => onChange({ title: e.target.value })}
                disabled={readOnly}
                className="font-semibold flex-1 min-w-[180px]"
              />
              <Badge variant="outline" className="text-[10px]">{TypeMeta?.label}</Badge>
              {isSystemKey && <Badge variant="secondary" className="text-[10px]">Kjernesystem</Badge>}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-2">
                <Switch
                  checked={!!section.required}
                  onCheckedChange={(v) => onChange({ required: v })}
                  disabled={readOnly}
                />
                Påkrevd
              </label>
              {!readOnly && !isSystemKey && (
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive h-7 w-7 p-0" onClick={onRemove} aria-label="Fjern">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-xs">Hjelpetekst (valgfri)</Label>
                <Input
                  value={section.helpText ?? ""}
                  onChange={(e) => onChange({ helpText: e.target.value })}
                  disabled={readOnly}
                  placeholder="Kort veiledning til brukeren"
                  className="mt-1"
                />
              </div>

              {(section.type === "rich_text" || section.type === "summary") && (
                <div>
                  <Label className="text-xs">Plassholder-tekst (valgfri)</Label>
                  <Textarea
                    value={section.placeholder ?? ""}
                    onChange={(e) => onChange({ placeholder: e.target.value })}
                    disabled={readOnly}
                    rows={2}
                    placeholder="Foreslått inngang for skriving"
                    className="mt-1 text-sm"
                  />
                </div>
              )}

              {section.type === "checklist" && (
                <ChecklistItemsEditor
                  items={section.items ?? []}
                  readOnly={readOnly}
                  onChange={(items) => onChange({ items })}
                />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Checklist items editor ────────────────────────────────────────────────

function ChecklistItemsEditor({
  items, readOnly, onChange,
}: {
  items: string[];
  readOnly: boolean;
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <Label className="text-xs">Punkter i sjekklisten</Label>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Ingen punkter ennå</p>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-background border px-2 py-1">
              <GripVertical className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <Input
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                disabled={readOnly}
                className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 px-1"
              />
              {!readOnly && (
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Fjern punkt">
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                e.preventDefault();
                onChange([...items, draft.trim()]);
                setDraft("");
              }
            }}
            placeholder="Nytt punkt — trykk Enter"
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!draft.trim()}
            onClick={() => {
              onChange([...items, draft.trim()]);
              setDraft("");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
