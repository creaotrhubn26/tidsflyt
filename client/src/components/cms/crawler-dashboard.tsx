/**
 * SEO Crawler Dashboard — Admin UI for the Tidum SEO Crawler
 *
 * Features:
 * - Start new crawls with full configuration
 * - Monitor running crawl progress in real-time
 * - Browse paginated & filterable results
 * - Issues summary with severity breakdown
 * - Duplicate content report
 * - Redirect analysis
 * - Compare crawls side-by-side
 * - Export results (CSV / JSON)
 * - Schedule recurring crawls
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Play, Search, Download, Trash2, RefreshCw, ExternalLink,
  AlertTriangle, CheckCircle, XCircle, Clock, Globe, Link2, FileText,
  Eye, ChevronDown, ChevronUp, BarChart3, Settings, Plus, X, Activity,
} from "lucide-react";

function getAdminToken(): string | null {
  return sessionStorage.getItem("cms_admin_token");
}

async function crawlerApi(url: string, options: { method?: string; body?: string } = {}) {
  const token = getAdminToken();
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.headers.get("content-type")?.includes("text/csv")) {
    return res.text();
  }
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────
interface CrawlJob {
  id: number;
  name: string;
  target_url: string;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  crawl_type: string;
  max_pages: number;
  max_depth: number;
  pages_crawled: number;
  pages_total: number;
  errors_count: number;
  warnings_count: number;
  duration_ms: number;
  started_at: string;
  completed_at: string;
  created_at: string;
}

interface CrawlResultRow {
  id: number;
  url: string;
  status_code: number;
  content_type: string;
  response_time_ms: number;
  title: string;
  title_length: number;
  meta_description: string;
  meta_description_length: number;
  canonical_url: string;
  h1_count: number;
  h2_count: number;
  word_count: number;
  text_ratio: number;
  internal_links_count: number;
  external_links_count: number;
  images_count: number;
  images_without_alt: number;
  indexable: boolean;
  indexability_reason: string;
  issues: Array<{ type: string; severity: string; message: string }>;
  depth: number;
  content_size: number;
  redirect_url: string;
  redirect_chain: string[];
  og_tags: Record<string, string>;
  twitter_tags: Record<string, string>;
  structured_data: any;
  structured_data_errors: string[];
  hreflang: Array<{ lang: string; url: string }>;
  accessibility_issues: Array<{ type: string; message: string }>;
}

interface IssueSummary {
  issue_type: string;
  severity: string;
  count: number;
  example_urls: string[];
}

// ── Main Component ───────────────────────────────────────────────────
export function CrawlerDashboard() {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<"jobs" | "new" | "results" | "issues" | "duplicates" | "redirects" | "compare" | "schedules">("jobs");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [compareJobId, setCompareJobId] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6" />
            SEO Crawler
          </h2>
          <p className="text-muted-foreground">
            Komplett nettstedscrawler for SEO-analyse, feilsøking og overvåking
          </p>
        </div>
        <Button onClick={() => setActiveView("new")}>
          <Plus className="h-4 w-4 mr-2" /> Ny crawl
        </Button>
      </div>

      {/* Navigation */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "jobs", label: "Crawl-jobber", icon: Activity },
          { key: "new", label: "Ny crawl", icon: Plus },
          ...(selectedJobId ? [
            { key: "results", label: "Resultater", icon: FileText },
            { key: "issues", label: "Problemer", icon: AlertTriangle },
            { key: "duplicates", label: "Duplikater", icon: RefreshCw },
            { key: "redirects", label: "Omdirigeringer", icon: Link2 },
            { key: "compare", label: "Sammenlign", icon: BarChart3 },
          ] : []),
          { key: "schedules", label: "Tidsplaner", icon: Clock },
        ].map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={activeView === key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveView(key as any)}
          >
            <Icon className="h-4 w-4 mr-1" /> {label}
          </Button>
        ))}
      </div>

      {activeView === "jobs" && (
        <JobsList
          onSelectJob={(id) => { setSelectedJobId(id); setActiveView("results"); }}
          onNewCrawl={() => setActiveView("new")}
        />
      )}
      {activeView === "new" && (
        <NewCrawlForm
          onCreated={(id) => { setSelectedJobId(id); setActiveView("results"); }}
        />
      )}
      {activeView === "results" && selectedJobId && (
        <CrawlResults jobId={selectedJobId} />
      )}
      {activeView === "issues" && selectedJobId && (
        <IssuesSummary jobId={selectedJobId} />
      )}
      {activeView === "duplicates" && selectedJobId && (
        <DuplicatesReport jobId={selectedJobId} />
      )}
      {activeView === "redirects" && selectedJobId && (
        <RedirectsReport jobId={selectedJobId} />
      )}
      {activeView === "compare" && selectedJobId && (
        <CompareView
          jobId={selectedJobId}
          compareJobId={compareJobId}
          onSelectCompare={setCompareJobId}
        />
      )}
      {activeView === "schedules" && <ScheduleManager />}
    </div>
  );
}

// ── Jobs List ────────────────────────────────────────────────────────
function JobsList({ onSelectJob, onNewCrawl }: { onSelectJob: (id: number) => void; onNewCrawl: () => void }) {
  const { toast } = useToast();

  const { data: jobs = [], isLoading, refetch } = useQuery<CrawlJob[]>({
    queryKey: ["/api/cms/crawler/jobs"],
    queryFn: () => crawlerApi("/api/cms/crawler/jobs"),
    refetchInterval: 5000, // Poll for running jobs
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => crawlerApi(`/api/cms/crawler/jobs/${id}`, { method: "DELETE" }),
    onSuccess: () => { refetch(); toast({ title: "Slettet", description: "Crawl-jobb slettet." }); },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => crawlerApi(`/api/cms/crawler/jobs/${id}/cancel`, { method: "POST" }),
    onSuccess: () => { refetch(); toast({ title: "Avbrutt", description: "Crawl avbrutt." }); },
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  if (jobs.length === 0) return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Globe className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Ingen crawl-jobber ennå</h3>
        <p className="text-muted-foreground mb-4">Start en ny crawl for å analysere nettstedet ditt</p>
        <Button onClick={onNewCrawl}><Plus className="h-4 w-4 mr-2" /> Start ny crawl</Button>
      </CardContent>
    </Card>
  );

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  };

  const statusLabels: Record<string, string> = {
    pending: "Venter", running: "Kjører", completed: "Fullført",
    failed: "Feilet", cancelled: "Avbrutt", paused: "Pauset",
  };

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <Card key={job.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onSelectJob(job.id)}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold truncate">{job.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[job.status] || ""}`}>
                    {statusLabels[job.status] || job.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{job.target_url}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>{job.pages_crawled} / {job.pages_total || "?"} sider</span>
                  {job.errors_count > 0 && <span className="text-red-600">{job.errors_count} feil</span>}
                  {job.warnings_count > 0 && <span className="text-yellow-600">{job.warnings_count} advarsler</span>}
                  {job.duration_ms && <span>{(job.duration_ms / 1000).toFixed(1)}s</span>}
                  <span>{new Date(job.created_at).toLocaleString("nb-NO")}</span>
                </div>
                {job.status === "running" && (
                  <div className="mt-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${job.pages_total > 0 ? (job.pages_crawled / job.pages_total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                {job.status === "running" && (
                  <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate(job.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
                {job.status !== "running" && (
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => deleteMutation.mutate(job.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── New Crawl Form ───────────────────────────────────────────────────
function NewCrawlForm({ onCreated }: { onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    name: "",
    target_url: "",
    crawl_type: "full",
    max_pages: 500,
    max_depth: 10,
    crawl_delay_ms: 200,
    respect_robots_txt: true,
    follow_external_links: false,
    follow_subdomains: false,
    include_images: true,
    check_canonical: true,
    check_hreflang: true,
    extract_structured_data: true,
    check_accessibility: true,
    custom_user_agent: "",
    url_list: "",
    include_patterns: "",
    exclude_patterns: "",
  });

  const mutation = useMutation({
    mutationFn: (data: any) => crawlerApi("/api/cms/crawler/jobs", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (job: CrawlJob) => {
      toast({ title: "Crawl startet", description: `Jobb #${job.id} - ${job.name}` });
      queryClient.invalidateQueries({ queryKey: ["/api/cms/crawler/jobs"] });
      onCreated(job.id);
    },
    onError: (err: Error) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = { ...form };
    if (form.url_list) data.url_list = form.url_list.split("\n").map((u: string) => u.trim()).filter(Boolean);
    if (form.include_patterns) data.include_patterns = form.include_patterns.split("\n").filter(Boolean);
    if (form.exclude_patterns) data.exclude_patterns = form.exclude_patterns.split("\n").filter(Boolean);
    if (!form.custom_user_agent) delete data.custom_user_agent;
    delete data.url_list_text;
    mutation.mutate(data);
  };

  const updateField = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Ny SEO-crawl</CardTitle>
          <CardDescription>Konfigurer og start en ny nettstedscrawl</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Basic settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Navn</Label>
              <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Min crawl" />
            </div>
            <div>
              <Label>Mål-URL *</Label>
              <Input value={form.target_url} onChange={(e) => updateField("target_url", e.target.value)} placeholder="https://example.com" required />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Crawl-type</Label>
              <Select value={form.crawl_type} onValueChange={(v) => updateField("crawl_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full crawl</SelectItem>
                  <SelectItem value="links_only">Kun lenker</SelectItem>
                  <SelectItem value="sitemap">Fra sitemap</SelectItem>
                  <SelectItem value="url_list">URL-liste</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Maks sider</Label>
              <Input type="number" value={form.max_pages} onChange={(e) => updateField("max_pages", parseInt(e.target.value))} min={1} max={10000} />
            </div>
            <div>
              <Label>Maks dybde</Label>
              <Input type="number" value={form.max_depth} onChange={(e) => updateField("max_depth", parseInt(e.target.value))} min={1} max={50} />
            </div>
          </div>

          {form.crawl_type === "url_list" && (
            <div>
              <Label>URL-liste (én per linje)</Label>
              <textarea
                className="w-full min-h-[100px] p-2 border rounded-md bg-background text-foreground text-sm"
                value={form.url_list}
                onChange={(e) => updateField("url_list", e.target.value)}
                placeholder={"https://example.com/page1\nhttps://example.com/page2"}
              />
            </div>
          )}

          {/* Toggles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { field: "respect_robots_txt", label: "Respekter robots.txt" },
              { field: "follow_external_links", label: "Følg eksterne lenker" },
              { field: "follow_subdomains", label: "Følg subdomener" },
              { field: "include_images", label: "Inkluder bilder" },
              { field: "check_canonical", label: "Sjekk canonical" },
              { field: "check_hreflang", label: "Sjekk hreflang" },
              { field: "extract_structured_data", label: "Strukturerte data" },
              { field: "check_accessibility", label: "Tilgjengelighet" },
            ].map(({ field, label }) => (
              <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={(form as any)[field]}
                  onChange={(e) => updateField(field, e.target.checked)}
                  className="rounded border-gray-300"
                />
                {label}
              </label>
            ))}
          </div>

          {/* Advanced settings */}
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1">
            <Settings className="h-4 w-4" />
            Avanserte innstillinger
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {showAdvanced && (
            <div className="space-y-4 border-l-2 border-muted pl-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Crawl-forsinkelse (ms)</Label>
                  <Input type="number" value={form.crawl_delay_ms} onChange={(e) => updateField("crawl_delay_ms", parseInt(e.target.value))} min={0} max={10000} />
                </div>
                <div>
                  <Label>Egendefinert User-Agent</Label>
                  <Input value={form.custom_user_agent} onChange={(e) => updateField("custom_user_agent", e.target.value)} placeholder="TidumCrawler/1.0" />
                </div>
              </div>
              <div>
                <Label>Inkluder-mønstre (regex, ett per linje)</Label>
                <textarea
                  className="w-full min-h-[60px] p-2 border rounded-md bg-background text-foreground text-sm"
                  value={form.include_patterns}
                  onChange={(e) => updateField("include_patterns", e.target.value)}
                  placeholder="/blog/.*\n/produkt/.*"
                />
              </div>
              <div>
                <Label>Ekskluder-mønstre (regex, ett per linje)</Label>
                <textarea
                  className="w-full min-h-[60px] p-2 border rounded-md bg-background text-foreground text-sm"
                  value={form.exclude_patterns}
                  onChange={(e) => updateField("exclude_patterns", e.target.value)}
                  placeholder="/admin/.*\n/api/.*"
                />
              </div>
            </div>
          )}

          <Button type="submit" disabled={mutation.isPending || !form.target_url} className="w-full">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Start crawl
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

// ── Crawl Results Table ──────────────────────────────────────────────
function CrawlResults({ jobId }: { jobId: number }) {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [issueFilter, setIssueFilter] = useState("");
  const [sortBy, setSortBy] = useState("url");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const { data: job } = useQuery<CrawlJob & { summary: any }>({
    queryKey: ["/api/cms/crawler/jobs", jobId],
    queryFn: () => crawlerApi(`/api/cms/crawler/jobs/${jobId}`),
    refetchInterval: (query) => query.state.data?.status === "running" ? 3000 : false,
  });

  const { data: resultsData, isLoading } = useQuery<{ results: CrawlResultRow[]; pagination: any }>({
    queryKey: ["/api/cms/crawler/jobs", jobId, "results", page, search, statusFilter, issueFilter, sortBy, sortDir],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "25", sort_by: sortBy, sort_dir: sortDir });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status_code", statusFilter);
      if (issueFilter) params.set("issue_type", issueFilter);
      return crawlerApi(`/api/cms/crawler/jobs/${jobId}/results?${params}`);
    },
  });

  const handleExport = async (format: string) => {
    try {
      const data = await crawlerApi(`/api/cms/crawler/jobs/${jobId}/export?format=${format}`);
      const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], {
        type: format === "csv" ? "text/csv" : "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crawl-${jobId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Eksportfeil", description: err.message, variant: "destructive" });
    }
  };

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortBy === col && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Job header */}
      {job && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-lg">{job.name}</h3>
                <p className="text-sm text-muted-foreground">{job.target_url}</p>
              </div>
              <Badge variant={job.status === "completed" ? "default" : job.status === "running" ? "secondary" : "destructive"}>
                {job.status}
              </Badge>
            </div>

            {/* Summary stats */}
            {job.summary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatBox label="Sider crawlet" value={job.summary.totalPages} />
                <StatBox label="Gjennomsnitt responstid" value={`${Math.round(job.summary.responseTime?.avg || 0)}ms`} />
                <StatBox label="2xx" value={job.summary.statusCodes?.filter((s: any) => s.status_code >= 200 && s.status_code < 300).reduce((a: number, b: any) => a + parseInt(b.count), 0) || 0} color="green" />
                <StatBox label="4xx/5xx" value={job.summary.statusCodes?.filter((s: any) => s.status_code >= 400).reduce((a: number, b: any) => a + parseInt(b.count), 0) || 0} color="red" />
                <StatBox label="Indekserbare" value={job.summary.indexability?.find((i: any) => i.indexable)?.count || 0} />
              </div>
            )}

            {job.status === "running" && (
              <div className="mt-3">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all animate-pulse" style={{ width: `${job.pages_total > 0 ? (job.pages_crawled / job.pages_total) * 100 : 10}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{job.pages_crawled} av ~{job.pages_total} sider crawlet...</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters & export */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Søk URL eller tittel..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            <SelectItem value="200">200 OK</SelectItem>
            <SelectItem value="301">301 Redirect</SelectItem>
            <SelectItem value="302">302 Redirect</SelectItem>
            <SelectItem value="404">404 Not Found</SelectItem>
            <SelectItem value="500">500 Server Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={issueFilter} onValueChange={(v) => { setIssueFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Problem-type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle problemer</SelectItem>
            <SelectItem value="missing_title">Mangler tittel</SelectItem>
            <SelectItem value="missing_meta_description">Mangler meta-beskrivelse</SelectItem>
            <SelectItem value="missing_h1">Mangler H1</SelectItem>
            <SelectItem value="images_missing_alt">Bilder uten alt</SelectItem>
            <SelectItem value="client_error">4xx-feil</SelectItem>
            <SelectItem value="server_error">5xx-feil</SelectItem>
            <SelectItem value="redirect_chain">Redirect-kjede</SelectItem>
            <SelectItem value="thin_content">Tynt innhold</SelectItem>
            <SelectItem value="accessibility">Tilgjengelighet</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
          <Download className="h-4 w-4 mr-1" /> JSON
        </Button>
      </div>

      {/* Results table */}
      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <SortHeader col="url" label="URL" />
                  <SortHeader col="status_code" label="Status" />
                  <SortHeader col="title_length" label="Tittel" />
                  <SortHeader col="word_count" label="Ord" />
                  <SortHeader col="response_time_ms" label="Tid" />
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Problemer</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {resultsData?.results.map((r) => (
                  <>
                    <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}>
                      <td className="px-3 py-2 max-w-[300px]">
                        <div className="flex items-center gap-1">
                          {r.indexable ? <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" /> : <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                          <span className="truncate text-xs">{r.url}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge code={r.status_code} />
                      </td>
                      <td className="px-3 py-2 max-w-[200px]">
                        <span className="truncate block text-xs" title={r.title}>{r.title || "—"}</span>
                        <span className="text-xs text-muted-foreground">{r.title_length || 0} tegn</span>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.word_count || "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={r.response_time_ms > 3000 ? "text-red-600" : r.response_time_ms > 1000 ? "text-yellow-600" : ""}>
                          {r.response_time_ms ? `${r.response_time_ms}ms` : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {r.issues?.slice(0, 3).map((issue, i) => (
                            <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${
                              issue.severity === "error" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                              issue.severity === "warning" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                              "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                            }`}>
                              {issue.type.replace(/_/g, " ")}
                            </span>
                          ))}
                          {r.issues?.length > 3 && <span className="text-xs text-muted-foreground">+{r.issues.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {expandedRow === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </td>
                    </tr>
                    {expandedRow === r.id && (
                      <tr key={`${r.id}-detail`}>
                        <td colSpan={7} className="px-4 py-3 bg-muted/20">
                          <ResultDetail result={r} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {(!resultsData?.results || resultsData.results.length === 0) && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      Ingen resultater funnet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {resultsData?.pagination && resultsData.pagination.totalPages > 1 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Viser {((page - 1) * 25) + 1}–{Math.min(page * 25, resultsData.pagination.total)} av {resultsData.pagination.total}
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Forrige</Button>
                <Button size="sm" variant="outline" disabled={page >= resultsData.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Neste</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Result Detail (expanded row) ─────────────────────────────────────
function ResultDetail({ result: r }: { result: CrawlResultRow }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Generelt</h4>
        <div className="grid grid-cols-2 gap-1">
          <span className="text-muted-foreground">URL:</span>
          <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate">{r.url}</a>
          <span className="text-muted-foreground">Status:</span><span>{r.status_code}</span>
          <span className="text-muted-foreground">Content-Type:</span><span>{r.content_type}</span>
          <span className="text-muted-foreground">Størrelse:</span><span>{r.content_size ? `${(r.content_size / 1024).toFixed(1)} KB` : "—"}</span>
          <span className="text-muted-foreground">Responstid:</span><span>{r.response_time_ms}ms</span>
          <span className="text-muted-foreground">Dybde:</span><span>{r.depth}</span>
          <span className="text-muted-foreground">Indekserbar:</span><span>{r.indexable ? "Ja" : `Nei (${r.indexability_reason})`}</span>
        </div>

        <h4 className="font-semibold text-sm mt-3">SEO</h4>
        <div className="grid grid-cols-2 gap-1">
          <span className="text-muted-foreground">Tittel ({r.title_length} tegn):</span><span className="truncate">{r.title || "—"}</span>
          <span className="text-muted-foreground">Meta desc ({r.meta_description_length} tegn):</span><span className="truncate">{r.meta_description || "—"}</span>
          <span className="text-muted-foreground">Canonical:</span><span className="truncate">{r.canonical_url || "Ikke satt"}</span>
          <span className="text-muted-foreground">H1:</span><span>{r.h1_count}</span>
          <span className="text-muted-foreground">H2:</span><span>{r.h2_count}</span>
          <span className="text-muted-foreground">Ordtelling:</span><span>{r.word_count}</span>
          <span className="text-muted-foreground">Tekst/HTML-ratio:</span><span>{r.text_ratio ? `${(r.text_ratio * 100).toFixed(1)}%` : "—"}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Lenker & bilder</h4>
        <div className="grid grid-cols-2 gap-1">
          <span className="text-muted-foreground">Interne lenker:</span><span>{r.internal_links_count}</span>
          <span className="text-muted-foreground">Eksterne lenker:</span><span>{r.external_links_count}</span>
          <span className="text-muted-foreground">Bilder:</span><span>{r.images_count}</span>
          <span className="text-muted-foreground">Bilder uten alt:</span><span className={r.images_without_alt > 0 ? "text-red-600" : ""}>{r.images_without_alt}</span>
        </div>

        {r.redirect_url && (
          <>
            <h4 className="font-semibold text-sm mt-3">Omdirigering</h4>
            <p>Omdirigert til: <a href={r.redirect_url} className="text-blue-600 hover:underline">{r.redirect_url}</a></p>
            {r.redirect_chain?.length > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">Kjede:</span>
                <ul className="list-disc list-inside ml-2">
                  {r.redirect_chain.map((hop, i) => <li key={i} className="truncate">{hop}</li>)}
                </ul>
              </div>
            )}
          </>
        )}

        {r.og_tags && Object.keys(r.og_tags).length > 0 && (
          <>
            <h4 className="font-semibold text-sm mt-3">Open Graph</h4>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(r.og_tags).map(([k, v]) => (
                <><span key={`${k}-l`} className="text-muted-foreground">{k}:</span><span key={`${k}-v`} className="truncate">{v}</span></>
              ))}
            </div>
          </>
        )}

        {r.structured_data && (
          <>
            <h4 className="font-semibold text-sm mt-3">Strukturerte data</h4>
            <pre className="bg-muted p-2 rounded text-[10px] max-h-32 overflow-auto">
              {JSON.stringify(r.structured_data, null, 2)}
            </pre>
            {r.structured_data_errors?.length > 0 && (
              <div className="text-red-600">
                {r.structured_data_errors.map((e, i) => <p key={i}>⚠ {e}</p>)}
              </div>
            )}
          </>
        )}

        {r.accessibility_issues?.length > 0 && (
          <>
            <h4 className="font-semibold text-sm mt-3">Tilgjengelighet</h4>
            <ul className="list-disc list-inside space-y-0.5">
              {r.accessibility_issues.map((a, i) => <li key={i} className="text-yellow-700 dark:text-yellow-400">{a.message}</li>)}
            </ul>
          </>
        )}

        {r.issues?.length > 0 && (
          <>
            <h4 className="font-semibold text-sm mt-3">Alle problemer</h4>
            <div className="space-y-1 max-h-32 overflow-auto">
              {r.issues.map((issue, i) => (
                <div key={i} className={`px-2 py-1 rounded text-xs ${
                  issue.severity === "error" ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" :
                  issue.severity === "warning" ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300" :
                  "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                }`}>
                  <span className="font-medium">{issue.type}:</span> {issue.message}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Issues Summary ───────────────────────────────────────────────────
function IssuesSummary({ jobId }: { jobId: number }) {
  const { data: issues = [], isLoading } = useQuery<IssueSummary[]>({
    queryKey: ["/api/cms/crawler/jobs", jobId, "issues"],
    queryFn: () => crawlerApi(`/api/cms/crawler/jobs/${jobId}/issues`),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  const infos = issues.filter(i => i.severity === "info");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="py-4 text-center">
            <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-2xl font-bold">{errors.reduce((a, e) => a + e.count, 0)}</p>
            <p className="text-sm text-muted-foreground">Feil</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardContent className="py-4 text-center">
            <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
            <p className="text-2xl font-bold">{warnings.reduce((a, e) => a + e.count, 0)}</p>
            <p className="text-sm text-muted-foreground">Advarsler</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 dark:border-blue-800">
          <CardContent className="py-4 text-center">
            <Eye className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold">{infos.reduce((a, e) => a + e.count, 0)}</p>
            <p className="text-sm text-muted-foreground">Info</p>
          </CardContent>
        </Card>
      </div>

      {[
        { label: "Feil", items: errors, color: "red" },
        { label: "Advarsler", items: warnings, color: "yellow" },
        { label: "Info", items: infos, color: "blue" },
      ].map(({ label, items, color }) => items.length > 0 && (
        <div key={label}>
          <h3 className="font-semibold text-lg mb-2">{label}</h3>
          <div className="space-y-2">
            {items.map((issue, i) => (
              <Card key={i}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 bg-${color}-100 text-${color}-700 dark:bg-${color}-900 dark:text-${color}-300`}>
                        {issue.issue_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-semibold">{issue.count} sider berørt</span>
                    </div>
                  </div>
                  {issue.example_urls.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {issue.example_urls.slice(0, 3).map((url, j) => (
                        <a key={j} href={url} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 hover:underline truncate">
                          {url}
                        </a>
                      ))}
                      {issue.example_urls.length > 3 && <span className="text-xs text-muted-foreground">+{issue.example_urls.length - 3} flere...</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Duplicates Report ────────────────────────────────────────────────
function DuplicatesReport({ jobId }: { jobId: number }) {
  const { data, isLoading } = useQuery<{
    exactDuplicates: Array<{ content_hash: string; urls: string[]; count: string }>;
    duplicateTitles: Array<{ title: string; urls: string[]; count: string }>;
    duplicateDescriptions: Array<{ meta_description: string; urls: string[]; count: string }>;
  }>({
    queryKey: ["/api/cms/crawler/jobs", jobId, "duplicates"],
    queryFn: () => crawlerApi(`/api/cms/crawler/jobs/${jobId}/duplicates`),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <DuplicateSection title="Eksakt duplisert innhold" subtitle="Sider med identisk HTML-innhold (MD5-hash)" items={data?.exactDuplicates || []} labelFn={(d) => `Hash: ${d.content_hash?.substring(0, 12)}...`} />
      <DuplicateSection title="Dupliserte sidestitler" subtitle="Sider med identisk <title>-tag" items={data?.duplicateTitles || []} labelFn={(d) => d.title} />
      <DuplicateSection title="Dupliserte meta-beskrivelser" subtitle="Sider med identisk meta description" items={data?.duplicateDescriptions || []} labelFn={(d) => d.meta_description} />
    </div>
  );
}

function DuplicateSection({ title, subtitle, items, labelFn }: { title: string; subtitle: string; items: any[]; labelFn: (item: any) => string }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            Ingen duplikater funnet!
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{subtitle} — {items.length} grupper funnet</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="border rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm truncate max-w-[70%]">{labelFn(item)}</span>
              <Badge variant="secondary">{parseInt(item.count)} sider</Badge>
            </div>
            <div className="space-y-0.5">
              {item.urls?.map((url: string, j: number) => (
                <a key={j} href={url} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 hover:underline truncate">
                  {url}
                </a>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Redirects Report ─────────────────────────────────────────────────
function RedirectsReport({ jobId }: { jobId: number }) {
  const { data: redirects = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/cms/crawler/jobs", jobId, "redirects"],
    queryFn: () => crawlerApi(`/api/cms/crawler/jobs/${jobId}/redirects`),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  if (redirects.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
          Ingen omdirigeringer funnet
        </CardContent>
      </Card>
    );
  }

  const chains = redirects.filter(r => r.redirect_chain?.length > 2);
  const permanent = redirects.filter(r => r.status_code === 301);
  const temporary = redirects.filter(r => r.status_code === 302 || r.status_code === 307);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatBox label="Totalt omdirigeringer" value={redirects.length} />
        <StatBox label="Redirect-kjeder" value={chains.length} color={chains.length > 0 ? "red" : "green"} />
        <StatBox label="301/302 fordeling" value={`${permanent.length} / ${temporary.length}`} />
      </div>

      {chains.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-lg text-red-700">Redirect-kjeder</CardTitle>
            <CardDescription>Sider med flere enn 2 hopp i redirect-kjeden</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {chains.map((r, i) => (
              <div key={i} className="border rounded p-3">
                <p className="text-sm font-medium truncate">{r.url}</p>
                <div className="mt-2 space-y-1">
                  {r.redirect_chain?.map((hop: string, j: number) => (
                    <div key={j} className="flex items-center text-xs">
                      <span className="text-muted-foreground mr-2">→</span>
                      <span className="truncate">{hop}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Alle omdirigeringer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs">Fra</th>
                  <th className="px-3 py-2 text-left text-xs">Til</th>
                  <th className="px-3 py-2 text-left text-xs">Status</th>
                  <th className="px-3 py-2 text-left text-xs">Hopp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {redirects.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-3 py-2 truncate max-w-[250px] text-xs">{r.url}</td>
                    <td className="px-3 py-2 truncate max-w-[250px] text-xs">{r.redirect_url}</td>
                    <td className="px-3 py-2"><StatusBadge code={r.status_code} /></td>
                    <td className="px-3 py-2 text-xs">{r.redirect_chain?.length || 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Compare View ─────────────────────────────────────────────────────
function CompareView({ jobId, compareJobId, onSelectCompare }: { jobId: number; compareJobId: number | null; onSelectCompare: (id: number) => void }) {
  const { data: jobs = [] } = useQuery<CrawlJob[]>({
    queryKey: ["/api/cms/crawler/jobs"],
    queryFn: () => crawlerApi("/api/cms/crawler/jobs"),
  });

  const otherJobs = jobs.filter(j => j.id !== jobId && j.status === "completed");

  const { data: comparison, isLoading } = useQuery<any>({
    queryKey: ["/api/cms/crawler/jobs", jobId, "compare", compareJobId],
    queryFn: () => crawlerApi(`/api/cms/crawler/jobs/${jobId}/compare/${compareJobId}`),
    enabled: !!compareJobId,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sammenlign crawl-resultater</CardTitle>
          <CardDescription>Sammenlign to crawl-jobber for å se hva som har endret seg</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Crawl A (nåværende)</Label>
              <Input readOnly value={`Jobb #${jobId}`} />
            </div>
            <div>
              <Label>Crawl B (sammenlign med)</Label>
              <Select value={compareJobId?.toString() || ""} onValueChange={(v) => onSelectCompare(parseInt(v))}>
                <SelectTrigger><SelectValue placeholder="Velg crawl..." /></SelectTrigger>
                <SelectContent>
                  {otherJobs.map(j => (
                    <SelectItem key={j.id} value={j.id.toString()}>#{j.id} — {j.name} ({new Date(j.created_at).toLocaleDateString("nb-NO")})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>}

      {comparison && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatBox label="Crawl A sider" value={comparison.summary.crawl1Pages} />
            <StatBox label="Crawl B sider" value={comparison.summary.crawl2Pages} />
            <StatBox label="Nye sider" value={comparison.summary.added} color="green" />
            <StatBox label="Fjernede sider" value={comparison.summary.removed} color="red" />
            <StatBox label="Endrede sider" value={comparison.summary.changed} color="yellow" />
          </div>

          {comparison.added.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg text-green-700">Nye sider ({comparison.summary.added})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-60 overflow-auto">
                  {comparison.added.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 hover:underline truncate">{url}</a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {comparison.removed.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg text-red-700">Fjernede sider ({comparison.summary.removed})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-60 overflow-auto">
                  {comparison.removed.map((url: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground truncate">{url}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {comparison.changed.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg text-yellow-700">Endrede sider ({comparison.summary.changed})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-auto">
                  {comparison.changed.map((ch: any, i: number) => (
                    <div key={i} className="border rounded p-2">
                      <a href={ch.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline truncate block">{ch.url}</a>
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(ch.changes).map(([field, val]: [string, any]) => (
                          <div key={field} className="flex items-center text-xs gap-2">
                            <span className="text-muted-foreground font-medium min-w-[120px]">{field}:</span>
                            <span className="text-red-600 line-through">{String(val.old || "—")}</span>
                            <span>→</span>
                            <span className="text-green-600">{String(val.new || "—")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Schedule Manager ─────────────────────────────────────────────────
function ScheduleManager() {
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: "", target_url: "", cron_expression: "0 3 * * 1",
    max_pages: 500, max_depth: 10,
  });

  const { data: schedules = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/cms/crawler/schedules"],
    queryFn: () => crawlerApi("/api/cms/crawler/schedules"),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => crawlerApi("/api/cms/crawler/schedules", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { refetch(); setShowNew(false); toast({ title: "Opprettet", description: "Tidsplan opprettet." }); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      crawlerApi(`/api/cms/crawler/schedules/${id}`, { method: "PUT", body: JSON.stringify({ is_active: active }) }),
    onSuccess: () => refetch(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => crawlerApi(`/api/cms/crawler/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => { refetch(); toast({ title: "Slettet" }); },
  });

  const cronLabels: Record<string, string> = {
    "0 3 * * 1": "Hver mandag kl. 03:00",
    "0 3 * * *": "Hver dag kl. 03:00",
    "0 3 1 * *": "1. hver måned kl. 03:00",
    "0 3 * * 0": "Hver søndag kl. 03:00",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Planlagte crawl-jobber</h3>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-1" /> Ny tidsplan
        </Button>
      </div>

      {showNew && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Navn</Label>
                <Input value={newSchedule.name} onChange={(e) => setNewSchedule(p => ({ ...p, name: e.target.value }))} placeholder="Ukentlig crawl" />
              </div>
              <div>
                <Label>Mål-URL</Label>
                <Input value={newSchedule.target_url} onChange={(e) => setNewSchedule(p => ({ ...p, target_url: e.target.value }))} placeholder="https://example.com" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Frekvens</Label>
                <Select value={newSchedule.cron_expression} onValueChange={(v) => setNewSchedule(p => ({ ...p, cron_expression: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0 3 * * *">Daglig</SelectItem>
                    <SelectItem value="0 3 * * 1">Ukentlig (mandag)</SelectItem>
                    <SelectItem value="0 3 * * 0">Ukentlig (søndag)</SelectItem>
                    <SelectItem value="0 3 1 * *">Månedlig</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Maks sider</Label>
                <Input type="number" value={newSchedule.max_pages} onChange={(e) => setNewSchedule(p => ({ ...p, max_pages: parseInt(e.target.value) }))} />
              </div>
              <div>
                <Label>Maks dybde</Label>
                <Input type="number" value={newSchedule.max_depth} onChange={(e) => setNewSchedule(p => ({ ...p, max_depth: parseInt(e.target.value) }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createMutation.mutate(newSchedule)} disabled={!newSchedule.target_url}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Opprett
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Avbryt</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2" />
            Ingen planlagte crawl-jobber
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{s.name}</h4>
                      <Badge variant={s.is_active ? "default" : "secondary"}>
                        {s.is_active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{s.target_url}</p>
                    <p className="text-xs text-muted-foreground">
                      {cronLabels[s.cron_expression] || s.cron_expression} · {s.max_pages} sider · Dybde {s.max_depth}
                    </p>
                    {s.last_run_at && <p className="text-xs text-muted-foreground">Siste kjøring: {new Date(s.last_run_at).toLocaleString("nb-NO")}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: s.id, active: !s.is_active })}>
                      {s.is_active ? "Deaktiver" : "Aktiver"}
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => deleteMutation.mutate(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────

function StatusBadge({ code }: { code: number }) {
  if (!code) return <span className="text-xs text-muted-foreground">—</span>;
  const color = code >= 200 && code < 300 ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
    : code >= 300 && code < 400 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
    : code >= 400 && code < 500 ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
    : code >= 500 ? "bg-red-200 text-red-800 dark:bg-red-950 dark:text-red-200"
    : "bg-gray-100 text-gray-700";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>{code}</span>;
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const colorClasses = color === "green" ? "text-green-600" : color === "red" ? "text-red-600" : color === "yellow" ? "text-yellow-600" : "";
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className={`text-xl font-bold ${colorClasses}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
