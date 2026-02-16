import * as React from "react";

import { getResponsiveTier, type ResponsiveTier } from "@/lib/responsive";

export function useResponsiveTier() {
  const [tier, setTier] = React.useState<ResponsiveTier>(() => {
    if (typeof window === "undefined") {
      return "base";
    }
    return getResponsiveTier(window.innerWidth);
  });

  React.useEffect(() => {
    const onResize = () => setTier(getResponsiveTier(window.innerWidth));

    window.addEventListener("resize", onResize);
    onResize();

    return () => window.removeEventListener("resize", onResize);
  }, []);

  return tier;
}
