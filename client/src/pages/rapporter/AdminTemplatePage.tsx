/**
 * client/src/pages/rapporter/AdminTemplatePage.tsx
 *
 * Route:  <Route path="/admin/rapportmal" component={AdminTemplatePage} />
 *
 * Kun tilgjengelig for vendor_admin og super_admin.
 * Admin kan:
 *   - Se og endre alle eksisterende felter (label, placeholder, required, visible, helpText)
 *   - Legge til nye egendefinerte felter
 *   - Endre rekkefølge (dra opp/ned)
 *   - Publisere malen som gjelder for alle miljøarbeidere i organisasjonen
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Label }     from "@/components/ui/label";
import { Badge }     from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch }  from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, GripVertical, Eye, EyeOff,
  ChevronUp, ChevronDown, Settings2, Palette,
  Save, Globe, AlertTriangle, CheckCircle,
} from "lucide-react";

// ── TYPES ─────────────────────────────────────────────────────────────────────

type FieldType = "text" | "textarea" | "select" | "date" | "number" | "checkbox" | "heading" | "divider";

interface TemplateField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  visible: boolean;
  gdprSjekk: boolean;
  options?: string[];
  defaultValue?: string;
  helpText?: string;
  seksjon: string;
  sortOrder: number;
  isSystem: boolean;
}

const SEKSJON_LABELS: Record<string, string> = {
  prosjektinfo: "Prosjektinformasjon",
  innledning:   "Innledning",
  aktiviteter:  "Aktivitetslogg",
  fremdrift:    "Fremdrift",
  avslutning:   "Avslutning",
  underskrift:  "Underskrift",
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text:     "Tekstfelt",
  textarea: "Tekstområde",
  select:   "Dropdown",
  date:     "Dato",
  number:   "Tall",
  checkbox: "Avkrysning",
  heading:  "Overskrift",
  divider:  "Skillelinje",
};

const DEFAULT_FIELDS: TemplateField[] = [
  { id:"konsulent",     type:"text",     label:"Konsulent / Miljøarbeider", required:true,  visible:true, gdprSjekk:false, seksjon:"prosjektinfo", sortOrder:1,  isSystem:true },
  { id:"tiltak",        type:"select",   label:"Tiltak / Rolle",            required:true,  visible:true, gdprSjekk:false, seksjon:"prosjektinfo", sortOrder:2,  isSystem:true, options:["Miljøarbeider","Sosialarbeider","Aktivitør","Miljøterapeut"] },
  { id:"bedrift",       type:"text",     label:"Bedrift",                   required:false, visible:true, gdprSjekk:false, seksjon:"prosjektinfo", sortOrder:3,  isSystem:true },
  { id:"oppdragsgiver", type:"text",     label:"Oppdragsgiver",             required:false, visible:true, gdprSjekk:false, seksjon:"prosjektinfo", sortOrder:4,  isSystem:true },
  { id:"klientRef",     type:"text",     label:"Klient-ID (anonymt)",       required:false, visible:true, gdprSjekk:false, seksjon:"prosjektinfo", sortOrder:5,  isSystem:true, helpText:"Kun anonymt saksnummer — ingen navn" },
  { id:"tiltaksleder",  type:"text",     label:"Tiltaksleder",              required:false, visible:true, gdprSjekk:false, seksjon:"prosjektinfo", sortOrder:6,  isSystem:true },
  { id:"periodeFrom",   type:"date",     label:"Periode fra",               required:true,  visible:true, gdprSjekk:false, seksjon:"prosjektinfo", sortOrder:7,  isSystem:true },
  { id:"periodeTo",     type:"date",     label:"Periode til",               required:true,  visible:true, gdprSjekk:false, seksjon:"prosjektinfo", sortOrder:8,  isSystem:true },
  { id:"innledning",    type:"textarea", label:"Innledning",                required:false, visible:true, gdprSjekk:true,  seksjon:"innledning",   sortOrder:9,  isSystem:true, helpText:"Generell oppsummering av perioden" },
  { id:"avslutning",    type:"textarea", label:"Oppsummering / Veien videre", required:false, visible:true, gdprSjekk:true, seksjon:"avslutning",  sortOrder:10, isSystem:true },
];

// ── FIELD EDITOR ROW ──────────────────────────────────────────────────────────

function FieldRow({ field, onUpdate, onDelete, onMove, isFirst, isLast }: {
  field: TemplateField;
  onUpdate: (updated: TemplateField) => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newOption,  setNewOption] = useState("");

  const u = (patch: Partial<TemplateField>) => onUpdate({ ...field, ...patch });

  return (
    <div className={`rounded-lg border transition-all ${!field.visible ? "opacity-50" : ""} ${expanded ? "border-primary/40 shadow-sm" : ""}`}>
      {/* COMPACT ROW */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Drag handle / order */}
        <div className="flex flex-col gap-0.5">
          <button onClick={() => onMove("up")}  disabled={isFirst} className="text-muted-foreground hover:text-foreground disabled:opacity-20" aria-label={`Flytt ${field.label} opp`}><ChevronUp  className="h-3 w-3" /></button>
          <button onClick={() => onMove("down")} disabled={isLast}  className="text-muted-foreground hover:text-foreground disabled:opacity-20" aria-label={`Flytt ${field.label} ned`}><ChevronDown className="h-3 w-3" /></button>
        </div>

        {/* Type badge */}
        <Badge variant="outline" className="text-[10px] font-mono w-20 justify-center flex-shrink-0">{field.type}</Badge>

        {/* Label (editable inline) */}
        <Input
          value={field.label}
          onChange={(e) => u({ label: e.target.value })}
          className="flex-1 h-7 text-sm border-0 shadow-none focus-visible:ring-0 px-1 bg-transparent font-medium"
        />

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {field.isSystem && <Badge variant="secondary" className="text-[9px]">System</Badge>}
          {field.required && <Badge variant="destructive" className="text-[9px]">Påkrevd</Badge>}
          {field.gdprSjekk && <Badge className="text-[9px] bg-amber-500">GDPR</Badge>}
        </div>

        {/* Visible toggle */}
        <button onClick={() => u({ visible: !field.visible })} className="text-muted-foreground hover:text-foreground" aria-label={field.visible ? `Skjul ${field.label}` : `Vis ${field.label}`}>
          {field.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>

        {/* Expand */}
        <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground" aria-label={`Rediger ${field.label}`} aria-expanded={expanded}>
          <Settings2 className="h-4 w-4" />
        </button>

        {/* Delete (not for system fields) */}
        {!field.isSystem && (
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive" aria-label={`Slett felt ${field.label}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* EXPANDED EDITOR */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t bg-muted/20 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Felttype</Label>
              <Select value={field.type} onValueChange={(v: FieldType) => u({ type: v })} disabled={field.isSystem}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Seksjon</Label>
              <Select value={field.seksjon} onValueChange={(v) => u({ seksjon: v })} disabled={field.isSystem}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SEKSJON_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Plassholder</Label>
              <Input className="mt-1 h-8 text-xs" value={field.placeholder ?? ""} onChange={(e) => u({ placeholder: e.target.value })} placeholder="Tekst som vises når feltet er tomt" />
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Hjelpetekst</Label>
              <Input className="mt-1 h-8 text-xs" value={field.helpText ?? ""} onChange={(e) => u({ helpText: e.target.value })} placeholder="Forklaring under feltet" />
            </div>
          </div>

          {/* Options for select */}
          {field.type === "select" && (
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Valg</Label>
              <div className="mt-1 space-y-1">
                {(field.options ?? []).map((opt, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input className="h-7 text-xs flex-1" value={opt} onChange={(e) => {
                      const opts = [...(field.options ?? [])]; opts[i] = e.target.value; u({ options: opts });
                    }} />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => {
                      const opts = (field.options ?? []).filter((_, j) => j !== i); u({ options: opts });
                    }}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <Input className="h-7 text-xs flex-1" placeholder="Nytt valg…" value={newOption} onChange={(e) => setNewOption(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newOption.trim()) { u({ options: [...(field.options ?? []), newOption.trim()] }); setNewOption(""); } }} />
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { if (newOption.trim()) { u({ options: [...(field.options ?? []), newOption.trim()] }); setNewOption(""); } }}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <Switch checked={field.required} onCheckedChange={(v) => u({ required: v })} />
              Påkrevd
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <Switch checked={field.visible} onCheckedChange={(v) => u({ visible: v })} />
              Synlig
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <Switch checked={field.gdprSjekk} onCheckedChange={(v) => u({ gdprSjekk: v })} />
              GDPR-sjekk
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function AdminTemplatePage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [fields,       setFields]       = useState<TemplateField[]>(DEFAULT_FIELDS);
  const [addDialog,    setAddDialog]    = useState(false);
  const [primaryColor, setPrimaryColor] = useState("#1F6B73");
  const [secColor,     setSecColor]     = useState("#4E9A6F");
  const [orgName,      setOrgName]      = useState("Din organisasjon");
  const [gdprText,     setGdprText]     = useState("Rapporten følger GDPR-krav. Ingen navn, fødselsdatoer eller adresser inkludert.");
  const [activeTab,    setActiveTab]    = useState<"fields"|"sections"|"texts"|"branding">("fields");

  // New field form
  const [nfType,   setNfType]   = useState<FieldType>("text");
  const [nfLabel,  setNfLabel]  = useState("");
  const [nfPlaceholder, setNfPlaceholder] = useState("");
  const [nfSeksjon,setNfSeksjon] = useState("prosjektinfo");
  const [nfRequired,setNfRequired] = useState(false);
  const [nfGdpr,   setNfGdpr]   = useState(false);

  // Template from server
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["/api/rapporter/templates/mine"],
    queryFn: () => apiRequest("/api/rapporter/templates/mine"),
  });

  const saveTemplate = useMutation({
    mutationFn: (body: object) => {
      const existing = (templates as any[])[0];
      if (existing) {
        return apiRequest(`/api/rapporter/templates/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return apiRequest("/api/rapporter/templates", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { toast({ title: "Mal lagret" }); qc.invalidateQueries({ queryKey: ["/api/rapporter/templates/mine"] }); },
    onError: () => toast({ title: "Feil ved lagring", variant: "destructive" }),
  });

  const handleSave = (publish = false) => {
    saveTemplate.mutate({
      feltKonfig: fields,
      branding: { primaryColor, secondaryColor: secColor, orgName },
      tekster: { gdprAdvarsel: gdprText },
      status: publish ? "publisert" : "utkast",
    });
  };

  const handleAddField = () => {
    if (!nfLabel.trim()) { toast({ title: "Label er påkrevd", variant: "destructive" }); return; }
    const newField: TemplateField = {
      id: `custom_${Date.now()}`, type: nfType, label: nfLabel,
      placeholder: nfPlaceholder || undefined, required: nfRequired, visible: true,
      gdprSjekk: nfGdpr, seksjon: nfSeksjon, isSystem: false,
      sortOrder: Math.max(...fields.map(f => f.sortOrder), 0) + 1,
    };
    setFields(prev => [...prev, newField]);
    setAddDialog(false); setNfLabel(""); setNfPlaceholder("");
    toast({ title: "Felt lagt til" });
  };

  const handleUpdate = (id: string, updated: TemplateField) => {
    setFields(prev => prev.map(f => f.id === id ? updated : f));
  };

  const handleDelete = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const handleMove = (id: string, dir: "up" | "down") => {
    const idx = fields.findIndex(f => f.id === id);
    if (idx === -1) return;
    const newFields = [...fields];
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newFields.length) return;
    [newFields[idx], newFields[swapIdx]] = [newFields[swapIdx], newFields[idx]];
    // Reassign sortOrder
    newFields.forEach((f, i) => { f.sortOrder = i + 1; });
    setFields(newFields);
  };

  // Group by section
  const grouped = Object.entries(SEKSJON_LABELS).map(([sId, sLabel]) => ({
    sId, sLabel, fields: fields.filter(f => f.seksjon === sId).sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter(g => g.fields.length > 0);

  const TABS = [
    { id: "fields",   label: "Feltoppsett" },
    { id: "sections", label: "Seksjoner" },
    { id: "texts",    label: "Tekster" },
    { id: "branding", label: "Farger & Logo" },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <div className="border-b bg-card sticky top-0 z-40 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Template Designer</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Konfigurer rapportmalen for din organisasjon</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={saveTemplate.isPending}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Lagre utkast
            </Button>
            <Button size="sm" onClick={() => handleSave(true)} disabled={saveTemplate.isPending}>
              <Globe className="h-3.5 w-3.5 mr-1.5" /> Publiser for alle
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* TABS */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit mb-6">
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setActiveTab(id as any)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── FELTOPPSETT ─────────────────────────────────── */}
        {activeTab === "fields" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Felt i rapportmalen</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Klikk tannhjulet for å redigere et felt. Systemfelt kan skjules men ikke slettes.</p>
              </div>
              <Button onClick={() => setAddDialog(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Nytt felt
              </Button>
            </div>

            {grouped.map(({ sId, sLabel, fields: sFields }) => (
              <div key={sId}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2">{sLabel}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-1.5">
                  {sFields.map((f, i) => (
                    <FieldRow
                      key={f.id}
                      field={f}
                      onUpdate={(updated) => handleUpdate(f.id, updated)}
                      onDelete={() => handleDelete(f.id)}
                      onMove={(dir) => handleMove(f.id, dir)}
                      isFirst={i === 0}
                      isLast={i === sFields.length - 1}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Orphan fields (custom not in a known section) */}
            {fields.filter(f => !Object.keys(SEKSJON_LABELS).includes(f.seksjon)).map((f, i, arr) => (
              <FieldRow
                key={f.id}
                field={f}
                onUpdate={(updated) => handleUpdate(f.id, updated)}
                onDelete={() => handleDelete(f.id)}
                onMove={(dir) => handleMove(f.id, dir)}
                isFirst={i === 0}
                isLast={i === arr.length - 1}
              />
            ))}
          </div>
        )}

        {/* ── SEKSJONER ────────────────────────────────────── */}
        {activeTab === "sections" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Slå seksjoner av og på for alle brukere i organisasjonen.</p>
            {Object.entries(SEKSJON_LABELS).map(([id, label]) => {
              const count = fields.filter(f => f.seksjon === id && f.visible).length;
              const systemReq = ["maal","aktiviteter","underskrift"].includes(id);
              return (
                <div key={id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {count} felt synlig {systemReq && <span className="text-amber-500 ml-1">· Påkrevd</span>}
                    </p>
                  </div>
                  <Switch defaultChecked disabled={systemReq} />
                </div>
              );
            })}
          </div>
        )}

        {/* ── TEKSTER ──────────────────────────────────────── */}
        {activeTab === "texts" && (
          <div className="grid gap-5 max-w-2xl">
            <Card>
              <CardHeader className="py-3 px-4 border-b"><span className="font-semibold text-sm">Organisasjon</span></CardHeader>
              <CardContent className="p-4 space-y-3">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organisasjonsnavn (vises i PDF)</Label>
                  <Input className="mt-1" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3 px-4 border-b"><span className="font-semibold text-sm">GDPR-tekst</span></CardHeader>
              <CardContent className="p-4">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Advarselstekst (vises øverst i rapport)</Label>
                <textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]" value={gdprText} onChange={(e) => setGdprText(e.target.value)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3 px-4 border-b"><span className="font-semibold text-sm">Rolletitler</span></CardHeader>
              <CardContent className="p-4 grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Miljøarbeider-tittel</Label>
                  <Input className="mt-1" defaultValue="Miljøarbeider" />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tiltaksleder-tittel</Label>
                  <Input className="mt-1" defaultValue="Tiltaksleder" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── BRANDING ─────────────────────────────────────── */}
        {activeTab === "branding" && (
          <div className="grid gap-5 max-w-2xl">
            <Card>
              <CardHeader className="py-3 px-4 border-b"><span className="font-semibold text-sm flex items-center gap-2"><Palette className="h-4 w-4 text-primary" />Farger</span></CardHeader>
              <CardContent className="p-4 space-y-4">
                {[
                  { label:"Primærfarge", value: primaryColor, setter: setPrimaryColor },
                  { label:"Sekundærfarge", value: secColor, setter: setSecColor },
                ].map(({ label, value, setter }) => (
                  <div key={label} className="flex items-center gap-4">
                    <input type="color" value={value} onChange={(e) => setter(e.target.value)}
                      className="w-10 h-10 rounded-lg border cursor-pointer" />
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs font-mono text-muted-foreground">{value}</p>
                    </div>
                    <div className="ml-auto w-20 h-8 rounded-lg" style={{ background: value }} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3 px-4 border-b"><span className="font-semibold text-sm">Leverandørlogo</span></CardHeader>
              <CardContent className="p-4">
                <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                  <div className="text-3xl mb-2">↑</div>
                  <p className="text-sm font-medium">Last opp logo</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG eller SVG, anbefalt 200×60px</p>
                  <input type="file" accept="image/*" className="hidden" />
                </label>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── DIALOG: LEGG TIL FELT ────────────────────────── */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Legg til nytt felt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Felttype <span className="text-destructive">*</span></Label>
              <Select value={nfType} onValueChange={(v: FieldType) => setNfType(v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(FIELD_TYPE_LABELS).map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label <span className="text-destructive">*</span></Label>
              <Input className="mt-1" value={nfLabel} onChange={(e) => setNfLabel(e.target.value)} placeholder="f.eks. «Arbeidssted», «Timeantall»" />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plassholder</Label>
              <Input className="mt-1" value={nfPlaceholder} onChange={(e) => setNfPlaceholder(e.target.value)} placeholder="Tekst som vises når feltet er tomt" />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plasser i seksjon</Label>
              <Select value={nfSeksjon} onValueChange={setNfSeksjon}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SEKSJON_LABELS).map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch checked={nfRequired} onCheckedChange={setNfRequired} />
                Påkrevd
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch checked={nfGdpr} onCheckedChange={setNfGdpr} />
                GDPR-sjekk
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Avbryt</Button>
            <Button onClick={handleAddField}><Plus className="h-3.5 w-3.5 mr-1.5" />Legg til felt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
