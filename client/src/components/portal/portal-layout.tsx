import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { FeedbackDialog } from "./feedback-dialog";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  FolderKanban,
  FileText,
  ClipboardList,
  Settings,
  Clock,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Building2,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { SmartTimingLogo } from "@/components/smart-timing-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CompanyUser {
  id: number;
  approved: boolean;
}

interface NavItem {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  badge?: number;
}

interface NavItemBase {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles?: string[];
}

const baseNavItems: NavItemBase[] = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
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
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const reduceMotion = useReducedMotion();

  const { data: companyUsers = [] } = useQuery<CompanyUser[]>({
    queryKey: ['/api/company/users', 1],
  });

  const pendingCount = useMemo(
    () => companyUsers.filter((companyUser) => !companyUser.approved).length,
    [companyUsers],
  );

  const currentUser = user || {
    id: "demo",
    name: "Demo Bruker",
    email: "demo@tidum.no",
    role: "admin",
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

  const pageTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : {
            duration: 0.18,
            ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
          },
    [reduceMotion],
  );

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
        <SmartTimingLogo collapsed={collapsed && !mobile} />
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                  collapsed && !mobile && "justify-center px-2",
                  isActive
                    ? "bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
                    : "text-[#d2e4e8] hover:bg-white/10 hover:text-white"
                )}
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_5%_2%,rgba(78,154,111,0.09),transparent_34%),radial-gradient(circle_at_96%_2%,rgba(31,107,115,0.11),transparent_36%),#eef3f1]">
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
          className="absolute -right-3 top-20 h-6 w-6 rounded-full border border-[#cbd9d6] bg-white text-[#335159] shadow-sm"
          onClick={toggleSidebar}
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
        <header className="sticky top-0 z-30 h-16 bg-white/90 backdrop-blur border-b border-[#d6e2de] flex items-center justify-between px-4 md:px-6">
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
              <SmartTimingLogo size="sm" showText={false} />
            </div>
            
            <h1 className="text-lg font-semibold hidden md:block text-[#183a44]">
              {activePageLabel}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location}
              className="transform-gpu"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
              transition={pageTransition}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <MobileBottomNav />

      <FeedbackDialog 
        userId={currentUser.id} 
        vendorId={currentUser.vendorId} 
      />
    </div>
  );
}
