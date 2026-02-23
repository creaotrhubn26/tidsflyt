import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { FeedbackDialog } from "./feedback-dialog";
import { GlobalSearch } from "@/components/global-search";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  FolderKanban,
  FileText,
  ClipboardList,
  Lightbulb,
  Settings,
  Clock,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Building2,
  Palette,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileBottomNav } from "./mobile-bottom-nav";
import tidumWordmark from "@assets/tidum-wordmark.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CompanyUser {
  id: number;
  approved: boolean;
}

interface NavItem {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  badge?: number;
  kind?: "route" | "modal";
}

interface NavItemBase {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles?: string[];
  kind?: "route" | "modal";
}

const baseNavItems: NavItemBase[] = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "__getting-started__", icon: ClipboardList, label: "Kom i gang med Tidum", kind: "modal" },
  { path: "/time", icon: Clock, label: "Timeføring" },
  { path: "/users", icon: Users, label: "Brukere" },
  { path: "/invites", icon: UserPlus, label: "Invitasjoner" },
  { path: "/cases", icon: FolderKanban, label: "Saker" },
  { path: "/case-reports", icon: ClipboardList, label: "Saksrapporter" },
  { path: "/reports", icon: FileText, label: "Rapporter" },
  { path: "/vendors", icon: Building2, label: "Leverandører", roles: ["super_admin"] },
  { path: "/cms", icon: Palette, label: "CMS", roles: ["super_admin"] },
  { path: "/settings", icon: Settings, label: "Innstillinger" },
];

interface PortalLayoutProps {
  children: ReactNode;
  user?: {
    id?: string;
    name: string;
    email: string;
    role: string;
    vendorId?: number;
  };
}

export function PortalLayout({ children, user }: PortalLayoutProps) {
  const [location, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [isGettingStartedOpen, setIsGettingStartedOpen] = useState(false);

  const { data: companyUsersData } = useQuery<CompanyUser[] | { error?: string }>({
    queryKey: ['/api/company/users', 1],
  });

  const companyUsers = useMemo(
    () => (Array.isArray(companyUsersData) ? companyUsersData : []),
    [companyUsersData],
  );

  const pendingCount = useMemo(
    () => companyUsers.filter((companyUser) => !companyUser.approved).length,
    [companyUsers],
  );

  const currentUser = user || {
    id: "demo",
    name: "Demo Bruker",
    email: "demo@tidum.no",
    role: "member",
    vendorId: undefined,
  };

  const checkMilestoneMutation = useMutation({
    mutationFn: async () => {
      if (currentUser.id) {
        const response = await apiRequest("POST", "/api/feedback/check-milestone", {
          userId: currentUser.id,
          vendorId: currentUser.vendorId,
        });
        return response.json();
      }
      return null;
    },
  });
  const { mutate: checkMilestone } = checkMilestoneMutation;

  useEffect(() => {
    if (currentUser.id && currentUser.id !== "demo") {
      checkMilestone();
    }
  }, [checkMilestone, currentUser.id]);

  const navItems: NavItem[] = useMemo(
    () =>
      baseNavItems
        .filter((item) => !item.roles || item.roles.includes(currentUser.role))
        .map((item) => ({
          ...item,
          kind: item.kind || "route",
          badge: item.path === "/invites" && pendingCount > 0 ? pendingCount : undefined,
        })),
    [currentUser.role, pendingCount],
  );

  const activePageLabel = useMemo(
    () => navItems.find((item) => item.path === location)?.label || "Dashboard",
    [location, navItems],
  );

  const toggleSidebar = useCallback(() => {
    setCollapsed((previous) => !previous);
  }, []);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return <Badge variant="destructive" className="text-xs">Super Admin</Badge>;
      case "vendor_admin":
        return <Badge variant="destructive" className="text-xs">Vendor Admin</Badge>;
      case "admin":
        return <Badge variant="destructive" className="text-xs">Admin</Badge>;
      case "case_manager":
        return <Badge className="text-xs">Saksbehandler</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Medlem</Badge>;
    }
  };

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <div className={cn(
        "flex items-center gap-3 px-4 h-16 border-b border-white/15",
        collapsed && !mobile && "justify-center px-2"
      )}>
        {collapsed && !mobile ? (
          <img src={tidumWordmark} alt="Tidum" className="h-6 w-auto max-w-[42px] object-contain" />
        ) : (
          <img src={tidumWordmark} alt="Tidum" className="h-8 w-auto object-contain" />
        )}
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            const itemClassName = cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
              collapsed && !mobile && "justify-center px-2",
              isActive
                ? "bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
                : "text-[#d2e4e8] hover:bg-white/10 hover:text-white"
            );

            if (item.kind === "modal") {
              return (
                <button
                  key={item.path}
                  type="button"
                  className={itemClassName}
                  onClick={() => setIsGettingStartedOpen(true)}
                  data-testid="sidebar-kom-i-gang-med-tidum"
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {(!collapsed || mobile) && (
                    <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                  )}
                </button>
              );
            }

            return (
              <Link
                key={item.path}
                href={item.path}
                className={itemClassName}
                data-testid={`sidebar-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {(!collapsed || mobile) && (
                  <>
                    <span className="flex-1 text-sm font-medium">{item.label}</span>
                    {item.badge && (
                      <Badge className="h-5 px-1.5 text-xs bg-white/20 text-white border border-white/30">
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <div className={cn(
        "border-t border-white/15 p-3",
        collapsed && !mobile && "p-2"
      )}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-3 w-full p-2 rounded-lg hover:bg-white/10 transition-colors text-left",
                collapsed && !mobile && "justify-center"
              )}
              data-testid="user-menu-trigger"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[#1F6B73] text-white text-sm">
                  {currentUser.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {(!collapsed || mobile) && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-xs text-[#bad0d5] truncate">
                    {currentUser.email}
                  </p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{currentUser.name}</p>
              <p className="text-xs text-muted-foreground">{currentUser.email}</p>
              <div className="mt-1">{getRoleBadge(currentUser.role)}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menu-settings">
              <Settings className="h-4 w-4 mr-2" />
              Innstillinger
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" data-testid="menu-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Logg ut
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_5%_2%,rgba(78,154,111,0.09),transparent_34%),radial-gradient(circle_at_96%_2%,rgba(31,107,115,0.11),transparent_36%),#eef3f1] dark:bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 bg-[linear-gradient(180deg,#123C45_0%,#0D2C34_58%,#0A242B_100%)] border-r border-[#1c4d57] shadow-[10px_0_38px_rgba(10,35,41,0.24)] flex-col hidden md:flex transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
        data-testid="desktop-sidebar"
      >
        <SidebarContent />
        
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-3 top-20 h-6 w-6 rounded-full border border-[#cbd9d6] dark:border-border bg-white dark:bg-card text-[#335159] dark:text-foreground shadow-sm dark:shadow-none"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Utvid sidepanel" : "Skjul sidepanel"}
          title={collapsed ? "Utvid sidepanel" : "Skjul sidepanel"}
          data-testid="sidebar-toggle"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </Button>
      </aside>

      <div className={cn(
        "flex flex-col min-h-screen transition-all duration-300",
        collapsed ? "md:pl-16" : "md:pl-64"
      )}>
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-card/90 backdrop-blur border-b border-[#d6e2de] dark:border-border flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" data-testid="mobile-menu-trigger">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-[linear-gradient(180deg,#123C45_0%,#0D2C34_58%,#0A242B_100%)] border-r-[#1c4d57]">
                <SidebarContent mobile />
              </SheetContent>
            </Sheet>

            <div className="md:hidden" data-testid="mobile-header-logo">
              <img src={tidumWordmark} alt="Tidum" className="h-7 w-auto object-contain" />
            </div>
            
            <h1 className="text-lg font-semibold hidden md:block text-[#183a44] dark:text-foreground">
              {activePageLabel}
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <GlobalSearch />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-x-hidden">
          {children}
        </main>
      </div>

      <MobileBottomNav />

      <FeedbackDialog 
        userId={currentUser.id} 
        vendorId={currentUser.vendorId} 
      />

      <Dialog open={isGettingStartedOpen} onOpenChange={setIsGettingStartedOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b bg-muted/30 px-6 py-5">
            <div className="mb-2">
              <img
                src={tidumWordmark}
                alt="Tidum"
                className="block w-[220px] max-w-full h-auto"
              />
            </div>
            <DialogTitle className="text-xl">Kom i gang med Tidum</DialogTitle>
            <DialogDescription>
              Velg neste steg for å sette opp arbeidsflyten raskt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 px-4 py-4">
            <Button
              variant="outline"
              className="h-auto w-full justify-start rounded-xl px-3 py-3 text-left"
              onClick={() => { setIsGettingStartedOpen(false); navigate("/users"); }}
            >
              <Users className="mr-3 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Inviter brukere</p>
                <p className="text-xs text-muted-foreground">Legg til teamet ditt og tildel roller</p>
              </div>
              <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" />
            </Button>

            <Button
              variant="outline"
              className="h-auto w-full justify-start rounded-xl px-3 py-3 text-left"
              onClick={() => { setIsGettingStartedOpen(false); navigate("/cases"); }}
            >
              <FolderKanban className="mr-3 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Opprett første sak</p>
                <p className="text-xs text-muted-foreground">Sett opp deltakere og oppfølging</p>
              </div>
              <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" />
            </Button>

            <Button
              variant="outline"
              className="h-auto w-full justify-start rounded-xl px-3 py-3 text-left"
              onClick={() => { setIsGettingStartedOpen(false); navigate("/time-tracking"); }}
            >
              <Clock className="mr-3 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Start timeføring</p>
                <p className="text-xs text-muted-foreground">Registrer tid med en gang</p>
              </div>
              <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" />
            </Button>

            <Button
              variant="outline"
              className="h-auto w-full justify-start rounded-xl px-3 py-3 text-left"
              onClick={() => { setIsGettingStartedOpen(false); navigate("/guide"); }}
              data-testid="open-guide"
            >
              <Lightbulb className="mr-3 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Hvordan bruke Tidum</p>
                <p className="text-xs text-muted-foreground">Les veiledningen for smarte forslag og beste praksis</p>
              </div>
              <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" />
            </Button>
          </div>

          <DialogFooter className="border-t px-4 py-3">
            <Button variant="ghost" onClick={() => setIsGettingStartedOpen(false)}>
              Lukk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
