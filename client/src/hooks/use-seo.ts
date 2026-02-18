import { useEffect } from "react";

/**
 * Client-side SEO hook.
 * Sets document.title, meta description, OG tags, Twitter Cards,
 * canonical link, and JSON-LD on every page navigation.
 *
 * Works in tandem with the server-side seo-middleware, which handles
 * bots/crawlers. This hook covers the browser experience + any crawler
 * that _does_ execute JavaScript (Googlebot).
 */
interface SEOOptions {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  ogUrl?: string;
  twitterCard?: "summary" | "summary_large_image";
  canonical?: string;
  robots?: string;
  jsonLd?: object | null;
  articlePublished?: string;
  articleModified?: string;
}

function setMeta(nameOrProp: string, content: string) {
  const isOg = nameOrProp.startsWith("og:") || nameOrProp.startsWith("article:");
  const selector = isOg
    ? `meta[property="${nameOrProp}"]`
    : `meta[name="${nameOrProp}"]`;

  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(isOg ? "property" : "name", nameOrProp);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function removeEl(selector: string) {
  document.querySelector(selector)?.remove();
}

export function useSEO(opts: SEOOptions) {
  useEffect(() => {
    const prevTitle = document.title;

    // Title
    document.title = opts.title;

    // Meta description
    if (opts.description) {
      setMeta("description", opts.description);
    }

    // Open Graph
    setMeta("og:title", opts.ogTitle || opts.title);
    setMeta("og:description", opts.ogDescription || opts.description || "");
    if (opts.ogType) setMeta("og:type", opts.ogType);
    setMeta("og:url", opts.ogUrl || window.location.href);
    setMeta("og:site_name", "Tidum");
    setMeta("og:locale", "nb_NO");
    if (opts.ogImage) setMeta("og:image", opts.ogImage);

    // Twitter Card
    setMeta("twitter:card", opts.twitterCard || "summary_large_image");
    setMeta("twitter:title", opts.ogTitle || opts.title);
    setMeta("twitter:description", opts.ogDescription || opts.description || "");
    if (opts.ogImage) setMeta("twitter:image", opts.ogImage);

    // Canonical
    if (opts.canonical) {
      setLink("canonical", opts.canonical);
    }

    // Robots
    if (opts.robots) {
      setMeta("robots", opts.robots);
    }

    // Article tags
    if (opts.articlePublished) setMeta("article:published_time", opts.articlePublished);
    if (opts.articleModified) setMeta("article:modified_time", opts.articleModified);

    // JSON-LD
    let ldScript: HTMLScriptElement | null = null;
    if (opts.jsonLd) {
      ldScript = document.querySelector('script[data-seo-ld]') as HTMLScriptElement | null;
      if (!ldScript) {
        ldScript = document.createElement("script");
        ldScript.type = "application/ld+json";
        ldScript.setAttribute("data-seo-ld", "true");
        document.head.appendChild(ldScript);
      }
      ldScript.textContent = JSON.stringify(opts.jsonLd);
    }

    // Cleanup on unmount / navigation
    return () => {
      document.title = prevTitle;
      // Remove dynamically added article tags
      removeEl('meta[property="article:published_time"]');
      removeEl('meta[property="article:modified_time"]');
      // Remove JSON-LD
      removeEl("script[data-seo-ld]");
    };
  }, [
    opts.title,
    opts.description,
    opts.ogTitle,
    opts.ogDescription,
    opts.ogImage,
    opts.ogType,
    opts.ogUrl,
    opts.canonical,
    opts.robots,
    opts.twitterCard,
    opts.articlePublished,
    opts.articleModified,
    // jsonLd serialized to detect changes
    opts.jsonLd ? JSON.stringify(opts.jsonLd) : null,
  ]);
}
