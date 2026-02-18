import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, ArrowDown, ArrowLeft, ArrowUp, 
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  Columns, Grid3X3, Layers, FlipHorizontal, WrapText
} from "lucide-react";

interface LayoutConfig {
  type: 'flex' | 'grid' | 'stack';
  direction: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justify: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  align: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  wrap: boolean;
  gridCols?: number;
  gridRows?: number;
  gap: number;
}

interface LayoutControlsProps {
  layout: LayoutConfig;
  onChange: (layout: LayoutConfig) => void;
}

export function LayoutControls({ layout, onChange }: LayoutControlsProps) {
  const updateLayout = (updates: Partial<LayoutConfig>) => {
    onChange({ ...layout, ...updates });
  };

  const directionIcons = {
    'row': <ArrowRight className="h-4 w-4" />,
    'column': <ArrowDown className="h-4 w-4" />,
    'row-reverse': <ArrowLeft className="h-4 w-4" />,
    'column-reverse': <ArrowUp className="h-4 w-4" />,
  };

  const justifyIcons = {
    'start': <AlignStartHorizontal className="h-4 w-4" />,
    'center': <AlignCenterHorizontal className="h-4 w-4" />,
    'end': <AlignEndHorizontal className="h-4 w-4" />,
    'between': <FlipHorizontal className="h-4 w-4" />,
    'around': <FlipHorizontal className="h-4 w-4" />,
    'evenly': <FlipHorizontal className="h-4 w-4" />,
  };

  const alignIcons = {
    'start': <AlignStartVertical className="h-4 w-4" />,
    'center': <AlignCenterVertical className="h-4 w-4" />,
    'end': <AlignEndVertical className="h-4 w-4" />,
    'stretch': <Layers className="h-4 w-4" />,
    'baseline': <Layers className="h-4 w-4" />,
  };

  return (
    <div className="space-y-6">
      {/* Layout Type */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Layout Type</Label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            size="sm"
            variant={layout.type === 'flex' ? 'default' : 'outline'}
            onClick={() => updateLayout({ type: 'flex' })}
            className="flex flex-col gap-1 h-auto py-3"
          >
            <Columns className="h-5 w-5" />
            <span className="text-xs">Flexbox</span>
          </Button>
          <Button
            size="sm"
            variant={layout.type === 'grid' ? 'default' : 'outline'}
            onClick={() => updateLayout({ type: 'grid' })}
            className="flex flex-col gap-1 h-auto py-3"
          >
            <Grid3X3 className="h-5 w-5" />
            <span className="text-xs">Grid</span>
          </Button>
          <Button
            size="sm"
            variant={layout.type === 'stack' ? 'default' : 'outline'}
            onClick={() => updateLayout({ type: 'stack' })}
            className="flex flex-col gap-1 h-auto py-3"
          >
            <Layers className="h-5 w-5" />
            <span className="text-xs">Stack</span>
          </Button>
        </div>
      </div>

      {/* Flex/Grid Common Controls */}
      {(layout.type === 'flex' || layout.type === 'grid') && (
        <>
          {/* Direction */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Direction</Label>
            <div className="grid grid-cols-4 gap-2">
              {(['row', 'column', 'row-reverse', 'column-reverse'] as const).map((dir) => (
                <Button
                  key={dir}
                  size="sm"
                  variant={layout.direction === dir ? 'default' : 'outline'}
                  onClick={() => updateLayout({ direction: dir })}
                  className="h-9"
                  title={dir}
                >
                  {directionIcons[dir]}
                </Button>
              ))}
            </div>
          </div>

          {/* Justify Content */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Justify (Main Axis)</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['start', 'center', 'end', 'between', 'around', 'evenly'] as const).map((justify) => (
                <Button
                  key={justify}
                  size="sm"
                  variant={layout.justify === justify ? 'default' : 'outline'}
                  onClick={() => updateLayout({ justify })}
                  className="h-9 text-xs"
                  title={justify}
                >
                  {justifyIcons[justify]}
                  <span className="ml-1 capitalize">{justify}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Align Items */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Align (Cross Axis)</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['start', 'center', 'end', 'stretch', 'baseline'] as const).map((align) => (
                <Button
                  key={align}
                  size="sm"
                  variant={layout.align === align ? 'default' : 'outline'}
                  onClick={() => updateLayout({ align })}
                  className="h-9 text-xs"
                  title={align}
                >
                  {alignIcons[align]}
                  <span className="ml-1 capitalize">{align}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Wrap */}
          {layout.type === 'flex' && (
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <WrapText className="h-4 w-4" />
                Wrap Items
              </Label>
              <Switch
                checked={layout.wrap}
                onCheckedChange={(wrap) => updateLayout({ wrap })}
              />
            </div>
          )}
        </>
      )}

      {/* Grid-Specific Controls */}
      {layout.type === 'grid' && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Columns</Label>
              <Badge variant="secondary">{layout.gridCols || 3}</Badge>
            </div>
            <Slider
              value={[layout.gridCols || 3]}
              onValueChange={([gridCols]) => updateLayout({ gridCols })}
              min={1}
              max={12}
              step={1}
              className="w-full"
            />
            <div className="flex gap-1">
              {[1, 2, 3, 4, 6, 12].map((cols) => (
                <Button
                  key={cols}
                  size="sm"
                  variant={layout.gridCols === cols ? 'default' : 'outline'}
                  onClick={() => updateLayout({ gridCols: cols })}
                  className="text-xs h-6 px-2 flex-1"
                >
                  {cols}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Rows</Label>
              <Badge variant="secondary">{layout.gridRows || 'auto'}</Badge>
            </div>
            <Slider
              value={[layout.gridRows || 1]}
              onValueChange={([gridRows]) => updateLayout({ gridRows })}
              min={1}
              max={12}
              step={1}
              className="w-full"
            />
          </div>
        </>
      )}

      {/* Gap Control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Gap</Label>
          <Badge variant="secondary">{layout.gap}px</Badge>
        </div>
        <Slider
          value={[layout.gap]}
          onValueChange={([gap]) => updateLayout({ gap })}
          min={0}
          max={128}
          step={4}
          className="w-full"
        />
        <div className="flex gap-1">
          {[0, 8, 16, 24, 32, 48].map((gap) => (
            <Button
              key={gap}
              size="sm"
              variant={layout.gap === gap ? 'default' : 'outline'}
              onClick={() => updateLayout({ gap })}
              className="text-xs h-6 px-2 flex-1"
            >
              {gap}
            </Button>
          ))}
        </div>
      </div>

      {/* Live Preview CSS */}
      <div className="p-3 bg-muted rounded-lg border">
        <Label className="text-xs text-muted-foreground mb-2 block">Generated CSS</Label>
        <code className="text-xs font-mono block overflow-x-auto">
          {layout.type === 'grid' ? (
            <>
              display: grid;<br />
              grid-template-columns: repeat({layout.gridCols || 3}, 1fr);<br />
              {layout.gridRows && <>grid-template-rows: repeat({layout.gridRows}, 1fr);<br /></>}
              gap: {layout.gap}px;<br />
              justify-items: {layout.justify};<br />
              align-items: {layout.align};
            </>
          ) : layout.type === 'flex' ? (
            <>
              display: flex;<br />
              flex-direction: {layout.direction};<br />
              justify-content: {layout.justify === 'between' ? 'space-between' : layout.justify === 'around' ? 'space-around' : layout.justify === 'evenly' ? 'space-evenly' : layout.justify};<br />
              align-items: {layout.align};<br />
              {layout.wrap && <>flex-wrap: wrap;<br /></>}
              gap: {layout.gap}px;
            </>
          ) : (
            <>
              display: flex;<br />
              flex-direction: column;<br />
              gap: {layout.gap}px;
            </>
          )}
        </code>
      </div>
    </div>
  );
}
