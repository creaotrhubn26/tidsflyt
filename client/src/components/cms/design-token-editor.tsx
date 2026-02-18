import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { useToast } from "@/hooks/use-toast";
import { 
  Palette, Type, Box, Sparkles, Copy,
  Check, Save, Loader2, RefreshCw, Code2, Wand2
} from "lucide-react";

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

interface DesignTokens {
  id: number;
  name: string;
  // Colors
  primary_color: string;
  primary_color_light: string;
  primary_color_dark: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  background_color_dark: string;
  surface_color: string;
  surface_color_dark: string;
  text_color: string;
  text_color_dark: string;
  muted_color: string;
  border_color: string;
  // Typography
  font_family: string;
  font_family_heading: string;
  font_size_base: string;
  font_size_scale: string;
  line_height_base: string;
  line_height_heading: string;
  font_weight_normal: string;
  font_weight_medium: string;
  font_weight_bold: string;
  letter_spacing: string;
  letter_spacing_heading: string;
  // Spacing
  spacing_unit: string;
  spacing_xs: string;
  spacing_sm: string;
  spacing_md: string;
  spacing_lg: string;
  spacing_xl: string;
  spacing_2xl: string;
  spacing_3xl: string;
  // Borders
  border_radius_none: string;
  border_radius_sm: string;
  border_radius_md: string;
  border_radius_lg: string;
  border_radius_xl: string;
  border_radius_full: string;
  border_width: string;
  // Shadows
  shadow_none: string;
  shadow_sm: string;
  shadow_md: string;
  shadow_lg: string;
  shadow_xl: string;
  // Animation
  animation_duration: string;
  animation_duration_slow: string;
  animation_duration_fast: string;
  animation_easing: string;
  // Settings
  enable_animations: boolean;
  enable_hover_effects: boolean;
  container_max_width: string;
  container_padding: string;
}

export function DesignTokenEditor() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>('colors');
  const [copied, setCopied] = useState<string | null>(null);

  const { data: tokens, isLoading } = useQuery<DesignTokens>({
    queryKey: ['/api/cms/design-tokens'],
    queryFn: () => authenticatedApiRequest('/api/cms/design-tokens'),
  });

  const [localTokens, setLocalTokens] = useState<Partial<DesignTokens>>({});

  const effectiveTokens = { ...tokens, ...localTokens } as DesignTokens;

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<DesignTokens>) => {
      return authenticatedApiRequest('/api/cms/design-tokens', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Lagret', description: 'Design tokens oppdatert' });
      queryClient.invalidateQueries({ queryKey: ['/api/cms/design-tokens'] });
      setLocalTokens({});
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const updateToken = (key: keyof DesignTokens, value: any) => {
    setLocalTokens(prev => ({ ...prev, [key]: value }));
  };

  const generateCSS = () => {
    if (!effectiveTokens) return '';
    
    return `:root {
  /* Colors */
  --color-primary: ${effectiveTokens.primary_color};
  --color-primary-light: ${effectiveTokens.primary_color_light};
  --color-primary-dark: ${effectiveTokens.primary_color_dark};
  --color-secondary: ${effectiveTokens.secondary_color};
  --color-accent: ${effectiveTokens.accent_color};
  --color-background: ${effectiveTokens.background_color};
  --color-surface: ${effectiveTokens.surface_color};
  --color-text: ${effectiveTokens.text_color};
  --color-muted: ${effectiveTokens.muted_color};
  --color-border: ${effectiveTokens.border_color};
  
  /* Typography */
  --font-family: ${effectiveTokens.font_family};
  --font-family-heading: ${effectiveTokens.font_family_heading};
  --font-size-base: ${effectiveTokens.font_size_base};
  --line-height-base: ${effectiveTokens.line_height_base};
  --line-height-heading: ${effectiveTokens.line_height_heading};
  --font-weight-normal: ${effectiveTokens.font_weight_normal};
  --font-weight-medium: ${effectiveTokens.font_weight_medium};
  --font-weight-bold: ${effectiveTokens.font_weight_bold};
  
  /* Spacing */
  --spacing-xs: ${effectiveTokens.spacing_xs};
  --spacing-sm: ${effectiveTokens.spacing_sm};
  --spacing-md: ${effectiveTokens.spacing_md};
  --spacing-lg: ${effectiveTokens.spacing_lg};
  --spacing-xl: ${effectiveTokens.spacing_xl};
  --spacing-2xl: ${effectiveTokens.spacing_2xl};
  --spacing-3xl: ${effectiveTokens.spacing_3xl};
  
  /* Borders */
  --radius-sm: ${effectiveTokens.border_radius_sm};
  --radius-md: ${effectiveTokens.border_radius_md};
  --radius-lg: ${effectiveTokens.border_radius_lg};
  --radius-xl: ${effectiveTokens.border_radius_xl};
  --border-width: ${effectiveTokens.border_width};
  
  /* Shadows */
  --shadow-sm: ${effectiveTokens.shadow_sm};
  --shadow-md: ${effectiveTokens.shadow_md};
  --shadow-lg: ${effectiveTokens.shadow_lg};
  --shadow-xl: ${effectiveTokens.shadow_xl};
  
  /* Animation */
  --duration: ${effectiveTokens.animation_duration};
  --duration-slow: ${effectiveTokens.animation_duration_slow};
  --duration-fast: ${effectiveTokens.animation_duration_fast};
  --easing: ${effectiveTokens.animation_easing};
}`;
  };

  const copyCSS = () => {
    navigator.clipboard.writeText(generateCSS());
    setCopied('css');
    setTimeout(() => setCopied(null), 2000);
    toast({ title: 'Kopiert!', description: 'CSS variabler kopiert til utklippstavle' });
  };

  const ColorInput = ({ label, value, tokenKey, hint }: { 
    label: string; 
    value: string; 
    tokenKey: keyof DesignTokens;
    hint?: string;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => updateToken(tokenKey, e.target.value)}
          className="h-10 w-16 rounded border cursor-pointer"
        />
        <Input
          value={value || ''}
          onChange={(e) => updateToken(tokenKey, e.target.value)}
          className="flex-1 font-mono text-sm"
          placeholder="#000000"
        />
        <div 
          className="h-10 w-10 rounded border flex-shrink-0"
          style={{ backgroundColor: value }}
          title={value}
        />
      </div>
    </div>
  );

  const TextInput = ({ label, value, tokenKey, placeholder, unit }: { 
    label: string; 
    value: string | number; 
    tokenKey: keyof DesignTokens;
    placeholder?: string;
    unit?: string;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value || ''}
          onChange={(e) => updateToken(tokenKey, e.target.value)}
          className="font-mono text-sm"
          placeholder={placeholder}
        />
        {unit && <Badge variant="outline" className="px-3">{unit}</Badge>}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!effectiveTokens) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ingen design tokens funnet</CardTitle>
          <CardDescription>Opprett ditt første token-sett</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="h-6 w-6" />
            Design Token Manager
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Definer globale designverdier for hele nettstedet
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setLocalTokens({})}
            disabled={Object.keys(localTokens).length === 0}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Tilbakestill
          </Button>
          <Button
            onClick={() => saveMutation.mutate(localTokens)}
            disabled={saveMutation.isPending || Object.keys(localTokens).length === 0}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Lagre endringer
          </Button>
        </div>
      </div>

      {Object.keys(localTokens).length > 0 && (
        <Badge variant="secondary" className="border-blue-200 bg-blue-50 text-blue-700">
          {Object.keys(localTokens).length} ulagrede endringer
        </Badge>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="colors" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Farger
          </TabsTrigger>
          <TabsTrigger value="typography" className="flex items-center gap-2">
            <Type className="h-4 w-4" />
            Typografi
          </TabsTrigger>
          <TabsTrigger value="spacing" className="flex items-center gap-2">
            <Box className="h-4 w-4" />
            Spacing
          </TabsTrigger>
          <TabsTrigger value="effects" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Effekter
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            Eksport
          </TabsTrigger>
        </TabsList>

        {/* Colors Tab */}
        <TabsContent value="colors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hovedfarger</CardTitle>
              <CardDescription>Primære farger brukt på hele nettstedet</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <ColorInput 
                label="Primærfarge" 
                value={effectiveTokens.primary_color} 
                tokenKey="primary_color"
                hint="Hovedfarge"
              />
              <ColorInput 
                label="Primærfarge Lys" 
                value={effectiveTokens.primary_color_light} 
                tokenKey="primary_color_light"
                hint="Hover states"
              />
              <ColorInput 
                label="Primærfarge Mørk" 
                value={effectiveTokens.primary_color_dark} 
                tokenKey="primary_color_dark"
                hint="Active states"
              />
              <ColorInput 
                label="Sekundærfarge" 
                value={effectiveTokens.secondary_color} 
                tokenKey="secondary_color"
              />
              <ColorInput 
                label="Aksentfarge" 
                value={effectiveTokens.accent_color} 
                tokenKey="accent_color"
                hint="Call-to-actions"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bakgrunner & Overflater</CardTitle>
              <CardDescription>Bakgrunnsfarger og kort/paneler</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <ColorInput 
                label="Bakgrunnsfarge" 
                value={effectiveTokens.background_color} 
                tokenKey="background_color"
              />
              <ColorInput 
                label="Bakgrunn Mørk" 
                value={effectiveTokens.background_color_dark} 
                tokenKey="background_color_dark"
              />
              <ColorInput 
                label="Overflatefarge" 
                value={effectiveTokens.surface_color} 
                tokenKey="surface_color"
                hint="Kort, cards"
              />
              <ColorInput 
                label="Overflate Mørk" 
                value={effectiveTokens.surface_color_dark} 
                tokenKey="surface_color_dark"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tekst & Grenser</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <ColorInput 
                label="Tekstfarge" 
                value={effectiveTokens.text_color} 
                tokenKey="text_color"
              />
              <ColorInput 
                label="Tekst Mørk" 
                value={effectiveTokens.text_color_dark} 
                tokenKey="text_color_dark"
              />
              <ColorInput 
                label="Dempet Farge" 
                value={effectiveTokens.muted_color} 
                tokenKey="muted_color"
                hint="Sekundær tekst"
              />
              <ColorInput 
                label="Grensefarge" 
                value={effectiveTokens.border_color} 
                tokenKey="border_color"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Typography Tab */}
        <TabsContent value="typography" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Skrifttyper</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <TextInput 
                label="Basis Skrift" 
                value={effectiveTokens.font_family} 
                tokenKey="font_family"
                placeholder="Inter, sans-serif"
              />
              <TextInput 
                label="Overskrift Skrift" 
                value={effectiveTokens.font_family_heading} 
                tokenKey="font_family_heading"
                placeholder="Inter, sans-serif"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Størrelser & Vekter</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <TextInput 
                label="Basis Fontstørrelse" 
                value={effectiveTokens.font_size_base} 
                tokenKey="font_size_base"
                placeholder="16px"
              />
              <TextInput 
                label="Skala Faktor" 
                value={effectiveTokens.font_size_scale} 
                tokenKey="font_size_scale"
                placeholder="1.25"
              />
              <TextInput 
                label="Normal Vekt" 
                value={effectiveTokens.font_weight_normal} 
                tokenKey="font_weight_normal"
                placeholder="400"
              />
              <TextInput 
                label="Medium Vekt" 
                value={effectiveTokens.font_weight_medium} 
                tokenKey="font_weight_medium"
                placeholder="500"
              />
              <TextInput 
                label="Bold Vekt" 
                value={effectiveTokens.font_weight_bold} 
                tokenKey="font_weight_bold"
                placeholder="700"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Linjehøyde & Letter Spacing</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <TextInput 
                label="Basis Linjehøyde" 
                value={effectiveTokens.line_height_base} 
                tokenKey="line_height_base"
                placeholder="1.5"
              />
              <TextInput 
                label="Overskrift Linjehøyde" 
                value={effectiveTokens.line_height_heading} 
                tokenKey="line_height_heading"
                placeholder="1.2"
              />
              <TextInput 
                label="Letter Spacing" 
                value={effectiveTokens.letter_spacing} 
                tokenKey="letter_spacing"
                placeholder="0"
              />
              <TextInput 
                label="Overskrift Letter Spacing" 
                value={effectiveTokens.letter_spacing_heading} 
                tokenKey="letter_spacing_heading"
                placeholder="-0.02em"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Spacing Tab */}
        <TabsContent value="spacing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Spacing System</CardTitle>
              <CardDescription>Konsistent spacing-skala basert på basis-enhet</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <TextInput 
                label="Basis Enhet" 
                value={effectiveTokens.spacing_unit} 
                tokenKey="spacing_unit"
                placeholder="4px"
              />
              <TextInput 
                label="Extra Small" 
                value={effectiveTokens.spacing_xs} 
                tokenKey="spacing_xs"
                placeholder="4px"
              />
              <TextInput 
                label="Small" 
                value={effectiveTokens.spacing_sm} 
                tokenKey="spacing_sm"
                placeholder="8px"
              />
              <TextInput 
                label="Medium" 
                value={effectiveTokens.spacing_md} 
                tokenKey="spacing_md"
                placeholder="16px"
              />
              <TextInput 
                label="Large" 
                value={effectiveTokens.spacing_lg} 
                tokenKey="spacing_lg"
                placeholder="24px"
              />
              <TextInput 
                label="Extra Large" 
                value={effectiveTokens.spacing_xl} 
                tokenKey="spacing_xl"
                placeholder="32px"
              />
              <TextInput 
                label="2XL" 
                value={effectiveTokens.spacing_2xl} 
                tokenKey="spacing_2xl"
                placeholder="48px"
              />
              <TextInput 
                label="3XL" 
                value={effectiveTokens.spacing_3xl} 
                tokenKey="spacing_3xl"
                placeholder="64px"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Container & Layout</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <TextInput 
                label="Max Bredde" 
                value={effectiveTokens.container_max_width} 
                tokenKey="container_max_width"
                placeholder="1280px"
              />
              <TextInput 
                label="Container Padding" 
                value={effectiveTokens.container_padding} 
                tokenKey="container_padding"
                placeholder="24px"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Effects Tab */}
        <TabsContent value="effects" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Border Radius</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-3">
              <div>
                <TextInput 
                  label="None" 
                  value={effectiveTokens.border_radius_none} 
                  tokenKey="border_radius_none"
                  placeholder="0"
                />
                <div className="mt-2 h-16 bg-primary" style={{ borderRadius: effectiveTokens.border_radius_none }} />
              </div>
              <div>
                <TextInput 
                  label="Small" 
                  value={effectiveTokens.border_radius_sm} 
                  tokenKey="border_radius_sm"
                  placeholder="4px"
                />
                <div className="mt-2 h-16 bg-primary" style={{ borderRadius: effectiveTokens.border_radius_sm }} />
              </div>
              <div>
                <TextInput 
                  label="Medium" 
                  value={effectiveTokens.border_radius_md} 
                  tokenKey="border_radius_md"
                  placeholder="8px"
                />
                <div className="mt-2 h-16 bg-primary" style={{ borderRadius: effectiveTokens.border_radius_md }} />
              </div>
              <div>
                <TextInput 
                  label="Large" 
                  value={effectiveTokens.border_radius_lg} 
                  tokenKey="border_radius_lg"
                  placeholder="12px"
                />
                <div className="mt-2 h-16 bg-primary" style={{ borderRadius: effectiveTokens.border_radius_lg }} />
              </div>
              <div>
                <TextInput 
                  label="Extra Large" 
                  value={effectiveTokens.border_radius_xl} 
                  tokenKey="border_radius_xl"
                  placeholder="16px"
                />
                <div className="mt-2 h-16 bg-primary" style={{ borderRadius: effectiveTokens.border_radius_xl }} />
              </div>
              <div>
                <TextInput 
                  label="Full" 
                  value={effectiveTokens.border_radius_full} 
                  tokenKey="border_radius_full"
                  placeholder="9999px"
                />
                <div className="mt-2 h-16 bg-primary" style={{ borderRadius: effectiveTokens.border_radius_full }} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Shadows</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              {[
                { key: 'shadow_sm', label: 'Small Shadow' },
                { key: 'shadow_md', label: 'Medium Shadow' },
                { key: 'shadow_lg', label: 'Large Shadow' },
                { key: 'shadow_xl', label: 'Extra Large Shadow' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <TextInput 
                    label={label} 
                    value={effectiveTokens[key as keyof DesignTokens] as string} 
                    tokenKey={key as keyof DesignTokens}
                  />
                  <div 
                    className="mt-2 h-16 bg-white border rounded-lg" 
                    style={{ boxShadow: effectiveTokens[key as keyof DesignTokens] as string }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Animasjoner</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <TextInput 
                label="Standard Varighet" 
                value={effectiveTokens.animation_duration} 
                tokenKey="animation_duration"
                placeholder="200ms"
              />
              <TextInput 
                label="Sakte Varighet" 
                value={effectiveTokens.animation_duration_slow} 
                tokenKey="animation_duration_slow"
                placeholder="300ms"
              />
              <TextInput 
                label="Rask Varighet" 
                value={effectiveTokens.animation_duration_fast} 
                tokenKey="animation_duration_fast"
                placeholder="150ms"
              />
              <TextInput 
                label="Easing Function" 
                value={effectiveTokens.animation_easing} 
                tokenKey="animation_easing"
                placeholder="cubic-bezier(0.4, 0, 0.2, 1)"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                CSS Variabler (Custom Properties)
              </CardTitle>
              <CardDescription>
                Kopier og lim inn i din CSS-fil eller style tag
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto text-xs">
                  <code>{generateCSS()}</code>
                </pre>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute top-2 right-2"
                  onClick={copyCSS}
                >
                  {copied === 'css' ? (
                    <><Check className="h-4 w-4 mr-2" /> Kopiert</>
                  ) : (
                    <><Copy className="h-4 w-4 mr-2" /> Kopier CSS</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bruk i Kode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">CSS Eksempel</Label>
                <pre className="bg-slate-100 p-3 rounded text-xs">
{`.button {
  background-color: var(--color-primary);
  color: var(--color-text);
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: all var(--duration) var(--easing);
}`}
                </pre>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Tailwind Eksempel</Label>
                <pre className="bg-slate-100 p-3 rounded text-xs">
{`<div className="bg-primary text-white rounded-md shadow-md p-md" />`}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
