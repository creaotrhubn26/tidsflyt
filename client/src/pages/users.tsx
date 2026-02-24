import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Users, 
  UserPlus, 
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
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("miljoarbeider");
  const [inviteInstitution, setInviteInstitution] = useState("");
  const [inviteCaseTitle, setInviteCaseTitle] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "recent" | "hours">("recent");
  const { toast } = useToast();
  const { user } = useAuth();

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

  const actorRole = normalizeRole(user?.role);
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
                            <div key={user.id} className="flex items-center gap-4 p-4 rounded-xl border border-orange-200/60 dark:border-orange-800/30 bg-orange-50/40 dark:bg-orange-950/10">
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
                            <div key={user.id} className="flex items-center gap-4 p-4 rounded-xl border bg-card">
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
