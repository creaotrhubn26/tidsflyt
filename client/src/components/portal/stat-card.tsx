import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface TrendData {
  value: number;
  isPositive: boolean;
  previousValue?: number;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: TrendData;
  colorClass?: string;
}

export function StatCard({ title, value, icon, trend, colorClass = "text-primary" }: StatCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value === 0) return <Minus className="h-3 w-3" />;
    return trend.isPositive ? (
      <TrendingUp className="h-3 w-3" />
    ) : (
      <TrendingDown className="h-3 w-3" />
    );
  };

  const getTrendColor = () => {
    if (!trend || trend.value === 0) return "text-muted-foreground";
    return trend.isPositive ? "text-success" : "text-destructive";
  };

  return (
    <Card
      className="overflow-visible rounded-2xl border-[#d8e4e0] dark:border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf9)] dark:bg-card shadow-[0_12px_30px_rgba(20,58,65,0.07)] dark:shadow-none"
      data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#5f7075] dark:text-muted-foreground truncate">
              {title}
            </p>
            <p className="text-3xl font-semibold mt-2 tracking-tight text-[#153c46] dark:text-foreground">
              {value}
            </p>
            {trend && (
              <div className={cn("flex items-center gap-1 mt-2 text-sm", getTrendColor())}>
                {getTrendIcon()}
                <span className="font-medium">
                  {trend.value > 0 ? "+" : ""}
                  {trend.value.toFixed(1)}%
                </span>
                <span className="text-[#5f7075] dark:text-muted-foreground text-xs">
                  vs forrige periode
                </span>
              </div>
            )}
          </div>
          <div className={cn("p-3 rounded-xl border border-[#d5e5df] dark:border-border bg-[#e7f3ee] dark:bg-muted", colorClass)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
