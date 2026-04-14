import { useEffect, useMemo, useRef, useState } from "react";
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
  GripVertical, X, Eye, EyeOff, Download, Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRapportTemplates, type RapportTemplate, type RapportTemplateSection } from "@/hooks/use-rapport-templates";
import { cn } from "@/lib/utils";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  const [showPreview, setShowPreview] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // DnD sensors — pointer for mouse/touch, keyboard for a11y
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  // Stable id for DnD = "sectionKey:index" — falls back gracefully if keys dupe
  const itemIds = useMemo(
    () => sections.map((s, i) => `${s.key}:${i}`),
    [sections],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (readOnly) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = itemIds.indexOf(String(active.id));
    const newIndex = itemIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setSections(arrayMove(sections, oldIndex, newIndex));
  };

  // ── Export / Import ────────────────────────────────────────────────────
  const handleExport = () => {
    const payload = {
      name, description,
      suggestedInstitutionType: suggestedType || null,
      sections,
      exportedAt: new Date().toISOString(),
      exportedFrom: "tidum",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(name) || "rapport-mal"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Eksportert", description: "Malen er lastet ned som JSON." });
  };

  const handleImport = (file: File) => {
    if (readOnly) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result ?? "");
        const data = JSON.parse(text);
        if (!Array.isArray(data.sections)) throw new Error("Filen mangler 'sections' array");
        if (data.name && typeof data.name === "string") setName(data.name);
        if (data.description !== undefined) setDescription(data.description ?? "");
        if (data.suggestedInstitutionType !== undefined) setSuggestedType(data.suggestedInstitutionType ?? "");
        setSections(data.sections);
        toast({ title: "Importert", description: `${data.sections.length} seksjoner lastet inn` });
      } catch (err: any) {
        toast({ title: "Feil", description: err.message || "Kunne ikke lese JSON", variant: "destructive" });
      }
    };
    reader.readAsText(file);
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
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowPreview(p => !p)}>
              {showPreview ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
              {showPreview ? "Skjul forhåndsvisning" : "Vis forhåndsvisning"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1.5" /> Eksporter
            </Button>
            {!readOnly && (
              <>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1.5" /> Importer
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                    e.target.value = "";
                  }}
                />
                <Button onClick={handleSave} disabled={update.isPending}>
                  {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Lagre endringer
                </Button>
              </>
            )}
          </div>
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

        {/* Sections + optional preview */}
        <div className={cn("grid gap-6", showPreview && "lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]")}>
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {sections.map((section, idx) => (
                      <SortableSectionEditor
                        key={itemIds[idx]}
                        id={itemIds[idx]}
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
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Live preview */}
          {showPreview && (
            <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
              <PreviewPanel name={name} description={description} sections={sections} />
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

// ─── Sortable wrapper ──────────────────────────────────────────────────────

function SortableSectionEditor(props: {
  id: string;
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : "auto",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <SectionEditor
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ─── Section editor row ─────────────────────────────────────────────────────

function SectionEditor({
  section, idx, total, readOnly, isSystemKey,
  onChange, onMoveUp, onMoveDown, onRemove, dragHandleProps,
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
  dragHandleProps?: any;
}) {
  const TypeMeta = SECTION_TYPES.find(t => t.value === section.type);
  const Icon = TypeMeta?.icon ?? MessageSquare;

  return (
    <Card className={cn("border-border/70", isSystemKey && "bg-primary/5 border-primary/25")}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Drag handle + a11y chevrons */}
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-1">
            {!readOnly && (
              <button
                {...dragHandleProps}
                className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
                aria-label="Dra for å flytte"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
            )}
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

// ─── Live preview panel ────────────────────────────────────────────────────
// Mirrors the layout a miljøarbeider sees when writing a rapport with this
// template. Empty placeholder state per section type.

function PreviewPanel({
  name, description, sections,
}: {
  name: string;
  description: string;
  sections: RapportTemplateSection[];
}) {
  return (
    <Card className="border-primary/25 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          Forhåndsvisning
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Slik ser rapporten ut for miljøarbeideren
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <h2 className="text-base font-bold mb-1">{name || "Uten navn"}</h2>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {sections.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
            Ingen seksjoner ennå
          </div>
        ) : (
          <div className="space-y-2">
            {sections.map((s, i) => (
              <PreviewSection key={i} index={i + 1} section={s} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewSection({ index, section }: { index: number; section: RapportTemplateSection }) {
  const TypeMeta = SECTION_TYPES.find(t => t.value === section.type);
  const Icon = TypeMeta?.icon ?? MessageSquare;

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-mono text-muted-foreground">{index}.</span>
        <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold flex-1 truncate">{section.title || "(uten tittel)"}</span>
        {section.required && (
          <Badge variant="destructive" className="text-[8px] px-1 py-0 h-4">Påkrevd</Badge>
        )}
      </div>

      {section.helpText && (
        <p className="text-[10px] text-muted-foreground mb-2">{section.helpText}</p>
      )}

      {(section.type === "rich_text" || section.type === "summary") && (
        <div className="rounded-md border bg-muted/30 p-2 min-h-[48px]">
          <p className="text-[11px] italic text-muted-foreground line-clamp-3">
            {section.placeholder || "Skriv her…"}
          </p>
        </div>
      )}

      {section.type === "goals_list" && (
        <div className="space-y-1">
          <div className="rounded-md bg-muted/40 px-2 py-1 text-[11px] flex items-center justify-between">
            <span>Mål 1 — eksempel</span>
            <span className="text-muted-foreground">60%</span>
          </div>
          <div className="rounded-md bg-muted/40 px-2 py-1 text-[11px] flex items-center justify-between">
            <span>Mål 2 — eksempel</span>
            <span className="text-muted-foreground">30%</span>
          </div>
        </div>
      )}

      {section.type === "activities_log" && (
        <div className="rounded-md border p-2 text-[10px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>15.04 · Klientmøte · 2t</span>
            <span>Hjemme</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span>18.04 · Aktivitet · 1t 30m</span>
            <span>Ute</span>
          </div>
        </div>
      )}

      {section.type === "checklist" && (
        <div className="space-y-1">
          {(section.items ?? []).length === 0 ? (
            <p className="text-[10px] italic text-muted-foreground">Ingen punkter definert</p>
          ) : (
            (section.items ?? []).slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <div className="h-3 w-3 rounded border border-input flex-shrink-0" />
                <span className="truncate">{item}</span>
              </div>
            ))
          )}
          {(section.items ?? []).length > 6 && (
            <p className="text-[10px] text-muted-foreground italic">+ {(section.items ?? []).length - 6} til</p>
          )}
        </div>
      )}

      {section.type === "structured_observations" && (
        <div className="space-y-1">
          <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <p className="text-[10px] text-muted-foreground">15.04 · Trygghet</p>
            <p className="text-[11px] italic text-muted-foreground mt-0.5">Observasjon…</p>
          </div>
          <button className="text-[10px] text-primary font-medium">+ Legg til observasjon</button>
        </div>
      )}
    </div>
  );
}
