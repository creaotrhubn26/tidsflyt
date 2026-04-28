import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/use-auth";
import { getRoleLabel, normalizeRole, type TidumRole } from "@shared/roles";

export type TidumViewMode = "admin" | "institution" | "miljoarbeider";

interface RolePreviewContextValue {
  actualRole: TidumRole;
  effectiveRole: TidumRole;
  canPreviewRoles: boolean;
  previewMode: TidumViewMode;
  setPreviewMode: (mode: TidumViewMode) => void;
  isPreviewActive: boolean;
  previewModeLabel: string;
  effectiveRoleLabel: string;
  actualRoleLabel: string;
}

const ROLE_PREVIEW_STORAGE_PREFIX = "tidum-role-preview:";
const ADMIN_PREVIEW_ROLES: TidumRole[] = ["super_admin", "hovedadmin", "vendor_admin"];
const RolePreviewContext = createContext<RolePreviewContextValue | null>(null);

function isPreviewEligibleRole(role: TidumRole): boolean {
  return ADMIN_PREVIEW_ROLES.includes(role);
}

function normalizePreviewMode(value: string | null | undefined): TidumViewMode {
  if (value === "institution" || value === "miljoarbeider") {
    return value;
  }
  return "admin";
}

function getStorageKey(userId?: string | null): string | null {
  if (!userId) return null;
  return `${ROLE_PREVIEW_STORAGE_PREFIX}${userId}`;
}

function getEffectiveRoleForPreview(actualRole: TidumRole, previewMode: TidumViewMode): TidumRole {
  switch (previewMode) {
    case "institution":
      return "tiltaksleder";
    case "miljoarbeider":
      return "miljoarbeider";
    case "admin":
    default:
      return actualRole;
  }
}

function getPreviewModeLabel(previewMode: TidumViewMode): string {
  switch (previewMode) {
    case "institution":
      return "Institusjon";
    case "miljoarbeider":
      return "Miljøarbeider";
    case "admin":
    default:
      return "Admin";
  }
}

export function RolePreviewProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const actualRole = normalizeRole(user?.role);
  const canPreviewRoles = isPreviewEligibleRole(actualRole);
  const [previewMode, setPreviewModeState] = useState<TidumViewMode>("admin");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageKey = getStorageKey(user?.id);
    if (!storageKey || !canPreviewRoles) {
      setPreviewModeState("admin");
      return;
    }

    setPreviewModeState(normalizePreviewMode(window.localStorage.getItem(storageKey)));
  }, [canPreviewRoles, user?.id]);

  const setPreviewMode = useCallback(
    (nextMode: TidumViewMode) => {
      const normalizedMode = canPreviewRoles ? normalizePreviewMode(nextMode) : "admin";
      setPreviewModeState(normalizedMode);

      if (typeof window === "undefined") return;
      const storageKey = getStorageKey(user?.id);
      if (!storageKey) return;
      window.localStorage.setItem(storageKey, normalizedMode);
    },
    [canPreviewRoles, user?.id],
  );

  const effectiveRole = canPreviewRoles
    ? getEffectiveRoleForPreview(actualRole, previewMode)
    : actualRole;

  const value = useMemo<RolePreviewContextValue>(
    () => ({
      actualRole,
      effectiveRole,
      canPreviewRoles,
      previewMode,
      setPreviewMode,
      isPreviewActive: canPreviewRoles && previewMode !== "admin",
      previewModeLabel: getPreviewModeLabel(previewMode),
      effectiveRoleLabel: getRoleLabel(effectiveRole),
      actualRoleLabel: getRoleLabel(actualRole),
    }),
    [actualRole, canPreviewRoles, effectiveRole, previewMode, setPreviewMode],
  );

  return <RolePreviewContext.Provider value={value}>{children}</RolePreviewContext.Provider>;
}

export function useRolePreview() {
  const context = useContext(RolePreviewContext);
  if (!context) {
    throw new Error("useRolePreview must be used within RolePreviewProvider");
  }
  return context;
}
