import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, Save, Plus, Trash2, GripVertical, Lock, Eye, ExternalLink,
  ArrowRight, Play, Clock, Zap, Star, Check, Shield, Users, TrendingUp, CheckCircle,
  Heart, Home, Phone, Mail, Calendar, Download, Upload, Settings, Search, Menu,
  X, ChevronRight, ChevronDown, Bell, Gift, Award, Target, Briefcase, Building,
  Globe, MapPin, Send, MessageCircle, ThumbsUp, Bookmark, Tag, FileText, BarChart3,
  PieChart, Activity, Rocket, Sparkles, Crown, Flame, Coffee, Sun, Moon, Smartphone,
  Palette, Type, Box, Layers, RefreshCw, Image, FolderOpen, Link2, FormInput, 
  PenTool, Newspaper, FolderPlus, Edit, Inbox, ToggleRight,
  type LucideIcon
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function getAdminToken(): string | null {
  return sessionStorage.getItem('cms_admin_token');
}

function setAdminToken(token: string) {
  sessionStorage.setItem('cms_admin_token', token);
}

function clearAdminToken() {
  sessionStorage.removeItem('cms_admin_token');
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
  cta_primary_type: string | null;
  cta_primary_icon: string | null;
  cta_secondary_text: string | null;
  cta_secondary_url: string | null;
  cta_secondary_type: string | null;
  cta_secondary_icon: string | null;
  badge1: string | null;
  badge1_icon: string | null;
  badge2: string | null;
  badge2_icon: string | null;
  badge3: string | null;
  badge3_icon: string | null;
  background_image: string | null;
  background_gradient: string | null;
  background_overlay: boolean | null;
  layout: string | null;
  stat1_value: string | null;
  stat1_label: string | null;
  stat2_value: string | null;
  stat2_label: string | null;
  stat3_value: string | null;
  stat3_label: string | null;
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
  company_logo: string | null;
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
  contact_address: string | null;
  footer_copyright: string | null;
  partners_title: string | null;
  partners_subtitle: string | null;
}

interface LandingPartner {
  id: number;
  name: string;
  logo_url: string;
  website_url: string | null;
  display_order: number;
  is_active: boolean;
}

interface ActivityLogEntry {
  id: number;
  admin_id: number;
  admin_username: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: string | null;
  created_at: string;
}

interface LandingContent {
  hero: LandingHero | null;
  features: LandingFeature[];
  testimonials: LandingTestimonial[];
  sections: LandingSections | null;
  partners: LandingPartner[];
}

const cmsIconMap: Record<string, LucideIcon> = {
  ArrowRight, Play, Clock, Zap, Star, Check, Shield, Users, TrendingUp, CheckCircle,
  Heart, Home, Phone, Mail, Calendar, Download, Upload, Settings, Search, Menu,
  X, ChevronRight, ChevronDown, Bell, Gift, Award, Target, Briefcase, Building,
  Globe, MapPin, Send, MessageCircle, ThumbsUp, Bookmark, Tag, FileText, BarChart3,
  PieChart, Activity, Rocket, Sparkles, Crown, Flame, Coffee, Sun, Moon, Smartphone,
};

const iconOptionsWithLabels = [
  { value: "", label: "Ingen ikon" },
  { value: "ArrowRight", label: "Pil høyre" },
  { value: "Play", label: "Avspill" },
  { value: "Clock", label: "Klokke" },
  { value: "Zap", label: "Lyn" },
  { value: "Star", label: "Stjerne" },
  { value: "Check", label: "Hake" },
  { value: "Shield", label: "Skjold" },
  { value: "Users", label: "Brukere" },
  { value: "TrendingUp", label: "Trend opp" },
  { value: "CheckCircle", label: "Hake sirkel" },
  { value: "Heart", label: "Hjerte" },
  { value: "Home", label: "Hjem" },
  { value: "Phone", label: "Telefon" },
  { value: "Mail", label: "E-post" },
  { value: "Calendar", label: "Kalender" },
  { value: "Download", label: "Last ned" },
  { value: "Upload", label: "Last opp" },
  { value: "Settings", label: "Innstillinger" },
  { value: "Search", label: "Søk" },
  { value: "Menu", label: "Meny" },
  { value: "X", label: "Lukk" },
  { value: "ChevronRight", label: "Chevron høyre" },
  { value: "ChevronDown", label: "Chevron ned" },
  { value: "Bell", label: "Varsel" },
  { value: "Gift", label: "Gave" },
  { value: "Award", label: "Premie" },
  { value: "Target", label: "Mål" },
  { value: "Briefcase", label: "Koffert" },
  { value: "Building", label: "Bygning" },
  { value: "Globe", label: "Globus" },
  { value: "MapPin", label: "Kartmarkør" },
  { value: "Send", label: "Send" },
  { value: "MessageCircle", label: "Melding" },
  { value: "ThumbsUp", label: "Tommel opp" },
  { value: "Bookmark", label: "Bokmerke" },
  { value: "Tag", label: "Etikett" },
  { value: "FileText", label: "Dokument" },
  { value: "BarChart3", label: "Stolpediagram" },
  { value: "PieChart", label: "Sektordiagram" },
  { value: "Activity", label: "Aktivitet" },
  { value: "Rocket", label: "Rakett" },
  { value: "Sparkles", label: "Glitre" },
  { value: "Crown", label: "Krone" },
  { value: "Flame", label: "Flamme" },
  { value: "Coffee", label: "Kaffe" },
  { value: "Sun", label: "Sol" },
  { value: "Moon", label: "Måne" },
  { value: "Smartphone", label: "Smarttelefon" },
];

const iconOptions = iconOptionsWithLabels.map(o => o.value).filter(Boolean);

function IconSelect({ 
  value, 
  onChange, 
  testId 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  testId?: string;
}) {
  const selectedIcon = value ? cmsIconMap[value] : null;
  
  return (
    <div className="relative">
      <select
        className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 py-1 text-sm appearance-none cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      >
        {iconOptionsWithLabels.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
        {selectedIcon ? (
          (() => {
            const Icon = selectedIcon;
            return <Icon className="h-4 w-4" />;
          })()
        ) : (
          <div className="h-4 w-4" />
        )}
      </div>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function ImageUploader({ 
  value, 
  onChange, 
  label,
  placeholder = "https://eksempel.no/bilde.jpg"
}: { 
  value: string; 
  onChange: (url: string) => void; 
  label: string;
  placeholder?: string;
}) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    setIsUploading(true);
    try {
      const token = getAdminToken();
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (data.url) {
        onChange(data.url);
        toast({ title: "Lastet opp", description: "Bildet er lastet opp." });
      } else {
        toast({ title: "Feil", description: data.error || "Kunne ikke laste opp bilde.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Feil", description: "Opplasting feilet.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <label className="cursor-pointer" data-testid="button-upload-image">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            data-testid="input-file-upload"
          />
          <Button type="button" variant="outline" size="icon" disabled={isUploading} asChild>
            <span>
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </span>
          </Button>
        </label>
      </div>
      {value && (
        <div className="mt-2 p-2 border rounded-lg bg-muted/50 inline-block">
          <img src={value} alt="Forhåndsvisning" className="h-12 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
      )}
    </div>
  );
}

export default function CMSPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("hero");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const token = getAdminToken();
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await response.json();
      if (data.token) {
        setAdminToken(data.token);
        setIsAuthenticated(true);
        toast({ title: "Innlogget", description: "Du er nå logget inn som administrator." });
      } else {
        toast({ title: "Feil", description: data.error || "Innlogging feilet.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Feil", description: "Kunne ikke logge inn.", variant: "destructive" });
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    clearAdminToken();
    setIsAuthenticated(false);
    toast({ title: "Logget ut", description: "Du er nå logget ut." });
  };

  const { data: content, isLoading } = useQuery<LandingContent>({
    queryKey: ['/api/cms/landing'],
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
                <Lock className="h-6 w-6 text-primary" />
              </div>
            </div>
            <CardTitle>CMS Admin</CardTitle>
            <CardDescription>Logg inn for å administrere innhold</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Brukernavn</Label>
                <Input
                  id="username"
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="admin"
                  data-testid="input-cms-login-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passord</Label>
                <Input
                  id="password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Ditt passord"
                  data-testid="input-cms-login-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loginLoading} data-testid="button-cms-login">
                {loginLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Logg inn
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="cms-title">Innholdsstyring</h1>
          <p className="text-muted-foreground mt-2">
            Rediger innholdet på landingssiden og andre sider i applikasjonen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-preview">
                <Eye className="h-4 w-4 mr-2" />
                Forhåndsvisning
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl h-[80vh]">
              <DialogHeader>
                <DialogTitle>Forhåndsvisning av landingssiden</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-hidden rounded-lg border">
                <iframe 
                  src="/" 
                  className="w-full h-full min-h-[60vh]"
                  title="Forhåndsvisning"
                />
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => window.open('/', '_blank')} data-testid="button-open-site">
            <ExternalLink className="h-4 w-4 mr-2" />
            Åpne nettside
          </Button>
          <Button variant="outline" onClick={handleLogout} data-testid="button-cms-logout">
            Logg ut
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1 w-full mb-6" data-testid="cms-tabs">
          <TabsTrigger value="hero" data-testid="tab-hero">Hero</TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features">Funksjoner</TabsTrigger>
          <TabsTrigger value="testimonials" data-testid="tab-testimonials">Referanser</TabsTrigger>
          <TabsTrigger value="partners" data-testid="tab-partners">Partnere</TabsTrigger>
          <TabsTrigger value="sections" data-testid="tab-sections">Seksjoner</TabsTrigger>
          <TabsTrigger value="design" data-testid="tab-design">Design</TabsTrigger>
          <TabsTrigger value="media" data-testid="tab-media">
            <Image className="h-4 w-4 mr-1" />Media
          </TabsTrigger>
          <TabsTrigger value="seo" data-testid="tab-seo">
            <Search className="h-4 w-4 mr-1" />SEO
          </TabsTrigger>
          <TabsTrigger value="forms" data-testid="tab-forms">
            <FormInput className="h-4 w-4 mr-1" />Skjemaer
          </TabsTrigger>
          <TabsTrigger value="navigation" data-testid="tab-navigation">
            <Menu className="h-4 w-4 mr-1" />Navigasjon
          </TabsTrigger>
          <TabsTrigger value="blog" data-testid="tab-blog">
            <Newspaper className="h-4 w-4 mr-1" />Blogg
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="h-4 w-4 mr-1" />GA4
          </TabsTrigger>
          <TabsTrigger value="email" data-testid="tab-email">
            <Mail className="h-4 w-4 mr-1" />E-post
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <FileText className="h-4 w-4 mr-1" />Rapporter
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">Aktivitet</TabsTrigger>
          <TabsTrigger value="versions" data-testid="tab-versions">
            <RefreshCw className="h-4 w-4 mr-1" />Versjoner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hero">
          <HeroEditor hero={content?.hero || null} />
        </TabsContent>

        <TabsContent value="features">
          <FeaturesEditor features={content?.features || []} />
        </TabsContent>

        <TabsContent value="testimonials">
          <TestimonialsEditor testimonials={content?.testimonials || []} />
        </TabsContent>

        <TabsContent value="partners">
          <PartnersEditor partners={content?.partners || []} />
        </TabsContent>

        <TabsContent value="sections">
          <SectionsEditor sections={content?.sections || null} />
        </TabsContent>

        <TabsContent value="design">
          <DesignEditor />
        </TabsContent>

        <TabsContent value="media">
          <MediaLibrary />
        </TabsContent>

        <TabsContent value="seo">
          <SEOEditor />
        </TabsContent>

        <TabsContent value="forms">
          <FormBuilder />
        </TabsContent>

        <TabsContent value="navigation">
          <NavigationEditor />
        </TabsContent>

        <TabsContent value="blog">
          <BlogEditor />
        </TabsContent>

        <TabsContent value="analytics">
          <AnalyticsEditor />
        </TabsContent>

        <TabsContent value="email">
          <EmailEditor />
        </TabsContent>

        <TabsContent value="reports">
          <ReportDesigner />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityLogViewer />
        </TabsContent>

        <TabsContent value="versions">
          <VersionHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HeroEditor({ hero }: { hero: LandingHero | null }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("content");
  const [formData, setFormData] = useState({
    title: hero?.title || "",
    title_highlight: hero?.title_highlight || "",
    subtitle: hero?.subtitle || "",
    cta_primary_text: hero?.cta_primary_text || "",
    cta_primary_url: hero?.cta_primary_url || "",
    cta_primary_type: hero?.cta_primary_type || "scroll",
    cta_primary_icon: hero?.cta_primary_icon || "",
    cta_secondary_text: hero?.cta_secondary_text || "",
    cta_secondary_url: hero?.cta_secondary_url || "",
    cta_secondary_type: hero?.cta_secondary_type || "scroll",
    cta_secondary_icon: hero?.cta_secondary_icon || "",
    badge1: hero?.badge1 || "",
    badge1_icon: hero?.badge1_icon || "",
    badge2: hero?.badge2 || "",
    badge2_icon: hero?.badge2_icon || "",
    badge3: hero?.badge3 || "",
    badge3_icon: hero?.badge3_icon || "",
    background_image: hero?.background_image || "",
    background_gradient: hero?.background_gradient || "",
    background_overlay: hero?.background_overlay ?? true,
    layout: hero?.layout || "center",
    stat1_value: hero?.stat1_value || "",
    stat1_label: hero?.stat1_label || "",
    stat2_value: hero?.stat2_value || "",
    stat2_label: hero?.stat2_label || "",
    stat3_value: hero?.stat3_value || "",
    stat3_label: hero?.stat3_label || "",
  });

  const ctaTypeOptions = [
    { value: "scroll", label: "Scroll til seksjon" },
    { value: "internal", label: "Intern lenke" },
    { value: "external", label: "Ekstern URL" },
    { value: "modal", label: "Åpne dialog" },
  ];

  const layoutOptions = [
    { value: "left", label: "Venstrejustert" },
    { value: "center", label: "Sentrert" },
    { value: "right", label: "Høyrejustert" },
  ];

  const iconOptions = [
    { value: "", label: "Ingen ikon" },
    { value: "ArrowRight", label: "Pil høyre" },
    { value: "Play", label: "Avspill" },
    { value: "Clock", label: "Klokke" },
    { value: "Zap", label: "Lyn" },
    { value: "Star", label: "Stjerne" },
    { value: "Check", label: "Hake" },
    { value: "Shield", label: "Skjold" },
    { value: "Users", label: "Brukere" },
    { value: "TrendingUp", label: "Trend opp" },
  ];

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return authenticatedApiRequest('/api/cms/hero', { method: 'PUT', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Lagret", description: "Hero-seksjonen er oppdatert." });
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke lagre endringene.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hero-seksjon</CardTitle>
        <CardDescription>Avanserte kontroller for hovedseksjonen på landingssiden.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="content" data-testid="tab-hero-content">Innhold</TabsTrigger>
              <TabsTrigger value="buttons" data-testid="tab-hero-buttons">Knapper</TabsTrigger>
              <TabsTrigger value="badges" data-testid="tab-hero-badges">Badges</TabsTrigger>
              <TabsTrigger value="design" data-testid="tab-hero-design">Design</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Hovedtittel</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    data-testid="input-hero-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title_highlight">Fremhevet tekst (med farge)</Label>
                  <Input
                    id="title_highlight"
                    value={formData.title_highlight}
                    onChange={(e) => setFormData({ ...formData, title_highlight: e.target.value })}
                    data-testid="input-hero-highlight"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitle">Undertekst</Label>
                <Textarea
                  id="subtitle"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  rows={3}
                  data-testid="input-hero-subtitle"
                />
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium">Statistikk (valgfritt)</h4>
                <p className="text-sm text-muted-foreground">Vis nøkkeltall under overskriften.</p>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Verdi 1</Label>
                    <Input
                      value={formData.stat1_value}
                      onChange={(e) => setFormData({ ...formData, stat1_value: e.target.value })}
                      placeholder="f.eks. 10 000+"
                      data-testid="input-hero-stat1-value"
                    />
                    <Input
                      value={formData.stat1_label}
                      onChange={(e) => setFormData({ ...formData, stat1_label: e.target.value })}
                      placeholder="Etikett, f.eks. Brukere"
                      data-testid="input-hero-stat1-label"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Verdi 2</Label>
                    <Input
                      value={formData.stat2_value}
                      onChange={(e) => setFormData({ ...formData, stat2_value: e.target.value })}
                      placeholder="f.eks. 99%"
                      data-testid="input-hero-stat2-value"
                    />
                    <Input
                      value={formData.stat2_label}
                      onChange={(e) => setFormData({ ...formData, stat2_label: e.target.value })}
                      placeholder="Etikett"
                      data-testid="input-hero-stat2-label"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Verdi 3</Label>
                    <Input
                      value={formData.stat3_value}
                      onChange={(e) => setFormData({ ...formData, stat3_value: e.target.value })}
                      placeholder="f.eks. 24/7"
                      data-testid="input-hero-stat3-value"
                    />
                    <Input
                      value={formData.stat3_label}
                      onChange={(e) => setFormData({ ...formData, stat3_label: e.target.value })}
                      placeholder="Etikett"
                      data-testid="input-hero-stat3-label"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="buttons" className="space-y-4">
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium">Primærknapp</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tekst</Label>
                    <Input
                      value={formData.cta_primary_text}
                      onChange={(e) => setFormData({ ...formData, cta_primary_text: e.target.value })}
                      placeholder="Start gratis"
                      data-testid="input-hero-cta-primary-text"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Handling</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={formData.cta_primary_type}
                      onChange={(e) => setFormData({ ...formData, cta_primary_type: e.target.value })}
                      data-testid="select-hero-cta-primary-type"
                    >
                      {ctaTypeOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>URL / Mål</Label>
                    <Input
                      value={formData.cta_primary_url}
                      onChange={(e) => setFormData({ ...formData, cta_primary_url: e.target.value })}
                      placeholder={formData.cta_primary_type === 'scroll' ? '#features' : '/register'}
                      data-testid="input-hero-cta-primary-url"
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.cta_primary_type === 'scroll' && 'Bruk # etterfulgt av seksjons-ID, f.eks. #features'}
                      {formData.cta_primary_type === 'internal' && 'Intern sti, f.eks. /register'}
                      {formData.cta_primary_type === 'external' && 'Full URL, f.eks. https://example.com'}
                      {formData.cta_primary_type === 'modal' && 'Navn på dialog, f.eks. login'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Ikon</Label>
                    <IconSelect
                      value={formData.cta_primary_icon}
                      onChange={(val) => setFormData({ ...formData, cta_primary_icon: val })}
                      testId="select-hero-cta-primary-icon"
                    />
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium">Sekundærknapp</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tekst</Label>
                    <Input
                      value={formData.cta_secondary_text}
                      onChange={(e) => setFormData({ ...formData, cta_secondary_text: e.target.value })}
                      placeholder="Se demo"
                      data-testid="input-hero-cta-secondary-text"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Handling</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={formData.cta_secondary_type}
                      onChange={(e) => setFormData({ ...formData, cta_secondary_type: e.target.value })}
                      data-testid="select-hero-cta-secondary-type"
                    >
                      {ctaTypeOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>URL / Mål</Label>
                    <Input
                      value={formData.cta_secondary_url}
                      onChange={(e) => setFormData({ ...formData, cta_secondary_url: e.target.value })}
                      placeholder={formData.cta_secondary_type === 'scroll' ? '#demo' : '/demo'}
                      data-testid="input-hero-cta-secondary-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ikon</Label>
                    <IconSelect
                      value={formData.cta_secondary_icon}
                      onChange={(val) => setFormData({ ...formData, cta_secondary_icon: val })}
                      testId="select-hero-cta-secondary-icon"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="badges" className="space-y-4">
              <p className="text-sm text-muted-foreground">Badges vises over overskriften for å fremheve fordeler eller egenskaper.</p>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-4 space-y-3">
                  <Label>Badge 1</Label>
                  <Input
                    value={formData.badge1}
                    onChange={(e) => setFormData({ ...formData, badge1: e.target.value })}
                    placeholder="Gratis prøveperiode"
                    data-testid="input-hero-badge1"
                  />
                  <IconSelect
                    value={formData.badge1_icon}
                    onChange={(val) => setFormData({ ...formData, badge1_icon: val })}
                    testId="select-hero-badge1-icon"
                  />
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <Label>Badge 2</Label>
                  <Input
                    value={formData.badge2}
                    onChange={(e) => setFormData({ ...formData, badge2: e.target.value })}
                    placeholder="Ingen kredittkort"
                    data-testid="input-hero-badge2"
                  />
                  <IconSelect
                    value={formData.badge2_icon}
                    onChange={(val) => setFormData({ ...formData, badge2_icon: val })}
                    testId="select-hero-badge2-icon"
                  />
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <Label>Badge 3</Label>
                  <Input
                    value={formData.badge3}
                    onChange={(e) => setFormData({ ...formData, badge3: e.target.value })}
                    placeholder="GDPR-kompatibel"
                    data-testid="input-hero-badge3"
                  />
                  <IconSelect
                    value={formData.badge3_icon}
                    onChange={(val) => setFormData({ ...formData, badge3_icon: val })}
                    testId="select-hero-badge3-icon"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="design" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Layout</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={formData.layout}
                    onChange={(e) => setFormData({ ...formData, layout: e.target.value })}
                    data-testid="select-hero-layout"
                  >
                    {layoutOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="background_overlay"
                    checked={formData.background_overlay}
                    onChange={(e) => setFormData({ ...formData, background_overlay: e.target.checked })}
                    className="h-4 w-4"
                    data-testid="checkbox-hero-overlay"
                  />
                  <Label htmlFor="background_overlay">Vis mørk overlegg på bakgrunn</Label>
                </div>
              </div>

              <ImageUploader
                label="Bakgrunnsbilde"
                value={formData.background_image}
                onChange={(url) => setFormData({ ...formData, background_image: url })}
                placeholder="https://eksempel.no/bakgrunn.jpg"
              />

              <div className="space-y-2">
                <Label>Bakgrunnsgradient (valgfritt)</Label>
                <Input
                  value={formData.background_gradient}
                  onChange={(e) => setFormData({ ...formData, background_gradient: e.target.value })}
                  placeholder="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                  data-testid="input-hero-gradient"
                />
                <p className="text-xs text-muted-foreground">CSS gradient-verdi. Overstyres av bakgrunnsbilde hvis satt.</p>
              </div>

              {(formData.background_image || formData.background_gradient) && (
                <div className="border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground mb-2">Forhåndsvisning:</p>
                  <div 
                    className="h-24 rounded-md flex items-center justify-center text-white font-medium"
                    style={{
                      backgroundImage: formData.background_image 
                        ? `url(${formData.background_image})`
                        : formData.background_gradient,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {formData.background_overlay && (
                      <div className="absolute inset-0 bg-black/50 rounded-md" />
                    )}
                    <span className="relative z-10">Forhåndsvisning</span>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-hero">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Lagre endringer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SortableFeatureItem({ 
  feature, 
  index, 
  editingFeature, 
  setEditingFeature, 
  updateMutation, 
  deleteMutation 
}: { 
  feature: LandingFeature; 
  index: number;
  editingFeature: LandingFeature | null;
  setEditingFeature: (f: LandingFeature | null) => void;
  updateMutation: any;
  deleteMutation: any;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: feature.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="flex items-center gap-4 p-4 border rounded-lg bg-background" 
      data-testid={`feature-item-${index}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      {editingFeature?.id === feature.id ? (
        <div className="flex-1 grid md:grid-cols-4 gap-4 items-end">
          <IconSelect
            value={editingFeature.icon}
            onChange={(val) => setEditingFeature({ ...editingFeature, icon: val })}
          />
          <Input
            value={editingFeature.title}
            onChange={(e) => setEditingFeature({ ...editingFeature, title: e.target.value })}
          />
          <Input
            value={editingFeature.description}
            onChange={(e) => setEditingFeature({ ...editingFeature, description: e.target.value })}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => updateMutation.mutate(editingFeature)}>
              Lagre
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingFeature(null)}>
              Avbryt
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1">
            <p className="font-medium">{feature.title}</p>
            <p className="text-sm text-muted-foreground">{feature.description}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditingFeature(feature)} data-testid={`button-edit-feature-${index}`}>
            Rediger
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => deleteMutation.mutate(feature.id)}
            data-testid={`button-delete-feature-${index}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}

function FeaturesEditor({ features }: { features: LandingFeature[] }) {
  const { toast } = useToast();
  const [editingFeature, setEditingFeature] = useState<LandingFeature | null>(null);
  const [newFeature, setNewFeature] = useState({ icon: "Clock", title: "", description: "", display_order: features.length });
  const [localFeatures, setLocalFeatures] = useState(features);

  useEffect(() => {
    setLocalFeatures(features);
  }, [features]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const createMutation = useMutation({
    mutationFn: async (data: typeof newFeature) => {
      return authenticatedApiRequest('/api/cms/features', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      setNewFeature({ icon: "Clock", title: "", description: "", display_order: features.length + 1 });
      toast({ title: "Lagt til", description: "Ny funksjon er opprettet." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: LandingFeature) => {
      return authenticatedApiRequest(`/api/cms/features/${data.id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      setEditingFeature(null);
      toast({ title: "Lagret", description: "Funksjonen er oppdatert." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return authenticatedApiRequest(`/api/cms/features/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Slettet", description: "Funksjonen er fjernet." });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      return authenticatedApiRequest('/api/cms/features/reorder', { 
        method: 'POST', 
        body: JSON.stringify({ orderedIds }) 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Rekkefølge lagret", description: "Funksjonene er omorganisert." });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localFeatures.findIndex((f) => f.id === active.id);
      const newIndex = localFeatures.findIndex((f) => f.id === over.id);
      const newOrder = arrayMove(localFeatures, oldIndex, newIndex);
      setLocalFeatures(newOrder);
      reorderMutation.mutate(newOrder.map((f) => f.id));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Legg til ny funksjon</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label>Ikon</Label>
              <IconSelect
                value={newFeature.icon}
                onChange={(val) => setNewFeature({ ...newFeature, icon: val })}
                testId="select-new-feature-icon"
              />
            </div>
            <div className="space-y-2">
              <Label>Tittel</Label>
              <Input
                value={newFeature.title}
                onChange={(e) => setNewFeature({ ...newFeature, title: e.target.value })}
                placeholder="Funksjonsnavn"
                data-testid="input-new-feature-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Beskrivelse</Label>
              <Input
                value={newFeature.description}
                onChange={(e) => setNewFeature({ ...newFeature, description: e.target.value })}
                placeholder="Kort beskrivelse"
                data-testid="input-new-feature-description"
              />
            </div>
            <Button
              onClick={() => createMutation.mutate(newFeature)}
              disabled={!newFeature.title || !newFeature.description || createMutation.isPending}
              data-testid="button-add-feature"
            >
              <Plus className="h-4 w-4 mr-2" />
              Legg til
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eksisterende funksjoner</CardTitle>
          <CardDescription>Dra og slipp for å endre rekkefølge. Rediger eller slett funksjoner.</CardDescription>
        </CardHeader>
        <CardContent>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localFeatures.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {localFeatures.map((feature, index) => (
                  <SortableFeatureItem
                    key={feature.id}
                    feature={feature}
                    index={index}
                    editingFeature={editingFeature}
                    setEditingFeature={setEditingFeature}
                    updateMutation={updateMutation}
                    deleteMutation={deleteMutation}
                  />
                ))}
                {localFeatures.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">Ingen funksjoner lagt til ennå.</p>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  );
}

function TestimonialsEditor({ testimonials }: { testimonials: LandingTestimonial[] }) {
  const { toast } = useToast();
  const [editingTestimonial, setEditingTestimonial] = useState<LandingTestimonial | null>(null);
  const [newTestimonial, setNewTestimonial] = useState({ quote: "", name: "", role: "", avatar_url: "", company_logo: "", display_order: testimonials.length });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newTestimonial) => {
      return authenticatedApiRequest('/api/cms/testimonials', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      setNewTestimonial({ quote: "", name: "", role: "", avatar_url: "", company_logo: "", display_order: testimonials.length + 1 });
      toast({ title: "Lagt til", description: "Ny referanse er opprettet." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: LandingTestimonial) => {
      return authenticatedApiRequest(`/api/cms/testimonials/${data.id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      setEditingTestimonial(null);
      toast({ title: "Lagret", description: "Referansen er oppdatert." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return authenticatedApiRequest(`/api/cms/testimonials/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Slettet", description: "Referansen er fjernet." });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Legg til ny referanse</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sitat</Label>
              <Textarea
                value={newTestimonial.quote}
                onChange={(e) => setNewTestimonial({ ...newTestimonial, quote: e.target.value })}
                placeholder="Hva sier kunden?"
                data-testid="input-new-testimonial-quote"
              />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Navn</Label>
                <Input
                  value={newTestimonial.name}
                  onChange={(e) => setNewTestimonial({ ...newTestimonial, name: e.target.value })}
                  placeholder="Kundens navn"
                  data-testid="input-new-testimonial-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Rolle/Bedrift</Label>
                <Input
                  value={newTestimonial.role}
                  onChange={(e) => setNewTestimonial({ ...newTestimonial, role: e.target.value })}
                  placeholder="Stilling, Bedrift"
                  data-testid="input-new-testimonial-role"
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <ImageUploader
                label="Profilbilde (valgfritt)"
                value={newTestimonial.avatar_url}
                onChange={(url) => setNewTestimonial({ ...newTestimonial, avatar_url: url })}
                placeholder="https://eksempel.no/bilde.jpg"
              />
              <ImageUploader
                label="Bedriftslogo (valgfritt)"
                value={newTestimonial.company_logo}
                onChange={(url) => setNewTestimonial({ ...newTestimonial, company_logo: url })}
                placeholder="https://eksempel.no/logo.png"
              />
            </div>
            <Button
              onClick={() => createMutation.mutate(newTestimonial)}
              disabled={!newTestimonial.quote || !newTestimonial.name || createMutation.isPending}
              data-testid="button-add-testimonial"
            >
              <Plus className="h-4 w-4 mr-2" />
              Legg til referanse
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eksisterende referanser</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {testimonials.map((testimonial, index) => (
              <div key={testimonial.id} className="p-4 border rounded-lg" data-testid={`testimonial-item-${index}`}>
                {editingTestimonial?.id === testimonial.id ? (
                  <div className="space-y-4">
                    <Textarea
                      value={editingTestimonial.quote}
                      onChange={(e) => setEditingTestimonial({ ...editingTestimonial, quote: e.target.value })}
                      placeholder="Sitat"
                    />
                    <div className="grid md:grid-cols-2 gap-4">
                      <Input
                        value={editingTestimonial.name}
                        onChange={(e) => setEditingTestimonial({ ...editingTestimonial, name: e.target.value })}
                        placeholder="Navn"
                      />
                      <Input
                        value={editingTestimonial.role}
                        onChange={(e) => setEditingTestimonial({ ...editingTestimonial, role: e.target.value })}
                        placeholder="Rolle/Bedrift"
                      />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Input
                        value={editingTestimonial.avatar_url || ""}
                        onChange={(e) => setEditingTestimonial({ ...editingTestimonial, avatar_url: e.target.value })}
                        placeholder="Profilbilde URL"
                      />
                      <Input
                        value={editingTestimonial.company_logo || ""}
                        onChange={(e) => setEditingTestimonial({ ...editingTestimonial, company_logo: e.target.value })}
                        placeholder="Bedriftslogo URL"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateMutation.mutate(editingTestimonial)}>
                        Lagre
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingTestimonial(null)}>
                        Avbryt
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {testimonial.avatar_url && (
                        <img 
                          src={testimonial.avatar_url} 
                          alt={testimonial.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <p className="italic mb-2">"{testimonial.quote}"</p>
                        <p className="font-medium">{testimonial.name}</p>
                        <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                        {testimonial.company_logo && (
                          <img 
                            src={testimonial.company_logo} 
                            alt="Logo"
                            className="h-6 mt-2 object-contain"
                          />
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingTestimonial(testimonial)} data-testid={`button-edit-testimonial-${index}`}>
                        Rediger
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteMutation.mutate(testimonial.id)}
                        data-testid={`button-delete-testimonial-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {testimonials.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Ingen referanser lagt til ennå.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionsEditor({ sections }: { sections: LandingSections | null }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    features_title: sections?.features_title || "",
    features_subtitle: sections?.features_subtitle || "",
    testimonials_title: sections?.testimonials_title || "",
    testimonials_subtitle: sections?.testimonials_subtitle || "",
    cta_title: sections?.cta_title || "",
    cta_subtitle: sections?.cta_subtitle || "",
    cta_button_text: sections?.cta_button_text || "",
    contact_title: sections?.contact_title || "",
    contact_subtitle: sections?.contact_subtitle || "",
    contact_email: sections?.contact_email || "",
    contact_phone: sections?.contact_phone || "",
    contact_address: sections?.contact_address || "",
    footer_copyright: sections?.footer_copyright || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return authenticatedApiRequest('/api/cms/sections', { method: 'PUT', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Lagret", description: "Seksjonene er oppdatert." });
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke lagre endringene.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Funksjoner-seksjon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tittel</Label>
            <Input
              value={formData.features_title}
              onChange={(e) => setFormData({ ...formData, features_title: e.target.value })}
              data-testid="input-section-features-title"
            />
          </div>
          <div className="space-y-2">
            <Label>Undertekst</Label>
            <Textarea
              value={formData.features_subtitle}
              onChange={(e) => setFormData({ ...formData, features_subtitle: e.target.value })}
              data-testid="input-section-features-subtitle"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Referanser-seksjon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tittel</Label>
            <Input
              value={formData.testimonials_title}
              onChange={(e) => setFormData({ ...formData, testimonials_title: e.target.value })}
              data-testid="input-section-testimonials-title"
            />
          </div>
          <div className="space-y-2">
            <Label>Undertekst</Label>
            <Textarea
              value={formData.testimonials_subtitle}
              onChange={(e) => setFormData({ ...formData, testimonials_subtitle: e.target.value })}
              data-testid="input-section-testimonials-subtitle"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CTA-seksjon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tittel</Label>
            <Input
              value={formData.cta_title}
              onChange={(e) => setFormData({ ...formData, cta_title: e.target.value })}
              data-testid="input-section-cta-title"
            />
          </div>
          <div className="space-y-2">
            <Label>Undertekst</Label>
            <Textarea
              value={formData.cta_subtitle}
              onChange={(e) => setFormData({ ...formData, cta_subtitle: e.target.value })}
              data-testid="input-section-cta-subtitle"
            />
          </div>
          <div className="space-y-2">
            <Label>Knappetekst</Label>
            <Input
              value={formData.cta_button_text}
              onChange={(e) => setFormData({ ...formData, cta_button_text: e.target.value })}
              data-testid="input-section-cta-button"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kontakt-seksjon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tittel</Label>
              <Input
                value={formData.contact_title}
                onChange={(e) => setFormData({ ...formData, contact_title: e.target.value })}
                data-testid="input-section-contact-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Undertekst</Label>
              <Input
                value={formData.contact_subtitle}
                onChange={(e) => setFormData({ ...formData, contact_subtitle: e.target.value })}
                data-testid="input-section-contact-subtitle"
              />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>E-post</Label>
              <Input
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                data-testid="input-section-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                data-testid="input-section-contact-phone"
              />
            </div>
            <div className="space-y-2">
              <Label>Adresse</Label>
              <Input
                value={formData.contact_address}
                onChange={(e) => setFormData({ ...formData, contact_address: e.target.value })}
                data-testid="input-section-contact-address"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Footer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Copyright-tekst</Label>
            <Input
              value={formData.footer_copyright}
              onChange={(e) => setFormData({ ...formData, footer_copyright: e.target.value })}
              data-testid="input-section-footer-copyright"
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={mutation.isPending} className="w-full" data-testid="button-save-sections">
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Lagre alle seksjoner
      </Button>
    </form>
  );
}

function PartnersEditor({ partners }: { partners: LandingPartner[] }) {
  const { toast } = useToast();
  const [editingPartner, setEditingPartner] = useState<LandingPartner | null>(null);
  const [newPartner, setNewPartner] = useState({ name: "", logo_url: "", website_url: "", display_order: partners.length });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newPartner) => {
      return authenticatedApiRequest('/api/cms/partners', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      setNewPartner({ name: "", logo_url: "", website_url: "", display_order: partners.length + 1 });
      toast({ title: "Lagt til", description: "Ny partner er opprettet." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: LandingPartner) => {
      return authenticatedApiRequest(`/api/cms/partners/${data.id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      setEditingPartner(null);
      toast({ title: "Lagret", description: "Partneren er oppdatert." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return authenticatedApiRequest(`/api/cms/partners/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/landing'] });
      toast({ title: "Slettet", description: "Partneren er fjernet." });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Legg til ny partner</CardTitle>
          <CardDescription>Legg til bedriftslogoer som vises på landingssiden</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bedriftsnavn</Label>
                <Input
                  value={newPartner.name}
                  onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                  placeholder="Bedriftsnavn AS"
                  data-testid="input-new-partner-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Nettside URL (valgfritt)</Label>
                <Input
                  value={newPartner.website_url}
                  onChange={(e) => setNewPartner({ ...newPartner, website_url: e.target.value })}
                  placeholder="https://bedrift.no"
                  data-testid="input-new-partner-website"
                />
              </div>
            </div>
            <ImageUploader
              label="Logo"
              value={newPartner.logo_url}
              onChange={(url) => setNewPartner({ ...newPartner, logo_url: url })}
              placeholder="https://eksempel.no/logo.png"
            />
            <Button
              onClick={() => createMutation.mutate(newPartner)}
              disabled={!newPartner.name || !newPartner.logo_url || createMutation.isPending}
              data-testid="button-add-partner"
            >
              <Plus className="h-4 w-4 mr-2" />
              Legg til partner
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eksisterende partnere</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {partners.map((partner, index) => (
              <div key={partner.id} className="p-4 border rounded-lg" data-testid={`partner-item-${index}`}>
                {editingPartner?.id === partner.id ? (
                  <div className="space-y-3">
                    <Input
                      value={editingPartner.name}
                      onChange={(e) => setEditingPartner({ ...editingPartner, name: e.target.value })}
                      placeholder="Bedriftsnavn"
                    />
                    <Input
                      value={editingPartner.logo_url}
                      onChange={(e) => setEditingPartner({ ...editingPartner, logo_url: e.target.value })}
                      placeholder="Logo URL"
                    />
                    <Input
                      value={editingPartner.website_url || ""}
                      onChange={(e) => setEditingPartner({ ...editingPartner, website_url: e.target.value })}
                      placeholder="Nettside URL"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateMutation.mutate(editingPartner)}>
                        Lagre
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingPartner(null)}>
                        Avbryt
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="h-16 flex items-center justify-center bg-muted/50 rounded-lg">
                      <img src={partner.logo_url} alt={partner.name} className="h-10 object-contain" />
                    </div>
                    <div>
                      <p className="font-medium">{partner.name}</p>
                      {partner.website_url && (
                        <a href={partner.website_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                          {partner.website_url}
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingPartner(partner)} data-testid={`button-edit-partner-${index}`}>
                        Rediger
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteMutation.mutate(partner.id)}
                        data-testid={`button-delete-partner-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {partners.length === 0 && (
              <p className="text-center text-muted-foreground py-8 col-span-full">Ingen partnere lagt til ennå.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityLogViewer() {
  const { data: activityLog, isLoading } = useQuery<ActivityLogEntry[]>({
    queryKey: ['/api/cms/activity-log'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('nb-NO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      create: 'Opprettet',
      update: 'Oppdatert',
      delete: 'Slettet',
    };
    return labels[action] || action;
  };

  const getEntityLabel = (entityType: string) => {
    const labels: Record<string, string> = {
      hero: 'Hero-seksjon',
      feature: 'Funksjon',
      testimonial: 'Referanse',
      partner: 'Partner',
      section: 'Seksjon',
    };
    return labels[entityType] || entityType;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktivitetslogg</CardTitle>
        <CardDescription>Se hvem som har gjort endringer i CMS</CardDescription>
      </CardHeader>
      <CardContent>
        {activityLog && activityLog.length > 0 ? (
          <div className="space-y-3">
            {activityLog.map((entry) => (
              <div key={entry.id} className="flex items-start gap-4 p-3 border rounded-lg" data-testid={`activity-entry-${entry.id}`}>
                <div className="flex-1">
                  <p className="font-medium">
                    <span className="text-primary">{entry.admin_username || 'Ukjent'}</span>
                    {' '}{getActionLabel(entry.action)}{' '}
                    {getEntityLabel(entry.entity_type)}
                    {entry.entity_id && ` #${entry.entity_id}`}
                  </p>
                  {entry.details && (
                    <p className="text-sm text-muted-foreground mt-1">{entry.details}</p>
                  )}
                </div>
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatDate(entry.created_at)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">Ingen aktivitet registrert ennå.</p>
        )}
      </CardContent>
    </Card>
  );
}

interface DesignTokens {
  id?: number;
  name?: string;
  primary_color?: string;
  primary_color_light?: string;
  primary_color_dark?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  background_color_dark?: string;
  surface_color?: string;
  surface_color_dark?: string;
  text_color?: string;
  text_color_dark?: string;
  muted_color?: string;
  border_color?: string;
  font_family?: string;
  font_family_heading?: string;
  font_size_base?: string;
  font_size_scale?: string;
  line_height_base?: string;
  line_height_heading?: string;
  font_weight_normal?: string;
  font_weight_medium?: string;
  font_weight_bold?: string;
  letter_spacing?: string;
  letter_spacing_heading?: string;
  spacing_unit?: string;
  spacing_xs?: string;
  spacing_sm?: string;
  spacing_md?: string;
  spacing_lg?: string;
  spacing_xl?: string;
  spacing_2xl?: string;
  spacing_3xl?: string;
  border_radius_none?: string;
  border_radius_sm?: string;
  border_radius_md?: string;
  border_radius_lg?: string;
  border_radius_xl?: string;
  border_radius_full?: string;
  border_width?: string;
  shadow_none?: string;
  shadow_sm?: string;
  shadow_md?: string;
  shadow_lg?: string;
  shadow_xl?: string;
  animation_duration?: string;
  animation_duration_slow?: string;
  animation_duration_fast?: string;
  animation_easing?: string;
  enable_animations?: boolean;
  enable_hover_effects?: boolean;
  container_max_width?: string;
  container_padding?: string;
}

interface DesignPreset {
  id: number;
  name: string;
  description: string | null;
  thumbnail: string | null;
  tokens: DesignTokens;
  section_settings: Record<string, any> | null;
  is_built_in: boolean;
}

const defaultTokens: DesignTokens = {
  primary_color: '#2563eb',
  primary_color_light: '#3b82f6',
  primary_color_dark: '#1d4ed8',
  secondary_color: '#64748b',
  accent_color: '#06b6d4',
  background_color: '#ffffff',
  background_color_dark: '#0f172a',
  surface_color: '#f8fafc',
  surface_color_dark: '#1e293b',
  text_color: '#0f172a',
  text_color_dark: '#f8fafc',
  muted_color: '#64748b',
  border_color: '#e2e8f0',
  font_family: 'Inter',
  font_family_heading: 'Inter',
  font_size_base: '16px',
  font_size_scale: '1.25',
  line_height_base: '1.5',
  line_height_heading: '1.2',
  font_weight_normal: '400',
  font_weight_medium: '500',
  font_weight_bold: '700',
  letter_spacing: '0',
  letter_spacing_heading: '-0.02em',
  spacing_xs: '4px',
  spacing_sm: '8px',
  spacing_md: '16px',
  spacing_lg: '24px',
  spacing_xl: '32px',
  spacing_2xl: '48px',
  spacing_3xl: '64px',
  border_radius_sm: '4px',
  border_radius_md: '8px',
  border_radius_lg: '12px',
  border_radius_xl: '16px',
  border_radius_full: '9999px',
  border_width: '1px',
  shadow_sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  shadow_md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  shadow_lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  shadow_xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  animation_duration: '200ms',
  animation_duration_slow: '400ms',
  animation_duration_fast: '100ms',
  animation_easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  enable_animations: true,
  enable_hover_effects: true,
  container_max_width: '1280px',
  container_padding: '16px',
};

const builtInPresets: Omit<DesignPreset, 'id'>[] = [
  {
    name: 'Standard Blå',
    description: 'Profesjonell blå fargepalett for bedriftsnettsteder',
    thumbnail: null,
    is_built_in: true,
    tokens: { ...defaultTokens },
    section_settings: null,
  },
  {
    name: 'Mørk Elegant',
    description: 'Mørkt tema med lilla aksenter',
    thumbnail: null,
    is_built_in: true,
    tokens: {
      ...defaultTokens,
      primary_color: '#8b5cf6',
      primary_color_light: '#a78bfa',
      primary_color_dark: '#7c3aed',
      accent_color: '#f472b6',
      background_color: '#1a1a2e',
      surface_color: '#16213e',
      text_color: '#e2e8f0',
      muted_color: '#94a3b8',
      border_color: '#334155',
    },
    section_settings: null,
  },
  {
    name: 'Frisk Grønn',
    description: 'Naturlig grønn palett for miljøbevisste merkevarer',
    thumbnail: null,
    is_built_in: true,
    tokens: {
      ...defaultTokens,
      primary_color: '#059669',
      primary_color_light: '#10b981',
      primary_color_dark: '#047857',
      accent_color: '#84cc16',
      secondary_color: '#6b7280',
    },
    section_settings: null,
  },
  {
    name: 'Varm Oransje',
    description: 'Energisk oransje tema for kreative prosjekter',
    thumbnail: null,
    is_built_in: true,
    tokens: {
      ...defaultTokens,
      primary_color: '#ea580c',
      primary_color_light: '#f97316',
      primary_color_dark: '#c2410c',
      accent_color: '#fbbf24',
      secondary_color: '#78716c',
    },
    section_settings: null,
  },
];

function ColorPicker({ value, onChange, label }: { value: string; onChange: (val: string) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div 
        className="w-10 h-10 rounded-md border cursor-pointer relative overflow-hidden"
        style={{ backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          data-testid={`color-picker-${label.toLowerCase().replace(/\s/g, '-')}`}
        />
      </div>
      <div className="flex-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs font-mono"
          data-testid={`color-input-${label.toLowerCase().replace(/\s/g, '-')}`}
        />
      </div>
    </div>
  );
}

function DesignEditor() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("colors");
  const [tokens, setTokens] = useState<DesignTokens>(defaultTokens);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: savedTokens, isLoading } = useQuery<DesignTokens | null>({
    queryKey: ['/api/cms/design-tokens'],
  });

  const { data: presets } = useQuery<DesignPreset[]>({
    queryKey: ['/api/cms/design-presets'],
  });

  useEffect(() => {
    if (savedTokens) {
      setTokens({ ...defaultTokens, ...savedTokens });
    }
  }, [savedTokens]);

  const saveMutation = useMutation({
    mutationFn: async (data: DesignTokens) => {
      return authenticatedApiRequest('/api/cms/design-tokens', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Lagret', description: 'Design-tokens er oppdatert' });
      queryClient.invalidateQueries({ queryKey: ['/api/cms/design-tokens'] });
      setHasChanges(false);
    },
    onError: (err: Error) => {
      toast({ title: 'Feil', description: err.message, variant: 'destructive' });
    },
  });

  const applyPresetMutation = useMutation({
    mutationFn: async (presetId: number) => {
      return authenticatedApiRequest(`/api/cms/design-presets/${presetId}/apply`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({ title: 'Tema brukt', description: 'Design-preset er aktivert' });
      queryClient.invalidateQueries({ queryKey: ['/api/cms/design-tokens'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cms/section-design'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Feil', description: err.message, variant: 'destructive' });
    },
  });

  const updateToken = (key: keyof DesignTokens, value: string | boolean) => {
    setTokens(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate(tokens);
  };

  const handleApplyBuiltInPreset = (preset: Omit<DesignPreset, 'id'>) => {
    setTokens({ ...defaultTokens, ...preset.tokens });
    setHasChanges(true);
    toast({ title: 'Tema lastet', description: `${preset.name} er lastet inn. Klikk Lagre for å bruke.` });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Design System
            </CardTitle>
            <CardDescription>
              Tilpass farger, typografi, mellomrom og andre designelementer
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="text-sm text-amber-600 dark:text-amber-400">Ulagrede endringer</span>
            )}
            <Button 
              onClick={handleSave} 
              disabled={saveMutation.isPending || !hasChanges}
              data-testid="button-save-design"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Lagre design
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeSection} onValueChange={setActiveSection}>
            <TabsList className="grid w-full grid-cols-5 mb-6">
              <TabsTrigger value="presets" data-testid="tab-design-presets">
                <Layers className="h-4 w-4 mr-2" />
                Temaer
              </TabsTrigger>
              <TabsTrigger value="colors" data-testid="tab-design-colors">
                <Palette className="h-4 w-4 mr-2" />
                Farger
              </TabsTrigger>
              <TabsTrigger value="typography" data-testid="tab-design-typography">
                <Type className="h-4 w-4 mr-2" />
                Typografi
              </TabsTrigger>
              <TabsTrigger value="spacing" data-testid="tab-design-spacing">
                <Box className="h-4 w-4 mr-2" />
                Mellomrom
              </TabsTrigger>
              <TabsTrigger value="effects" data-testid="tab-design-effects">
                <Sparkles className="h-4 w-4 mr-2" />
                Effekter
              </TabsTrigger>
            </TabsList>

            <TabsContent value="presets" className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Ferdiglagde temaer</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {builtInPresets.map((preset, index) => (
                    <Card 
                      key={index} 
                      className="cursor-pointer hover-elevate transition-all"
                      onClick={() => handleApplyBuiltInPreset(preset)}
                      data-testid={`preset-card-${index}`}
                    >
                      <CardContent className="p-4">
                        <div 
                          className="h-20 rounded-md mb-3 flex items-end p-2"
                          style={{ 
                            background: `linear-gradient(135deg, ${preset.tokens.primary_color} 0%, ${preset.tokens.primary_color_dark} 100%)` 
                          }}
                        >
                          <div className="flex gap-1">
                            <div className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: preset.tokens.accent_color }} />
                            <div className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: preset.tokens.secondary_color }} />
                          </div>
                        </div>
                        <h4 className="font-medium text-sm">{preset.name}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {presets && presets.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Lagrede temaer</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {presets.map((preset) => (
                      <Card 
                        key={preset.id} 
                        className="cursor-pointer hover-elevate transition-all"
                        onClick={() => applyPresetMutation.mutate(preset.id)}
                        data-testid={`saved-preset-${preset.id}`}
                      >
                        <CardContent className="p-4">
                          <div 
                            className="h-20 rounded-md mb-3"
                            style={{ 
                              background: `linear-gradient(135deg, ${preset.tokens.primary_color || '#2563eb'} 0%, ${preset.tokens.primary_color_dark || '#1d4ed8'} 100%)` 
                            }}
                          />
                          <h4 className="font-medium text-sm">{preset.name}</h4>
                          {preset.description && (
                            <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="colors" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Primærfarger</h3>
                  <ColorPicker 
                    label="Primærfarge" 
                    value={tokens.primary_color || '#2563eb'} 
                    onChange={(v) => updateToken('primary_color', v)} 
                  />
                  <ColorPicker 
                    label="Primær lys" 
                    value={tokens.primary_color_light || '#3b82f6'} 
                    onChange={(v) => updateToken('primary_color_light', v)} 
                  />
                  <ColorPicker 
                    label="Primær mørk" 
                    value={tokens.primary_color_dark || '#1d4ed8'} 
                    onChange={(v) => updateToken('primary_color_dark', v)} 
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Sekundærfarger</h3>
                  <ColorPicker 
                    label="Sekundærfarge" 
                    value={tokens.secondary_color || '#64748b'} 
                    onChange={(v) => updateToken('secondary_color', v)} 
                  />
                  <ColorPicker 
                    label="Aksentfarge" 
                    value={tokens.accent_color || '#06b6d4'} 
                    onChange={(v) => updateToken('accent_color', v)} 
                  />
                  <ColorPicker 
                    label="Dempet farge" 
                    value={tokens.muted_color || '#64748b'} 
                    onChange={(v) => updateToken('muted_color', v)} 
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Bakgrunnsfarger</h3>
                  <ColorPicker 
                    label="Bakgrunn (lys)" 
                    value={tokens.background_color || '#ffffff'} 
                    onChange={(v) => updateToken('background_color', v)} 
                  />
                  <ColorPicker 
                    label="Bakgrunn (mørk)" 
                    value={tokens.background_color_dark || '#0f172a'} 
                    onChange={(v) => updateToken('background_color_dark', v)} 
                  />
                  <ColorPicker 
                    label="Overflate (lys)" 
                    value={tokens.surface_color || '#f8fafc'} 
                    onChange={(v) => updateToken('surface_color', v)} 
                  />
                  <ColorPicker 
                    label="Overflate (mørk)" 
                    value={tokens.surface_color_dark || '#1e293b'} 
                    onChange={(v) => updateToken('surface_color_dark', v)} 
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Tekstfarger</h3>
                  <ColorPicker 
                    label="Tekst (lys modus)" 
                    value={tokens.text_color || '#0f172a'} 
                    onChange={(v) => updateToken('text_color', v)} 
                  />
                  <ColorPicker 
                    label="Tekst (mørk modus)" 
                    value={tokens.text_color_dark || '#f8fafc'} 
                    onChange={(v) => updateToken('text_color_dark', v)} 
                  />
                  <ColorPicker 
                    label="Kantfarge" 
                    value={tokens.border_color || '#e2e8f0'} 
                    onChange={(v) => updateToken('border_color', v)} 
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="typography" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Skrifttyper</h3>
                  <div>
                    <Label>Brødtekst font</Label>
                    <select
                      value={tokens.font_family || 'Inter'}
                      onChange={(e) => updateToken('font_family', e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      data-testid="select-font-family"
                    >
                      <option value="Inter">Inter</option>
                      <option value="system-ui">System UI</option>
                      <option value="Arial">Arial</option>
                      <option value="Helvetica">Helvetica</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                    </select>
                  </div>
                  <div>
                    <Label>Overskrift font</Label>
                    <select
                      value={tokens.font_family_heading || 'Inter'}
                      onChange={(e) => updateToken('font_family_heading', e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      data-testid="select-font-heading"
                    >
                      <option value="Inter">Inter</option>
                      <option value="system-ui">System UI</option>
                      <option value="Arial">Arial</option>
                      <option value="Helvetica">Helvetica</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Størrelser</h3>
                  <div>
                    <Label>Basis skriftstørrelse</Label>
                    <Input
                      value={tokens.font_size_base || '16px'}
                      onChange={(e) => updateToken('font_size_base', e.target.value)}
                      placeholder="16px"
                      data-testid="input-font-size-base"
                    />
                  </div>
                  <div>
                    <Label>Størrelsesskala (ratio)</Label>
                    <select
                      value={tokens.font_size_scale || '1.25'}
                      onChange={(e) => updateToken('font_size_scale', e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      data-testid="select-font-scale"
                    >
                      <option value="1.125">Minor Second (1.125)</option>
                      <option value="1.2">Minor Third (1.2)</option>
                      <option value="1.25">Major Third (1.25)</option>
                      <option value="1.333">Perfect Fourth (1.333)</option>
                      <option value="1.5">Perfect Fifth (1.5)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Linjehøyde</h3>
                  <div>
                    <Label>Brødtekst linjehøyde</Label>
                    <Input
                      value={tokens.line_height_base || '1.5'}
                      onChange={(e) => updateToken('line_height_base', e.target.value)}
                      placeholder="1.5"
                      data-testid="input-line-height-base"
                    />
                  </div>
                  <div>
                    <Label>Overskrift linjehøyde</Label>
                    <Input
                      value={tokens.line_height_heading || '1.2'}
                      onChange={(e) => updateToken('line_height_heading', e.target.value)}
                      placeholder="1.2"
                      data-testid="input-line-height-heading"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Vekter</h3>
                  <div>
                    <Label>Normal vekt</Label>
                    <select
                      value={tokens.font_weight_normal || '400'}
                      onChange={(e) => updateToken('font_weight_normal', e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      data-testid="select-weight-normal"
                    >
                      <option value="300">Light (300)</option>
                      <option value="400">Normal (400)</option>
                      <option value="500">Medium (500)</option>
                    </select>
                  </div>
                  <div>
                    <Label>Halvfet vekt</Label>
                    <select
                      value={tokens.font_weight_medium || '500'}
                      onChange={(e) => updateToken('font_weight_medium', e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      data-testid="select-weight-medium"
                    >
                      <option value="500">Medium (500)</option>
                      <option value="600">Semi-bold (600)</option>
                    </select>
                  </div>
                  <div>
                    <Label>Fet vekt</Label>
                    <select
                      value={tokens.font_weight_bold || '700'}
                      onChange={(e) => updateToken('font_weight_bold', e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      data-testid="select-weight-bold"
                    >
                      <option value="600">Semi-bold (600)</option>
                      <option value="700">Bold (700)</option>
                      <option value="800">Extra-bold (800)</option>
                    </select>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="spacing" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Mellomrom-skala</h3>
                  <div className="space-y-3">
                    {[
                      { key: 'spacing_xs', label: 'XS (ekstra liten)' },
                      { key: 'spacing_sm', label: 'SM (liten)' },
                      { key: 'spacing_md', label: 'MD (medium)' },
                      { key: 'spacing_lg', label: 'LG (stor)' },
                      { key: 'spacing_xl', label: 'XL (ekstra stor)' },
                      { key: 'spacing_2xl', label: '2XL' },
                      { key: 'spacing_3xl', label: '3XL' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-3">
                        <div 
                          className="bg-primary/20 rounded" 
                          style={{ 
                            width: tokens[key as keyof DesignTokens] as string || '8px', 
                            height: '24px' 
                          }} 
                        />
                        <div className="flex-1">
                          <Label className="text-xs">{label}</Label>
                          <Input
                            value={(tokens[key as keyof DesignTokens] as string) || ''}
                            onChange={(e) => updateToken(key as keyof DesignTokens, e.target.value)}
                            placeholder="8px"
                            className="h-8"
                            data-testid={`input-${key}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Avrunding (Border Radius)</h3>
                  <div className="space-y-3">
                    {[
                      { key: 'border_radius_sm', label: 'SM (liten)' },
                      { key: 'border_radius_md', label: 'MD (medium)' },
                      { key: 'border_radius_lg', label: 'LG (stor)' },
                      { key: 'border_radius_xl', label: 'XL (ekstra stor)' },
                      { key: 'border_radius_full', label: 'Full (sirkel)' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 bg-primary/20 border border-primary/40"
                          style={{ 
                            borderRadius: (tokens[key as keyof DesignTokens] as string) || '4px'
                          }} 
                        />
                        <div className="flex-1">
                          <Label className="text-xs">{label}</Label>
                          <Input
                            value={(tokens[key as keyof DesignTokens] as string) || ''}
                            onChange={(e) => updateToken(key as keyof DesignTokens, e.target.value)}
                            placeholder="8px"
                            className="h-8"
                            data-testid={`input-${key}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mt-6">Container</h3>
                  <div>
                    <Label>Maks bredde</Label>
                    <Input
                      value={tokens.container_max_width || '1280px'}
                      onChange={(e) => updateToken('container_max_width', e.target.value)}
                      placeholder="1280px"
                      data-testid="input-container-max-width"
                    />
                  </div>
                  <div>
                    <Label>Padding</Label>
                    <Input
                      value={tokens.container_padding || '16px'}
                      onChange={(e) => updateToken('container_padding', e.target.value)}
                      placeholder="16px"
                      data-testid="input-container-padding"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="effects" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Skygger</h3>
                  {[
                    { key: 'shadow_sm', label: 'Liten skygge' },
                    { key: 'shadow_md', label: 'Medium skygge' },
                    { key: 'shadow_lg', label: 'Stor skygge' },
                    { key: 'shadow_xl', label: 'Ekstra stor skygge' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-xs">{label}</Label>
                      <div className="flex gap-3 items-center">
                        <div 
                          className="w-16 h-10 bg-card rounded-md"
                          style={{ boxShadow: (tokens[key as keyof DesignTokens] as string) || 'none' }}
                        />
                        <Input
                          value={(tokens[key as keyof DesignTokens] as string) || ''}
                          onChange={(e) => updateToken(key as keyof DesignTokens, e.target.value)}
                          className="flex-1 text-xs font-mono"
                          data-testid={`input-${key}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Animasjoner</h3>
                  <div>
                    <Label>Standard varighet</Label>
                    <Input
                      value={tokens.animation_duration || '200ms'}
                      onChange={(e) => updateToken('animation_duration', e.target.value)}
                      placeholder="200ms"
                      data-testid="input-animation-duration"
                    />
                  </div>
                  <div>
                    <Label>Rask varighet</Label>
                    <Input
                      value={tokens.animation_duration_fast || '100ms'}
                      onChange={(e) => updateToken('animation_duration_fast', e.target.value)}
                      placeholder="100ms"
                      data-testid="input-animation-fast"
                    />
                  </div>
                  <div>
                    <Label>Langsom varighet</Label>
                    <Input
                      value={tokens.animation_duration_slow || '400ms'}
                      onChange={(e) => updateToken('animation_duration_slow', e.target.value)}
                      placeholder="400ms"
                      data-testid="input-animation-slow"
                    />
                  </div>
                  <div>
                    <Label>Easing funksjon</Label>
                    <select
                      value={tokens.animation_easing || 'cubic-bezier(0.4, 0, 0.2, 1)'}
                      onChange={(e) => updateToken('animation_easing', e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      data-testid="select-animation-easing"
                    >
                      <option value="linear">Linear</option>
                      <option value="ease">Ease</option>
                      <option value="ease-in">Ease In</option>
                      <option value="ease-out">Ease Out</option>
                      <option value="ease-in-out">Ease In Out</option>
                      <option value="cubic-bezier(0.4, 0, 0.2, 1)">Standard (Material)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t">
                    <div>
                      <Label>Aktiver animasjoner</Label>
                      <p className="text-xs text-muted-foreground">Slå av alle animasjoner</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tokens.enable_animations !== false}
                      onClick={() => updateToken('enable_animations', !tokens.enable_animations)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        tokens.enable_animations !== false ? 'bg-primary' : 'bg-input'
                      }`}
                      data-testid="toggle-animations"
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                        tokens.enable_animations !== false ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Hover-effekter</Label>
                      <p className="text-xs text-muted-foreground">Aktiver hover-tilstander</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tokens.enable_hover_effects !== false}
                      onClick={() => updateToken('enable_hover_effects', !tokens.enable_hover_effects)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        tokens.enable_hover_effects !== false ? 'bg-primary' : 'bg-input'
                      }`}
                      data-testid="toggle-hover-effects"
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                        tokens.enable_hover_effects !== false ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== MEDIA LIBRARY ==========
interface MediaItem {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  url: string;
  alt_text: string | null;
  title: string | null;
  description: string | null;
  folder_id: number | null;
  tags: string[] | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

interface MediaFolder {
  id: number;
  name: string;
  parent_id: number | null;
}

function MediaLibrary() {
  const { toast } = useToast();
  const [currentFolder, setCurrentFolder] = useState<number | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const { data: mediaData, isLoading: mediaLoading, refetch: refetchMedia } = useQuery<MediaItem[]>({
    queryKey: ['/api/cms/media', currentFolder],
    queryFn: async () => {
      const url = currentFolder ? `/api/cms/media?folder_id=${currentFolder}` : '/api/cms/media';
      const res = await fetch(url);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });
  const media = Array.isArray(mediaData) ? mediaData : [];

  const { data: foldersData, refetch: refetchFolders } = useQuery<MediaFolder[]>({
    queryKey: ['/api/cms/media/folders'],
    queryFn: async () => {
      const res = await fetch('/api/cms/media/folders');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });
  const folders = Array.isArray(foldersData) ? foldersData : [];

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      return authenticatedApiRequest('/api/cms/media/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: currentFolder })
      });
    },
    onSuccess: () => {
      refetchFolders();
      setNewFolderName("");
      setShowNewFolder(false);
      toast({ title: "Mappe opprettet" });
    }
  });

  const updateMediaMutation = useMutation({
    mutationFn: async (data: Partial<MediaItem> & { id: number }) => {
      return authenticatedApiRequest(`/api/cms/media/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      refetchMedia();
      toast({ title: "Media oppdatert" });
    }
  });

  const deleteMediaMutation = useMutation({
    mutationFn: async (id: number) => {
      return authenticatedApiRequest(`/api/cms/media/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      refetchMedia();
      setSelectedMedia(null);
      toast({ title: "Media slettet" });
    }
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Mediebibliotek
              </CardTitle>
              <CardDescription>Last opp og organiser bilder og filer</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)} data-testid="button-new-folder">
                <FolderPlus className="h-4 w-4 mr-1" />
                Ny mappe
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <div className="w-48 space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Mapper</h4>
              <Button
                variant={currentFolder === null ? "secondary" : "ghost"}
                className="w-full justify-start"
                onClick={() => setCurrentFolder(null)}
                data-testid="folder-root"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Alle filer
              </Button>
              {folders.map(folder => (
                <Button
                  key={folder.id}
                  variant={currentFolder === folder.id ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setCurrentFolder(folder.id)}
                  data-testid={`folder-${folder.id}`}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  {folder.name}
                </Button>
              ))}
            </div>

            <div className="flex-1">
              {mediaLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : media.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Image className="h-12 w-12 mb-4 opacity-50" />
                  <p>Ingen filer i denne mappen</p>
                  <p className="text-sm">Last opp filer via URL for å komme i gang</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-4">
                  {media.map(item => (
                    <div
                      key={item.id}
                      className={`group relative rounded-lg border p-2 cursor-pointer hover-elevate ${
                        selectedMedia?.id === item.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedMedia(item)}
                      data-testid={`media-${item.id}`}
                    >
                      {item.mime_type.startsWith('image/') ? (
                        <img
                          src={item.url}
                          alt={item.alt_text || item.original_name}
                          className="w-full h-24 object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center bg-muted rounded">
                          <FileText className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <p className="mt-2 text-xs truncate">{item.original_name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(item.file_size)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedMedia && (
              <div className="w-72 border-l pl-6 space-y-4">
                <h4 className="font-medium">Detaljer</h4>
                {selectedMedia.mime_type.startsWith('image/') && (
                  <img
                    src={selectedMedia.url}
                    alt={selectedMedia.alt_text || ''}
                    className="w-full h-32 object-cover rounded"
                  />
                )}
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Tittel</Label>
                    <Input
                      value={selectedMedia.title || ''}
                      onChange={(e) => setSelectedMedia({ ...selectedMedia, title: e.target.value })}
                      placeholder="Tittel"
                      data-testid="input-media-title"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Alt-tekst</Label>
                    <Input
                      value={selectedMedia.alt_text || ''}
                      onChange={(e) => setSelectedMedia({ ...selectedMedia, alt_text: e.target.value })}
                      placeholder="Beskrivelse for skjermlesere"
                      data-testid="input-media-alt"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">URL</Label>
                    <Input value={selectedMedia.url} readOnly className="text-xs" data-testid="input-media-url" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateMediaMutation.mutate(selectedMedia)}
                      disabled={updateMediaMutation.isPending}
                      data-testid="button-save-media"
                    >
                      {updateMediaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Lagre
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMediaMutation.mutate(selectedMedia.id)}
                      disabled={deleteMediaMutation.isPending}
                      data-testid="button-delete-media"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opprett ny mappe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Mappenavn"
              data-testid="input-new-folder-name"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowNewFolder(false)}>Avbryt</Button>
              <Button
                onClick={() => createFolderMutation.mutate(newFolderName)}
                disabled={!newFolderName || createFolderMutation.isPending}
                data-testid="button-create-folder"
              >
                {createFolderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Opprett
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========== SEO EDITOR ==========
interface GlobalSEO {
  id?: number;
  site_name: string;
  site_description: string;
  default_og_image: string;
  google_site_verification: string;
  bing_site_verification: string;
  favicon_url: string;
}

function SEOEditor() {
  const { toast } = useToast();
  const [globalSeo, setGlobalSeo] = useState<GlobalSEO>({
    site_name: '',
    site_description: '',
    default_og_image: '',
    google_site_verification: '',
    bing_site_verification: '',
    favicon_url: ''
  });

  const { data: seoData, isLoading } = useQuery<GlobalSEO | null>({
    queryKey: ['/api/cms/seo/global'],
    queryFn: async () => {
      const res = await fetch('/api/cms/seo/global');
      const data = await res.json();
      return data && !data.error ? data : null;
    }
  });

  useEffect(() => {
    if (seoData) {
      setGlobalSeo(seoData);
    }
  }, [seoData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return authenticatedApiRequest('/api/cms/seo/global', {
        method: 'PUT',
        body: JSON.stringify(globalSeo)
      });
    },
    onSuccess: () => {
      toast({ title: "SEO-innstillinger lagret" });
    },
    onError: (error: Error) => {
      toast({ title: "Feil", description: error.message, variant: "destructive" });
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                SEO-innstillinger
              </CardTitle>
              <CardDescription>Optimaliser nettstedet for søkemotorer</CardDescription>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-seo">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Lagre endringer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Grunnleggende</h3>
              <div>
                <Label>Nettstedsnavn</Label>
                <Input
                  value={globalSeo.site_name}
                  onChange={(e) => setGlobalSeo({ ...globalSeo, site_name: e.target.value })}
                  placeholder="Smart Timing"
                  data-testid="input-seo-site-name"
                />
              </div>
              <div>
                <Label>Nettstedsbeskrivelse</Label>
                <Textarea
                  value={globalSeo.site_description}
                  onChange={(e) => setGlobalSeo({ ...globalSeo, site_description: e.target.value })}
                  placeholder="Profesjonell timeregistrering for norske bedrifter"
                  rows={3}
                  data-testid="input-seo-site-description"
                />
              </div>
              <div>
                <Label>Favicon URL</Label>
                <Input
                  value={globalSeo.favicon_url}
                  onChange={(e) => setGlobalSeo({ ...globalSeo, favicon_url: e.target.value })}
                  placeholder="/favicon.ico"
                  data-testid="input-seo-favicon"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Sosiale medier</h3>
              <div>
                <Label>Standard Open Graph-bilde</Label>
                <Input
                  value={globalSeo.default_og_image}
                  onChange={(e) => setGlobalSeo({ ...globalSeo, default_og_image: e.target.value })}
                  placeholder="https://example.com/og-image.jpg"
                  data-testid="input-seo-og-image"
                />
                <p className="text-xs text-muted-foreground mt-1">Anbefalt størrelse: 1200x630 piksler</p>
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">Verifisering</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Google Search Console</Label>
                <Input
                  value={globalSeo.google_site_verification}
                  onChange={(e) => setGlobalSeo({ ...globalSeo, google_site_verification: e.target.value })}
                  placeholder="Verifiseringskode"
                  data-testid="input-seo-google-verification"
                />
              </div>
              <div>
                <Label>Bing Webmaster Tools</Label>
                <Input
                  value={globalSeo.bing_site_verification}
                  onChange={(e) => setGlobalSeo({ ...globalSeo, bing_site_verification: e.target.value })}
                  placeholder="Verifiseringskode"
                  data-testid="input-seo-bing-verification"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== FORM BUILDER ==========
interface FormField {
  id: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'number';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

interface CMSForm {
  id: number;
  name: string;
  description: string | null;
  fields: FormField[];
  submit_button_text: string;
  success_message: string;
  notification_email: string | null;
  is_active: boolean;
  created_at: string;
}

interface FormSubmission {
  id: number;
  form_id: number;
  data: Record<string, any>;
  ip_address: string;
  is_read: boolean;
  created_at: string;
}

function FormBuilder() {
  const { toast } = useToast();
  const [selectedForm, setSelectedForm] = useState<CMSForm | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFormName, setNewFormName] = useState("");
  const [viewSubmissions, setViewSubmissions] = useState<number | null>(null);

  const { data: formsData, refetch: refetchForms } = useQuery<CMSForm[]>({
    queryKey: ['/api/cms/forms'],
    queryFn: async () => {
      const res = await fetch('/api/cms/forms');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });
  const forms = Array.isArray(formsData) ? formsData : [];

  const { data: submissions = [] } = useQuery<FormSubmission[]>({
    queryKey: ['/api/cms/forms', viewSubmissions, 'submissions'],
    queryFn: async () => {
      if (!viewSubmissions) return [];
      const res = await authenticatedApiRequest(`/api/cms/forms/${viewSubmissions}/submissions`);
      return res;
    },
    enabled: !!viewSubmissions
  });

  const createFormMutation = useMutation({
    mutationFn: async (name: string) => {
      return authenticatedApiRequest('/api/cms/forms', {
        method: 'POST',
        body: JSON.stringify({
          name,
          fields: [
            { id: '1', type: 'text', label: 'Navn', required: true },
            { id: '2', type: 'email', label: 'E-post', required: true },
            { id: '3', type: 'textarea', label: 'Melding', required: true }
          ],
          submit_button_text: 'Send inn',
          success_message: 'Takk for din henvendelse!'
        })
      });
    },
    onSuccess: () => {
      refetchForms();
      setNewFormName("");
      setShowNewForm(false);
      toast({ title: "Skjema opprettet" });
    }
  });

  const updateFormMutation = useMutation({
    mutationFn: async (form: CMSForm) => {
      return authenticatedApiRequest(`/api/cms/forms/${form.id}`, {
        method: 'PUT',
        body: JSON.stringify(form)
      });
    },
    onSuccess: () => {
      refetchForms();
      toast({ title: "Skjema oppdatert" });
    }
  });

  const deleteFormMutation = useMutation({
    mutationFn: async (id: number) => {
      return authenticatedApiRequest(`/api/cms/forms/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      refetchForms();
      setSelectedForm(null);
      toast({ title: "Skjema slettet" });
    }
  });

  const addField = () => {
    if (!selectedForm) return;
    const newField: FormField = {
      id: Date.now().toString(),
      type: 'text',
      label: 'Nytt felt',
      required: false
    };
    setSelectedForm({
      ...selectedForm,
      fields: [...selectedForm.fields, newField]
    });
  };

  const updateField = (fieldId: string, updates: Partial<FormField>) => {
    if (!selectedForm) return;
    setSelectedForm({
      ...selectedForm,
      fields: selectedForm.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
    });
  };

  const removeField = (fieldId: string) => {
    if (!selectedForm) return;
    setSelectedForm({
      ...selectedForm,
      fields: selectedForm.fields.filter(f => f.id !== fieldId)
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FormInput className="h-5 w-5" />
                Skjemabygger
              </CardTitle>
              <CardDescription>Opprett og administrer kontaktskjemaer</CardDescription>
            </div>
            <Button onClick={() => setShowNewForm(true)} data-testid="button-new-form">
              <Plus className="h-4 w-4 mr-2" />
              Nytt skjema
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {forms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <FormInput className="h-12 w-12 mb-4 opacity-50" />
              <p>Ingen skjemaer ennå</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowNewForm(true)} data-testid="button-create-first-form">
                Opprett ditt første skjema
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {forms.map(form => (
                <Card
                  key={form.id}
                  className={`cursor-pointer hover-elevate ${selectedForm?.id === form.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedForm(form)}
                  data-testid={`form-${form.id}`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{form.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {form.fields?.length || 0} felt
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setViewSubmissions(form.id); }}
                        data-testid={`button-view-submissions-${form.id}`}
                      >
                        <Inbox className="h-3 w-3 mr-1" />
                        Svar
                      </Button>
                      <Button
                        size="sm"
                        variant={form.is_active ? "default" : "secondary"}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateFormMutation.mutate({ ...form, is_active: !form.is_active });
                        }}
                        data-testid={`button-toggle-form-${form.id}`}
                      >
                        {form.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Rediger: {selectedForm.name}</CardTitle>
                <CardDescription>Embed-kode: /api/forms/{selectedForm.id}/submit</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => updateFormMutation.mutate(selectedForm)} disabled={updateFormMutation.isPending} data-testid="button-save-form">
                  {updateFormMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Lagre
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteFormMutation.mutate(selectedForm.id)}
                  disabled={deleteFormMutation.isPending}
                  data-testid="button-delete-form"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Skjemanavn</Label>
                <Input
                  value={selectedForm.name}
                  onChange={(e) => setSelectedForm({ ...selectedForm, name: e.target.value })}
                  data-testid="input-form-name"
                />
              </div>
              <div>
                <Label>Varslingsmail</Label>
                <Input
                  type="email"
                  value={selectedForm.notification_email || ''}
                  onChange={(e) => setSelectedForm({ ...selectedForm, notification_email: e.target.value })}
                  placeholder="kontakt@firma.no"
                  data-testid="input-form-notification-email"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <Label>Felt</Label>
                <Button size="sm" variant="outline" onClick={addField} data-testid="button-add-field">
                  <Plus className="h-4 w-4 mr-1" />
                  Legg til felt
                </Button>
              </div>
              <div className="space-y-3">
                {selectedForm.fields?.map((field, index) => (
                  <div key={field.id} className="flex gap-3 items-start p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1 grid grid-cols-4 gap-3">
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(field.id, { label: e.target.value })}
                        placeholder="Feltlabel"
                        data-testid={`input-field-label-${index}`}
                      />
                      <select
                        value={field.type}
                        onChange={(e) => updateField(field.id, { type: e.target.value as FormField['type'] })}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        data-testid={`select-field-type-${index}`}
                      >
                        <option value="text">Tekst</option>
                        <option value="email">E-post</option>
                        <option value="tel">Telefon</option>
                        <option value="number">Tall</option>
                        <option value="textarea">Tekstområde</option>
                        <option value="checkbox">Avkrysning</option>
                        <option value="select">Nedtrekksliste</option>
                      </select>
                      <Input
                        value={field.placeholder || ''}
                        onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                        placeholder="Placeholder"
                        data-testid={`input-field-placeholder-${index}`}
                      />
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateField(field.id, { required: e.target.checked })}
                            className="rounded"
                            data-testid={`checkbox-field-required-${index}`}
                          />
                          Påkrevd
                        </label>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeField(field.id)}
                      data-testid={`button-remove-field-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Knappetekst</Label>
                <Input
                  value={selectedForm.submit_button_text}
                  onChange={(e) => setSelectedForm({ ...selectedForm, submit_button_text: e.target.value })}
                  placeholder="Send inn"
                  data-testid="input-form-submit-text"
                />
              </div>
              <div>
                <Label>Suksessmelding</Label>
                <Input
                  value={selectedForm.success_message}
                  onChange={(e) => setSelectedForm({ ...selectedForm, success_message: e.target.value })}
                  placeholder="Takk for din henvendelse!"
                  data-testid="input-form-success-message"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opprett nytt skjema</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newFormName}
              onChange={(e) => setNewFormName(e.target.value)}
              placeholder="Skjemanavn"
              data-testid="input-new-form-name"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowNewForm(false)}>Avbryt</Button>
              <Button
                onClick={() => createFormMutation.mutate(newFormName)}
                disabled={!newFormName || createFormMutation.isPending}
                data-testid="button-create-form"
              >
                {createFormMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Opprett
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewSubmissions} onOpenChange={(open) => !open && setViewSubmissions(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Skjemainnsendelser</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            {submissions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Ingen innsendelser ennå</p>
            ) : (
              <div className="space-y-4">
                {submissions.map(sub => (
                  <Card key={sub.id} data-testid={`submission-${sub.id}`}>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground mb-2">
                        {new Date(sub.created_at).toLocaleString('nb-NO')}
                      </div>
                      <div className="space-y-1">
                        {Object.entries(sub.data).map(([key, value]) => (
                          <div key={key} className="text-sm">
                            <span className="font-medium">{key}:</span> {String(value)}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========== NAVIGATION EDITOR ==========
interface NavItem {
  id: string;
  label: string;
  url: string;
  target?: '_blank' | '_self';
  children?: NavItem[];
}

interface Navigation {
  id: number;
  name: string;
  location: string;
  items: NavItem[];
  is_active: boolean;
}

function NavigationEditor() {
  const { toast } = useToast();
  const [selectedLocation, setSelectedLocation] = useState<string>('header');
  const [navData, setNavData] = useState<Navigation | null>(null);

  const { data: navigation, refetch } = useQuery<Navigation | null>({
    queryKey: ['/api/cms/navigation', selectedLocation],
    queryFn: async () => {
      const res = await fetch(`/api/cms/navigation/${selectedLocation}`);
      const data = await res.json();
      return data && !data.error ? data : null;
    }
  });

  useEffect(() => {
    if (navigation) {
      setNavData(navigation);
    } else {
      setNavData({
        id: 0,
        name: selectedLocation === 'header' ? 'Hovedmeny' : selectedLocation === 'footer' ? 'Footermeny' : 'Meny',
        location: selectedLocation,
        items: [],
        is_active: true
      });
    }
  }, [navigation, selectedLocation]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!navData) return;
      return authenticatedApiRequest(`/api/cms/navigation/${selectedLocation}`, {
        method: 'PUT',
        body: JSON.stringify({ name: navData.name, items: navData.items })
      });
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Navigasjon lagret" });
    }
  });

  const addItem = () => {
    if (!navData) return;
    const newItem: NavItem = {
      id: Date.now().toString(),
      label: 'Ny lenke',
      url: '#',
      target: '_self'
    };
    setNavData({ ...navData, items: [...navData.items, newItem] });
  };

  const updateItem = (itemId: string, updates: Partial<NavItem>) => {
    if (!navData) return;
    setNavData({
      ...navData,
      items: navData.items.map(item => item.id === itemId ? { ...item, ...updates } : item)
    });
  };

  const removeItem = (itemId: string) => {
    if (!navData) return;
    setNavData({
      ...navData,
      items: navData.items.filter(item => item.id !== itemId)
    });
  };

  const locations = [
    { value: 'header', label: 'Hovedmeny (Header)' },
    { value: 'footer', label: 'Footermeny' },
    { value: 'mobile', label: 'Mobilmeny' }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Menu className="h-5 w-5" />
                Navigasjon
              </CardTitle>
              <CardDescription>Administrer nettstedets menyer og lenker</CardDescription>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-nav">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Lagre endringer
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <div className="w-48 space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Menyplasseringer</h4>
              {locations.map(loc => (
                <Button
                  key={loc.value}
                  variant={selectedLocation === loc.value ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedLocation(loc.value)}
                  data-testid={`nav-location-${loc.value}`}
                >
                  {loc.label}
                </Button>
              ))}
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">{navData?.name || 'Meny'}</h3>
                <Button size="sm" variant="outline" onClick={addItem} data-testid="button-add-nav-item">
                  <Plus className="h-4 w-4 mr-1" />
                  Legg til lenke
                </Button>
              </div>

              {navData?.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Link2 className="h-8 w-8 mb-2 opacity-50" />
                  <p>Ingen menyelementer</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={addItem} data-testid="button-add-first-nav-item">
                    Legg til første lenke
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {navData?.items.map((item, index) => (
                    <div key={item.id} className="flex gap-3 items-center p-3 bg-muted/50 rounded-lg">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                      <Input
                        value={item.label}
                        onChange={(e) => updateItem(item.id, { label: e.target.value })}
                        placeholder="Lenketekst"
                        className="flex-1"
                        data-testid={`input-nav-label-${index}`}
                      />
                      <Input
                        value={item.url}
                        onChange={(e) => updateItem(item.id, { url: e.target.value })}
                        placeholder="URL"
                        className="flex-1"
                        data-testid={`input-nav-url-${index}`}
                      />
                      <select
                        value={item.target || '_self'}
                        onChange={(e) => updateItem(item.id, { target: e.target.value as '_blank' | '_self' })}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        data-testid={`select-nav-target-${index}`}
                      >
                        <option value="_self">Samme vindu</option>
                        <option value="_blank">Nytt vindu</option>
                      </select>
                      <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)} data-testid={`button-remove-nav-${index}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== BLOG EDITOR ==========
interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  featured_image: string | null;
  author: string | null;
  category_id: number | null;
  category_name?: string | null;
  tags: string[] | null;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

function BlogEditor() {
  const { toast } = useToast();
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>('');

  const { data: postsData, refetch: refetchPosts } = useQuery<BlogPost[]>({
    queryKey: ['/api/cms/posts', filterStatus],
    queryFn: async () => {
      const url = filterStatus ? `/api/cms/posts?status=${filterStatus}` : '/api/cms/posts';
      const res = await fetch(url);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });
  const posts = Array.isArray(postsData) ? postsData : [];

  const { data: categoriesData, refetch: refetchCategories } = useQuery<BlogCategory[]>({
    queryKey: ['/api/cms/categories'],
    queryFn: async () => {
      const res = await fetch('/api/cms/categories');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });
  const categories = Array.isArray(categoriesData) ? categoriesData : [];

  const createPostMutation = useMutation({
    mutationFn: async (title: string) => {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return authenticatedApiRequest('/api/cms/posts', {
        method: 'POST',
        body: JSON.stringify({ title, slug, status: 'draft' })
      });
    },
    onSuccess: (newPost) => {
      refetchPosts();
      setNewPostTitle("");
      setShowNewPost(false);
      setSelectedPost(newPost);
      toast({ title: "Innlegg opprettet" });
    }
  });

  const updatePostMutation = useMutation({
    mutationFn: async (post: BlogPost) => {
      return authenticatedApiRequest(`/api/cms/posts/${post.id}`, {
        method: 'PUT',
        body: JSON.stringify(post)
      });
    },
    onSuccess: () => {
      refetchPosts();
      toast({ title: "Innlegg oppdatert" });
    }
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id: number) => {
      return authenticatedApiRequest(`/api/cms/posts/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      refetchPosts();
      setSelectedPost(null);
      toast({ title: "Innlegg slettet" });
    }
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return authenticatedApiRequest('/api/cms/categories', {
        method: 'POST',
        body: JSON.stringify({ name, slug })
      });
    },
    onSuccess: () => {
      refetchCategories();
      setNewCategoryName("");
      setShowNewCategory(false);
      toast({ title: "Kategori opprettet" });
    }
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    };
    const labels: Record<string, string> = {
      draft: 'Utkast',
      published: 'Publisert',
      archived: 'Arkivert'
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Newspaper className="h-5 w-5" />
                Blogg og Artikler
              </CardTitle>
              <CardDescription>Opprett og publiser innhold</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowNewCategory(true)} data-testid="button-new-category">
                <Tag className="h-4 w-4 mr-2" />
                Ny kategori
              </Button>
              <Button onClick={() => setShowNewPost(true)} data-testid="button-new-post">
                <Plus className="h-4 w-4 mr-2" />
                Nytt innlegg
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              data-testid="select-filter-status"
            >
              <option value="">Alle innlegg</option>
              <option value="draft">Utkast</option>
              <option value="published">Publisert</option>
              <option value="archived">Arkivert</option>
            </select>
          </div>

          {posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Newspaper className="h-12 w-12 mb-4 opacity-50" />
              <p>Ingen innlegg ennå</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowNewPost(true)} data-testid="button-create-first-post">
                Opprett ditt første innlegg
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <div
                  key={post.id}
                  className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer hover-elevate ${
                    selectedPost?.id === post.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedPost(post)}
                  data-testid={`post-${post.id}`}
                >
                  <div>
                    <h4 className="font-medium">{post.title}</h4>
                    <div className="flex gap-2 items-center mt-1">
                      {getStatusBadge(post.status)}
                      {post.category_name && (
                        <span className="text-xs text-muted-foreground">{post.category_name}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(post.created_at).toLocaleDateString('nb-NO')}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedPost(post); }} data-testid={`button-edit-post-${post.id}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPost && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Rediger innlegg</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => updatePostMutation.mutate({ ...selectedPost, status: 'published' })}
                  disabled={updatePostMutation.isPending || selectedPost.status === 'published'}
                  data-testid="button-publish-post"
                >
                  Publiser
                </Button>
                <Button onClick={() => updatePostMutation.mutate(selectedPost)} disabled={updatePostMutation.isPending} data-testid="button-save-post">
                  {updatePostMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Lagre
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deletePostMutation.mutate(selectedPost.id)}
                  disabled={deletePostMutation.isPending}
                  data-testid="button-delete-post"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label>Tittel</Label>
                  <Input
                    value={selectedPost.title}
                    onChange={(e) => setSelectedPost({ ...selectedPost, title: e.target.value })}
                    data-testid="input-post-title"
                  />
                </div>
                <div>
                  <Label>URL-slug</Label>
                  <Input
                    value={selectedPost.slug}
                    onChange={(e) => setSelectedPost({ ...selectedPost, slug: e.target.value })}
                    data-testid="input-post-slug"
                  />
                </div>
                <div>
                  <Label>Utdrag</Label>
                  <Textarea
                    value={selectedPost.excerpt || ''}
                    onChange={(e) => setSelectedPost({ ...selectedPost, excerpt: e.target.value })}
                    rows={2}
                    data-testid="input-post-excerpt"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Kategori</Label>
                  <select
                    value={selectedPost.category_id || ''}
                    onChange={(e) => setSelectedPost({ ...selectedPost, category_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="select-post-category"
                  >
                    <option value="">Ingen kategori</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Forfatter</Label>
                  <Input
                    value={selectedPost.author || ''}
                    onChange={(e) => setSelectedPost({ ...selectedPost, author: e.target.value })}
                    data-testid="input-post-author"
                  />
                </div>
                <div>
                  <Label>Fremhevet bilde URL</Label>
                  <Input
                    value={selectedPost.featured_image || ''}
                    onChange={(e) => setSelectedPost({ ...selectedPost, featured_image: e.target.value })}
                    placeholder="https://..."
                    data-testid="input-post-image"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    value={selectedPost.status}
                    onChange={(e) => setSelectedPost({ ...selectedPost, status: e.target.value as BlogPost['status'] })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="select-post-status"
                  >
                    <option value="draft">Utkast</option>
                    <option value="published">Publisert</option>
                    <option value="archived">Arkivert</option>
                  </select>
                </div>
              </div>
            </div>
            <div>
              <Label>Innhold</Label>
              <Textarea
                value={selectedPost.content || ''}
                onChange={(e) => setSelectedPost({ ...selectedPost, content: e.target.value })}
                rows={12}
                placeholder="Skriv innholdet her..."
                data-testid="input-post-content"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showNewPost} onOpenChange={setShowNewPost}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opprett nytt innlegg</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newPostTitle}
              onChange={(e) => setNewPostTitle(e.target.value)}
              placeholder="Innleggets tittel"
              data-testid="input-new-post-title"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowNewPost(false)}>Avbryt</Button>
              <Button
                onClick={() => createPostMutation.mutate(newPostTitle)}
                disabled={!newPostTitle || createPostMutation.isPending}
                data-testid="button-create-post"
              >
                {createPostMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Opprett
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewCategory} onOpenChange={setShowNewCategory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opprett ny kategori</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Kategorinavn"
              data-testid="input-new-category-name"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowNewCategory(false)}>Avbryt</Button>
              <Button
                onClick={() => createCategoryMutation.mutate(newCategoryName)}
                disabled={!newCategoryName || createCategoryMutation.isPending}
                data-testid="button-create-category"
              >
                {createCategoryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Opprett
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Content Version interface
interface ContentVersion {
  id: number;
  content_type: string;
  content_id: number | null;
  version_number: number;
  data: any;
  change_description: string | null;
  changed_by: string | null;
  created_at: string;
}

function VersionHistory() {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedVersion, setSelectedVersion] = useState<ContentVersion | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const { data: versions = [], isLoading } = useQuery<ContentVersion[]>({
    queryKey: ['/api/cms/versions', selectedType],
    queryFn: async () => {
      const url = selectedType === 'all' 
        ? '/api/cms/versions?limit=100'
        : `/api/cms/versions?content_type=${selectedType}&limit=100`;
      return authenticatedApiRequest(url);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: number) => {
      return authenticatedApiRequest(`/api/cms/versions/${versionId}/restore`, { method: 'POST' });
    },
    onSuccess: () => {
      toast({ title: 'Suksess', description: 'Versjonen ble gjenopprettet' });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && 
        typeof query.queryKey[0] === 'string' && 
        query.queryKey[0].startsWith('/api/cms')
      });
      setShowDetailDialog(false);
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const contentTypeLabels: Record<string, string> = {
    hero: 'Hero-seksjon',
    sections: 'Seksjoner',
    feature: 'Funksjon',
    testimonial: 'Referanse',
    design_tokens: 'Design-tokens',
    seo: 'SEO-innstillinger',
    blog_post: 'Blogginnlegg',
    navigation: 'Navigasjon',
    form: 'Skjema',
  };

  const contentTypeIcons: Record<string, LucideIcon> = {
    hero: Rocket,
    sections: Layers,
    feature: Star,
    testimonial: MessageCircle,
    design_tokens: Palette,
    seo: Search,
    blog_post: Newspaper,
    navigation: Menu,
    form: FormInput,
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('nb-NO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const viewVersionDetails = async (version: ContentVersion) => {
    try {
      const fullVersion = await authenticatedApiRequest(`/api/cms/versions/${version.id}`);
      setSelectedVersion(fullVersion);
      setShowDetailDialog(true);
    } catch (error: any) {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Versjonshistorikk
          </CardTitle>
          <CardDescription>
            Se tidligere versjoner av innholdet og gjenopprett ved behov
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="content-type-filter">Filtrer etter innholdstype</Label>
            <select
              id="content-type-filter"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full max-w-xs h-9 rounded-md border border-input bg-background px-3 text-sm mt-1"
              data-testid="select-version-filter"
            >
              <option value="all">Alle typer</option>
              <option value="hero">Hero-seksjon</option>
              <option value="sections">Seksjoner</option>
              <option value="feature">Funksjoner</option>
              <option value="testimonial">Referanser</option>
              <option value="design_tokens">Design-tokens</option>
              <option value="seo">SEO</option>
              <option value="blog_post">Blogginnlegg</option>
              <option value="navigation">Navigasjon</option>
              <option value="form">Skjemaer</option>
            </select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !Array.isArray(versions) || versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Ingen versjoner funnet</p>
              <p className="text-sm mt-2">Versjoner lagres automatisk når du gjor endringer i CMS</p>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((version) => {
                const IconComponent = contentTypeIcons[version.content_type] || FileText;
                return (
                  <div
                    key={version.id}
                    className="flex items-center justify-between p-3 rounded-md border hover-elevate cursor-pointer"
                    onClick={() => viewVersionDetails(version)}
                    data-testid={`version-item-${version.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-muted">
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {contentTypeLabels[version.content_type] || version.content_type}
                          </span>
                          <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                            v{version.version_number}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {formatDate(version.created_at)}
                          {version.changed_by && (
                            <>
                              <span className="mx-1">av</span>
                              <span>{version.changed_by}</span>
                            </>
                          )}
                        </div>
                        {version.change_description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {version.change_description}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" data-testid={`button-view-version-${version.id}`}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Versjonsdetaljer
              {selectedVersion && (
                <span className="text-xs bg-secondary px-2 py-1 rounded">
                  v{selectedVersion.version_number}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedVersion && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <span className="ml-2 font-medium">
                    {contentTypeLabels[selectedVersion.content_type] || selectedVersion.content_type}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Dato:</span>
                  <span className="ml-2">{formatDate(selectedVersion.created_at)}</span>
                </div>
                {selectedVersion.changed_by && (
                  <div>
                    <span className="text-muted-foreground">Endret av:</span>
                    <span className="ml-2">{selectedVersion.changed_by}</span>
                  </div>
                )}
                {selectedVersion.change_description && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Beskrivelse:</span>
                    <span className="ml-2">{selectedVersion.change_description}</span>
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-2 block">Lagret data</Label>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto max-h-64 overflow-y-auto">
                  {JSON.stringify(
                    typeof selectedVersion.data === 'string' 
                      ? JSON.parse(selectedVersion.data) 
                      : selectedVersion.data, 
                    null, 
                    2
                  )}
                </pre>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
                  Lukk
                </Button>
                <Button
                  onClick={() => restoreMutation.mutate(selectedVersion.id)}
                  disabled={restoreMutation.isPending}
                  data-testid="button-restore-version"
                >
                  {restoreMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Gjenopprett denne versjonen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Analytics Settings interface
interface AnalyticsSettingsData {
  id?: number;
  ga4_measurement_id: string | null;
  ga4_stream_id: string | null;
  enable_tracking: boolean;
  enable_page_views: boolean;
  enable_events: boolean;
  enable_consent_mode: boolean;
  cookie_consent: string;
  excluded_paths: string[] | null;
  custom_events: any;
}

function AnalyticsEditor() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<AnalyticsSettingsData>({
    ga4_measurement_id: '',
    ga4_stream_id: '',
    enable_tracking: false,
    enable_page_views: true,
    enable_events: true,
    enable_consent_mode: true,
    cookie_consent: 'required',
    excluded_paths: [],
    custom_events: null,
  });

  const { data: settings, isLoading } = useQuery<AnalyticsSettingsData>({
    queryKey: ['/api/cms/analytics'],
    queryFn: () => authenticatedApiRequest('/api/cms/analytics'),
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        ga4_measurement_id: settings.ga4_measurement_id || '',
        ga4_stream_id: settings.ga4_stream_id || '',
        enable_tracking: settings.enable_tracking || false,
        enable_page_views: settings.enable_page_views ?? true,
        enable_events: settings.enable_events ?? true,
        enable_consent_mode: settings.enable_consent_mode ?? true,
        cookie_consent: settings.cookie_consent || 'required',
        excluded_paths: settings.excluded_paths || [],
        custom_events: settings.custom_events,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: AnalyticsSettingsData) => {
      return authenticatedApiRequest('/api/cms/analytics', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Lagret', description: 'Analytics-innstillinger er oppdatert' });
      queryClient.invalidateQueries({ queryKey: ['/api/cms/analytics'] });
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Google Analytics 4
          </CardTitle>
          <CardDescription>
            Konfigurer GA4-sporing for nettstedet ditt
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <Label className="text-base font-medium">Aktiver sporing</Label>
              <p className="text-sm text-muted-foreground">Slå på Google Analytics 4-sporing</p>
            </div>
            <Button
              variant={formData.enable_tracking ? "default" : "outline"}
              onClick={() => setFormData({ ...formData, enable_tracking: !formData.enable_tracking })}
              data-testid="toggle-tracking"
            >
              {formData.enable_tracking ? <ToggleRight className="h-5 w-5" /> : <ToggleRight className="h-5 w-5 opacity-50" />}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ga4-id">GA4 Measurement ID</Label>
              <Input
                id="ga4-id"
                value={formData.ga4_measurement_id || ''}
                onChange={(e) => setFormData({ ...formData, ga4_measurement_id: e.target.value })}
                placeholder="G-XXXXXXXXXX"
                data-testid="input-ga4-id"
              />
              <p className="text-xs text-muted-foreground">Finn denne i GA4 under Admin - Data Streams</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ga4-stream">Stream ID (valgfritt)</Label>
              <Input
                id="ga4-stream"
                value={formData.ga4_stream_id || ''}
                onChange={(e) => setFormData({ ...formData, ga4_stream_id: e.target.value })}
                placeholder="1234567890"
                data-testid="input-ga4-stream"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium">Sporingsalternativer</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between p-3 rounded-md border">
                <div>
                  <Label>Sidevisninger</Label>
                  <p className="text-xs text-muted-foreground">Spor automatisk sidevisninger</p>
                </div>
                <Button
                  size="sm"
                  variant={formData.enable_page_views ? "default" : "outline"}
                  onClick={() => setFormData({ ...formData, enable_page_views: !formData.enable_page_views })}
                >
                  {formData.enable_page_views ? 'På' : 'Av'}
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border">
                <div>
                  <Label>Hendelser</Label>
                  <p className="text-xs text-muted-foreground">Spor klikk og interaksjoner</p>
                </div>
                <Button
                  size="sm"
                  variant={formData.enable_events ? "default" : "outline"}
                  onClick={() => setFormData({ ...formData, enable_events: !formData.enable_events })}
                >
                  {formData.enable_events ? 'På' : 'Av'}
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border">
                <div>
                  <Label>Samtykke-modus</Label>
                  <p className="text-xs text-muted-foreground">Respekter GDPR-samtykke</p>
                </div>
                <Button
                  size="sm"
                  variant={formData.enable_consent_mode ? "default" : "outline"}
                  onClick={() => setFormData({ ...formData, enable_consent_mode: !formData.enable_consent_mode })}
                >
                  {formData.enable_consent_mode ? 'På' : 'Av'}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Cookie-samtykke</Label>
                <select
                  value={formData.cookie_consent}
                  onChange={(e) => setFormData({ ...formData, cookie_consent: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="required">Påkrevd (alltid spør)</option>
                  <option value="optional">Valgfritt</option>
                  <option value="granted">Alltid godkjent</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate(formData)}
              disabled={saveMutation.isPending}
              data-testid="button-save-analytics"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Lagre innstillinger
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GA4 Integrasjonskode</CardTitle>
          <CardDescription>
            Denne koden legges automatisk til på nettstedet når sporing er aktivert
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
{`<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${formData.ga4_measurement_id || 'G-XXXXXXXXXX'}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${formData.ga4_measurement_id || 'G-XXXXXXXXXX'}', {
    send_page_view: ${formData.enable_page_views}
  });
</script>`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

// Email Template interface
interface EmailTemplate {
  id: number;
  name: string;
  slug: string;
  subject: string;
  html_content: string;
  text_content: string | null;
  variables: string[] | null;
  category: string;
  is_active: boolean;
}

interface EmailSettingsData {
  id?: number;
  provider: string;
  smtp_host: string | null;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string | null;
  from_email: string | null;
  from_name: string | null;
  reply_to_email: string | null;
}

function EmailEditor() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [templateForm, setTemplateForm] = useState({
    name: '',
    slug: '',
    subject: '',
    html_content: '',
    text_content: '',
    variables: [] as string[],
    category: 'general',
  });
  const [settingsForm, setSettingsForm] = useState<EmailSettingsData>({
    provider: 'smtp',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_secure: false,
    smtp_user: '',
    from_email: '',
    from_name: '',
    reply_to_email: '',
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: ['/api/cms/email/templates'],
    queryFn: () => authenticatedApiRequest('/api/cms/email/templates'),
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<EmailSettingsData>({
    queryKey: ['/api/cms/email/settings'],
    queryFn: () => authenticatedApiRequest('/api/cms/email/settings'),
  });

  const { data: history = [] } = useQuery<any[]>({
    queryKey: ['/api/cms/email/history'],
    queryFn: () => authenticatedApiRequest('/api/cms/email/history?limit=20'),
  });

  useEffect(() => {
    if (settings) {
      setSettingsForm({
        provider: settings.provider || 'smtp',
        smtp_host: settings.smtp_host || 'smtp.gmail.com',
        smtp_port: settings.smtp_port || 587,
        smtp_secure: settings.smtp_secure || false,
        smtp_user: settings.smtp_user || '',
        from_email: settings.from_email || '',
        from_name: settings.from_name || '',
        reply_to_email: settings.reply_to_email || '',
      });
    }
  }, [settings]);

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateForm & { id?: number }) => {
      const url = data.id 
        ? `/api/cms/email/templates/${data.id}`
        : '/api/cms/email/templates';
      return authenticatedApiRequest(url, {
        method: data.id ? 'PUT' : 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Lagret', description: 'E-postmal er lagret' });
      queryClient.invalidateQueries({ queryKey: ['/api/cms/email/templates'] });
      setShowTemplateDialog(false);
      setSelectedTemplate(null);
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return authenticatedApiRequest(`/api/cms/email/templates/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: 'Slettet', description: 'E-postmal er slettet' });
      queryClient.invalidateQueries({ queryKey: ['/api/cms/email/templates'] });
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (data: EmailSettingsData) => {
      return authenticatedApiRequest('/api/cms/email/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Lagret', description: 'E-postinnstillinger er oppdatert' });
      queryClient.invalidateQueries({ queryKey: ['/api/cms/email/settings'] });
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async (data: { template_id: number; recipient_email: string }) => {
      return authenticatedApiRequest('/api/cms/email/test', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Sendt', description: 'Test-e-post er sendt' });
      queryClient.invalidateQueries({ queryKey: ['/api/cms/email/history'] });
      setShowTestDialog(false);
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const seedTemplatesMutation = useMutation({
    mutationFn: async () => {
      return authenticatedApiRequest('/api/cms/email/seed-templates', { method: 'POST' });
    },
    onSuccess: () => {
      toast({ title: 'Suksess', description: 'Standard e-postmaler er lagt til' });
      queryClient.invalidateQueries({ queryKey: ['/api/cms/email/templates'] });
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const openTemplateEditor = (template?: EmailTemplate) => {
    if (template) {
      setSelectedTemplate(template);
      setTemplateForm({
        name: template.name,
        slug: template.slug,
        subject: template.subject,
        html_content: template.html_content,
        text_content: template.text_content || '',
        variables: template.variables || [],
        category: template.category,
      });
    } else {
      setSelectedTemplate(null);
      setTemplateForm({
        name: '',
        slug: '',
        subject: '',
        html_content: '',
        text_content: '',
        variables: [],
        category: 'general',
      });
    }
    setShowTemplateDialog(true);
  };

  const categoryLabels: Record<string, string> = {
    general: 'Generell',
    onboarding: 'Onboarding',
    auth: 'Autentisering',
    notification: 'Varsling',
    marketing: 'Markedsføring',
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates">E-postmaler</TabsTrigger>
          <TabsTrigger value="settings">Innstillinger</TabsTrigger>
          <TabsTrigger value="history">Historikk</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  E-postmaler
                </CardTitle>
                <CardDescription>Administrer e-postmaler for utsendelse</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => seedTemplatesMutation.mutate()} disabled={seedTemplatesMutation.isPending}>
                  {seedTemplatesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  Legg til standardmaler
                </Button>
                <Button onClick={() => openTemplateEditor()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ny mal
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !Array.isArray(templates) || templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Ingen e-postmaler funnet</p>
                  <Button variant="ghost" onClick={() => seedTemplatesMutation.mutate()}>
                    Legg til standardmaler
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between p-3 rounded-md border hover-elevate"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-md bg-muted">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{template.name}</span>
                            <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                              {categoryLabels[template.category] || template.category}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">{template.subject}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedTemplate(template);
                            setShowTestDialog(true);
                          }}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openTemplateEditor(template)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Er du sikker på at du vil slette denne malen?')) {
                              deleteTemplateMutation.mutate(template.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                SMTP-innstillinger
              </CardTitle>
              <CardDescription>Konfigurer e-postserver for utsendelse</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">SMTP-server</Label>
                  <Input
                    id="smtp-host"
                    value={settingsForm.smtp_host || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtp_host: e.target.value })}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={settingsForm.smtp_port}
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtp_port: parseInt(e.target.value) })}
                    placeholder="587"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">Brukernavn</Label>
                  <Input
                    id="smtp-user"
                    value={settingsForm.smtp_user || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtp_user: e.target.value })}
                    placeholder="din@epost.no"
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <Label>SSL/TLS</Label>
                  <Button
                    size="sm"
                    variant={settingsForm.smtp_secure ? "default" : "outline"}
                    onClick={() => setSettingsForm({ ...settingsForm, smtp_secure: !settingsForm.smtp_secure })}
                  >
                    {settingsForm.smtp_secure ? 'På' : 'Av'}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="from-email">Fra e-post</Label>
                  <Input
                    id="from-email"
                    value={settingsForm.from_email || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, from_email: e.target.value })}
                    placeholder="noreply@smarttiming.no"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from-name">Fra navn</Label>
                  <Input
                    id="from-name"
                    value={settingsForm.from_name || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, from_name: e.target.value })}
                    placeholder="Smart Timing"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="reply-to">Svar-til e-post</Label>
                  <Input
                    id="reply-to"
                    value={settingsForm.reply_to_email || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, reply_to_email: e.target.value })}
                    placeholder="support@smarttiming.no"
                  />
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-md">
                <p className="text-sm text-muted-foreground">
                  <strong>Tips:</strong> For Gmail, bruk smtp.gmail.com med port 587. 
                  Du trenger et App-passord som er konfigurert i GMAIL_APP_PASSWORD-hemmeligheten.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => saveSettingsMutation.mutate(settingsForm)}
                  disabled={saveSettingsMutation.isPending}
                >
                  {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Lagre innstillinger
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Sendehistorikk
              </CardTitle>
              <CardDescription>Oversikt over sendte e-poster</CardDescription>
            </CardHeader>
            <CardContent>
              {!Array.isArray(history) || history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Ingen e-poster sendt ennå</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-md border">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.subject}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            item.status === 'sent' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                          }`}>
                            {item.status === 'sent' ? 'Sendt' : 'Feilet'}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Til: {item.recipient_email} | {new Date(item.created_at).toLocaleString('nb-NO')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTemplate ? 'Rediger e-postmal' : 'Ny e-postmal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-name">Navn</Label>
                <Input
                  id="template-name"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="Velkommen e-post"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-slug">Slug</Label>
                <Input
                  id="template-slug"
                  value={templateForm.slug}
                  onChange={(e) => setTemplateForm({ ...templateForm, slug: e.target.value })}
                  placeholder="welcome"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-subject">Emne</Label>
                <Input
                  id="template-subject"
                  value={templateForm.subject}
                  onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                  placeholder="Velkommen til {{company_name}}!"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-category">Kategori</Label>
                <select
                  id="template-category"
                  value={templateForm.category}
                  onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="general">Generell</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="auth">Autentisering</option>
                  <option value="notification">Varsling</option>
                  <option value="marketing">Markedsføring</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-html">HTML-innhold</Label>
              <Textarea
                id="template-html"
                value={templateForm.html_content}
                onChange={(e) => setTemplateForm({ ...templateForm, html_content: e.target.value })}
                placeholder="<html><body>...</body></html>"
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Bruk &#123;&#123;variabel&#125;&#125; for dynamiske verdier. Eksempel: &#123;&#123;name&#125;&#125;, &#123;&#123;company_name&#125;&#125;
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-text">Ren tekst (valgfritt)</Label>
              <Textarea
                id="template-text"
                value={templateForm.text_content}
                onChange={(e) => setTemplateForm({ ...templateForm, text_content: e.target.value })}
                placeholder="Alternativ tekst for e-postklienter uten HTML-støtte"
                className="min-h-[100px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
                Avbryt
              </Button>
              <Button
                onClick={() => saveTemplateMutation.mutate({
                  ...templateForm,
                  id: selectedTemplate?.id,
                })}
                disabled={saveTemplateMutation.isPending}
              >
                {saveTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Lagre
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send test-e-post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send en test av malen "{selectedTemplate?.name}" til en e-postadresse.
            </p>
            <div className="space-y-2">
              <Label htmlFor="test-email">Mottaker e-post</Label>
              <Input
                id="test-email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                Avbryt
              </Button>
              <Button
                onClick={() => {
                  if (selectedTemplate && testEmail) {
                    sendTestMutation.mutate({
                      template_id: selectedTemplate.id,
                      recipient_email: testEmail,
                    });
                  }
                }}
                disabled={sendTestMutation.isPending || !testEmail}
              >
                {sendTestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send test
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Report Template interface
interface ReportTemplateData {
  id?: number;
  name: string;
  description: string | null;
  paper_size: string;
  orientation: string;
  margin_top: string;
  margin_bottom: string;
  margin_left: string;
  margin_right: string;
  header_enabled: boolean;
  header_height: string;
  header_logo_url: string | null;
  header_logo_position: string;
  header_title: string | null;
  header_subtitle: string | null;
  header_show_date: boolean;
  header_show_page_numbers: boolean;
  footer_enabled: boolean;
  footer_height: string;
  footer_text: string | null;
  footer_show_page_numbers: boolean;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  font_size: string;
  line_height: string;
  blocks: any[];
  is_default: boolean;
  created_at?: string;
}

interface ReportBlock {
  id: string;
  type: string;
  config: Record<string, any>;
}

function ReportDesigner() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplateData | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('templates');
  const [templateForm, setTemplateForm] = useState<Partial<ReportTemplateData>>({
    name: '',
    description: '',
    paper_size: 'A4',
    orientation: 'portrait',
    margin_top: '20mm',
    margin_bottom: '20mm',
    margin_left: '15mm',
    margin_right: '15mm',
    header_enabled: true,
    header_height: '25mm',
    header_logo_url: '',
    header_logo_position: 'left',
    header_title: '',
    header_subtitle: '',
    header_show_date: true,
    header_show_page_numbers: true,
    footer_enabled: true,
    footer_height: '15mm',
    footer_text: '',
    footer_show_page_numbers: true,
    primary_color: '#2563EB',
    secondary_color: '#64748B',
    font_family: 'Helvetica',
    font_size: '11pt',
    line_height: '1.5',
    blocks: [],
    is_default: false,
  });
  const [blocks, setBlocks] = useState<ReportBlock[]>([]);

  const { data: templates = [], isLoading: templatesLoading } = useQuery<ReportTemplateData[]>({
    queryKey: ['/api/report-templates'],
    queryFn: () => authenticatedApiRequest('/api/report-templates'),
  });

  const { data: blockTypes = [] } = useQuery<any[]>({
    queryKey: ['/api/report-templates/blocks/types'],
    queryFn: () => authenticatedApiRequest('/api/report-templates/blocks/types'),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: Partial<ReportTemplateData>) => {
      const url = data.id 
        ? `/api/report-templates/${data.id}`
        : '/api/report-templates';
      return authenticatedApiRequest(url, {
        method: data.id ? 'PUT' : 'POST',
        body: JSON.stringify({ ...data, blocks }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Lagret', description: 'Rapportmal er lagret' });
      queryClient.invalidateQueries({ queryKey: ['/api/report-templates'] });
      setShowTemplateDialog(false);
      setSelectedTemplate(null);
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return authenticatedApiRequest(`/api/report-templates/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: 'Slettet', description: 'Rapportmal er slettet' });
      queryClient.invalidateQueries({ queryKey: ['/api/report-templates'] });
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const seedDefaultMutation = useMutation({
    mutationFn: async () => {
      return authenticatedApiRequest('/api/report-templates/seed-default', { method: 'POST' });
    },
    onSuccess: () => {
      toast({ title: 'Suksess', description: 'Standard rapportmal er lagt til' });
      queryClient.invalidateQueries({ queryKey: ['/api/report-templates'] });
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const openTemplateEditor = (template?: ReportTemplateData) => {
    if (template) {
      setSelectedTemplate(template);
      setTemplateForm({
        name: template.name,
        description: template.description,
        paper_size: template.paper_size,
        orientation: template.orientation,
        margin_top: template.margin_top,
        margin_bottom: template.margin_bottom,
        margin_left: template.margin_left,
        margin_right: template.margin_right,
        header_enabled: template.header_enabled,
        header_height: template.header_height,
        header_logo_url: template.header_logo_url,
        header_logo_position: template.header_logo_position,
        header_title: template.header_title,
        header_subtitle: template.header_subtitle,
        header_show_date: template.header_show_date,
        header_show_page_numbers: template.header_show_page_numbers,
        footer_enabled: template.footer_enabled,
        footer_height: template.footer_height,
        footer_text: template.footer_text,
        footer_show_page_numbers: template.footer_show_page_numbers,
        primary_color: template.primary_color,
        secondary_color: template.secondary_color,
        font_family: template.font_family,
        font_size: template.font_size,
        line_height: template.line_height,
        is_default: template.is_default,
      });
      setBlocks(template.blocks || []);
    } else {
      setSelectedTemplate(null);
      setTemplateForm({
        name: '',
        description: '',
        paper_size: 'A4',
        orientation: 'portrait',
        margin_top: '20mm',
        margin_bottom: '20mm',
        margin_left: '15mm',
        margin_right: '15mm',
        header_enabled: true,
        header_height: '25mm',
        header_logo_url: '',
        header_logo_position: 'left',
        header_title: '',
        header_subtitle: '',
        header_show_date: true,
        header_show_page_numbers: true,
        footer_enabled: true,
        footer_height: '15mm',
        footer_text: '',
        footer_show_page_numbers: true,
        primary_color: '#2563EB',
        secondary_color: '#64748B',
        font_family: 'Helvetica',
        font_size: '11pt',
        line_height: '1.5',
        is_default: false,
      });
      setBlocks([]);
    }
    setShowTemplateDialog(true);
  };

  const addBlock = (type: string) => {
    const blockType = blockTypes.find((bt: any) => bt.type === type);
    const newBlock: ReportBlock = {
      id: Date.now().toString(),
      type,
      config: blockType?.default_config || {},
    };
    setBlocks([...blocks, newBlock]);
  };

  const updateBlock = (id: string, config: Record<string, any>) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, config } : b));
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const moveBlock = (fromIndex: number, toIndex: number) => {
    const newBlocks = [...blocks];
    const [removed] = newBlocks.splice(fromIndex, 1);
    newBlocks.splice(toIndex, 0, removed);
    setBlocks(newBlocks);
  };

  const fieldLabels: Record<string, string> = {
    background: 'Bakgrunn',
    actions: 'Tiltak',
    progress: 'Fremgang',
    challenges: 'Utfordringer',
    factors: 'Faktorer',
    assessment: 'Vurdering',
    recommendations: 'Anbefalinger',
    notes: 'Notater',
  };

  const blockTypeLabels: Record<string, string> = {
    header: 'Topptekst',
    section: 'Seksjon',
    text: 'Tekst',
    field: 'Rapportfelt',
    table: 'Tabell',
    signature: 'Signatur',
    divider: 'Skillelinje',
    spacer: 'Mellomrom',
    image: 'Bilde',
    footer: 'Bunntekst',
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates">Maler</TabsTrigger>
          <TabsTrigger value="assets">Ressurser</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Rapportmaler
                </CardTitle>
                <CardDescription>Design og administrer rapportmaler for saksrapporter</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => seedDefaultMutation.mutate()} disabled={seedDefaultMutation.isPending}>
                  {seedDefaultMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  Standardmal
                </Button>
                <Button onClick={() => openTemplateEditor()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ny mal
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !Array.isArray(templates) || templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Ingen rapportmaler funnet</p>
                  <Button variant="ghost" onClick={() => seedDefaultMutation.mutate()}>
                    Legg til standardmal
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between p-3 rounded-md border hover-elevate"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-md bg-muted">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{template.name}</span>
                            {template.is_default && (
                              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                Standard
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {template.paper_size} | {template.orientation === 'portrait' ? 'Stående' : 'Liggende'}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openTemplateEditor(template)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Er du sikker på at du vil slette denne malen?')) {
                              deleteTemplateMutation.mutate(template.id!);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Ressurser
              </CardTitle>
              <CardDescription>Last opp logoer og bilder til bruk i rapporter</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Dra og slipp filer her, eller klikk for å velge</p>
                <p className="text-sm mt-2">PNG, JPG eller SVG (maks 2MB)</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTemplate ? 'Rediger rapportmal' : 'Ny rapportmal'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Navn</Label>
                  <Input
                    id="template-name"
                    value={templateForm.name || ''}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="Min rapportmal"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-desc">Beskrivelse</Label>
                  <Input
                    id="template-desc"
                    value={templateForm.description || ''}
                    onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                    placeholder="Beskrivelse av malen"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Papirstørrelse</Label>
                  <select
                    value={templateForm.paper_size}
                    onChange={(e) => setTemplateForm({ ...templateForm, paper_size: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                    <option value="Legal">Legal</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Orientering</Label>
                  <select
                    value={templateForm.orientation}
                    onChange={(e) => setTemplateForm({ ...templateForm, orientation: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="portrait">Stående</option>
                    <option value="landscape">Liggende</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Primærfarge</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={templateForm.primary_color}
                      onChange={(e) => setTemplateForm({ ...templateForm, primary_color: e.target.value })}
                      className="h-9 w-12 rounded border"
                    />
                    <Input
                      value={templateForm.primary_color}
                      onChange={(e) => setTemplateForm({ ...templateForm, primary_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Font</Label>
                  <select
                    value={templateForm.font_family}
                    onChange={(e) => setTemplateForm({ ...templateForm, font_family: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="Helvetica">Helvetica</option>
                    <option value="Times-Roman">Times Roman</option>
                    <option value="Courier">Courier</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3 p-4 rounded-md border">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Topptekst</Label>
                  <Button
                    size="sm"
                    variant={templateForm.header_enabled ? "default" : "outline"}
                    onClick={() => setTemplateForm({ ...templateForm, header_enabled: !templateForm.header_enabled })}
                  >
                    {templateForm.header_enabled ? 'På' : 'Av'}
                  </Button>
                </div>
                {templateForm.header_enabled && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Tittel</Label>
                      <Input
                        value={templateForm.header_title || ''}
                        onChange={(e) => setTemplateForm({ ...templateForm, header_title: e.target.value })}
                        placeholder="Rapporttittel"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Undertittel</Label>
                      <Input
                        value={templateForm.header_subtitle || ''}
                        onChange={(e) => setTemplateForm({ ...templateForm, header_subtitle: e.target.value })}
                        placeholder="Undertittel"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Logo URL</Label>
                      <Input
                        value={templateForm.header_logo_url || ''}
                        onChange={(e) => setTemplateForm({ ...templateForm, header_logo_url: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="show-date"
                          checked={templateForm.header_show_date}
                          onChange={(e) => setTemplateForm({ ...templateForm, header_show_date: e.target.checked })}
                        />
                        <Label htmlFor="show-date">Vis dato</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="show-page"
                          checked={templateForm.header_show_page_numbers}
                          onChange={(e) => setTemplateForm({ ...templateForm, header_show_page_numbers: e.target.checked })}
                        />
                        <Label htmlFor="show-page">Vis sidetall</Label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 p-4 rounded-md border">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Innholdsblokker</Label>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {blockTypes.map((bt: any) => (
                    <Button key={bt.type} size="sm" variant="outline" onClick={() => addBlock(bt.type)}>
                      <Plus className="h-3 w-3 mr-1" />
                      {bt.name}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2">
                  {blocks.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      Ingen blokker lagt til. Klikk på knappene over for å legge til innhold.
                    </div>
                  ) : (
                    blocks.map((block, index) => (
                      <div key={block.id} className="flex items-start gap-2 p-3 rounded-md border bg-muted/50">
                        <div className="flex flex-col gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={index === 0}
                            onClick={() => moveBlock(index, index - 1)}
                          >
                            <ChevronDown className="h-3 w-3 rotate-180" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={index === blocks.length - 1}
                            onClick={() => moveBlock(index, index + 1)}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium">
                              {blockTypeLabels[block.type] || block.type}
                            </span>
                          </div>
                          {block.type === 'field' && (
                            <select
                              value={block.config.field || ''}
                              onChange={(e) => updateBlock(block.id, { ...block.config, field: e.target.value, label: fieldLabels[e.target.value] })}
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                            >
                              <option value="">Velg felt...</option>
                              {Object.entries(fieldLabels).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                              ))}
                            </select>
                          )}
                          {block.type === 'text' && (
                            <Input
                              value={block.config.content || ''}
                              onChange={(e) => updateBlock(block.id, { ...block.config, content: e.target.value })}
                              placeholder="Skriv tekst..."
                              className="h-8"
                            />
                          )}
                          {block.type === 'section' && (
                            <Input
                              value={block.config.title || ''}
                              onChange={(e) => updateBlock(block.id, { ...block.config, title: e.target.value })}
                              placeholder="Seksjonstittel..."
                              className="h-8"
                            />
                          )}
                          {block.type === 'signature' && (
                            <Input
                              value={block.config.label || ''}
                              onChange={(e) => updateBlock(block.id, { ...block.config, label: e.target.value })}
                              placeholder="Signaturetikett..."
                              className="h-8"
                            />
                          )}
                          {block.type === 'spacer' && (
                            <Input
                              type="number"
                              value={block.config.height || 10}
                              onChange={(e) => updateBlock(block.id, { ...block.config, height: parseInt(e.target.value) })}
                              placeholder="Høyde i mm"
                              className="h-8 w-24"
                            />
                          )}
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => removeBlock(block.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3 p-4 rounded-md border">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Bunntekst</Label>
                  <Button
                    size="sm"
                    variant={templateForm.footer_enabled ? "default" : "outline"}
                    onClick={() => setTemplateForm({ ...templateForm, footer_enabled: !templateForm.footer_enabled })}
                  >
                    {templateForm.footer_enabled ? 'På' : 'Av'}
                  </Button>
                </div>
                {templateForm.footer_enabled && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Bunntekst</Label>
                      <Input
                        value={templateForm.footer_text || ''}
                        onChange={(e) => setTemplateForm({ ...templateForm, footer_text: e.target.value })}
                        placeholder="Bunntekst..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="footer-page"
                        checked={templateForm.footer_show_page_numbers}
                        onChange={(e) => setTemplateForm({ ...templateForm, footer_show_page_numbers: e.target.checked })}
                      />
                      <Label htmlFor="footer-page">Vis sidetall</Label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Forhåndsvisning</CardTitle>
                </CardHeader>
                <CardContent>
                  <div 
                    className="border rounded-md p-4 bg-white text-black min-h-[400px] text-xs"
                    style={{ 
                      fontFamily: templateForm.font_family,
                      aspectRatio: templateForm.orientation === 'portrait' ? '210/297' : '297/210'
                    }}
                  >
                    {templateForm.header_enabled && (
                      <div className="border-b pb-2 mb-3" style={{ color: templateForm.primary_color }}>
                        <div className="font-bold text-sm">{templateForm.header_title || 'Tittel'}</div>
                        <div className="text-muted-foreground">{templateForm.header_subtitle}</div>
                        {templateForm.header_show_date && (
                          <div className="text-right text-muted-foreground">{new Date().toLocaleDateString('nb-NO')}</div>
                        )}
                      </div>
                    )}
                    <div className="space-y-2">
                      {blocks.map((block) => (
                        <div key={block.id}>
                          {block.type === 'section' && (
                            <div className="font-semibold" style={{ color: templateForm.primary_color }}>
                              {block.config.title || 'Seksjon'}
                            </div>
                          )}
                          {block.type === 'field' && (
                            <div>
                              <div className="font-medium" style={{ color: templateForm.primary_color }}>
                                {block.config.label || fieldLabels[block.config.field] || 'Felt'}
                              </div>
                              <div className="text-muted-foreground italic">[Innhold fra rapport]</div>
                            </div>
                          )}
                          {block.type === 'text' && (
                            <div>{block.config.content || 'Tekst...'}</div>
                          )}
                          {block.type === 'divider' && (
                            <hr className="border-muted" />
                          )}
                          {block.type === 'spacer' && (
                            <div style={{ height: `${block.config.height || 10}px` }} />
                          )}
                          {block.type === 'signature' && (
                            <div className="mt-4">
                              <div className="text-muted-foreground">{block.config.label || 'Signatur:'}</div>
                              <div className="border-b border-black w-48 mt-4" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {templateForm.footer_enabled && (
                      <div className="absolute bottom-4 left-4 right-4 text-center text-muted-foreground border-t pt-2">
                        {templateForm.footer_text}
                        {templateForm.footer_show_page_numbers && ' | Side 1 av 1'}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Avbryt
            </Button>
            <Button
              onClick={() => saveTemplateMutation.mutate({
                ...templateForm,
                id: selectedTemplate?.id,
              })}
              disabled={saveTemplateMutation.isPending}
            >
              {saveTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Lagre
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
