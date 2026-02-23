import { Link, useLocation } from "wouter";
import { LayoutDashboard, Clock, FileText, User } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { normalizeRole } from "@shared/roles";

interface MobileNavItem {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles?: string[];
}

const navItems: MobileNavItem[] = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/time", icon: Clock, label: "Timer" },
  { path: "/reports", icon: FileText, label: "Rapporter", roles: ["tiltaksleder"] },
  { path: "/profile", icon: User, label: "Profil" },
];

export function MobileBottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const normalizedUserRole = normalizeRole(user?.role);
  const visibleNavItems = useMemo(
    () =>
      navItems.filter(
        (item) =>
          !(item.path === "/time" && normalizedUserRole === "tiltaksleder")
          && (!item.roles || item.roles.map((role) => normalizeRole(role)).includes(normalizedUserRole)),
      ),
    [normalizedUserRole],
  );

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden"
      data-testid="mobile-bottom-nav"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {visibleNavItems.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[64px]",
                isActive 
                  ? "text-primary bg-primary/10" 
                  : "text-muted-foreground hover-elevate"
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
