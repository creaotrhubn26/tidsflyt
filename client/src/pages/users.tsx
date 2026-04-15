import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Users,
  UserPlus, Upload,
  Search,
  MoreHorizontal,
  Mail,
  CheckCircle,
  XCircle,
  Shield,
  User,
  Clock,
  Loader2,
  AlertCircle,
  Send,
  CalendarCheck,
  Hourglass,
  Link as LinkIcon,
  Copy,
  Trash2,
  Power,
  Sparkles,
  Briefcase,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRolePreview } from "@/hooks/use-role-preview";
import { canManageRole, getRoleLabel, normalizeRole } from "@shared/roles";

const roleColors = {
  hovedadmin: "bg-destructive/10 text-destructive border-destructive/20",
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  vendor_admin: "bg-destructive/10 text-destructive border-destructive/20",
  tiltaksleder: "bg-primary/10 text-primary border-primary/20",
  teamleder: "bg-primary/10 text-primary border-primary/20",
  case_manager: "bg-primary/10 text-primary border-primary/20",
  miljoarbeider: "bg-[#1F6B73]/10 text-[#1F6B73] border-[#1F6B73]/20",
  member: "bg-muted text-muted-foreground border-muted",
  user: "bg-muted text-muted-foreground border-muted",
};

const roleIcons = {
  hovedadmin: Shield,
  admin: Shield,
  vendor_admin: Shield,
  tiltaksleder: Users,
  teamleder: Users,
  case_manager: Users,
  miljoarbeider: User,
  member: User,
  user: User,
};

const roleFilterValues = [
  "hovedadmin",
  "admin",
  "vendor_admin",
  "tiltaksleder",
  "teamleder",
  "case_manager",
  "miljoarbeider",
  "member",
  "user",
] as const;

const inviteRoleOptions = [
  "tiltaksleder",
  "teamleder",
  "case_manager",
  "miljoarbeider",
  "member",
] as const;

interface CompanyUser {
  id: number;
  company_id: number;
  user_email: string;
  role: string;
  approved: boolean;
  created_at: string;
  updated_at?: string;
  cases?: any[];
}

export default function UsersPage() {
  const [location] = useLocation();
  const isInvitesRoute = location === "/invites";
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState(isInvitesRoute ? "pending" : "all");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [newLinkRole, setNewLinkRole] = useState<string>("miljoarbeider");
  const [newLinkDomain, setNewLinkDomain] = useState("");
  const [newLinkExpiry, setNewLinkExpiry] = useState<string>("30"); // dager
  const [newLinkMaxUses, setNewLinkMaxUses] = useState<string>("");
  const [newLinkNote, setNewLinkNote] = useState("");
  const [newLinkSakIds, setNewLinkSakIds] = useState<Set<string>>(new Set());
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("miljoarbeider");
  const [inviteInstitution, setInviteInstitution] = useState("");
  const [inviteCaseTitle, setInviteCaseTitle] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "recent" | "hours">("recent");
  const { toast } = useToast();
  const { user } = useAuth();
  const { effectiveRole } = useRolePreview();

  useEffect(() => {
    setTab(isInvitesRoute ? "pending" : "all");
  }, [isInvitesRoute]);

  // Resolve current user's company_id dynamically
  const { data: myCompany } = useQuery<{ companyId: number | null }>({
    queryKey: ['/api/me/company'],
  });
  const companyId = myCompany?.companyId ?? 1;

  const { data: companyUsers = [], isLoading } = useQuery<CompanyUser[]>({
    queryKey: ['/api/company/users', companyId],
    enabled: companyId != null,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { user_email: string; role: string; institution?: string; case_title?: string }) => {
      return apiRequest('POST', '/api/company/users', { company_id: companyId, ...data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/users'] });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("miljoarbeider");
      setInviteInstitution("");
      setInviteCaseTitle("");
      toast({ title: "Invitasjon sendt", description: "Brukeren har blitt lagt til og e-post sendt." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error.message, variant: "destructive" });
    },
  });

  // ── INVITE-LINKS ────────────────────────────────────────────────────────

  const { data: inviteLinks = [] } = useQuery<any[]>({
    queryKey: ["/api/company/invite-links"],
    enabled: linkDialogOpen,
  });

  // Saker for pre-tildeling
  const { data: availableSaker = [] } = useQuery<any[]>({
    queryKey: ["/api/saker"],
    enabled: linkDialogOpen,
  });

  const createLink = useMutation({
    mutationFn: () => apiRequest("POST", "/api/company/invite-links", {
      role: newLinkRole,
      domain: newLinkDomain.trim() || null,
      expiresInDays: newLinkExpiry ? Number(newLinkExpiry) : null,
      maxUses: newLinkMaxUses ? Number(newLinkMaxUses) : null,
      note: newLinkNote || null,
      sakIds: Array.from(newLinkSakIds),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/invite-links"] });
      setNewLinkDomain(""); setNewLinkNote(""); setNewLinkMaxUses("");
      setNewLinkSakIds(new Set());
      toast({ title: "Lenke opprettet" });
    },
    onError: (e: any) => toast({ title: "Feil", description: e.message, variant: "destructive" }),
  });

  const toggleLink = useMutation({
    mutationFn: (data: { id: string; active: boolean }) =>
      apiRequest("PATCH", `/api/company/invite-links/${data.id}`, { active: data.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/company/invite-links"] }),
  });

  const deleteLink = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/company/invite-links/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/invite-links"] });
      toast({ title: "Lenke slettet" });
    },
  });

  const buildLinkUrl = (token: string) => `${window.location.origin}/invite/${token}`;
  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildLinkUrl(token));
      toast({ title: "Lenke kopiert" });
    } catch {
      toast({ title: "Kunne ikke kopiere", variant: "destructive" });
    }
  };

  const bulkMutation = useMutation({
    mutationFn: async (users: { user_email: string; role: string }[]) => {
      const res = await apiRequest('POST', '/api/company/users/bulk', { company_id: companyId, users });
      return res.json();
    },
    onSuccess: (data: any) => {
      setBulkResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/company/users'] });
      toast({
        title: "Import fullført",
        description: `${data.created} opprettet · ${data.skipped?.length || 0} hoppet over · ${data.failed?.length || 0} feilet`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, approved }: { id: number; approved: boolean }) => {
      return apiRequest('PATCH', `/api/company/users/${id}`, { approved });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/users'] });
      toast({ title: "Oppdatert", description: "Brukerstatus har blitt endret." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/company/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/users'] });
      toast({ title: "Fjernet", description: "Brukeren har blitt fjernet." });
    },
  });

  const users = companyUsers.map(u => ({
    id: String(u.id),
    name: u.user_email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    email: u.user_email,
    role: normalizeRole(u.role),
    approved: u.approved,
    lastActive: u.updated_at || u.created_at,
    hoursThisWeek: 0,
  }));

  const actorRole = effectiveRole;
  const allowedInviteRoles = inviteRoleOptions.filter((role) => canManageRole(actorRole, role));

  useEffect(() => {
    if (allowedInviteRoles.length === 0) {
      return;
    }

    if (!allowedInviteRoles.includes(inviteRole as any)) {
      setInviteRole(allowedInviteRoles[0]);
    }
  }, [allowedInviteRoles, inviteRole]);

  const filteredUsers = users.filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = tab === "all" || 
                       (tab === "pending" && !user.approved) ||
                       (tab === "active" && user.approved);
    const matchesRole = filterRole === "all" || user.role === filterRole;
    return matchesSearch && matchesTab && matchesRole;
  }).sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "recent") return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    if (sortBy === "hours") return (b.hoursThisWeek || 0) - (a.hoursThisWeek || 0);
    return 0;
  });

  const pendingCount = users.filter(u => !u.approved).length;

  // Team statistics
  const teamStats = useMemo(() => {
    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.approved).length,
      pendingApprovals: users.filter(u => !u.approved).length,
      totalHours: users.reduce((sum, u) => sum + (u.hoursThisWeek || 0), 0),
      daysSinceLastActivity: 3, // Mock data
      averageHoursPerUser: users.length > 0 ? Math.round(users.reduce((sum, u) => sum + (u.hoursThisWeek || 0), 0) / users.length * 10) / 10 : 0,
    };
    return stats;
  }, [users]);

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" data-testid="users-title">
              {isInvitesRoute ? "Invitasjoner" : "Brukere"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isInvitesRoute
                ? "Administrer utsendte og ventende invitasjoner"
                : "Administrer brukere og tilganger"}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
          <Button variant="outline" size="default" onClick={() => setLinkDialogOpen(true)} className="gap-2">
            <LinkIcon className="h-4 w-4" />
            Invitasjonslenker
          </Button>
          <Button variant="outline" size="default" onClick={() => { setBulkDialogOpen(true); setBulkResult(null); }} className="gap-2">
            <Upload className="h-4 w-4" />
            Bulk-import
          </Button>
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="invite-user-button" className={isInvitesRoute ? "gap-2 px-6 shadow-md" : ""}>
                <UserPlus className="h-4 w-4" />
                Inviter bruker
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20">
                    <Send className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg">Inviter ny bruker</DialogTitle>
                    <DialogDescription className="mt-0">
                      Brukeren vil bli lagt til som ventende og kan godkjennes.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">E-postadresse</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="navn@example.com" 
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="pl-9"
                      data-testid="invite-email-input" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role" className="text-sm font-medium">Rolle</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger data-testid="invite-role-select">
                      <SelectValue placeholder="Velg rolle" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedInviteRoles.length === 0 ? (
                        <SelectItem value="miljoarbeider">Miljøarbeider</SelectItem>
                      ) : (
                        allowedInviteRoles.map((role) => (
                          <SelectItem key={role} value={role}>{getRoleLabel(role)}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Rollen kan endres etter godkjenning.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="institution" className="text-sm font-medium">Institusjon / Oppdragsgiver</Label>
                  <Input
                    id="institution"
                    placeholder="F.eks. Oslo kommune, Barnevernstjenesten"
                    value={inviteInstitution}
                    onChange={(e) => setInviteInstitution(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Skole, kommune eller annen oppdragsgiver brukeren jobber for.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="caseTitle" className="text-sm font-medium">Sak / Tiltak</Label>
                  <Input
                    id="caseTitle"
                    placeholder="F.eks. Oppfølging elev A, Miljøarbeid gruppe B"
                    value={inviteCaseTitle}
                    onChange={(e) => setInviteCaseTitle(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Tilordne en sak ved invitasjon (valgfritt).</p>
                </div>
              </div>
              <DialogFooter className="mt-2">
                <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                  Avbryt
                </Button>
                <Button 
                  onClick={() => inviteMutation.mutate({ 
                    user_email: inviteEmail, 
                    role: inviteRole,
                    institution: inviteInstitution || undefined,
                    case_title: inviteCaseTitle || undefined,
                  })} 
                  disabled={!inviteEmail || inviteMutation.isPending || allowedInviteRoles.length === 0}
                  data-testid="send-invite-button"
                  className="gap-2"
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send invitasjon
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Bulk import dialog */}
        <Dialog open={bulkDialogOpen} onOpenChange={(o) => { setBulkDialogOpen(o); if (!o) { setBulkResult(null); setBulkCsvText(""); } }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Bulk-importer brukere
              </DialogTitle>
              <DialogDescription>
                Lim inn hva som helst med e-poster — CSV, Outlook-distribusjonsliste, møteinvitasjon eller bare en blanding. Vi finner adressene automatisk.
              </DialogDescription>
            </DialogHeader>

            {!bulkResult ? (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3 text-primary" /> Smart-paste støtter:</p>
                  <ul className="space-y-0.5 ml-4 list-disc">
                    <li>CSV: <code>email,role</code> per linje</li>
                    <li>Outlook-deltakerliste, e-postsignaturer, møteinvitasjoner</li>
                    <li>En enkelt e-post på hver linje</li>
                  </ul>
                  <p className="mt-1.5 italic">Standardrolle: miljøarbeider (bytt med <code>tiltaksleder</code> i samme linje for å overstyre).</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer rounded-md border px-3 py-1.5 hover:bg-accent">
                    <input
                      type="file"
                      accept=".csv,text/csv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => setBulkCsvText(String(ev.target?.result ?? ""));
                        reader.readAsText(file);
                      }}
                    />
                    Last opp CSV-fil
                  </label>
                  <span className="text-xs text-muted-foreground">eller lim inn under</span>
                </div>
                <Textarea
                  value={bulkCsvText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBulkCsvText(e.target.value)}
                  placeholder="Lim inn CSV her…"
                  rows={10}
                  className="font-mono text-sm"
                />
                <div className="flex justify-between items-center">
                  <p className="text-xs text-muted-foreground">
                    {parseCsvForInviteCount(bulkCsvText)} brukere klar til import
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Avbryt</Button>
                    <Button
                      disabled={!bulkCsvText.trim() || bulkMutation.isPending}
                      onClick={() => {
                        const users = parseCsvForInvite(bulkCsvText);
                        if (users.length === 0) {
                          toast({ title: "Ingen gyldige rader", variant: "destructive" });
                          return;
                        }
                        bulkMutation.mutate(users);
                      }}
                    >
                      {bulkMutation.isPending ? "Importerer…" : `Importer ${parseCsvForInviteCount(bulkCsvText)}`}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border bg-emerald-500/10 p-3">
                    <p className="text-2xl font-bold text-emerald-600">{bulkResult.created}</p>
                    <p className="text-xs text-muted-foreground">Opprettet</p>
                  </div>
                  <div className="rounded-lg border bg-amber-500/10 p-3">
                    <p className="text-2xl font-bold text-amber-600">{bulkResult.skipped?.length ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Hoppet over</p>
                  </div>
                  <div className="rounded-lg border bg-destructive/10 p-3">
                    <p className="text-2xl font-bold text-destructive">{bulkResult.failed?.length ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Feilet</p>
                  </div>
                </div>
                {(bulkResult.skipped?.length > 0 || bulkResult.failed?.length > 0) && (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto text-xs">
                    {bulkResult.skipped?.map((s: any, i: number) => (
                      <div key={`s${i}`} className="flex justify-between rounded-md bg-amber-500/5 px-2 py-1">
                        <span className="font-mono">{s.email}</span>
                        <span className="text-amber-700">{s.reason}</span>
                      </div>
                    ))}
                    {bulkResult.failed?.map((f: any, i: number) => (
                      <div key={`f${i}`} className="flex justify-between rounded-md bg-destructive/5 px-2 py-1">
                        <span className="font-mono">{f.email}</span>
                        <span className="text-destructive">{f.error}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => setBulkDialogOpen(false)}>Lukk</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Invite-link dialog */}
        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20">
                  <LinkIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-lg">Invitasjonslenker</DialogTitle>
                  <DialogDescription className="mt-0">
                    Generer én delbar URL per rolle. Send i Slack, Teams eller e-post — mottakerne registrerer seg selv.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Existing links */}
            {inviteLinks.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground">Aktive lenker</p>
                {inviteLinks.map((link: any) => {
                  const url = buildLinkUrl(link.token);
                  const expired = link.expiresAt && new Date(link.expiresAt) < new Date();
                  const usedUp = link.maxUses && link.usedCount >= link.maxUses;
                  const isLive = link.active && !expired && !usedUp;
                  const preassignedSakIds: string[] = Array.isArray(link.sakIds) ? link.sakIds : [];
                  const preassignedSaker = preassignedSakIds.length > 0
                    ? (availableSaker as any[]).filter((s: any) => preassignedSakIds.includes(s.id))
                    : [];
                  return (
                    <div key={link.id} className={`rounded-md border p-3 space-y-1.5 ${isLive ? "" : "opacity-60 bg-muted/20"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] capitalize">{link.role}</Badge>
                          {link.domain && <Badge variant="outline" className="text-[10px]">@{link.domain}</Badge>}
                          {preassignedSakIds.length > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1 border-primary/40 text-primary"
                              title={preassignedSaker.map((s: any) => `${s.saksnummer} ${s.tittel}`).join("\n") || `${preassignedSakIds.length} sak(er)`}
                            >
                              <Briefcase className="h-2.5 w-2.5" />
                              {preassignedSakIds.length} sak{preassignedSakIds.length === 1 ? "" : "er"}
                            </Badge>
                          )}
                          {!isLive && <Badge variant="destructive" className="text-[10px]">{expired ? "Utløpt" : usedUp ? "Brukt opp" : "Deaktivert"}</Badge>}
                          <span className="text-[11px] text-muted-foreground">
                            {link.usedCount ?? 0}{link.maxUses ? ` / ${link.maxUses}` : ""} brukt
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {isLive && (
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => copyLink(link.token)}>
                              <Copy className="h-3.5 w-3.5 mr-1" /> Kopier
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => toggleLink.mutate({ id: link.id, active: !link.active })}>
                            <Power className={`h-3.5 w-3.5 ${link.active ? "text-emerald-600" : "text-muted-foreground"}`} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => {
                            if (window.confirm("Slett invitasjonslenken?")) deleteLink.mutate(link.id);
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {isLive && (
                        <div className="flex items-center gap-2 text-xs">
                          <code className="flex-1 truncate font-mono bg-muted/50 px-2 py-1 rounded">{url}</code>
                        </div>
                      )}
                      {link.note && <p className="text-[11px] text-muted-foreground">{link.note}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* New link form */}
            <div className="rounded-md border bg-muted/20 p-4 space-y-3">
              <p className="text-sm font-medium">Ny lenke</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Rolle</Label>
                  <select
                    value={newLinkRole}
                    onChange={(e) => setNewLinkRole(e.target.value)}
                    className="mt-1 w-full text-sm rounded-md border bg-background px-3 py-2"
                  >
                    <option value="miljoarbeider">Miljøarbeider</option>
                    <option value="tiltaksleder">Tiltaksleder</option>
                    <option value="teamleder">Teamleder</option>
                    <option value="vendor_admin">Bedriftsadmin</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">E-post-domene (valgfritt)</Label>
                  <Input
                    placeholder="bufetat.no"
                    value={newLinkDomain}
                    onChange={(e) => setNewLinkDomain(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Utløper (dager)</Label>
                  <Input
                    type="number"
                    placeholder="30"
                    value={newLinkExpiry}
                    onChange={(e) => setNewLinkExpiry(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Maks antall registreringer</Label>
                  <Input
                    type="number"
                    placeholder="ubegrenset"
                    value={newLinkMaxUses}
                    onChange={(e) => setNewLinkMaxUses(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notat (kun synlig for admin)</Label>
                <Input
                  placeholder="F.eks. Teams-invitasjon Q2 2026"
                  value={newLinkNote}
                  onChange={(e) => setNewLinkNote(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Pre-tildel saker */}
              {(availableSaker as any[]).length > 0 && (
                <div>
                  <Label className="text-xs">Pre-tildel saker (valgfritt)</Label>
                  <p className="text-[11px] text-muted-foreground">Nye brukere som klikker lenken blir automatisk tildelt disse sakene.</p>
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-md border bg-background p-2 space-y-1">
                    {(availableSaker as any[]).filter((s: any) => s.status === "aktiv").map((s: any) => {
                      const checked = newLinkSakIds.has(s.id);
                      return (
                        <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 px-1.5 py-1 rounded">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setNewLinkSakIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(s.id); else next.delete(s.id);
                              return next;
                            })}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          <span className="font-mono text-[10px] text-muted-foreground">{s.saksnummer}</span>
                          <span className="truncate">{s.tittel}</span>
                        </label>
                      );
                    })}
                  </div>
                  {newLinkSakIds.size > 0 && (
                    <p className="text-[11px] text-primary mt-1">{newLinkSakIds.size} sak(er) valgt</p>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => createLink.mutate()} disabled={createLink.isPending}>
                  {createLink.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LinkIcon className="h-4 w-4 mr-2" />}
                  Generer lenke
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Invite Statistics Cards */}
        {isInvitesRoute && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-orange-50 to-orange-100/30 border-orange-200/60 dark:from-orange-950/40 dark:to-orange-900/20 dark:border-orange-800/40">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Venter godkjenning</p>
                    <p className="text-3xl font-bold mt-1">{users.filter(u => !u.approved).length}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/10 dark:bg-orange-500/15">
                    <Hourglass className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-50 to-green-100/30 border-green-200/60 dark:from-green-950/40 dark:to-green-900/20 dark:border-green-800/40">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Godkjente</p>
                    <p className="text-3xl font-bold mt-1">{users.filter(u => u.approved).length}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-500/10 dark:bg-green-500/15">
                    <CalendarCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100/30 border-blue-200/60 dark:from-blue-950/40 dark:to-blue-900/20 dark:border-blue-800/40">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Totalt inviterte</p>
                    <p className="text-3xl font-bold mt-1">{users.length}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10 dark:bg-blue-500/15">
                    <Send className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Team Statistics Cards */}
        {!isInvitesRoute && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100/30 border-blue-200/60 dark:from-blue-950/40 dark:to-blue-900/20 dark:border-blue-800/40">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Totalt brukere</p>
                    <p className="text-3xl font-bold mt-1">{teamStats.totalUsers}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10 dark:bg-blue-500/15">
                    <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100/30 border-green-200/60 dark:from-green-950/40 dark:to-green-900/20 dark:border-green-800/40">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Aktive bruker</p>
                    <p className="text-3xl font-bold mt-1">{teamStats.activeUsers}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-500/10 dark:bg-green-500/15">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100/30 border-orange-200/60 dark:from-orange-950/40 dark:to-orange-900/20 dark:border-orange-800/40">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ventende</p>
                    <p className="text-3xl font-bold mt-1">{teamStats.pendingApprovals}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/10 dark:bg-orange-500/15">
                    <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100/30 border-purple-200/60 dark:from-purple-950/40 dark:to-purple-900/20 dark:border-purple-800/40">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Snitt timer/uke</p>
                    <p className="text-3xl font-bold mt-1">{teamStats.averageHoursPerUser}t</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-500/10 dark:bg-purple-500/15">
                    <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {isInvitesRoute ? (
          <div className="space-y-6">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Søk etter e-post eller navn..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="search-users"
              />
            </div>

            {/* Pending section */}
            {(() => {
              const pending = users.filter(u => !u.approved && (
                searchQuery === "" ||
                u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email.toLowerCase().includes(searchQuery.toLowerCase())
              ));
              const approved = users.filter(u => u.approved && (
                searchQuery === "" ||
                u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email.toLowerCase().includes(searchQuery.toLowerCase())
              ));

              if (users.length === 0) return (
                <div className="flex flex-col items-center justify-center py-20 px-4">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-150" />
                    <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-indigo-500/20 border border-primary/20 shadow-lg">
                      <Send className="h-9 w-9 text-primary" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-semibold mb-3">Ingen invitasjoner ennå</h3>
                  <p className="text-muted-foreground text-center max-w-sm mb-8 leading-relaxed">
                    Send din første invitasjon for å gi teammedlemmer tilgang til portalen.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mb-8">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-medium text-green-700 dark:text-green-400">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Godkjenning med ett klikk
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-700 dark:text-blue-400">
                      <Shield className="h-3.5 w-3.5" />
                      Rollebasert tilgang
                    </div>
                  </div>
                  <Button onClick={() => setInviteDialogOpen(true)} size="lg" className="gap-2 px-8 shadow-md">
                    <UserPlus className="h-5 w-5" />
                    Inviter første bruker
                  </Button>
                </div>
              );

              return (
                <>
                  {pending.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Hourglass className="h-4 w-4 text-orange-500" />
                        <h2 className="text-sm font-semibold text-orange-600 dark:text-orange-400">Venter godkjenning</h2>
                        <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 border-0">{pending.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {pending.map((user) => {
                          const RoleIcon = roleIcons[user.role as keyof typeof roleIcons] ?? User;
                          const roleColor = roleColors[user.role as keyof typeof roleColors] ?? roleColors.member;
                          return (
                            <div
                              key={user.id}
                              className="flex items-center gap-4 p-4 rounded-xl border border-orange-200/60 dark:border-orange-800/30 bg-orange-50/40 dark:bg-orange-950/10"
                              data-testid={`user-row-${user.id}`}
                            >
                              <Avatar className="h-10 w-10 flex-shrink-0">
                                <AvatarFallback className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 font-semibold">
                                  {user.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{user.email}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge variant="outline" className={cn("text-xs", roleColor)}>
                                    <RoleIcon className="h-3 w-3 mr-1" />
                                    {getRoleLabel(user.role)}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {format(new Date(user.lastActive), "d. MMM yyyy", { locale: nb })}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive hover:bg-destructive/10 border-destructive/20"
                                  onClick={() => deleteMutation.mutate(parseInt(user.id))}
                                  disabled={deleteMutation.isPending}
                                  data-testid={`reject-user-${user.id}`}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Avvis
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                  onClick={() => approveMutation.mutate({ id: parseInt(user.id), approved: true })}
                                  disabled={approveMutation.isPending}
                                  data-testid={`approve-user-${user.id}`}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Godkjenn
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {approved.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <CalendarCheck className="h-4 w-4 text-green-500" />
                        <h2 className="text-sm font-semibold text-green-600 dark:text-green-400">Godkjente</h2>
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-0">{approved.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {approved.map((user) => {
                          const RoleIcon = roleIcons[user.role as keyof typeof roleIcons] ?? User;
                          const roleColor = roleColors[user.role as keyof typeof roleColors] ?? roleColors.member;
                          return (
                            <div
                              key={user.id}
                              className="flex items-center gap-4 p-4 rounded-xl border bg-card"
                              data-testid={`user-row-${user.id}`}
                            >
                              <Avatar className="h-10 w-10 flex-shrink-0">
                                <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                                  {user.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{user.email}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge variant="outline" className={cn("text-xs", roleColor)}>
                                    <RoleIcon className="h-3 w-3 mr-1" />
                                    {getRoleLabel(user.role)}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3 text-green-500" />
                                    Godkjent {format(new Date(user.lastActive), "d. MMM", { locale: nb })}
                                  </span>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => deleteMutation.mutate(parseInt(user.id))}
                                disabled={deleteMutation.isPending}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {pending.length === 0 && approved.length === 0 && searchQuery && (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-muted/60 border border-border mb-4">
                        <Search className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Ingen treff for "{searchQuery}"</p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="all" data-testid="tab-all">
                    Alle ({users.length})
                  </TabsTrigger>
                  <TabsTrigger value="active" data-testid="tab-active">
                    Aktive ({users.filter(u => u.approved).length})
                  </TabsTrigger>
                  <TabsTrigger value="pending" data-testid="tab-pending">
                    Venter
                    {pendingCount > 0 && (
                      <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                        {pendingCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-wrap gap-2">
                <Select value={filterRole} onValueChange={setFilterRole}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Rolle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle roller</SelectItem>
                    {roleFilterValues.map((role) => (
                      <SelectItem key={role} value={role}>{getRoleLabel(role)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Sortering" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Sist aktiv</SelectItem>
                    <SelectItem value="name">Navn</SelectItem>
                    <SelectItem value="hours">Timer denne uken</SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Søk etter bruker..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="search-users"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-2">
              {filteredUsers.length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Ingen brukere funnet</p>
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const RoleIcon = roleIcons[user.role as keyof typeof roleIcons] ?? User;
                  const roleColor = roleColors[user.role as keyof typeof roleColors] ?? roleColors.member;
                  
                  return (
                    <div
                      key={user.id}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-lg border",
                        !user.approved && "bg-warning/5 border-warning/20"
                      )}
                      data-testid={`user-row-${user.id}`}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {user.name.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{user.name}</p>
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs", roleColor)}
                          >
                            <RoleIcon className="h-3 w-3 mr-1" />
                            {getRoleLabel(user.role)}
                          </Badge>
                          {!user.approved && (
                            <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">
                              Venter godkjenning
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                      </div>

                      <div className="hidden sm:flex items-center gap-6 text-sm">
                        {user.approved && (
                          <>
                            <div className="text-right">
                              <p className="text-muted-foreground">Denne uken</p>
                              <p className="font-mono font-medium">{user.hoursThisWeek}t</p>
                            </div>
                            <div className="text-right">
                              <p className="text-muted-foreground">Sist aktiv</p>
                              <p className="font-medium">
                                {user.lastActive 
                                  ? format(new Date(user.lastActive), "d. MMM", { locale: nb })
                                  : "-"
                                }
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      {!user.approved ? (
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-destructive" 
                            onClick={() => deleteMutation.mutate(parseInt(user.id))}
                            disabled={deleteMutation.isPending}
                            data-testid={`reject-user-${user.id}`}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Avvis
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={() => approveMutation.mutate({ id: parseInt(user.id), approved: true })}
                            disabled={approveMutation.isPending}
                            data-testid={`approve-user-${user.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Godkjenn
                          </Button>
                        </div>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`user-menu-${user.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>Se profil</DropdownMenuItem>
                            <DropdownMenuItem>Endre rolle</DropdownMenuItem>
                            <DropdownMenuItem>Se timelister</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(parseInt(user.id))}
                            >
                              Fjern bruker
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
        )}
      </div>
    </PortalLayout>
  );
}

// ─── CSV helpers ───────────────────────────────────────────────────────────

function parseCsvForInvite(text: string): { user_email: string; role: string }[] {
  // Smart-paste-modus: trekk ut alle e-poster fra tekst (Outlook, møteinvitasjon,
  // CSV, etterlater rolle som "miljoarbeider" som standard når den ikke kan parses).
  const emailGlobalRx = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  const first = (lines[0] ?? "").toLowerCase();
  const hasHeader = first.includes("email") || first.includes("e-post");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  // CSV-modus: split per linje for rolle-detektering
  const out = new Map<string, { user_email: string; role: string }>();
  const VALID_ROLES = ["miljoarbeider", "tiltaksleder", "teamleder", "vendor_admin", "admin", "super_admin"];

  for (const line of dataLines) {
    const cols = line.split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, ""));
    const emails = (line.match(emailGlobalRx) ?? []).map(e => e.toLowerCase());
    if (emails.length === 0) continue;
    const role = cols.find(c => VALID_ROLES.includes(c.toLowerCase())) || "miljoarbeider";
    for (const e of emails) {
      if (!out.has(e)) out.set(e, { user_email: e, role: role.toLowerCase() });
    }
  }
  return Array.from(out.values());
}

function parseCsvForInviteCount(text: string): number {
  return parseCsvForInvite(text).length;
}
