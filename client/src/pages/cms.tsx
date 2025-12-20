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
import { Loader2, Save, Plus, Trash2, GripVertical, Lock } from "lucide-react";

function getAdminToken(): string | null {
  return sessionStorage.getItem('cms_admin_token');
}

function setAdminToken(token: string) {
  sessionStorage.setItem('cms_admin_token', token);
}

function clearAdminToken() {
  sessionStorage.removeItem('cms_admin_token');
}

function authenticatedApiRequest(url: string, options: RequestInit = {}) {
  const token = getAdminToken();
  return apiRequest(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });
}

interface LandingHero {
  id: number;
  title: string;
  title_highlight: string | null;
  subtitle: string | null;
  cta_primary_text: string | null;
  cta_secondary_text: string | null;
  badge1: string | null;
  badge2: string | null;
  badge3: string | null;
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
}

interface LandingContent {
  hero: LandingHero | null;
  features: LandingFeature[];
  testimonials: LandingTestimonial[];
  sections: LandingSections | null;
}

const iconOptions = ["Clock", "Users", "FileText", "Shield", "BarChart3", "Smartphone", "Settings", "Star", "Heart", "Zap"];

export default function CMSPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("hero");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
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
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
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
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@smarttiming.no"
                  data-testid="input-cms-login-email"
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
        <Button variant="outline" onClick={handleLogout} data-testid="button-cms-logout">
          Logg ut
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 mb-6" data-testid="cms-tabs">
          <TabsTrigger value="hero" data-testid="tab-hero">Hero</TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features">Funksjoner</TabsTrigger>
          <TabsTrigger value="testimonials" data-testid="tab-testimonials">Referanser</TabsTrigger>
          <TabsTrigger value="sections" data-testid="tab-sections">Seksjoner</TabsTrigger>
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

        <TabsContent value="sections">
          <SectionsEditor sections={content?.sections || null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HeroEditor({ hero }: { hero: LandingHero | null }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    title: hero?.title || "",
    title_highlight: hero?.title_highlight || "",
    subtitle: hero?.subtitle || "",
    cta_primary_text: hero?.cta_primary_text || "",
    cta_secondary_text: hero?.cta_secondary_text || "",
    badge1: hero?.badge1 || "",
    badge2: hero?.badge2 || "",
    badge3: hero?.badge3 || "",
  });

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
        <CardDescription>Rediger hovedoverskriften og knappene på landingssiden.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
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
              <Label htmlFor="title_highlight">Fremhevet tekst</Label>
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

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cta_primary">Primærknapp tekst</Label>
              <Input
                id="cta_primary"
                value={formData.cta_primary_text}
                onChange={(e) => setFormData({ ...formData, cta_primary_text: e.target.value })}
                data-testid="input-hero-cta-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cta_secondary">Sekundærknapp tekst</Label>
              <Input
                id="cta_secondary"
                value={formData.cta_secondary_text}
                onChange={(e) => setFormData({ ...formData, cta_secondary_text: e.target.value })}
                data-testid="input-hero-cta-secondary"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="badge1">Badge 1</Label>
              <Input
                id="badge1"
                value={formData.badge1}
                onChange={(e) => setFormData({ ...formData, badge1: e.target.value })}
                data-testid="input-hero-badge1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="badge2">Badge 2</Label>
              <Input
                id="badge2"
                value={formData.badge2}
                onChange={(e) => setFormData({ ...formData, badge2: e.target.value })}
                data-testid="input-hero-badge2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="badge3">Badge 3</Label>
              <Input
                id="badge3"
                value={formData.badge3}
                onChange={(e) => setFormData({ ...formData, badge3: e.target.value })}
                data-testid="input-hero-badge3"
              />
            </div>
          </div>

          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-hero">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Lagre endringer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FeaturesEditor({ features }: { features: LandingFeature[] }) {
  const { toast } = useToast();
  const [editingFeature, setEditingFeature] = useState<LandingFeature | null>(null);
  const [newFeature, setNewFeature] = useState({ icon: "Clock", title: "", description: "", display_order: features.length });

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
          <CardDescription>Rediger eller slett funksjoner som vises på landingssiden.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {features.map((feature, index) => (
              <div key={feature.id} className="flex items-center gap-4 p-4 border rounded-lg" data-testid={`feature-item-${index}`}>
                <GripVertical className="h-4 w-4 text-muted-foreground" />
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
            ))}
            {features.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Ingen funksjoner lagt til ennå.</p>
            )}
          </div>
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
              <div className="space-y-2">
                <Label>Profilbilde URL (valgfritt)</Label>
                <Input
                  value={newTestimonial.avatar_url}
                  onChange={(e) => setNewTestimonial({ ...newTestimonial, avatar_url: e.target.value })}
                  placeholder="https://eksempel.no/bilde.jpg"
                  data-testid="input-new-testimonial-avatar"
                />
                <p className="text-xs text-muted-foreground">Lim inn URL til profilbilde</p>
              </div>
              <div className="space-y-2">
                <Label>Bedriftslogo URL (valgfritt)</Label>
                <Input
                  value={newTestimonial.company_logo}
                  onChange={(e) => setNewTestimonial({ ...newTestimonial, company_logo: e.target.value })}
                  placeholder="https://eksempel.no/logo.png"
                  data-testid="input-new-testimonial-logo"
                />
                <p className="text-xs text-muted-foreground">Lim inn URL til bedriftslogo</p>
              </div>
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
