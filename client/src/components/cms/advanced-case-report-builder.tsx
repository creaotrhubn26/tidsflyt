import { useState, useMemo, useEffect } from "react";
import {
  FileText,
  Calendar,
  Filter,
  Download,
  Eye,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MoreVertical,
  Search,
  SortAsc,
  ChevronDown,
  Bookmark,
  Archive,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { CaseReport } from "@shared/schema";

interface AdvancedCaseReportBuilderProps {
  reports: CaseReport[];
  onViewReport: (report: CaseReport) => void;
  onEditReport: (report: CaseReport) => void;
  onExportReports: (reports: CaseReport[], format: string) => void;
  onBulkStatusChange?: (reportIds: number[], newStatus: string) => void;
  externalStatusFilter?: string | null;
}

type FilterConfig = {
  search: string;
  status: string[];
  dateRange: { from: Date | null; to: Date | null };
  caseId: string;
  sortBy: "createdAt" | "updatedAt" | "month" | "status";
  sortOrder: "asc" | "desc";
};

type SavedView = {
  id: string;
  name: string;
  filters: FilterConfig;
  isDefault?: boolean;
};

const statusConfig = {
  draft: { 
    label: "Utkast", 
    color: "bg-gradient-to-r from-slate-100 to-slate-50 text-slate-700 border border-slate-200 shadow-sm", 
    icon: FileText 
  },
  pending: { 
    label: "Til behandling", 
    color: "bg-gradient-to-r from-yellow-100 to-amber-50 text-yellow-800 border border-yellow-200 shadow-sm", 
    icon: Clock 
  },
  submitted: { 
    label: "Sendt inn", 
    color: "bg-gradient-to-r from-blue-100 to-sky-50 text-blue-800 border border-blue-200 shadow-sm", 
    icon: Clock 
  },
  needs_revision: { 
    label: "Trenger revisjon", 
    color: "bg-gradient-to-r from-orange-100 to-orange-50 text-orange-800 border border-orange-200 shadow-sm", 
    icon: AlertTriangle 
  },
  approved: { 
    label: "Godkjent", 
    color: "bg-gradient-to-r from-green-100 to-emerald-50 text-green-800 border border-green-200 shadow-sm", 
    icon: CheckCircle2 
  },
  rejected: { 
    label: "Avslått", 
    color: "bg-gradient-to-r from-red-100 to-rose-50 text-red-800 border border-red-200 shadow-sm", 
    icon: XCircle 
  },
};

export function AdvancedCaseReportBuilder({
  reports,
  onViewReport,
  onEditReport,
  onExportReports,
  onBulkStatusChange,
  externalStatusFilter,
}: AdvancedCaseReportBuilderProps) {
  const [selectedReports, setSelectedReports] = useState<number[]>([]);
  const [filters, setFilters] = useState<FilterConfig>({
    search: "",
    status: [],
    dateRange: { from: null, to: null },
    caseId: "",
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  // Apply external status filter from analytics dashboard
  useEffect(() => {
    if (externalStatusFilter) {
      setFilters(prev => ({
        ...prev,
        status: [externalStatusFilter]
      }));
      setActiveView(null); // Clear saved view when external filter is applied
    }
  }, [externalStatusFilter]);

  const [savedViews, setSavedViews] = useState<SavedView[]>([
    {
      id: "my-drafts",
      name: "Mine utkast",
      filters: { ...filters, status: ["draft"] },
      isDefault: true,
    },
    {
      id: "pending-approval",
      name: "Venter godkjenning",
      filters: { ...filters, status: ["pending", "submitted"] },
    },
    {
      id: "needs-action",
      name: "Krever handling",
      filters: { ...filters, status: ["needs_revision"] },
    },
  ]);
  const [activeView, setActiveView] = useState<string | null>("my-drafts");
  const [viewMode, setViewMode] = useState<"list" | "timeline" | "kanban">("list");

  // Filter and sort reports
  const filteredReports = useMemo(() => {
    let filtered = [...reports];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.caseId.toLowerCase().includes(searchLower) ||
          r.background?.toLowerCase().includes(searchLower) ||
          r.recommendations?.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (filters.status.length > 0) {
      filtered = filtered.filter((r) => filters.status.includes(r.status));
    }

    // Case ID filter
    if (filters.caseId) {
      filtered = filtered.filter((r) => r.caseId === filters.caseId);
    }

    // Date range filter
    if (filters.dateRange.from) {
      filtered = filtered.filter((r) => r.createdAt && new Date(r.createdAt) >= filters.dateRange.from!);
    }
    if (filters.dateRange.to) {
      filtered = filtered.filter((r) => r.createdAt && new Date(r.createdAt) <= filters.dateRange.to!);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[filters.sortBy];
      let bVal: any = b[filters.sortBy];

      if (filters.sortBy === "createdAt" || filters.sortBy === "updatedAt") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (filters.sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [reports, filters]);

  // Group by status for Kanban view
  const reportsByStatus = useMemo(() => {
    const grouped: Record<string, CaseReport[]> = {};
    Object.keys(statusConfig).forEach((status) => {
      grouped[status] = filteredReports.filter((r) => r.status === status);
    });
    return grouped;
  }, [filteredReports]);

  // Group by month for Timeline view
  const reportsByMonth = useMemo(() => {
    const grouped: Record<string, CaseReport[]> = {};
    filteredReports.forEach((report) => {
      const month = report.month;
      if (!grouped[month]) grouped[month] = [];
      grouped[month].push(report);
    });
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredReports]);

  const toggleReportSelection = (reportId: number) => {
    setSelectedReports((prev) =>
      prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedReports.length === filteredReports.length) {
      setSelectedReports([]);
    } else {
      setSelectedReports(filteredReports.map((r) => r.id));
    }
  };

  const applyView = (view: SavedView) => {
    setFilters(view.filters);
    setActiveView(view.id);
  };

  const saveCurrentView = () => {
    const name = prompt("Gi visningen et navn:");
    if (name) {
      const newView: SavedView = {
        id: `view-${Date.now()}`,
        name,
        filters: { ...filters },
      };
      setSavedViews([...savedViews, newView]);
    }
  };

  const formatDateTime = (dateStr: string | Date | null) => {
    if (!dateStr) return "Ukjent dato";
    return format(new Date(dateStr), "d. MMM yyyy", { locale: nb });
  };

  const getUnreadCommentCount = (_report: CaseReport): number => {
    // TODO: Fetch actual unread count from backend
    return 0;
  };

  return (
    <div className="space-y-4">
      {/* Header with saved views and actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-gradient-to-r from-slate-50 to-white p-4 rounded-lg border border-slate-200/50 shadow-sm">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Bookmark className="h-4 w-4" />
                {activeView ? savedViews.find((v) => v.id === activeView)?.name : "Alle rapporter"}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Lagrede visninger</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {savedViews.map((view) => (
                <DropdownMenuItem key={view.id} onClick={() => applyView(view)}>
                  <Bookmark className="h-4 w-4 mr-2" />
                  {view.name}
                  {view.isDefault && <Badge variant="outline" className="ml-auto text-xs">Standard</Badge>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={saveCurrentView}>
                <Bookmark className="h-4 w-4 mr-2" />
                Lagre nåværende visning
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-1 border rounded-md p-1">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="h-8"
            >
              Liste
            </Button>
            <Button
              variant={viewMode === "timeline" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("timeline")}
              className="h-8"
            >
              Tidslinje
            </Button>
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("kanban")}
              className="h-8"
            >
              Kanban
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedReports.length > 0 && (
            <>
              <Badge variant="secondary">{selectedReports.length} valgt</Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Handlinger
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onExportReports(reports.filter(r => selectedReports.includes(r.id)), "pdf")}>
                    <Download className="h-4 w-4 mr-2" />
                    Eksporter til PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExportReports(reports.filter(r => selectedReports.includes(r.id)), "csv")}>
                    <Download className="h-4 w-4 mr-2" />
                    Eksporter til CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onBulkStatusChange?.(selectedReports, "submitted")}>
                    Send inn valgte
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBulkStatusChange?.(selectedReports, "archived")}>
                    <Archive className="h-4 w-4 mr-2" />
                    Arkiver valgte
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Search and filters */}
      <Card className="bg-gradient-to-br from-white to-slate-50/50 border-slate-200/60 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk i rapporter..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Status
                  {filters.status.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{filters.status.length}</Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {Object.entries(statusConfig).map(([status, config]) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={filters.status.includes(status)}
                    onCheckedChange={(checked) => {
                      setFilters({
                        ...filters,
                        status: checked
                          ? [...filters.status, status]
                          : filters.status.filter((s) => s !== status),
                      });
                    }}
                  >
                    <config.icon className="h-4 w-4 mr-2" />
                    {config.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onValueChange={(value) => {
                const [sortBy, sortOrder] = value.split("-") as [FilterConfig["sortBy"], FilterConfig["sortOrder"]];
                setFilters({ ...filters, sortBy, sortOrder });
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SortAsc className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updatedAt-desc">Sist oppdatert (nyeste)</SelectItem>
                <SelectItem value="updatedAt-asc">Sist oppdatert (eldste)</SelectItem>
                <SelectItem value="createdAt-desc">Opprettet (nyeste)</SelectItem>
                <SelectItem value="createdAt-asc">Opprettet (eldste)</SelectItem>
                <SelectItem value="month-desc">Måned (nyeste)</SelectItem>
                <SelectItem value="month-asc">Måned (eldste)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reports display based on view mode */}
      {viewMode === "list" && (
        <div className="space-y-3">
          {selectedReports.length < filteredReports.length && filteredReports.length > 0 && (
            <div className="flex items-center gap-2 px-2">
              <Checkbox
                checked={selectedReports.length === filteredReports.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">Velg alle ({filteredReports.length})</span>
            </div>
          )}

          {filteredReports.map((report) => {
            const StatusIcon = statusConfig[report.status as keyof typeof statusConfig]?.icon || FileText;
            const unreadCount = getUnreadCommentCount(report);

            return (
              <Card
                key={report.id}
                className={`group transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-0.5 border-slate-200/60 bg-gradient-to-br from-white to-slate-50/30 ${
                  selectedReports.includes(report.id) ? "ring-2 ring-primary shadow-lg shadow-primary/10" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={selectedReports.includes(report.id)}
                      onCheckedChange={() => toggleReportSelection(report.id)}
                      className="mt-1"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <h3 className="font-semibold text-lg mb-1">
                            Sak {report.caseId} - {report.month}
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            Oppdatert {formatDateTime(report.updatedAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusConfig[report.status as keyof typeof statusConfig]?.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig[report.status as keyof typeof statusConfig]?.label}
                          </Badge>
                        </div>
                      </div>

                      {report.background && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {report.background}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {unreadCount > 0 && (
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-4 w-4" />
                              <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                                {unreadCount}
                              </Badge>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <Button variant="ghost" size="sm" onClick={() => onViewReport(report)} className="hover:bg-primary/10">
                            <Eye className="h-4 w-4 mr-2" />
                            Vis
                          </Button>
                          {report.status === "draft" && (
                            <Button variant="outline" size="sm" onClick={() => onEditReport(report)} className="border-primary/20 hover:bg-primary/5">
                              Rediger
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onViewReport(report)}>
                                <Eye className="h-4 w-4 mr-2" />
                                Vis detaljer
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onEditReport(report)}>
                                Rediger
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onExportReports([report], "pdf")}>
                                <Download className="h-4 w-4 mr-2" />
                                Eksporter PDF
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredReports.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Ingen rapporter funnet</h3>
                <p className="text-muted-foreground">
                  Juster filtrene eller opprett en ny rapport for å komme i gang.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {viewMode === "timeline" && (
        <div className="space-y-6">
          {reportsByMonth.map(([month, monthReports]) => (
            <div key={month}>
              <h3 className="text-lg font-semibold mb-3 sticky top-0 bg-background py-2 z-10">
                {month}
                <Badge variant="secondary" className="ml-2">{monthReports.length}</Badge>
              </h3>
              <div className="space-y-3 pl-6 border-l-2 border-muted">
                {monthReports.map((report) => {
                  const StatusIcon = statusConfig[report.status as keyof typeof statusConfig]?.icon || FileText;
                  return (
                    <Card key={report.id} className="ml-4 hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 hover:-translate-x-1 bg-gradient-to-br from-white to-slate-50/30 border-slate-200/60">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-semibold">Sak {report.caseId}</h4>
                            <p className="text-sm text-muted-foreground">
                              {formatDateTime(report.createdAt)}
                            </p>
                          </div>
                          <Badge className={statusConfig[report.status as keyof typeof statusConfig]?.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig[report.status as keyof typeof statusConfig]?.label}
                          </Badge>
                        </div>
                        {report.background && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {report.background}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => onViewReport(report)}>
                            Vis detaljer
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Object.entries(statusConfig).map(([status, config]) => {
            const StatusIcon = config.icon;
            const statusReports = reportsByStatus[status] || [];

            return (
              <Card key={status} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className="h-4 w-4" />
                      <CardTitle className="text-sm">{config.label}</CardTitle>
                    </div>
                    <Badge variant="secondary">{statusReports.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-2 pt-0">
                  {statusReports.map((report) => (
                    <Card
                      key={report.id}
                      className="p-3 cursor-pointer hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 hover:scale-105 bg-gradient-to-br from-white to-slate-50/30 border-slate-200/60"
                      onClick={() => onViewReport(report)}
                    >
                      <div className="text-sm font-semibold mb-1">Sak {report.caseId}</div>
                      <div className="text-xs text-muted-foreground">{report.month}</div>
                      {report.background && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {report.background}
                        </p>
                      )}
                    </Card>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
