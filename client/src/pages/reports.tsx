import { useState } from "react";
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
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

  const startDate = dateRange === "today" 
    ? format(new Date(), "yyyy-MM-dd")
    : dateRange === "week" 
    ? format(subDays(new Date(), 7), "yyyy-MM-dd")
    : format(subDays(new Date(), 30), "yyyy-MM-dd");

  const { data: reports = [], isLoading, refetch } = useQuery<ReportEntry[]>({
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
    return matchesSearch && matchesStatus;
  });

  const totalHours = filteredReports.reduce((sum, r) => sum + r.hours, 0);
  const avgHours = filteredReports.length > 0 ? totalHours / new Set(filteredReports.map(r => r.userId)).size : 0;
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
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Totalt timer</p>
                  <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-info/10">
                  <TrendingUp className="h-5 w-5 text-info" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Snitt per ansatt</p>
                  <p className="text-2xl font-bold">{avgHours.toFixed(1)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Godkjente</p>
                  <p className="text-2xl font-bold">{approvedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-warning/10">
                  <Users className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ventende</p>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle>Timeregistreringer</CardTitle>
              <div className="flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Sok etter bruker eller sak..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-full md:w-64"
                    data-testid="search-input"
                  />
                </div>
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
                        <TableRow key={report.id} data-testid={`report-row-${report.id}`}>
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
      </div>
    </PortalLayout>
  );
}
