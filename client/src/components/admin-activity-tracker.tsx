import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

async function postPageView(path: string): Promise<void> {
  const token = sessionStorage.getItem("cms_admin_token");
  try {
    await fetch("/api/admin/activity/page-view", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ path }),
    });
  } catch {
    // Best-effort — en tapt sidevisning skal aldri påvirke brukeropplevelsen.
  }
}

export function AdminActivityTracker() {
  const [location] = useLocation();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!location.startsWith("/admin")) return;
    if (lastTrackedPath.current === location) return;
    lastTrackedPath.current = location;
    postPageView(location);
  }, [location]);

  return null;
}
