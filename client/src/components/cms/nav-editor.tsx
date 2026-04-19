/**
 * CMS NavEditor — edits the navigation overrides:
 *   • Portal sidebar: rename labels, hide items, override category labels.
 *   • Public landing header + footer: free-form list of extra links.
 *
 * Underlying routes stay code-defined; this only mutates labels and
 * visibility, plus appends extra public links. Saved to PUT /api/cms/nav-config.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_NAV_CONFIG,
  mergeNavConfig,
  type NavConfig,
  type PublicLink,
} from "@shared/nav-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Loader2, Plus, RotateCcw, Save, Trash2, Link as LinkIcon, ExternalLink,
  Menu, GripVertical,
} from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const KEY = ["/api/cms/nav-config"];

/** Known portal sidebar paths + their default labels — keep in sync with portal-layout.tsx baseNavItems. */
const SIDEBAR_PATHS: { path: string; defaultLabel: string; defaultCategory: string }[] = [
  { path: "/dashboard",             defaultLabel: "Dashboard",                  defaultCategory: "oversikt" },
  { path: "/tiltaksleder",          defaultLabel: "Tiltaksleder",               defaultCategory: "oversikt" },
  { path: "__getting-started__",    defaultLabel: "Kom i gang med Tidum",       defaultCategory: "oversikt" },
  { path: "/cases",                 defaultLabel: "Saker",                      defaultCategory: "saker" },
  { path: "/institusjoner",         defaultLabel: "Institusjoner",              defaultCategory: "saker" },
  { path: "/invites",               defaultLabel: "Invitasjoner",               defaultCategory: "saker" },
  { path: "/rapporter",             defaultLabel: "Rapporter",                  defaultCategory: "rapportering" },
  { path: "/rapporter/godkjenning", defaultLabel: "Godkjenning",                defaultCategory: "rapportering" },
  { path: "/admin/rapport-maler",   defaultLabel: "Rapport-maler",              defaultCategory: "rapportering" },
  { path: "/avvik",                 defaultLabel: "Avvik",                      defaultCategory: "rapportering" },
  { path: "/time",                  defaultLabel: "Timeføring",                 defaultCategory: "tid" },
  { path: "/timesheets",            defaultLabel: "Timelister",                 defaultCategory: "tid" },
  { path: "/overtime",              defaultLabel: "Overtid",                    defaultCategory: "tid" },
  { path: "/leave",                 defaultLabel: "Fravær",                     defaultCategory: "tid" },
  { path: "/recurring",             defaultLabel: "Faste oppgaver",             defaultCategory: "tid" },
  { path: "/invoices",              defaultLabel: "Fakturaer",                  defaultCategory: "kommunikasjon" },
  { path: "/email",                 defaultLabel: "E-post",                     defaultCategory: "kommunikasjon" },
  { path: "/forward",               defaultLabel: "Send videre",                defaultCategory: "kommunikasjon" },
  { path: "/vendors",               defaultLabel: "Leverandører",               defaultCategory: "administrasjon" },
  { path: "/cms",                   defaultLabel: "CMS",                        defaultCategory: "administrasjon" },
  { path: "/admin/tester-feedback", defaultLabel: "Tester-feedback",            defaultCategory: "administrasjon" },
  { path: "/settings",              defaultLabel: "Innstillinger",              defaultCategory: "system" },
];

const CATEGORY_KEYS = ["oversikt", "saker", "rapportering", "tid", "kommunikasjon", "administrasjon", "system"];
const CATEGORY_DEFAULTS: Record<string, string> = {
  oversikt: "Oversikt",
  saker: "Saker & klienter",
  rapportering: "Rapportering",
  tid: "Tid & fravær",
  kommunikasjon: "Økonomi & kommunikasjon",
  administrasjon: "Administrasjon",
  system: "System",
};

export function NavEditor() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<NavConfig>({ queryKey: KEY });
  const [draft, setDraft] = useState<NavConfig>(DEFAULT_NAV_CONFIG);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setDraft(mergeNavConfig(data));
      setDirty(false);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (next: NavConfig) => {
      const res = await fetch("/api/cms/nav-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Lagring feilet");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast({ title: "Navigasjon lagret", description: "Endringene gjelder umiddelbart." });
      setDirty(false);
    },
    onError: (e: any) => toast({ title: "Lagring feilet", description: e.message, variant: "destructive" }),
  });

  const updateOverride = (path: string, patch: Partial<NavConfig["portalSidebarOverrides"][string]>) => {
    setDraft((d) => ({
      ...d,
      portalSidebarOverrides: {
        ...d.portalSidebarOverrides,
        [path]: { ...d.portalSidebarOverrides[path], ...patch },
      },
    }));
    setDirty(true);
  };

  const updateCategoryLabel = (cat: string, label: string) => {
    setDraft((d) => ({
      ...d,
      portalCategoryLabels: { ...d.portalCategoryLabels, [cat]: label },
    }));
    setDirty(true);
  };

  const updateLinks = (which: "publicHeaderLinks" | "publicFooterLinks", links: PublicLink[]) => {
    setDraft((d) => ({ ...d, [which]: links }));
    setDirty(true);
  };

  const handleReset = () => {
    if (!confirm("Tilbakestill alle navigasjons-overstyringer?")) return;
    setDraft(DEFAULT_NAV_CONFIG);
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Laster navigasjons-konfigurasjon…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 sticky top-0 bg-background/95 backdrop-blur z-10 py-3 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm">
            <Menu className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">Navigasjon</h2>
            <p className="text-xs text-muted-foreground">
              Sidebar-etiketter, kategorier og ekstra lenker i public header/footer
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Tilbakestill
          </Button>
          <Button size="sm" onClick={() => save.mutate(draft)} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Lagre
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sidebar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sidebar">Sidebar</TabsTrigger>
          <TabsTrigger value="categories">Kategorier</TabsTrigger>
          <TabsTrigger value="header">Public header</TabsTrigger>
          <TabsTrigger value="footer">Public footer</TabsTrigger>
        </TabsList>

        {/* ── SIDEBAR — reorder / rename / hide ── */}
        <TabsContent value="sidebar">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Portal-sidebar</CardTitle>
              <CardDescription>
                Dra rader for å endre rekkefølge innenfor hver kategori. Endre etiketten,
                eller skjul et menyvalg helt. Stier er knyttet til sidene i koden og kan
                ikke endres her.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SidebarReorderEditor
                overrides={draft.portalSidebarOverrides}
                onUpdate={updateOverride}
                onReorder={(category, orderedPaths) => {
                  // Normalise to compact integers so subsequent moves are stable
                  setDraft((d) => {
                    const next = { ...d.portalSidebarOverrides };
                    orderedPaths.forEach((p, idx) => {
                      next[p] = { ...next[p], order: idx };
                    });
                    return { ...d, portalSidebarOverrides: next };
                  });
                  setDirty(true);
                }}
                onMove={(path, toCategory, newOrderInTarget, newOrderInSource) => {
                  setDraft((d) => {
                    const next = { ...d.portalSidebarOverrides };
                    // Set new category for the moved item
                    next[path] = { ...next[path], category: toCategory };
                    // Re-index target category so it stays compact
                    newOrderInTarget.forEach((p, idx) => {
                      next[p] = { ...next[p], order: idx };
                    });
                    // Re-index source category so it stays compact
                    newOrderInSource.forEach((p, idx) => {
                      next[p] = { ...next[p], order: idx };
                    });
                    return { ...d, portalSidebarOverrides: next };
                  });
                  setDirty(true);
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CATEGORY LABELS ── */}
        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kategori-overskrifter</CardTitle>
              <CardDescription>
                Overskriftene som vises over hver gruppe i sidebar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {CATEGORY_KEYS.map((cat) => (
                <div key={cat} className="flex items-center gap-2">
                  <code className="text-[11px] font-mono text-muted-foreground w-32 shrink-0">{cat}</code>
                  <Input
                    value={draft.portalCategoryLabels[cat] ?? ""}
                    placeholder={CATEGORY_DEFAULTS[cat]}
                    onChange={(e) => updateCategoryLabel(cat, e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PUBLIC HEADER LINKS ── */}
        <TabsContent value="header">
          <PublicLinksEditor
            title="Public header"
            description="Ekstra lenker som vises i landing-headeren ved siden av Funksjoner / Blogg / Veiledning."
            links={draft.publicHeaderLinks}
            onChange={(links) => updateLinks("publicHeaderLinks", links)}
          />
        </TabsContent>

        {/* ── PUBLIC FOOTER LINKS ── */}
        <TabsContent value="footer">
          <PublicLinksEditor
            title="Public footer"
            description="Ekstra lenker i Lenker-kolonnen i footer."
            links={draft.publicFooterLinks}
            onChange={(links) => updateLinks("publicFooterLinks", links)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Reorderable sidebar editor — groups SIDEBAR_PATHS by their effective
 * category (override or default), shows a drag handle per row, and keeps
 * an inline label/hidden toggle next to each row.
 */
function SidebarReorderEditor({
  overrides,
  onUpdate,
  onReorder,
  onMove,
}: {
  overrides: Record<string, { label?: string; hidden?: boolean; category?: string; order?: number }>;
  onUpdate: (path: string, patch: { label?: string; hidden?: boolean }) => void;
  onReorder: (category: string, orderedPaths: string[]) => void;
  onMove: (path: string, toCategory: string, newOrderInTarget: string[], newOrderInSource: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const grouped = CATEGORY_KEYS.map((cat) => {
    const items = SIDEBAR_PATHS.filter(
      (row) => (overrides[row.path]?.category ?? row.defaultCategory) === cat,
    );
    items.sort((a, b) => {
      const oa = overrides[a.path]?.order;
      const ob = overrides[b.path]?.order;
      if (oa != null && ob != null) return oa - ob;
      if (oa != null) return -1;
      if (ob != null) return 1;
      return SIDEBAR_PATHS.indexOf(a) - SIDEBAR_PATHS.indexOf(b);
    });
    return { category: cat, items };
  }); // keep all categories visible even when empty so admins can drop into them

  /** Cross-category-aware drag end: figure out source + destination groups
   *  and call either onReorder (same group) or onMove (different group). */
  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const activePath = String(e.active.id);
    const overId = String(e.over.id);

    const findGroup = (id: string) => {
      const direct = grouped.find((g) => g.items.some((i) => i.path === id));
      if (direct) return direct;
      // The over.id may be a synthetic empty-group dropzone like "__cat:saker"
      const m = id.match(/^__cat:(.+)$/);
      if (m) return grouped.find((g) => g.category === m[1]);
      return undefined;
    };
    const activeGroup = findGroup(activePath);
    const overGroup = findGroup(overId);
    if (!activeGroup || !overGroup) return;

    if (activeGroup.category === overGroup.category) {
      const ids = activeGroup.items.map((i) => i.path);
      const oldIndex = ids.indexOf(activePath);
      const newIndex = ids.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return;
      onReorder(activeGroup.category, arrayMove(ids, oldIndex, newIndex));
      return;
    }

    // Cross-category move
    const targetIds = overGroup.items.map((i) => i.path);
    const insertAt = overId.startsWith("__cat:") ? targetIds.length : Math.max(0, targetIds.indexOf(overId));
    const newOrderInTarget = [
      ...targetIds.slice(0, insertAt),
      activePath,
      ...targetIds.slice(insertAt).filter((p) => p !== activePath),
    ];
    const newOrderInSource = activeGroup.items.map((i) => i.path).filter((p) => p !== activePath);
    onMove(activePath, overGroup.category, newOrderInTarget, newOrderInSource);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-5">
        {grouped.map(({ category, items }) => (
          <CategoryGroup
            key={category}
            category={category}
            items={items}
            overrides={overrides}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </DndContext>
  );
}

function CategoryGroup({
  category, items, overrides, onUpdate,
}: {
  category: string;
  items: { path: string; defaultLabel: string }[];
  overrides: Record<string, { label?: string; hidden?: boolean; category?: string; order?: number }>;
  onUpdate: (path: string, patch: { label?: string; hidden?: boolean }) => void;
}) {
  // Empty groups still need an id so cross-category drops have a target.
  const sortableIds = items.length > 0 ? items.map((i) => i.path) : [`__cat:${category}`];
  return (
    <div>
      <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {CATEGORY_DEFAULTS[category]}
      </p>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5 min-h-[44px] rounded-md p-1 transition-colors data-[over=true]:bg-primary/5">
          {items.length === 0 && (
            <EmptyDropzone id={`__cat:${category}`} />
          )}
          {items.map((row) => (
            <SidebarRow
              key={row.path}
              path={row.path}
              defaultLabel={row.defaultLabel}
              override={overrides[row.path]}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function EmptyDropzone({ id }: { id: string }) {
  const { setNodeRef, isOver } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "h-11 rounded-md border-2 border-dashed text-[11px] text-muted-foreground italic flex items-center justify-center transition-colors",
        isOver ? "border-primary text-primary bg-primary/5" : "border-muted-foreground/20",
      )}
    >
      Slipp et menyvalg her for å flytte til denne kategorien
    </div>
  );
}

function SidebarRow({
  path, defaultLabel, override, onUpdate,
}: {
  path: string;
  defaultLabel: string;
  override?: { label?: string; hidden?: boolean };
  onUpdate: (path: string, patch: { label?: string; hidden?: boolean }) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: path });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto" as const,
  };
  const o = override ?? {};
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md border p-2 bg-background">
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
        aria-label="Dra for å flytte"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <code className="text-[11px] font-mono text-muted-foreground shrink-0 w-40 truncate">{path}</code>
      <Input
        value={o.label ?? ""}
        onChange={(e) => onUpdate(path, { label: e.target.value || undefined })}
        placeholder={defaultLabel}
        className="h-8 text-sm flex-1"
      />
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
        <Switch
          checked={!o.hidden}
          onCheckedChange={(v) => onUpdate(path, { hidden: !v })}
        />
        {o.hidden ? "Skjult" : "Synlig"}
      </label>
    </div>
  );
}

function PublicLinksEditor({
  title, description, links, onChange,
}: {
  title: string;
  description: string;
  links: PublicLink[];
  onChange: (links: PublicLink[]) => void;
}) {
  const update = (i: number, patch: Partial<PublicLink>) =>
    onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = () => onChange([...links, { label: "Ny lenke", href: "/" }]);
  const remove = (i: number) => onChange(links.filter((_, j) => j !== i));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="h-3.5 w-3.5 mr-1" />Legg til lenke
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {links.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Ingen lenker ennå — klikk «Legg til lenke».</p>
        )}
        {links.map((link, i) => (
          <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/20">
            <div className="grid md:grid-cols-[1fr_2fr_auto] gap-2 items-end">
              <div>
                <Label className="text-[11px] text-muted-foreground">Tekst</Label>
                <Input
                  value={link.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                  {link.href.startsWith("http") ? <ExternalLink className="h-3 w-3" /> : <LinkIcon className="h-3 w-3" />}
                  URL eller intern sti
                </Label>
                <Input
                  value={link.href}
                  onChange={(e) => update(i, { href: e.target.value })}
                  placeholder="/blog eller https://example.com"
                  className="h-8 text-sm font-mono"
                />
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Switch
                checked={link.external ?? link.href.startsWith("http")}
                onCheckedChange={(v) => update(i, { external: v })}
              />
              Åpne i ny fane
            </label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
