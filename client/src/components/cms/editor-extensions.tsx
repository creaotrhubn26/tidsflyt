/**
 * CMS Editor Extension Panels
 * 
 * All 15 additional extension panels for the Power Visual Editor:
 * SEO, scheduling, image upload, global header/footer, section clipboard,
 * custom templates, custom CSS, version history, import/export,
 * accessibility checker, analytics, performance estimator, i18n
 */

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useToast } from "@/hooks/use-toast";
import {
  Search, Globe, Calendar, Upload, LayoutPanelTop,
  BookmarkPlus, Code2, History, FileDown, FileUp, Accessibility, BarChart3,
  Gauge, Languages, X, Check, AlertTriangle, Loader2, Trash2, RotateCcw,
  Eye, Image, ExternalLink, Sparkles, ArrowDown
} from "lucide-react";

// ═══════════════════════════════════════════
// 1. SEO Metadata Editor
// ═══════════════════════════════════════════
interface SEOEditorProps {
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  canonicalUrl: string;
  pageTitle: string;
  pageSlug: string;
  onChange: (field: string, value: string) => void;
}

export function SEOEditor({ metaTitle, metaDescription, ogImage, canonicalUrl, pageTitle, pageSlug, onChange }: SEOEditorProps) {
  const titleLen = (metaTitle || pageTitle || '').length;
  const descLen = (metaDescription || '').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Search className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">SEO & Metadata</h3>
      </div>

      {/* Google Preview */}
      <Card className="bg-white border">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground mb-1">Google forhåndsvisning</p>
          <div className="text-blue-700 text-sm font-medium truncate">{metaTitle || pageTitle || 'Sidetittel'}</div>
          <div className="text-green-700 text-xs truncate">tidum.no/p/{pageSlug}</div>
          <div className="text-xs text-gray-600 line-clamp-2 mt-0.5">{metaDescription || 'Legg til en metabeskrivelse...'}</div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label className="text-xs">Meta tittel</Label>
        <Input
          value={metaTitle}
          onChange={(e) => onChange('metaTitle', e.target.value)}
          placeholder={pageTitle}
          className="text-sm"
        />
        <p className={`text-xs ${titleLen > 60 ? 'text-red-500' : 'text-muted-foreground'}`}>
          {titleLen}/60 tegn {titleLen > 60 && '(for lang)'}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Meta beskrivelse</Label>
        <Textarea
          value={metaDescription}
          onChange={(e) => onChange('metaDescription', e.target.value)}
          placeholder="Kort beskrivelse av siden..."
          rows={3}
          className="text-sm"
        />
        <p className={`text-xs ${descLen > 160 ? 'text-red-500' : 'text-muted-foreground'}`}>
          {descLen}/160 tegn {descLen > 160 && '(for lang)'}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">OG Bilde URL</Label>
        <Input
          value={ogImage}
          onChange={(e) => onChange('ogImage', e.target.value)}
          placeholder="https://..."
          className="text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Kanonisk URL</Label>
        <Input
          value={canonicalUrl}
          onChange={(e) => onChange('canonicalUrl', e.target.value)}
          placeholder={`https://tidum.no/p/${pageSlug}`}
          className="text-sm"
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 2. Scheduled Publishing
// ═══════════════════════════════════════════
interface ScheduleEditorProps {
  scheduledAt: string;
  status: string;
  onChange: (scheduledAt: string) => void;
  onStatusChange: (status: string) => void;
}

export function ScheduleEditor({ scheduledAt, status, onChange, onStatusChange }: ScheduleEditorProps) {
  const now = new Date().toISOString().slice(0, 16);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Planlegg publisering</h3>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg border">
        <Badge variant={status === 'published' ? 'default' : status === 'scheduled' ? 'secondary' : 'outline'}>
          {status === 'published' ? '🟢 Publisert' : status === 'scheduled' ? '⏰ Planlagt' : '📝 Kladd'}
        </Badge>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Publiseringsdato</Label>
        <Input
          type="datetime-local"
          value={scheduledAt || ''}
          min={now}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
        />
        {scheduledAt && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onChange('')} className="text-xs">
              <X className="h-3 w-3 mr-1" />
              Fjern plan
            </Button>
            <Button size="sm" onClick={() => onStatusChange('scheduled')} className="text-xs">
              <Calendar className="h-3 w-3 mr-1" />
              Sett som planlagt
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Sider med planlagt publisering blir automatisk publisert på angitt tidspunkt.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════
// 3. Image Upload with Auto-Optimization
// ═══════════════════════════════════════════
interface UploadResult {
  url: string;
  thumbnail?: string;
  filename: string;
  size: number;
  originalSize: number;
  optimized: boolean;
  format?: string;
  width?: number;
  height?: number;
  savings?: number;
}

interface ImageUploaderProps {
  onUpload: (url: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function ImageUploader({ onUpload }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [recentUploads, setRecentUploads] = useState<UploadResult[]>([]);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleUpload = async (file: File) => {
    setUploading(true);
    setLastResult(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await fetch('/api/cms/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Opplasting feilet');
      const data: UploadResult = await res.json();
      setRecentUploads(prev => [data, ...prev.slice(0, 9)]);
      setLastResult(data);
      onUpload(data.url);

      if (data.optimized && data.savings && data.savings > 0) {
        toast({
          title: 'Bilde optimalisert og lastet opp',
          description: `${formatBytes(data.originalSize)} → ${formatBytes(data.size)} (${data.savings}% spart, WebP)`,
        });
      } else {
        toast({ title: 'Bilde lastet opp', description: data.filename });
      }
    } catch (e: any) {
      toast({ title: 'Feil', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleUpload(file);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Upload className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Bildeopplasting</h3>
        <Badge variant="secondary" className="text-[10px] gap-1">
          <Sparkles className="h-3 w-3" />
          Auto-optimalisering
        </Badge>
      </div>

      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? (
          <div className="space-y-2">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Optimaliserer bilde...</p>
          </div>
        ) : (
          <>
            <Image className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Dra og slipp, eller klikk for å velge</p>
            <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, GIF, WebP, SVG (maks 10MB)</p>
            <p className="text-xs text-primary/70 mt-1 flex items-center justify-center gap-1">
              <Sparkles className="h-3 w-3" />
              Konverteres automatisk til WebP
            </p>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Last opp bilde"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      />

      {/* Optimization result card */}
      {lastResult && lastResult.optimized && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">Optimalisert</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Original:</span>
                <span className="ml-1 font-mono">{formatBytes(lastResult.originalSize)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Optimalisert:</span>
                <span className="ml-1 font-mono">{formatBytes(lastResult.size)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Format:</span>
                <span className="ml-1 font-mono uppercase">{lastResult.format}</span>
              </div>
              {lastResult.savings !== undefined && lastResult.savings > 0 && (
                <div className="flex items-center gap-1">
                  <ArrowDown className="h-3 w-3 text-green-500" />
                  <span className="font-semibold text-green-600 dark:text-green-400">{lastResult.savings}% spart</span>
                </div>
              )}
            </div>
            {lastResult.width && lastResult.height && (
              <p className="text-[10px] text-muted-foreground">
                Dimensjoner: {lastResult.width} × {lastResult.height}px
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {recentUploads.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Nylig opplastet</Label>
          <div className="grid grid-cols-3 gap-2">
            {recentUploads.map((item, i) => (
              <div
                key={i}
                className="relative aspect-square rounded border cursor-pointer hover:ring-2 ring-primary overflow-hidden group"
                onClick={() => onUpload(item.url)}
              >
                <img src={item.thumbnail || item.url} alt="" className="w-full h-full object-cover" />
                {item.optimized && item.savings !== undefined && item.savings > 0 && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-green-400 text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    -{item.savings}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 4. Global Header/Footer Editor
// ═══════════════════════════════════════════
interface GlobalLayoutEditorProps {
  globalHeader: any;
  globalFooter: any;
  onHeaderChange: (header: any) => void;
  onFooterChange: (footer: any) => void;
}

export function GlobalLayoutEditor({ globalHeader, globalFooter, onHeaderChange, onFooterChange }: GlobalLayoutEditorProps) {
  const [headerEnabled, setHeaderEnabled] = useState(!!globalHeader);
  const [footerEnabled, setFooterEnabled] = useState(!!globalFooter);

  const defaultHeader = {
    logo: 'Tidum',
    navLinks: [
      { text: 'Funksjoner', href: '#funksjoner' },
      { text: 'Priser', href: '#priser' },
      { text: 'Kontakt', href: '/kontakt' },
    ],
    ctaButton: { text: 'Be om demo', href: '/kontakt' },
  };

  const defaultFooter = {
    links: [
      { text: 'Personvern', href: '/personvern' },
      { text: 'Vilkår', href: '/vilkar' },
      { text: 'Kontakt', href: '/kontakt' },
    ],
    copyright: `© ${new Date().getFullYear()} Tidum AS`,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <LayoutPanelTop className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Global header & footer</h3>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Toppmeny</Label>
            <Switch
              checked={headerEnabled}
              onCheckedChange={(v) => {
                setHeaderEnabled(v);
                onHeaderChange(v ? (globalHeader || defaultHeader) : null);
              }}
            />
          </div>
          {headerEnabled && (
            <>
              <div className="space-y-2">
                <Label className="text-xs">Logo-tekst</Label>
                <Input
                  value={(globalHeader || defaultHeader).logo || ''}
                  onChange={(e) => onHeaderChange({ ...(globalHeader || defaultHeader), logo: e.target.value })}
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">CTA-knapp tekst</Label>
                <Input
                  value={(globalHeader || defaultHeader).ctaButton?.text || ''}
                  onChange={(e) => onHeaderChange({
                    ...(globalHeader || defaultHeader),
                    ctaButton: { ...(globalHeader || defaultHeader).ctaButton, text: e.target.value }
                  })}
                  className="text-sm"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Bunn</Label>
            <Switch
              checked={footerEnabled}
              onCheckedChange={(v) => {
                setFooterEnabled(v);
                onFooterChange(v ? (globalFooter || defaultFooter) : null);
              }}
            />
          </div>
          {footerEnabled && (
            <div className="space-y-2">
              <Label className="text-xs">Copyright-tekst</Label>
              <Input
                value={(globalFooter || defaultFooter).copyright || ''}
                onChange={(e) => onFooterChange({ ...(globalFooter || defaultFooter), copyright: e.target.value })}
                className="text-sm"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════
// 5. Section Clipboard
// ═══════════════════════════════════════════
const CLIPBOARD_KEY = 'tidum-section-clipboard';

export function useSectionClipboard() {
  const { toast } = useToast();

  const copySection = (section: any) => {
    const data = { ...section, id: undefined };
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
    toast({ title: 'Kopiert!', description: `"${section.title}" kopiert til utklipp` });
  };

  const pasteSection = (): any | null => {
    const raw = localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) {
      toast({ title: 'Tomt utklipp', description: 'Ingen seksjon er kopiert', variant: 'destructive' });
      return null;
    }
    try {
      const section = JSON.parse(raw);
      section.id = `section-${Date.now()}`;
      toast({ title: 'Limt inn!', description: `"${section.title}" limt inn` });
      return section;
    } catch {
      return null;
    }
  };

  const hasClipboard = !!localStorage.getItem(CLIPBOARD_KEY);

  return { copySection, pasteSection, hasClipboard };
}

// ═══════════════════════════════════════════
// 6. Custom Section Templates (Save/Load)
// ═══════════════════════════════════════════
interface SectionTemplatesPanelProps {
  onLoadTemplate: (section: any) => void;
  currentSection?: any;
}

export function SectionTemplatesPanel({ onLoadTemplate, currentSection }: SectionTemplatesPanelProps) {
  const [saveName, setSaveName] = useState('');
  const { toast } = useToast();

  const templatesQuery = useQuery({
    queryKey: ['/api/cms/section-templates'],
    queryFn: () => fetch('/api/cms/section-templates').then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; sectionData: any }) => {
      const res = await fetch('/api/cms/section-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Lagring feilet');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/section-templates'] });
      setSaveName('');
      toast({ title: 'Mal lagret!' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/cms/section-templates/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/section-templates'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <BookmarkPlus className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Seksjonsmaler</h3>
      </div>

      {currentSection && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <Label className="text-xs">Lagre gjeldende seksjon som mal</Label>
            <div className="flex gap-2">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Malnavn..."
                className="text-sm"
              />
              <Button
                size="sm"
                disabled={!saveName || saveMutation.isPending}
                onClick={() => saveMutation.mutate({
                  name: saveName,
                  sectionData: { ...currentSection, id: undefined },
                })}
              >
                {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookmarkPlus className="h-3 w-3" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Lagrede maler</Label>
        {templatesQuery.data?.length === 0 && (
          <div className="flex flex-col items-center py-4 text-muted-foreground">
            <BookmarkPlus className="h-6 w-6 mb-1 opacity-30" />
            <p className="text-xs italic">Ingen maler lagret ennå</p>
          </div>
        )}
        {templatesQuery.data?.map((t: any) => (
          <div key={t.id} className="flex items-center gap-2 p-2 rounded border hover:bg-accent cursor-pointer">
            <button className="flex-1 text-left text-sm" onClick={() => {
              const section = { ...t.sectionData, id: `section-${Date.now()}` };
              onLoadTemplate(section);
            }}>
              {t.name}
            </button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteMutation.mutate(t.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 7. Custom CSS per Section
// ═══════════════════════════════════════════
interface CustomCSSEditorProps {
  customCss: string;
  sectionId: string;
  onChange: (css: string) => void;
  pageCss: string;
  onPageCssChange: (css: string) => void;
}

export function CustomCSSEditor({ customCss, sectionId, onChange, pageCss, onPageCssChange }: CustomCSSEditorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Code2 className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Egendefinert CSS</h3>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Seksjon CSS <Badge variant="outline" className="text-[10px] ml-1">#{sectionId}</Badge></Label>
        <Textarea
          value={customCss || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`/* CSS for #${sectionId} */\n.tidum-section { }`}
          rows={6}
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Side-CSS (globalt)</Label>
        <Textarea
          value={pageCss || ''}
          onChange={(e) => onPageCssChange(e.target.value)}
          placeholder="/* Gjelder hele siden */\n.tidum-page { }"
          rows={4}
          className="font-mono text-xs"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        CSS brukes direkte på publisert side. Bruk .tidum-page og .tidum-section som selektorer.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════
// 8. Page Version History
// ═══════════════════════════════════════════
interface VersionHistoryProps {
  pageId: number | null;
  onRestore: (sections: any[], title: string) => void;
}

export function VersionHistory({ pageId, onRestore }: VersionHistoryProps) {
  const { toast } = useToast();
  const [previewVersion, setPreviewVersion] = useState<any>(null);

  const versionsQuery = useQuery({
    queryKey: ['/api/cms/page-versions', pageId],
    queryFn: () => fetch(`/api/cms/page-versions/${pageId}`).then(r => r.json()),
    enabled: !!pageId,
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: number) => {
      const res = await fetch(`/api/cms/page-versions/${pageId}/restore/${versionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Gjenoppretting feilet');
      return res.json();
    },
    onSuccess: (page: any) => {
      onRestore(page.sections, page.title);
      queryClient.invalidateQueries({ queryKey: ['/api/cms/page-versions', pageId] });
      toast({ title: 'Gjenopprettet!', description: 'Versjonen ble gjenopprettet' });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <History className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Versjonshistorikk</h3>
      </div>

      {!pageId && (
        <p className="text-xs text-muted-foreground italic">Lagre siden først for å se historikk</p>
      )}

      {versionsQuery.data?.length === 0 && pageId && (
        <div className="flex flex-col items-center py-4 text-muted-foreground">
          <History className="h-6 w-6 mb-1 opacity-30" />
          <p className="text-xs italic">Ingen tidligere versjoner</p>
        </div>
      )}

      {/* Version Preview Panel */}
      {previewVersion && (
        <Card className="border-2 border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="secondary" className="text-xs">Forhåndsvisning v{previewVersion.version}</Badge>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setPreviewVersion(null)}>✕ Lukk</Button>
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              {new Date(previewVersion.createdAt).toLocaleString('nb-NO')}
              {previewVersion.changeNote && ` — ${previewVersion.changeNote}`}
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {Array.isArray(previewVersion.sections) ? previewVersion.sections.map((sec: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-background border">
                  <span className="text-muted-foreground font-mono w-5 text-right">{i + 1}.</span>
                  <span className="font-medium truncate flex-1">{sec.title || sec.templateId || 'Uten tittel'}</span>
                  <Badge variant="outline" className="text-[10px] h-4">{sec.type || sec.templateId?.split('-')[1] || '?'}</Badge>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground">Ingen seksjoner i denne versjonen</p>
              )}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {Array.isArray(previewVersion.sections) ? `${previewVersion.sections.length} seksjoner totalt` : ''}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {versionsQuery.data?.map((ver: any) => (
          <Card key={ver.id} className="border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">v{ver.version}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(ver.createdAt).toLocaleString('nb-NO')}
                  </div>
                  {ver.changeNote && (
                    <div className="text-xs text-muted-foreground mt-1">{ver.changeNote}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={previewVersion?.id === ver.id ? 'default' : 'outline'}
                    className="text-xs h-7"
                    onClick={() => setPreviewVersion(previewVersion?.id === ver.id ? null : ver)}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => restoreMutation.mutate(ver.id)}
                    disabled={restoreMutation.isPending}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Gjenopprett
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 9. Import / Export JSON
// ═══════════════════════════════════════════
interface ImportExportProps {
  sections: any[];
  pageTitle: string;
  pageSlug: string;
  themeKey: string;
  onImport: (data: { sections: any[]; title?: string; slug?: string; themeKey?: string }) => void;
}

export function ImportExport({ sections, pageTitle, pageSlug, themeKey, onImport }: ImportExportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleExport = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      title: pageTitle,
      slug: pageSlug,
      themeKey,
      sections,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pageSlug || 'page'}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Eksportert!', description: `${sections.length} seksjoner eksportert` });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.sections || !Array.isArray(data.sections)) {
          throw new Error('Ugyldig format');
        }
        // Regenerate IDs
        const imported = data.sections.map((s: any, i: number) => ({
          ...s,
          id: `section-${Date.now()}-${i}`,
          order: i,
        }));
        onImport({ sections: imported, title: data.title, slug: data.slug, themeKey: data.themeKey });
        toast({ title: 'Importert!', description: `${imported.length} seksjoner importert` });
      } catch (err: any) {
        toast({ title: 'Feil', description: err.message || 'Kunne ikke importere', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <FileDown className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Import / Eksport</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={handleExport} disabled={sections.length === 0} className="text-xs">
          <FileDown className="h-3 w-3 mr-1" />
          Eksporter JSON
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()} className="text-xs">
          <FileUp className="h-3 w-3 mr-1" />
          Importer JSON
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        className="hidden"
        aria-label="Importer JSON-fil"
        onChange={handleImport}
      />

      <p className="text-xs text-muted-foreground">
        Eksporter sider som JSON for backup eller overføring mellom miljøer.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════
// 10. Accessibility Checker
// ═══════════════════════════════════════════
interface A11yIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  section?: string;
}

interface AccessibilityCheckerProps {
  sections: any[];
}

export function AccessibilityChecker({ sections }: AccessibilityCheckerProps) {
  const [issues, setIssues] = useState<A11yIssue[]>([]);
  const [checked, setChecked] = useState(false);

  const runCheck = () => {
    const found: A11yIssue[] = [];

    // Check each section
    sections.forEach((section, i) => {
      const label = section.title || `Seksjon ${i + 1}`;

      // Check for missing alt text on images
      if (section.content?.heroImage && !section.content?.heroImageAlt) {
        found.push({ type: 'warning', message: `Mangler alt-tekst for hero-bilde`, section: label });
      }
      if (section.content?.images) {
        section.content.images.forEach((img: any, j: number) => {
          if (img.src && !img.alt) {
            found.push({ type: 'warning', message: `Bilde ${j + 1} mangler alt-tekst`, section: label });
          }
        });
      }

      // Check for low color contrast (very basic)
      if (section.background?.color) {
        const bg = section.background.color.toLowerCase();
        if (bg === '#ffffff' || bg === '#fff' || bg === 'white') {
          // White bg is fine for dark text
        } else if (bg.startsWith('#') && bg.length >= 7) {
          const r = parseInt(bg.slice(1, 3), 16);
          const g = parseInt(bg.slice(3, 5), 16);
          const b = parseInt(bg.slice(5, 7), 16);
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          if (luminance < 0.3) {
            found.push({ type: 'info', message: `Mørk bakgrunn - sørg for lys tekstfarge`, section: label });
          }
        }
      }

      // Check for empty headings
      if (!section.title || section.title.trim() === '') {
        found.push({ type: 'error', message: `Tom overskrift`, section: label });
      }

      // Check for form accessibility
      if (section.content?.fields) {
        section.content.fields.forEach((f: any) => {
          if (!f.label) {
            found.push({ type: 'error', message: `Skjemafelt "${f.name}" mangler label`, section: label });
          }
        });
      }

      // Check heading hierarchy
      if (i === 0 && section.type !== 'container' && section.type !== 'hero') {
        found.push({ type: 'info', message: `Første seksjon er ikke Hero — vurder heading-hierarki`, section: label });
      }
    });

    // Global checks
    if (sections.length === 0) {
      found.push({ type: 'error', message: 'Siden har ingen seksjoner' });
    }

    const hasNav = sections.some(s => s.templateId === 'tidum-header-bar');
    if (!hasNav) {
      found.push({ type: 'warning', message: 'Siden mangler navigasjon (toppmeny)' });
    }

    const hasFooter = sections.some(s => s.templateId?.includes('footer'));
    if (!hasFooter) {
      found.push({ type: 'info', message: 'Vurder å legge til footer for tilgjengelighet' });
    }

    setIssues(found);
    setChecked(true);
  };

  const score = checked ? Math.max(0, 100 - issues.filter(i => i.type === 'error').length * 20 - issues.filter(i => i.type === 'warning').length * 10) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Accessibility className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Tilgjengelighetssjekk</h3>
      </div>

      <Button onClick={runCheck} variant="outline" className="w-full text-xs">
        <Accessibility className="h-3 w-3 mr-1" />
        Kjør WCAG-sjekk
      </Button>

      {checked && (
        <>
          <div className="text-center p-4 rounded-lg border">
            <div className={`text-3xl font-bold ${score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
              {score}/100
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {score >= 80 ? 'Bra!' : score >= 50 ? 'Forbedringer trengs' : 'Kritiske problemer'}
            </p>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {issues.map((issue, i) => (
              <div key={i} className={`flex items-start gap-2 p-2 rounded text-xs ${
                issue.type === 'error' ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300' :
                issue.type === 'warning' ? 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300' :
                'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
              }`}>
                {issue.type === 'error' ? <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> :
                 issue.type === 'warning' ? <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> :
                 <Check className="h-3 w-3 shrink-0 mt-0.5" />}
                <div>
                  <span>{issue.message}</span>
                  {issue.section && <span className="block text-[10px] opacity-70 mt-0.5">{issue.section}</span>}
                </div>
              </div>
            ))}
            {issues.length === 0 && (
              <div className="text-center text-green-600 p-4">
                <Check className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm font-medium">Ingen problemer funnet!</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 11. Page Analytics Panel
// ═══════════════════════════════════════════
interface AnalyticsPanelProps {
  pageId: number | null;
  pageSlug: string;
}

export function AnalyticsPanel({ pageId, pageSlug }: AnalyticsPanelProps) {
  const analyticsQuery = useQuery({
    queryKey: ['/api/cms/page-analytics', pageId],
    queryFn: () => fetch(`/api/cms/page-analytics/${pageId}`).then(r => r.json()),
    enabled: !!pageId,
    refetchInterval: 30000, // refresh every 30s
  });

  const data = analyticsQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Sideanalyse</h3>
      </div>

      {!pageId && (
        <p className="text-xs text-muted-foreground italic">Lagre og publiser siden for å se analyser</p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-primary">{data.totalViews}</div>
                <div className="text-xs text-muted-foreground">Visninger</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-primary">{data.avgDuration}s</div>
                <div className="text-xs text-muted-foreground">Gj.sn. varighet</div>
              </CardContent>
            </Card>
          </div>

          {data.devices && Object.keys(data.devices).length > 0 && (
            <Card>
              <CardContent className="p-3">
                <Label className="text-xs text-muted-foreground">Enheter</Label>
                <div className="space-y-2 mt-2">
                  {Object.entries(data.devices).map(([device, count]: [string, any]) => (
                    <div key={device} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{device}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <progress
                            value={Math.round((count / data.totalViews) * 100)}
                            max={100}
                            aria-label={`${device} andel`}
                            className="h-full w-full bar-pct"
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {pageSlug && (
            <a
              href={`/p/${pageSlug}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Åpne publisert side
            </a>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 12. Performance Estimator
// ═══════════════════════════════════════════
interface PerformanceEstimatorProps {
  sections: any[];
  customCss: string;
}

export function PerformanceEstimator({ sections, customCss }: PerformanceEstimatorProps) {
  const [result, setResult] = useState<any>(null);

  const estimate = () => {
    const sectionCount = sections.length;
    const totalImages = sections.reduce((acc, s) => {
      let count = 0;
      if (s.content?.heroImage) count++;
      if (s.content?.images) count += s.content.images.length;
      if (s.content?.logos) count += s.content.logos.length;
      if (s.content?.members) count += s.content.members.filter((m: any) => m.photo).length;
      return acc + count;
    }, 0);

    const totalForms = sections.filter(s =>
      s.content?.fields || s.templateId === 'tidum-contact-form' || s.templateId === 'tidum-newsletter'
    ).length;

    const hasVideo = sections.some(s => s.content?.videoUrl || s.content?.embedUrl);
    const cssSize = (customCss || '').length;

    // Estimate page weight (very rough)
    const baseKB = 45; // Base HTML + Tidum CSS
    const sectionKB = sectionCount * 2;
    const imageKB = totalImages * 80; // avg image estimate
    const videoKB = hasVideo ? 5 : 0; // iframes add small overhead
    const cssKB = cssSize / 1024;
    const totalKB = baseKB + sectionKB + imageKB + videoKB + cssKB;

    // Estimate load time (3G connection ~ 400kB/s)
    const loadTimeFast = totalKB / 2000; // 4G
    const loadTimeSlow = totalKB / 400;  // 3G

    // Score
    let score = 100;
    if (sectionCount > 15) score -= 10;
    if (totalImages > 10) score -= 15;
    if (totalImages > 5 && !sections.some(s => s.content?.heroImage)) score -= 5;
    if (hasVideo) score -= 10;
    if (cssSize > 5000) score -= 5;
    score = Math.max(0, Math.min(100, score));

    setResult({
      sectionCount,
      totalImages,
      totalForms,
      hasVideo,
      totalKB: Math.round(totalKB),
      loadTimeFast: loadTimeFast.toFixed(1),
      loadTimeSlow: loadTimeSlow.toFixed(1),
      score,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Gauge className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Ytelsesestimering</h3>
      </div>

      <Button onClick={estimate} variant="outline" className="w-full text-xs">
        <Gauge className="h-3 w-3 mr-1" />
        Analyser ytelse
      </Button>

      {result && (
        <>
          <div className="text-center p-4 rounded-lg border">
            <div className={`text-3xl font-bold ${result.score >= 80 ? 'text-green-600' : result.score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
              {result.score}/100
            </div>
            <p className="text-xs text-muted-foreground mt-1">Ytelsesscore</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded border text-center">
              <div className="font-bold">{result.sectionCount}</div>
              <div className="text-muted-foreground">Seksjoner</div>
            </div>
            <div className="p-2 rounded border text-center">
              <div className="font-bold">{result.totalImages}</div>
              <div className="text-muted-foreground">Bilder</div>
            </div>
            <div className="p-2 rounded border text-center">
              <div className="font-bold">~{result.totalKB} KB</div>
              <div className="text-muted-foreground">Sidestr.</div>
            </div>
            <div className="p-2 rounded border text-center">
              <div className="font-bold">{result.loadTimeFast}s</div>
              <div className="text-muted-foreground">Lastetid (4G)</div>
            </div>
          </div>

          <div className="space-y-1 text-xs">
            {result.totalImages > 8 && (
              <p className="text-yellow-600">⚠ Mange bilder — vurder lazy loading</p>
            )}
            {result.sectionCount > 12 && (
              <p className="text-yellow-600">⚠ Mange seksjoner — kan påvirke scrollytelse</p>
            )}
            {result.hasVideo && (
              <p className="text-blue-600">ℹ Video iframe — lastes asynkront</p>
            )}
            {result.score >= 80 && (
              <p className="text-green-600">✓ God ytelse — ingen kritiske problemer</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 13. i18n Language Support
// ═══════════════════════════════════════════
interface I18nPanelProps {
  locale: string;
  pageId: number | null;
  pageTitle: string;
  onLocaleChange: (locale: string) => void;
  onCreateTranslation: (locale: string) => void;
}

export function I18nPanel({ locale, pageId, pageTitle, onLocaleChange, onCreateTranslation }: I18nPanelProps) {
  const LOCALES = [
    { code: 'nb', label: '🇳🇴 Norsk Bokmål', flag: '🇳🇴' },
    { code: 'nn', label: '🇳🇴 Norsk Nynorsk', flag: '🇳🇴' },
    { code: 'en', label: '🇬🇧 English', flag: '🇬🇧' },
    { code: 'sv', label: '🇸🇪 Svenska', flag: '🇸🇪' },
    { code: 'da', label: '🇩🇰 Dansk', flag: '🇩🇰' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Languages className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Språk (i18n)</h3>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Sidespråk</Label>
        <Select value={locale} onValueChange={onLocaleChange}>
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map(l => (
              <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pageId && (
        <div className="space-y-2">
          <Label className="text-xs">Opprett oversettelse</Label>
          <div className="grid grid-cols-2 gap-2">
            {LOCALES.filter(l => l.code !== locale).map(l => (
              <Button
                key={l.code}
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => onCreateTranslation(l.code)}
              >
                {l.flag} {l.code.toUpperCase()}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Oppretter en kopi av "{pageTitle}" for oversettelse.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 14. Form Submissions Viewer
// ═══════════════════════════════════════════
interface FormSubmissionsViewerProps {
  pageId: number | null;
}

export function FormSubmissionsViewer({ pageId }: FormSubmissionsViewerProps) {
  const submissionsQuery = useQuery({
    queryKey: ['/api/cms/form-submissions', pageId],
    queryFn: () => fetch(`/api/cms/form-submissions?pageId=${pageId}`).then(r => r.json()),
    enabled: !!pageId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await fetch(`/api/cms/form-submissions/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/form-submissions', pageId] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Skjemainnsendinger</h3>
      </div>

      {!pageId && <p className="text-xs text-muted-foreground italic">Lagre siden for å se innsendinger</p>}

      {submissionsQuery.data?.length === 0 && (
        <div className="flex flex-col items-center py-4 text-muted-foreground">
          <Globe className="h-6 w-6 mb-1 opacity-30" />
          <p className="text-xs italic">Ingen innsendinger ennå</p>
        </div>
      )}

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {submissionsQuery.data?.map((sub: any) => (
          <Card key={sub.id} className="border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Badge variant={sub.status === 'new' ? 'default' : 'secondary'} className="text-[10px]">
                  {sub.status === 'new' ? '🔵 Ny' : sub.status === 'read' ? '👁️ Lest' : sub.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(sub.createdAt).toLocaleString('nb-NO')}
                </span>
              </div>
              {sub.data && typeof sub.data === 'object' && Object.entries(sub.data).map(([key, val]) => (
                <div key={key} className="text-xs mb-1">
                  <span className="font-medium capitalize">{key}: </span>
                  <span className="text-muted-foreground">{String(val)}</span>
                </div>
              ))}
              {sub.status === 'new' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs mt-2 h-6"
                  onClick={() => updateStatus.mutate({ id: sub.id, status: 'read' })}
                >
                  Marker som lest
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
