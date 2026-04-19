/**
 * Applies the CMS-controlled default theme on app mount for users who
 * haven't explicitly chosen one. Users who toggle the theme themselves
 * keep their choice (stored in localStorage); only the *default* is
 * remote-controlled.
 */
import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import { useGuideConfig } from "@/hooks/use-guide-config";

const STORAGE_KEY = "smart-timing-theme";

export function ThemeBootstrap() {
  const { config, isLoading } = useGuideConfig();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (isLoading) return;
    let userHasOverride = false;
    try { userHasOverride = !!localStorage.getItem(STORAGE_KEY); } catch {}
    if (userHasOverride) return;

    const remote = config.appDefaults.defaultTheme;
    // Map "auto" → "system" so ThemeProvider follows OS preference.
    const target = remote === "auto" ? "system" : remote;
    setTheme(target as "light" | "dark" | "system");
  }, [isLoading, config.appDefaults.defaultTheme, setTheme]);

  return null;
}
