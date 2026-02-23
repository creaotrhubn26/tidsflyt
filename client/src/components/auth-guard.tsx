import { type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { normalizeRole } from "@shared/roles";

interface AuthGuardProps {
  children: ReactNode;
  /** If set, require the user to have one of these roles */
  requiredRoles?: string[];
}

export function AuthGuard({ children, requiredRoles }: AuthGuardProps) {
  // DEV MODE: bypass auth to allow full page access
  const isDev = import.meta.env.DEV;
  const { user, isLoading, isAuthenticated } = useAuth();

  const hasRequiredRole = (() => {
    if (!requiredRoles || !user) return true;
    const normalizedUserRole = normalizeRole(user.role);
    const normalizedRequiredRoles = requiredRoles.map((role) => normalizeRole(role));
    return normalizedRequiredRoles.includes(normalizedUserRole);
  })();

  if (isDev) {
    if (!hasRequiredRole) {
      return <Redirect to="/dashboard" />;
    }
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="inline-flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
          Laster...
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/" />;
  }

  if (!hasRequiredRole) {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}
