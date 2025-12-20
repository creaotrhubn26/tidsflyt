import { useState, createContext, useContext, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  ChevronRight, ChevronDown, Eye, EyeOff, Minus, Plus, Monitor, Tablet, Smartphone,
  Save, ExternalLink, Loader2, ArrowLeft, Type, Image, Box, Layers, 
  LayoutTemplate, Star, Users, Zap, MessageSquare, Building2, Phone, Mail,
  Home, Sparkles, Clock, Shield, TrendingUp, CheckCircle, Heart, Calendar,
  Globe, MapPin, Send, Rocket, Award, Target, Briefcase, Settings, Grid3X3,
  Undo2, Redo2, Palette, AlignLeft, AlignCenter, AlignRight, Bold, Italic,
  Search, FileText, Link2, ImageIcon, Trash2, Copy, GripVertical, PlusCircle,
  type LucideIcon
} from "lucide-react";

const cmsIconMap: Record<string, LucideIcon> = {
  Star, Users, Zap, MessageSquare, Building2, Phone, Mail, Home, Sparkles, Clock,
  Shield, TrendingUp, CheckCircle, Heart, Calendar, Globe, MapPin, Send, Rocket,
  Award, Target, Briefcase, Settings, FileText, BarChart3: TrendingUp
};

function getAdminToken(): string | null {
  return sessionStorage.getItem('cms_admin_token');
}

async function authenticatedApiRequest(url: string, options: { method?: string; body?: string } = {}) {
  const token = getAdminToken();
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: options.body,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

interface LandingHero {
  id: number;
  title: string;
  title_highlight: string | null;
  subtitle: string | null;
  cta_primary_text: string | null;
  cta_primary_url: string | null;
  cta_secondary_text: string | null;
  cta_secondary_url: string | null;
  background_image: string | null;
}

interface LandingFeature {
  id: number;
  icon: string;
  title: string;
  description: string;
  display_order: number;
  is_active: boolean;
}

interface LandingTestimonial {
  id: number;
  quote: string;
  name: string;
  role: string;
  avatar_url: string | null;
  display_order: number;
  is_active: boolean;
}

interface LandingPartner {
  id: number;
  name: string;
  logo_url: string;
  website_url: string | null;
  display_order: number;
  is_active: boolean;
}

interface LandingSections {
  id?: number;
  features_title: string | null;
  features_subtitle: string | null;
  testimonials_title: string | null;
  testimonials_subtitle: string | null;
  cta_title: string | null;
  cta_subtitle: string | null;
  cta_button_text: string | null;
  contact_title: string | null;
  contact_subtitle: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  partners_title: string | null;
  partners_subtitle: string | null;
}

interface LandingContent {
  hero: LandingHero | null;
  features: LandingFeature[];
  testimonials: LandingTestimonial[];
  partners: LandingPartner[];
  sections: LandingSections | null;
}

type ElementType = 'hero' | 'features' | 'feature' | 'testimonials' | 'testimonial' | 'partners' | 'partner' | 'cta' | 'contact' | 'sections';

interface SelectedElement {
  type: ElementType;
  id?: number;
  data?: any;
}

interface HistoryEntry {
  element: SelectedElement;
  data: any;
  timestamp: number;
}

interface BuilderContextType {
  selectedElement: SelectedElement | null;
  setSelectedElement: (element: SelectedElement | null) => void;
  content: LandingContent | null;
  deviceMode: 'desktop' | 'tablet' | 'mobile';
  setDeviceMode: (mode: 'desktop' | 'tablet' | 'mobile') => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  isSaving: boolean;
  hasChanges: boolean;
  setHasChanges: (has: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  pushHistory: (entry: HistoryEntry) => void;
  publishStatus: 'draft' | 'published' | 'modified';
  setPublishStatus: (status: 'draft' | 'published' | 'modified') => void;
}

const BuilderContext = createContext<BuilderContextType | null>(null);

function useBuilder() {
  const context = useContext(BuilderContext);
  if (!context) throw new Error('useBuilder must be used within BuilderProvider');
  return context;
}

const sectionTemplates = [
  { id: 'hero-centered', name: 'Hero - Sentrert', icon: Home, category: 'hero' },
  { id: 'hero-split', name: 'Hero - Delt', icon: Home, category: 'hero' },
  { id: 'features-grid', name: 'Funksjoner - Rutenett', icon: Grid3X3, category: 'features' },
  { id: 'features-list', name: 'Funksjoner - Liste', icon: Layers, category: 'features' },
  { id: 'testimonials-carousel', name: 'Referanser - Karusell', icon: MessageSquare, category: 'testimonials' },
  { id: 'testimonials-grid', name: 'Referanser - Rutenett', icon: MessageSquare, category: 'testimonials' },
  { id: 'partners-logos', name: 'Partnere - Logoer', icon: Building2, category: 'partners' },
  { id: 'cta-simple', name: 'CTA - Enkel', icon: Rocket, category: 'cta' },
  { id: 'cta-featured', name: 'CTA - Fremhevet', icon: Rocket, category: 'cta' },
  { id: 'contact-form', name: 'Kontakt - Skjema', icon: Phone, category: 'contact' },
];

const colorPresets = [
  { name: 'Primær', value: 'hsl(var(--primary))' },
  { name: 'Sekundær', value: 'hsl(var(--secondary))' },
  { name: 'Aksent', value: 'hsl(var(--accent))' },
  { name: 'Bakgrunn', value: 'hsl(var(--background))' },
  { name: 'Muted', value: 'hsl(var(--muted))' },
];

const fontSizes = [
  { label: 'XS', value: '0.75rem' },
  { label: 'SM', value: '0.875rem' },
  { label: 'Base', value: '1rem' },
  { label: 'LG', value: '1.125rem' },
  { label: 'XL', value: '1.25rem' },
  { label: '2XL', value: '1.5rem' },
  { label: '3XL', value: '1.875rem' },
  { label: '4XL', value: '2.25rem' },
];

const spacingValues = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

interface LayerItemProps {
  label: string;
  icon: LucideIcon;
  type: ElementType;
  id?: number;
  isVisible?: boolean;
  children?: React.ReactNode;
  depth?: number;
}

function LayerItem({ label, icon: Icon, type, id, isVisible = true, children, depth = 0 }: LayerItemProps) {
  const { selectedElement, setSelectedElement } = useBuilder();
  const [isOpen, setIsOpen] = useState(true);
  const isSelected = selectedElement?.type === type && (id === undefined || selectedElement?.id === id);
  const hasChildren = !!children;

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded-md transition-colors ${
          isSelected ? 'bg-primary/10 text-primary' : 'hover-elevate'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => setSelectedElement({ type, id })}
        data-testid={`layer-${type}${id ? `-${id}` : ''}`}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
            className="p-0.5 -ml-1"
          >
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm truncate flex-1">{label}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isVisible ? (
            <Eye className="h-3.5 w-3.5 text-muted-foreground/50" />
          ) : (
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground/30" />
          )}
        </div>
      </div>
      {hasChildren && isOpen && (
        <div>{children}</div>
      )}
    </div>
  );
}

function LayerPanel() {
  const { content } = useBuilder();
  const [activeTab, setActiveTab] = useState<'layers' | 'templates'>('layers');
  const { toast } = useToast();

  const handleAddTemplate = (template: typeof sectionTemplates[0]) => {
    toast({
      title: "Mal lagt til",
      description: `${template.name} er lagt til på siden.`,
    });
  };

  return (
    <div className="h-full flex flex-col bg-sidebar border-r">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'layers' | 'templates')} className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b bg-transparent h-10 p-0">
          <TabsTrigger value="templates" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs">
            Maler
          </TabsTrigger>
          <TabsTrigger value="layers" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs">
            Lag
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="templates" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-4">
              <p className="text-xs text-muted-foreground">Klikk for å legge til seksjoner</p>
              
              {['hero', 'features', 'testimonials', 'partners', 'cta', 'contact'].map((category) => (
                <div key={category} className="space-y-2">
                  <h4 className="text-xs font-medium uppercase text-muted-foreground">
                    {category === 'hero' ? 'Hero' :
                     category === 'features' ? 'Funksjoner' :
                     category === 'testimonials' ? 'Referanser' :
                     category === 'partners' ? 'Partnere' :
                     category === 'cta' ? 'CTA' : 'Kontakt'}
                  </h4>
                  <div className="grid gap-1.5">
                    {sectionTemplates
                      .filter(t => t.category === category)
                      .map((template) => (
                        <div
                          key={template.id}
                          className="flex items-center gap-2 p-2 border rounded-md hover-elevate cursor-pointer text-sm"
                          onClick={() => handleAddTemplate(template)}
                          data-testid={`template-${template.id}`}
                        >
                          <template.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{template.name}</span>
                          <PlusCircle className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="layers" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-2">
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center gap-1 w-full p-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <ChevronDown className="h-3 w-3" />
                  Landingsside
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 space-y-0.5">
                  <LayerItem label="Hero" icon={Home} type="hero" />
                  
                  <LayerItem label="Funksjoner" icon={Zap} type="features">
                    {content?.features?.map((f) => (
                      <LayerItem
                        key={f.id}
                        label={f.title}
                        icon={cmsIconMap[f.icon] || Star}
                        type="feature"
                        id={f.id}
                        isVisible={f.is_active}
                        depth={1}
                      />
                    ))}
                  </LayerItem>

                  <LayerItem label="Referanser" icon={MessageSquare} type="testimonials">
                    {content?.testimonials?.map((t) => (
                      <LayerItem
                        key={t.id}
                        label={t.name}
                        icon={Users}
                        type="testimonial"
                        id={t.id}
                        isVisible={t.is_active}
                        depth={1}
                      />
                    ))}
                  </LayerItem>

                  <LayerItem label="Partnere" icon={Building2} type="partners">
                    {content?.partners?.map((p) => (
                      <LayerItem
                        key={p.id}
                        label={p.name}
                        icon={Building2}
                        type="partner"
                        id={p.id}
                        isVisible={p.is_active}
                        depth={1}
                      />
                    ))}
                  </LayerItem>

                  <LayerItem label="CTA" icon={Rocket} type="cta" />
                  <LayerItem label="Kontakt" icon={Phone} type="contact" />
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreviewPanel() {
  const { deviceMode, zoom, selectedElement, setSelectedElement, content } = useBuilder();

  const deviceStyles = {
    desktop: 'w-full',
    tablet: 'w-[768px]',
    mobile: 'w-[375px]',
  };

  return (
    <div className="h-full flex flex-col bg-muted/30">
      <div className="flex-1 overflow-auto p-4 flex justify-center">
        <div 
          className={`bg-background shadow-lg rounded-lg overflow-hidden transition-all ${deviceStyles[deviceMode]}`}
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
        >
          <div className="relative">
            <div
              className={`p-8 min-h-[400px] cursor-pointer transition-all ${
                selectedElement?.type === 'hero' ? 'ring-2 ring-primary ring-offset-2' : ''
              }`}
              onClick={() => setSelectedElement({ type: 'hero' })}
              data-testid="preview-hero"
            >
              <div className="max-w-4xl mx-auto text-center space-y-4">
                <h1 className="text-4xl font-bold">
                  {content?.hero?.title || 'Tittel'}{' '}
                  <span className="text-primary">{content?.hero?.title_highlight || ''}</span>
                </h1>
                <p className="text-xl text-muted-foreground">{content?.hero?.subtitle || 'Undertittel'}</p>
                <div className="flex gap-3 justify-center">
                  <Button>{content?.hero?.cta_primary_text || 'Primær CTA'}</Button>
                  <Button variant="outline">{content?.hero?.cta_secondary_text || 'Sekundær'}</Button>
                </div>
              </div>
            </div>

            <div
              className={`p-8 bg-muted/50 cursor-pointer transition-all ${
                selectedElement?.type === 'features' ? 'ring-2 ring-primary ring-offset-2' : ''
              }`}
              onClick={() => setSelectedElement({ type: 'features' })}
              data-testid="preview-features"
            >
              <div className="max-w-4xl mx-auto">
                <h2 className="text-2xl font-bold text-center mb-6">{content?.sections?.features_title || 'Funksjoner'}</h2>
                <div className="grid grid-cols-3 gap-4">
                  {(content?.features || []).slice(0, 6).map((f) => {
                    const Icon = cmsIconMap[f.icon] || Star;
                    return (
                      <div
                        key={f.id}
                        className={`p-4 rounded-lg bg-background cursor-pointer transition-all ${
                          selectedElement?.type === 'feature' && selectedElement?.id === f.id
                            ? 'ring-2 ring-primary'
                            : 'hover:ring-1 hover:ring-muted-foreground/30'
                        }`}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement({ type: 'feature', id: f.id }); }}
                      >
                        <Icon className="h-8 w-8 text-primary mb-2" />
                        <h3 className="font-semibold">{f.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">{f.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div
              className={`p-8 cursor-pointer transition-all ${
                selectedElement?.type === 'testimonials' ? 'ring-2 ring-primary ring-offset-2' : ''
              }`}
              onClick={() => setSelectedElement({ type: 'testimonials' })}
              data-testid="preview-testimonials"
            >
              <div className="max-w-4xl mx-auto">
                <h2 className="text-2xl font-bold text-center mb-6">{content?.sections?.testimonials_title || 'Referanser'}</h2>
                <div className="grid grid-cols-2 gap-4">
                  {(content?.testimonials || []).slice(0, 4).map((t) => (
                    <div
                      key={t.id}
                      className={`p-4 rounded-lg bg-muted cursor-pointer transition-all ${
                        selectedElement?.type === 'testimonial' && selectedElement?.id === t.id
                          ? 'ring-2 ring-primary'
                          : 'hover:ring-1 hover:ring-muted-foreground/30'
                      }`}
                      onClick={(e) => { e.stopPropagation(); setSelectedElement({ type: 'testimonial', id: t.id }); }}
                    >
                      <p className="text-sm italic mb-2">"{t.quote}"</p>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {(content?.partners?.length || 0) > 0 && (
              <div
                className={`p-8 bg-muted/50 cursor-pointer transition-all ${
                  selectedElement?.type === 'partners' ? 'ring-2 ring-primary ring-offset-2' : ''
                }`}
                onClick={() => setSelectedElement({ type: 'partners' })}
                data-testid="preview-partners"
              >
                <div className="max-w-4xl mx-auto text-center">
                  <h2 className="text-2xl font-bold mb-6">{content?.sections?.partners_title || 'Partnere'}</h2>
                  <div className="flex justify-center gap-8 flex-wrap">
                    {content?.partners?.map((p) => (
                      <div
                        key={p.id}
                        className={`cursor-pointer transition-all ${
                          selectedElement?.type === 'partner' && selectedElement?.id === p.id
                            ? 'ring-2 ring-primary ring-offset-2 rounded'
                            : ''
                        }`}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement({ type: 'partner', id: p.id }); }}
                      >
                        <img src={p.logo_url} alt={p.name} className="h-12 object-contain" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div
              className={`p-8 bg-primary text-primary-foreground cursor-pointer transition-all ${
                selectedElement?.type === 'cta' ? 'ring-2 ring-white ring-offset-2 ring-offset-primary' : ''
              }`}
              onClick={() => setSelectedElement({ type: 'cta' })}
              data-testid="preview-cta"
            >
              <div className="max-w-2xl mx-auto text-center">
                <h2 className="text-2xl font-bold mb-2">{content?.sections?.cta_title || 'CTA Tittel'}</h2>
                <p className="mb-4">{content?.sections?.cta_subtitle || 'CTA undertekst'}</p>
                <Button variant="secondary">{content?.sections?.cta_button_text || 'Handling'}</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StylePanel() {
  const [spacing, setSpacing] = useState({ top: 16, right: 16, bottom: 16, left: 16 });
  const [fontSize, setFontSize] = useState('1rem');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
  const [bgColor, setBgColor] = useState('transparent');

  return (
    <div className="space-y-4">
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium">
          <ChevronDown className="h-3 w-3" />
          <Palette className="h-4 w-4" />
          Fyll
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label className="text-xs">Bakgrunnsfarge</Label>
            <div className="flex gap-2 flex-wrap">
              {colorPresets.map((color) => (
                <button
                  key={color.name}
                  className={`w-6 h-6 rounded border-2 ${bgColor === color.value ? 'border-primary' : 'border-transparent'}`}
                  style={{ backgroundColor: color.value }}
                  onClick={() => setBgColor(color.value)}
                  title={color.name}
                  data-testid={`color-${color.name.toLowerCase()}`}
                />
              ))}
              <Input
                type="color"
                className="w-6 h-6 p-0 border-0"
                data-testid="color-custom"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Gjennomsiktighet</Label>
            <Slider defaultValue={[100]} max={100} step={1} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium">
          <ChevronDown className="h-3 w-3" />
          <Type className="h-4 w-4" />
          Typografi
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label className="text-xs">Skriftstørrelse</Label>
            <Select value={fontSize} onValueChange={setFontSize}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fontSizes.map((size) => (
                  <SelectItem key={size.value} value={size.value}>
                    {size.label} ({size.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Tekstjustering</Label>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={textAlign === 'left' ? 'secondary' : 'ghost'}
                className="h-8 w-8 p-0"
                onClick={() => setTextAlign('left')}
              >
                <AlignLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={textAlign === 'center' ? 'secondary' : 'ghost'}
                className="h-8 w-8 p-0"
                onClick={() => setTextAlign('center')}
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={textAlign === 'right' ? 'secondary' : 'ghost'}
                className="h-8 w-8 p-0"
                onClick={() => setTextAlign('right')}
              >
                <AlignRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <Bold className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <Italic className="h-4 w-4" />
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium">
          <ChevronDown className="h-3 w-3" />
          <Box className="h-4 w-4" />
          Avstand
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Topp</Label>
              <Input
                type="number"
                value={spacing.top}
                onChange={(e) => setSpacing({ ...spacing, top: parseInt(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Høyre</Label>
              <Input
                type="number"
                value={spacing.right}
                onChange={(e) => setSpacing({ ...spacing, right: parseInt(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bunn</Label>
              <Input
                type="number"
                value={spacing.bottom}
                onChange={(e) => setSpacing({ ...spacing, bottom: parseInt(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Venstre</Label>
              <Input
                type="number"
                value={spacing.left}
                onChange={(e) => setSpacing({ ...spacing, left: parseInt(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SEOPanel() {
  const [seoData, setSeoData] = useState({
    title: 'Tidsflyt - Enkel Timeføring for Norske Bedrifter',
    description: 'Effektiv og brukervennlig timeregistrering for konsulenter, prosjektteam og bedrifter.',
    keywords: 'timeføring, timeregistrering, prosjektstyring, norge',
    ogTitle: '',
    ogDescription: '',
    ogImage: '',
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs font-medium">Sidetittel</Label>
        <Input
          value={seoData.title}
          onChange={(e) => setSeoData({ ...seoData, title: e.target.value })}
          placeholder="Sidetittel"
          data-testid="seo-title"
        />
        <p className="text-xs text-muted-foreground">{seoData.title.length}/60 tegn</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">Meta-beskrivelse</Label>
        <Textarea
          value={seoData.description}
          onChange={(e) => setSeoData({ ...seoData, description: e.target.value })}
          placeholder="Beskrivelse for søkemotorer"
          rows={3}
          data-testid="seo-description"
        />
        <p className="text-xs text-muted-foreground">{seoData.description.length}/160 tegn</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">Nøkkelord</Label>
        <Input
          value={seoData.keywords}
          onChange={(e) => setSeoData({ ...seoData, keywords: e.target.value })}
          placeholder="Kommaseparerte nøkkelord"
          data-testid="seo-keywords"
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Open Graph (Sosiale medier)
        </h4>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">OG Tittel</Label>
        <Input
          value={seoData.ogTitle}
          onChange={(e) => setSeoData({ ...seoData, ogTitle: e.target.value })}
          placeholder="Tittel for sosiale medier"
          data-testid="seo-og-title"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">OG Beskrivelse</Label>
        <Textarea
          value={seoData.ogDescription}
          onChange={(e) => setSeoData({ ...seoData, ogDescription: e.target.value })}
          placeholder="Beskrivelse for sosiale medier"
          rows={2}
          data-testid="seo-og-description"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">OG Bilde URL</Label>
        <Input
          value={seoData.ogImage}
          onChange={(e) => setSeoData({ ...seoData, ogImage: e.target.value })}
          placeholder="https://example.com/image.jpg"
          data-testid="seo-og-image"
        />
      </div>

      <div className="pt-2">
        <Button variant="outline" className="w-full" size="sm" data-testid="button-seo-preview">
          <Search className="h-4 w-4 mr-2" />
          Forhåndsvis i Google
        </Button>
      </div>
    </div>
  );
}

function PropertiesPanel() {
  const { selectedElement, content, setHasChanges, pushHistory } = useBuilder();
  const { toast } = useToast();
  const [localData, setLocalData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'content' | 'style' | 'seo'>('content');

  useEffect(() => {
    if (!selectedElement) {
      setLocalData(null);
      return;
    }

    switch (selectedElement.type) {
      case 'hero':
        setLocalData(content?.hero || {});
        break;
      case 'feature':
        setLocalData(content?.features?.find(f => f.id === selectedElement.id) || {});
        break;
      case 'testimonial':
        setLocalData(content?.testimonials?.find(t => t.id === selectedElement.id) || {});
        break;
      case 'partner':
        setLocalData(content?.partners?.find(p => p.id === selectedElement.id) || {});
        break;
      case 'features':
      case 'testimonials':
      case 'partners':
      case 'cta':
      case 'contact':
        setLocalData(content?.sections || {});
        break;
      default:
        setLocalData(null);
    }
  }, [selectedElement, content]);

  const updateHero = useMutation({
    mutationFn: (data: any) => authenticatedApiRequest('/api/cms/hero', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Lagret", description: "Hero er oppdatert." });
      setHasChanges(false);
    },
  });

  const updateFeature = useMutation({
    mutationFn: ({ id, ...data }: any) => authenticatedApiRequest(`/api/cms/features/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Lagret", description: "Funksjon er oppdatert." });
      setHasChanges(false);
    },
  });

  const updateTestimonial = useMutation({
    mutationFn: ({ id, ...data }: any) => authenticatedApiRequest(`/api/cms/testimonials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Lagret", description: "Referanse er oppdatert." });
      setHasChanges(false);
    },
  });

  const updatePartner = useMutation({
    mutationFn: ({ id, ...data }: any) => authenticatedApiRequest(`/api/cms/partners/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Lagret", description: "Partner er oppdatert." });
      setHasChanges(false);
    },
  });

  const updateSections = useMutation({
    mutationFn: (data: any) => authenticatedApiRequest('/api/cms/sections', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Lagret", description: "Seksjon er oppdatert." });
      setHasChanges(false);
    },
  });

  const handleChange = (field: string, value: any) => {
    const oldData = { ...localData };
    setLocalData((prev: any) => ({ ...prev, [field]: value }));
    setHasChanges(true);
    
    if (selectedElement) {
      pushHistory({
        element: selectedElement,
        data: oldData,
        timestamp: Date.now(),
      });
    }
  };

  const handleSave = () => {
    if (!selectedElement || !localData) return;

    switch (selectedElement.type) {
      case 'hero':
        updateHero.mutate(localData);
        break;
      case 'feature':
        updateFeature.mutate({ id: selectedElement.id, ...localData });
        break;
      case 'testimonial':
        updateTestimonial.mutate({ id: selectedElement.id, ...localData });
        break;
      case 'partner':
        updatePartner.mutate({ id: selectedElement.id, ...localData });
        break;
      case 'features':
      case 'testimonials':
      case 'partners':
      case 'cta':
      case 'contact':
        updateSections.mutate(localData);
        break;
    }
  };

  const isPending = updateHero.isPending || updateFeature.isPending || updateTestimonial.isPending || updatePartner.isPending || updateSections.isPending;

  if (!selectedElement) {
    return (
      <div className="h-full border-l bg-sidebar p-4 flex items-center justify-center text-muted-foreground text-sm text-center">
        <div>
          <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Velg et element<br />for å redigere
        </div>
      </div>
    );
  }

  const renderContentProperties = () => {
    switch (selectedElement.type) {
      case 'hero':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Tittel</Label>
              <Input
                value={localData?.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                data-testid="prop-hero-title"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Fremhevet tekst</Label>
              <Input
                value={localData?.title_highlight || ''}
                onChange={(e) => handleChange('title_highlight', e.target.value)}
                data-testid="prop-hero-highlight"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Undertekst</Label>
              <Textarea
                value={localData?.subtitle || ''}
                onChange={(e) => handleChange('subtitle', e.target.value)}
                rows={3}
                data-testid="prop-hero-subtitle"
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs">Primær CTA tekst</Label>
              <Input
                value={localData?.cta_primary_text || ''}
                onChange={(e) => handleChange('cta_primary_text', e.target.value)}
                data-testid="prop-hero-cta-primary"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Primær CTA lenke</Label>
              <Input
                value={localData?.cta_primary_url || ''}
                onChange={(e) => handleChange('cta_primary_url', e.target.value)}
                data-testid="prop-hero-cta-url"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Sekundær CTA tekst</Label>
              <Input
                value={localData?.cta_secondary_text || ''}
                onChange={(e) => handleChange('cta_secondary_text', e.target.value)}
                data-testid="prop-hero-cta-secondary"
              />
            </div>
          </div>
        );
      case 'feature':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Tittel</Label>
              <Input
                value={localData?.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                data-testid="prop-feature-title"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Beskrivelse</Label>
              <Textarea
                value={localData?.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
                data-testid="prop-feature-description"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Ikon</Label>
              <Select value={localData?.icon || ''} onValueChange={(v) => handleChange('icon', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg ikon" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(cmsIconMap).map((iconName) => (
                    <SelectItem key={iconName} value={iconName}>{iconName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Aktiv</Label>
              <Switch
                checked={localData?.is_active ?? true}
                onCheckedChange={(v) => handleChange('is_active', v)}
              />
            </div>
          </div>
        );
      case 'testimonial':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Sitat</Label>
              <Textarea
                value={localData?.quote || ''}
                onChange={(e) => handleChange('quote', e.target.value)}
                rows={4}
                data-testid="prop-testimonial-quote"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Navn</Label>
              <Input
                value={localData?.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                data-testid="prop-testimonial-name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Rolle/Stilling</Label>
              <Input
                value={localData?.role || ''}
                onChange={(e) => handleChange('role', e.target.value)}
                data-testid="prop-testimonial-role"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Avatar URL</Label>
              <Input
                value={localData?.avatar_url || ''}
                onChange={(e) => handleChange('avatar_url', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        );
      case 'partner':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Navn</Label>
              <Input
                value={localData?.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                data-testid="prop-partner-name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Logo URL</Label>
              <Input
                value={localData?.logo_url || ''}
                onChange={(e) => handleChange('logo_url', e.target.value)}
                data-testid="prop-partner-logo"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Nettside URL</Label>
              <Input
                value={localData?.website_url || ''}
                onChange={(e) => handleChange('website_url', e.target.value)}
                data-testid="prop-partner-website"
              />
            </div>
          </div>
        );
      case 'features':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Seksjonstittel</Label>
              <Input
                value={localData?.features_title || ''}
                onChange={(e) => handleChange('features_title', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Undertekst</Label>
              <Textarea
                value={localData?.features_subtitle || ''}
                onChange={(e) => handleChange('features_subtitle', e.target.value)}
                rows={2}
              />
            </div>
          </div>
        );
      case 'testimonials':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Seksjonstittel</Label>
              <Input
                value={localData?.testimonials_title || ''}
                onChange={(e) => handleChange('testimonials_title', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Undertekst</Label>
              <Textarea
                value={localData?.testimonials_subtitle || ''}
                onChange={(e) => handleChange('testimonials_subtitle', e.target.value)}
                rows={2}
              />
            </div>
          </div>
        );
      case 'partners':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Seksjonstittel</Label>
              <Input
                value={localData?.partners_title || ''}
                onChange={(e) => handleChange('partners_title', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Undertekst</Label>
              <Textarea
                value={localData?.partners_subtitle || ''}
                onChange={(e) => handleChange('partners_subtitle', e.target.value)}
                rows={2}
              />
            </div>
          </div>
        );
      case 'cta':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">CTA Tittel</Label>
              <Input
                value={localData?.cta_title || ''}
                onChange={(e) => handleChange('cta_title', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">CTA Undertekst</Label>
              <Textarea
                value={localData?.cta_subtitle || ''}
                onChange={(e) => handleChange('cta_subtitle', e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Knappetekst</Label>
              <Input
                value={localData?.cta_button_text || ''}
                onChange={(e) => handleChange('cta_button_text', e.target.value)}
              />
            </div>
          </div>
        );
      case 'contact':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Kontakt Tittel</Label>
              <Input
                value={localData?.contact_title || ''}
                onChange={(e) => handleChange('contact_title', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">E-post</Label>
              <Input
                value={localData?.contact_email || ''}
                onChange={(e) => handleChange('contact_email', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Telefon</Label>
              <Input
                value={localData?.contact_phone || ''}
                onChange={(e) => handleChange('contact_phone', e.target.value)}
              />
            </div>
          </div>
        );
      default:
        return <p className="text-muted-foreground text-sm">Velg et element</p>;
    }
  };

  const getElementTitle = () => {
    switch (selectedElement.type) {
      case 'hero': return 'Hero';
      case 'feature': return `Funksjon`;
      case 'features': return 'Funksjoner';
      case 'testimonial': return `Referanse`;
      case 'testimonials': return 'Referanser';
      case 'partner': return `Partner`;
      case 'partners': return 'Partnere';
      case 'cta': return 'CTA';
      case 'contact': return 'Kontakt';
      default: return 'Element';
    }
  };

  return (
    <div className="h-full border-l bg-sidebar flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'content' | 'style' | 'seo')} className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b bg-transparent h-10 p-0">
          <TabsTrigger value="content" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs">
            Innhold
          </TabsTrigger>
          <TabsTrigger value="style" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs">
            Stil
          </TabsTrigger>
          <TabsTrigger value="seo" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs">
            SEO
          </TabsTrigger>
        </TabsList>

        <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
          <h3 className="font-medium text-sm truncate">{getElementTitle()}</h3>
          <Badge variant="secondary" className="text-xs">{selectedElement.id ? `#${selectedElement.id}` : 'Seksjon'}</Badge>
        </div>

        <TabsContent value="content" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              {renderContentProperties()}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="style" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              <StylePanel />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="seo" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              <SEOPanel />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="p-3 border-t space-y-2">
        <Button 
          className="w-full" 
          onClick={handleSave} 
          disabled={isPending}
          data-testid="button-save-properties"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Lagre endringer
        </Button>
      </div>
    </div>
  );
}

function Toolbar() {
  const { deviceMode, setDeviceMode, zoom, setZoom, hasChanges, undo, redo, canUndo, canRedo, publishStatus } = useBuilder();
  const { toast } = useToast();

  const handlePublish = () => {
    toast({
      title: "Publisert",
      description: "Endringene er nå publisert.",
    });
  };

  return (
    <div className="h-12 border-b bg-background flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">Landingsside</span>
        {hasChanges && (
          <Badge variant="secondary" className="text-xs">Ulagret</Badge>
        )}
        {publishStatus === 'modified' && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">Endret</Badge>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={undo}
          disabled={!canUndo}
          title="Angre (Cmd+Z)"
          data-testid="button-undo"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={redo}
          disabled={!canRedo}
          title="Gjør om (Cmd+Shift+Z)"
          data-testid="button-redo"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setZoom(Math.max(25, zoom - 25))}
          data-testid="button-zoom-out"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="text-sm w-12 text-center">{zoom}%</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setZoom(Math.min(200, zoom + 25))}
          data-testid="button-zoom-in"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1 border rounded-md p-1">
        <Button
          variant={deviceMode === 'desktop' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={() => setDeviceMode('desktop')}
          data-testid="button-device-desktop"
        >
          <Monitor className="h-4 w-4" />
        </Button>
        <Button
          variant={deviceMode === 'tablet' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={() => setDeviceMode('tablet')}
          data-testid="button-device-tablet"
        >
          <Tablet className="h-4 w-4" />
        </Button>
        <Button
          variant={deviceMode === 'mobile' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={() => setDeviceMode('mobile')}
          data-testid="button-device-mobile"
        >
          <Smartphone className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => window.open('/', '_blank')} data-testid="button-preview-site">
          <Eye className="h-4 w-4 mr-1" />
          Forhåndsvis
        </Button>
        <Button size="sm" onClick={handlePublish} data-testid="button-publish">
          Publiser
        </Button>
      </div>
    </div>
  );
}

interface VisualBuilderProps {
  onLogout: () => void;
}

export function VisualBuilder({ onLogout }: VisualBuilderProps) {
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [zoom, setZoom] = useState(100);
  const [hasChanges, setHasChanges] = useState(false);
  const [publishStatus, setPublishStatus] = useState<'draft' | 'published' | 'modified'>('published');
  
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const { data: content, isLoading } = useQuery<LandingContent>({
    queryKey: ['/api/cms/landing'],
  });

  const pushHistory = useCallback((entry: HistoryEntry) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, entry].slice(-50);
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex >= 0) {
      setHistoryIndex(prev => prev - 1);
    }
  }, [historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
    }
  }, [historyIndex, history.length]);

  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const saveButton = document.querySelector('[data-testid="button-save-properties"]') as HTMLButtonElement;
        if (saveButton) saveButton.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <BuilderContext.Provider
      value={{
        selectedElement,
        setSelectedElement,
        content: content || null,
        deviceMode,
        setDeviceMode,
        zoom,
        setZoom,
        isSaving: false,
        hasChanges,
        setHasChanges,
        undo,
        redo,
        canUndo,
        canRedo,
        pushHistory,
        publishStatus,
        setPublishStatus,
      }}
    >
      <div className="h-screen flex flex-col">
        <Toolbar />
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={18} minSize={15} maxSize={25}>
            <LayerPanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={57}>
            <PreviewPanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
            <PropertiesPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </BuilderContext.Provider>
  );
}
