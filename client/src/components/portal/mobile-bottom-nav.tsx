import { Link, useLocation } from "wouter";
import { LayoutDashboard, Clock, FileText, User, ClipboardList, FolderKanban, MoreHorizontal, Send, UserPlus, X } from "lucide-react";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useRolePreview } from "@/hooks/use-role-preview";

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
  { path: "/rapporter", icon: FileText, label: "Rapporter" },
];

// Secondary items shown in the "More" sheet
const secondaryItems: MobileNavItem[] = [
  { path: "/rapporter/godkjenning", icon: ClipboardList, label: "Godkjenning", roles: ["tiltaksleder"] },
  { path: "/cases", icon: FolderKanban, label: "Saker", roles: ["tiltaksleder"] },
  { path: "/invites", icon: UserPlus, label: "Invitasjoner", roles: ["tiltaksleder"] },
  { path: "/case-reports", icon: ClipboardList, label: "Saksrapporter" },
  { path: "/leave", icon: Clock, label: "Fravær" },
  { path: "/forward", icon: Send, label: "Send videre", roles: ["tiltaksleder"] },
  { path: "/profile", icon: User, label: "Profil" },
];

export function MobileBottomNav() {
  const [location] = useLocation();
  const { effectiveRole: normalizedUserRole } = useRolePreview();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filterByRole = (items: MobileNavItem[]) =>
    items.filter(
      (item) =>
        !(item.path === "/time" && normalizedUserRole === "tiltaksleder") &&
        (!item.roles || item.roles.includes(normalizedUserRole))
    );

  const visiblePrimary = useMemo(() => filterByRole(primaryItems), [normalizedUserRole]);
  const visibleSecondary = useMemo(() => filterByRole(secondaryItems), [normalizedUserRole]);

  // Check if current location matches a secondary item (highlight "More")
  const isSecondaryActive = visibleSecondary.some((item) => location === item.path);

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && moreOpen) {
      setMoreOpen(false);
      triggerRef.current?.focus();
    }
  }, [moreOpen]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Focus trap inside "More" sheet
  useEffect(() => {
    if (moreOpen && sheetRef.current) {
      const firstLink = sheetRef.current.querySelector("a");
      firstLink?.focus();
    }
  }, [moreOpen]);

  return (
    <>
      {/* More sheet overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMoreOpen(false)}
          role="presentation"
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            ref={sheetRef}
            role="dialog"
            aria-label="Navigasjonsmeny"
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
                      "flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-lg transition-colors min-h-[56px]",
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
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden pb-[env(safe-area-inset-bottom)]"
        aria-label="Hovednavigasjon"
        data-testid="mobile-bottom-nav"
      >
        <div className="flex items-center justify-around h-16 px-2">
          {visiblePrimary.map((item) => {
            const isActive = location === item.path || (item.path === "/rapporter" && location.startsWith("/rapporter"));
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[64px] min-h-[44px]",
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
            ref={triggerRef}
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            aria-label="Flere navigasjonsvalg"
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[64px] min-h-[44px]",
              isSecondaryActive || moreOpen
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover-elevate"
            )}
            onClick={() => setMoreOpen((v) => !v)}
            data-testid="nav-more"
          >
            {moreOpen
              ? <X className="h-5 w-5 text-primary" />
              : <MoreHorizontal className={cn("h-5 w-5", (isSecondaryActive || moreOpen) && "text-primary")} />
            }
            <span className="text-xs font-medium">Mer</span>
          </button>
        </div>
      </nav>
    </>
  );
}
