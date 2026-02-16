export const RESPONSIVE_BREAKPOINTS = {
  xs: 375,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
  "3xl": 1920,
} as const;

export type ResponsiveTier = "base" | keyof typeof RESPONSIVE_BREAKPOINTS;

const ORDERED_TIERS: Array<{ tier: ResponsiveTier; minWidth: number }> = [
  { tier: "base", minWidth: 0 },
  { tier: "xs", minWidth: RESPONSIVE_BREAKPOINTS.xs },
  { tier: "sm", minWidth: RESPONSIVE_BREAKPOINTS.sm },
  { tier: "md", minWidth: RESPONSIVE_BREAKPOINTS.md },
  { tier: "lg", minWidth: RESPONSIVE_BREAKPOINTS.lg },
  { tier: "xl", minWidth: RESPONSIVE_BREAKPOINTS.xl },
  { tier: "2xl", minWidth: RESPONSIVE_BREAKPOINTS["2xl"] },
  { tier: "3xl", minWidth: RESPONSIVE_BREAKPOINTS["3xl"] },
];

export const RESPONSIVE_TIERS = ORDERED_TIERS;

export function getResponsiveTier(width: number): ResponsiveTier {
  for (let i = ORDERED_TIERS.length - 1; i >= 0; i -= 1) {
    if (width >= ORDERED_TIERS[i].minWidth) {
      return ORDERED_TIERS[i].tier;
    }
  }
  return "base";
}
