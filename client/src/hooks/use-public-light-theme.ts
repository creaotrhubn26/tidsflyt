import { useEffect } from "react";

const THEME_CLASSES = ["light", "dark", "sepia", "high-contrast"] as const;

export function usePublicLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const previousThemeClasses = THEME_CLASSES.filter((themeClass) =>
      root.classList.contains(themeClass),
    );
    const previousFilter = root.style.filter;

    root.classList.remove(...THEME_CLASSES);
    root.classList.add("light");
    root.style.filter = "";

    return () => {
      root.classList.remove(...THEME_CLASSES);
      if (previousThemeClasses.length > 0) {
        root.classList.add(...previousThemeClasses);
      }
      root.style.filter = previousFilter;
    };
  }, []);
}
