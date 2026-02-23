import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { LayoutControls } from "@/components/cms/layout-controls";
import { AnimationControls } from "@/components/cms/animation-controls";
import { CodeExport } from "@/components/cms/code-export";
import { getBlockEditor, getBlockEditorByContent } from "@/components/cms/block-property-editor";
import {
  SEOEditor, ScheduleEditor, ImageUploader, GlobalLayoutEditor,
  useSectionClipboard, SectionTemplatesPanel, CustomCSSEditor,
  VersionHistory, ImportExport, AccessibilityChecker, AnalyticsPanel,
  PerformanceEstimator, I18nPanel, FormSubmissionsViewer,
} from "@/components/cms/editor-extensions";
import {
  GripVertical, Save, Undo2, Redo2, Monitor, Tablet, Smartphone,
  Plus, Trash2, Copy, Palette, Sparkles, Play, Clock, CheckCircle,
  Code2, Loader2,
  Keyboard, Layers, Box, Grid3X3, X, Users, MapPin, MessageCircle,
  FileText, LayoutTemplate, Search, Calendar, Upload, LayoutPanelTop,
  ClipboardCopy, ClipboardPaste, BookmarkPlus, History, FileDown, 
  Accessibility, BarChart3, Gauge, Languages, Globe, PanelRightOpen, Target,
  ExternalLink, AlertTriangle
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TIDUM_TOKENS, tidumPageStyles } from "@/lib/tidum-page-styles";

function getAdminToken(): string | null {
  return sessionStorage.getItem('cms_admin_token');
}

interface Section {
  id: string;
  type: 'hero' | 'features' | 'testimonials' | 'cta' | 'custom' | 'container';
  title: string;
  content: any;
  spacing: {
    paddingTop: number;
    paddingBottom: number;
    paddingX: number;
    gap: number;
  };
  background: {
    color: string;
    gradient?: string;
    image?: string;
    overlay?: string;
  };
  textColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  boxShadow?: string;
  layout?: {
    type: 'flex' | 'grid' | 'stack';
    direction: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    justify: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
    align: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
    wrap: boolean;
    gridCols?: number;
    gridRows?: number;
    gap: number;
  };
  animations?: {
    enabled: boolean;
    type: 'fade' | 'slide' | 'scale' | 'rotate' | 'none';
    duration: number;
    delay: number;
    trigger: 'load' | 'scroll' | 'hover' | 'click';
    scrollOffset?: number;
  };
  templateId?: string;
  customCss?: string;
  order: number;
  children?: Section[];
}

interface ComponentTemplate {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
  config: Partial<Section>;
}

// ── Sub-category labels for the component library UI ──
const TIDUM_SUBCATEGORIES: Record<string, string> = {
  'tidum-nav': 'Navigasjon',
  'tidum-hero': 'Hero',
  'tidum-features': 'Funksjoner',
  'tidum-content': 'Innhold',
  'tidum-stats': 'Statistikk',
  'tidum-trust': 'Trygghet',
  'tidum-cta': 'CTA',
  'tidum-footer': 'Bunn',
  'tidum-form': 'Skjema',
  'tidum-guide': 'Guide',
  'tidum-commerce': 'Priser og Team',
  'tidum-media': 'Media',
  'generic': 'Generelle',
};

const CATEGORY_ICON_MAP: Record<string, any> = {
  'tidum-nav': LayoutPanelTop,
  'tidum-hero': Monitor,
  'tidum-features': Grid3X3,
  'tidum-content': FileText,
  'tidum-stats': BarChart3,
  'tidum-trust': Accessibility,
  'tidum-cta': Sparkles,
  'tidum-footer': Box,
  'tidum-form': ClipboardPaste,
  'tidum-guide': BookmarkPlus,
  'tidum-commerce': Layers,
  'tidum-media': Upload,
  'generic': Code2,
};

const PRACTICE_ICON_MAP: Record<string, any> = {
  Target,
  FileText,
  Calendar,
  Search,
  Users,
  BarChart3,
};

const COMPONENT_LIBRARY: ComponentTemplate[] = [
  // ═══════════════════════════════════════════
  // TIDUM NAVIGASJON
  // ═══════════════════════════════════════════
  {
    id: 'tidum-header-bar',
    name: 'Tidum Toppbar',
    category: 'tidum-nav',
    thumbnail: 'nav',
    config: {
      type: 'container',
      title: 'Tidum Toppbar',
      content: {
        logo: 'Tidum',
        navLinks: [
          { text: 'Funksjoner', href: '#funksjoner' },
          { text: 'Hvorfor Tidum?', href: '/why-tidum' },
          { text: 'Kontakt', href: '/contact' },
        ],
        ctaButton: { text: 'Be om demo', href: '/contact' },
      },
      spacing: { paddingTop: 20, paddingBottom: 20, paddingX: 24, gap: 16 },
      background: { color: 'transparent' },
      layout: { type: 'flex', direction: 'row', justify: 'between', align: 'center', wrap: false, gap: 16 },
    },
  },

  // ═══════════════════════════════════════════
  // TIDUM HERO SEKSJONER
  // ═══════════════════════════════════════════
  {
    id: 'tidum-hero-split',
    name: 'Hero Delt (Tekst + Bilde)',
    category: 'tidum-hero',
    thumbnail: 'image',
    config: {
      type: 'hero',
      title: 'Arbeidstid, gjort enkelt',
      content: {
        subtitle: 'Tidum er et moderne arbeidstidssystem bygget for norsk arbeidsliv — fra felt og turnus til dokumentasjonskrav.',
        ctaPrimary: { text: 'Be om demo', url: '/contact' },
        ctaSecondary: { text: 'Se hvordan det fungerer', url: '#funksjoner' },
        heroImage: '/placeholder-mockup.png',
      },
      spacing: { paddingTop: 40, paddingBottom: 40, paddingX: 32, gap: 40 },
      background: { color: TIDUM_TOKENS.colorBgMain, gradient: 'linear-gradient(180deg, rgba(255,255,255,0.97), rgba(250,251,248,0.95))' },
      layout: { type: 'grid', direction: 'row', justify: 'center', align: 'center', wrap: false, gridCols: 2, gap: 40 },
      animations: { enabled: true, type: 'fade', duration: 600, delay: 0, trigger: 'load' },
    },
  },
  {
    id: 'tidum-hero-centered',
    name: 'Hero Sentrert (Kun tekst)',
    category: 'tidum-hero',
    thumbnail: 'target',
    config: {
      type: 'hero',
      title: 'Hvorfor velge Tidum?',
      content: {
        titleHighlight: 'Tidum',
        subtitle: 'En enklere, sikrere og mer effektiv måte å håndtere arbeidstid — tilpasset norske krav og arbeidshverdag.',
        ctaPrimary: { text: 'Be om demo', url: '/contact' },
        ctaSecondary: { text: 'Se funksjonene', url: '#funksjoner' },
      },
      spacing: { paddingTop: 48, paddingBottom: 64, paddingX: 32, gap: 24 },
      background: { color: TIDUM_TOKENS.colorBgMain, gradient: 'linear-gradient(180deg, rgba(255,255,255,0.97), rgba(250,251,248,0.95))' },
      layout: { type: 'flex', direction: 'column', justify: 'center', align: 'center', wrap: false, gap: 24 },
      animations: { enabled: true, type: 'fade', duration: 600, delay: 0, trigger: 'load' },
    },
  },
  {
    id: 'tidum-hero-contact',
    name: 'Hero Kontakt (Tekst + Skjema)',
    category: 'tidum-hero',
    thumbnail: 'mail',
    config: {
      type: 'hero',
      title: 'Kontakt oss',
      content: {
        subtitle: 'Vi hjelper deg gjerne med å finne den beste løsningen for din virksomhet.',
        layout: 'split-with-form',
      },
      spacing: { paddingTop: 32, paddingBottom: 40, paddingX: 32, gap: 24 },
      background: { color: TIDUM_TOKENS.colorBgMain, gradient: 'linear-gradient(180deg, rgba(255,255,255,0.97), rgba(250,251,248,0.95))' },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 2, gap: 24 },
      animations: { enabled: true, type: 'fade', duration: 600, delay: 0, trigger: 'load' },
    },
  },
  {
    id: 'tidum-hero-icon',
    name: 'Hero Med Ikon (Personvern-stil)',
    category: 'tidum-hero',
    thumbnail: 'shield',
    config: {
      type: 'hero',
      title: 'Personvernerklæring',
      content: {
        icon: 'Shield',
        iconBg: '#E7F3EE',
        subtitle: 'Slik behandler vi dine personopplysninger',
        dateLabel: 'Sist oppdatert',
        date: '15. januar 2025',
      },
      spacing: { paddingTop: 48, paddingBottom: 48, paddingX: 32, gap: 16 },
      background: { color: TIDUM_TOKENS.colorBgMain, gradient: 'linear-gradient(180deg, rgba(255,255,255,0.97), rgba(250,251,248,0.95))' },
      layout: { type: 'flex', direction: 'column', justify: 'center', align: 'center', wrap: false, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 600, delay: 0, trigger: 'load' },
    },
  },

  // ═══════════════════════════════════════════
  // TIDUM FUNKSJONER / FEATURES
  // ═══════════════════════════════════════════
  {
    id: 'tidum-feature-grid-3',
    name: 'Funksjonskort (3-kolonne)',
    category: 'tidum-features',
    thumbnail: 'chart',
    config: {
      type: 'features',
      title: 'Et system bygget for virkeligheten',
      content: {
        cards: [
          { icon: 'Clock3', iconBg: '#E7F3EE', iconColor: '#3A8B73', title: 'Enkel registrering', points: ['Mobilvennlig grensesnitt', 'Hurtig tidsregistrering', 'Fungerer i felt'] },
          { icon: 'FileCheck2', iconBg: '#F5EFE1', iconColor: '#8F7E52', title: 'Trygg dokumentasjon', points: ['Automatiske rapporter', 'Norske krav oppfylt', 'Revisionsspor'] },
          { icon: 'BarChart3', iconBg: '#E8F5EE', iconColor: '#4C9A6F', title: 'Full oversikt', points: ['Sanntidsdata', 'Dashbord og analyser', 'Eksport til lønn'] },
        ],
      },
      spacing: { paddingTop: 32, paddingBottom: 40, paddingX: 32, gap: 16 },
      background: { color: '#ffffff' },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 3, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-benefits-grid',
    name: 'Fordelskort (2-3 kolonner)',
    category: 'tidum-features',
    thumbnail: 'sparkles',
    config: {
      type: 'features',
      title: 'Fordeler med Tidum',
      content: {
        subtitle: 'Oppdag hvordan Tidum kan forbedre din arbeidshverdag.',
        benefits: [
          { icon: 'Clock', title: 'Spar tid', description: 'Reduser tidsbruk på administrasjon med automatiserte prosesser.' },
          { icon: 'Shield', title: 'Sikker data', description: 'Dine data er trygt lagret med industristandarder for sikkerhet.' },
          { icon: 'Users', title: 'Teamarbeid', description: 'Samarbeid enkelt med kolleger og ledere i sanntid.' },
          { icon: 'BarChart3', title: 'Innsikt', description: 'Få verdifulle innsikter fra timedata med smarte rapporter.' },
          { icon: 'Zap', title: 'Rask oppsett', description: 'Kom i gang på minutter — ingen komplisert installasjon.' },
          { icon: 'Building', title: 'Skalerbart', description: 'Fungerer like bra for 5 som for 500 ansatte.' },
        ],
      },
      spacing: { paddingTop: 32, paddingBottom: 40, paddingX: 32, gap: 16 },
      background: { color: TIDUM_TOKENS.colorBgSection },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 3, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-how-it-works',
    name: 'Slik fungerer det (4 steg)',
    category: 'tidum-features',
    thumbnail: 'steps',
    config: {
      type: 'features',
      title: 'Kom i gang på minutter',
      content: {
        badge: '4 steg fra oppsett til rapport',
        steps: [
          { step: 1, icon: 'UserPlus', title: 'Opprett brukere', description: 'Legg til ansatte og gi dem tilgang på sekunder.' },
          { step: 2, icon: 'Clock', title: 'Registrer arbeidstid', description: 'Enkel inn-/utregistrering fra mobil eller PC.' },
          { step: 3, icon: 'Activity', title: 'Følg med i sanntid', description: 'Oversikt over hvem som jobber, pause og fravær.' },
          { step: 4, icon: 'FileOutput', title: 'Eksporter rapporter', description: 'Generer rapporter klare for lønn og dokumentasjon.' },
        ],
      },
      spacing: { paddingTop: 32, paddingBottom: 40, paddingX: 32, gap: 16 },
      background: { color: TIDUM_TOKENS.colorBgSection },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 2, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },

  // ═══════════════════════════════════════════
  // TIDUM INNHOLD / CONTENT
  // ═══════════════════════════════════════════
  {
    id: 'tidum-story-section',
    name: 'Historieseksjon (Problem/Løsning)',
    category: 'tidum-content',
    thumbnail: 'guide',
    config: {
      type: 'custom',
      title: 'Før og etter Tidum',
      content: {
        leftCard: {
          badge: 'Et vanlig vaktskifte, før Tidum',
          title: 'Flere systemer. Flere tolkninger.',
          description: 'Uten et samlet system blir registrering rotete og uoversiktlig.',
          issues: [
            { icon: 'AlertTriangle', title: 'Manuell registrering', detail: 'Post-it, Excel, SMS — alle gjør det forskjellig.' },
            { icon: 'XCircle', title: 'Ingen dokumentasjon', detail: 'Vanskelig å bevise timer i etterkant.' },
            { icon: 'Clock', title: 'Tapt tid', detail: 'Timevis brukt på å samle inn og korrigere data.' },
          ],
        },
        rightCard: {
          title: 'Ett system. Én trygg sannhet.',
          subtitle: 'Med Tidum er alt samlet — enkelt, sporbart og trygt.',
          timeline: [
            { time: '07:00', text: 'Ansatt stempler inn via mobil' },
            { time: '12:00', text: 'Pause registreres automatisk' },
            { time: '15:30', text: 'Utregistrering og rapport sendt' },
          ],
          callout: 'Alle data samlet, alltid tilgjengelig.',
        },
      },
      spacing: { paddingTop: 24, paddingBottom: 32, paddingX: 32, gap: 24 },
      background: { color: TIDUM_TOKENS.colorBgSection },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 2, gap: 24 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-time-tracking-mock',
    name: 'Timeføring Timer (Mock)',
    category: 'tidum-content',
    thumbnail: 'clock',
    config: {
      type: 'container',
      title: 'Hei, Maria!',
      content: {
        timerMock: true,
        dateLabel: 'Mandag 23. februar 2026',
        status: 'Registreringen pågår',
        duration: '2 t 15 min',
        pauseLabel: 'Pause / avbrudd',
        pauseValue: '00:30 min',
        startCta: 'Pause',
        doneCta: 'Ferdig',
        client: 'Sak 1024 - Solsiden institusjon',
        tiltak: 'Arbeidsforberedende trening',
        todayTitle: 'Oppfølging i dag',
        todayValue: '08:00 - 16:00',
        todayDetail: 'Registrert i dag 2 t 15 min',
        weekTitle: 'Oppfølging sist uke',
        weekValue: '37 t 20 min',
        weekDetail: 'Total arbeidstid',
        noteTitle: 'Husk kort notat hvis noe viktig skjedde i dag',
        notePlaceholder: 'Skriv kort notat her...',
      },
      spacing: { paddingTop: 20, paddingBottom: 28, paddingX: 24, gap: 16 },
      background: {
        color: TIDUM_TOKENS.colorBgMain,
        gradient: 'radial-gradient(circle at 86% 17%, rgba(154,186,190,0.16), transparent 42%), radial-gradient(circle at 95% 90%, rgba(166,203,194,0.18), transparent 34%), linear-gradient(180deg, rgba(247,251,249,0.96), rgba(238,245,242,0.92))',
      },
      layout: { type: 'stack', direction: 'column', justify: 'start', align: 'stretch', wrap: false, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 550, delay: 60, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-two-col-split',
    name: 'To-kolonne kort (delt)',
    category: 'tidum-content',
    thumbnail: 'split',
    config: {
      type: 'container',
      title: 'Trygghet for alle parter',
      content: {
        leftTitle: 'Trygghet for alle parter',
        leftSubtitle: 'Tidum er bygget for å gi trygghet — ikke overvåkning.',
        leftItems: [
          { icon: 'ShieldCheck', title: 'Ikke overvåkning', description: 'Registrering handler om dokumentasjon, ikke kontroll.' },
          { icon: 'Clock3', title: 'Ikke stress', description: 'Enkel inn/ut — ferdig på sekunder.' },
          { icon: 'ClipboardList', title: 'Ikke komplisert', description: 'Intuitivt oppsett uten opplæringsbehov.' },
        ],
        rightTitle: 'Dette gir trygghet i praksis',
        rightSubtitle: 'Konkrete fordeler for ledere og ansatte.',
        rightItems: [
          { icon: 'Users', title: 'For ansatte', description: 'Kontrollerbare, rettferdige timeregistreringer.' },
          { icon: 'BarChart3', title: 'For ledere', description: 'Oversikt uten mikrostyring.' },
          { icon: 'FileCheck2', title: 'For revisjon', description: 'Alltid sporbar og korrekt dokumentasjon.' },
        ],
      },
      spacing: { paddingTop: 24, paddingBottom: 32, paddingX: 24, gap: 20 },
      background: { color: '#ffffff' },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'stretch', wrap: false, gridCols: 2, gap: 20 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-audience-list',
    name: 'Målgruppeliste (ikon + tekst)',
    category: 'tidum-content',
    thumbnail: 'users',
    config: {
      type: 'custom',
      title: 'Hvem bruker Tidum?',
      content: {
        items: [
          { icon: 'Heart', label: 'Miljøarbeidere' },
          { icon: 'Briefcase', label: 'Turnus- og feltarbeid' },
          { icon: 'Building2', label: 'Private omsorgsaktører' },
          { icon: 'Landmark', label: 'Kommuner og offentlige virksomheter' },
        ],
      },
      spacing: { paddingTop: 24, paddingBottom: 32, paddingX: 24, gap: 16 },
      background: { color: 'transparent' },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 2, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-prose-content',
    name: 'Tekstinnhold (Prose/Markdown)',
    category: 'tidum-content',
    thumbnail: 'text',
    config: {
      type: 'custom',
      title: 'Innholdsseksjon',
      content: {
        markdown: '## Overskrift\n\nSkriv ditt innhold her. Denne seksjonen støtter **markdown-formatering** med overskrifter, avsnitt, lister og mer.\n\n### Underoverskrift\n\n- Punkt 1\n- Punkt 2\n- Punkt 3\n\nLegg til så mye tekst du trenger for å formidle informasjonen.',
      },
      spacing: { paddingTop: 24, paddingBottom: 32, paddingX: 40, gap: 16 },
      background: { color: '#ffffff' },
      layout: { type: 'flex', direction: 'column', justify: 'start', align: 'start', wrap: false, gap: 16 },
    },
  },
  {
    id: 'tidum-nordic-split',
    name: 'Norsk sjekkliste + funksjoner (delt)',
    category: 'tidum-content',
    thumbnail: 'norway',
    config: {
      type: 'container',
      title: 'Bygget for norske forhold',
      content: {
        leftTitle: 'Bygget for norske forhold',
        leftSubtitle: 'Tidum er designet fra bunnen for norsk arbeidsliv.',
        bulletPoints: [
          'AML-kompatibel registrering',
          'Norsk språk og datoformat',
          'GDPR- og Schrems II-samsvar',
          'Integrert med norske lønnssystemer',
          'Tilpasset turnusarbeid',
        ],
        rightTitle: 'Funksjoner som gjør forskjellen',
        rightSubtitle: 'Praktiske verktøy for hverdagen.',
        features: [
          { icon: 'Smartphone', title: 'Mobilregistrering', description: 'Registrer tid direkte fra telefonen.' },
          { icon: 'MapPin', title: 'GPS-verifisering', description: 'Valgfri stedsbekreftelse for feltarbeid.' },
          { icon: 'Bell', title: 'Varsler', description: 'Påminnelser om manglende registreringer.' },
          { icon: 'Download', title: 'Eksport', description: 'Last ned data i CSV, PDF eller Excel.' },
        ],
      },
      spacing: { paddingTop: 24, paddingBottom: 32, paddingX: 24, gap: 20 },
      background: { color: '#ffffff' },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'stretch', wrap: false, gridCols: 2, gap: 20 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },

  // ═══════════════════════════════════════════
  // TIDUM STATISTIKK
  // ═══════════════════════════════════════════
  {
    id: 'tidum-stats-bar',
    name: 'Statistikkfelt (4 tall)',
    category: 'tidum-stats',
    thumbnail: 'chart',
    config: {
      type: 'custom',
      title: 'Nøkkeltall',
      content: {
        stats: [
          { value: '98%', label: 'Kundetilfredshet' },
          { value: '30 min', label: 'Spart per dag' },
          { value: '500+', label: 'Norske bedrifter' },
          { value: '99.9%', label: 'Oppetid' },
        ],
      },
      spacing: { paddingTop: 32, paddingBottom: 32, paddingX: 32, gap: 32 },
      background: { color: '#ffffff' },
      layout: { type: 'grid', direction: 'row', justify: 'center', align: 'center', wrap: false, gridCols: 4, gap: 32 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },

  // ═══════════════════════════════════════════
  // TIDUM TRYGGHET / TRUST
  // ═══════════════════════════════════════════
  {
    id: 'tidum-trust-norsk',
    name: 'Norsk arbeidsliv (ikon + rutenett)',
    category: 'tidum-trust',
    thumbnail: 'norway',
    config: {
      type: 'container',
      title: 'Bygget for norsk arbeidsliv',
      content: {
        description: 'Tidum er designet for å møte kravene i norsk arbeidsliv — fra lovpålagte dokumentasjonskrav til turnus og feltarbeid.',
        items: [
          { title: 'Norsk lovverk', detail: 'Oppfyller AML og tilsynskrav', flag: true },
          { title: 'Personvern', detail: 'GDPR- og Schrems II-kompatibel' },
          { title: 'Norske servere', detail: 'Data lagret i Europa' },
          { title: 'Norsk support', detail: 'Hjelp på norsk, raskt og effektivt' },
        ],
      },
      spacing: { paddingTop: 24, paddingBottom: 32, paddingX: 32, gap: 24 },
      background: { color: '#ffffff' },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'center', wrap: false, gridCols: 2, gap: 24 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-trust-section',
    name: 'Tillitsseksjon (anbefalt av)',
    category: 'tidum-trust',
    thumbnail: 'award',
    config: {
      type: 'container',
      title: 'Anbefalt av norske tiltaksbedrifter',
      content: {
        icon: 'Award',
        subtitle: 'Tidum er utviklet i tett samarbeid med norske virksomheter som trenger pålitelig tidsstyring.',
        badge: { icon: 'Heart', text: 'Utviklet i Norge' },
        items: [
          { title: 'Tiltaksbedrifter', detail: 'Arbeidstrening og oppfølging' },
          { title: 'Kommuner', detail: 'Omsorg, renhold og teknisk drift' },
          { title: 'Konsulenter', detail: 'Prosjektbasert arbeid og fakturering' },
          { title: 'Alle bransjer', detail: 'Fleksibelt nok for enhver virksomhet' },
        ],
      },
      spacing: { paddingTop: 24, paddingBottom: 32, paddingX: 32, gap: 24 },
      background: { color: '#ffffff' },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'center', wrap: false, gridCols: 2, gap: 24 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },

  // ═══════════════════════════════════════════
  // TIDUM CTA
  // ═══════════════════════════════════════════
  {
    id: 'tidum-cta-banner',
    name: 'CTA Banner (mørk)',
    category: 'tidum-cta',
    thumbnail: 'target',
    config: {
      type: 'cta',
      title: 'Klar for å gjøre arbeidstid enklere?',
      content: {
        subtitle: 'Se hvordan Tidum kan passe deres arbeidshverdag.',
        primaryButton: { text: 'Be om demo', url: '/contact' },
        secondaryButton: { text: 'Ta kontakt', url: '/contact' },
      },
      spacing: { paddingTop: 40, paddingBottom: 40, paddingX: 32, gap: 24 },
      background: { color: TIDUM_TOKENS.colorPrimary },
      layout: { type: 'flex', direction: 'column', justify: 'center', align: 'center', wrap: false, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 0, trigger: 'scroll' },
    },
  },

  // ═══════════════════════════════════════════
  // TIDUM FOOTER
  // ═══════════════════════════════════════════
  {
    id: 'tidum-footer-full',
    name: 'Full Footer (3-kolonne)',
    category: 'tidum-footer',
    thumbnail: 'footer',
    config: {
      type: 'container',
      title: 'Tidum Footer',
      content: {
        columns: [
          { heading: 'Om Tidum', text: 'Arbeidstidssystem for felt, turnus og norsk dokumentasjonskrav.', email: 'kontakt@tidum.no' },
          { heading: 'Snarveier', links: ['Funksjoner', 'Hvorfor Tidum?', 'Kontakt', 'Be om demo'] },
          { heading: 'Trygghet', badges: ['Bygget for norsk arbeidsliv', 'Personvern først', 'Klar for dokumentasjonskrav'] },
        ],
        copyright: '© Tidum. Alle rettigheter reservert.',
        slogan: 'Arbeidstid, gjort enkelt.',
      },
      spacing: { paddingTop: 32, paddingBottom: 32, paddingX: 32, gap: 32 },
      background: { color: '#ffffff', gradient: 'linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,246,0.92))' },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 3, gap: 32 },
    },
  },
  {
    id: 'tidum-footer-minimal',
    name: 'Minimal Footer (sentrert)',
    category: 'tidum-footer',
    thumbnail: 'minimal',
    config: {
      type: 'container',
      title: 'Minimal Footer',
      content: {
        links: [
          { text: 'Personvern', href: '/privacy' },
          { text: 'Vilkår', href: '/terms' },
        ],
        copyright: '© Tidum. Alle rettigheter reservert.',
      },
      spacing: { paddingTop: 24, paddingBottom: 24, paddingX: 24, gap: 16 },
      background: { color: 'transparent' },
      layout: { type: 'flex', direction: 'column', justify: 'center', align: 'center', wrap: false, gap: 16 },
    },
  },

  // ═══════════════════════════════════════════
  // TIDUM SKJEMA / FORM
  // ═══════════════════════════════════════════
  {
    id: 'tidum-contact-info',
    name: 'Kontaktinfo-kort',
    category: 'tidum-form',
    thumbnail: 'contact',
    config: {
      type: 'custom',
      title: 'Kontaktinformasjon',
      content: {
        items: [
          { icon: 'Mail', label: 'E-post', value: 'kontakt@tidum.no', href: 'mailto:kontakt@tidum.no' },
          { icon: 'Phone', label: 'Telefon', value: '+47 97 95 92 94', href: 'tel:+4797959294' },
          { icon: 'MapPin', label: 'Adresse', value: 'Oslo, Norge' },
        ],
        footerText: 'Vi svarer vanligvis innen 24 timer på hverdager.',
      },
      spacing: { paddingTop: 24, paddingBottom: 24, paddingX: 24, gap: 16 },
      background: { color: '#ffffff' },
      layout: { type: 'flex', direction: 'column', justify: 'start', align: 'start', wrap: false, gap: 16 },
    },
  },
  {
    id: 'tidum-contact-form',
    name: 'Kontaktskjema-kort',
    category: 'tidum-form',
    thumbnail: 'text',
    config: {
      type: 'custom',
      title: 'Send oss en melding',
      content: {
        fields: [
          { id: 'name', label: 'Navn', type: 'text', placeholder: 'Ditt fulle navn', required: true },
          { id: 'email', label: 'E-post', type: 'email', placeholder: 'din@epost.no', required: true },
          { id: 'company', label: 'Bedrift', type: 'text', placeholder: 'Bedriftsnavn' },
          { id: 'phone', label: 'Telefon', type: 'tel', placeholder: '+47' },
          { id: 'subject', label: 'Emne', type: 'text', placeholder: 'Hva gjelder henvendelsen?', required: true },
          { id: 'message', label: 'Melding', type: 'textarea', placeholder: 'Beskriv din henvendelse...', required: true },
        ],
        submitText: 'Send henvendelse',
      },
      spacing: { paddingTop: 24, paddingBottom: 24, paddingX: 24, gap: 16 },
      background: { color: '#ffffff' },
      layout: { type: 'flex', direction: 'column', justify: 'start', align: 'stretch', wrap: false, gap: 16 },
    },
  },

  // ═══════════════════════════════════════════
  // TIDUM GUIDE-SEKSJONER
  // ═══════════════════════════════════════════
  {
    id: 'tidum-guide-feature',
    name: 'Guide-seksjon (ikon + kort)',
    category: 'tidum-guide',
    thumbnail: 'guide',
    config: {
      type: 'features',
      title: 'Registrer din tid',
      content: {
        icon: 'Clock',
        iconBg: '#E7F3EE',
        iconColor: '#3A8B73',
        subtitle: 'Din profesjonelle dagbok starter her',
        storyEmoji: 'ClipboardList',
        storyTitle: 'Tenk på tidsregistrering som din profesjonelle dagbok',
        storyDescription: 'Hver gang du registrerer tid, bygger du en pålitelig historikk som beskytter deg og arbeidsgiveren din.',
      },
      spacing: { paddingTop: 24, paddingBottom: 32, paddingX: 32, gap: 24 },
      background: { color: TIDUM_TOKENS.colorBgSection },
      layout: { type: 'flex', direction: 'column', justify: 'start', align: 'start', wrap: false, gap: 24 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-faq-accordion',
    name: 'FAQ Spørsmål og svar',
    category: 'tidum-guide',
    thumbnail: 'faq',
    config: {
      type: 'custom',
      title: 'Ofte stilte spørsmål',
      content: {
        faqs: [
          { question: 'Hvordan gjenoppretter jeg en slettet oppføring?', answer: 'Kontakt administrator. Slettede oppføringer flyttes til gjenopprettingsbingen og kan gjenopprettes innen 30 dager.' },
          { question: 'Kan jeg registrere tid for flere prosjekter samtidig?', answer: 'Ja, du kan ha flere aktive tidsregistreringer parallelt og veksle mellom dem.' },
          { question: 'Hva skjer hvis jeg glemmer å stemple ut?', answer: 'Systemet sender en påminnelse. Administrator kan også justere registreringen i etterkant.' },
          { question: 'Er dataene mine sikre?', answer: 'Ja. All data krypteres i transit og i ro, og vi følger GDPR og Schrems II.' },
          { question: 'Kan jeg bruke Tidum på mobilen?', answer: 'Absolutt. Tidum er responsivt og fungerer utmerket på mobil, nettbrett og PC.' },
        ],
      },
      spacing: { paddingTop: 24, paddingBottom: 32, paddingX: 32, gap: 16 },
      background: { color: '#ffffff' },
      layout: { type: 'flex', direction: 'column', justify: 'start', align: 'stretch', wrap: false, gap: 16 },
    },
  },
  {
    id: 'tidum-best-practices',
    name: 'Best Practices rutenett',
    category: 'tidum-guide',
    thumbnail: 'tip',
    config: {
      type: 'features',
      title: 'Best practices',
      content: {
        practices: [
          { icon: 'Target', title: 'Vær konsistent', description: 'Registrer tid daglig. Konsistens skaper ærlige data og bedre innsikter.' },
          { icon: 'FileText', title: 'Detaljer betyr noe', description: 'Legg til meningsfulle beskrivelser. Framtidig deg vil takke deg.' },
          { icon: 'Calendar', title: 'Tidsblokker', description: 'Del dagen inn i fokuserte blokker. Det avslører mønstre bedre.' },
          { icon: 'Search', title: 'Gjennomgang', description: 'Generer ukerapporter. Spot trender tidlig og juster strategi.' },
          { icon: 'Users', title: 'Samarbeid', description: 'Del kunnskap gjennom saksmeldinger. Hele teamet vinner.' },
          { icon: 'BarChart3', title: 'Data først', description: 'Bruk analyser til å begrunne avgjørelser. Data taler sterkere.' },
        ],
      },
      spacing: { paddingTop: 24, paddingBottom: 32, paddingX: 32, gap: 16 },
      background: { color: TIDUM_TOKENS.colorBgSection },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 2, gap: 16 },
    },
  },
  {
    id: 'tidum-info-callout',
    name: 'Info-boks (farget kant)',
    category: 'tidum-guide',
    thumbnail: 'info',
    config: {
      type: 'custom',
      title: 'Informasjon',
      content: {
        variant: 'info',
        icon: 'Info',
        text: 'Denne funksjonen er tilgjengelig for alle brukere med standard tilgang.',
        variants: {
          success: { borderColor: '#4E9A6F', bgColor: '#E8F5EE', iconColor: '#2A7B62' },
          info: { borderColor: '#1F6B73', bgColor: '#E7F3EE', iconColor: '#1F6B73' },
          warning: { borderColor: '#D4A843', bgColor: '#FDF6E3', iconColor: '#B8942E' },
        },
      },
      spacing: { paddingTop: 16, paddingBottom: 16, paddingX: 16, gap: 12 },
      background: { color: '#E7F3EE' },
      layout: { type: 'flex', direction: 'row', justify: 'start', align: 'start', wrap: false, gap: 12 },
    },
  },

  // ═══════════════════════════════════════════
  // TIDUM PRISER, TEAM & MEDIA
  // ═══════════════════════════════════════════
  {
    id: 'tidum-pricing-table',
    name: 'Pristabell',
    category: 'tidum-commerce',
    thumbnail: 'pricing',
    config: {
      type: 'features',
      title: 'Våre priser',
      content: {
        subtitle: 'Velg planen som passer din virksomhet.',
        plans: [
          { name: 'Starter', price: '0', period: '/mnd', features: ['Opptil 5 brukere', 'Grunnleggende tidsregistrering', 'E-poststøtte'], highlighted: false, ctaText: 'Kom i gang' },
          { name: 'Profesjonell', price: '149', period: '/mnd per bruker', features: ['Ubegrensede brukere', 'Avanserte rapporter', 'API-tilgang', 'Prioritert støtte'], highlighted: true, ctaText: 'Velg plan' },
          { name: 'Enterprise', price: 'Kontakt oss', period: '', features: ['Alt i Profesjonell', 'Tilpassede integrasjoner', 'Dedikert kontaktperson', 'SLA-garanti'], highlighted: false, ctaText: 'Ta kontakt' },
        ],
      },
      spacing: { paddingTop: 32, paddingBottom: 40, paddingX: 32, gap: 16 },
      background: { color: '#ffffff' },
      layout: { type: 'grid', direction: 'row', justify: 'center', align: 'stretch', wrap: false, gridCols: 3, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-team-grid',
    name: 'Teamoversikt',
    category: 'tidum-commerce',
    thumbnail: 'users',
    config: {
      type: 'features',
      title: 'Møt teamet',
      content: {
        subtitle: 'Menneskene bak Tidum.',
        members: [
          { name: 'Ola Nordmann', role: 'Daglig leder', image: '', bio: 'Brenner for norsk arbeidsliv.' },
          { name: 'Kari Hansen', role: 'Produktsjef', image: '', bio: 'Ekspert på brukeropplevelse.' },
          { name: 'Erik Johansen', role: 'Utvikler', image: '', bio: 'Full-stack og sky-spesialist.' },
        ],
      },
      spacing: { paddingTop: 32, paddingBottom: 40, paddingX: 32, gap: 16 },
      background: { color: TIDUM_TOKENS.colorBgSection },
      layout: { type: 'grid', direction: 'row', justify: 'center', align: 'start', wrap: false, gridCols: 3, gap: 24 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-logo-strip',
    name: 'Logostripe (kunder)',
    category: 'tidum-commerce',
    thumbnail: 'building',
    config: {
      type: 'custom',
      title: 'Brukt av ledende virksomheter',
      content: {
        subtitle: 'Stolt samarbeidspartner for norske bedrifter.',
        logos: [
          { name: 'Firma A', src: '/logo-placeholder.png' },
          { name: 'Firma B', src: '/logo-placeholder.png' },
          { name: 'Firma C', src: '/logo-placeholder.png' },
          { name: 'Firma D', src: '/logo-placeholder.png' },
          { name: 'Firma E', src: '/logo-placeholder.png' },
        ],
      },
      spacing: { paddingTop: 24, paddingBottom: 24, paddingX: 32, gap: 16 },
      background: { color: '#ffffff' },
      layout: { type: 'flex', direction: 'row', justify: 'center', align: 'center', wrap: true, gap: 32 },
    },
  },
  {
    id: 'tidum-newsletter',
    name: 'Nyhetsbrev-registrering',
    category: 'tidum-commerce',
    thumbnail: 'newsletter',
    config: {
      type: 'cta',
      title: 'Hold deg oppdatert',
      content: {
        subtitle: 'Få nyheter, tips og oppdateringer rett i innboksen.',
        placeholder: 'din@epost.no',
        buttonText: 'Abonner',
        privacyNote: 'Vi deler aldri e-posten din. Les vår personvernerklæring.',
      },
      spacing: { paddingTop: 32, paddingBottom: 32, paddingX: 32, gap: 16 },
      background: { color: TIDUM_TOKENS.colorBgSection },
      layout: { type: 'flex', direction: 'column', justify: 'center', align: 'center', wrap: false, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 0, trigger: 'scroll' },
    },
  },
  {
    id: 'tidum-image-gallery',
    name: 'Bildegalleri',
    category: 'tidum-media',
    thumbnail: 'image',
    config: {
      type: 'custom',
      title: 'Galleri',
      content: {
        subtitle: 'Se Tidum i aksjon.',
        cols: 3,
        images: [
          { src: '/gallery-1.jpg', alt: 'Dashbord', caption: 'Oversiktlig dashbord' },
          { src: '/gallery-2.jpg', alt: 'Mobilapp', caption: 'Registrer fra mobilen' },
          { src: '/gallery-3.jpg', alt: 'Rapporter', caption: 'Automatiske rapporter' },
        ],
      },
      spacing: { paddingTop: 32, paddingBottom: 40, paddingX: 32, gap: 16 },
      background: { color: '#ffffff' },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 3, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },
  {
    id: 'tidum-video-embed',
    name: 'Video-innbygging',
    category: 'tidum-media',
    thumbnail: 'video',
    config: {
      type: 'custom',
      title: 'Se hvordan Tidum fungerer',
      content: {
        subtitle: 'En kort introduksjon til plattformen.',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        aspectRatio: '16:9',
      },
      spacing: { paddingTop: 32, paddingBottom: 40, paddingX: 32, gap: 16 },
      background: { color: TIDUM_TOKENS.colorBgSection },
      layout: { type: 'flex', direction: 'column', justify: 'center', align: 'center', wrap: false, gap: 16 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 0, trigger: 'scroll' },
    },
  },
  {
    id: 'tidum-timeline',
    name: 'Tidslinje',
    category: 'tidum-media',
    thumbnail: 'calendar',
    config: {
      type: 'custom',
      title: 'Vår reise',
      content: {
        subtitle: 'Milepæler i Tidums historie.',
        events: [
          { date: '2023 Q1', title: 'Idéen ble født', description: 'Startet utviklingen av Tidum basert på reelle behov i norsk arbeidsliv.' },
          { date: '2023 Q3', title: 'Første beta', description: 'Lanserte betaversjon med tiltaksbedrifter som testbrukere.' },
          { date: '2024 Q1', title: 'Offisiell lansering', description: 'Åpnet for alle norske virksomheter med full funksjonalitet.' },
          { date: '2024 Q4', title: 'Vekst', description: '500+ bedrifter bruker Tidum daglig.' },
        ],
      },
      spacing: { paddingTop: 32, paddingBottom: 40, paddingX: 32, gap: 24 },
      background: { color: '#ffffff' },
      layout: { type: 'flex', direction: 'column', justify: 'start', align: 'stretch', wrap: false, gap: 24 },
      animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    },
  },

  // ═══════════════════════════════════════════
  // GENERELLE (Generic, non-Tidum)
  // ═══════════════════════════════════════════
  {
    id: 'hero-modern',
    name: 'Modern Hero',
    category: 'generic',
    thumbnail: 'target',
    config: {
      type: 'hero',
      title: 'Modern Hero Section',
      spacing: { paddingTop: 80, paddingBottom: 80, paddingX: 24, gap: 32 },
      background: { color: '#ffffff' },
      layout: { type: 'flex', direction: 'column', justify: 'center', align: 'center', wrap: false, gap: 32 },
      animations: { enabled: false, type: 'fade', duration: 500, delay: 0, trigger: 'load' },
    },
  },
  {
    id: 'features-grid',
    name: 'Features Grid',
    category: 'generic',
    thumbnail: 'chart',
    config: {
      type: 'features',
      title: 'Our Features',
      spacing: { paddingTop: 64, paddingBottom: 64, paddingX: 24, gap: 48 },
      background: { color: '#f8fafc' },
      layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 3, gap: 24 },
      animations: { enabled: true, type: 'slide', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 20 },
    },
  },
  {
    id: 'testimonials-cards',
    name: 'Testimonial Cards',
    category: 'generic',
    thumbnail: 'chat',
    config: {
      type: 'testimonials',
      title: 'What Our Customers Say',
      spacing: { paddingTop: 64, paddingBottom: 64, paddingX: 24, gap: 32 },
      background: { color: '#ffffff' },
    },
  },
  {
    id: 'cta-centered',
    name: 'Centered CTA',
    category: 'generic',
    thumbnail: 'cta-gift',
    config: {
      type: 'cta',
      title: 'Ready to Get Started?',
      spacing: { paddingTop: 80, paddingBottom: 80, paddingX: 24, gap: 24 },
      background: { color: '#0ea5e9', gradient: 'linear-gradient(135deg, #0ea5e9 0%, #8b5cf6 100%)' },
    },
  },
];

// ── Tidum Full-Page Template ──
// Pre-populates the editor with all standard Tidum sections in order
const TIDUM_PAGE_TEMPLATE: Section[] = [
  {
    id: 'tidum-tpl-hero',
    type: 'hero',
    title: 'Sidetittel',
    content: { subtitle: 'Beskrivelse av innholdet på denne siden.' },
    spacing: { paddingTop: 48, paddingBottom: 48, paddingX: 32, gap: 24 },
    background: { color: TIDUM_TOKENS.colorBgMain, gradient: 'linear-gradient(180deg,rgba(255,255,255,0.97),rgba(250,251,248,0.95))' },
    layout: { type: 'flex', direction: 'column', justify: 'center', align: 'start', wrap: false, gap: 24 },
    animations: { enabled: true, type: 'fade', duration: 600, delay: 0, trigger: 'load' },
    order: 0,
  },
  {
    id: 'tidum-tpl-content',
    type: 'features',
    title: 'Hovedinnhold',
    content: { description: 'Legg til innhold, funksjoner eller informasjon her.' },
    spacing: { paddingTop: 48, paddingBottom: 48, paddingX: 32, gap: 32 },
    background: { color: '#ffffff' },
    layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 3, gap: 24 },
    animations: { enabled: true, type: 'fade', duration: 500, delay: 100, trigger: 'scroll', scrollOffset: 15 },
    order: 1,
  },
  {
    id: 'tidum-tpl-cta',
    type: 'cta',
    title: 'Klar for å gjøre arbeidstid enklere?',
    content: { subtitle: 'Se hvordan Tidum kan passe deres arbeidshverdag.', primaryCta: 'Be om demo', secondaryCta: 'Ta kontakt' },
    spacing: { paddingTop: 48, paddingBottom: 48, paddingX: 32, gap: 24 },
    background: { color: TIDUM_TOKENS.colorPrimary },
    layout: { type: 'flex', direction: 'column', justify: 'center', align: 'center', wrap: false, gap: 16 },
    animations: { enabled: true, type: 'fade', duration: 500, delay: 0, trigger: 'scroll' },
    order: 2,
  },
  {
    id: 'tidum-tpl-footer',
    type: 'container',
    title: 'Footer',
    content: {
      columns: [
        { heading: 'Om Tidum', text: 'Arbeidstidssystem for felt, turnus og norsk dokumentasjonskrav.' },
        { heading: 'Snarveier', links: ['Funksjoner', 'Hvorfor Tidum?', 'Be om demo'] },
        { heading: 'Trygghet', badges: ['Bygget for norsk arbeidsliv', 'Personvern først', 'Klar for dokumentasjonskrav'] },
      ],
      copyright: '© Tidum. Alle rettigheter reservert.',
    },
    spacing: { paddingTop: 32, paddingBottom: 32, paddingX: 32, gap: 32 },
    background: { color: '#ffffff', gradient: 'linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,246,0.92))' },
    layout: { type: 'grid', direction: 'row', justify: 'start', align: 'start', wrap: false, gridCols: 3, gap: 32 },
    animations: { enabled: false, type: 'none', duration: 500, delay: 0, trigger: 'load' },
    order: 3,
  },
];

// Sortable Section Component
function SortableSection({ section, isSelected, onSelect, onUpdate, onDelete, onDuplicate, onCopy }: {
  section: Section;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<Section>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
}) {
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const [isEditing, setIsEditing] = useState<string | null>(null);

  const nodeRef = useRef<HTMLDivElement | null>(null);
  const setNodeRef = useCallback((el: HTMLDivElement | null) => {
    nodeRef.current = el;
    setSortableRef(el);
  }, [setSortableRef]);
  useLayoutEffect(() => {
    if (!nodeRef.current) return;
    nodeRef.current.style.transform = CSS.Transform.toString(transform) || '';
    nodeRef.current.style.transition = transition || '';
  }, [transform, transition]);

  return (
    <div
      ref={setNodeRef}
      className={`relative group border rounded-lg transition-all ${
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
      } ${isDragging ? 'shadow-lg opacity-50' : ''}`}
      onClick={onSelect}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-2 top-2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Section Actions */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onCopy(); }}>
                <ClipboardCopy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Kopier til utklipp</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Dupliser (⌘D)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Slett (⌫)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Section Preview */}
      <style dangerouslySetInnerHTML={{ __html:
        `[data-sp="${section.id}"]{` +
        `padding-top:${section.spacing.paddingTop}px;` +
        `padding-bottom:${section.spacing.paddingBottom}px;` +
        `padding-left:${section.spacing.paddingX}px;` +
        `padding-right:${section.spacing.paddingX}px;` +
        `background:${section.background.gradient || section.background.color};` +
        `background-image:${section.background.image ? `url(${section.background.image})` : 'none'}}`
      }} />
      <div
        data-sp={section.id}
        className="p-8"
      >
        <Badge variant="outline" className="mb-4">{section.type}</Badge>
        
        {/* Inline Editable Title */}
        {isEditing === 'title' ? (
          <Input
            autoFocus
            value={section.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            onBlur={() => setIsEditing(null)}
            onKeyDown={(e) => e.key === 'Enter' && setIsEditing(null)}
            className="text-2xl font-bold mb-2"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <h3
            className="text-2xl font-bold mb-2 cursor-text hover:bg-muted/50 px-2 py-1 rounded"
            onClick={(e) => { e.stopPropagation(); setIsEditing('title'); }}
          >
            {section.title || 'Click to edit title'}
          </h3>
        )}

        <p className="text-sm text-muted-foreground">
          Order: {section.order} | Spacing: {section.spacing.paddingTop}px / {section.spacing.paddingBottom}px
        </p>
      </div>
    </div>
  );
}

// Visual Spacing Control Component
function SpacingControl({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground">{value}px</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={200}
        step={4}
        className="w-full"
      />
      <div className="flex gap-1">
        {[0, 16, 32, 64, 80].map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={value === preset ? 'default' : 'outline'}
            onClick={() => onChange(preset)}
            className="text-xs h-6 px-2"
          >
            {preset}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function PowerVisualEditor() {
  const { toast } = useToast();
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [history, setHistory] = useState<Section[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showComponentLibrary, setShowComponentLibrary] = useState(false);
  const [showCodeExport, setShowCodeExport] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'design' | 'spacing' | 'layout' | 'animations'>('content');
  const [activeTheme, setActiveTheme] = useState<string>('tidum-standard');

  // ── Page management state ──
  const [currentPageId, setCurrentPageId] = useState<number | null>(null);
  const [pageTitle, setPageTitle] = useState('Ny side');
  const [pageSlug, setPageSlug] = useState('ny-side');
  const [pageStatus, setPageStatus] = useState<'draft' | 'published'>('draft');
  const [showPageList, setShowPageList] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Extension panel state ──
  type ExtensionPanel = 'seo' | 'schedule' | 'upload' | 'global-layout' | 'templates' | 'css' | 'versions' | 'import-export' | 'a11y' | 'analytics' | 'performance' | 'i18n' | 'forms' | null;
  const [activeExtension, setActiveExtension] = useState<ExtensionPanel>(null);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [ogImage, setOgImage] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [globalHeader, setGlobalHeader] = useState<any>(null);
  const [globalFooter, setGlobalFooter] = useState<any>(null);
  const [pageCss, setPageCss] = useState('');
  const [locale, setLocale] = useState('nb');
  const { copySection, pasteSection, hasClipboard } = useSectionClipboard();

  // Theme presets
  const THEME_PRESETS: Record<string, { label: string; primary: string; bg: string; bgSection: string; heading: string; border: string }> = {
    'tidum-standard': { label: 'Standard', primary: '#1F6B73', bg: '#FAFAF8', bgSection: '#F1F1ED', heading: '#0E4852', border: '#E1E4E3' },
    'tidum-ocean': { label: 'Hav', primary: '#1A5276', bg: '#F5F9FC', bgSection: '#E8F0F8', heading: '#0B3D5B', border: '#D0DDE8' },
    'tidum-forest': { label: 'Skog', primary: '#2D5016', bg: '#F8FAF5', bgSection: '#EFF3E8', heading: '#1A3A0A', border: '#D5E0C8' },
    'tidum-sunset': { label: 'Solnedgang', primary: '#A0522D', bg: '#FDFAF7', bgSection: '#F5EDE4', heading: '#6B3A1F', border: '#E8D8C8' },
    'tidum-night': { label: 'Natt', primary: '#3B82F6', bg: '#0F172A', bgSection: '#1E293B', heading: '#E2E8F0', border: '#334155' },
    'tidum-lavender': { label: 'Lavendel', primary: '#7C3AED', bg: '#FAF5FF', bgSection: '#F3E8FF', heading: '#4C1D95', border: '#DDD6FE' },
  };

  const applyTheme = (themeKey: string) => {
    setActiveTheme(themeKey);
    const theme = THEME_PRESETS[themeKey];
    if (!theme) return;
    // Update CSS custom properties on the canvas
    const canvas = document.querySelector('.tidum-page') as HTMLElement;
    if (canvas) {
      canvas.style.setProperty('--color-primary', theme.primary);
      canvas.style.setProperty('--color-bg-main', theme.bg);
      canvas.style.setProperty('--color-bg-section', theme.bgSection);
      canvas.style.setProperty('--color-heading', theme.heading);
      canvas.style.setProperty('--color-border', theme.border);
    }
    toast({ title: 'Tema endret', description: `${theme.label} aktivert` });
  };

  // ── Page CRUD queries ──
  const pagesQuery = useQuery({
    queryKey: ['/api/cms/builder-pages'],
    queryFn: () => fetch('/api/cms/builder-pages', {
      headers: { ...(getAdminToken() ? { 'Authorization': `Bearer ${getAdminToken()}` } : {}) },
    }).then(r => r.json()),
    enabled: showPageList,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { id?: number; title: string; slug: string; sections: Section[]; themeKey: string; status: string;
      metaTitle?: string; metaDescription?: string; ogImage?: string; canonicalUrl?: string;
      scheduledAt?: string; globalHeader?: any; globalFooter?: any; customCss?: string; locale?: string;
    }) => {
      const url = data.id ? `/api/cms/builder-pages/${data.id}` : '/api/cms/builder-pages';
      const method = data.id ? 'PUT' : 'POST';
      const token = getAdminToken();
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          title: data.title,
          slug: data.slug,
          sections: data.sections,
          themeKey: data.themeKey,
          status: data.status,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          ogImage: data.ogImage,
          canonicalUrl: data.canonicalUrl,
          scheduledAt: data.scheduledAt,
          globalHeader: data.globalHeader,
          globalFooter: data.globalFooter,
          customCss: data.customCss,
          locale: data.locale,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Feil' }));
        throw new Error(err.error || 'Lagring feilet');
      }
      return res.json();
    },
    onSuccess: (page: any) => {
      setCurrentPageId(page.id);
      setPageSlug(page.slug);
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/cms/builder-pages'] });
      toast({ title: 'Lagret!', description: `"${page.title}" lagret som ${page.status}` });
    },
    onError: (err: Error) => {
      toast({ title: 'Feil', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const delToken = getAdminToken();
      const res = await fetch(`/api/cms/builder-pages/${id}`, {
        method: 'DELETE',
        headers: { ...(delToken ? { 'Authorization': `Bearer ${delToken}` } : {}) },
      });
      if (!res.ok) throw new Error('Sletting feilet');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cms/builder-pages'] });
      setCurrentPageId(null);
      setSections([]);
      setPageTitle('Ny side');
      setPageSlug('ny-side');
      toast({ title: 'Slettet', description: 'Siden ble slettet' });
    },
  });

  const loadPage = async (id: number) => {
    try {
      const loadToken = getAdminToken();
      const res = await fetch(`/api/cms/builder-pages/${id}`, {
        headers: { ...(loadToken ? { 'Authorization': `Bearer ${loadToken}` } : {}) },
      });
      const page = await res.json();
      setCurrentPageId(page.id);
      setPageTitle(page.title);
      setPageSlug(page.slug);
      setPageStatus(page.status);
      setActiveTheme(page.themeKey || 'tidum-standard');
      // Load extension fields
      setMetaTitle(page.metaTitle || '');
      setMetaDescription(page.metaDescription || '');
      setOgImage(page.ogImage || '');
      setCanonicalUrl(page.canonicalUrl || '');
      setScheduledAt(page.scheduledAt ? new Date(page.scheduledAt).toISOString().slice(0, 16) : '');
      setGlobalHeader(page.globalHeader || null);
      setGlobalFooter(page.globalFooter || null);
      setPageCss(page.customCss || '');
      setLocale(page.locale || 'nb');
      const loadedSections = page.sections as Section[];
      setSections(loadedSections);
      setHistory([loadedSections]);
      setHistoryIndex(0);
      setShowPageList(false);
      toast({ title: 'Lastet', description: `"${page.title}" åpnet` });
    } catch {
      toast({ title: 'Feil', description: 'Kunne ikke laste siden', variant: 'destructive' });
    }
  };

  const selectedSection = sections.find(s => s.id === selectedSectionId);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Save: Cmd/Ctrl + S
      if (cmdOrCtrl && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      
      // Undo: Cmd/Ctrl + Z
      if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      
      // Redo: Cmd/Ctrl + Shift + Z
      if (cmdOrCtrl && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }
      
      // Duplicate: Cmd/Ctrl + D
      if (cmdOrCtrl && e.key === 'd' && selectedSection) {
        e.preventDefault();
        duplicateSection(selectedSection.id);
      }
      
      // Delete: Delete or Backspace (when section selected)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSection && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setPendingDeleteId(selectedSection.id);
      }

      // Preview: Cmd/Ctrl + P
      if (cmdOrCtrl && e.key === 'p') {
        e.preventDefault();
        if (pageSlug) {
          window.open(`/p/${pageSlug}`, '_blank');
        }
      }

      // Escape: Deselect
      if (e.key === 'Escape') {
        setSelectedSectionId(null);
        setActiveExtension(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSection, sections, historyIndex]);

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Auto-save every 30s when there are unsaved changes
  useEffect(() => {
    if (hasUnsavedChanges && currentPageId) {
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave();
      }, 30000);
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [hasUnsavedChanges, sections]);

  // History management
  const addToHistory = (newSections: Section[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newSections);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setSections(newSections);
    setHasUnsavedChanges(true);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setSections(history[newIndex]);
      toast({ title: 'Angre', description: 'Endring angret' });
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setSections(history[newIndex]);
      toast({ title: 'Gjenta', description: 'Endring gjentatt' });
    }
  };

  // Drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex(s => s.id === active.id);
      const newIndex = sections.findIndex(s => s.id === over.id);
      const reordered = arrayMove(sections, oldIndex, newIndex).map((s, i) => ({ ...s, order: i }));
      addToHistory(reordered);
      toast({ title: 'Flyttet', description: 'Seksjonen ble flyttet' });
    }
  };

  // Section operations
  const addSection = (template: ComponentTemplate) => {
    const newSection: Section = {
      id: `section-${Date.now()}`,
      ...template.config,
      templateId: template.id,
      order: sections.length,
      layout: template.config.layout || { type: 'flex', direction: 'column', justify: 'start', align: 'start', wrap: false, gap: 16 },
      animations: template.config.animations || { enabled: false, type: 'none', duration: 500, delay: 0, trigger: 'load' },
    } as Section;
    addToHistory([...sections, newSection]);
    setSelectedSectionId(newSection.id);
    setShowComponentLibrary(false);
    toast({ title: 'Lagt til', description: `${template.name} lagt til` });
  };

  const updateSection = (id: string, updates: Partial<Section>) => {
    const updated = sections.map(s => s.id === id ? { ...s, ...updates } : s);
    addToHistory(updated);
  };

  const deleteSection = (id: string) => {
    const filtered = sections.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i }));
    addToHistory(filtered);
    setSelectedSectionId(null);
    toast({ title: 'Slettet', description: 'Seksjon slettet' });
  };

  const duplicateSection = (id: string) => {
    const section = sections.find(s => s.id === id);
    if (section) {
      const duplicate = { ...section, id: `section-${Date.now()}`, order: section.order + 1 };
      const updated = [...sections.slice(0, section.order + 1), duplicate, ...sections.slice(section.order + 1)]
        .map((s, i) => ({ ...s, order: i }));
      addToHistory(updated);
      setSelectedSectionId(duplicate.id);
      toast({ title: 'Duplisert', description: 'Seksjon duplisert' });
    }
  };

  const handleSave = () => {
    saveMutation.mutate({
      id: currentPageId || undefined,
      title: pageTitle,
      slug: pageSlug,
      sections,
      themeKey: activeTheme,
      status: pageStatus,
      metaTitle,
      metaDescription,
      ogImage,
      canonicalUrl,
      scheduledAt: scheduledAt || undefined,
      globalHeader,
      globalFooter,
      customCss: pageCss,
      locale,
    });
  };

  // Load full Tidum page template
  const loadTidumTemplate = () => {
    const templated = TIDUM_PAGE_TEMPLATE.map((s, i) => ({
      ...s,
      id: `section-${Date.now()}-${i}`,
      order: i,
    }));
    addToHistory(templated);
    setSelectedSectionId(templated[0].id);
    toast({
      title: 'Tidum-mal lastet',
      description: `${templated.length} seksjoner satt opp med Tidum-design`,
    });
  };

  const viewportWidth = viewMode === 'mobile' ? '375px' : viewMode === 'tablet' ? '768px' : '100%';

  const canvasDynamicCss = useMemo(() => {
    const lines: string[] = [`#pve-canvas-vp{width:${viewportWidth};max-width:100%}`];
    for (const sec of sections) {
      const id = sec.id;
      const sp = sec.spacing;
      const bg = sec.background;
      const c = (sec.content || {}) as Record<string, any>;
      const sectionStyleParts: string[] = [
        `padding-top:${sp.paddingTop}px`,
        `padding-bottom:${sp.paddingBottom}px`,
        `padding-left:${sp.paddingX}px`,
        `padding-right:${sp.paddingX}px`,
      ];

      if (bg.image) {
        const safeBgImage = String(bg.image).replace(/"/g, '\\"');
        const backgroundLayers: string[] = [];
        if (bg.overlay) backgroundLayers.push(bg.overlay);
        if (bg.gradient) backgroundLayers.push(bg.gradient);
        backgroundLayers.push(`url("${safeBgImage}")`);
        sectionStyleParts.push(`background-image:${backgroundLayers.join(',')}`);
        sectionStyleParts.push(`background-color:${bg.color || 'transparent'}`);
        sectionStyleParts.push('background-size:cover');
        sectionStyleParts.push('background-position:center');
        sectionStyleParts.push('background-repeat:no-repeat');
      } else {
        sectionStyleParts.push(`background:${bg.gradient || bg.color}`);
      }

      if (sec.textColor) {
        sectionStyleParts.push(`color:${sec.textColor}`);
      }

      if (typeof sec.borderRadius === 'number' && sec.borderRadius > 0) {
        sectionStyleParts.push(`border-radius:${sec.borderRadius}px`);
      }

      if (typeof sec.borderWidth === 'number' && sec.borderWidth > 0) {
        sectionStyleParts.push('border-style:solid');
        sectionStyleParts.push(`border-width:${sec.borderWidth}px`);
        sectionStyleParts.push(`border-color:${sec.borderColor || 'var(--color-border)'}`);
      }

      if (sec.boxShadow) {
        sectionStyleParts.push(`box-shadow:${sec.boxShadow}`);
      }

      lines.push(`[data-sec="${id}"]{${sectionStyleParts.join(';')}}`);
      if (Array.isArray(c.cards) && c.cards.length)
        lines.push(`[data-sec="${id}"] .sec-cards-grid{grid-template-columns:repeat(${Math.min(c.cards.length, 3)},1fr)}`);
      if (Array.isArray(c.benefits) && c.benefits.length)
        lines.push(`[data-sec="${id}"] .sec-benefits-grid{grid-template-columns:repeat(${Math.min(c.benefits.length, 3)},1fr)}`);
      if (Array.isArray(c.stats) && c.stats.length)
        lines.push(`[data-sec="${id}"] .sec-stats-grid{grid-template-columns:repeat(${c.stats.length},1fr)}`);
      if (Array.isArray(c.columns) && c.columns.length)
        lines.push(`[data-sec="${id}"] .sec-cols-grid{grid-template-columns:repeat(${c.columns.length},1fr)}`);
      if (Array.isArray(c.plans) && c.plans.length) {
        lines.push(`[data-sec="${id}"] .sec-plans-grid{grid-template-columns:repeat(${Math.min(c.plans.length, 3)},1fr)}`);
        (c.plans as any[]).forEach((plan, i) => {
          lines.push(`[data-sec="${id}"] .plan-${i}{border-color:${plan.highlighted ? 'var(--color-primary)' : 'var(--color-border)'}}`);
        });
      }
      if (Array.isArray(c.members) && c.members.length)
        lines.push(`[data-sec="${id}"] .sec-members-grid{grid-template-columns:repeat(${Math.min(c.members.length, 3)},1fr)}`);
      if (Array.isArray(c.images) && c.images.length)
        lines.push(`[data-sec="${id}"] .sec-images-grid{grid-template-columns:repeat(${c.cols || 3},1fr)}`);
      if (c.videoUrl) {
        const ar = c.aspectRatio === '4:3' ? '4/3' : c.aspectRatio === '1:1' ? '1/1' : '16/9';
        lines.push(`[data-sec="${id}"] .sec-video{aspect-ratio:${ar}}`);
      }
      const onPrimary = bg.color === TIDUM_TOKENS.colorPrimary;
      lines.push(`[data-sec="${id}"] .sec-btn-primary{color:${onPrimary ? TIDUM_TOKENS.colorPrimary : '#fff'}}`);
      lines.push(`[data-sec="${id}"] .sec-btn-secondary{color:${onPrimary ? '#fff' : 'inherit'}}`);
    }
    return lines.join('\n');
  }, [sections, viewportWidth]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Toolbar */}
      <div className="border-b bg-card px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Power Visual Editor
          </h1>
          <Badge variant="secondary" className="text-xs">World-Class</Badge>
          <div className="ml-4 flex items-center gap-1 border-l pl-4">
            <Popover open={showPageList} onOpenChange={setShowPageList}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 max-w-[200px]">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{pageTitle}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">Sider</p>
                  <Button size="sm" variant="ghost" className="w-full justify-start gap-2" onClick={() => {
                    setCurrentPageId(null);
                    setSections([]);
                    setPageTitle('Ny side');
                    setPageSlug('ny-side');
                    setPageStatus('draft');
                    setHistory([[]]);
                    setHistoryIndex(0);
                    setShowPageList(false);
                  }}>
                    <Plus className="h-3 w-3" />
                    Ny side
                  </Button>
                  {pagesQuery.data && Array.isArray(pagesQuery.data) && pagesQuery.data.map((page: any) => (
                    <div key={page.id} className="flex items-center gap-1">
                      <button
                        className={`flex-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left ${currentPageId === page.id ? 'bg-accent font-medium' : ''}`}
                        onClick={() => loadPage(page.id)}
                      >
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate flex-1">{page.title}</span>
                        <Badge variant={page.status === 'published' ? 'default' : 'secondary'} className="text-[10px] h-4 shrink-0">
                          {page.status === 'published' ? 'Live' : 'Kladd'}
                        </Badge>
                      </button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(page.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {pagesQuery.isLoading && <p className="text-xs text-muted-foreground px-2 py-3 text-center">Laster...</p>}
                </div>
              </PopoverContent>
            </Popover>
            <Input
              value={pageTitle}
              onChange={e => { setPageTitle(e.target.value); setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')); }}
              className="h-8 w-40 text-sm"
              placeholder="Sidetittel"
            />
          </div>
        </div>

        {/* Viewport Controls */}
        <div className="flex items-center gap-1 border rounded-lg p-1">
          <Button
            size="sm"
            variant={viewMode === 'desktop' ? 'default' : 'ghost'}
            onClick={() => setViewMode('desktop')}
            className="h-7"
          >
            <Monitor className="h-4 w-4 mr-1" />
            Desktop
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'tablet' ? 'default' : 'ghost'}
            onClick={() => setViewMode('tablet')}
            className="h-7"
          >
            <Tablet className="h-4 w-4 mr-1" />
            Tablet
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'mobile' ? 'default' : 'ghost'}
            onClick={() => setViewMode('mobile')}
            className="h-7"
          >
            <Smartphone className="h-4 w-4 mr-1" />
            Mobile
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Theme Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Palette className="h-4 w-4" />
                Tema
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">Fargetema</p>
                {Object.entries(THEME_PRESETS).map(([key, theme]) => (
                  <button
                    key={key}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors ${activeTheme === key ? 'bg-accent font-medium' : ''}`}
                    onClick={() => applyTheme(key)}
                  >
                    <div className="flex gap-0.5">
                      <style dangerouslySetInnerHTML={{ __html:
                        `.ts-p-${key}{background-color:${theme.primary}}` +
                        `.ts-b-${key}{background-color:${theme.bg}}` +
                        `.ts-bs-${key}{background-color:${theme.bgSection}}`
                      }} />
                      <div className={`h-4 w-4 rounded-full border ts-p-${key}`} />
                      <div className={`h-4 w-4 rounded-full border ts-b-${key}`} />
                      <div className={`h-4 w-4 rounded-full border ts-bs-${key}`} />
                    </div>
                    <span>{theme.label}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={undo} disabled={historyIndex === 0}>
                  <Undo2 className="h-4 w-4 mr-1" />
                  Angre
                </Button>
              </TooltipTrigger>
              <TooltipContent>⌘Z</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={redo} disabled={historyIndex === history.length - 1}>
                  <Redo2 className="h-4 w-4 mr-1" />
                  Gjenta
                </Button>
              </TooltipTrigger>
              <TooltipContent>⌘⇧Z</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button 
            size="sm" 
            variant={showCodeExport ? 'default' : 'outline'}
            onClick={() => { setShowCodeExport(!showCodeExport); setActiveExtension(null); }}
          >
            <Code2 className="h-4 w-4 mr-1" />
            Export
          </Button>

          {/* Live Preview Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={() => pageSlug && window.open(`/p/${pageSlug}`, '_blank')} disabled={!currentPageId}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Forhåndsvisning
                </Button>
              </TooltipTrigger>
              <TooltipContent>⌘P — Åpne live side i ny fane</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Extension Tools Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant={activeExtension ? 'default' : 'outline'} className="gap-1">
                <PanelRightOpen className="h-4 w-4" />
                Verktøy
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">Utvidelser</p>
                {([
                  { key: 'seo' as ExtensionPanel, icon: Search, label: 'SEO & Metadata' },
                  { key: 'schedule' as ExtensionPanel, icon: Calendar, label: 'Planlegg publisering' },
                  { key: 'upload' as ExtensionPanel, icon: Upload, label: 'Bildeopplasting' },
                  { key: 'global-layout' as ExtensionPanel, icon: LayoutPanelTop, label: 'Global header/footer' },
                  { key: 'templates' as ExtensionPanel, icon: BookmarkPlus, label: 'Seksjonsmaler' },
                  { key: 'css' as ExtensionPanel, icon: Code2, label: 'Egendefinert CSS' },
                  { key: 'versions' as ExtensionPanel, icon: History, label: 'Versjonshistorikk' },
                  { key: 'import-export' as ExtensionPanel, icon: FileDown, label: 'Import / Eksport' },
                  { key: 'a11y' as ExtensionPanel, icon: Accessibility, label: 'Tilgjengelighet' },
                  { key: 'analytics' as ExtensionPanel, icon: BarChart3, label: 'Sideanalyse' },
                  { key: 'performance' as ExtensionPanel, icon: Gauge, label: 'Ytelse' },
                  { key: 'i18n' as ExtensionPanel, icon: Languages, label: 'Språk (i18n)' },
                  { key: 'forms' as ExtensionPanel, icon: Globe, label: 'Skjemainnsendinger' },
                ] as const).map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left ${activeExtension === key ? 'bg-accent font-medium' : ''}`}
                    onClick={() => { setActiveExtension(activeExtension === key ? null : key); setShowCodeExport(false); }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button size="sm" onClick={handleSave} className="ml-2" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Lagre
          </Button>
          <Select value={pageStatus} onValueChange={(v: any) => setPageStatus(v)}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Kladd</SelectItem>
              <SelectItem value="published">Publiser</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Components & Layers */}
        <div className="w-80 border-r bg-card overflow-y-auto">
          <Tabs value={showComponentLibrary ? 'library' : 'layers'} onValueChange={(v) => setShowComponentLibrary(v === 'library')}>
            <TabsList className="w-full">
              <TabsTrigger value="layers" className="flex-1">
                <Layers className="h-4 w-4 mr-2" />
                Lag
              </TabsTrigger>
              <TabsTrigger value="library" className="flex-1">
                <Grid3X3 className="h-4 w-4 mr-2" />
                Bibliotek
              </TabsTrigger>
            </TabsList>

            <TabsContent value="layers" className="p-4 space-y-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">Seksjoner ({sections.length})</h3>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={!hasClipboard} onClick={() => {
                    const pasted = pasteSection();
                    if (pasted) {
                      pasted.order = sections.length;
                      addToHistory([...sections, pasted]);
                      setSelectedSectionId(pasted.id);
                    }
                  }}>
                    <ClipboardPaste className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={() => setShowComponentLibrary(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Legg til
                  </Button>
                </div>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {sections.map((section) => (
                      <SortableSection
                        key={section.id}
                        section={section}
                        isSelected={section.id === selectedSectionId}
                        onSelect={() => setSelectedSectionId(section.id)}
                        onUpdate={(updates) => updateSection(section.id, updates)}
                        onDelete={() => setPendingDeleteId(section.id)}
                        onDuplicate={() => duplicateSection(section.id)}
                        onCopy={() => copySection(section)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {sections.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Box className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Ingen seksjoner ennå</p>
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <Button size="sm" onClick={loadTidumTemplate}>
                      <LayoutTemplate className="h-4 w-4 mr-1" />
                      Start med Tidum-mal
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowComponentLibrary(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Legg til seksjon manuelt
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="library" className="p-4 space-y-3">
              {/* Library Search */}
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={librarySearch}
                  onChange={e => setLibrarySearch(e.target.value)}
                  placeholder="Søk blokker..."
                  className="pl-8 h-9 text-sm"
                />
                {librarySearch && (
                  <Button size="icon" variant="ghost" className="absolute right-1 top-1 h-7 w-7" onClick={() => setLibrarySearch('')}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {/* Tidum Page Template shortcut */}
              <Card
                className="cursor-pointer border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
                onClick={loadTidumTemplate}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <LayoutTemplate className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-primary">Ny Tidum-side</h4>
                      <p className="text-xs text-muted-foreground">Komplett side med Hero, Innhold, CTA og Footer</p>
                    </div>
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                </CardContent>
              </Card>

              {/* Render all sub-categories with their blocks */}
              {Object.entries(TIDUM_SUBCATEGORIES).map(([catKey, catLabel]) => {
                const allItems = COMPONENT_LIBRARY.filter(t => t.category === catKey);
                const items = librarySearch
                  ? allItems.filter(t => t.name.toLowerCase().includes(librarySearch.toLowerCase()) || t.id.toLowerCase().includes(librarySearch.toLowerCase()))
                  : allItems;
                if (items.length === 0) return null;
                return (
                  <div key={catKey}>
                    <div className="border-b pb-1 pt-2 mb-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{catLabel}</h3>
                    </div>
                    {items.map((template) => (
                      <Card key={template.id} className="cursor-pointer hover:bg-accent mb-2" onClick={() => addSection(template)}>
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              {(() => {
                                const TemplateIcon = CATEGORY_ICON_MAP[template.category] || Box;
                                return <TemplateIcon className="h-5 w-5" />;
                              })()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm truncate">{template.name}</h4>
                            </div>
                            <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Canvas */}
        <div className="flex-1 overflow-auto bg-muted/30 p-8">
          {/* Inject Tidum live CSS */}
          <style dangerouslySetInnerHTML={{ __html: tidumPageStyles }} />
          <style dangerouslySetInnerHTML={{ __html: canvasDynamicCss }} />
          <div
            id="pve-canvas-vp"
            className="mx-auto transition-all max-w-full"
          >
            <div className="tidum-page bg-background rounded-lg shadow-xl overflow-hidden min-h-screen">
              {sections.length > 0 ? (
                sections.map((section) => (
                  <div
                    key={section.id}
                    data-sec={section.id}
                    className={`relative cursor-pointer transition-all ${section.id === selectedSectionId ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'}`}
                    onClick={() => setSelectedSectionId(section.id)}
                  >
                    <Badge variant="secondary" className="absolute top-2 left-2 text-xs z-10">
                      {section.templateId || section.type}
                    </Badge>
                    <h2 className="text-3xl font-bold">{section.title}</h2>
                    {/* Rich preview for content-aware sections */}
                    {section.content?.subtitle && (
                      <p className="text-sm text-muted-foreground mt-2 max-w-xl">{section.content.subtitle}</p>
                    )}
                    {section.content?.timerMock && (
                      <div className="ttv-shell mt-4 rounded-[20px] border bg-white/85 p-4 shadow-sm [border-color:var(--color-border)]">
                        <p className="ttv-date text-xs text-muted-foreground">{section.content.dateLabel}</p>

                        <div className="mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium [border-color:var(--color-border)] [background-color:var(--color-bg-section)] [color:var(--color-primary)]">
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span>{section.content.status}</span>
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
                          <div className="ttv-main rounded-2xl border bg-white/85 p-3 [border-color:var(--color-border)]">
                            <div className="grid gap-3 sm:grid-cols-[96px_1fr] sm:items-start">
                              <div className="ttv-clock-wrap flex justify-center sm:justify-start">
                                <div className="ttv-clock h-24 w-24 rounded-full border-[6px] [border-color:var(--color-border)] [background-color:var(--color-bg-main)] flex items-center justify-center [color:var(--color-primary)]">
                                  <Clock className="h-9 w-9" />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <p className="ttv-duration text-2xl font-semibold leading-tight">{section.content.duration}</p>

                                <div className="ttv-pause flex items-center justify-between rounded-xl border px-3 py-2 text-xs [border-color:var(--color-border)] [background-color:var(--color-bg-main)]">
                                  <span className="font-medium">{section.content.pauseLabel}</span>
                                  <span className="text-muted-foreground">{section.content.pauseValue}</span>
                                </div>

                                <div className="ttv-actions grid grid-cols-2 gap-2">
                                  <div className="rounded-xl border px-3 py-2 text-center text-xs font-semibold [border-color:var(--color-border)] [background-color:var(--color-bg-section)]">
                                    {section.content.startCta}
                                  </div>
                                  <div className="rounded-xl px-3 py-2 text-center text-xs font-semibold text-white [background-color:var(--color-primary)]">
                                    {section.content.doneCta}
                                  </div>
                                </div>

                                <div className="ttv-meta border-t pt-2 text-xs [border-color:var(--color-border)]">
                                  <div className="flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>Klient: {section.content.client || section.content.participant}</span>
                                  </div>
                                  <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5" />
                                    <span>{section.content.tiltak}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="ttv-side space-y-2">
                            <div className="rounded-2xl border bg-white/85 p-3 [border-color:var(--color-border)]">
                              <p className="text-xs font-semibold text-muted-foreground">{section.content.todayTitle}</p>
                              <p className="mt-1 text-xl font-semibold leading-tight">{section.content.todayValue}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{section.content.todayDetail}</p>
                            </div>
                            <div className="rounded-2xl border bg-white/85 p-3 [border-color:var(--color-border)]">
                              <p className="text-xs font-semibold text-muted-foreground">{section.content.weekTitle}</p>
                              <p className="mt-1 text-xl font-semibold leading-tight">{section.content.weekValue}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{section.content.weekDetail}</p>
                            </div>
                          </div>
                        </div>

                        <div className="ttv-note mt-3 rounded-2xl border bg-white/85 p-3 [border-color:var(--color-border)]">
                          <div className="flex items-start gap-2">
                            <MessageCircle className="mt-0.5 h-4 w-4 [color:var(--color-primary)]" />
                            <div className="w-full space-y-2">
                              <p className="text-sm font-medium">{section.content.noteTitle}</p>
                              <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground [border-color:var(--color-border)] [background-color:var(--color-bg-main)]">
                                {section.content.notePlaceholder}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {section.content?.cards && Array.isArray(section.content.cards) && (
                      <div
                        className="mt-4 grid gap-2 sec-cards-grid"
                      >
                        {section.content.cards.map((card: any, i: number) => (
                          <div key={i} className="rounded-lg border bg-white/80 p-3 text-sm">
                            <span className="font-medium">{card.title || card.label || `Kort ${i + 1}`}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {section.content?.benefits && Array.isArray(section.content.benefits) && (
                      <div
                        className="mt-4 grid gap-2 sec-benefits-grid"
                      >
                        {section.content.benefits.map((b: any, i: number) => (
                          <div key={i} className="rounded-lg border bg-white/80 p-3 text-sm">
                            <span className="font-medium">{b.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {section.content?.steps && Array.isArray(section.content.steps) && (
                      <div className="mt-4 flex gap-2 flex-wrap">
                        {section.content.steps.map((s: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 rounded-lg border bg-white/80 p-2 text-sm">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{s.step || i + 1}</span>
                            <span className="font-medium">{s.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {section.content?.stats && Array.isArray(section.content.stats) && (
                      <div
                        className="mt-4 grid gap-4 sec-stats-grid"
                      >
                        {section.content.stats.map((s: any, i: number) => (
                          <div key={i} className="text-center">
                            <div className="text-2xl font-bold [color:var(--color-primary)]">{s.value}</div>
                            <div className="text-xs text-muted-foreground">{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {section.content?.items && Array.isArray(section.content.items) && !section.content?.stats && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {section.content.items.map((item: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 rounded-lg border bg-white/80 p-2 text-sm">
                            <span className="font-medium">{item.title || item.label || item.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {section.content?.faqs && Array.isArray(section.content.faqs) && (
                      <div className="mt-4 space-y-2">
                        {section.content.faqs.slice(0, 3).map((faq: any, i: number) => (
                          <div key={i} className="rounded-lg border bg-white/80 p-3 text-sm">
                            <span className="font-medium">{faq.question}</span>
                          </div>
                        ))}
                        {section.content.faqs.length > 3 && (
                          <p className="text-xs text-muted-foreground">+{section.content.faqs.length - 3} flere spørsmål</p>
                        )}
                      </div>
                    )}
                    {section.content?.practices && Array.isArray(section.content.practices) && (
                      <div className="mt-4 grid gap-2 grid-cols-2">
                        {section.content.practices.map((p: any, i: number) => (
                          <div key={i} className="rounded-lg border bg-white/80 p-2 text-sm">
                            {(() => {
                              const PracticeIcon = PRACTICE_ICON_MAP[p.icon || p.emoji] || Sparkles;
                              return (
                                <span className="inline-flex items-center gap-2">
                                  <PracticeIcon className="h-4 w-4 text-primary" />
                                  {p.title}
                                </span>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    )}
                    {section.content?.columns && Array.isArray(section.content.columns) && (
                      <div
                        className="mt-4 grid gap-4 sec-cols-grid"
                      >
                        {section.content.columns.map((col: any, i: number) => (
                          <div key={i} className="text-sm">
                            <span className="font-medium block mb-1">{col.heading}</span>
                            <span className="text-xs text-muted-foreground">{col.text || (col.links && col.links.join(', ')) || (col.badges && col.badges.join(', '))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {section.content?.markdown && (
                      <p className="text-sm text-muted-foreground mt-2 max-w-xl italic truncate">{section.content.markdown.slice(0, 120)}…</p>
                    )}
                    {section.content?.primaryButton && (
                      <div className="mt-3 flex gap-2">
                        <div
                          className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium sec-btn-primary"
                        >
                          {section.content.primaryButton.text}
                        </div>
                        {section.content?.secondaryButton && (
                          <div
                            className="rounded-lg border border-white/40 px-4 py-2 text-sm font-medium sec-btn-secondary"
                          >
                            {section.content.secondaryButton.text}
                          </div>
                        )}
                      </div>
                    )}
                    {section.content?.fields && Array.isArray(section.content.fields) && (
                      <div className="mt-4 grid gap-2 grid-cols-2">
                        {section.content.fields.slice(0, 4).map((f: any, i: number) => (
                          <div key={i} className="rounded-xl border bg-white/80 p-2 text-xs text-muted-foreground [border-color:var(--color-border)]">
                            {f.label}
                          </div>
                        ))}
                        {section.content.fields.length > 4 && (
                          <p className="text-xs text-muted-foreground col-span-2">+{section.content.fields.length - 4} flere felt</p>
                        )}
                      </div>
                    )}
                    {/* Pricing plans */}
                    {section.content?.plans && Array.isArray(section.content.plans) && (
                      <div
                        className="mt-4 grid gap-3 sec-plans-grid"
                      >
                        {section.content.plans.map((plan: any, i: number) => (
                          <div key={i} className={`rounded-2xl border p-4 text-sm plan-${i} ${plan.highlighted ? 'ring-2 ring-primary/20 bg-primary/5' : 'bg-white/80'}`}>
                            <div className="font-semibold text-base">{plan.name}</div>
                            <div className="text-2xl font-bold mt-1 [color:var(--color-primary)]">{plan.price}<span className="text-xs font-normal text-muted-foreground">{plan.period}</span></div>
                            <div className="mt-2 space-y-1">
                              {(plan.features || []).slice(0, 3).map((f: string, fi: number) => (
                                <div key={fi} className="text-xs text-muted-foreground flex items-center gap-1">✓ {f}</div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Team members */}
                    {section.content?.members && Array.isArray(section.content.members) && (
                      <div
                        className="mt-4 grid gap-3 sec-members-grid"
                      >
                        {section.content.members.map((m: any, i: number) => (
                          <div key={i} className="rounded-2xl border [border-color:var(--color-border)] bg-white/80 p-4 text-center">
                            <div className="h-14 w-14 rounded-full mx-auto mb-2 flex items-center justify-center text-2xl [background-color:var(--color-bg-section)]">
                              {m.name?.[0] || '?'}
                            </div>
                            <div className="font-semibold text-sm">{m.name}</div>
                            <div className="text-xs text-muted-foreground">{m.role}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Logo strip */}
                    {section.content?.logos && Array.isArray(section.content.logos) && (
                      <div className="mt-4 flex flex-wrap gap-6 justify-center items-center">
                        {section.content.logos.map((logo: any, i: number) => (
                          <div key={i} className="rounded-xl border [border-color:var(--color-border)] bg-white/80 px-6 py-3 text-sm font-medium">
                            {logo.name}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Image gallery */}
                    {section.content?.images && Array.isArray(section.content.images) && (
                      <div
                        className="mt-4 grid gap-2 sec-images-grid"
                      >
                        {section.content.images.map((img: any, i: number) => (
                          <div key={i} className="rounded-xl border [border-color:var(--color-border)] bg-muted/40 aspect-[4/3] flex items-center justify-center text-xs text-muted-foreground">
                            {img.caption || img.alt || 'Bilde'}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Video embed */}
                    {section.content?.videoUrl && (
                      <div
                        className="mt-4 rounded-xl border [border-color:var(--color-border)] overflow-hidden sec-video"
                      >
                        <div className="w-full h-full flex items-center justify-center bg-muted/40 text-muted-foreground">
                          <div className="text-center">
                            <Play className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-xs">Video forhåndsvisning</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Timeline events */}
                    {section.content?.events && Array.isArray(section.content.events) && (
                      <div className="mt-4 space-y-3">
                        {section.content.events.map((ev: any, i: number) => (
                          <div key={i} className="flex gap-4 items-start">
                            <div className="shrink-0 flex flex-col items-center">
                              <div className="h-3 w-3 rounded-full [background-color:var(--color-primary)]" />
                              {i < section.content.events.length - 1 && <div className="w-0.5 h-8 [background-color:var(--color-border)]" />}
                            </div>
                            <div className="pb-2">
                              <div className="text-xs font-semibold [color:var(--color-primary)]">{ev.date}</div>
                              <div className="font-medium text-sm">{ev.title}</div>
                              <div className="text-xs text-muted-foreground">{ev.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Newsletter */}
                    {section.content?.buttonText && section.content?.placeholder && (
                      <div className="mt-4 flex gap-2 max-w-md mx-auto">
                        <div className="flex-1 rounded-xl border [border-color:var(--color-border)] bg-white/80 px-4 py-2 text-xs text-muted-foreground">{section.content.placeholder}</div>
                        <div className="rounded-xl px-5 py-2 text-xs font-medium text-white [background-color:var(--color-primary)]">{section.content.buttonText}</div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-screen text-muted-foreground">
                  <div className="text-center max-w-sm">
                    <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">Start med design</h3>
                    <p className="text-sm mb-6">Velg en mal for å komme i gang raskt, eller legg til seksjoner manuelt.</p>
                    <div className="flex flex-col items-center gap-3">
                      <Button onClick={loadTidumTemplate} className="w-full">
                        <LayoutTemplate className="h-4 w-4 mr-2" />
                        Start med Tidum-mal
                      </Button>
                      <Button variant="outline" onClick={() => setShowComponentLibrary(true)} className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Legg til seksjon manuelt
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Properties */}
        {selectedSection && (
          <div className="w-80 border-l bg-card overflow-y-auto">
            <div className="p-4 border-b">
              <h3 className="font-semibold">Properties</h3>
              <p className="text-xs text-muted-foreground">{selectedSection.type} Section</p>
            </div>

            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="p-4">
              <TabsList className="w-full grid grid-cols-5 text-xs">
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="design">Design</TabsTrigger>
                <TabsTrigger value="spacing">Space</TabsTrigger>
                <TabsTrigger value="layout">Layout</TabsTrigger>
                <TabsTrigger value="animations">Anim</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Tittel</Label>
                  <Input
                    value={selectedSection.title}
                    onChange={(e) => updateSection(selectedSection.id, { title: e.target.value })}
                  />
                </div>
                {/* Block-specific property editor */}
                {(() => {
                  const BlockEditor = (selectedSection.templateId && getBlockEditor(selectedSection.templateId)) || getBlockEditorByContent(selectedSection.content);
                  if (BlockEditor) {
                    return (
                      <div className="border-t pt-4 space-y-3">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Blokkinnhold</Label>
                        <BlockEditor
                          content={selectedSection.content || {}}
                          onUpdate={(content: any) => updateSection(selectedSection.id, { content })}
                        />
                      </div>
                    );
                  }
                  return (
                    <p className="text-xs text-muted-foreground italic mt-2">Generisk seksjon — ingen blokkredigering tilgjengelig.</p>
                  );
                })()}
              </TabsContent>

              <TabsContent value="design" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Bakgrunnsfarge</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={selectedSection.background.color || '#ffffff'}
                      onChange={(e) => updateSection(selectedSection.id, {
                        background: { ...selectedSection.background, color: e.target.value }
                      })}
                      className="h-10 w-20 rounded border"
                      aria-label="Velg bakgrunnsfarge"
                      title="Bakgrunnsfarge"
                    />
                    <Input
                      value={selectedSection.background.color}
                      onChange={(e) => updateSection(selectedSection.id, {
                        background: { ...selectedSection.background, color: e.target.value }
                      })}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Gradient */}
                <div className="space-y-2">
                  <Label>Gradient</Label>
                  <Input
                    value={selectedSection.background.gradient || ''}
                    onChange={(e) => updateSection(selectedSection.id, {
                      background: { ...selectedSection.background, gradient: e.target.value }
                    })}
                    placeholder="linear-gradient(135deg, #1F6B73, #0E4852)"
                    className="font-mono text-xs"
                  />
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { label: 'Ingen', value: '' },
                      { label: 'Tidum', value: 'linear-gradient(180deg, rgba(255,255,255,0.97), rgba(250,251,248,0.95))' },
                      { label: 'Sjø', value: 'linear-gradient(135deg, #1A5276, #1F6B73)' },
                      { label: 'Solnedgang', value: 'linear-gradient(135deg, #A0522D, #D4A843)' },
                      { label: 'Natt', value: 'linear-gradient(135deg, #0F172A, #1E293B)' },
                    ].map((preset) => (
                      <Button
                        key={preset.label}
                        size="sm"
                        variant={selectedSection.background.gradient === preset.value ? 'default' : 'outline'}
                        onClick={() => updateSection(selectedSection.id, {
                          background: { ...selectedSection.background, gradient: preset.value }
                        })}
                        className="text-xs h-6 px-2"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Background Image */}
                <div className="space-y-2">
                  <Label>Bakgrunnsbilde</Label>
                  <Input
                    value={selectedSection.background.image || ''}
                    onChange={(e) => updateSection(selectedSection.id, {
                      background: { ...selectedSection.background, image: e.target.value }
                    })}
                    placeholder="/uploads/cms/bilde.webp"
                    className="text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs flex-1"
                      onClick={() => { setActiveExtension('upload'); }}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Last opp bilde
                    </Button>
                    {selectedSection.background.image && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs text-destructive"
                        onClick={() => updateSection(selectedSection.id, {
                          background: { ...selectedSection.background, image: '' }
                        })}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {selectedSection.background.image && (
                    <div className="rounded-lg border overflow-hidden aspect-video">
                      <img src={selectedSection.background.image} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                {/* Overlay */}
                <div className="space-y-2">
                  <Label>Overlegg (overlagring)</Label>
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { label: 'Ingen', value: '' },
                      { label: 'Lys', value: 'rgba(255,255,255,0.5)' },
                      { label: 'Mørk 30%', value: 'rgba(0,0,0,0.3)' },
                      { label: 'Mørk 60%', value: 'rgba(0,0,0,0.6)' },
                      { label: 'Primær', value: 'rgba(31,107,115,0.7)' },
                    ].map((preset) => (
                      <Button
                        key={preset.label}
                        size="sm"
                        variant={(selectedSection.background.overlay || '') === preset.value ? 'default' : 'outline'}
                        onClick={() => updateSection(selectedSection.id, {
                          background: { ...selectedSection.background, overlay: preset.value }
                        })}
                        className="text-xs h-6 px-2"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Text Color */}
                <div className="space-y-2">
                  <Label>Tekstfarge</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={selectedSection.textColor || '#1a1a1a'}
                      onChange={(e) => updateSection(selectedSection.id, { textColor: e.target.value })}
                      className="h-10 w-20 rounded border"
                      aria-label="Velg tekstfarge"
                      title="Tekstfarge"
                    />
                    <Input
                      value={selectedSection.textColor || ''}
                      onChange={(e) => updateSection(selectedSection.id, { textColor: e.target.value })}
                      placeholder="Standard (fra tema)"
                      className="flex-1 text-xs"
                    />
                    {selectedSection.textColor && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => updateSection(selectedSection.id, { textColor: undefined })}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Border */}
                <div className="space-y-2">
                  <Label>Kantlinje</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Bredde</Label>
                      <Slider
                        value={[selectedSection.borderWidth || 0]}
                        onValueChange={([v]) => updateSection(selectedSection.id, { borderWidth: v })}
                        min={0} max={8} step={1}
                      />
                      <span className="text-xs font-mono text-muted-foreground">{selectedSection.borderWidth || 0}px</span>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Radius</Label>
                      <Slider
                        value={[selectedSection.borderRadius || 0]}
                        onValueChange={([v]) => updateSection(selectedSection.id, { borderRadius: v })}
                        min={0} max={32} step={2}
                      />
                      <span className="text-xs font-mono text-muted-foreground">{selectedSection.borderRadius || 0}px</span>
                    </div>
                  </div>
                  {(selectedSection.borderWidth || 0) > 0 && (
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={selectedSection.borderColor || '#E1E4E3'}
                        onChange={(e) => updateSection(selectedSection.id, { borderColor: e.target.value })}
                        className="h-8 w-14 rounded border"
                        aria-label="Velg kantlinjefarge"
                        title="Kantlinjefarge"
                      />
                      <Input
                        value={selectedSection.borderColor || ''}
                        onChange={(e) => updateSection(selectedSection.id, { borderColor: e.target.value })}
                        placeholder="#E1E4E3"
                        className="flex-1 text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Box Shadow */}
                <div className="space-y-2">
                  <Label>Skygge</Label>
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { label: 'Ingen', value: '' },
                      { label: 'Liten', value: '0 1px 3px rgba(0,0,0,0.1)' },
                      { label: 'Medium', value: '0 4px 12px rgba(0,0,0,0.1)' },
                      { label: 'Stor', value: '0 10px 30px rgba(0,0,0,0.15)' },
                      { label: 'Indre', value: 'inset 0 2px 8px rgba(0,0,0,0.1)' },
                    ].map((preset) => (
                      <Button
                        key={preset.label}
                        size="sm"
                        variant={(selectedSection.boxShadow || '') === preset.value ? 'default' : 'outline'}
                        onClick={() => updateSection(selectedSection.id, { boxShadow: preset.value })}
                        className="text-xs h-6 px-2"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="spacing" className="space-y-6 mt-4">
                <SpacingControl
                  label="Padding Top"
                  value={selectedSection.spacing.paddingTop}
                  onChange={(v) => updateSection(selectedSection.id, {
                    spacing: { ...selectedSection.spacing, paddingTop: v }
                  })}
                />
                <SpacingControl
                  label="Padding Bottom"
                  value={selectedSection.spacing.paddingBottom}
                  onChange={(v) => updateSection(selectedSection.id, {
                    spacing: { ...selectedSection.spacing, paddingBottom: v }
                  })}
                />
                <SpacingControl
                  label="Padding X"
                  value={selectedSection.spacing.paddingX}
                  onChange={(v) => updateSection(selectedSection.id, {
                    spacing: { ...selectedSection.spacing, paddingX: v }
                  })}
                />
                <SpacingControl
                  label="Gap"
                  value={selectedSection.spacing.gap}
                  onChange={(v) => updateSection(selectedSection.id, {
                    spacing: { ...selectedSection.spacing, gap: v }
                  })}
                />
              </TabsContent>

              <TabsContent value="layout" className="mt-4">
                {selectedSection.layout && (
                  <LayoutControls
                    layout={selectedSection.layout}
                    onChange={(layout) => updateSection(selectedSection.id, { layout })}
                  />
                )}
              </TabsContent>

              <TabsContent value="animations" className="mt-4">
                {selectedSection.animations && (
                  <AnimationControls
                    animation={selectedSection.animations}
                    onChange={(animations) => updateSection(selectedSection.id, { animations })}
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Code Export Sidebar */}
        {showCodeExport && (
          <div className="w-96 border-l bg-card overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Code2 className="h-5 w-5 text-primary" />
                Export Code
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setShowCodeExport(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              <CodeExport sections={sections} />
            </div>
          </div>
        )}

        {/* Extension Panel Sidebar */}
        {activeExtension && !showCodeExport && (
          <div className="w-80 border-l bg-card overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">Utvidelse</h3>
              <Button size="sm" variant="ghost" onClick={() => setActiveExtension(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              {activeExtension === 'seo' && (
                <SEOEditor
                  metaTitle={metaTitle}
                  metaDescription={metaDescription}
                  ogImage={ogImage}
                  canonicalUrl={canonicalUrl}
                  pageTitle={pageTitle}
                  pageSlug={pageSlug}
                  onChange={(field, value) => {
                    if (field === 'metaTitle') setMetaTitle(value);
                    if (field === 'metaDescription') setMetaDescription(value);
                    if (field === 'ogImage') setOgImage(value);
                    if (field === 'canonicalUrl') setCanonicalUrl(value);
                  }}
                />
              )}
              {activeExtension === 'schedule' && (
                <ScheduleEditor
                  scheduledAt={scheduledAt}
                  status={pageStatus}
                  onChange={setScheduledAt}
                  onStatusChange={(s: any) => setPageStatus(s)}
                />
              )}
              {activeExtension === 'upload' && (
                <ImageUploader
                  onUpload={(url) => {
                    if (selectedSection) {
                      updateSection(selectedSection.id, {
                        content: { ...selectedSection.content, heroImage: url }
                      });
                    }
                    toast({ title: 'Bilde satt inn', description: url });
                  }}
                />
              )}
              {activeExtension === 'global-layout' && (
                <GlobalLayoutEditor
                  globalHeader={globalHeader}
                  globalFooter={globalFooter}
                  onHeaderChange={setGlobalHeader}
                  onFooterChange={setGlobalFooter}
                />
              )}
              {activeExtension === 'templates' && (
                <SectionTemplatesPanel
                  currentSection={selectedSection}
                  onLoadTemplate={(section) => {
                    section.order = sections.length;
                    addToHistory([...sections, section]);
                    setSelectedSectionId(section.id);
                    toast({ title: 'Mal lagt til' });
                  }}
                />
              )}
              {activeExtension === 'css' && (
                <CustomCSSEditor
                  customCss={(selectedSection as any)?.customCss || ''}
                  sectionId={selectedSection?.id || 'none'}
                  onChange={(css) => {
                    if (selectedSection) {
                      updateSection(selectedSection.id, { customCss: css } as any);
                    }
                  }}
                  pageCss={pageCss}
                  onPageCssChange={setPageCss}
                />
              )}
              {activeExtension === 'versions' && (
                <VersionHistory
                  pageId={currentPageId}
                  onRestore={(restoredSections, title) => {
                    setSections(restoredSections);
                    setPageTitle(title);
                    setHistory([restoredSections]);
                    setHistoryIndex(0);
                  }}
                />
              )}
              {activeExtension === 'import-export' && (
                <ImportExport
                  sections={sections}
                  pageTitle={pageTitle}
                  pageSlug={pageSlug}
                  themeKey={activeTheme}
                  onImport={({ sections: imported, title, slug, themeKey }) => {
                    addToHistory(imported);
                    if (title) setPageTitle(title);
                    if (slug) setPageSlug(slug);
                    if (themeKey) setActiveTheme(themeKey);
                  }}
                />
              )}
              {activeExtension === 'a11y' && (
                <AccessibilityChecker sections={sections} />
              )}
              {activeExtension === 'analytics' && (
                <AnalyticsPanel pageId={currentPageId} pageSlug={pageSlug} />
              )}
              {activeExtension === 'performance' && (
                <PerformanceEstimator sections={sections} customCss={pageCss} />
              )}
              {activeExtension === 'i18n' && (
                <I18nPanel
                  locale={locale}
                  pageId={currentPageId}
                  pageTitle={pageTitle}
                  onLocaleChange={setLocale}
                  onCreateTranslation={async (targetLocale) => {
                    try {
                      const i18nToken = getAdminToken();
                      const res = await fetch('/api/cms/builder-pages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(i18nToken ? { 'Authorization': `Bearer ${i18nToken}` } : {}) },
                        body: JSON.stringify({
                          title: `${pageTitle} (${targetLocale.toUpperCase()})`,
                          slug: `${pageSlug}-${targetLocale}`,
                          sections,
                          themeKey: activeTheme,
                          status: 'draft',
                          locale: targetLocale,
                          translationOf: currentPageId,
                          customCss: pageCss,
                          globalHeader,
                          globalFooter,
                        }),
                      });
                      if (!res.ok) throw new Error('Opprettelse feilet');
                      const newPage = await res.json();
                      toast({ title: 'Oversettelse opprettet', description: `"${newPage.title}" opprettet som kladd` });
                      queryClient.invalidateQueries({ queryKey: ['/api/cms/builder-pages'] });
                    } catch (e: any) {
                      toast({ title: 'Feil', description: e.message, variant: 'destructive' });
                    }
                  }}
                />
              )}
              {activeExtension === 'forms' && (
                <FormSubmissionsViewer pageId={currentPageId} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="border-t bg-card px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Keyboard className="h-3 w-3" />
            Snarveier:
          </span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">⌘S</kbd> Lagre</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">⌘Z</kbd> Angre</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">⌘D</kbd> Dupliser</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">⌘P</kbd> Forhåndsvis</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd> Fjern valg</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">⌫</kbd> Slett</span>
        </div>
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="h-3 w-3" />
              Ulagrede endringer
            </span>
          )}
          <span>{sections.length} seksjoner · {history.length} historikktilstander</span>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett seksjon?</AlertDialogTitle>
            <AlertDialogDescription>
              Denne handlingen kan ikke angres. Seksjonen "{sections.find(s => s.id === pendingDeleteId)?.title || 'Ukjent'}" vil bli permanent slettet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId) {
                  deleteSection(pendingDeleteId);
                  setPendingDeleteId(null);
                }
              }}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
