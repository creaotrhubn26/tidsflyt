/**
 * Block-specific property editors for the Power Visual Editor.
 * Each block type gets its own rich editing panel instead of generic title+bg.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Link2,
} from "lucide-react";

// ── Helpers ──

function ArrayItemEditor({
  items,
  onUpdate,
  renderItem,
  addLabel = "Legg til",
  createItem,
}: {
  items: any[];
  onUpdate: (items: any[]) => void;
  renderItem: (item: any, index: number, update: (val: any) => void) => React.ReactNode;
  addLabel?: string;
  createItem: () => any;
}) {
  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...items];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onUpdate(next);
  };
  const moveDown = (i: number) => {
    if (i >= items.length - 1) return;
    const next = [...items];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onUpdate(next);
  };
  const remove = (i: number) => onUpdate(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, val: any) => {
    const next = [...items];
    next[i] = typeof val === 'object' ? { ...next[i], ...val } : val;
    onUpdate(next);
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="relative group border rounded-lg p-3 bg-muted/30">
          <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveUp(i)} disabled={i === 0}>
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveDown(i)} disabled={i >= items.length - 1}>
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => remove(i)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {renderItem(item, i, (val: any) => updateItem(i, val))}
        </div>
      ))}
      <Button size="sm" variant="outline" className="w-full" onClick={() => onUpdate([...items, createItem()])}>
        <Plus className="h-3 w-3 mr-1" />
        {addLabel}
      </Button>
    </div>
  );
}

// ── Content update helper type ──
type ContentUpdater = (content: any) => void;

// ── HERO editors ──

function HeroSplitEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Undertittel</Label>
        <Textarea value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Primærknapp tekst</Label>
          <Input value={content?.ctaPrimary?.text || ''} onChange={e => onUpdate({ ...content, ctaPrimary: { ...content?.ctaPrimary, text: e.target.value } })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Primærknapp URL</Label>
          <Input value={content?.ctaPrimary?.url || ''} onChange={e => onUpdate({ ...content, ctaPrimary: { ...content?.ctaPrimary, url: e.target.value } })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Sekundærknapp tekst</Label>
          <Input value={content?.ctaSecondary?.text || ''} onChange={e => onUpdate({ ...content, ctaSecondary: { ...content?.ctaSecondary, text: e.target.value } })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sekundærknapp URL</Label>
          <Input value={content?.ctaSecondary?.url || ''} onChange={e => onUpdate({ ...content, ctaSecondary: { ...content?.ctaSecondary, url: e.target.value } })} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Hero-bilde URL</Label>
        <Input value={content?.heroImage || ''} onChange={e => onUpdate({ ...content, heroImage: e.target.value })} placeholder="/mockup.png" />
      </div>
    </div>
  );
}

function HeroCenteredEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs">Uthevet ord i tittel</Label>
        <Input value={content?.titleHighlight || ''} onChange={e => onUpdate({ ...content, titleHighlight: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Undertittel</Label>
        <Textarea value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">CTA 1 tekst</Label>
          <Input value={content?.ctaPrimary?.text || ''} onChange={e => onUpdate({ ...content, ctaPrimary: { ...content?.ctaPrimary, text: e.target.value } })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">CTA 2 tekst</Label>
          <Input value={content?.ctaSecondary?.text || ''} onChange={e => onUpdate({ ...content, ctaSecondary: { ...content?.ctaSecondary, text: e.target.value } })} />
        </div>
      </div>
    </div>
  );
}

function HeroIconEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Ikon</Label>
          <Select value={content?.icon || 'Shield'} onValueChange={v => onUpdate({ ...content, icon: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['Shield', 'Lock', 'FileText', 'Scale', 'BookOpen', 'Info'].map(i => (
                <SelectItem key={i} value={i}>{i}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ikon bakgrunn</Label>
          <Input type="color" value={content?.iconBg || '#E7F3EE'} onChange={e => onUpdate({ ...content, iconBg: e.target.value })} className="h-9" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Undertittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Dato-etikett</Label>
          <Input value={content?.dateLabel || ''} onChange={e => onUpdate({ ...content, dateLabel: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Dato</Label>
          <Input value={content?.date || ''} onChange={e => onUpdate({ ...content, date: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

// ── FEATURE / GRID editors ──

function FeatureCardsEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  const cards = content?.cards || [];
  return (
    <div className="space-y-3">
      <Label className="font-medium">Kort ({cards.length})</Label>
      <ArrayItemEditor
        items={cards}
        onUpdate={c => onUpdate({ ...content, cards: c })}
        addLabel="Legg til kort"
        createItem={() => ({ icon: 'Star', iconBg: '#E7F3EE', iconColor: '#3A8B73', title: 'Nytt kort', points: ['Punkt 1'] })}
        renderItem={(card, _i, update) => (
          <div className="space-y-2 pr-16">
            <Input value={card.title} onChange={e => update({ title: e.target.value })} placeholder="Tittel" className="font-medium" />
            <div className="grid grid-cols-3 gap-1">
              <Select value={card.icon || 'Star'} onValueChange={v => update({ icon: v })}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Clock3', 'FileCheck2', 'BarChart3', 'Shield', 'Users', 'Zap', 'Star', 'Heart', 'Building'].map(i => (
                    <SelectItem key={i} value={i}>{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="color" value={card.iconBg || '#E7F3EE'} onChange={e => update({ iconBg: e.target.value })} className="h-9" />
              <Input type="color" value={card.iconColor || '#3A8B73'} onChange={e => update({ iconColor: e.target.value })} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Punkter (én per linje)</Label>
              <Textarea
                value={(card.points || []).join('\n')}
                onChange={e => update({ points: e.target.value.split('\n').filter(Boolean) })}
                rows={3}
                className="text-xs"
              />
            </div>
          </div>
        )}
      />
    </div>
  );
}

function BenefitsGridEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  const benefits = content?.benefits || [];
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Seksjonstittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} placeholder="Undertittel" />
      </div>
      <Label className="font-medium">Fordeler ({benefits.length})</Label>
      <ArrayItemEditor
        items={benefits}
        onUpdate={b => onUpdate({ ...content, benefits: b })}
        addLabel="Legg til fordel"
        createItem={() => ({ icon: 'Star', title: 'Ny fordel', description: 'Beskriv fordelen her.' })}
        renderItem={(b, _i, update) => (
          <div className="space-y-2 pr-16">
            <div className="flex gap-2">
              <Select value={b.icon || 'Star'} onValueChange={v => update({ icon: v })}>
                <SelectTrigger className="w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Clock', 'Shield', 'Users', 'BarChart3', 'Zap', 'Building', 'Star', 'Heart', 'Globe'].map(i => (
                    <SelectItem key={i} value={i}>{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={b.title} onChange={e => update({ title: e.target.value })} placeholder="Tittel" className="flex-1" />
            </div>
            <Textarea value={b.description} onChange={e => update({ description: e.target.value })} rows={2} className="text-xs" />
          </div>
        )}
      />
    </div>
  );
}

function StepsEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  const steps = content?.steps || [];
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Badge-tekst</Label>
        <Input value={content?.badge || ''} onChange={e => onUpdate({ ...content, badge: e.target.value })} />
      </div>
      <Label className="font-medium">Steg ({steps.length})</Label>
      <ArrayItemEditor
        items={steps}
        onUpdate={s => onUpdate({ ...content, steps: s })}
        addLabel="Legg til steg"
        createItem={() => ({ step: steps.length + 1, icon: 'Star', title: 'Nytt steg', description: 'Beskriv steget.' })}
        renderItem={(s, _i, update) => (
          <div className="space-y-2 pr-16">
            <div className="flex gap-2 items-center">
              <Badge variant="secondary" className="shrink-0">{s.step}</Badge>
              <Input value={s.title} onChange={e => update({ title: e.target.value })} placeholder="Tittel" className="flex-1" />
            </div>
            <Textarea value={s.description} onChange={e => update({ description: e.target.value })} rows={2} className="text-xs" />
          </div>
        )}
      />
    </div>
  );
}

// ── CONTENT editors ──

function StoryEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  const left = content?.leftCard || {};
  const right = content?.rightCard || {};
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="font-medium text-destructive/80">Venstre kort (Problem)</Label>
      </div>
      <div className="space-y-2 border-l-2 border-destructive/30 pl-3">
        <Input value={left.badge || ''} onChange={e => onUpdate({ ...content, leftCard: { ...left, badge: e.target.value } })} placeholder="Badge" className="text-xs" />
        <Input value={left.title || ''} onChange={e => onUpdate({ ...content, leftCard: { ...left, title: e.target.value } })} placeholder="Tittel" />
        <Textarea value={left.description || ''} onChange={e => onUpdate({ ...content, leftCard: { ...left, description: e.target.value } })} rows={2} className="text-xs" />
        <Label className="text-xs">Problemer</Label>
        <ArrayItemEditor
          items={left.issues || []}
          onUpdate={issues => onUpdate({ ...content, leftCard: { ...left, issues } })}
          addLabel="Legg til problem"
          createItem={() => ({ icon: 'AlertTriangle', title: 'Problem', detail: 'Detalj' })}
          renderItem={(issue, _i, update) => (
            <div className="space-y-1 pr-16">
              <Input value={issue.title} onChange={e => update({ title: e.target.value })} className="text-xs" />
              <Input value={issue.detail} onChange={e => update({ detail: e.target.value })} className="text-xs" />
            </div>
          )}
        />
      </div>

      <div className="space-y-1">
        <Label className="font-medium text-primary">Høyre kort (Løsning)</Label>
      </div>
      <div className="space-y-2 border-l-2 border-primary/30 pl-3">
        <Input value={right.title || ''} onChange={e => onUpdate({ ...content, rightCard: { ...right, title: e.target.value } })} placeholder="Tittel" />
        <Input value={right.subtitle || ''} onChange={e => onUpdate({ ...content, rightCard: { ...right, subtitle: e.target.value } })} placeholder="Undertittel" className="text-xs" />
        <Label className="text-xs">Tidslinje</Label>
        <ArrayItemEditor
          items={right.timeline || []}
          onUpdate={timeline => onUpdate({ ...content, rightCard: { ...right, timeline } })}
          addLabel="Legg til tidspunkt"
          createItem={() => ({ time: '00:00', text: 'Hendelse' })}
          renderItem={(t, _i, update) => (
            <div className="flex gap-2 pr-16">
              <Input value={t.time} onChange={e => update({ time: e.target.value })} className="w-20 text-xs" />
              <Input value={t.text} onChange={e => update({ text: e.target.value })} className="flex-1 text-xs" />
            </div>
          )}
        />
        <Input value={right.callout || ''} onChange={e => onUpdate({ ...content, rightCard: { ...right, callout: e.target.value } })} placeholder="Callout-tekst" className="text-xs" />
      </div>
    </div>
  );
}

function TwoColSplitEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="font-medium">Venstre kolonne</Label>
        <Input value={content?.leftTitle || ''} onChange={e => onUpdate({ ...content, leftTitle: e.target.value })} placeholder="Tittel" />
        <Input value={content?.leftSubtitle || ''} onChange={e => onUpdate({ ...content, leftSubtitle: e.target.value })} placeholder="Undertittel" className="text-xs" />
        <Label className="text-xs">Elementer</Label>
        <ArrayItemEditor
          items={content?.leftItems || []}
          onUpdate={leftItems => onUpdate({ ...content, leftItems })}
          addLabel="Legg til element"
          createItem={() => ({ icon: 'Check', title: 'Nytt element', description: 'Beskrivelse' })}
          renderItem={(item, _i, update) => (
            <div className="space-y-1 pr-16">
              <Input value={item.title} onChange={e => update({ title: e.target.value })} className="text-xs font-medium" />
              <Input value={item.description} onChange={e => update({ description: e.target.value })} className="text-xs" />
            </div>
          )}
        />
      </div>
      <div className="space-y-2">
        <Label className="font-medium">Høyre kolonne</Label>
        <Input value={content?.rightTitle || ''} onChange={e => onUpdate({ ...content, rightTitle: e.target.value })} placeholder="Tittel" />
        <Input value={content?.rightSubtitle || ''} onChange={e => onUpdate({ ...content, rightSubtitle: e.target.value })} placeholder="Undertittel" className="text-xs" />
        <Label className="text-xs">Elementer</Label>
        <ArrayItemEditor
          items={content?.rightItems || []}
          onUpdate={rightItems => onUpdate({ ...content, rightItems })}
          addLabel="Legg til element"
          createItem={() => ({ icon: 'Check', title: 'Nytt element', description: 'Beskrivelse' })}
          renderItem={(item, _i, update) => (
            <div className="space-y-1 pr-16">
              <Input value={item.title} onChange={e => update({ title: e.target.value })} className="text-xs font-medium" />
              <Input value={item.description} onChange={e => update({ description: e.target.value })} className="text-xs" />
            </div>
          )}
        />
      </div>
    </div>
  );
}

function AudienceListEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <Label className="font-medium">Målgrupper ({(content?.items || []).length})</Label>
      <ArrayItemEditor
        items={content?.items || []}
        onUpdate={items => onUpdate({ ...content, items })}
        addLabel="Legg til målgruppe"
        createItem={() => ({ icon: 'Users', label: 'Ny målgruppe' })}
        renderItem={(item, _i, update) => (
          <div className="flex gap-2 pr-16">
            <Select value={item.icon || 'Users'} onValueChange={v => update({ icon: v })}>
              <SelectTrigger className="w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Heart', 'Briefcase', 'Building2', 'Landmark', 'Users', 'Globe', 'Wrench'].map(i => (
                  <SelectItem key={i} value={i}>{i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={item.label} onChange={e => update({ label: e.target.value })} className="flex-1 text-sm" />
          </div>
        )}
      />
    </div>
  );
}

function ProseEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const ta = document.querySelector<HTMLTextAreaElement>('.prose-editor-textarea');
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.substring(start, end);
    const replacement = `${prefix}${selected || 'tekst'}${suffix}`;
    const newVal = text.substring(0, start) + replacement + text.substring(end);
    onUpdate({ ...content, markdown: newVal });
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + (selected || 'tekst').length);
    });
  };

  return (
    <div className="space-y-2">
      <Label>Markdown-innhold</Label>
      <div className="flex gap-1 flex-wrap">
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs font-bold" onClick={() => insertMarkdown('**', '**')} title="Fet">B</Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs italic" onClick={() => insertMarkdown('*', '*')} title="Kursiv">I</Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => insertMarkdown('## ')} title="Overskrift">H2</Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => insertMarkdown('### ')} title="Underoverskrift">H3</Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => insertMarkdown('- ')} title="Punkt">• Liste</Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => insertMarkdown('[', '](url)')} title="Lenke">
          <Link2 className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => insertMarkdown('\n---\n')} title="Skillelinje">—</Button>
      </div>
      <Textarea
        value={content?.markdown || ''}
        onChange={e => onUpdate({ ...content, markdown: e.target.value })}
        rows={12}
        className="font-mono text-xs prose-editor-textarea"
        placeholder="## Overskrift&#10;&#10;Skriv innholdet ditt her..."
      />
      <p className="text-xs text-muted-foreground">Støtter **bold**, *kursiv*, ## overskrifter, - lister, [lenke](url)</p>
    </div>
  );
}

function NordicSplitEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="font-medium">Venstre: Sjekkliste</Label>
        <Input value={content?.leftTitle || ''} onChange={e => onUpdate({ ...content, leftTitle: e.target.value })} placeholder="Tittel" />
        <Input value={content?.leftSubtitle || ''} onChange={e => onUpdate({ ...content, leftSubtitle: e.target.value })} placeholder="Undertittel" className="text-xs" />
        <Label className="text-xs">Punkter (én per linje)</Label>
        <Textarea
          value={(content?.bulletPoints || []).join('\n')}
          onChange={e => onUpdate({ ...content, bulletPoints: e.target.value.split('\n').filter(Boolean) })}
          rows={5}
          className="text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label className="font-medium">Høyre: Funksjoner</Label>
        <Input value={content?.rightTitle || ''} onChange={e => onUpdate({ ...content, rightTitle: e.target.value })} placeholder="Tittel" />
        <ArrayItemEditor
          items={content?.features || []}
          onUpdate={features => onUpdate({ ...content, features })}
          addLabel="Legg til funksjon"
          createItem={() => ({ icon: 'Star', title: 'Funksjon', description: 'Beskrivelse' })}
          renderItem={(f, _i, update) => (
            <div className="space-y-1 pr-16">
              <Input value={f.title} onChange={e => update({ title: e.target.value })} className="text-xs font-medium" />
              <Input value={f.description} onChange={e => update({ description: e.target.value })} className="text-xs" />
            </div>
          )}
        />
      </div>
    </div>
  );
}

// ── STATS editor ──

function StatsEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <Label className="font-medium">Statistikk ({(content?.stats || []).length})</Label>
      <ArrayItemEditor
        items={content?.stats || []}
        onUpdate={stats => onUpdate({ ...content, stats })}
        addLabel="Legg til tall"
        createItem={() => ({ value: '0', label: 'Ny statistikk' })}
        renderItem={(s, _i, update) => (
          <div className="flex gap-2 pr-16">
            <Input value={s.value} onChange={e => update({ value: e.target.value })} className="w-24 font-bold text-sm" />
            <Input value={s.label} onChange={e => update({ label: e.target.value })} className="flex-1 text-xs" />
          </div>
        )}
      />
    </div>
  );
}

// ── TRUST editors ──

function TrustItemsEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Beskrivelse</Label>
        <Textarea value={content?.description || content?.subtitle || ''} onChange={e => onUpdate({ ...content, description: e.target.value, subtitle: e.target.value })} rows={2} className="text-xs" />
      </div>
      <Label className="font-medium">Elementer ({(content?.items || []).length})</Label>
      <ArrayItemEditor
        items={content?.items || []}
        onUpdate={items => onUpdate({ ...content, items })}
        addLabel="Legg til element"
        createItem={() => ({ title: 'Nytt element', detail: 'Detaljer' })}
        renderItem={(item, _i, update) => (
          <div className="space-y-1 pr-16">
            <Input value={item.title} onChange={e => update({ title: e.target.value })} className="text-xs font-medium" />
            <Input value={item.detail} onChange={e => update({ detail: e.target.value })} className="text-xs" />
          </div>
        )}
      />
    </div>
  );
}

// ── CTA editor ──

function CtaEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Undertittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Primærknapp</Label>
          <Input value={content?.primaryButton?.text || content?.primaryCta || ''} onChange={e => onUpdate({ ...content, primaryButton: { ...content?.primaryButton, text: e.target.value } })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">URL</Label>
          <Input value={content?.primaryButton?.url || ''} onChange={e => onUpdate({ ...content, primaryButton: { ...content?.primaryButton, url: e.target.value } })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Sekundærknapp</Label>
          <Input value={content?.secondaryButton?.text || content?.secondaryCta || ''} onChange={e => onUpdate({ ...content, secondaryButton: { ...content?.secondaryButton, text: e.target.value } })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">URL</Label>
          <Input value={content?.secondaryButton?.url || ''} onChange={e => onUpdate({ ...content, secondaryButton: { ...content?.secondaryButton, url: e.target.value } })} />
        </div>
      </div>
    </div>
  );
}

// ── FOOTER editors ──

function FooterFullEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  const columns = content?.columns || [];
  return (
    <div className="space-y-3">
      {columns.map((col: any, i: number) => (
        <div key={i} className="border rounded-lg p-3 space-y-2">
          <Input value={col.heading || ''} onChange={e => {
            const next = [...columns];
            next[i] = { ...col, heading: e.target.value };
            onUpdate({ ...content, columns: next });
          }} placeholder="Kolonneoverskrift" className="font-medium text-sm" />
          {col.text !== undefined && (
            <Textarea value={col.text} onChange={e => {
              const next = [...columns];
              next[i] = { ...col, text: e.target.value };
              onUpdate({ ...content, columns: next });
            }} rows={2} className="text-xs" />
          )}
          {col.links && (
            <Textarea value={col.links.join('\n')} onChange={e => {
              const next = [...columns];
              next[i] = { ...col, links: e.target.value.split('\n').filter(Boolean) };
              onUpdate({ ...content, columns: next });
            }} rows={3} className="text-xs" placeholder="Én lenke per linje" />
          )}
          {col.badges && (
            <Textarea value={col.badges.join('\n')} onChange={e => {
              const next = [...columns];
              next[i] = { ...col, badges: e.target.value.split('\n').filter(Boolean) };
              onUpdate({ ...content, columns: next });
            }} rows={3} className="text-xs" placeholder="Én badge per linje" />
          )}
        </div>
      ))}
      <div className="space-y-1">
        <Label className="text-xs">Copyright</Label>
        <Input value={content?.copyright || ''} onChange={e => onUpdate({ ...content, copyright: e.target.value })} className="text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Slagord</Label>
        <Input value={content?.slogan || ''} onChange={e => onUpdate({ ...content, slogan: e.target.value })} className="text-xs" />
      </div>
    </div>
  );
}

function FooterMinimalEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <Label className="font-medium">Lenker</Label>
      <ArrayItemEditor
        items={content?.links || []}
        onUpdate={links => onUpdate({ ...content, links })}
        addLabel="Legg til lenke"
        createItem={() => ({ text: 'Ny lenke', href: '/' })}
        renderItem={(link, _i, update) => (
          <div className="flex gap-2 pr-16">
            <Input value={link.text} onChange={e => update({ text: e.target.value })} placeholder="Tekst" className="flex-1 text-xs" />
            <Input value={link.href} onChange={e => update({ href: e.target.value })} placeholder="URL" className="flex-1 text-xs" />
          </div>
        )}
      />
      <div className="space-y-1">
        <Label className="text-xs">Copyright</Label>
        <Input value={content?.copyright || ''} onChange={e => onUpdate({ ...content, copyright: e.target.value })} className="text-xs" />
      </div>
    </div>
  );
}

// ── FORM editors ──

function ContactInfoEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <Label className="font-medium">Kontaktinfo ({(content?.items || []).length})</Label>
      <ArrayItemEditor
        items={content?.items || []}
        onUpdate={items => onUpdate({ ...content, items })}
        addLabel="Legg til kontaktinfo"
        createItem={() => ({ icon: 'Mail', label: 'Etikett', value: 'Verdi' })}
        renderItem={(item, _i, update) => (
          <div className="space-y-1 pr-16">
            <div className="flex gap-2">
              <Select value={item.icon || 'Mail'} onValueChange={v => update({ icon: v })}>
                <SelectTrigger className="w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Mail', 'Phone', 'MapPin', 'Globe', 'Clock', 'Building'].map(i => (
                    <SelectItem key={i} value={i}>{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={item.label} onChange={e => update({ label: e.target.value })} className="flex-1 text-xs" />
            </div>
            <Input value={item.value} onChange={e => update({ value: e.target.value })} placeholder="Verdi" className="text-xs" />
            <Input value={item.href || ''} onChange={e => update({ href: e.target.value })} placeholder="Lenke (valgfri)" className="text-xs" />
          </div>
        )}
      />
      <div className="space-y-1">
        <Label className="text-xs">Bunntekst</Label>
        <Input value={content?.footerText || ''} onChange={e => onUpdate({ ...content, footerText: e.target.value })} className="text-xs" />
      </div>
    </div>
  );
}

function ContactFormEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <Label className="font-medium">Skjemafelt ({(content?.fields || []).length})</Label>
      <ArrayItemEditor
        items={content?.fields || []}
        onUpdate={fields => onUpdate({ ...content, fields })}
        addLabel="Legg til felt"
        createItem={() => ({ id: `field-${Date.now()}`, label: 'Nytt felt', type: 'text', placeholder: '', required: false })}
        renderItem={(field, _i, update) => (
          <div className="space-y-1 pr-16">
            <div className="flex gap-2">
              <Input value={field.label} onChange={e => update({ label: e.target.value })} className="flex-1 text-xs" placeholder="Etikett" />
              <Select value={field.type || 'text'} onValueChange={v => update({ type: v })}>
                <SelectTrigger className="w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['text', 'email', 'tel', 'number', 'textarea', 'select'].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input value={field.placeholder || ''} onChange={e => update({ placeholder: e.target.value })} className="text-xs" placeholder="Placeholder" />
            <div className="flex items-center gap-2">
              <Switch checked={field.required || false} onCheckedChange={v => update({ required: v })} />
              <Label className="text-xs">Påkrevd</Label>
            </div>
          </div>
        )}
      />
      <div className="space-y-1">
        <Label className="text-xs">Knappetekst</Label>
        <Input value={content?.submitText || ''} onChange={e => onUpdate({ ...content, submitText: e.target.value })} className="text-xs" />
      </div>
    </div>
  );
}

// ── GUIDE editors ──

function FaqEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <Label className="font-medium">Spørsmål ({(content?.faqs || []).length})</Label>
      <ArrayItemEditor
        items={content?.faqs || []}
        onUpdate={faqs => onUpdate({ ...content, faqs })}
        addLabel="Legg til spørsmål"
        createItem={() => ({ question: 'Nytt spørsmål?', answer: 'Svar her.' })}
        renderItem={(faq, _i, update) => (
          <div className="space-y-1 pr-16">
            <Input value={faq.question} onChange={e => update({ question: e.target.value })} className="text-xs font-medium" placeholder="Spørsmål" />
            <Textarea value={faq.answer} onChange={e => update({ answer: e.target.value })} rows={2} className="text-xs" placeholder="Svar" />
          </div>
        )}
      />
    </div>
  );
}

function BestPracticesEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <Label className="font-medium">Tips ({(content?.practices || []).length})</Label>
      <ArrayItemEditor
        items={content?.practices || []}
        onUpdate={practices => onUpdate({ ...content, practices })}
        addLabel="Legg til tips"
        createItem={() => ({ icon: 'Lightbulb', title: 'Nytt tips', description: 'Beskriv tipset.' })}
        renderItem={(p, _i, update) => (
          <div className="space-y-1 pr-16">
            <div className="flex gap-2">
              <Input
                value={p.icon || p.emoji || ''}
                onChange={e => update({ icon: e.target.value, emoji: '' })}
                className="w-24 text-center"
                placeholder="Ikonnavn"
              />
              <Input value={p.title} onChange={e => update({ title: e.target.value })} className="flex-1 text-xs font-medium" />
            </div>
            <Textarea value={p.description} onChange={e => update({ description: e.target.value })} rows={2} className="text-xs" />
          </div>
        )}
      />
    </div>
  );
}

function GuideFeatureEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Ikon</Label>
          <Select value={content?.icon || 'Clock'} onValueChange={v => onUpdate({ ...content, icon: v })}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['Clock', 'FileText', 'BarChart3', 'Users', 'Shield', 'Activity', 'BookOpen'].map(i => (
                <SelectItem key={i} value={i}>{i}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ikon bg</Label>
          <Input type="color" value={content?.iconBg || '#E7F3EE'} onChange={e => onUpdate({ ...content, iconBg: e.target.value })} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ikon farge</Label>
          <Input type="color" value={content?.iconColor || '#3A8B73'} onChange={e => onUpdate({ ...content, iconColor: e.target.value })} className="h-9" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Undertittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Historieemoji</Label>
        <Input value={content?.storyEmoji || ''} onChange={e => onUpdate({ ...content, storyEmoji: e.target.value })} className="w-16 text-center" />
        <Label className="text-xs">Historietittel</Label>
        <Input value={content?.storyTitle || ''} onChange={e => onUpdate({ ...content, storyTitle: e.target.value })} className="text-sm" />
        <Label className="text-xs">Historiebeskrivelse</Label>
        <Textarea value={content?.storyDescription || ''} onChange={e => onUpdate({ ...content, storyDescription: e.target.value })} rows={3} className="text-xs" />
      </div>
    </div>
  );
}

function InfoCalloutEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Variant</Label>
        <Select value={content?.variant || 'info'} onValueChange={v => onUpdate({ ...content, variant: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="info">Info (teal)</SelectItem>
            <SelectItem value="success">Suksess (grønn)</SelectItem>
            <SelectItem value="warning">Advarsel (gul)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Tekst</Label>
        <Textarea value={content?.text || ''} onChange={e => onUpdate({ ...content, text: e.target.value })} rows={3} />
      </div>
    </div>
  );
}

// ── NAV editor ──

function HeaderBarEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Logo-tekst</Label>
        <Input value={content?.logo || ''} onChange={e => onUpdate({ ...content, logo: e.target.value })} />
      </div>
      <Label className="font-medium">Navigasjonslenker</Label>
      <ArrayItemEditor
        items={content?.navLinks || []}
        onUpdate={navLinks => onUpdate({ ...content, navLinks })}
        addLabel="Legg til lenke"
        createItem={() => ({ text: 'Ny lenke', href: '/' })}
        renderItem={(link, _i, update) => (
          <div className="flex gap-2 pr-16">
            <Input value={link.text} onChange={e => update({ text: e.target.value })} className="flex-1 text-xs" />
            <Input value={link.href} onChange={e => update({ href: e.target.value })} className="flex-1 text-xs" />
          </div>
        )}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">CTA-knapp tekst</Label>
          <Input value={content?.ctaButton?.text || ''} onChange={e => onUpdate({ ...content, ctaButton: { ...content?.ctaButton, text: e.target.value } })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">CTA-knapp URL</Label>
          <Input value={content?.ctaButton?.href || ''} onChange={e => onUpdate({ ...content, ctaButton: { ...content?.ctaButton, href: e.target.value } })} />
        </div>
      </div>
    </div>
  );
}

// ── NEW BLOCK EDITORS (Pricing, Team, etc.) ──

function PricingTableEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Seksjonstittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} placeholder="Undertittel" />
      </div>
      <Label className="font-medium">Priser ({(content?.plans || []).length})</Label>
      <ArrayItemEditor
        items={content?.plans || []}
        onUpdate={plans => onUpdate({ ...content, plans })}
        addLabel="Legg til plan"
        createItem={() => ({ name: 'Ny plan', price: '0', period: '/mnd', features: ['Funksjon 1'], highlighted: false, ctaText: 'Velg' })}
        renderItem={(plan, _i, update) => (
          <div className="space-y-2 pr-16">
            <div className="flex gap-2">
              <Input value={plan.name} onChange={e => update({ name: e.target.value })} className="flex-1" placeholder="Plannavn" />
              <Input value={plan.price} onChange={e => update({ price: e.target.value })} className="w-20" placeholder="Pris" />
              <Input value={plan.period || ''} onChange={e => update({ period: e.target.value })} className="w-16 text-xs" placeholder="/mnd" />
            </div>
            <Textarea value={(plan.features || []).join('\n')} onChange={e => update({ features: e.target.value.split('\n').filter(Boolean) })} rows={3} className="text-xs" placeholder="Funksjoner (én per linje)" />
            <div className="flex items-center gap-2">
              <Switch checked={plan.highlighted || false} onCheckedChange={v => update({ highlighted: v })} />
              <Label className="text-xs">Uthevet</Label>
            </div>
            <Input value={plan.ctaText || ''} onChange={e => update({ ctaText: e.target.value })} className="text-xs" placeholder="Knappetekst" />
          </div>
        )}
      />
    </div>
  );
}

function TeamGridEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Undertittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} />
      </div>
      <Label className="font-medium">Teammedlemmer ({(content?.members || []).length})</Label>
      <ArrayItemEditor
        items={content?.members || []}
        onUpdate={members => onUpdate({ ...content, members })}
        addLabel="Legg til medlem"
        createItem={() => ({ name: 'Navn', role: 'Stilling', image: '', bio: '' })}
        renderItem={(m, _i, update) => (
          <div className="space-y-1 pr-16">
            <div className="flex gap-2">
              <Input value={m.name} onChange={e => update({ name: e.target.value })} className="flex-1" placeholder="Navn" />
              <Input value={m.role} onChange={e => update({ role: e.target.value })} className="flex-1 text-xs" placeholder="Stilling" />
            </div>
            <Input value={m.image || ''} onChange={e => update({ image: e.target.value })} className="text-xs" placeholder="Bilde-URL" />
            <Input value={m.bio || ''} onChange={e => update({ bio: e.target.value })} className="text-xs" placeholder="Kort bio" />
          </div>
        )}
      />
    </div>
  );
}

function ImageGalleryEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Undertittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Kolonner</Label>
        <Select value={String(content?.cols || 3)} onValueChange={v => onUpdate({ ...content, cols: parseInt(v) })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n} kolonner</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Label className="font-medium">Bilder ({(content?.images || []).length})</Label>
      <ArrayItemEditor
        items={content?.images || []}
        onUpdate={images => onUpdate({ ...content, images })}
        addLabel="Legg til bilde"
        createItem={() => ({ src: '/placeholder.jpg', alt: 'Bilde', caption: '' })}
        renderItem={(img, _i, update) => (
          <div className="space-y-1 pr-16">
            <Input value={img.src} onChange={e => update({ src: e.target.value })} className="text-xs" placeholder="Bilde-URL" />
            <Input value={img.alt || ''} onChange={e => update({ alt: e.target.value })} className="text-xs" placeholder="Alternativ tekst" />
            <Input value={img.caption || ''} onChange={e => update({ caption: e.target.value })} className="text-xs" placeholder="Bildetekst (valgfri)" />
          </div>
        )}
      />
    </div>
  );
}

function VideoEmbedEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Video-URL</Label>
        <Input value={content?.videoUrl || ''} onChange={e => onUpdate({ ...content, videoUrl: e.target.value })} placeholder="https://youtube.com/embed/..." />
        <p className="text-xs text-muted-foreground">YouTube, Vimeo eller direkte video-URL</p>
      </div>
      <div className="space-y-2">
        <Label>Undertittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Format</Label>
        <Select value={content?.aspectRatio || '16:9'} onValueChange={v => onUpdate({ ...content, aspectRatio: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="16:9">16:9</SelectItem>
            <SelectItem value="4:3">4:3</SelectItem>
            <SelectItem value="1:1">1:1</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function TimelineEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Undertittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} />
      </div>
      <Label className="font-medium">Tidslinjepunkter ({(content?.events || []).length})</Label>
      <ArrayItemEditor
        items={content?.events || []}
        onUpdate={events => onUpdate({ ...content, events })}
        addLabel="Legg til punkt"
        createItem={() => ({ date: '2024', title: 'Hendelse', description: 'Beskrivelse' })}
        renderItem={(ev, _i, update) => (
          <div className="space-y-1 pr-16">
            <div className="flex gap-2">
              <Input value={ev.date} onChange={e => update({ date: e.target.value })} className="w-24 text-xs font-medium" placeholder="Dato" />
              <Input value={ev.title} onChange={e => update({ title: e.target.value })} className="flex-1 text-xs" placeholder="Tittel" />
            </div>
            <Textarea value={ev.description} onChange={e => update({ description: e.target.value })} rows={2} className="text-xs" />
          </div>
        )}
      />
    </div>
  );
}

function LogoStripEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Undertittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} placeholder="Brukt av ledende bedrifter" />
      </div>
      <Label className="font-medium">Logoer ({(content?.logos || []).length})</Label>
      <ArrayItemEditor
        items={content?.logos || []}
        onUpdate={logos => onUpdate({ ...content, logos })}
        addLabel="Legg til logo"
        createItem={() => ({ name: 'Firma', src: '/logo.png' })}
        renderItem={(logo, _i, update) => (
          <div className="flex gap-2 pr-16">
            <Input value={logo.name} onChange={e => update({ name: e.target.value })} className="flex-1 text-xs" placeholder="Firmanavn" />
            <Input value={logo.src} onChange={e => update({ src: e.target.value })} className="flex-1 text-xs" placeholder="Logo-URL" />
          </div>
        )}
      />
    </div>
  );
}

function NewsletterEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Undertittel</Label>
        <Textarea value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Placeholder</Label>
          <Input value={content?.placeholder || ''} onChange={e => onUpdate({ ...content, placeholder: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Knappetekst</Label>
          <Input value={content?.buttonText || ''} onChange={e => onUpdate({ ...content, buttonText: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Personverntekst</Label>
        <Input value={content?.privacyNote || ''} onChange={e => onUpdate({ ...content, privacyNote: e.target.value })} className="text-xs" />
      </div>
    </div>
  );
}

// ── Generic Block Editors (for generic/non-Tidum blocks) ──

function GenericHeroEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs font-medium">Undertittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} placeholder="Add a subtitle..." />
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-medium">Beskrivelse</Label>
        <Textarea value={content?.description || ''} onChange={e => onUpdate({ ...content, description: e.target.value })} rows={3} placeholder="Add a description..." />
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-medium">Primær CTA</Label>
        <Input value={content?.primaryCta || ''} onChange={e => onUpdate({ ...content, primaryCta: e.target.value })} placeholder="Button text..." />
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-medium">Sekundær CTA</Label>
        <Input value={content?.secondaryCta || ''} onChange={e => onUpdate({ ...content, secondaryCta: e.target.value })} placeholder="Secondary button..." />
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-medium">Bilde-URL</Label>
        <Input value={content?.heroImage || ''} onChange={e => onUpdate({ ...content, heroImage: e.target.value })} placeholder="https://..." />
      </div>
    </div>
  );
}

function GenericFeaturesEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs font-medium">Beskrivelse</Label>
        <Textarea value={content?.description || ''} onChange={e => onUpdate({ ...content, description: e.target.value })} rows={2} placeholder="Section description..." />
      </div>
      <Label className="text-xs font-medium">Funksjoner</Label>
      <ArrayItemEditor
        items={content?.features || content?.items || []}
        onUpdate={(items) => onUpdate({ ...content, features: items })}
        addLabel="Legg til funksjon"
        createItem={() => ({ title: 'New Feature', description: 'Description' })}
        renderItem={(item, _i, update) => (
          <div className="space-y-2">
            <Input value={item.title || ''} onChange={e => update({ title: e.target.value })} placeholder="Title" className="text-sm" />
            <Input value={item.description || ''} onChange={e => update({ description: e.target.value })} placeholder="Description" className="text-xs" />
          </div>
        )}
      />
    </div>
  );
}

function GenericTestimonialsEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <Label className="text-xs font-medium">Anbefalinger</Label>
      <ArrayItemEditor
        items={content?.testimonials || []}
        onUpdate={(items) => onUpdate({ ...content, testimonials: items })}
        addLabel="Legg til anbefaling"
        createItem={() => ({ name: 'Name', role: 'Role', quote: 'Quote text...' })}
        renderItem={(item, _i, update) => (
          <div className="space-y-2">
            <Input value={item.name || ''} onChange={e => update({ name: e.target.value })} placeholder="Name" className="text-sm" />
            <Input value={item.role || ''} onChange={e => update({ role: e.target.value })} placeholder="Role / Company" className="text-xs" />
            <Textarea value={item.quote || ''} onChange={e => update({ quote: e.target.value })} rows={2} placeholder="Quote..." className="text-xs" />
            <Input value={item.avatar || ''} onChange={e => update({ avatar: e.target.value })} placeholder="Avatar URL (optional)" className="text-xs" />
          </div>
        )}
      />
    </div>
  );
}

function GenericCtaEditor({ content, onUpdate }: { content: any; onUpdate: ContentUpdater }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs font-medium">Undertittel</Label>
        <Input value={content?.subtitle || ''} onChange={e => onUpdate({ ...content, subtitle: e.target.value })} placeholder="Supporting text..." />
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-medium">Primærknapp tekst</Label>
        <Input value={content?.primaryCta || content?.primaryButton?.text || ''} onChange={e => onUpdate({ ...content, primaryCta: e.target.value })} placeholder="Get Started" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-medium">Primærknapp URL</Label>
        <Input value={content?.primaryUrl || content?.primaryButton?.url || ''} onChange={e => onUpdate({ ...content, primaryUrl: e.target.value })} placeholder="/signup" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-medium">Sekundærknapp tekst</Label>
        <Input value={content?.secondaryCta || content?.secondaryButton?.text || ''} onChange={e => onUpdate({ ...content, secondaryCta: e.target.value })} placeholder="Learn More" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-medium">Sekundærknapp URL</Label>
        <Input value={content?.secondaryUrl || content?.secondaryButton?.url || ''} onChange={e => onUpdate({ ...content, secondaryUrl: e.target.value })} placeholder="/about" />
      </div>
    </div>
  );
}

// ── Main Router ──

// Map section IDs (from COMPONENT_LIBRARY .id prefix) to their editors
const BLOCK_EDITOR_MAP: Record<string, React.FC<{ content: any; onUpdate: ContentUpdater }>> = {
  // Heroes
  'tidum-hero-split': HeroSplitEditor,
  'tidum-hero-centered': HeroCenteredEditor,
  'tidum-hero-contact': HeroCenteredEditor, // same shape
  'tidum-hero-icon': HeroIconEditor,
  // Features
  'tidum-feature-grid-3': FeatureCardsEditor,
  'tidum-benefits-grid': BenefitsGridEditor,
  'tidum-how-it-works': StepsEditor,
  // Content
  'tidum-story-section': StoryEditor,
  'tidum-two-col-split': TwoColSplitEditor,
  'tidum-audience-list': AudienceListEditor,
  'tidum-prose-content': ProseEditor,
  'tidum-nordic-split': NordicSplitEditor,
  // Stats
  'tidum-stats-bar': StatsEditor,
  // Trust
  'tidum-trust-norsk': TrustItemsEditor,
  'tidum-trust-section': TrustItemsEditor,
  // CTA
  'tidum-cta-banner': CtaEditor,
  // Footer
  'tidum-footer-full': FooterFullEditor,
  'tidum-footer-minimal': FooterMinimalEditor,
  // Form
  'tidum-contact-info': ContactInfoEditor,
  'tidum-contact-form': ContactFormEditor,
  // Guide
  'tidum-guide-feature': GuideFeatureEditor,
  'tidum-faq-accordion': FaqEditor,
  'tidum-best-practices': BestPracticesEditor,
  'tidum-info-callout': InfoCalloutEditor,
  // Nav
  'tidum-header-bar': HeaderBarEditor,
  // New types
  'tidum-pricing-table': PricingTableEditor,
  'tidum-team-grid': TeamGridEditor,
  'tidum-image-gallery': ImageGalleryEditor,
  'tidum-video-embed': VideoEmbedEditor,
  'tidum-timeline': TimelineEditor,
  'tidum-logo-strip': LogoStripEditor,
  'tidum-newsletter': NewsletterEditor,
  // Generic blocks
  'hero-modern': GenericHeroEditor,
  'features-grid': GenericFeaturesEditor,
  'testimonials-cards': GenericTestimonialsEditor,
  'cta-centered': GenericCtaEditor,
};

/**
 * Returns the appropriate block-specific editor given the section's original template ID.
 * Falls back to null for generic/unknown blocks (caller shows fallback).
 */
export function getBlockEditor(sectionId: string): React.FC<{ content: any; onUpdate: ContentUpdater }> | null {
  // The section ID is like "section-1234567890" but was originally derived from a template.
  // We need to match against the template id, so we detect via content shape or a stored templateId.
  // For now we check all known keys:
  for (const [key, Editor] of Object.entries(BLOCK_EDITOR_MAP)) {
    if (sectionId === key) return Editor;
  }
  return null;
}

/**
 * Looks up an editor by matching content shape heuristics.
 */
export function getBlockEditorByContent(content: any): React.FC<{ content: any; onUpdate: ContentUpdater }> | null {
  if (!content) return null;
  if (content.faqs) return FaqEditor;
  if (content.practices) return BestPracticesEditor;
  if (content.stats) return StatsEditor;
  if (content.fields) return ContactFormEditor;
  if (content.plans) return PricingTableEditor;
  if (content.members) return TeamGridEditor;
  if (content.images) return ImageGalleryEditor;
  if (content.testimonials) return GenericTestimonialsEditor;
  if (content.videoUrl !== undefined) return VideoEmbedEditor;
  if (content.events) return TimelineEditor;
  if (content.logos) return LogoStripEditor;
  if (content.buttonText && content.placeholder) return NewsletterEditor;
  if (content.leftCard && content.rightCard) return StoryEditor;
  if (content.leftItems && content.rightItems) return TwoColSplitEditor;
  if (content.bulletPoints && content.features) return NordicSplitEditor;
  if (content.cards) return FeatureCardsEditor;
  if (content.benefits) return BenefitsGridEditor;
  if (content.steps) return StepsEditor;
  if (content.columns) return FooterFullEditor;
  if (content.navLinks) return HeaderBarEditor;
  if (content.footerText && content.items) return ContactInfoEditor;
  if (content.markdown) return ProseEditor;
  if (content.variant && content.text) return InfoCalloutEditor;
  if (content.storyEmoji) return GuideFeatureEditor;
  if (content.icon && content.iconBg) return HeroIconEditor;
  if (content.titleHighlight) return HeroCenteredEditor;
  if (content.heroImage) return HeroSplitEditor;
  if (content.links && content.copyright) return FooterMinimalEditor;
  if (content.primaryButton || content.primaryCta) return CtaEditor;
  if (content.items && Array.isArray(content.items) && content.items[0]?.label) return AudienceListEditor;
  if (content.items) return TrustItemsEditor;
  if (content.subtitle) return CtaEditor;
  return null;
}

export { ArrayItemEditor };
