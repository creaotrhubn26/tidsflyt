import { useState, createContext, useContext, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { 
  ChevronRight, ChevronDown, Eye, EyeOff, Minus, Plus, Monitor, Tablet, Smartphone,
  Save, ExternalLink, Loader2, ArrowLeft, Type, Image, Box, Layers, 
  LayoutTemplate, Star, Users, Zap, MessageSquare, Building2, Phone, Mail,
  Home, Sparkles, Clock, Shield, TrendingUp, CheckCircle, Heart, Calendar,
  Globe, MapPin, Send, Rocket, Award, Target, Briefcase, Settings, Grid3X3,
  type LucideIcon
} from "lucide-react";

const cmsIconMap: Record<string, LucideIcon> = {
  Star, Users, Zap, MessageSquare, Building2, Phone, Mail, Home, Sparkles, Clock,
  Shield, TrendingUp, CheckCircle, Heart, Calendar, Globe, MapPin, Send, Rocket,
  Award, Target, Briefcase, Settings
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
}

const BuilderContext = createContext<BuilderContextType | null>(null);

function useBuilder() {
  const context = useContext(BuilderContext);
  if (!context) throw new Error('useBuilder must be used within BuilderProvider');
  return context;
}

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
        {isVisible ? (
          <Eye className="h-3.5 w-3.5 text-muted-foreground/50" />
        ) : (
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground/30" />
        )}
      </div>
      {hasChildren && isOpen && (
        <div>{children}</div>
      )}
    </div>
  );
}

function LayerPanel() {
  const { content } = useBuilder();
  const [templatesTab, setTemplatesTab] = useState<'layers' | 'templates'>('layers');

  return (
    <div className="h-full flex flex-col bg-sidebar border-r">
      <Tabs value={templatesTab} onValueChange={(v) => setTemplatesTab(v as 'layers' | 'templates')} className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b bg-transparent h-10 p-0">
          <TabsTrigger value="templates" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
            Maler
          </TabsTrigger>
          <TabsTrigger value="layers" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
            Lag
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="templates" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Dra for å legge til seksjoner</p>
              <div className="grid gap-2">
                {[
                  { icon: Home, label: "Hero" },
                  { icon: Grid3X3, label: "Funksjoner" },
                  { icon: MessageSquare, label: "Referanser" },
                  { icon: Building2, label: "Partnere" },
                  { icon: Phone, label: "Kontakt" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-2 p-2 border rounded-md hover-elevate cursor-grab"
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{item.label}</span>
                  </div>
                ))}
              </div>
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

function PropertiesPanel() {
  const { selectedElement, content, setHasChanges } = useBuilder();
  const { toast } = useToast();
  const [localData, setLocalData] = useState<any>(null);

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
    setLocalData((prev: any) => ({ ...prev, [field]: value }));
    setHasChanges(true);
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
      <div className="h-full border-l bg-sidebar p-4 flex items-center justify-center text-muted-foreground text-sm">
        Velg et element for å redigere
      </div>
    );
  }

  const renderHeroProperties = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tittel</Label>
        <Input
          value={localData?.title || ''}
          onChange={(e) => handleChange('title', e.target.value)}
          data-testid="prop-hero-title"
        />
      </div>
      <div className="space-y-2">
        <Label>Fremhevet tekst</Label>
        <Input
          value={localData?.title_highlight || ''}
          onChange={(e) => handleChange('title_highlight', e.target.value)}
          data-testid="prop-hero-highlight"
        />
      </div>
      <div className="space-y-2">
        <Label>Undertekst</Label>
        <Textarea
          value={localData?.subtitle || ''}
          onChange={(e) => handleChange('subtitle', e.target.value)}
          data-testid="prop-hero-subtitle"
        />
      </div>
      <div className="space-y-2">
        <Label>Primær CTA tekst</Label>
        <Input
          value={localData?.cta_primary_text || ''}
          onChange={(e) => handleChange('cta_primary_text', e.target.value)}
          data-testid="prop-hero-cta-primary"
        />
      </div>
      <div className="space-y-2">
        <Label>Primær CTA lenke</Label>
        <Input
          value={localData?.cta_primary_url || ''}
          onChange={(e) => handleChange('cta_primary_url', e.target.value)}
          data-testid="prop-hero-cta-url"
        />
      </div>
      <div className="space-y-2">
        <Label>Sekundær CTA tekst</Label>
        <Input
          value={localData?.cta_secondary_text || ''}
          onChange={(e) => handleChange('cta_secondary_text', e.target.value)}
          data-testid="prop-hero-cta-secondary"
        />
      </div>
    </div>
  );

  const renderFeatureProperties = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tittel</Label>
        <Input
          value={localData?.title || ''}
          onChange={(e) => handleChange('title', e.target.value)}
          data-testid="prop-feature-title"
        />
      </div>
      <div className="space-y-2">
        <Label>Beskrivelse</Label>
        <Textarea
          value={localData?.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
          data-testid="prop-feature-description"
        />
      </div>
      <div className="space-y-2">
        <Label>Ikon</Label>
        <Input
          value={localData?.icon || ''}
          onChange={(e) => handleChange('icon', e.target.value)}
          placeholder="Star, Users, Zap..."
          data-testid="prop-feature-icon"
        />
      </div>
    </div>
  );

  const renderTestimonialProperties = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Sitat</Label>
        <Textarea
          value={localData?.quote || ''}
          onChange={(e) => handleChange('quote', e.target.value)}
          data-testid="prop-testimonial-quote"
        />
      </div>
      <div className="space-y-2">
        <Label>Navn</Label>
        <Input
          value={localData?.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          data-testid="prop-testimonial-name"
        />
      </div>
      <div className="space-y-2">
        <Label>Rolle</Label>
        <Input
          value={localData?.role || ''}
          onChange={(e) => handleChange('role', e.target.value)}
          data-testid="prop-testimonial-role"
        />
      </div>
    </div>
  );

  const renderPartnerProperties = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Navn</Label>
        <Input
          value={localData?.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          data-testid="prop-partner-name"
        />
      </div>
      <div className="space-y-2">
        <Label>Logo URL</Label>
        <Input
          value={localData?.logo_url || ''}
          onChange={(e) => handleChange('logo_url', e.target.value)}
          data-testid="prop-partner-logo"
        />
      </div>
      <div className="space-y-2">
        <Label>Nettside URL</Label>
        <Input
          value={localData?.website_url || ''}
          onChange={(e) => handleChange('website_url', e.target.value)}
          data-testid="prop-partner-website"
        />
      </div>
    </div>
  );

  const renderSectionProperties = () => {
    const sectionType = selectedElement.type;
    return (
      <div className="space-y-4">
        {sectionType === 'features' && (
          <>
            <div className="space-y-2">
              <Label>Seksjonstittel</Label>
              <Input
                value={localData?.features_title || ''}
                onChange={(e) => handleChange('features_title', e.target.value)}
                data-testid="prop-features-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Undertekst</Label>
              <Textarea
                value={localData?.features_subtitle || ''}
                onChange={(e) => handleChange('features_subtitle', e.target.value)}
                data-testid="prop-features-subtitle"
              />
            </div>
          </>
        )}
        {sectionType === 'testimonials' && (
          <>
            <div className="space-y-2">
              <Label>Seksjonstittel</Label>
              <Input
                value={localData?.testimonials_title || ''}
                onChange={(e) => handleChange('testimonials_title', e.target.value)}
                data-testid="prop-testimonials-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Undertekst</Label>
              <Textarea
                value={localData?.testimonials_subtitle || ''}
                onChange={(e) => handleChange('testimonials_subtitle', e.target.value)}
                data-testid="prop-testimonials-subtitle"
              />
            </div>
          </>
        )}
        {sectionType === 'partners' && (
          <>
            <div className="space-y-2">
              <Label>Seksjonstittel</Label>
              <Input
                value={localData?.partners_title || ''}
                onChange={(e) => handleChange('partners_title', e.target.value)}
                data-testid="prop-partners-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Undertekst</Label>
              <Textarea
                value={localData?.partners_subtitle || ''}
                onChange={(e) => handleChange('partners_subtitle', e.target.value)}
                data-testid="prop-partners-subtitle"
              />
            </div>
          </>
        )}
        {sectionType === 'cta' && (
          <>
            <div className="space-y-2">
              <Label>CTA Tittel</Label>
              <Input
                value={localData?.cta_title || ''}
                onChange={(e) => handleChange('cta_title', e.target.value)}
                data-testid="prop-cta-title"
              />
            </div>
            <div className="space-y-2">
              <Label>CTA Undertekst</Label>
              <Textarea
                value={localData?.cta_subtitle || ''}
                onChange={(e) => handleChange('cta_subtitle', e.target.value)}
                data-testid="prop-cta-subtitle"
              />
            </div>
            <div className="space-y-2">
              <Label>Knappetekst</Label>
              <Input
                value={localData?.cta_button_text || ''}
                onChange={(e) => handleChange('cta_button_text', e.target.value)}
                data-testid="prop-cta-button"
              />
            </div>
          </>
        )}
        {sectionType === 'contact' && (
          <>
            <div className="space-y-2">
              <Label>Kontakt Tittel</Label>
              <Input
                value={localData?.contact_title || ''}
                onChange={(e) => handleChange('contact_title', e.target.value)}
                data-testid="prop-contact-title"
              />
            </div>
            <div className="space-y-2">
              <Label>E-post</Label>
              <Input
                value={localData?.contact_email || ''}
                onChange={(e) => handleChange('contact_email', e.target.value)}
                data-testid="prop-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input
                value={localData?.contact_phone || ''}
                onChange={(e) => handleChange('contact_phone', e.target.value)}
                data-testid="prop-contact-phone"
              />
            </div>
          </>
        )}
      </div>
    );
  };

  const renderProperties = () => {
    switch (selectedElement.type) {
      case 'hero':
        return renderHeroProperties();
      case 'feature':
        return renderFeatureProperties();
      case 'testimonial':
        return renderTestimonialProperties();
      case 'partner':
        return renderPartnerProperties();
      case 'features':
      case 'testimonials':
      case 'partners':
      case 'cta':
      case 'contact':
        return renderSectionProperties();
      default:
        return <p className="text-muted-foreground text-sm">Ingen egenskaper tilgjengelig</p>;
    }
  };

  const getElementTitle = () => {
    switch (selectedElement.type) {
      case 'hero': return 'Hero';
      case 'feature': return `Funksjon: ${localData?.title || ''}`;
      case 'features': return 'Funksjoner-seksjon';
      case 'testimonial': return `Referanse: ${localData?.name || ''}`;
      case 'testimonials': return 'Referanser-seksjon';
      case 'partner': return `Partner: ${localData?.name || ''}`;
      case 'partners': return 'Partnere-seksjon';
      case 'cta': return 'CTA-seksjon';
      case 'contact': return 'Kontakt-seksjon';
      default: return 'Element';
    }
  };

  return (
    <div className="h-full border-l bg-sidebar flex flex-col">
      <Tabs defaultValue="design" className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b bg-transparent h-10 p-0">
          <TabsTrigger value="design" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
            Design
          </TabsTrigger>
          <TabsTrigger value="data" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
            Data
          </TabsTrigger>
        </TabsList>

        <div className="px-3 py-2 border-b">
          <h3 className="font-medium text-sm truncate">{getElementTitle()}</h3>
        </div>

        <TabsContent value="design" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              {renderProperties()}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="data" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              <p className="text-muted-foreground text-sm">Datakobling kommer snart</p>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="p-3 border-t">
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
  const { deviceMode, setDeviceMode, zoom, setZoom, hasChanges } = useBuilder();

  return (
    <div className="h-12 border-b bg-background flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">Landingsside</span>
        {hasChanges && <span className="text-xs text-muted-foreground">(ulagrede endringer)</span>}
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
        <Button size="sm" data-testid="button-publish">
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

  const { data: content, isLoading } = useQuery<LandingContent>({
    queryKey: ['/api/cms/landing'],
  });

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
