import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  FileText, 
  Download, 
  ChevronDown,
  FileSpreadsheet,
  File,
  Search,
  TrendingUp,
  Clock,
  CheckCircle,
  Users,
  BarChart3,
  Calendar,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { nb } from "date-fns/locale";
import type { User } from "@shared/schema";

type ReportEntry = {
  id: string;
  userId: string;
  caseNumber: string | null;
  description: string;
  hours: number;
  date: string;
  status: string;
  createdAt: string;
  userName: string;
  department: string;
};

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabels: Record<string, string> = {
  pending: "Venter",
  approved: "Godkjent",
  rejected: "Avvist",
};

export default function ReportsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState("week");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"summary" | "reports" | "analytics" | "schedule">("summary");
  const [selectedReportForAction, setSelectedReportForAction] = useState<string | null>(null);

  const startDate = dateRange === "today" 
    ? format(new Date(), "yyyy-MM-dd")
    : dateRange === "week" 
    ? format(subDays(new Date(), 7), "yyyy-MM-dd")
    : format(subDays(new Date(), 30), "yyyy-MM-dd");

  const { data: reports = [], isLoading } = useQuery<ReportEntry[]>({
    queryKey: ["/api/reports", { 
      startDate, 
      status: statusFilter === "all" ? "" : statusFilter 
    }],
    staleTime: 0,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: stats } = useQuery<{
    totalHours: number;
    activeUsers: number;
    pendingApprovals: number;
    casesThisWeek: number;
  }>({
    queryKey: ["/api/stats"],
  });

  const filteredReports = reports.filter((report) => {
    const matchesSearch = report.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          report.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (report.caseNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === "all" || report.status === statusFilter;
    const matchesDepartment = departmentFilter === "all" || report.department === departmentFilter;
    return matchesSearch && matchesStatus && matchesDepartment;
  });

  // Analytics data
  const departmentStats = useMemo(() => {
    const stats: Record<string, { hours: number; count: number; percentage: number }> = {};
    filteredReports.forEach(r => {
      if (!stats[r.department]) stats[r.department] = { hours: 0, count: 0, percentage: 0 };
      stats[r.department].hours += r.hours;
      stats[r.department].count += 1;
    });
    const total = Object.values(stats).reduce((sum, s) => sum + s.hours, 0);
    Object.keys(stats).forEach(dept => {
      stats[dept].percentage = (stats[dept].hours / total) * 100 || 0;
    });
    return Object.entries(stats)
      .map(([dept, data]) => ({ department: dept, ...data }))
      .sort((a, b) => b.hours - a.hours);
  }, [filteredReports]);

  // User performance stats  
  const userStats = useMemo(() => {
    const stats: Record<string, { hours: number; approvals: number; percentage: number }> = {};
    filteredReports.forEach(r => {
      if (!stats[r.userName]) stats[r.userName] = { hours: 0, approvals: 0, percentage: 0 };
      stats[r.userName].hours += r.hours;
      if (r.status === "approved") stats[r.userName].approvals += 1;
    });
    const total = Object.values(stats).reduce((sum, s) => sum + s.approvals, 0);
    return Object.entries(stats)
      .slice(0, 5)
      .map(([user, data]) => ({
        user,
        hours: data.hours,
        approvals: data.approvals,
        approvalRate: total > 0 ? ((data.approvals / total) * 100) : 0,
      }));
  }, [filteredReports]);

  // Trends (day-over-day comparison)
  const trends = useMemo(() => {
    const currentWeekTotal = filteredReports.filter(r => {
      const date = new Date(r.date);
      return date >= subDays(new Date(), 7);
    }).reduce((sum, r) => sum + r.hours, 0);
    
    const previousWeekTotal = reports.filter(r => {
      const date = new Date(r.date);
      return date >= subDays(new Date(), 14) && date < subDays(new Date(), 7);
    }).reduce((sum, r) => sum + r.hours, 0);
    
    const change = previousWeekTotal > 0 ? ((currentWeekTotal - previousWeekTotal) / previousWeekTotal) * 100 : 0;
    return { currentWeekTotal, previousWeekTotal, changePercent: change };
  }, [filteredReports, reports]);

  // Get unique departments
  const departments = useMemo(() => {
    const depts = reports.map(r => r.department);
    return ["all", ...Array.from(new Set(depts))];
  }, [reports]);

  const totalHours = filteredReports.reduce((sum, r) => sum + r.hours, 0);
  const uniqueUserIds = Array.from(new Set(filteredReports.map(r => r.userId)));
  const avgHours = filteredReports.length > 0 ? totalHours / uniqueUserIds.length : 0;
  const approvedCount = filteredReports.filter(r => r.status === "approved").length;
  const pendingCount = filteredReports.filter(r => r.status === "pending").length;

  const handleExport = async (formatType: "csv" | "pdf" | "excel") => {
    const params = new URLSearchParams({
      format: formatType,
      startDate,
      ...(statusFilter !== "all" && { status: statusFilter }),
    });
    
    if (formatType === "pdf") {
      window.open(`/api/reports/export?${params.toString()}`, "_blank");
    } else {
      const response = await fetch(`/api/reports/export?${params.toString()}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = formatType === "excel" 
        ? `rapport-${format(new Date(), "yyyy-MM-dd")}.xls`
        : `rapport-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    }
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" data-testid="reports-title">Rapporter</h1>
            <p className="text-muted-foreground mt-1">Administrer og eksporter timelister og rapporter</p>
          </div>
          
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="export-button">
                  <Download className="h-4 w-4 mr-2" />
                  Eksporter
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("pdf")} data-testid="export-pdf">
                  <File className="h-4 w-4 mr-2" />
                  Eksporter som PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("excel")} data-testid="export-excel">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Eksporter som Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("csv")} data-testid="export-csv">
                  <FileText className="h-4 w-4 mr-2" />
                  Eksporter som CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Hours Card */}
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/30 border-blue-200/60 hover:shadow-lg hover:shadow-blue-200/30 transition-all -translate-y-0 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                  <Clock className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Totalt timer</p>
                  <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
                  {trends.changePercent !== 0 && (
                    <div className="flex items-center gap-1 text-xs mt-1">
                      {trends.changePercent > 0 ? (
                        <ArrowUpRight className="h-3 w-3 text-green-600" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 text-orange-600" />
                      )}
                      <span className={trends.changePercent > 0 ? "text-green-600" : "text-orange-600"}>
                        {Math.abs(trends.changePercent).toFixed(0)}% vs. forrige uke
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Average Per User Card */}
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/30 border-emerald-200/60 hover:shadow-lg hover:shadow-emerald-200/30 transition-all -translate-y-0 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Snitt per ansatt</p>
                  <p className="text-2xl font-bold">{avgHours.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {users.length} registrerte brukere
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Approved Card */}
          <Card className="bg-gradient-to-br from-green-50 to-green-100/30 border-green-200/60 hover:shadow-lg hover:shadow-green-200/30 transition-all -translate-y-0 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-gradient-to-br from-green-500 to-green-600">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Godkjente</p>
                  <p className="text-2xl font-bold">{approvedCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {filteredReports.length > 0 ? ((approvedCount / filteredReports.length) * 100).toFixed(0) : 0}% godkjenningsrate
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Card */}
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/30 border-amber-200/60 hover:shadow-lg hover:shadow-amber-200/30 transition-all -translate-y-0 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600">
                  <Bell className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ventende</p>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {pendingCount > 0 ? "Trenger oppmerksomhet" : "Ingen ventende"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tab Navigation */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary">Oversikt</TabsTrigger>
            <TabsTrigger value="reports">Registreringer</TabsTrigger>
            <TabsTrigger value="analytics">Statistikk</TabsTrigger>
            <TabsTrigger value="schedule">Planlegg</TabsTrigger>
          </TabsList>

          {/* SUMMARY TAB */}
          <TabsContent value="summary" className="space-y-6 mt-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Department Breakdown */}
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100/30 border-purple-200/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Fordeling på avdelinger
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {departmentStats.length > 0 ? (
                    departmentStats.map((dept) => (
                      <div key={dept.department} className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium">{dept.department}</span>
                          <span className="font-mono">{dept.hours.toFixed(1)}t</span>
                        </div>
                        <div className="h-2 bg-slate-200/60 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                            style={{ width: `${dept.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Ingen data</p>
                  )}
                </CardContent>
              </Card>

              {/* Top Performers */}
              <Card className="bg-gradient-to-br from-orange-50 to-orange-100/30 border-orange-200/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Top prestationer
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {userStats.length > 0 ? (
                    userStats.map((user, idx) => (
                      <div key={user.user} className="flex items-center justify-between p-2 rounded-lg bg-white/50 dark:bg-card/50 hover:bg-white/80 dark:hover:bg-card/80 transition">
                        <div>
                          <p className="text-sm font-medium">{idx + 1}. {user.user}</p>
                          <p className="text-xs text-muted-foreground">{user.approvals} godkjente</p>
                        </div>
                        <Badge className="bg-gradient-to-r from-orange-500 to-orange-600">
                          {user.hours.toFixed(1)}t
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Ingen data</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ANALYTICS TAB */}
          <TabsContent value="analytics" className="space-y-6 mt-6">
            <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/30 border-indigo-200/60">
              <CardHeader>
                <CardTitle>Trendanalyse</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-white/60 dark:bg-card/60">
                    <p className="text-sm text-muted-foreground mb-2">Denne uken</p>
                    <p className="text-3xl font-bold font-mono">{trends.currentWeekTotal.toFixed(1)}t</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/60 dark:bg-card/60">
                    <p className="text-sm text-muted-foreground mb-2">Forrige uke</p>
                    <p className="text-3xl font-bold font-mono">{trends.previousWeekTotal.toFixed(1)}t</p>
                  </div>
                </div>
                <div className={cn(
                  "p-3 rounded-lg text-sm font-medium",
                  trends.changePercent > 0 
                    ? "bg-green-100/50 border border-green-200/60 text-green-700" 
                    : trends.changePercent < 0
                    ? "bg-orange-100/50 border border-orange-200/60 text-orange-700"
                    : "bg-slate-100/50 border border-slate-200/60 text-slate-700"
                )}>
                  {trends.changePercent > 0 ? "📈 " : trends.changePercent < 0 ? "📉 " : "⏹️ "}
                  {Math.abs(trends.changePercent).toFixed(1)}% {trends.changePercent > 0 ? "økning" : trends.changePercent < 0 ? "reduksjon" : "uendret"}
                </div>
              </CardContent>
            </Card>

            {stats && (
              <Card className="bg-gradient-to-br from-slate-50 to-slate-100/30 border-slate-200/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Nøkkeltall fra systemet
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg bg-white/60 dark:bg-card/60 text-center">
                      <p className="text-sm text-muted-foreground mb-1">Totalt timer</p>
                      <p className="text-2xl font-bold font-mono">{stats.totalHours?.toFixed(1) ?? "–"}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/60 dark:bg-card/60 text-center">
                      <p className="text-sm text-muted-foreground mb-1">Aktive brukere</p>
                      <p className="text-2xl font-bold font-mono">{stats.activeUsers ?? "–"}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/60 dark:bg-card/60 text-center">
                      <p className="text-sm text-muted-foreground mb-1">Ventende godkj.</p>
                      <p className="text-2xl font-bold font-mono">{stats.pendingApprovals ?? "–"}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/60 dark:bg-card/60 text-center">
                      <p className="text-sm text-muted-foreground mb-1">Saker denne uken</p>
                      <p className="text-2xl font-bold font-mono">{stats.casesThisWeek ?? "–"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* SCHEDULE TAB */}
          <TabsContent value="schedule" className="space-y-6 mt-6">
            <Card className="bg-gradient-to-br from-teal-50 to-teal-100/30 border-teal-200/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Planlegg rapporter
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-white/60 dark:bg-card/60 space-y-3">
                  <div>
                    <label className="text-sm font-medium">Rapporttype</label>
                    <Select>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Velg rapport" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Ukerapport</SelectItem>
                        <SelectItem value="monthly">Månedlig rapport</SelectItem>
                        <SelectItem value="quarterly">Kvartalsvis rapport</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Frekvens</label>
                    <Select>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Velg frekvens" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Hver uke</SelectItem>
                        <SelectItem value="biweekly">Annenhver uke</SelectItem>
                        <SelectItem value="monthly">Hver måned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700">
                    <Calendar className="h-4 w-4 mr-2" />
                    Planlegg rapport
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Automatiske rapporter sendes til dine innbokser
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* REPORTS TAB */}
          <TabsContent value="reports" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Timeregistreringer</CardTitle>
                  <div className="flex flex-wrap gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Søk etter bruker eller sak..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-full md:w-64"
                        data-testid="search-input"
                      />
                    </div>
                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="department-filter">
                        <SelectValue placeholder="Avdeling" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map(dept => (
                          <SelectItem key={dept} value={dept}>
                            {dept === "all" ? "Alle avdelinger" : dept}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="status-filter">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle statuser</SelectItem>
                        <SelectItem value="pending">Venter</SelectItem>
                        <SelectItem value="approved">Godkjent</SelectItem>
                        <SelectItem value="rejected">Avvist</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={dateRange} onValueChange={setDateRange}>
                      <SelectTrigger className="w-[140px]" data-testid="date-filter">
                        <SelectValue placeholder="Periode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">I dag</SelectItem>
                        <SelectItem value="week">Siste 7 dager</SelectItem>
                        <SelectItem value="month">Siste 30 dager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bruker</TableHead>
                      <TableHead>Avdeling</TableHead>
                      <TableHead>Saksnummer</TableHead>
                      <TableHead>Beskrivelse</TableHead>
                      <TableHead className="text-right">Timer</TableHead>
                      <TableHead>Dato</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Ingen registreringer funnet
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredReports.map((report) => (
                        <TableRow
                          key={report.id}
                          data-testid={`report-row-${report.id}`}
                          className={cn(selectedReportForAction === report.id && "bg-primary/5 ring-1 ring-primary/20")}
                          onClick={() => setSelectedReportForAction(selectedReportForAction === report.id ? null : report.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <TableCell className="font-medium">{report.userName}</TableCell>
                          <TableCell className="text-muted-foreground">{report.department}</TableCell>
                          <TableCell>
                            {report.caseNumber ? (
                              <Badge variant="outline">{report.caseNumber}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{report.description}</TableCell>
                          <TableCell className="text-right font-medium">{report.hours.toFixed(1)}t</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(report.date), "d. MMM", { locale: nb })}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={cn("border", statusColors[report.status] || "")}
                            >
                              {statusLabels[report.status] || report.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PortalLayout>
  );
}
