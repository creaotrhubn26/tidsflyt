/**
 * shared/nav-config.ts
 *
 * Single source of truth for the CMS-editable navigation overrides.
 * Routes themselves stay code-defined (App.tsx) — admins can:
 *   - rename labels for any sidebar item by path
 *   - hide items from the sidebar by path
 *   - rename category section headers in the portal sidebar
 *   - add free-form links to the public landing header + footer
 *
 * Stored in site_settings under key="nav_config".
 */

export interface PortalSidebarOverride {
  /** Override the displayed label. */
  label?: string;
  /** Hide the item from the sidebar. */
  hidden?: boolean;
  /** Move the item to a different category. */
  category?: string;
}

export interface PublicLink {
  label: string;
  /** Internal route ("/blog") or external URL ("https://example.com"). */
  href: string;
  /** Hint that the link is external (opens in new tab). Inferred from href if omitted. */
  external?: boolean;
  /** Optional Lucide icon name shown next to the label. */
  icon?: string;
}

export interface NavConfig {
  /** Per-path overrides keyed by the sidebar item's path (e.g. "/dashboard"). */
  portalSidebarOverrides: Record<string, PortalSidebarOverride>;
  /** Override category section labels in the portal sidebar. */
  portalCategoryLabels: Record<string, string>;
  /** Extra links injected into the public landing header (after defaults). */
  publicHeaderLinks: PublicLink[];
  /** Extra links injected into the public landing footer "Lenker" column. */
  publicFooterLinks: PublicLink[];
}

export const DEFAULT_NAV_CONFIG: NavConfig = {
  portalSidebarOverrides: {},
  portalCategoryLabels: {},
  publicHeaderLinks: [],
  publicFooterLinks: [],
};

export function mergeNavConfig(override: Partial<NavConfig> | null | undefined): NavConfig {
  if (!override || typeof override !== "object") return DEFAULT_NAV_CONFIG;
  return {
    portalSidebarOverrides:
      override.portalSidebarOverrides && typeof override.portalSidebarOverrides === "object"
        ? override.portalSidebarOverrides
        : {},
    portalCategoryLabels:
      override.portalCategoryLabels && typeof override.portalCategoryLabels === "object"
        ? override.portalCategoryLabels
        : {},
    publicHeaderLinks: Array.isArray(override.publicHeaderLinks) ? override.publicHeaderLinks : [],
    publicFooterLinks: Array.isArray(override.publicFooterLinks) ? override.publicFooterLinks : [],
  };
}

export const NAV_CONFIG_KEY = "nav_config";

/** Best-guess: any href starting with http(s) or // is external. */
export function isExternalHref(href: string): boolean {
  return /^(https?:|\/\/)/i.test(href);
}
