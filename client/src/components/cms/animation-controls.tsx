import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Play, Clock, Zap, MousePointer, 
  Eye, ScrollText, Minus
} from "lucide-react";

interface AnimationConfig {
  enabled: boolean;
  type: 'fade' | 'slide' | 'scale' | 'rotate' | 'none';
  duration: number;
  delay: number;
  trigger: 'load' | 'scroll' | 'hover' | 'click';
  scrollOffset?: number;
}

interface AnimationControlsProps {
  animation: AnimationConfig;
  onChange: (animation: AnimationConfig) => void;
  onPreview?: () => void;
}

export function AnimationControls({ animation, onChange, onPreview }: AnimationControlsProps) {
  const updateAnimation = (updates: Partial<AnimationConfig>) => {
    onChange({ ...animation, ...updates });
  };

  const animationTypes = [
    { value: 'none', label: 'None', icon: <Minus className="h-4 w-4" /> },
    { value: 'fade', label: 'Fade In', icon: <Eye className="h-4 w-4" /> },
    { value: 'slide', label: 'Slide Up', icon: <ScrollText className="h-4 w-4" /> },
    { value: 'scale', label: 'Scale', icon: <MousePointer className="h-4 w-4" /> },
    { value: 'rotate', label: 'Rotate', icon: <Clock className="h-4 w-4" /> },
  ];

  const triggerTypes = [
    { value: 'load', label: 'On Load', icon: <Zap className="h-4 w-4" /> },
    { value: 'scroll', label: 'On Scroll', icon: <ScrollText className="h-4 w-4" /> },
    { value: 'hover', label: 'On Hover', icon: <MousePointer className="h-4 w-4" /> },
    { value: 'click', label: 'On Click', icon: <Eye className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Enable Animation */}
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Enable Animations
        </Label>
        <Switch
          checked={animation.enabled}
          onCheckedChange={(enabled) => updateAnimation({ enabled })}
        />
      </div>

      {animation.enabled && (
        <>
          {/* Animation Type */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Animation Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {animationTypes.map((type) => (
                <Button
                  key={type.value}
                  size="sm"
                  variant={animation.type === type.value ? 'default' : 'outline'}
                  onClick={() => updateAnimation({ type: type.value as any })}
                  className="flex items-center gap-2 h-auto py-3"
                >
                  <span>{type.icon}</span>
                  <span className="text-xs">{type.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Trigger Type */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Trigger</Label>
            <div className="grid grid-cols-2 gap-2">
              {triggerTypes.map((trigger) => (
                <Button
                  key={trigger.value}
                  size="sm"
                  variant={animation.trigger === trigger.value ? 'default' : 'outline'}
                  onClick={() => updateAnimation({ trigger: trigger.value as any })}
                  className="flex items-center gap-2 h-9 text-xs"
                >
                  {trigger.icon}
                  {trigger.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Scroll Offset (if scroll trigger) */}
          {animation.trigger === 'scroll' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Scroll Offset</Label>
                <Badge variant="secondary">{animation.scrollOffset || 0}%</Badge>
              </div>
              <Slider
                value={[animation.scrollOffset || 0]}
                onValueChange={([scrollOffset]) => updateAnimation({ scrollOffset })}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Animate when element is {animation.scrollOffset || 0}% into viewport
              </p>
            </div>
          )}

          {/* Duration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Duration
              </Label>
              <Badge variant="secondary">{animation.duration}ms</Badge>
            </div>
            <Slider
              value={[animation.duration]}
              onValueChange={([duration]) => updateAnimation({ duration })}
              min={100}
              max={2000}
              step={100}
              className="w-full"
            />
            <div className="flex gap-1">
              {[200, 300, 500, 700, 1000].map((duration) => (
                <Button
                  key={duration}
                  size="sm"
                  variant={animation.duration === duration ? 'default' : 'outline'}
                  onClick={() => updateAnimation({ duration })}
                  className="text-xs h-6 px-2 flex-1"
                >
                  {duration}ms
                </Button>
              ))}
            </div>
          </div>

          {/* Delay */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Delay</Label>
              <Badge variant="secondary">{animation.delay}ms</Badge>
            </div>
            <Slider
              value={[animation.delay]}
              onValueChange={([delay]) => updateAnimation({ delay })}
              min={0}
              max={2000}
              step={100}
              className="w-full"
            />
            <div className="flex gap-1">
              {[0, 100, 200, 500, 1000].map((delay) => (
                <Button
                  key={delay}
                  size="sm"
                  variant={animation.delay === delay ? 'default' : 'outline'}
                  onClick={() => updateAnimation({ delay })}
                  className="text-xs h-6 px-2 flex-1"
                >
                  {delay}ms
                </Button>
              ))}
            </div>
          </div>

          {/* Preview Button */}
          {onPreview && (
            <Button 
              onClick={onPreview} 
              className="w-full"
              variant="secondary"
            >
              <Play className="h-4 w-4 mr-2" />
              Preview Animation
            </Button>
          )}

          {/* Generated CSS Preview */}
          <div className="p-3 bg-muted rounded-lg border">
            <Label className="text-xs text-muted-foreground mb-2 block">Generated CSS</Label>
            <code className="text-xs font-mono block overflow-x-auto whitespace-pre">
              {`transition: all ${animation.duration}ms ease-in-out;
transition-delay: ${animation.delay}ms;
${animation.type === 'fade' ? 'opacity: 0;' : ''}
${animation.type === 'slide' ? 'transform: translateY(20px);' : ''}
${animation.type === 'scale' ? 'transform: scale(0.95);' : ''}
${animation.type === 'rotate' ? 'transform: rotate(-5deg);' : ''}

/* On trigger: */
${animation.type === 'fade' ? 'opacity: 1;' : ''}
${animation.type === 'slide' ? 'transform: translateY(0);' : ''}
${animation.type === 'scale' ? 'transform: scale(1);' : ''}
${animation.type === 'rotate' ? 'transform: rotate(0deg);' : ''}`}
            </code>
          </div>

          {/* Animation Easing Curves (Future Enhancement) */}
          <div className="p-3 bg-primary/5 rounded border border-primary/20">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Zap className="h-3 w-3" />
              Pro tip: Animations will use ease-in-out timing by default
            </p>
          </div>
        </>
      )}
    </div>
  );
}
