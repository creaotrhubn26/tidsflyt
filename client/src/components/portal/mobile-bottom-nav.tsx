import { Link, useLocation } from "wouter";
import { LayoutDashboard, Clock, FileText, User, ClipboardList, FolderKanban, MoreHorizontal, Send, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { normalizeRole } from "@shared/roles";

interface MobileNavItem {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles?: string[];
}

// Primary items always visible in bottom bar
const primaryItems: MobileNavItem[] = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/time", icon: Clock, label: "Timer" },
  { path: "/case-reports", icon: ClipboardList, label: "Rapporter" },
];

// Secondary items shown in the "More" sheet
const secondaryItems: MobileNavItem[] = [
  { path: "/reports", icon: FileText, label: "Rapporter", roles: ["tiltaksleder"] },
  { path: "/cases", icon: FolderKanban, label: "Saker", roles: ["tiltaksleder"] },
  { path: "/invites", icon: UserPlus, label: "Invitasjoner", roles: ["tiltaksleder"] },
  { path: "/leave", icon: Clock, label: "Fravær" },
  { path: "/forward", icon: Send, label: "Send videre", roles: ["tiltaksleder"] },
  { path: "/profile", icon: User, label: "Profil" },
];

export function MobileBottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const normalizedUserRole = normalizeRole(user?.role);
  const [moreOpen, setMoreOpen] = useState(false);

  const filterByRole = (items: MobileNavItem[]) =>
    items.filter(
      (item) =>
        !(item.path === "/time" && normalizedUserRole === "tiltaksleder") &&
        (!item.roles || item.roles.map((r) => normalizeRole(r)).includes(normalizedUserRole))
    );

  const visiblePrimary = useMemo(() => filterByRole(primaryItems), [normalizedUserRole]);
  const visibleSecondary = useMemo(() => filterByRole(secondaryItems), [normalizedUserRole]);

  // Check if current location matches a secondary item (highlight "More")
  const isSecondaryActive = visibleSecondary.some((item) => location === item.path);

  return (
    <>
      {/* More sheet overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-16 left-0 right-0 bg-card border-t border-border rounded-t-xl shadow-lg animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 grid grid-cols-3 gap-1">
              {visibleSecondary.map((item) => {
                const isActive = location === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-lg transition-colors",
                      isActive
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                    <span className="text-xs font-medium text-center">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden"
        data-testid="mobile-bottom-nav"
      >
        <div className="flex items-center justify-around h-16 px-2">
          {visiblePrimary.map((item) => {
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

          {/* More button */}
          <button
            type="button"
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[64px]",
              isSecondaryActive || moreOpen
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover-elevate"
            )}
            onClick={() => setMoreOpen((v) => !v)}
            data-testid="nav-more"
          >
            <MoreHorizontal className={cn("h-5 w-5", (isSecondaryActive || moreOpen) && "text-primary")} />
            <span className="text-xs font-medium">Mer</span>
          </button>
        </div>
      </nav>
    </>
  );
}
