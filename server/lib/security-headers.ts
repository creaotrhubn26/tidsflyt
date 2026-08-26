import helmet, { type HelmetOptions } from "helmet";

/**
 * Security headers shared by production and local development.
 *
 * The allowlist mirrors browser-side integrations that are currently in use.
 * Keep it explicit: adding a new browser integration requires a deliberate
 * CSP update and a security review.
 */
export function buildHelmetOptions(
  isProduction = process.env.NODE_ENV === "production",
): HelmetOptions {
  return {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        // JSON-LD in index.html and existing CMS-generated markup still use
        // inline script blocks. Removing this exception requires nonces or
        // hashes and browser verification as a separate hardening step.
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          ...(isProduction ? [] : ["'unsafe-eval'"]),
          "https://www.googletagmanager.com",
          "https://challenges.cloudflare.com",
        ],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        mediaSrc: ["'self'", "blob:", "https:"],
        connectSrc: [
          "'self'",
          ...(isProduction ? [] : ["ws:", "wss:"]),
          "https://data.brreg.no",
          "https://ws.geonorge.no",
          "https://www.googletagmanager.com",
          "https://*.google-analytics.com",
          "https://challenges.cloudflare.com",
          "https://*.ingest.sentry.io",
          "https://*.ingest.us.sentry.io",
        ],
        frameSrc: [
          "'self'",
          "https://challenges.cloudflare.com",
          "https://www.youtube.com",
          "https://www.youtube-nocookie.com",
          "https://player.vimeo.com",
        ],
        workerSrc: ["'self'", "blob:"],
        // Safari upgrades localhost to HTTPS when this directive is active.
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    strictTransportSecurity: isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    referrerPolicy: { policy: "no-referrer" },
    xFrameOptions: { action: "deny" },
  };
}

export function createSecurityHeadersMiddleware(
  isProduction = process.env.NODE_ENV === "production",
) {
  return helmet(buildHelmetOptions(isProduction));
}
