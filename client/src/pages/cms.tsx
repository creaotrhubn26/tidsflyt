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
import { Loader2, Save, Plus, Trash2, GripVertical, Lock, Eye, ExternalLink } from "lucide-react";
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

const iconOptions = ["Clock", "Users", "FileText", "Shield", "BarChart3", "Smartphone", "Settings", "Star", "Heart", "Zap"];

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
        <TabsList className="grid w-full grid-cols-6 mb-6" data-testid="cms-tabs">
          <TabsTrigger value="hero" data-testid="tab-hero">Hero</TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features">Funksjoner</TabsTrigger>
          <TabsTrigger value="testimonials" data-testid="tab-testimonials">Referanser</TabsTrigger>
          <TabsTrigger value="partners" data-testid="tab-partners">Partnere</TabsTrigger>
          <TabsTrigger value="sections" data-testid="tab-sections">Seksjoner</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">Aktivitet</TabsTrigger>
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

        <TabsContent value="activity">
          <ActivityLogViewer />
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
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={formData.cta_primary_icon}
                      onChange={(e) => setFormData({ ...formData, cta_primary_icon: e.target.value })}
                      data-testid="select-hero-cta-primary-icon"
                    >
                      {iconOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
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
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={formData.cta_secondary_icon}
                      onChange={(e) => setFormData({ ...formData, cta_secondary_icon: e.target.value })}
                      data-testid="select-hero-cta-secondary-icon"
                    >
                      {iconOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
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
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={formData.badge1_icon}
                    onChange={(e) => setFormData({ ...formData, badge1_icon: e.target.value })}
                    data-testid="select-hero-badge1-icon"
                  >
                    {iconOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <Label>Badge 2</Label>
                  <Input
                    value={formData.badge2}
                    onChange={(e) => setFormData({ ...formData, badge2: e.target.value })}
                    placeholder="Ingen kredittkort"
                    data-testid="input-hero-badge2"
                  />
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={formData.badge2_icon}
                    onChange={(e) => setFormData({ ...formData, badge2_icon: e.target.value })}
                    data-testid="select-hero-badge2-icon"
                  >
                    {iconOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <Label>Badge 3</Label>
                  <Input
                    value={formData.badge3}
                    onChange={(e) => setFormData({ ...formData, badge3: e.target.value })}
                    placeholder="GDPR-kompatibel"
                    data-testid="input-hero-badge3"
                  />
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={formData.badge3_icon}
                    onChange={(e) => setFormData({ ...formData, badge3_icon: e.target.value })}
                    data-testid="select-hero-badge3-icon"
                  >
                    {iconOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
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
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={editingFeature.icon}
            onChange={(e) => setEditingFeature({ ...editingFeature, icon: e.target.value })}
          >
            {iconOptions.map((icon) => (
              <option key={icon} value={icon}>{icon}</option>
            ))}
          </select>
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
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={newFeature.icon}
                onChange={(e) => setNewFeature({ ...newFeature, icon: e.target.value })}
                data-testid="select-new-feature-icon"
              >
                {iconOptions.map((icon) => (
                  <option key={icon} value={icon}>{icon}</option>
                ))}
              </select>
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
