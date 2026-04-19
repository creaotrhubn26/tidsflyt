import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FeedbackDialog } from "./feedback-dialog";
import { GlobalSearch } from "@/components/global-search";
import { ActivityFeed } from "@/components/portal/activity-feed";
import { useAuth } from "@/hooks/use-auth";
import { useRolePreview, type TidumViewMode } from "@/hooks/use-role-preview";
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
  Bell,
  CheckCircle,
  Upload,
  UserCheck,
  Send,
  Mail,
  ClipboardCheck,
  AlertTriangle,
  HelpCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { useCompose } from "@/components/email/compose-context";
import tidumWordmark from "@assets/tidum-wordmark.png";
import { OnboardingInstitutionsStep } from "./onboarding-institutions-step";
import { OnboardingSakerStep } from "./onboarding-saker-step";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { normalizeRole } from "@shared/roles";
import { ProductTour, TourReplayButton, buildTourSteps, type TidumTourRole } from "@/components/onboarding/product-tour";
import { useStuckDetection } from "@/hooks/use-stuck-detection";
import { useGuideConfig } from "@/hooks/use-guide-config";
import { useNavConfig } from "@/hooks/use-nav-config";

interface CompanyUser {
  id: number;
  approved: boolean;
}

interface HeaderActivity {
  id: string;
  userId: string;
  action: string;
  description: string;
  timestamp: string;
  userName?: string;
}

interface NotificationItem {
  id: number;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

type NavCategory =
  | "oversikt"
  | "saker"
  | "rapportering"
  | "tid"
  | "kommunikasjon"
  | "administrasjon"
  | "system";

interface NavItem {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  badge?: number;
  kind?: "route" | "modal";
  category: NavCategory;
}

interface NavItemBase {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles?: string[];
  kind?: "route" | "modal";
  category: NavCategory;
}

const NAV_CATEGORY_ORDER: NavCategory[] = [
  "oversikt",
  "saker",
  "rapportering",
  "tid",
  "kommunikasjon",
  "administrasjon",
  "system",
];

const NAV_CATEGORY_LABELS: Record<NavCategory, string> = {
  oversikt: "Oversikt",
  saker: "Saker & klienter",
  rapportering: "Rapportering",
  tid: "Tid & fravær",
  kommunikasjon: "Økonomi & kommunikasjon",
  administrasjon: "Administrasjon",
  system: "System",
};

const baseNavItems: NavItemBase[] = [
  // Oversikt
  { category: "oversikt", path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { category: "oversikt", path: "/tiltaksleder", icon: ClipboardCheck, label: "Tiltaksleder", roles: ["tiltaksleder", "teamleder", "vendor_admin"] },
  { category: "oversikt", path: "__getting-started__", icon: ClipboardList, label: "Kom i gang med Tidum", kind: "modal" },

  // Saker & klienter
  { category: "saker", path: "/cases", icon: FolderKanban, label: "Saker", roles: ["tiltaksleder"] },
  { category: "saker", path: "/institusjoner", icon: Building2, label: "Institusjoner", roles: ["tiltaksleder", "vendor_admin", "hovedadmin", "admin", "super_admin"] },
  { category: "saker", path: "/invites", icon: UserPlus, label: "Invitasjoner", roles: ["tiltaksleder"] },

  // Rapportering
  { category: "rapportering", path: "/rapporter", icon: FileText, label: "Rapporter" },
  { category: "rapportering", path: "/rapporter/godkjenning", icon: ClipboardList, label: "Godkjenning", roles: ["tiltaksleder"] },
  { category: "rapportering", path: "/admin/rapport-maler", icon: FileText, label: "Rapport-maler", roles: ["vendor_admin", "hovedadmin", "admin", "super_admin"] },
  { category: "rapportering", path: "/avvik", icon: AlertTriangle, label: "Avvik" },

  // Tid & fravær
  { category: "tid", path: "/time", icon: Clock, label: "Timeføring" },
  { category: "tid", path: "/timesheets", icon: CheckCircle, label: "Timelister", roles: ["tiltaksleder", "miljoarbeider"] },
  { category: "tid", path: "/overtime", icon: Clock, label: "Overtid" },
  { category: "tid", path: "/leave", icon: Clock, label: "Fravær" },
  { category: "tid", path: "/recurring", icon: ClipboardList, label: "Faste oppgaver" },

  // Økonomi & kommunikasjon
  { category: "kommunikasjon", path: "/invoices", icon: FileText, label: "Fakturaer", roles: ["tiltaksleder"] },
  { category: "kommunikasjon", path: "/email", icon: Mail, label: "E-post", roles: ["tiltaksleder"] },
  { category: "kommunikasjon", path: "/forward", icon: Send, label: "Send videre", roles: ["tiltaksleder"] },

  // Administrasjon (super-admin only)
  { category: "administrasjon", path: "/vendors", icon: Building2, label: "Leverandører", roles: ["super_admin"] },
  { category: "administrasjon", path: "/cms", icon: Palette, label: "CMS", roles: ["super_admin"] },
  { category: "administrasjon", path: "/admin/tester-feedback", icon: Lightbulb, label: "Tester-feedback", roles: ["super_admin"] },

  // System
  { category: "system", path: "/settings", icon: Settings, label: "Innstillinger" },
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

// Context to detect if PortalLayout is already mounted above in the tree.
// This lets us put PortalLayout at the router level AND keep it in individual
// pages without double-wrapping. Individual page instances become no-ops when
// a parent PortalLayout is already present.
const PortalLayoutContext = createContext(false);

export function PortalLayout({ children, user }: PortalLayoutProps) {
  const alreadyMounted = useContext(PortalLayoutContext);
  if (alreadyMounted) {
    return <>{children}</>;
  }
  return (
    <PortalLayoutContext.Provider value={true}>
      <PortalLayoutInner user={user}>{children}</PortalLayoutInner>
    </PortalLayoutContext.Provider>
  );
}

function PortalLayoutInner({ children, user }: PortalLayoutProps) {
  const [location, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { openCompose } = useCompose();
  const [isGettingStartedOpen, setIsGettingStartedOpen] = useState(false);
  // 0=welcome, 1=profile confirm, 2=institutions (vendor_admin/tiltaksleder only), 3=role-based steps
  const [onboardingStep, setOnboardingStep] = useState(0);
  // Synchronous local cache for first paint, then hydrated from server below
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
    try { return localStorage.getItem("tidum_onboarding_done") === "1"; } catch { return false; }
  });
  // Tour state — separate from onboarding checklist
  const [tourCompleted, setTourCompleted] = useState(() => {
    try { return localStorage.getItem("tidum_tour_done") === "1"; } catch { return false; }
  });
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    fetch("/api/user-state/settings", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data.onboardingCompleted === "boolean") {
          setOnboardingCompleted(data.onboardingCompleted);
          try { localStorage.setItem("tidum_onboarding_done", data.onboardingCompleted ? "1" : "0"); } catch {}
        }
        if (data && typeof data.tourCompleted === "boolean") {
          setTourCompleted(data.tourCompleted);
          try { localStorage.setItem("tidum_tour_done", data.tourCompleted ? "1" : "0"); } catch {}
        }
      })
      .catch(() => { /* offline tolerated */ });
  }, []);

  // Auto-launch the tour on first dashboard visit, or when ?tour=restart is set.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tour") === "restart") {
      setTourOpen(true);
      params.delete("tour");
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
      window.history.replaceState(null, "", newUrl);
      return;
    }
    if (!tourCompleted && (location === "/dashboard" || location === "/")) {
      const t = window.setTimeout(() => setTourOpen(true), 1200);
      return () => window.clearTimeout(t);
    }
  }, [tourCompleted, location]);

  const closeTour = useCallback((completed: boolean) => {
    setTourOpen(false);
    if (completed) {
      setTourCompleted(true);
      try { localStorage.setItem("tidum_tour_done", "1"); } catch {}
      fetch("/api/user-state/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tourCompleted: true }),
      }).catch(() => {});
    }
  }, []);

  // Stuck detection — discrete "Trenger du hjelp?" prompt when triggered
  const stuckDetection = useStuckDetection();
  const [isHeaderActivityOpen, setIsHeaderActivityOpen] = useState(false);
  const { user: authUser, isLoading: authLoading } = useAuth();
  const {
    actualRole,
    actualRoleLabel,
    canPreviewRoles,
    effectiveRole,
    effectiveRoleLabel,
    isPreviewActive,
    previewMode,
    previewModeLabel,
    setPreviewMode,
  } = useRolePreview();

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
  const showHeaderActivityBell = location !== "/dashboard";

  const resolvedPortalUser = user ?? (authUser ? {
    id: authUser.id,
    name: `${authUser.firstName || ''} ${authUser.lastName || ''}`.trim() || authUser.email || 'Bruker',
    email: authUser.email || '',
    role: authUser.role || 'user',
    vendorId: authUser.vendorId ?? undefined,
  } : null);
  const currentUser = resolvedPortalUser ?? {
    id: "",
    name: authLoading ? "Laster profil..." : "Bruker",
    email: "",
    role: "member",
    vendorId: undefined,
  };
  const normalizedCurrentUserRole = effectiveRole;
  const effectiveUserId = user?.id || authUser?.id || resolvedPortalUser?.id || "";
  const isMiljoarbeider = effectiveRole === "miljoarbeider";

  // Vendor / institution name for personalising the tour. Cached server-side.
  const { data: vendorOrgInfo } = useQuery<{ name?: string } | null>({
    queryKey: ["/api/vendor/org-info"],
    queryFn: () => fetch("/api/vendor/org-info", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    enabled: !!effectiveUserId && normalizedCurrentUserRole !== "miljoarbeider",
    staleTime: 5 * 60_000,
  });

  const { data: headerActivitiesData = [], isLoading: headerActivitiesLoading } = useQuery<HeaderActivity[]>({
    queryKey: ["/api/activities", { limit: "20", source: "header" }],
    queryFn: async () => {
      const response = await fetch("/api/activities?limit=20", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Kunne ikke hente aktiviteter");
      }
      return response.json();
    },
    staleTime: 20_000,
    enabled: showHeaderActivityBell,
  });

  // Notifications query — real targeted notifications
  const { data: notificationsData = [] } = useQuery<NotificationItem[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const response = await fetch("/api/notifications?limit=30", { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 15_000,
    refetchInterval: 30_000, // Poll every 30s for new notifications
  });

  const notificationItems = useMemo(
    () => (Array.isArray(notificationsData) ? notificationsData : []),
    [notificationsData],
  );

  const unreadNotificationCount = useMemo(
    () => notificationItems.filter((n) => !n.is_read).length,
    [notificationItems]
  );

  const markNotificationRead = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications/mark-all-read", { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const checkMilestoneMutation = useMutation({
    mutationFn: async () => {
      if (resolvedPortalUser?.id) {
        const response = await apiRequest("POST", "/api/feedback/check-milestone", {
          userId: resolvedPortalUser.id,
          vendorId: resolvedPortalUser.vendorId,
        });
        return response.json();
      }
      return null;
    },
  });
  const { mutate: checkMilestone } = checkMilestoneMutation;

  useEffect(() => {
    if (resolvedPortalUser?.id) {
      checkMilestone();
    }
  }, [checkMilestone, resolvedPortalUser?.id]);

  useEffect(() => {
    setIsHeaderActivityOpen(false);
  }, [location]);

  const headerActivityItems = useMemo(() => {
    const actionTypeMap: Record<
      string,
      "stamp" | "approval" | "report_submitted" | "user_added"
    > = {
      time_approved: "approval",
      time_logged: "stamp",
      user_invited: "user_added",
      case_completed: "report_submitted",
    };

    if (!Array.isArray(headerActivitiesData)) return [];

    const mapped = headerActivitiesData.map((activity) => ({
      id: activity.id,
      type: actionTypeMap[activity.action] || ("stamp" as const),
      user: activity.userName || "Ukjent bruker",
      message: activity.description,
      timestamp: activity.timestamp,
      userId: activity.userId,
    }));

    if (isMiljoarbeider && effectiveUserId) {
      return mapped.filter((activity) => activity.userId === effectiveUserId);
    }

    return mapped;
  }, [headerActivitiesData, isMiljoarbeider, effectiveUserId]);

  const headerActivityCount = headerActivityItems.length;

  // For miljøarbeider: only show "Overtid" tab if their tiltaksleder hasn't disabled overtime tracking.
  const { data: overtimeSettings } = useQuery<{ trackOvertime?: boolean }>({
    queryKey: ["/api/overtime/settings", effectiveUserId],
    queryFn: () =>
      fetch(`/api/overtime/settings?userId=${encodeURIComponent(effectiveUserId)}`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : null)),
    enabled: isMiljoarbeider && !!effectiveUserId,
    staleTime: 60_000,
  });
  const overtimeHiddenForWorker =
    isMiljoarbeider && overtimeSettings?.trackOvertime === false;

  const navConfig = useNavConfig();

  const navItems: NavItem[] = useMemo(
    () =>
      baseNavItems
        .filter((item) => !(item.path === "/time" && normalizedCurrentUserRole === "tiltaksleder"))
        .filter((item) => !(item.path === "/overtime" && overtimeHiddenForWorker))
        .filter((item) => !item.roles || item.roles.map((role) => normalizeRole(role)).includes(normalizedCurrentUserRole))
        // Apply CMS overrides: rename labels, hide items, move to other categories.
        .filter((item) => !navConfig.portalSidebarOverrides[item.path]?.hidden)
        .map((item) => {
          const override = navConfig.portalSidebarOverrides[item.path];
          return {
            ...item,
            label: override?.label || item.label,
            category: (override?.category as NavCategory) || item.category,
            kind: item.kind || "route",
            badge: item.path === "/invites" && pendingCount > 0 ? pendingCount : undefined,
          };
        }),
    [normalizedCurrentUserRole, pendingCount, overtimeHiddenForWorker, navConfig.portalSidebarOverrides],
  );

  const activePageLabel = useMemo(
    () => navItems.find((item) => item.path === location)?.label || "Dashboard",
    [location, navItems],
  );

  const toggleSidebar = useCallback(() => {
    setCollapsed((previous) => !previous);
  }, []);

  const handlePreviewModeChange = useCallback(
    (nextMode: TidumViewMode) => {
      setPreviewMode(nextMode);
      navigate("/dashboard");
    },
    [navigate, setPreviewMode],
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
        {collapsed && !mobile ? (
          <img src={tidumWordmark} alt="Tidum" className="h-6 w-auto max-w-[42px] object-contain" />
        ) : (
          <img src={tidumWordmark} alt="Tidum" className="h-8 w-auto object-contain" />
        )}
      </div>

      {/* Compose button */}
      <div className={cn("px-3 pt-3", collapsed && !mobile && "px-2")}>
        <Button
          onClick={() => openCompose()}
          className={cn(
            "w-full gap-2 rounded-xl shadow-md",
            collapsed && !mobile && "px-0 justify-center"
          )}
          size={collapsed && !mobile ? "icon" : "default"}
        >
          <Mail className="h-4 w-4" />
          {(!collapsed || mobile) && <span>Skriv e-post</span>}
        </Button>
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-4 px-2">
          {NAV_CATEGORY_ORDER.map((category) => {
            const itemsInCategory = navItems
              .filter((item) => item.category === category)
              .map((item, naturalIndex) => ({ item, naturalIndex }))
              .sort((a, b) => {
                const oa = navConfig.portalSidebarOverrides[a.item.path]?.order;
                const ob = navConfig.portalSidebarOverrides[b.item.path]?.order;
                if (oa != null && ob != null) return oa - ob;
                if (oa != null) return -1;
                if (ob != null) return 1;
                return a.naturalIndex - b.naturalIndex;
              })
              .map(({ item }) => item);
            if (itemsInCategory.length === 0) return null;
            const isCollapsedDesktop = collapsed && !mobile;
            return (
              <div key={category} className="space-y-1">
                {!isCollapsedDesktop ? (
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#a4c0c5]/70">
                    {navConfig.portalCategoryLabels[category] || NAV_CATEGORY_LABELS[category]}
                  </p>
                ) : (
                  <div className="mx-2 my-1 border-t border-white/10" aria-hidden />
                )}
                {itemsInCategory.map((item) => {
                  const isActive = item.path === "/dashboard"
                    ? location === "/dashboard" || location === "/"
                    : location === item.path || (item.path !== "/" && location.startsWith(item.path + "/"));
                  const Icon = item.icon;
                  const itemClassName = cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full",
                    isCollapsedDesktop && "justify-center px-2",
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
                        {!isCollapsedDesktop && (
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
                      {!isCollapsedDesktop && (
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
              </div>
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
                  {(currentUser.name.trim().charAt(0) || "?").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {(!collapsed || mobile) && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-xs text-[#bad0d5] truncate">
                    {isPreviewActive ? `${previewModeLabel} visning` : currentUser.email}
                  </p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{currentUser.name}</p>
              {currentUser.email ? (
                <p className="text-xs text-muted-foreground">{currentUser.email}</p>
              ) : null}
              {resolvedPortalUser ? <div className="mt-1">{getRoleBadge(actualRole)}</div> : null}
              {isPreviewActive ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Viser som {previewModeLabel.toLowerCase()}
                </p>
              ) : null}
            </div>
            {canPreviewRoles ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Visningsmodus</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={previewMode} onValueChange={(value) => handlePreviewModeChange(value as TidumViewMode)}>
                  <DropdownMenuRadioItem value="admin">
                    Admin
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="institution">
                    Institusjon
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="miljoarbeider">
                    Miljøarbeider
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </>
            ) : null}
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
            
            <div className="hidden md:flex flex-col">
              <h1 className="text-lg font-semibold text-[#183a44] dark:text-foreground">
                {activePageLabel}
              </h1>
              {canPreviewRoles ? (
                <p className="text-xs text-muted-foreground">
                  {isPreviewActive ? `Viser som ${previewModeLabel.toLowerCase()}` : `Pålogget som ${actualRoleLabel.toLowerCase()}`}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <GlobalSearch />
            {showHeaderActivityBell && (
              <Sheet open={isHeaderActivityOpen} onOpenChange={setIsHeaderActivityOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label="Åpne varsler"
                    title="Åpne varsler"
                    data-testid="header-activity-bell"
                  >
                    <Bell className="h-5 w-5" />
                    {(unreadNotificationCount > 0 || headerActivityCount > 0) && (
                      <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-[18px] text-white">
                        {(unreadNotificationCount || headerActivityCount) > 9 ? "9+" : (unreadNotificationCount || headerActivityCount)}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="top"
                  className="top-16 inset-x-0 md:inset-x-6 lg:inset-x-10 rounded-b-2xl border-x border-b border-[#d6e2de] dark:border-border bg-background/95 p-0 backdrop-blur"
                >
                  <div className="border-b border-border px-4 py-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold">Varsler</h2>
                      <p className="text-xs text-muted-foreground">
                        {unreadNotificationCount > 0 ? `${unreadNotificationCount} uleste varsler` : "Ingen uleste varsler"}
                      </p>
                    </div>
                    {unreadNotificationCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()} className="text-xs">
                        Merk alle som lest
                      </Button>
                    )}
                  </div>
                  <div className="max-h-[calc(100vh-11rem)] overflow-auto">
                    {/* Notifications section */}
                    {notificationItems.length > 0 && (
                      <div className="p-2 space-y-1">
                        {notificationItems.slice(0, 15).map((notif) => (
                          <button
                            key={notif.id}
                            className={cn(
                              "w-full text-left p-3 rounded-lg transition-colors hover:bg-muted/80",
                              !notif.is_read && "bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-500"
                            )}
                            onClick={() => {
                              if (!notif.is_read) markNotificationRead.mutate(notif.id);
                              if (notif.link) {
                                navigate(notif.link);
                                setIsHeaderActivityOpen(false);
                              }
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <div className={cn(
                                "mt-1 h-2 w-2 rounded-full flex-shrink-0",
                                !notif.is_read ? "bg-blue-500" : "bg-transparent"
                              )} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{notif.title}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2">{notif.message}</p>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  {new Date(notif.created_at).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {notificationItems.length === 0 && (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        Ingen varsler ennå
                      </div>
                    )}
                    {/* Activity feed section */}
                    {headerActivityItems.length > 0 && (
                      <>
                        <div className="border-t border-border px-4 py-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Aktivitetslogg</p>
                        </div>
                        <div className="p-4 pt-0">
                          <ActivityFeed
                            activities={headerActivityItems}
                            loading={headerActivitiesLoading}
                            title=""
                            variant="compact"
                            compactLimit={5}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-x-hidden">
          {children}
        </main>
      </div>

      <MobileBottomNav />

      {resolvedPortalUser ? (
        <FeedbackDialog
          userId={resolvedPortalUser.id}
          vendorId={resolvedPortalUser.vendorId}
        />
      ) : null}

      {/* Interactive product tour — personalised by name + role */}
      <ProductTour
        steps={buildTourSteps({
          role: tourRoleFromEffective(normalizedCurrentUserRole),
          displayName: currentUser.name,
          vendorName: vendorOrgInfo?.name ?? null,
        })}
        open={tourOpen}
        onClose={closeTour}
      />

      {/* Floating help button — restart tour or open guide */}
      {tourCompleted && !tourOpen && (
        <TourReplayButton onClick={() => setTourOpen(true)} />
      )}

      {/* Stuck-detection prompt */}
      {stuckDetection.stuck && !tourOpen && (
        <StuckHelperPrompt
          reason={stuckDetection.reason}
          onDismiss={stuckDetection.dismiss}
          onStartTour={() => {
            stuckDetection.dismiss();
            setTourOpen(true);
          }}
          onOpenGuide={() => {
            stuckDetection.dismiss();
            navigate("/guide");
          }}
        />
      )}

      {(() => {
        // Roles who get the institutions step (admins/managers who set up the registry)
        const showsInstitutionsStep = ["vendor_admin", "tiltaksleder", "teamleder", "hovedadmin", "admin", "super_admin"]
          .includes(normalizedCurrentUserRole);
        // Same roles get a "register first sak" step too (after institutions)
        const showsSakerStep = showsInstitutionsStep;
        const totalSteps = (showsInstitutionsStep ? 1 : 0) + (showsSakerStep ? 1 : 0) + 3;
        const lastStepIndex = totalSteps - 1;
        const isInstitutionsStep = showsInstitutionsStep && onboardingStep === 2;
        const isSakerStep = showsSakerStep && onboardingStep === (showsInstitutionsStep ? 3 : 2);
        const isWideStep = isInstitutionsStep || isSakerStep;
        const isLastStep = onboardingStep === lastStepIndex;
        // Map step index → which content to show
        const contentForStep = (() => {
          if (onboardingStep === 0) return "welcome";
          if (onboardingStep === 1) return "profile";
          if (showsInstitutionsStep && onboardingStep === 2) return "institutions";
          if (showsSakerStep && onboardingStep === (showsInstitutionsStep ? 3 : 2)) return "saker";
          return "nextsteps";
        })();
      return (
      <Dialog open={isGettingStartedOpen} onOpenChange={(open) => { setIsGettingStartedOpen(open); if (!open) setOnboardingStep(0); }}>
        <DialogContent className={cn("overflow-hidden p-0", isWideStep ? "sm:max-w-2xl" : "sm:max-w-md")}>
          <DialogHeader className="border-b bg-muted/30 px-6 py-5">
            <div className="mb-2">
              <img
                src={tidumWordmark}
                alt="Tidum"
                className="block w-[220px] max-w-full h-auto"
              />
            </div>
            <DialogTitle className="text-xl">
              {contentForStep === "welcome" && "Kom i gang med Tidum"}
              {contentForStep === "profile" && "Bekreft profil"}
              {contentForStep === "institutions" && "Institusjoner dere jobber med"}
              {contentForStep === "saker" && "Registrer første sak"}
              {contentForStep === "nextsteps" && "Neste steg"}
            </DialogTitle>
            <DialogDescription>
              {contentForStep === "welcome" && "Velkommen! La oss sette opp kontoen din."}
              {contentForStep === "profile" && "Sjekk at opplysningene stemmer."}
              {contentForStep === "institutions" && "Søk i Brønnøysundregisteret og legg til alle oppdragsgiverne deres."}
              {contentForStep === "saker" && "Opprett en sak og tildel den til miljøarbeidere — eller hopp over og gjør det senere."}
              {contentForStep === "nextsteps" && "Velg neste steg for å sette opp arbeidsflyten raskt."}
            </DialogDescription>
            <div className="mt-3 flex gap-1">
              {Array.from({ length: totalSteps }, (_, step) => (
                <div key={step} className={cn("h-1 flex-1 rounded-full transition-colors", step <= onboardingStep ? "bg-primary" : "bg-muted")} />
              ))}
            </div>
          </DialogHeader>

          <div className={cn("space-y-3 px-4 py-4", isWideStep && "max-h-[60vh] overflow-y-auto")}>
            {/* Step 0: Welcome */}
            {contentForStep === "welcome" && (
              <>
                <div className="rounded-xl border bg-muted/20 p-4 text-center">
                  <UserCheck className="mx-auto mb-2 h-10 w-10 text-primary" />
                  <p className="text-sm font-medium">Hei, {currentUser.name}!</p>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Rolle: <Badge variant="secondary" className="ml-1">{effectiveRoleLabel}</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Vi guider deg gjennom oppsettet slik at du kan komme raskt i gang.
                </p>
              </>
            )}

            {/* Step 1: Profile confirmation + logo */}
            {contentForStep === "profile" && (
              <>
                <div className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">Navn</p>
                      <p className="text-xs text-muted-foreground">{currentUser.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">E-post</p>
                      <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">Rolle</p>
                      <p className="text-xs text-muted-foreground">{effectiveRoleLabel}</p>
                    </div>
                  </div>
                </div>

                {normalizedCurrentUserRole === "tiltaksleder" && (
                  <Button
                    variant="outline"
                    className="h-auto w-full justify-start rounded-xl px-3 py-3 text-left"
                    onClick={() => { setIsGettingStartedOpen(false); navigate("/profile"); }}
                  >
                    <Upload className="mr-3 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">Last opp firmalogo</p>
                      <p className="text-xs text-muted-foreground">Vises i rapporter og timelister</p>
                    </div>
                    <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" />
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="h-auto w-full justify-start rounded-xl px-3 py-3 text-left"
                  onClick={() => { setIsGettingStartedOpen(false); navigate("/profile"); }}
                >
                  <Settings className="mr-3 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Rediger profil</p>
                    <p className="text-xs text-muted-foreground">Oppdater innstillinger og personlig info</p>
                  </div>
                  <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" />
                </Button>
              </>
            )}

            {/* Step 2 (admins/managers only): Institutions registry */}
            {contentForStep === "institutions" && <OnboardingInstitutionsStep />}

            {/* Step 3 (admins/managers only): Register first sak + assign */}
            {contentForStep === "saker" && <OnboardingSakerStep />}

            {/* Last step: Role-based next steps */}
            {contentForStep === "nextsteps" && (
              <>
                {normalizedCurrentUserRole === "tiltaksleder" && (
                  <>
                    <Button
                      variant="outline"
                      className="h-auto w-full justify-start rounded-xl px-3 py-3 text-left"
                      onClick={() => { setIsGettingStartedOpen(false); navigate("/invites"); }}
                    >
                      <Users className="mr-3 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">Inviter miljøarbeidere</p>
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
                        <p className="text-xs text-muted-foreground">Sett opp klientsaker og oppfølging</p>
                      </div>
                      <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" />
                    </Button>
                  </>
                )}

                {normalizedCurrentUserRole === "miljoarbeider" && (
                  <Button
                    variant="outline"
                    className="h-auto w-full justify-start rounded-xl px-3 py-3 text-left"
                    onClick={() => { setIsGettingStartedOpen(false); navigate("/case-reports"); }}
                  >
                    <Send className="mr-3 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">Skriv saksrapport</p>
                      <p className="text-xs text-muted-foreground">Opprett og send inn månedlig saksrapport</p>
                    </div>
                    <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" />
                  </Button>
                )}

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
              </>
            )}
          </div>

          <DialogFooter className="border-t px-4 py-3 flex justify-between">
            {onboardingStep > 0 ? (
              <Button variant="ghost" onClick={() => setOnboardingStep(s => s - 1)}>
                Tilbake
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setIsGettingStartedOpen(false)}>
                Lukk
              </Button>
            )}
            {!isLastStep ? (
              <Button onClick={() => setOnboardingStep(s => s + 1)}>
                {isWideStep ? "Fortsett" : "Neste"}
              </Button>
            ) : (
              <Button onClick={() => {
                setIsGettingStartedOpen(false);
                setOnboardingStep(0);
                setOnboardingCompleted(true);
                try { localStorage.setItem("tidum_onboarding_done", "1"); } catch {}
                fetch("/api/user-state/settings", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ onboardingCompleted: true }),
                }).catch(() => { /* offline tolerated, will retry next session */ });
              }}>
                Fullfør
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      );
      })()}
    </div>
  );
}

/** Map effective sidebar role to the role buckets the tour understands. */
function tourRoleFromEffective(role: string): TidumTourRole {
  const r = (role || "").toLowerCase();
  if (r === "miljoarbeider" || r === "user" || r === "member") return "miljoarbeider";
  if (r === "tiltaksleder" || r === "teamleder" || r === "case_manager") return "tiltaksleder";
  if (r === "vendor_admin" || r === "hovedadmin" || r === "admin") return "vendor_admin";
  if (r === "super_admin") return "super_admin";
  return "default";
}

/* ─────────────────────────────────────────────────────────────────────────
   Stuck-detection floating prompt — surfaces a contextual help offer when
   the user appears idle, lost, or frustrated.
   ───────────────────────────────────────────────────────────────────────── */
function StuckHelperPrompt({
  reason,
  onDismiss,
  onStartTour,
  onOpenGuide,
}: {
  reason: "idle" | "nav" | "dialog" | null;
  onDismiss: () => void;
  onStartTour: () => void;
  onOpenGuide: () => void;
}) {
  const { config } = useGuideConfig();
  const msg = config.stuck.messages[reason ?? "idle"];
  const labels = config.stuck.actions;

  return (
    <div
      className="fixed bottom-6 right-6 z-40 w-80 rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
      role="status"
      data-testid="stuck-helper-prompt"
    >
      <div className="px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white flex items-center gap-2">
        <HelpCircle className="h-4 w-4" />
        <span className="text-sm font-semibold flex-1">{msg.title}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-white/15"
          aria-label="Lukk"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 py-3 text-sm text-slate-600">{msg.body}</div>
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onStartTour}>{labels.tourLabel}</Button>
        <Button size="sm" variant="outline" onClick={onOpenGuide}>{labels.guideLabel}</Button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-slate-400 hover:text-slate-600 ml-auto self-center"
        >
          {labels.dismissLabel}
        </button>
      </div>
    </div>
  );
}
