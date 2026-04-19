/**
 * CMS GuideEditor — form-based editor for the /guide page, interactive
 * tour and stuck-detection config. Saves to PUT /api/cms/guide-config.
 *
 * Layout: a vertical sub-tab strip splits the surface into bite-sized
 * sections (Innhold, Layout, Sitter-fast, Omvisning, Kategorier).
 *
 * For the deeply-nested categories + tour overrides + stuck rules we
 * use a syntax-checked JSON textarea. Everything else is a regular form.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_GUIDE_CONFIG,
  mergeGuideConfig,
  type GuideConfig,
  type GuideRole,
} from "@shared/guide-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle, ChevronRight, Layout, Lightbulb, Loader2, Plus, RotateCcw,
  Save, Settings as SettingsIcon, Sparkles, Trash2, Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = ["/api/cms/guide-config"];

const ROLES: GuideRole[] = ["miljoarbeider", "tiltaksleder", "vendor_admin", "super_admin", "default"];
const ROLE_LABEL: Record<GuideRole, string> = {
  miljoarbeider: "Miljøarbeider",
  tiltaksleder: "Tiltaksleder",
  vendor_admin: "Vendor admin",
  super_admin: "Super admin",
  default: "Standard",
};

export function GuideEditor() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<GuideConfig>({ queryKey: KEY });

  // Local working copy — only commits to server on Save.
  const [draft, setDraft] = useState<GuideConfig>(DEFAULT_GUIDE_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [categoriesJson, setCategoriesJson] = useState("");
  const [rulesJson, setRulesJson] = useState("");
  const [welcomeJson, setWelcomeJson] = useState("");
  const [jsonErrors, setJsonErrors] = useState<{ categories?: string; rules?: string; welcome?: string }>({});

  useEffect(() => {
    if (!data) return;
    const merged = mergeGuideConfig(data);
    setDraft(merged);
    setCategoriesJson(JSON.stringify(merged.categories, null, 2));
    setRulesJson(JSON.stringify(merged.stuck.rules, null, 2));
    setWelcomeJson(JSON.stringify(merged.tour.welcomeOverrides ?? {}, null, 2));
    setDirty(false);
    setJsonErrors({});
  }, [data]);

  const update = <K extends keyof GuideConfig>(key: K, value: GuideConfig[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };
  const updateNested = <K extends keyof GuideConfig, NK extends keyof GuideConfig[K]>(
    key: K,
    nested: NK,
    value: GuideConfig[K][NK],
  ) => {
    setDraft((d) => ({ ...d, [key]: { ...(d[key] as any), [nested]: value } }));
    setDirty(true);
  };
  const patchStuck = (patch: Partial<GuideConfig["stuck"]>) => {
    setDraft((d) => ({ ...d, stuck: { ...d.stuck, ...patch } }));
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (config: GuideConfig) => {
      const res = await fetch("/api/cms/guide-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Lagring feilet");
      }
      return res.json();
    },
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved);
      qc.invalidateQueries({ queryKey: KEY });
      toast({ title: "Guide lagret", description: "Endringene er publisert til /guide og appen." });
      setDirty(false);
    },
    onError: (e: any) => {
      toast({ title: "Lagring feilet", description: e.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const errors: typeof jsonErrors = {};
    let categories = draft.categories;
    let rules = draft.stuck.rules;
    let welcome = draft.tour.welcomeOverrides;

    try { categories = JSON.parse(categoriesJson); }
    catch (e: any) { errors.categories = e.message; }

    try { rules = JSON.parse(rulesJson); }
    catch (e: any) { errors.rules = e.message; }

    try { welcome = welcomeJson.trim() ? JSON.parse(welcomeJson) : undefined; }
    catch (e: any) { errors.welcome = e.message; }

    setJsonErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: "Ugyldig JSON", description: "Fiks feilene før du lagrer.", variant: "destructive" });
      return;
    }

    saveMutation.mutate({
      ...draft,
      categories,
      stuck: { ...draft.stuck, rules },
      tour: { ...draft.tour, welcomeOverrides: welcome },
    });
  };

  const handleReset = () => {
    if (!confirm("Tilbakestill alle felt til Tidums standardverdier?")) return;
    setDraft(DEFAULT_GUIDE_CONFIG);
    setCategoriesJson(JSON.stringify(DEFAULT_GUIDE_CONFIG.categories, null, 2));
    setRulesJson(JSON.stringify(DEFAULT_GUIDE_CONFIG.stuck.rules, null, 2));
    setWelcomeJson(JSON.stringify({}, null, 2));
    setJsonErrors({});
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Laster guide-konfigurasjonen…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header / save bar ── */}
      <div className="flex items-center justify-between gap-3 sticky top-0 bg-background/95 backdrop-blur z-10 py-3 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">Guide & onboarding</h2>
            <p className="text-xs text-muted-foreground">
              Tekst, farger, layout, video, omvisning og sitter‑fast‑regler
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} title="Tilbakestill til Tidums standardverdier">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Tilbakestill
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Lagre
          </Button>
        </div>
      </div>

      <Tabs defaultValue="content" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="content"><Sparkles className="h-3.5 w-3.5 mr-1" />Innhold</TabsTrigger>
          <TabsTrigger value="layout"><Layout className="h-3.5 w-3.5 mr-1" />Layout & tema</TabsTrigger>
          <TabsTrigger value="categories">Kategorier</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="stuck"><AlertCircle className="h-3.5 w-3.5 mr-1" />Sitter‑fast</TabsTrigger>
          <TabsTrigger value="tour"><Video className="h-3.5 w-3.5 mr-1" />Omvisning</TabsTrigger>
          <TabsTrigger value="advanced"><SettingsIcon className="h-3.5 w-3.5 mr-1" />Avansert</TabsTrigger>
        </TabsList>

        {/* ── INNHOLD ── */}
        <TabsContent value="content" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hero</CardTitle>
              <CardDescription>Topp‑seksjonen på /guide</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Tittel">
                <Input
                  value={draft.hero.title}
                  onChange={(e) => updateNested("hero", "title", e.target.value)}
                />
              </Field>
              <Field label="Undertittel">
                <Textarea
                  rows={2}
                  value={draft.hero.subtitle}
                  onChange={(e) => updateNested("hero", "subtitle", e.target.value)}
                />
              </Field>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="«Oppdatert»‑label" hint="Sett tom for å skjule badgen.">
                  <Input
                    value={draft.hero.updatedLabel}
                    onChange={(e) => updateNested("hero", "updatedLabel", e.target.value)}
                  />
                </Field>
                <Field label="Søkefelt‑plassholder">
                  <Input
                    value={draft.hero.searchPlaceholder}
                    onChange={(e) => updateNested("hero", "searchPlaceholder", e.target.value)}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── LAYOUT & TEMA ── */}
        <TabsContent value="layout" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">App‑standardtema</CardTitle>
              <CardDescription>
                Brukes for førstegangsbesøkende og brukere som ikke har valgt eget tema.
                Brukere som har gjort eget valg beholder det.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Field label="Standard tema">
                <Select
                  value={draft.appDefaults.defaultTheme}
                  onValueChange={(v) => updateNested("appDefaults", "defaultTheme", v as any)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (følg OS)</SelectItem>
                    <SelectItem value="light">Lyst</SelectItem>
                    <SelectItem value="dark">Mørkt</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">/guide layout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Tema for /guide">
                  <Select
                    value={draft.layout.theme}
                    onValueChange={(v) => updateNested("layout", "theme", v as any)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="light">Lyst</SelectItem>
                      <SelectItem value="dark">Mørkt</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Hero‑justering">
                  <Select
                    value={draft.layout.heroAlign}
                    onValueChange={(v) => updateNested("layout", "heroAlign", v as any)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="center">Midtstilt</SelectItem>
                      <SelectItem value="left">Venstre</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Kort‑stil">
                  <Select
                    value={draft.layout.cardStyle}
                    onValueChange={(v) => updateNested("layout", "cardStyle", v as any)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gradient">Gradient</SelectItem>
                      <SelectItem value="solid">Solid</SelectItem>
                      <SelectItem value="outline">Kun ramme</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Tetthet">
                  <Select
                    value={draft.layout.density}
                    onValueChange={(v) => updateNested("layout", "density", v as any)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comfortable">Komfortabel</SelectItem>
                      <SelectItem value="compact">Kompakt</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="space-y-2 pt-3 border-t">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vis/skjul seksjoner
                </p>
                <ToggleRow
                  label="«Oppdatert»‑badge over hero"
                  checked={draft.layout.showUpdatedBadge}
                  onChange={(v) => updateNested("layout", "showUpdatedBadge", v)}
                />
                <ToggleRow
                  label="Hurtig‑start (3 kort under hero)"
                  checked={draft.layout.showQuickStart}
                  onChange={(v) => updateNested("layout", "showQuickStart", v)}
                />
                <ToggleRow
                  label="«Sitter du fast?»‑banner"
                  checked={draft.layout.showStuckCTA}
                  onChange={(v) => updateNested("layout", "showStuckCTA", v)}
                />
                <ToggleRow
                  label="FAQ‑seksjon"
                  checked={draft.layout.showFAQ}
                  onChange={(v) => updateNested("layout", "showFAQ", v)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── KATEGORIER ── */}
        <TabsContent value="categories" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kategorier og artikler</CardTitle>
              <CardDescription>
                Strukturen er dypt nestet — rediger som JSON. Hver kategori har{" "}
                <code>id, label, blurb, icon, accent, articles[]</code>. Artikler har{" "}
                <code>id, title, summary, icon, inAppPath, roles?, steps?, tips?, screenshot?, videoUrl?</code>.
                Se Lucide‑ikon‑navn på <a className="text-primary underline" href="https://lucide.dev/icons/" target="_blank" rel="noreferrer">lucide.dev</a>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={categoriesJson}
                onChange={(e) => { setCategoriesJson(e.target.value); setDirty(true); }}
                rows={28}
                spellCheck={false}
                className="font-mono text-xs"
              />
              {jsonErrors.categories && (
                <p className="text-xs text-destructive mt-2">JSON‑feil: {jsonErrors.categories}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FAQ ── */}
        <TabsContent value="faq" className="space-y-3">
          <FAQEditor
            faq={draft.faq}
            onChange={(faq) => update("faq", faq)}
          />
        </TabsContent>

        {/* ── STUCK ── */}
        <TabsContent value="stuck" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sitter‑fast‑hjelper</CardTitle>
              <CardDescription>
                Vises som flytende kort når brukeren virker å sitte fast. Slå av globalt eller juster terskler/meldinger.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow
                label="Aktiver sitter‑fast‑hjelper"
                checked={draft.stuck.enabled}
                onChange={(v) => updateNested("stuck", "enabled", v)}
              />

              <div className="grid md:grid-cols-2 gap-3 pt-2">
                <NumberField
                  label="Inaktiv‑terskel (sek)"
                  value={Math.round(draft.stuck.thresholds.idleMs / 1000)}
                  onChange={(v) => patchStuck({ thresholds: { ...draft.stuck.thresholds, idleMs: v * 1000 } })}
                  hint="Hvor lenge brukeren må være inaktiv før hjelp tilbys."
                />
                <NumberField
                  label="Navigasjons‑terskel (antall)"
                  value={draft.stuck.thresholds.navThreshold}
                  onChange={(v) => patchStuck({ thresholds: { ...draft.stuck.thresholds, navThreshold: v } })}
                />
                <NumberField
                  label="Navigasjons‑vindu (sek)"
                  value={Math.round(draft.stuck.thresholds.navWindowMs / 1000)}
                  onChange={(v) => patchStuck({ thresholds: { ...draft.stuck.thresholds, navWindowMs: v * 1000 } })}
                />
                <NumberField
                  label="Dialog‑sykler"
                  value={draft.stuck.thresholds.dialogThreshold}
                  onChange={(v) => patchStuck({ thresholds: { ...draft.stuck.thresholds, dialogThreshold: v } })}
                  hint="Antall ganger samme dialog åpnes/lukkes før hjelp tilbys."
                />
              </div>

              <div className="space-y-3 pt-3 border-t">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Meldinger per situasjon
                </p>
                {(["idle", "nav", "dialog"] as const).map((reason) => (
                  <div key={reason} className="rounded-md border p-3 space-y-2 bg-muted/20">
                    <Badge variant="outline" className="text-[10px]">{reason.toUpperCase()}</Badge>
                    <Field label="Tittel">
                      <Input
                        value={draft.stuck.messages[reason].title}
                        onChange={(e) => patchStuck({ messages: { ...draft.stuck.messages, [reason]: { ...draft.stuck.messages[reason], title: e.target.value } } })}
                      />
                    </Field>
                    <Field label="Forklaring">
                      <Textarea
                        rows={2}
                        value={draft.stuck.messages[reason].body}
                        onChange={(e) => patchStuck({ messages: { ...draft.stuck.messages, [reason]: { ...draft.stuck.messages[reason], body: e.target.value } } })}
                      />
                    </Field>
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-3 gap-3 pt-3 border-t">
                <Field label="«Vis omvisning»‑knapp">
                  <Input
                    value={draft.stuck.actions.tourLabel}
                    onChange={(e) => patchStuck({ actions: { ...draft.stuck.actions, tourLabel: e.target.value } })}
                  />
                </Field>
                <Field label="«Åpne guiden»‑knapp">
                  <Input
                    value={draft.stuck.actions.guideLabel}
                    onChange={(e) => patchStuck({ actions: { ...draft.stuck.actions, guideLabel: e.target.value } })}
                  />
                </Field>
                <Field label="«Avvis»‑knapp">
                  <Input
                    value={draft.stuck.actions.dismissLabel}
                    onChange={(e) => patchStuck({ actions: { ...draft.stuck.actions, dismissLabel: e.target.value } })}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── OMVISNING ── */}
        <TabsContent value="tour" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interaktiv omvisning</CardTitle>
              <CardDescription>
                Spotlight‑omvisning som peker på UI‑elementer og forklarer dem.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow
                label="Aktiver omvisning"
                checked={draft.tour.enabled}
                onChange={(v) => updateNested("tour", "enabled", v)}
              />
              <ToggleRow
                label="Start automatisk for førstegangsbesøkende"
                checked={draft.tour.autoStartOnFirstVisit}
                onChange={(v) => updateNested("tour", "autoStartOnFirstVisit", v)}
              />

              <div className="pt-3 border-t">
                <Label className="text-xs">Velkomst‑overstyring per rolle (valgfritt)</Label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  JSON: <code>{`{ "tiltaksleder": { "title": "...", "body": "..." } }`}</code>
                </p>
                <Textarea
                  value={welcomeJson}
                  onChange={(e) => { setWelcomeJson(e.target.value); setDirty(true); }}
                  rows={8}
                  spellCheck={false}
                  className="font-mono text-xs"
                />
                {jsonErrors.welcome && (
                  <p className="text-xs text-destructive mt-2">JSON‑feil: {jsonErrors.welcome}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AVANSERT — STUCK RULES ── */}
        <TabsContent value="advanced" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sitter‑fast‑regler (avansert)</CardTitle>
              <CardDescription>
                Side‑ og rolle‑avhengige overstyringer. Hver regel: <code>{`{ id, enabled, whenPathStartsWith?, whenRole?, idleMsOverride?, message: { title, body } }`}</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={rulesJson}
                onChange={(e) => { setRulesJson(e.target.value); setDirty(true); }}
                rows={14}
                spellCheck={false}
                className="font-mono text-xs"
                placeholder='[{"id":"reports-help","enabled":true,"whenPathStartsWith":"/rapporter","message":{"title":"Skal vi vise deg hvordan?","body":"Det er en kort guide for rapportskriving."}}]'
              />
              {jsonErrors.rules && (
                <p className="text-xs text-destructive mt-2">JSON‑feil: {jsonErrors.rules}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">
                Tomt array <code>[]</code> betyr ingen overstyringer — bruk default‑meldingene.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FAQ editor — list with add / remove / edit-in-place.
   ───────────────────────────────────────────────────────────────────────── */
function FAQEditor({
  faq,
  onChange,
}: {
  faq: GuideConfig["faq"];
  onChange: (faq: GuideConfig["faq"]) => void;
}) {
  const update = (i: number, patch: Partial<GuideConfig["faq"][number]>) => {
    const next = [...faq];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...faq, { q: "Nytt spørsmål", a: "Svar her…" }]);
  const remove = (i: number) => onChange(faq.filter((_, j) => j !== i));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">FAQ</CardTitle>
          <CardDescription>Spørsmål og svar nederst på /guide. Bygges også som FAQPage JSON-LD for rich snippets.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="h-3.5 w-3.5 mr-1" />Nytt
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {faq.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Ingen FAQ‑oppføringer.</p>
        )}
        {faq.map((item, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-2 bg-muted/20">
            <div className="flex items-start gap-2">
              <Input
                value={item.q}
                onChange={(e) => update(i, { q: e.target.value })}
                placeholder="Spørsmål"
                className="font-medium"
              />
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive shrink-0"
                onClick={() => remove(i)}
                aria-label="Slett"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              value={item.a}
              onChange={(e) => update(i, { a: e.target.value })}
              rows={3}
              placeholder="Svar…"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Field/ToggleRow/NumberField — small primitives shared across tabs.
   ───────────────────────────────────────────────────────────────────────── */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 cursor-pointer bg-background">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function NumberField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );
}
