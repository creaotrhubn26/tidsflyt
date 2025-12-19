import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useTheme } from "@/components/theme-provider";

interface HoursChartProps {
  data: Array<{
    day: string;
    hours: number;
  }>;
  title?: string;
}

export function HoursChart({ data, title = "Timefordeling" }: HoursChartProps) {
  const { resolvedTheme } = useTheme();
  
  const chartColors = {
    bar: resolvedTheme === "dark" ? "hsl(199 89% 58%)" : "hsl(199 89% 48%)",
    grid: resolvedTheme === "dark" ? "hsl(222 40% 20%)" : "hsl(214 20% 92%)",
    text: resolvedTheme === "dark" ? "hsl(215 16% 65%)" : "hsl(215 16% 47%)",
    tooltip: {
      bg: resolvedTheme === "dark" ? "hsl(222 47% 11%)" : "hsl(0 0% 100%)",
      border: resolvedTheme === "dark" ? "hsl(222 40% 16%)" : "hsl(214 20% 88%)",
    },
  };

  return (
    <Card data-testid="hours-chart">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Ingen timedata tilgjengelig</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke={chartColors.grid}
                vertical={false}
              />
              <XAxis 
                dataKey="day" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: chartColors.text, fontSize: 12 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: chartColors.text, fontSize: 12 }}
                tickFormatter={(value) => `${value}t`}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: chartColors.tooltip.bg,
                  border: `1px solid ${chartColors.tooltip.border}`,
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                }}
                labelStyle={{ fontWeight: 600 }}
                formatter={(value: number) => [`${value.toFixed(1)} timer`, "Timer"]}
              />
              <Bar 
                dataKey="hours" 
                fill={chartColors.bar}
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
