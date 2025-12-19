import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface CalendarHeatmapProps {
  data: Array<{
    date: string;
    hours: number;
  }>;
  title?: string;
}

const weekDays = ["Man", "Tir", "Ons", "Tor", "Fre", "Lor", "Son"];

export function CalendarHeatmap({ data, title = "Aktivitetskalender" }: CalendarHeatmapProps) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const dataMap = new Map(data.map(d => [d.date, d.hours]));
  
  const getIntensityClass = (hours: number) => {
    if (hours === 0) return "bg-muted";
    if (hours < 2) return "bg-primary/20";
    if (hours < 4) return "bg-primary/40";
    if (hours < 6) return "bg-primary/60";
    if (hours < 8) return "bg-primary/80";
    return "bg-primary";
  };

  const startDayOffset = (getDay(monthStart) + 6) % 7;

  return (
    <Card data-testid="calendar-heatmap">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">
          {title}
          <span className="text-sm font-normal text-muted-foreground ml-2">
            {format(now, "MMMM yyyy", { locale: nb })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((day) => (
            <div key={day} className="text-xs text-muted-foreground text-center py-1">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startDayOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const hours = dataMap.get(dateStr) || 0;
            
            return (
              <Tooltip key={dateStr}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "aspect-square rounded-md cursor-default transition-colors",
                      getIntensityClass(hours),
                      isSameMonth(day, now) ? "" : "opacity-30"
                    )}
                    data-testid={`heatmap-day-${dateStr}`}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{format(day, "d. MMMM", { locale: nb })}</p>
                  <p className="text-muted-foreground">{hours.toFixed(1)} timer</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <span className="text-xs text-muted-foreground">Mindre</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-muted" />
            <div className="w-3 h-3 rounded-sm bg-primary/20" />
            <div className="w-3 h-3 rounded-sm bg-primary/40" />
            <div className="w-3 h-3 rounded-sm bg-primary/60" />
            <div className="w-3 h-3 rounded-sm bg-primary/80" />
            <div className="w-3 h-3 rounded-sm bg-primary" />
          </div>
          <span className="text-xs text-muted-foreground">Mer</span>
        </div>
      </CardContent>
    </Card>
  );
}
