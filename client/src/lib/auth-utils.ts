export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const candidate = value.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return null;
  }

  return candidate;
}

export function getCurrentReturnTo(defaultPath = "/dashboard"): string {
  if (typeof window === "undefined") {
    return defaultPath;
  }

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return sanitizeReturnTo(current) ?? defaultPath;
}

export function buildGoogleAuthUrl(returnTo?: string | null): string {
  const params = new URLSearchParams();
  const sanitizedReturnTo = sanitizeReturnTo(returnTo);
  if (sanitizedReturnTo) {
    params.set("returnTo", sanitizedReturnTo);
  }
  const query = params.toString();
  return query ? `/api/auth/google?${query}` : "/api/auth/google";
}

// Redirect to login with a toast notification
export function redirectToLogin(toast?: (options: { title: string; description: string; variant: string }) => void) {
  if (toast) {
    toast({
      title: "Unauthorized",
      description: "You are logged out. Logging in again...",
      variant: "destructive",
    });
  }
  setTimeout(() => {
    window.location.href = buildGoogleAuthUrl(getCurrentReturnTo());
  }, 500);
}
