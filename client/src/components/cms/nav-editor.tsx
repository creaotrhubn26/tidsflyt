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
import { Loader2, Plus, RotateCcw, Save, Trash2, Link as LinkIcon, ExternalLink, Menu } from "lucide-react";

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

        {/* ── SIDEBAR — rename / hide ── */}
        <TabsContent value="sidebar">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Portal-sidebar</CardTitle>
              <CardDescription>
                Endre etiketten som vises, eller skjul et menyvalg helt. Stier kan ikke endres
                — de er knyttet til sidene i koden.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {SIDEBAR_PATHS.map((row) => {
                const o = draft.portalSidebarOverrides[row.path] ?? {};
                return (
                  <div key={row.path} className="flex items-center gap-2 rounded-md border p-2 bg-background">
                    <code className="text-[11px] font-mono text-muted-foreground shrink-0 w-44 truncate">{row.path}</code>
                    <Input
                      value={o.label ?? ""}
                      onChange={(e) => updateOverride(row.path, { label: e.target.value || undefined })}
                      placeholder={row.defaultLabel}
                      className="h-8 text-sm flex-1"
                    />
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
                      <Switch
                        checked={!o.hidden}
                        onCheckedChange={(v) => updateOverride(row.path, { hidden: !v })}
                      />
                      {o.hidden ? "Skjult" : "Synlig"}
                    </label>
                  </div>
                );
              })}
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
