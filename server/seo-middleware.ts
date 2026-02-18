/**
 * Server-side SEO Middleware for Tidum
 *
 * Intercepts requests from search engine crawlers and social media scrapers,
 * then injects the correct <title>, <meta>, Open Graph, Twitter Card,
 * JSON-LD structured data, and verification tags into the HTML before serving.
 *
 * This is critical because Tidum is an SPA — without this middleware,
 * crawlers see only the default index.html meta tags.
 */

import type { Request, Response, NextFunction } from "express";
import { pool } from "./db";

// ── Bot detection ────────────────────────────────────────────────────
const BOT_UA_PATTERN =
  /googlebot|bingbot|yandexbot|duckduckbot|baiduspider|slurp|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegram|discordbot|applebot|pinterestbot|redditbot|slackbot|embedly|quora|outbrain|rogerbot|showyoubot|ia_archiver|archive\.org_bot|semrushbot|ahrefsbot|mj12bot|dotbot/i;

export function isBot(ua: string | undefined): boolean {
  return !!ua && BOT_UA_PATTERN.test(ua);
}

// ── Hardcoded page SEO defaults (Norwegian) ─────────────────────────
interface PageMeta {
  title: string;
  description: string;
  ogType?: string;
  canonical?: string;
}

const STATIC_PAGE_SEO: Record<string, PageMeta> = {
  "/": {
    title: "Tidum – Profesjonell timeføring for norske bedrifter",
    description:
      "Tidum gjør timeføring enkelt. Profesjonell timeregistrering, rapportering og arbeidsadministrasjon for norske bedrifter. Start gratis i dag.",
  },
  "/kontakt": {
    title: "Kontakt oss – Tidum",
    description:
      "Ta kontakt med Tidum for spørsmål om timeregistrering, priser eller support. Vi hjelper deg gjerne.",
  },
  "/personvern": {
    title: "Personvernerklæring – Tidum",
    description:
      "Les Tidums personvernerklæring. Vi tar ditt personvern på alvor og følger GDPR.",
  },
  "/vilkar": {
    title: "Brukervilkår – Tidum",
    description:
      "Les Tidums brukervilkår for bruk av tjenesten.",
  },
  "/hvorfor": {
    title: "Hvorfor Tidum? – Fordeler og funksjoner",
    description:
      "Oppdag hvorfor Tidum er det beste valget for timeføring. Spar tid, få kontroll og forenkle arbeidsadministrasjonen.",
  },
  "/guide": {
    title: "Interaktiv guide – Tidum",
    description:
      "Lær hvordan du bruker Tidum med vår interaktive guide. Kom i gang på minutter.",
  },
  "/blog": {
    title: "Blogg – Tidum",
    description:
      "Les siste nytt, tips og guider om timeregistrering, effektivitet og arbeidsadministrasjon fra Tidum.",
    ogType: "blog",
  },
};

// ── HTML escaping ───────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Meta tag injection into template HTML ───────────────────────────
function injectMeta(
  html: string,
  meta: {
    title: string;
    description: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogType?: string;
    ogUrl?: string;
    twitterTitle?: string;
    twitterDescription?: string;
    twitterImage?: string;
    canonical?: string;
    robots?: string;
    jsonLd?: object;
    articlePublished?: string;
    articleModified?: string;
    googleVerification?: string;
    bingVerification?: string;
  },
): string {
  const title = esc(meta.title);
  const desc = esc(meta.description);

  // Replace <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);

  // Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${desc}">`,
  );

  // Replace OG tags
  const ogTitle = esc(meta.ogTitle || meta.title);
  const ogDesc = esc(meta.ogDescription || meta.description);
  html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${ogTitle}">`,
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${ogDesc}">`,
  );
  if (meta.ogType) {
    html = html.replace(
      /<meta property="og:type" content="[^"]*">/,
      `<meta property="og:type" content="${esc(meta.ogType)}">`,
    );
  }
  if (meta.ogUrl) {
    html = html.replace(
      /<meta property="og:url" content="[^"]*">/,
      `<meta property="og:url" content="${esc(meta.ogUrl)}">`,
    );
  }
  if (meta.ogImage) {
    html = html.replace(
      /<meta property="og:image" content="[^"]*">/,
      `<meta property="og:image" content="${esc(meta.ogImage)}">`,
    );
  }

  // Replace Twitter tags
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${esc(meta.twitterTitle || meta.ogTitle || meta.title)}">`,
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${esc(meta.twitterDescription || meta.ogDescription || meta.description)}">`,
  );
  if (meta.twitterImage || meta.ogImage) {
    html = html.replace(
      /<meta name="twitter:image" content="[^"]*">/,
      `<meta name="twitter:image" content="${esc(meta.twitterImage || meta.ogImage || '')}">`,
    );
  }

  // Replace canonical
  if (meta.canonical) {
    html = html.replace(
      /<link rel="canonical" href="[^"]*">/,
      `<link rel="canonical" href="${esc(meta.canonical)}">`,
    );
  }

  // Replace robots if specified
  if (meta.robots) {
    html = html.replace(
      /<meta name="robots" content="[^"]*">/,
      `<meta name="robots" content="${esc(meta.robots)}">`,
    );
  }

  // Article-specific OG tags
  let articleTags = "";
  if (meta.articlePublished) {
    articleTags += `\n    <meta property="article:published_time" content="${esc(meta.articlePublished)}">`;
  }
  if (meta.articleModified) {
    articleTags += `\n    <meta property="article:modified_time" content="${esc(meta.articleModified)}">`;
  }

  // Inject verification + article tags + JSON-LD before </head>
  let inject = "";
  if (meta.googleVerification) {
    inject += `\n    <meta name="google-site-verification" content="${esc(meta.googleVerification)}">`;
  }
  if (meta.bingVerification) {
    inject += `\n    <meta name="msvalidate.01" content="${esc(meta.bingVerification)}">`;
  }
  inject += articleTags;
  if (meta.jsonLd) {
    inject += `\n    <script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>`;
  }

  // Replace the verification placeholder
  html = html.replace("<!--seo:verification-->", inject);

  return html;
}

// ── Main middleware ─────────────────────────────────────────────────
export function seoMiddleware(getHtml: () => Promise<string>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ua = req.headers["user-agent"];
    const path = req.path;

    // Only intercept HTML page requests from bots (not API, assets, etc.)
    if (!isBot(ua)) return next();
    if (path.startsWith("/api/") || path.startsWith("/assets/") || path.includes(".")) return next();

    try {
      let html = await getHtml();
      const baseUrl = `https://${req.get("host") || "tidum.no"}`;
      const fullUrl = `${baseUrl}${path}`;

      // Fetch global SEO settings for verification codes
      let globalSeo: any = null;
      try {
        const gs = await pool.query("SELECT * FROM seo_global_settings WHERE id = 1");
        if (gs.rows.length > 0) globalSeo = gs.rows[0];
      } catch { /* table might not exist */ }

      // Try DB-driven per-page SEO first
      let dbPage: any = null;
      try {
        const sp = await pool.query(
          "SELECT * FROM seo_pages WHERE page_path = $1 AND is_active = true",
          [path],
        );
        if (sp.rows.length > 0) dbPage = sp.rows[0];
      } catch { /* table might not exist */ }

      // ── Blog post: /blog/:slug ──
      if (path.startsWith("/blog/") && path !== "/blog/") {
        const slug = path.replace("/blog/", "").replace(/\/$/, "");
        try {
          const postResult = await pool.query(
            `SELECT title, slug, excerpt, content, featured_image, author, meta_title, meta_description, og_image,
                    reading_time, word_count, published_at, updated_at, tags
             FROM cms_posts WHERE slug = $1 AND status = 'published'`,
            [slug],
          );
          if (postResult.rows.length > 0) {
            const post = postResult.rows[0];
            const title = post.meta_title || post.title;

            html = injectMeta(html, {
              title: `${title} | Tidum Blogg`,
              description: post.meta_description || post.excerpt || "",
              ogTitle: title,
              ogDescription: post.meta_description || post.excerpt || "",
              ogImage: post.og_image || post.featured_image || globalSeo?.default_og_image,
              ogType: "article",
              ogUrl: fullUrl,
              canonical: fullUrl,
              articlePublished: post.published_at,
              articleModified: post.updated_at,
              googleVerification: globalSeo?.google_verification,
              bingVerification: globalSeo?.bing_verification,
              jsonLd: {
                "@context": "https://schema.org",
                "@type": "BlogPosting",
                headline: post.title,
                description: post.excerpt,
                image: post.featured_image,
                url: fullUrl,
                mainEntityOfPage: { "@type": "WebPage", "@id": fullUrl },
                author: post.author
                  ? { "@type": "Person", name: post.author }
                  : { "@type": "Organization", name: "Tidum" },
                publisher: {
                  "@type": "Organization",
                  name: "Tidum",
                  url: baseUrl,
                  logo: { "@type": "ImageObject", url: `${baseUrl}/apple-touch-icon.png` },
                },
                datePublished: post.published_at,
                dateModified: post.updated_at,
                wordCount: post.word_count,
                keywords: post.tags?.join(", "),
                inLanguage: "nb-NO",
              },
            });

            return res.status(200).set("Content-Type", "text/html").end(html);
          }
        } catch { /* fall through */ }
      }

      // ── Builder page: /p/:slug ──
      if (path.startsWith("/p/")) {
        const slug = path.replace("/p/", "").replace(/\/$/, "");
        try {
          const pageResult = await pool.query(
            `SELECT title, meta_title, meta_description, og_image, canonical_url
             FROM builder_pages WHERE slug = $1 AND status = 'published'`,
            [slug],
          );
          if (pageResult.rows.length > 0) {
            const pg = pageResult.rows[0];
            html = injectMeta(html, {
              title: pg.meta_title || pg.title || "Tidum",
              description: pg.meta_description || "",
              ogImage: pg.og_image || globalSeo?.default_og_image,
              ogUrl: fullUrl,
              canonical: pg.canonical_url || fullUrl,
              googleVerification: globalSeo?.google_verification,
              bingVerification: globalSeo?.bing_verification,
            });
            return res.status(200).set("Content-Type", "text/html").end(html);
          }
        } catch { /* fall through */ }
      }

      // ── DB-driven page SEO ──
      if (dbPage) {
        html = injectMeta(html, {
          title: dbPage.title || "Tidum",
          description: dbPage.meta_description || "",
          ogTitle: dbPage.og_title,
          ogDescription: dbPage.og_description,
          ogImage: dbPage.og_image || globalSeo?.default_og_image,
          ogType: dbPage.og_type || "website",
          ogUrl: fullUrl,
          twitterTitle: dbPage.twitter_title,
          twitterDescription: dbPage.twitter_description,
          twitterImage: dbPage.twitter_image,
          canonical: dbPage.canonical_url || fullUrl,
          robots: `${dbPage.robots_index ? "index" : "noindex"}, ${dbPage.robots_follow ? "follow" : "nofollow"}`,
          googleVerification: globalSeo?.google_verification,
          bingVerification: globalSeo?.bing_verification,
          jsonLd: dbPage.structured_data ? (typeof dbPage.structured_data === "string" ? JSON.parse(dbPage.structured_data) : dbPage.structured_data) : undefined,
        });
        return res.status(200).set("Content-Type", "text/html").end(html);
      }

      // ── Static page defaults ──
      const staticMeta = STATIC_PAGE_SEO[path];
      if (staticMeta) {
        const jsonLd =
          path === "/"
            ? {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "Tidum",
                url: baseUrl,
                description: staticMeta.description,
                inLanguage: "nb-NO",
                potentialAction: {
                  "@type": "SearchAction",
                  target: `${baseUrl}/blog?q={search_term_string}`,
                  "query-input": "required name=search_term_string",
                },
              }
            : path === "/blog"
              ? {
                  "@context": "https://schema.org",
                  "@type": "Blog",
                  name: "Tidum Blogg",
                  url: `${baseUrl}/blog`,
                  description: staticMeta.description,
                  inLanguage: "nb-NO",
                  publisher: {
                    "@type": "Organization",
                    name: "Tidum",
                    url: baseUrl,
                  },
                }
              : undefined;

        html = injectMeta(html, {
          title: staticMeta.title,
          description: staticMeta.description,
          ogType: staticMeta.ogType || "website",
          ogUrl: fullUrl,
          canonical: staticMeta.canonical || fullUrl,
          googleVerification: globalSeo?.google_verification,
          bingVerification: globalSeo?.bing_verification,
          jsonLd,
        });
        return res.status(200).set("Content-Type", "text/html").end(html);
      }

      // ── Fallback: inject verification only ──
      html = injectMeta(html, {
        title: "Tidum – Profesjonell timeføring for norske bedrifter",
        description: "Profesjonell timeregistrering og arbeidsadministrasjon for norske bedrifter.",
        ogUrl: fullUrl,
        canonical: fullUrl,
        googleVerification: globalSeo?.google_verification,
        bingVerification: globalSeo?.bing_verification,
      });
      return res.status(200).set("Content-Type", "text/html").end(html);
    } catch (err) {
      // If anything goes wrong, serve without injection
      console.error("[SEO middleware]", err);
      return next();
    }
  };
}
