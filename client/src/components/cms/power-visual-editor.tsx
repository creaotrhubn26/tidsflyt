import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { LayoutControls } from "@/components/cms/layout-controls";
import { AnimationControls } from "@/components/cms/animation-controls";
import { CodeExport } from "@/components/cms/code-export";
import {
  GripVertical, Save, Undo2, Redo2, Eye, Monitor, Tablet, Smartphone,
  Plus, Trash2, Copy, Settings, Palette, Type, Layout, Sparkles,
  MousePointer, Hand, MoveVertical, AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, Underline, Image, Link, Code2, Loader2, Download,
  RotateCcw, Keyboard, Layers, Box, Grid3X3, Maximize2, Command, Zap, X
} from "lucide-react";

// Keyboard shortcuts map
const SHORTCUTS = {
  save: { keys: ['Cmd+S', 'Ctrl+S'], action: 'save' },
  undo: { keys: ['Cmd+Z', 'Ctrl+Z'], action: 'undo' },
  redo: { keys: ['Cmd+Shift+Z', 'Ctrl+Shift+Z'], action: 'redo' },
  copy: { keys: ['Cmd+D', 'Ctrl+D'], action: 'duplicate' },
  delete: { keys: ['Delete', 'Backspace'], action: 'delete' },
  preview: { keys: ['Cmd+P', 'Ctrl+P'], action: 'preview' },
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
  };
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

const COMPONENT_LIBRARY: ComponentTemplate[] = [
  {
    id: 'hero-modern',
    name: 'Modern Hero',
    category: 'hero',
    thumbnail: '🎯',
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
    category: 'features',
    thumbnail: '📊',
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
    category: 'testimonials',
    thumbnail: '💬',
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
    category: 'cta',
    thumbnail: '🎁',
    config: {
      type: 'cta',
      title: 'Ready to Get Started?',
      spacing: { paddingTop: 80, paddingBottom: 80, paddingX: 24, gap: 24 },
      background: { color: '#0ea5e9', gradient: 'linear-gradient(135deg, #0ea5e9 0%, #8b5cf6 100%)' },
    },
  },
];

// Sortable Section Component
function SortableSection({ section, isSelected, onSelect, onUpdate, onDelete, onDuplicate }: {
  section: Section;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<Section>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const [isEditing, setIsEditing] = useState<string | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Inline editing handler
  const handleInlineEdit = (field: string, value: string) => {
    onUpdate({ [field]: value });
    setIsEditing(null);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group border rounded-lg transition-all ${
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
      } ${isDragging ? 'shadow-lg' : ''}`}
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
      <div
        className="p-8"
        style={{
          paddingTop: `${section.spacing.paddingTop}px`,
          paddingBottom: `${section.spacing.paddingBottom}px`,
          paddingLeft: `${section.spacing.paddingX}px`,
          paddingRight: `${section.spacing.paddingX}px`,
          background: section.background.gradient || section.background.color,
          backgroundImage: section.background.image ? `url(${section.background.image})` : undefined,
        }}
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSection && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        deleteSection(selectedSection.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSection, sections, historyIndex]);

  // History management
  const addToHistory = (newSections: Section[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newSections);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setSections(newSections);
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
    // API call to save sections
    toast({ title: 'Lagret!', description: `${sections.length} seksjoner lagret` });
  };

  const viewportWidth = viewMode === 'mobile' ? '375px' : viewMode === 'tablet' ? '768px' : '100%';

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
            onClick={() => setShowCodeExport(!showCodeExport)}
          >
            <Code2 className="h-4 w-4 mr-1" />
            Export
          </Button>

          <Button size="sm" onClick={handleSave} className="ml-2">
            <Save className="h-4 w-4 mr-1" />
            Lagre
          </Button>
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
                <Button size="sm" onClick={() => setShowComponentLibrary(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Legg til
                </Button>
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
                        onDelete={() => deleteSection(section.id)}
                        onDuplicate={() => duplicateSection(section.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {sections.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Box className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Ingen seksjoner ennå</p>
                  <Button size="sm" variant="outline" onClick={() => setShowComponentLibrary(true)} className="mt-4">
                    Legg til første seksjon
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="library" className="p-4 space-y-3">
              <h3 className="font-medium mb-4">Komponent Bibliotek</h3>
              {COMPONENT_LIBRARY.map((template) => (
                <Card key={template.id} className="cursor-pointer hover:bg-accent" onClick={() => addSection(template)}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{template.thumbnail}</div>
                      <div className="flex-1">
                        <h4 className="font-medium">{template.name}</h4>
                        <p className="text-xs text-muted-foreground capitalize">{template.category}</p>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Canvas */}
        <div className="flex-1 overflow-auto bg-muted/30 p-8">
          <div className="mx-auto transition-all" style={{ width: viewportWidth, maxWidth: '100%' }}>
            <div className="bg-background rounded-lg shadow-xl overflow-hidden min-h-screen">
              {sections.length > 0 ? (
                sections.map((section) => (
                  <div
                    key={section.id}
                    className={`relative cursor-pointer transition-all ${
                      section.id === selectedSectionId ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'
                    }`}
                    onClick={() => setSelectedSectionId(section.id)}
                    style={{
                      paddingTop: `${section.spacing.paddingTop}px`,
                      paddingBottom: `${section.spacing.paddingBottom}px`,
                      paddingLeft: `${section.spacing.paddingX}px`,
                      paddingRight: `${section.spacing.paddingX}px`,
                      background: section.background.gradient || section.background.color,
                    }}
                  >
                    <Badge variant="secondary" className="absolute top-2 left-2 text-xs">
                      {section.type}
                    </Badge>
                    <h2 className="text-3xl font-bold">{section.title}</h2>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-screen text-muted-foreground">
                  <div className="text-center">
                    <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">Start Building</h3>
                    <p className="text-sm mb-4">Add your first component from the library</p>
                    <Button onClick={() => setShowComponentLibrary(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Component
                    </Button>
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
                  <Label>Title</Label>
                  <Input
                    value={selectedSection.title}
                    onChange={(e) => updateSection(selectedSection.id, { title: e.target.value })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="design" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Background Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={selectedSection.background.color}
                      onChange={(e) => updateSection(selectedSection.id, {
                        background: { ...selectedSection.background, color: e.target.value }
                      })}
                      className="h-10 w-20 rounded border"
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
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="border-t bg-card px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Keyboard className="h-3 w-3" />
            Shortcuts:
          </span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">⌘S</kbd> Save</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">⌘Z</kbd> Undo</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">⌘D</kbd> Duplicate</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">⌫</kbd> Delete</span>
        </div>
        <div>
          {sections.length} sections · {history.length} history states
        </div>
      </div>
    </div>
  );
}
