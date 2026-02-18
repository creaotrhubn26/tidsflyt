import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { ReactNode } from 'react';

interface HelpTooltipProps {
  content: ReactNode;
  children?: ReactNode;
}

export function HelpTooltip({ content, children }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children || (
          <button
            type="button"
            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Hjelp"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}
