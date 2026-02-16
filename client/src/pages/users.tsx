import { useEffect, useState } from "react";
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
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const roleColors = {
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  case_manager: "bg-primary/10 text-primary border-primary/20",
  member: "bg-muted text-muted-foreground border-muted",
};

const roleLabels = {
  admin: "Administrator",
  case_manager: "Saksbehandler",
  member: "Medlem",
};

const roleIcons = {
  admin: Shield,
  case_manager: Users,
  member: User,
};

interface CompanyUser {
  id: number;
  company_id: number;
  user_email: string;
  role: 'admin' | 'case_manager' | 'member';
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
  const [inviteRole, setInviteRole] = useState<string>("member");
  const { toast } = useToast();

  useEffect(() => {
    setTab(isInvitesRoute ? "pending" : "all");
  }, [isInvitesRoute]);

  const { data: companyUsers = [], isLoading, refetch } = useQuery<CompanyUser[]>({
    queryKey: ['/api/company/users', 1],
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { user_email: string; role: string }) => {
      return apiRequest('POST', '/api/company/users', { company_id: 1, ...data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/users'] });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      toast({ title: "Invitasjon sendt", description: "Brukeren har blitt lagt til." });
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
    role: u.role as 'admin' | 'case_manager' | 'member',
    approved: u.approved,
    lastActive: u.updated_at || u.created_at,
    hoursThisWeek: 0,
  }));

  const filteredUsers = users.filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = tab === "all" || 
                       (tab === "pending" && !user.approved) ||
                       (tab === "active" && user.approved);
    return matchesSearch && matchesTab;
  });

  const pendingCount = users.filter(u => !u.approved).length;

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
              <Button data-testid="invite-user-button">
                <UserPlus className="h-4 w-4 mr-2" />
                Inviter bruker
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Inviter ny bruker</DialogTitle>
                <DialogDescription>
                  Send en invitasjon til en ny bruker via e-post.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-postadresse</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="navn@example.com" 
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    data-testid="invite-email-input" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Rolle</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger data-testid="invite-role-select">
                      <SelectValue placeholder="Velg rolle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Medlem</SelectItem>
                      <SelectItem value="case_manager">Saksbehandler</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                  Avbryt
                </Button>
                <Button 
                  onClick={() => inviteMutation.mutate({ user_email: inviteEmail, role: inviteRole })} 
                  disabled={!inviteEmail || inviteMutation.isPending}
                  data-testid="send-invite-button"
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Send invitasjon
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

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
                  const RoleIcon = roleIcons[user.role];
                  
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
                            className={cn("text-xs", roleColors[user.role])}
                          >
                            <RoleIcon className="h-3 w-3 mr-1" />
                            {roleLabels[user.role]}
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
      </div>
    </PortalLayout>
  );
}
