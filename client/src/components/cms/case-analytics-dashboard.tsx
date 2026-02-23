import React, { useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Activity,
  BarChart3,
  Zap,
  Target,
  DollarSign,
  Mail,
  Upload,
  Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, Line, LineChart, Pie, PieChart, Cell, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip } from "recharts";
import { format, subMonths, eachMonthOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { nb } from "date-fns/locale";
import type { CaseReport } from "@shared/schema";

interface CaseAnalyticsDashboardProps {
  reports: CaseReport[];
  timeRange?: "7d" | "30d" | "90d" | "12m" | "all";
  onTimeRangeChange?: (range: "7d" | "30d" | "90d" | "12m" | "all") => void;
  onFilterByStatus?: (status: string) => void;
}

const statusColors = {
  draft: "#94a3b8",
  pending: "#eab308",
  submitted: "#3b82f6",
  needs_revision: "#f97316",
  approved: "#22c55e",
  rejected: "#ef4444",
};

const statusBgClass: Record<string, string> = {
  draft: "bg-[#94a3b8]",
  pending: "bg-[#eab308]",
  submitted: "bg-[#3b82f6]",
  needs_revision: "bg-[#f97316]",
  approved: "bg-[#22c55e]",
  rejected: "bg-[#ef4444]",
};

const statusLabels = {
  draft: "Utkast",
  pending: "Til behandling",
  submitted: "Sendt inn",
  needs_revision: "Trenger revisjon",
  approved: "Godkjent",
  rejected: "Avslått",
};

export const CaseAnalyticsDashboard = React.memo(function CaseAnalyticsDashboard({ 
  reports, 
  timeRange = "30d",
  onTimeRangeChange,
  onFilterByStatus
}: CaseAnalyticsDashboardProps) {
  const [localTimeRange, setLocalTimeRange] = useState<"7d" | "30d" | "90d" | "12m" | "all">(timeRange);
  
  const handleTimeRangeChange = (range: "7d" | "30d" | "90d" | "12m" | "all") => {
    setLocalTimeRange(range);
    onTimeRangeChange?.(range);
  };

  const activeTimeRange = onTimeRangeChange ? timeRange : localTimeRange;

  // Calculate date range
  const dateRange = useMemo(() => {
    const now = new Date();
    let from = new Date();

    switch (activeTimeRange) {
      case "7d":
        from = subMonths(now, 0);
        from.setDate(now.getDate() - 7);
        break;
      case "30d":
        from = subMonths(now, 1);
        break;
      case "90d":
        from = subMonths(now, 3);
        break;
      case "12m":
        from = subMonths(now, 12);
        break;
      case "all":
        from = new Date(0); // Beginning of time
        break;
    }

    return { from, to: now };
  }, [activeTimeRange]);

  // Filter reports by date range
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (!report.createdAt) return false;
      const reportDate = new Date(report.createdAt);
      return reportDate >= dateRange.from && reportDate <= dateRange.to;
    });
  }, [reports, dateRange]);

  // Status distribution
  const statusDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    filteredReports.forEach((report) => {
      distribution[report.status] = (distribution[report.status] || 0) + 1;
    });
    return Object.entries(distribution).map(([status, count]) => ({
      status,
      label: statusLabels[status as keyof typeof statusLabels] || status,
      count,
      color: statusColors[status as keyof typeof statusColors] || "#64748b",
    }));
  }, [filteredReports]);

  // Trend over time (by month)
  const trendData = useMemo(() => {
    const months = eachMonthOfInterval({ start: dateRange.from, end: dateRange.to });
    
    return months.map((month) => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const monthReports = filteredReports.filter((report) => {
        if (!report.createdAt) return false;
        const reportDate = new Date(report.createdAt);
        return reportDate >= monthStart && reportDate <= monthEnd;
      });

      const statusCounts: Record<string, number> = {};
      monthReports.forEach((report) => {
        statusCounts[report.status] = (statusCounts[report.status] || 0) + 1;
      });

      return {
        month: format(month, "MMM yyyy", { locale: nb }),
        total: monthReports.length,
        draft: statusCounts.draft || 0,
        pending: statusCounts.pending || 0,
        submitted: statusCounts.submitted || 0,
        approved: statusCounts.approved || 0,
        rejected: statusCounts.rejected || 0,
        needs_revision: statusCounts.needs_revision || 0,
      };
    });
  }, [filteredReports, dateRange]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const total = filteredReports.length;
    const approved = filteredReports.filter((r) => r.status === "approved").length;
    const rejected = filteredReports.filter((r) => r.status === "rejected").length;
    const pending = filteredReports.filter((r) => r.status === "pending" || r.status === "submitted").length;
    const needsRevision = filteredReports.filter((r) => r.status === "needs_revision").length;

    // Calculate average time to approval (in days)
    const approvedReports = filteredReports.filter((r) => r.status === "approved" && r.approvedAt && r.createdAt);
    const avgTimeToApproval = approvedReports.length > 0
      ? approvedReports.reduce((sum, report) => {
          const created = new Date(report.createdAt!).getTime();
          const approved = new Date(report.approvedAt!).getTime();
          return sum + (approved - created) / (1000 * 60 * 60 * 24); // Convert to days
        }, 0) / approvedReports.length
      : 0;

    // Calculate approval rate
    const approvalRate = total > 0 ? (approved / total) * 100 : 0;

    // Calculate SLA compliance (assuming 7 days SLA)
    const slaCompliant = approvedReports.filter((report) => {
      if (!report.createdAt || !report.approvedAt) return false;
      const created = new Date(report.createdAt).getTime();
      const approved = new Date(report.approvedAt).getTime();
      const days = (approved - created) / (1000 * 60 * 60 * 24);
      return days <= 7;
    }).length;
    const slaComplianceRate = approvedReports.length > 0 ? (slaCompliant / approvedReports.length) * 100 : 0;

    return {
      total,
      approved,
      rejected,
      pending,
      needsRevision,
      avgTimeToApproval,
      approvalRate,
      slaComplianceRate,
    };
  }, [filteredReports]);

  // Calculate trend (compare with previous period)
  const previousPeriodMetrics = useMemo(() => {
    const periodLength = dateRange.to.getTime() - dateRange.from.getTime();
    const previousFrom = new Date(dateRange.from.getTime() - periodLength);
    const previousTo = dateRange.from;

    const previousReports = reports.filter((report) => {
      if (!report.createdAt) return false;
      const reportDate = new Date(report.createdAt);
      return reportDate >= previousFrom && reportDate < previousTo;
    });

    return {
      total: previousReports.length,
      approved: previousReports.filter((r) => r.status === "approved").length,
    };
  }, [reports, dateRange]);

  const trends = useMemo(() => {
    const totalChange = previousPeriodMetrics.total > 0
      ? ((metrics.total - previousPeriodMetrics.total) / previousPeriodMetrics.total) * 100
      : 0;
    
    const approvalChange = previousPeriodMetrics.approved > 0
      ? ((metrics.approved - previousPeriodMetrics.approved) / previousPeriodMetrics.approved) * 100
      : 0;

    return {
      total: totalChange,
      approved: approvalChange,
    };
  }, [metrics, previousPeriodMetrics]);

  // Automated Insights
  const insights = useMemo(() => {
    const items: Array<{
      id: string;
      type: "warning" | "success" | "info" | "alert";
      icon: any;
      title: string;
      description: string;
    }> = [];

    // SLA deadline warnings
    const approachingSLA = filteredReports.filter((r) => {
      if (r.status !== "pending" && r.status !== "submitted") return false;
      if (!r.createdAt) return false;
      const daysPending = (Date.now() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysPending >= 5 && daysPending < 7;
    });

    if (approachingSLA.length > 0) {
      items.push({
        id: "sla-warning",
        type: "warning",
        icon: Clock,
        title: `${approachingSLA.length} rapporter nær SLA-frist`,
        description: `${approachingSLA.length} rapporter har vært ventende i 5+ dager`
      });
    }

    // Approval time trend
    if (Math.abs(trends.total) > 20) {
      items.push({
        id: "volume-trend",
        type: trends.total > 0 ? "info" : "success",
        icon: trends.total > 0 ? TrendingUp : TrendingDown,
        title: `Rapportvolum ${trends.total > 0 ? "økt" : "redusert"} ${Math.abs(trends.total).toFixed(0)}%`,
        description: `Sammenlignet med forrige periode`
      });
    }

    // High approval rate
    if (metrics.approvalRate > 90 && metrics.total > 5) {
      items.push({
        id: "high-approval",
        type: "success",
        icon: Target,
        title: `Utmerket godkjenningsrate: ${metrics.approvalRate.toFixed(0)}%`,
        description: "Teamet leverer kvalitetsrapporter"
      });
    }

    // Low SLA compliance
    if (metrics.slaComplianceRate < 70 && metrics.total > 5) {
      items.push({
        id: "sla-low",
        type: "alert",
        icon: AlertTriangle,
        title: `SLA overholdelse under målet: ${metrics.slaComplianceRate.toFixed(0)}%`,
        description: "Vurder å øke ressurser eller revidere prosesser"
      });
    }

    // Fast approval time achievement
    if (metrics.avgTimeToApproval < 3 && metrics.approved > 3) {
      items.push({
        id: "fast-approval",
        type: "success",
        icon: Zap,
        title: "Rask godkjenning!",
        description: `Gjennomsnitt på ${metrics.avgTimeToApproval.toFixed(1)} dager`
      });
    }

    return items.slice(0, 3); // Show top 3 insights
  }, [filteredReports, trends, metrics]);

  // Workflow Checklist Items
  const workflowItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      count: number;
      icon: any;
      reports: CaseReport[];
      variant: "default" | "destructive" | "warning" | "success";
    }> = [];

    // Invoices to send (approved reports without invoice sent)
    const needsInvoice = filteredReports.filter(r => 
      r.status === "approved" && 
      (!r.notes || !r.notes.toLowerCase().includes("faktura sendt"))
    );
    if (needsInvoice.length > 0) {
      items.push({
        id: "invoice",
        title: "Send faktura",
        count: needsInvoice.length,
        icon: DollarSign,
        reports: needsInvoice,
        variant: "warning"
      });
    }

    // Client follow-up needed
    const needsFollowUp = filteredReports.filter(r => 
      r.status === "needs_revision" || 
      (r.status === "submitted" && new Date(r.createdAt!).getTime() < Date.now() - 3 * 24 * 60 * 60 * 1000)
    );
    if (needsFollowUp.length > 0) {
      items.push({
        id: "followup",
        title: "Følg opp klient",
        count: needsFollowUp.length,
        icon: Phone,
        reports: needsFollowUp,
        variant: "default"
      });
    }

    // Documents to upload
    const needsDocs = filteredReports.filter(r => 
      r.status === "needs_revision" &&
      (!r.challenges || r.challenges.length < 50)
    );
    if (needsDocs.length > 0) {
      items.push({
        id: "docs",
        title: "Last opp dokumenter",
        count: needsDocs.length,
        icon: Upload,
        reports: needsDocs,
        variant: "default"
      });
    }

    // Email confirmations needed
    const needsEmail = filteredReports.filter(r => 
      r.status === "approved" &&
      new Date(r.approvedAt!).getTime() > Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
    );
    if (needsEmail.length > 0) {
      items.push({
        id: "email",
        title: "Send bekreftelse e-post",
        count: needsEmail.length,
        icon: Mail,
        reports: needsEmail,
        variant: "success"
      });
    }

    return items;
  }, [filteredReports]);

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Analytics Dashboard</h3>
          <p className="text-sm text-muted-foreground">
            Oversikt og innsikt i rapportdata
          </p>
        </div>
        <div className="flex gap-2">
          {[
            { value: "7d", label: "7 dager" },
            { value: "30d", label: "30 dager" },
            { value: "90d", label: "90 dager" },
            { value: "12m", label: "12 måneder" },
            { value: "all", label: "Alle" }
          ].map((option) => (
            <Button
              key={option.value}
              variant={activeTimeRange === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => handleTimeRangeChange(option.value as any)}
              className="transition-all"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Automated Insights Panel */}
      {insights.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {insights.map((insight) => {
            const Icon = insight.icon;
            const bgColors = {
              warning: "bg-orange-50/60 dark:bg-orange-950/30 border-orange-200/40 dark:border-orange-800/40",
              success: "bg-green-50/60 dark:bg-green-950/30 border-green-200/40 dark:border-green-800/40",
              info: "bg-blue-50/60 dark:bg-blue-950/30 border-blue-200/40 dark:border-blue-800/40",
              alert: "bg-red-50/60 dark:bg-red-950/30 border-red-200/40 dark:border-red-800/40"
            };
            const iconColors = {
              warning: "text-orange-600 dark:text-orange-400 bg-orange-100/80 dark:bg-orange-900/40",
              success: "text-green-600 dark:text-green-400 bg-green-100/80 dark:bg-green-900/40",
              info: "text-blue-600 dark:text-blue-400 bg-blue-100/80 dark:bg-blue-900/40",
              alert: "text-red-600 dark:text-red-400 bg-red-100/80 dark:bg-red-900/40"
            };

            return (
              <Card 
                key={insight.id} 
                className={`${bgColors[insight.type]} hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${iconColors[insight.type]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold mb-1">{insight.title}</h4>
                      <p className="text-xs text-muted-foreground">{insight.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Workflow Checklist */}
      {workflowItems.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-100/60 dark:bg-purple-900/30">
                <CheckCircle2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              Arbeidsflyt Sjekkliste
            </CardTitle>
            <CardDescription>Oppgaver som krever handling</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {workflowItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="group relative border rounded-lg p-4 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 cursor-pointer bg-card"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-2 rounded-lg bg-muted">
                        <Icon className="h-4 w-4 text-foreground" />
                      </div>
                      <Badge variant={item.variant === "warning" ? "destructive" : "default"}>
                        {item.count}
                      </Badge>
                    </div>
                    <h4 className="text-sm font-semibold mb-1">{item.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      {item.count} {item.count === 1 ? "rapport" : "rapporter"}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totalt</CardTitle>
            <div className="p-2 rounded-lg bg-blue-100/60 dark:bg-blue-900/30">
              <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              {trends.total > 0 ? (
                <>
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-green-600">+{trends.total.toFixed(1)}%</span>
                </>
              ) : trends.total < 0 ? (
                <>
                  <TrendingDown className="h-3 w-3 text-red-600" />
                  <span className="text-red-600">{trends.total.toFixed(1)}%</span>
                </>
              ) : (
                <span>Ingen endring</span>
              )}
              <span className="ml-1">fra forrige periode</span>
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Godkjent</CardTitle>
            <div className="p-2 rounded-lg bg-green-100/60 dark:bg-green-900/30">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.approved}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.approvalRate.toFixed(1)}% godkjenningsrate
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gj.snittlig tid</CardTitle>
            <div className="p-2 rounded-lg bg-purple-100/60 dark:bg-purple-900/30">
              <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.avgTimeToApproval.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">dager til godkjenning</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SLA overholdelse</CardTitle>
            <div className="p-2 rounded-lg bg-amber-100/60 dark:bg-amber-900/30">
              <Activity className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.slaComplianceRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">innen 7 dager</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Status Distribution Pie Chart */}
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-100/60 dark:bg-blue-900/30">
                <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              Statusfordeling
            </CardTitle>
            <CardDescription>Rapporter gruppert etter status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry) => `${entry.label}: ${entry.count}`}
                    onClick={(data: any) => onFilterByStatus?.(data.status)}
                    className="cursor-pointer"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        className="hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {statusDistribution.map((item) => (
                <Badge 
                  key={item.status} 
                  variant="outline" 
                  className="gap-2 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => onFilterByStatus?.(item.status)}
                >
                  <div
                    className={`h-2 w-2 rounded-full ${statusBgClass[item.status] || "bg-[#64748b]"}`}
                  />
                  {item.label}: {item.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Trend Over Time Line Chart */}
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-green-100/60 dark:bg-green-900/30">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              Trend over tid
            </CardTitle>
            <CardDescription>Rapportvolum per måned</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'currentColor' }} stroke="currentColor" strokeOpacity={0.2} />
                  <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} stroke="currentColor" strokeOpacity={0.2} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                      fontSize: '12px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Totalt"
                  />
                  <Line
                    type="monotone"
                    dataKey="approved"
                    stroke="#22c55e"
                    strokeWidth={2}
                    name="Godkjent"
                  />
                  <Line
                    type="monotone"
                    dataKey="pending"
                    stroke="#eab308"
                    strokeWidth={2}
                    name="Venter"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stacked Bar Chart - Status Breakdown Over Time */}
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-100/60 dark:bg-purple-900/30">
              <BarChart3 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            Statusfordeling over tid
          </CardTitle>
          <CardDescription>Månedsvis oversikt over alle statuser</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'currentColor' }} stroke="currentColor" strokeOpacity={0.2} />
                <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} stroke="currentColor" strokeOpacity={0.2} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                    fontSize: '12px',
                  }}
                />
                <Legend />
                <Bar dataKey="approved" stackId="a" fill={statusColors.approved} name="Godkjent" />
                <Bar dataKey="pending" stackId="a" fill={statusColors.pending} name="Til behandling" />
                <Bar dataKey="submitted" stackId="a" fill={statusColors.submitted} name="Sendt inn" />
                <Bar dataKey="needs_revision" stackId="a" fill={statusColors.needs_revision} name="Trenger revisjon" />
                <Bar dataKey="rejected" stackId="a" fill={statusColors.rejected} name="Avslått" />
                <Bar dataKey="draft" stackId="a" fill={statusColors.draft} name="Utkast" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Action Items */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-orange-300/50 dark:border-orange-800/40 bg-orange-50/40 dark:bg-orange-950/20 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Krever handling</CardTitle>
              <div className="p-2 rounded-lg bg-orange-100/80 dark:bg-orange-900/40">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{metrics.needsRevision}</div>
            <p className="text-xs text-muted-foreground mt-1">rapporter trenger revisjon</p>
          </CardContent>
        </Card>

        <Card className="border-yellow-300/50 dark:border-yellow-800/40 bg-yellow-50/40 dark:bg-yellow-950/20 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Venter godkjenning</CardTitle>
              <div className="p-2 rounded-lg bg-yellow-100/80 dark:bg-yellow-900/40">
                <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{metrics.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">rapporter under behandling</p>
          </CardContent>
        </Card>

        <Card className="border-red-300/50 dark:border-red-800/40 bg-red-50/40 dark:bg-red-950/20 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Avslått</CardTitle>
              <div className="p-2 rounded-lg bg-red-100/80 dark:bg-red-900/40">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{metrics.rejected}</div>
            <p className="text-xs text-muted-foreground mt-1">rapporter avslått</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
