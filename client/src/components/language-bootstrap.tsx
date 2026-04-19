/**
 * Applies the user's saved language preference on app mount. Reads
 * /api/profile (cached) and calls setAppLanguage so i18next picks up
 * the right resource bundle. Without this, the saved language only
 * takes effect after the user manually toggles it in /settings.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { setAppLanguage } from "@/lib/i18n";

interface ProfileLite { language?: string | null }

export function LanguageBootstrap() {
  const { data } = useQuery<ProfileLite>({
    queryKey: ["/api/profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (data?.language) setAppLanguage(data.language);
  }, [data?.language]);

  return null;
}
