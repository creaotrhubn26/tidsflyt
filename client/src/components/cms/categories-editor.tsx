/**
 * Structured editor for guide categories + articles. Replaces the JSON
 * textarea in GuideEditor's Kategorier tab. Each category is a collapsible
 * card; each article expands inline with form fields, steps, tips, roles
 * and a MediaPicker for screenshots.
 */
import { useState } from "react";
import type {
  GuideArticle,
  GuideArticleStep,
  GuideCategory,
  GuideRole,
} from "@shared/guide-config";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronRight, GripVertical, Image as ImageIcon, Plus, Trash2,
  Video, Lightbulb,
} from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MediaPicker } from "./media-picker";

const ROLE_OPTIONS: GuideRole[] = ["miljoarbeider", "tiltaksleder", "vendor_admin", "super_admin"];
const ROLE_LABEL: Record<GuideRole, string> = {
  miljoarbeider: "Miljøarbeider",
  tiltaksleder: "Tiltaksleder",
  vendor_admin: "Vendor admin",
  super_admin: "Super admin",
  default: "Standard",
};

const ACCENT_PRESETS = [
  { label: "Sky/blue",   value: "from-sky-500 to-blue-600" },
  { label: "Indigo",     value: "from-indigo-500 to-purple-600" },
  { label: "Emerald",    value: "from-emerald-500 to-teal-600" },
  { label: "Amber",      value: "from-amber-500 to-orange-600" },
  { label: "Rose",       value: "from-pink-500 to-rose-600" },
  { label: "Slate",      value: "from-slate-600 to-slate-800" },
  { label: "Gray",       value: "from-gray-500 to-gray-700" },
];

export function CategoriesEditor({
  categories,
  onChange,
}: {
  categories: GuideCategory[];
  onChange: (next: GuideCategory[]) => void;
}) {
  const updateCategory = (idx: number, patch: Partial<GuideCategory>) =>
    onChange(categories.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  const addCategory = () =>
    onChange([
      ...categories,
      {
        id: `category-${Date.now()}`,
        label: "Ny kategori",
        blurb: "",
        icon: "Folder",
        accent: "from-sky-500 to-blue-600",
        articles: [],
      },
    ]);

  const removeCategory = (idx: number) => {
    if (!confirm(`Slett kategorien «${categories[idx].label}» og alle artikler i den?`)) return;
    onChange(categories.filter((_, i) => i !== idx));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = categories.findIndex((c) => c.id === e.active.id);
    const newIdx = categories.findIndex((c) => c.id === e.over!.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onChange(arrayMove(categories, oldIdx, newIdx));
  };

  return (
    <div className="space-y-3">
      {categories.length === 0 && (
        <p className="text-sm text-muted-foreground italic py-4">
          Ingen kategorier ennå. Legg til en for å bygge guidens struktur.
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {categories.map((cat, idx) => (
              <CategoryCard
                key={cat.id || idx}
                category={cat}
                onChange={(patch) => updateCategory(idx, patch)}
                onRemove={() => removeCategory(idx)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button variant="outline" size="sm" onClick={addCategory}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Ny kategori
      </Button>
    </div>
  );
}

function CategoryCard({
  category: rawCategory, onChange, onRemove,
}: {
  category: GuideCategory;
  onChange: (patch: Partial<GuideCategory>) => void;
  onRemove: () => void;
}) {
  // Defensive: a category saved without articles via the JSON tab would
  // crash every .length / .map / .findIndex below. Normalise once here.
  const category: GuideCategory = {
    ...rawCategory,
    articles: Array.isArray(rawCategory.articles) ? rawCategory.articles : [],
  };
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto" as const,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const updateArticle = (idx: number, patch: Partial<GuideArticle>) => {
    const next = [...category.articles];
    if (idx < 0 || idx >= next.length) return; // stale reference after another delete
    next[idx] = { ...next[idx], ...patch };
    onChange({ articles: next });
  };
  const addArticle = () =>
    onChange({
      articles: [
        ...category.articles,
        {
          id: `article-${Date.now()}`,
          title: "Ny artikkel",
          summary: "",
        },
      ],
    });
  const removeArticle = (idx: number) => {
    if (!confirm(`Slett artikkelen «${category.articles[idx].title}»?`)) return;
    onChange({ articles: category.articles.filter((_, i) => i !== idx) });
  };
  const handleArticleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = category.articles.findIndex((a) => a.id === e.active.id);
    const newIdx = category.articles.findIndex((a) => a.id === e.over!.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onChange({ articles: arrayMove(category.articles, oldIdx, newIdx) });
  };

  return (
    <Card ref={setNodeRef} style={style} className="overflow-hidden">
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="h-7 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
            onClick={(e) => e.stopPropagation()}
            aria-label="Dra for å flytte kategori"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <div className={cn("h-8 w-8 rounded-lg bg-gradient-to-br shadow-sm shrink-0", category.accent)} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{category.label || "(uten navn)"}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {category.articles.length} artikkel{category.articles.length === 1 ? "" : "er"} · ID: {category.id}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="Slett kategori">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3 pt-0">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Kategori-ID" hint="Slug brukt i URL-anker (f.eks. saker)">
              <Input value={category.id} onChange={(e) => onChange({ id: e.target.value })} />
            </Field>
            <Field label="Etikett">
              <Input value={category.label} onChange={(e) => onChange({ label: e.target.value })} />
            </Field>
          </div>
          <Field label="Beskrivelse / blurb">
            <Textarea rows={2} value={category.blurb} onChange={(e) => onChange({ blurb: e.target.value })} />
          </Field>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Lucide-ikon">
              <Input value={category.icon ?? ""} onChange={(e) => onChange({ icon: e.target.value || undefined })} placeholder="LayoutDashboard" />
            </Field>
            <Field label="Aksent (gradient)">
              <div className="flex items-center gap-2">
                <Input
                  value={category.accent}
                  onChange={(e) => onChange({ accent: e.target.value })}
                  placeholder="from-sky-500 to-blue-600"
                  className="flex-1 font-mono text-xs"
                />
                <select
                  className="h-9 rounded-md border bg-background px-2 text-xs"
                  value=""
                  onChange={(e) => e.target.value && onChange({ accent: e.target.value })}
                  aria-label="Forhåndsvalgt gradient"
                >
                  <option value="">Forhåndsvalg…</option>
                  {ACCENT_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </Field>
          </div>

          <div className="pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Artikler ({category.articles.length})
              </p>
              <Button size="sm" variant="outline" onClick={addArticle}>
                <Plus className="h-3 w-3 mr-1" />Ny artikkel
              </Button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleArticleDragEnd}>
              <SortableContext items={category.articles.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {category.articles.map((article, i) => (
                    <ArticleCard
                      key={article.id || i}
                      article={article}
                      onChange={(patch) => updateArticle(i, patch)}
                      onRemove={() => removeArticle(i)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ArticleCard({
  article, onChange, onRemove,
}: {
  article: GuideArticle;
  onChange: (patch: Partial<GuideArticle>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: article.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto" as const,
  };

  const toggleRole = (role: GuideRole) => {
    const cur = new Set(article.roles ?? []);
    if (cur.has(role)) cur.delete(role); else cur.add(role);
    onChange({ roles: cur.size === 0 ? undefined : Array.from(cur) });
  };

  const updateStep = (i: number, patch: Partial<GuideArticleStep>) => {
    const next = [...(article.steps ?? [])];
    next[i] = { ...next[i], ...patch };
    onChange({ steps: next });
  };
  const addStep = () => onChange({ steps: [...(article.steps ?? []), { label: "Nytt steg" }] });
  const removeStep = (i: number) => onChange({ steps: (article.steps ?? []).filter((_, j) => j !== i) });

  const updateTip = (i: number, value: string) => {
    const next = [...(article.tips ?? [])];
    next[i] = value;
    onChange({ tips: next });
  };
  const addTip = () => onChange({ tips: [...(article.tips ?? []), ""] });
  const removeTip = (i: number) => onChange({ tips: (article.tips ?? []).filter((_, j) => j !== i) });

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border bg-muted/20">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
          onClick={(e) => e.stopPropagation()}
          aria-label="Dra for å flytte artikkel"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <p className="text-sm font-medium flex-1 truncate">{article.title || "(uten tittel)"}</p>
        {article.videoUrl && <Video className="h-3 w-3 text-muted-foreground" />}
        {article.screenshot && <ImageIcon className="h-3 w-3 text-muted-foreground" />}
        <Button size="sm" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <Trash2 className="h-3 w-3" />
        </Button>
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t bg-background">
          <div className="grid md:grid-cols-2 gap-2 pt-3">
            <Field label="Artikkel-ID" hint="Brukes som intern referanse">
              <Input value={article.id} onChange={(e) => onChange({ id: e.target.value })} className="text-sm" />
            </Field>
            <Field label="Lucide-ikon">
              <Input value={article.icon ?? ""} onChange={(e) => onChange({ icon: e.target.value || undefined })} placeholder="FileText" className="text-sm" />
            </Field>
          </div>
          <Field label="Tittel">
            <Input value={article.title} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          <Field label="Sammendrag">
            <Textarea rows={2} value={article.summary} onChange={(e) => onChange({ summary: e.target.value })} />
          </Field>
          <div className="grid md:grid-cols-2 gap-2">
            <Field label="«Åpne i Tidum» — sti">
              <Input value={article.inAppPath ?? ""} onChange={(e) => onChange({ inAppPath: e.target.value || undefined })} placeholder="/dashboard" className="font-mono text-sm" />
            </Field>
            <Field label="Roller (filtrer hvem som ser)">
              <div className="flex flex-wrap gap-1.5">
                {ROLE_OPTIONS.map((role) => {
                  const active = (article.roles ?? []).includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                        active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {ROLE_LABEL[role]}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          <Field label="Skjermbilde" hint="URL eller filnavn under /guide-screenshots/">
            <div className="flex items-center gap-2">
              <Input
                value={article.screenshot ?? ""}
                onChange={(e) => onChange({ screenshot: e.target.value || undefined })}
                placeholder="dashboard.png eller https://…"
                className="flex-1 text-sm"
              />
              <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                <ImageIcon className="h-3 w-3 mr-1" />Velg bilde
              </Button>
            </div>
            {article.screenshot && (
              <div className="mt-2 rounded-md border bg-muted/30 p-1 inline-block">
                <img
                  src={/^(https?:|\/)/.test(article.screenshot) ? article.screenshot : `/guide-screenshots/${article.screenshot}`}
                  alt={article.title}
                  className="h-16 w-auto object-cover rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
          </Field>

          <div className="grid md:grid-cols-2 gap-2">
            <Field label="Video-URL (YouTube / Vimeo / MP4)">
              <Input
                value={article.videoUrl ?? ""}
                onChange={(e) => onChange({ videoUrl: e.target.value || undefined })}
                placeholder="https://youtu.be/…"
                className="text-sm font-mono"
              />
            </Field>
            <Field label="Video-etikett">
              <Input
                value={article.videoLabel ?? ""}
                onChange={(e) => onChange({ videoLabel: e.target.value || undefined })}
                placeholder="Slik gjør du det"
                className="text-sm"
              />
            </Field>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Steg for steg</Label>
              <Button size="sm" variant="ghost" onClick={addStep}>
                <Plus className="h-3 w-3 mr-1" />Nytt steg
              </Button>
            </div>
            {(article.steps ?? []).map((step, i) => (
              <div key={i} className="rounded-md border bg-background p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] shrink-0">{i + 1}</Badge>
                  <Input
                    value={step.label}
                    onChange={(e) => updateStep(i, { label: e.target.value })}
                    placeholder="Trinn-overskrift"
                    className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 px-1"
                  />
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeStep(i)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <Textarea
                  rows={1}
                  value={step.detail ?? ""}
                  onChange={(e) => updateStep(i, { detail: e.target.value || undefined })}
                  placeholder="Detalj (valgfritt)"
                  className="text-xs"
                />
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <Lightbulb className="h-3 w-3 text-amber-500" />Tips
              </Label>
              <Button size="sm" variant="ghost" onClick={addTip}>
                <Plus className="h-3 w-3 mr-1" />Nytt tips
              </Button>
            </div>
            {(article.tips ?? []).map((tip, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={tip}
                  onChange={(e) => updateTip(i, e.target.value)}
                  placeholder="Tips eller snarvei"
                  className="h-7 text-sm flex-1"
                />
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeTip(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(url) => onChange({ screenshot: url })}
        title={`Velg skjermbilde for «${article.title}»`}
      />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
