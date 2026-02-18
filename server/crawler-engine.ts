/**
 * Tidum SEO Crawler Engine
 * 
 * Full-featured website crawler with:
 * - Broken link detection (4xx/5xx)
 * - Redirect analysis (chains, loops, types)
 * - Page title & meta analysis
 * - Duplicate content detection (MD5)
 * - Robots.txt & meta robots review
 * - Structured data extraction & validation
 * - hreflang audit
 * - Custom extraction (CSS selector, regex)
 * - Image alt text audit
 * - Accessibility checks
 * - OG & Twitter Card analysis
 */

import { load as cheerioLoad } from "cheerio";
import { createHash } from "crypto";
import { pool } from "./db";
import { URL } from "url";

// ── Types ────────────────────────────────────────────────────────────
interface CrawlConfig {
  jobId: number;
  targetUrl: string;
  maxPages: number;
  maxDepth: number;
  crawlDelayMs: number;
  respectRobotsTxt: boolean;
  followExternalLinks: boolean;
  followSubdomains: boolean;
  includeImages: boolean;
  includeCss: boolean;
  includeJs: boolean;
  checkCanonical: boolean;
  checkHreflang: boolean;
  extractStructuredData: boolean;
  checkAccessibility: boolean;
  customUserAgent?: string;
  customRobotsTxt?: string;
  urlList?: string[];
  includePatterns?: string[];
  excludePatterns?: string[];
  customExtraction?: Array<{
    name: string;
    selector: string;
    type: "css" | "regex";
    attribute?: string;
  }>;
}

interface CrawlResult {
  url: string;
  urlHash: string;
  parentUrl?: string;
  depth: number;
  statusCode?: number;
  contentType?: string;
  responseTimeMs?: number;
  contentSize?: number;
  contentHash?: string;
  redirectUrl?: string;
  redirectChain?: string[];
  redirectType?: string;
  title?: string;
  titleLength?: number;
  metaDescription?: string;
  metaDescriptionLength?: number;
  metaKeywords?: string;
  canonicalUrl?: string;
  canonicalIsSelf?: boolean;
  h1: string[];
  h1Count: number;
  h2: string[];
  h2Count: number;
  robotsMeta?: string;
  robotsTxtAllowed: boolean;
  xRobotsTag?: string;
  internalLinksCount: number;
  externalLinksCount: number;
  brokenLinks: string[];
  imagesCount: number;
  imagesWithoutAlt: number;
  imagesAltText: Array<{ src: string; alt: string; missing: boolean }>;
  hreflang?: Array<{ lang: string; url: string }>;
  hreflangErrors?: string[];
  structuredData?: any;
  structuredDataErrors?: string[];
  ogTags?: Record<string, string>;
  twitterTags?: Record<string, string>;
  wordCount?: number;
  textRatio?: number;
  customData?: Record<string, any>;
  accessibilityIssues?: Array<{ type: string; message: string; selector?: string }>;
  issues: Array<{ type: string; severity: "error" | "warning" | "info"; message: string }>;
  indexable: boolean;
  indexabilityReason?: string;
}

// ── Active crawls tracker ────────────────────────────────────────────
const activeCrawls = new Map<number, { cancel: () => void; progress: () => { crawled: number; total: number } }>();

export function getCrawlProgress(jobId: number) {
  return activeCrawls.get(jobId)?.progress();
}

export function cancelCrawl(jobId: number) {
  activeCrawls.get(jobId)?.cancel();
}

// ── Robots.txt parser ────────────────────────────────────────────────
interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
  sitemaps: string[];
  crawlDelay?: number;
}

function parseRobotsTxt(txt: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let current: RobotsRule | null = null;

  for (const rawLine of txt.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const [directive, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const d = directive.toLowerCase().trim();

    if (d === "user-agent") {
      current = { userAgent: value, allow: [], disallow: [], sitemaps: [] };
      rules.push(current);
    } else if (current) {
      if (d === "allow") current.allow.push(value);
      else if (d === "disallow") current.disallow.push(value);
      else if (d === "sitemap") current.sitemaps.push(value);
      else if (d === "crawl-delay") current.crawlDelay = parseInt(value, 10);
    }
  }
  return rules;
}

function isAllowedByRobots(rules: RobotsRule[], path: string, userAgent: string): boolean {
  // Find matching rules
  const uaLower = userAgent.toLowerCase();
  let matching = rules.filter(r => r.userAgent === "*" || uaLower.includes(r.userAgent.toLowerCase()));
  if (matching.length === 0) return true;

  // Prefer specific UA over wildcard
  const specific = matching.filter(r => r.userAgent !== "*");
  if (specific.length > 0) matching = specific;

  for (const rule of matching) {
    // Check disallow first, then allow overrides
    for (const d of rule.disallow) {
      if (d && path.startsWith(d)) {
        // Check if there's a more specific allow
        for (const a of rule.allow) {
          if (a && path.startsWith(a) && a.length > d.length) return true;
        }
        return false;
      }
    }
  }
  return true;
}

// ── URL helpers ──────────────────────────────────────────────────────
function normalizeUrl(urlStr: string, baseUrl: string): string | null {
  try {
    const url = new URL(urlStr, baseUrl);
    // Remove fragment
    url.hash = "";
    // Remove trailing slash on paths (except root)
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.href;
  } catch {
    return null;
  }
}

function md5(str: string): string {
  return createHash("md5").update(str).digest("hex");
}

function isSameOrigin(url1: string, url2: string): boolean {
  try {
    const a = new URL(url1);
    const b = new URL(url2);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

function isSameDomainOrSubdomain(url1: string, url2: string): boolean {
  try {
    const a = new URL(url1);
    const b = new URL(url2);
    const aDomain = a.hostname.split(".").slice(-2).join(".");
    const bDomain = b.hostname.split(".").slice(-2).join(".");
    return aDomain === bDomain;
  } catch {
    return false;
  }
}

// ── Main Crawler ─────────────────────────────────────────────────────
export async function startCrawl(config: CrawlConfig): Promise<void> {
  let cancelled = false;
  const visited = new Set<string>();
  const queue: Array<{ url: string; parentUrl?: string; depth: number }> = [];
  let crawledCount = 0;
  let totalCount = 0;

  // Register active crawl
  activeCrawls.set(config.jobId, {
    cancel: () => { cancelled = true; },
    progress: () => ({ crawled: crawledCount, total: totalCount }),
  });

  try {
    // Update job status
    await pool.query(
      "UPDATE crawler_jobs SET status = 'running', started_at = NOW() WHERE id = $1",
      [config.jobId]
    );

    // Parse target URL
    const targetOrigin = new URL(config.targetUrl).origin;
    const userAgent = config.customUserAgent || "TidumCrawler/1.0 (+https://tidum.no)";

    // Fetch & parse robots.txt
    let robotsRules: RobotsRule[] = [];
    if (config.respectRobotsTxt && !config.customRobotsTxt) {
      try {
        const robotsRes = await fetchWithTimeout(`${targetOrigin}/robots.txt`, userAgent, 10000);
        if (robotsRes.ok) {
          robotsRules = parseRobotsTxt(await robotsRes.text());
        }
      } catch { /* robots.txt not found */ }
    } else if (config.customRobotsTxt) {
      robotsRules = parseRobotsTxt(config.customRobotsTxt);
    }

    // Build include/exclude matchers
    const includeMatchers = (config.includePatterns || []).map(p => new RegExp(p, "i"));
    const excludeMatchers = (config.excludePatterns || []).map(p => new RegExp(p, "i"));

    const shouldCrawl = (url: string): boolean => {
      if (includeMatchers.length > 0 && !includeMatchers.some(m => m.test(url))) return false;
      if (excludeMatchers.some(m => m.test(url))) return false;
      return true;
    };

    // Seed queue
    if (config.urlList && config.urlList.length > 0) {
      for (const url of config.urlList) {
        const normalized = normalizeUrl(url, config.targetUrl);
        if (normalized && !visited.has(normalized)) {
          visited.add(normalized);
          queue.push({ url: normalized, depth: 0 });
        }
      }
    } else {
      const seedUrl = normalizeUrl(config.targetUrl, config.targetUrl);
      if (seedUrl) {
        visited.add(seedUrl);
        queue.push({ url: seedUrl, depth: 0 });
      }
    }

    totalCount = queue.length;

    // Crawl loop
    while (queue.length > 0 && !cancelled) {
      if (crawledCount >= config.maxPages) break;

      const item = queue.shift()!;
      if (item.depth > config.maxDepth) continue;

      // Respect crawl delay
      if (config.crawlDelayMs > 0 && crawledCount > 0) {
        await sleep(config.crawlDelayMs);
      }

      try {
        const result = await crawlPage(item.url, item.parentUrl, item.depth, config, userAgent, robotsRules, targetOrigin);

        // Save result to DB
        await saveResult(config.jobId, result);
        crawledCount++;

        // Update progress
        await pool.query(
          "UPDATE crawler_jobs SET pages_crawled = $1, pages_total = $2, errors_count = errors_count + $3, warnings_count = warnings_count + $4, updated_at = NOW() WHERE id = $5",
          [
            crawledCount,
            totalCount,
            result.issues.filter(i => i.severity === "error").length,
            result.issues.filter(i => i.severity === "warning").length,
            config.jobId,
          ]
        );

        // Discover new URLs from the page's internal links — only enqueue HTML pages
        if (result.statusCode && result.statusCode >= 200 && result.statusCode < 400 && result.contentType?.includes("text/html")) {
          // We need to re-fetch the page to extract links? No — we stored internal/external counts but need actual URLs.
          // The crawlPage function should return discovered links. Let me adjust the approach:
          // Actually, we discover links inside crawlPage and return them in the result.
          // But we don't have a discoveredLinks array yet — let me include it.
          // For now, the crawlPage already stores internal/external counts and brokenLinks
          // We need actual discovered URLs. Let me handle this through a different mechanism...
        }

      } catch (err: any) {
        // Save error result
        const errorResult: CrawlResult = {
          url: item.url,
          urlHash: md5(item.url),
          parentUrl: item.parentUrl,
          depth: item.depth,
          statusCode: 0,
          robotsTxtAllowed: true,
          h1: [], h1Count: 0, h2: [], h2Count: 0,
          internalLinksCount: 0, externalLinksCount: 0,
          brokenLinks: [],
          imagesCount: 0, imagesWithoutAlt: 0, imagesAltText: [],
          issues: [{ type: "crawl_error", severity: "error", message: `Failed to crawl: ${err.message}` }],
          indexable: false,
          indexabilityReason: "Crawl error",
        };
        await saveResult(config.jobId, errorResult);
        crawledCount++;
      }
    }

    // Mark completed
    const finalStatus = cancelled ? "cancelled" : "completed";
    const duration = Date.now() - (await getJobStartTime(config.jobId));
    await pool.query(
      "UPDATE crawler_jobs SET status = $1, completed_at = NOW(), duration_ms = $2, pages_crawled = $3, pages_total = $4 WHERE id = $5",
      [finalStatus, duration, crawledCount, totalCount, config.jobId]
    );

  } catch (err: any) {
    await pool.query(
      "UPDATE crawler_jobs SET status = 'failed', completed_at = NOW() WHERE id = $1",
      [config.jobId]
    );
    console.error(`[Crawler] Job ${config.jobId} failed:`, err.message);
  } finally {
    activeCrawls.delete(config.jobId);
  }
}

// ── Crawl a single page ──────────────────────────────────────────────
async function crawlPage(
  url: string,
  parentUrl: string | undefined,
  depth: number,
  config: CrawlConfig,
  userAgent: string,
  robotsRules: RobotsRule[],
  targetOrigin: string
): Promise<CrawlResult & { discoveredUrls: Array<{ url: string; depth: number }> }> {
  const issues: CrawlResult["issues"] = [];
  const discoveredUrls: Array<{ url: string; depth: number }> = [];
  const urlObj = new URL(url);

  // Check robots.txt
  const robotsAllowed = config.respectRobotsTxt
    ? isAllowedByRobots(robotsRules, urlObj.pathname, userAgent)
    : true;

  if (!robotsAllowed) {
    return {
      url, urlHash: md5(url), parentUrl, depth,
      robotsTxtAllowed: false,
      h1: [], h1Count: 0, h2: [], h2Count: 0,
      internalLinksCount: 0, externalLinksCount: 0, brokenLinks: [],
      imagesCount: 0, imagesWithoutAlt: 0, imagesAltText: [],
      issues: [{ type: "robots_blocked", severity: "info", message: "Blocked by robots.txt" }],
      indexable: false, indexabilityReason: "Blocked by robots.txt",
      discoveredUrls: [],
    };
  }

  // Fetch the page with redirect tracking
  const startTime = Date.now();
  const redirectChain: string[] = [];
  let finalUrl = url;
  let response: Response;
  let redirectType: string | undefined;

  try {
    response = await fetchWithRedirectTracking(url, userAgent, redirectChain, 10000);
    finalUrl = response.url || url;
    if (redirectChain.length > 0) {
      // Determine redirect type from first hop
      redirectType = redirectChain.length > 1 ? "chain" : "single";
    }
  } catch (err: any) {
    return {
      url, urlHash: md5(url), parentUrl, depth,
      statusCode: 0, responseTimeMs: Date.now() - startTime,
      robotsTxtAllowed: true,
      h1: [], h1Count: 0, h2: [], h2Count: 0,
      internalLinksCount: 0, externalLinksCount: 0, brokenLinks: [],
      imagesCount: 0, imagesWithoutAlt: 0, imagesAltText: [],
      issues: [{ type: "connection_error", severity: "error", message: err.message }],
      indexable: false, indexabilityReason: `Connection error: ${err.message}`,
      discoveredUrls: [],
    };
  }

  const responseTime = Date.now() - startTime;
  const statusCode = response.status;
  const contentType = response.headers.get("content-type") || "";
  const xRobotsTag = response.headers.get("x-robots-tag") || undefined;

  // Status code issues
  if (statusCode >= 400 && statusCode < 500) {
    issues.push({ type: "client_error", severity: "error", message: `HTTP ${statusCode} - Client error` });
  } else if (statusCode >= 500) {
    issues.push({ type: "server_error", severity: "error", message: `HTTP ${statusCode} - Server error` });
  } else if (statusCode >= 300 && statusCode < 400) {
    const rtype = statusCode === 301 ? "permanent" : statusCode === 302 ? "temporary" : String(statusCode);
    issues.push({ type: "redirect", severity: "warning", message: `${rtype} redirect to ${response.headers.get("location") || "unknown"}` });
  }

  // Redirect chain detection
  if (redirectChain.length > 2) {
    issues.push({ type: "redirect_chain", severity: "warning", message: `Redirect chain with ${redirectChain.length} hops` });
  }

  // Slow response
  if (responseTime > 3000) {
    issues.push({ type: "slow_response", severity: "warning", message: `Slow response: ${responseTime}ms` });
  }

  // Non-HTML content
  if (!contentType.includes("text/html")) {
    return {
      url, urlHash: md5(url), parentUrl, depth,
      statusCode, contentType, responseTimeMs: responseTime,
      redirectUrl: redirectChain.length > 0 ? finalUrl : undefined,
      redirectChain: redirectChain.length > 0 ? redirectChain : undefined,
      redirectType,
      robotsTxtAllowed: robotsAllowed, xRobotsTag,
      h1: [], h1Count: 0, h2: [], h2Count: 0,
      internalLinksCount: 0, externalLinksCount: 0, brokenLinks: [],
      imagesCount: 0, imagesWithoutAlt: 0, imagesAltText: [],
      issues,
      indexable: false, indexabilityReason: "Non-HTML content",
      discoveredUrls: [],
    };
  }

  // Parse HTML
  const html = await response.text();
  const contentSize = Buffer.byteLength(html, "utf-8");
  const contentHash = md5(html);
  const $ = cheerioLoad(html);

  // ── Title ──
  const title = $("title").first().text().trim();
  const titleLength = title.length;
  if (!title) issues.push({ type: "missing_title", severity: "error", message: "Missing page title" });
  else if (titleLength < 20) issues.push({ type: "short_title", severity: "warning", message: `Title too short (${titleLength} chars, min 20)` });
  else if (titleLength > 60) issues.push({ type: "long_title", severity: "warning", message: `Title too long (${titleLength} chars, max 60)` });

  // ── Meta description ──
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || "";
  const metaDescriptionLength = metaDescription.length;
  if (!metaDescription) issues.push({ type: "missing_meta_description", severity: "warning", message: "Missing meta description" });
  else if (metaDescriptionLength < 70) issues.push({ type: "short_meta_description", severity: "warning", message: `Meta description too short (${metaDescriptionLength} chars, min 70)` });
  else if (metaDescriptionLength > 160) issues.push({ type: "long_meta_description", severity: "warning", message: `Meta description too long (${metaDescriptionLength} chars, max 160)` });

  const metaKeywords = $('meta[name="keywords"]').attr("content")?.trim() || "";

  // ── Canonical ──
  const canonicalUrl = $('link[rel="canonical"]').attr("href")?.trim() || "";
  let canonicalIsSelf = false;
  if (canonicalUrl) {
    const normalizedCanonical = normalizeUrl(canonicalUrl, url);
    const normalizedSelf = normalizeUrl(url, url);
    canonicalIsSelf = normalizedCanonical === normalizedSelf;
    if (!canonicalIsSelf) {
      issues.push({ type: "non_self_canonical", severity: "warning", message: `Canonical points to different URL: ${canonicalUrl}` });
    }
  } else if (config.checkCanonical) {
    issues.push({ type: "missing_canonical", severity: "info", message: "Missing canonical URL" });
  }

  // ── Headings ──
  const h1: string[] = [];
  $("h1").each((_, el) => { h1.push($(el).text().trim()); });
  const h2: string[] = [];
  $("h2").each((_, el) => { h2.push($(el).text().trim()); });

  if (h1.length === 0) issues.push({ type: "missing_h1", severity: "warning", message: "Missing H1 heading" });
  else if (h1.length > 1) issues.push({ type: "multiple_h1", severity: "warning", message: `Multiple H1 headings (${h1.length})` });

  // ── Meta robots ──
  const robotsMeta = $('meta[name="robots"]').attr("content")?.trim() || "";
  let indexable = true;
  let indexabilityReason: string | undefined;

  if (robotsMeta.includes("noindex")) {
    indexable = false;
    indexabilityReason = "Meta robots noindex";
    issues.push({ type: "noindex", severity: "info", message: "Page has noindex directive" });
  }
  if (xRobotsTag?.includes("noindex")) {
    indexable = false;
    indexabilityReason = "X-Robots-Tag noindex";
    issues.push({ type: "x_robots_noindex", severity: "info", message: "X-Robots-Tag noindex" });
  }
  if (statusCode >= 400) {
    indexable = false;
    indexabilityReason = `HTTP ${statusCode}`;
  }

  // ── Links ──
  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  const brokenLinks: string[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;

    const resolved = normalizeUrl(href, url);
    if (!resolved) return;

    if (isSameOrigin(resolved, targetOrigin)) {
      internalLinks.push(resolved);
      // Add to discovery queue
      if (!discoveredUrls.some(u => u.url === resolved)) {
        discoveredUrls.push({ url: resolved, depth: depth + 1 });
      }
    } else if (config.followSubdomains && isSameDomainOrSubdomain(resolved, targetOrigin)) {
      internalLinks.push(resolved);
      discoveredUrls.push({ url: resolved, depth: depth + 1 });
    } else {
      externalLinks.push(resolved);
      if (config.followExternalLinks) {
        discoveredUrls.push({ url: resolved, depth: depth + 1 });
      }
    }
  });

  // ── Images ──
  const imagesAltText: Array<{ src: string; alt: string; missing: boolean }> = [];
  let imagesWithoutAlt = 0;

  $("img").each((_, el) => {
    const src = $(el).attr("src") || "";
    const alt = $(el).attr("alt");
    const missing = alt === undefined || alt === null;
    if (missing) imagesWithoutAlt++;
    imagesAltText.push({ src: src.substring(0, 200), alt: alt || "", missing });
  });

  if (imagesWithoutAlt > 0) {
    issues.push({ type: "images_missing_alt", severity: "warning", message: `${imagesWithoutAlt} images missing alt text` });
  }

  // ── Hreflang ──
  let hreflang: Array<{ lang: string; url: string }> | undefined;
  let hreflangErrors: string[] = [];

  if (config.checkHreflang) {
    const hreflangTags = $('link[rel="alternate"][hreflang]');
    if (hreflangTags.length > 0) {
      hreflang = [];
      hreflangTags.each((_, el) => {
        const lang = $(el).attr("hreflang") || "";
        const href = $(el).attr("href") || "";
        hreflang!.push({ lang, url: href });
      });
      // Check for x-default
      if (!hreflang.some(h => h.lang === "x-default")) {
        hreflangErrors.push("Missing x-default hreflang");
      }
      // Check for self-referencing
      if (!hreflang.some(h => normalizeUrl(h.url, url) === normalizeUrl(url, url))) {
        hreflangErrors.push("Missing self-referencing hreflang");
      }
    }
  }

  // ── Open Graph ──
  const ogTags: Record<string, string> = {};
  $("meta[property^='og:']").each((_, el) => {
    const prop = $(el).attr("property") || "";
    ogTags[prop] = $(el).attr("content") || "";
  });
  if (!ogTags["og:title"]) issues.push({ type: "missing_og_title", severity: "info", message: "Missing og:title" });
  if (!ogTags["og:description"]) issues.push({ type: "missing_og_description", severity: "info", message: "Missing og:description" });
  if (!ogTags["og:image"]) issues.push({ type: "missing_og_image", severity: "info", message: "Missing og:image" });

  // ── Twitter Cards ──
  const twitterTags: Record<string, string> = {};
  $('meta[name^="twitter:"], meta[property^="twitter:"]').each((_, el) => {
    const name = $(el).attr("name") || $(el).attr("property") || "";
    twitterTags[name] = $(el).attr("content") || "";
  });

  // ── Structured Data ──
  let structuredData: any[] = [];
  let structuredDataErrors: string[] = [];

  if (config.extractStructuredData) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html() || "{}");
        structuredData.push(parsed);
        // Basic validation
        if (!parsed["@context"]) structuredDataErrors.push("Missing @context in JSON-LD");
        if (!parsed["@type"]) structuredDataErrors.push("Missing @type in JSON-LD");
      } catch (e) {
        structuredDataErrors.push("Invalid JSON-LD: parse error");
        issues.push({ type: "invalid_json_ld", severity: "error", message: "Invalid JSON-LD structured data" });
      }
    });
  }

  // ── Word count & text ratio ──
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).length;
  const textRatio = bodyText.length > 0 ? bodyText.length / html.length : 0;

  if (wordCount < 100) {
    issues.push({ type: "thin_content", severity: "warning", message: `Thin content: only ${wordCount} words` });
  }

  // ── Custom extraction ──
  let customData: Record<string, any> = {};
  if (config.customExtraction) {
    for (const extraction of config.customExtraction) {
      try {
        if (extraction.type === "css") {
          const elements = $(extraction.selector);
          const values: string[] = [];
          elements.each((_, el) => {
            if (extraction.attribute) {
              values.push($(el).attr(extraction.attribute) || "");
            } else {
              values.push($(el).text().trim());
            }
          });
          customData[extraction.name] = values;
        } else if (extraction.type === "regex") {
          const regex = new RegExp(extraction.selector, "gi");
          const matches: string[] = [];
          let match;
          while ((match = regex.exec(html)) !== null) {
            matches.push(match[1] || match[0]);
          }
          customData[extraction.name] = matches;
        }
      } catch (e) {
        customData[extraction.name] = `Error: ${(e as Error).message}`;
      }
    }
  }

  // ── Basic accessibility checks ──
  let accessibilityIssues: Array<{ type: string; message: string; selector?: string }> = [];
  if (config.checkAccessibility) {
    // Language attribute
    const htmlLang = $("html").attr("lang");
    if (!htmlLang) accessibilityIssues.push({ type: "missing_lang", message: "Missing lang attribute on <html>" });

    // Skip links
    const skipLinks = $('a[href^="#"]').filter((_, el) => {
      const text = $(el).text().toLowerCase();
      return text.includes("skip") || text.includes("hopp");
    });
    if (skipLinks.length === 0) {
      accessibilityIssues.push({ type: "missing_skip_link", message: "No skip navigation link found" });
    }

    // Form labels
    const inputsWithoutLabels: string[] = [];
    $("input:not([type='hidden']):not([type='submit']):not([type='button'])").each((_, el) => {
      const id = $(el).attr("id");
      const ariaLabel = $(el).attr("aria-label");
      const ariaLabelledBy = $(el).attr("aria-labelledby");
      if (!ariaLabel && !ariaLabelledBy && (!id || $(`label[for="${id}"]`).length === 0)) {
        inputsWithoutLabels.push($(el).attr("name") || $(el).attr("type") || "input");
      }
    });
    if (inputsWithoutLabels.length > 0) {
      accessibilityIssues.push({
        type: "unlabeled_inputs",
        message: `${inputsWithoutLabels.length} inputs without labels: ${inputsWithoutLabels.slice(0, 5).join(", ")}`,
      });
    }

    // Buttons without text
    $("button").each((_, el) => {
      const text = $(el).text().trim();
      const ariaLabel = $(el).attr("aria-label");
      if (!text && !ariaLabel) {
        accessibilityIssues.push({ type: "empty_button", message: "Button without text or aria-label" });
      }
    });

    // Link text
    $("a").each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (text === "click here" || text === "klikk her" || text === "les mer" || text === "read more") {
        accessibilityIssues.push({ type: "generic_link_text", message: `Generic link text: "${text}"` });
      }
    });

    if (accessibilityIssues.length > 0) {
      issues.push({
        type: "accessibility",
        severity: "warning",
        message: `${accessibilityIssues.length} accessibility issues found`,
      });
    }
  }

  return {
    url, urlHash: md5(url), parentUrl, depth,
    statusCode, contentType, responseTimeMs: responseTime,
    contentSize, contentHash,
    redirectUrl: redirectChain.length > 0 ? finalUrl : undefined,
    redirectChain: redirectChain.length > 0 ? redirectChain : undefined,
    redirectType,
    title: title || undefined, titleLength,
    metaDescription: metaDescription || undefined, metaDescriptionLength,
    metaKeywords: metaKeywords || undefined,
    canonicalUrl: canonicalUrl || undefined, canonicalIsSelf,
    h1, h1Count: h1.length, h2, h2Count: h2.length,
    robotsMeta: robotsMeta || undefined, robotsTxtAllowed: robotsAllowed,
    xRobotsTag,
    internalLinksCount: internalLinks.length, externalLinksCount: externalLinks.length,
    brokenLinks,
    imagesCount: imagesAltText.length, imagesWithoutAlt, imagesAltText,
    hreflang: hreflang?.length ? hreflang : undefined,
    hreflangErrors: hreflangErrors.length > 0 ? hreflangErrors : undefined,
    structuredData: structuredData.length > 0 ? structuredData : undefined,
    structuredDataErrors: structuredDataErrors.length > 0 ? structuredDataErrors : undefined,
    ogTags: Object.keys(ogTags).length > 0 ? ogTags : undefined,
    twitterTags: Object.keys(twitterTags).length > 0 ? twitterTags : undefined,
    wordCount, textRatio: Math.round(textRatio * 1000) / 1000,
    customData: Object.keys(customData).length > 0 ? customData : undefined,
    accessibilityIssues: accessibilityIssues.length > 0 ? accessibilityIssues : undefined,
    issues,
    indexable, indexabilityReason,
    discoveredUrls,
  };
}

// ── Revised startCrawl with URL discovery ────────────────────────────
export async function runCrawlJob(config: CrawlConfig): Promise<void> {
  let cancelled = false;
  const visited = new Set<string>();
  const queue: Array<{ url: string; parentUrl?: string; depth: number }> = [];
  let crawledCount = 0;

  activeCrawls.set(config.jobId, {
    cancel: () => { cancelled = true; },
    progress: () => ({ crawled: crawledCount, total: visited.size }),
  });

  try {
    await pool.query(
      "UPDATE crawler_jobs SET status = 'running', started_at = NOW() WHERE id = $1",
      [config.jobId]
    );

    const targetOrigin = new URL(config.targetUrl).origin;
    const userAgent = config.customUserAgent || "TidumCrawler/1.0 (+https://tidum.no)";

    // Fetch robots.txt
    let robotsRules: RobotsRule[] = [];
    if (config.respectRobotsTxt && !config.customRobotsTxt) {
      try {
        const robotsRes = await fetchWithTimeout(`${targetOrigin}/robots.txt`, userAgent, 10000);
        if (robotsRes.ok) robotsRules = parseRobotsTxt(await robotsRes.text());
      } catch { /* no robots.txt */ }
    } else if (config.customRobotsTxt) {
      robotsRules = parseRobotsTxt(config.customRobotsTxt);
    }

    const includeMatchers = (config.includePatterns || []).map(p => new RegExp(p, "i"));
    const excludeMatchers = (config.excludePatterns || []).map(p => new RegExp(p, "i"));

    const shouldCrawl = (urlStr: string): boolean => {
      if (includeMatchers.length > 0 && !includeMatchers.some(m => m.test(urlStr))) return false;
      if (excludeMatchers.some(m => m.test(urlStr))) return false;
      return true;
    };

    // Seed
    if (config.urlList && config.urlList.length > 0) {
      for (const u of config.urlList) {
        const n = normalizeUrl(u, config.targetUrl);
        if (n && !visited.has(n)) { visited.add(n); queue.push({ url: n, depth: 0 }); }
      }
    } else {
      const seed = normalizeUrl(config.targetUrl, config.targetUrl);
      if (seed) { visited.add(seed); queue.push({ url: seed, depth: 0 }); }
    }

    while (queue.length > 0 && !cancelled && crawledCount < config.maxPages) {
      const item = queue.shift()!;
      if (item.depth > config.maxDepth) continue;

      if (config.crawlDelayMs > 0 && crawledCount > 0) {
        await sleep(config.crawlDelayMs);
      }

      try {
        const result = await crawlPage(item.url, item.parentUrl, item.depth, config, userAgent, robotsRules, targetOrigin);
        await saveResult(config.jobId, result);
        crawledCount++;

        // Enqueue discovered URLs
        for (const disc of result.discoveredUrls) {
          if (visited.has(disc.url)) continue;
          if (disc.depth > config.maxDepth) continue;
          if (!shouldCrawl(disc.url)) continue;
          visited.add(disc.url);
          queue.push({ url: disc.url, parentUrl: item.url, depth: disc.depth });
        }

        // Progress update (every 5 pages)
        if (crawledCount % 5 === 0 || queue.length === 0) {
          await pool.query(
            "UPDATE crawler_jobs SET pages_crawled = $1, pages_total = $2, errors_count = $3, warnings_count = $4, updated_at = NOW() WHERE id = $5",
            [crawledCount, visited.size, 
             (await pool.query("SELECT COUNT(*) FROM crawler_results WHERE job_id = $1 AND issues @> '[{\"severity\":\"error\"}]'", [config.jobId])).rows[0].count,
             (await pool.query("SELECT COUNT(*) FROM crawler_results WHERE job_id = $1 AND issues @> '[{\"severity\":\"warning\"}]'", [config.jobId])).rows[0].count,
             config.jobId]
          );
        }

      } catch (err: any) {
        const errResult: CrawlResult = {
          url: item.url, urlHash: md5(item.url), parentUrl: item.parentUrl, depth: item.depth,
          statusCode: 0, robotsTxtAllowed: true,
          h1: [], h1Count: 0, h2: [], h2Count: 0,
          internalLinksCount: 0, externalLinksCount: 0, brokenLinks: [],
          imagesCount: 0, imagesWithoutAlt: 0, imagesAltText: [],
          issues: [{ type: "crawl_error", severity: "error", message: err.message }],
          indexable: false, indexabilityReason: "Crawl error",
        };
        await saveResult(config.jobId, errResult);
        crawledCount++;
      }
    }

    const finalStatus = cancelled ? "cancelled" : "completed";
    const startRow = await pool.query("SELECT started_at FROM crawler_jobs WHERE id = $1", [config.jobId]);
    const durationMs = startRow.rows[0]?.started_at ? Date.now() - new Date(startRow.rows[0].started_at).getTime() : 0;

    // Calculate final error/warning counts
    const errCount = (await pool.query("SELECT COUNT(*) as c FROM crawler_results WHERE job_id = $1 AND issues @> '[{\"severity\":\"error\"}]'", [config.jobId])).rows[0].c;
    const warnCount = (await pool.query("SELECT COUNT(*) as c FROM crawler_results WHERE job_id = $1 AND issues @> '[{\"severity\":\"warning\"}]'", [config.jobId])).rows[0].c;

    await pool.query(
      "UPDATE crawler_jobs SET status = $1, completed_at = NOW(), duration_ms = $2, pages_crawled = $3, pages_total = $4, errors_count = $5, warnings_count = $6 WHERE id = $7",
      [finalStatus, durationMs, crawledCount, visited.size, parseInt(errCount), parseInt(warnCount), config.jobId]
    );

  } catch (err: any) {
    await pool.query("UPDATE crawler_jobs SET status = 'failed', completed_at = NOW() WHERE id = $1", [config.jobId]);
    console.error(`[Crawler] Job ${config.jobId} failed:`, err.message);
  } finally {
    activeCrawls.delete(config.jobId);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, userAgent: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      headers: { "User-Agent": userAgent, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRedirectTracking(url: string, userAgent: string, chain: string[], timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let currentUrl = url;
  let hops = 0;
  const maxHops = 10;

  try {
    while (hops < maxHops) {
      const res = await fetch(currentUrl, {
        headers: { "User-Agent": userAgent, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
        signal: controller.signal,
        redirect: "manual",
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return res;
        const nextUrl = normalizeUrl(location, currentUrl);
        if (!nextUrl) return res;
        chain.push(`${res.status}:${nextUrl}`);
        
        // Loop detection
        if (chain.filter(c => c.includes(nextUrl)).length > 1) {
          chain.push("LOOP_DETECTED");
          return res;
        }
        
        currentUrl = nextUrl;
        hops++;
      } else {
        return res;
      }
    }
    // Too many redirects
    chain.push("TOO_MANY_REDIRECTS");
    return await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function saveResult(jobId: number, result: CrawlResult & { discoveredUrls?: any[] }): Promise<void> {
  const { discoveredUrls, ...r } = result;
  await pool.query(
    `INSERT INTO crawler_results (
      job_id, url, url_hash, parent_url, depth,
      status_code, content_type, response_time_ms, content_size, content_hash,
      redirect_url, redirect_chain, redirect_type,
      title, title_length, meta_description, meta_description_length, meta_keywords,
      canonical_url, canonical_is_self,
      h1, h1_count, h2, h2_count,
      robots_meta, robots_txt_allowed, x_robots_tag,
      internal_links_count, external_links_count, broken_links,
      images_count, images_without_alt, images_alt_text,
      hreflang, hreflang_errors,
      structured_data, structured_data_errors,
      og_tags, twitter_tags,
      word_count, text_ratio,
      custom_data, accessibility_issues,
      issues, indexable, indexability_reason
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46
    )`,
    [
      jobId, r.url, r.urlHash, r.parentUrl || null, r.depth,
      r.statusCode || null, r.contentType || null, r.responseTimeMs || null, r.contentSize || null, r.contentHash || null,
      r.redirectUrl || null, r.redirectChain || null, r.redirectType || null,
      r.title || null, r.titleLength || null, r.metaDescription || null, r.metaDescriptionLength || null, r.metaKeywords || null,
      r.canonicalUrl || null, r.canonicalIsSelf || null,
      r.h1 || [], r.h1Count, r.h2 || [], r.h2Count,
      r.robotsMeta || null, r.robotsTxtAllowed ?? true, r.xRobotsTag || null,
      r.internalLinksCount, r.externalLinksCount, r.brokenLinks || [],
      r.imagesCount, r.imagesWithoutAlt, r.imagesAltText ? JSON.stringify(r.imagesAltText) : null,
      r.hreflang ? JSON.stringify(r.hreflang) : null, r.hreflangErrors || null,
      r.structuredData ? JSON.stringify(r.structuredData) : null, r.structuredDataErrors || null,
      r.ogTags ? JSON.stringify(r.ogTags) : null, r.twitterTags ? JSON.stringify(r.twitterTags) : null,
      r.wordCount || null, r.textRatio || null,
      r.customData ? JSON.stringify(r.customData) : null, r.accessibilityIssues ? JSON.stringify(r.accessibilityIssues) : null,
      JSON.stringify(r.issues), r.indexable, r.indexabilityReason || null,
    ]
  );
}

async function getJobStartTime(jobId: number): Promise<number> {
  const r = await pool.query("SELECT started_at FROM crawler_jobs WHERE id = $1", [jobId]);
  return r.rows[0]?.started_at ? new Date(r.rows[0].started_at).getTime() : Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Duplicate detection queries ──────────────────────────────────────
export async function findDuplicatePages(jobId: number) {
  // Exact duplicates by content hash
  const exact = await pool.query(
    `SELECT content_hash, array_agg(url) as urls, COUNT(*) as count
     FROM crawler_results 
     WHERE job_id = $1 AND content_hash IS NOT NULL AND status_code = 200
     GROUP BY content_hash HAVING COUNT(*) > 1
     ORDER BY count DESC`,
    [jobId]
  );

  // Duplicate titles
  const dupTitles = await pool.query(
    `SELECT title, array_agg(url) as urls, COUNT(*) as count
     FROM crawler_results 
     WHERE job_id = $1 AND title IS NOT NULL AND title != '' AND status_code = 200
     GROUP BY title HAVING COUNT(*) > 1
     ORDER BY count DESC`,
    [jobId]
  );

  // Duplicate meta descriptions
  const dupDescs = await pool.query(
    `SELECT meta_description, array_agg(url) as urls, COUNT(*) as count
     FROM crawler_results 
     WHERE job_id = $1 AND meta_description IS NOT NULL AND meta_description != '' AND status_code = 200
     GROUP BY meta_description HAVING COUNT(*) > 1
     ORDER BY count DESC`,
    [jobId]
  );

  return {
    exactDuplicates: exact.rows,
    duplicateTitles: dupTitles.rows,
    duplicateDescriptions: dupDescs.rows,
  };
}

// ── Summary stats ────────────────────────────────────────────────────
export async function getCrawlSummary(jobId: number) {
  const totalPages = await pool.query("SELECT COUNT(*) as c FROM crawler_results WHERE job_id = $1", [jobId]);
  const statusCodes = await pool.query(
    `SELECT status_code, COUNT(*) as count FROM crawler_results WHERE job_id = $1 GROUP BY status_code ORDER BY status_code`,
    [jobId]
  );
  const avgResponseTime = await pool.query(
    "SELECT AVG(response_time_ms) as avg, MAX(response_time_ms) as max, MIN(response_time_ms) as min FROM crawler_results WHERE job_id = $1 AND response_time_ms IS NOT NULL",
    [jobId]
  );
  const issuesByType = await pool.query(
    `SELECT 
       issue->>'type' as issue_type, 
       issue->>'severity' as severity,
       COUNT(*) as count
     FROM crawler_results, jsonb_array_elements(issues) as issue
     WHERE job_id = $1
     GROUP BY issue->>'type', issue->>'severity'
     ORDER BY count DESC`,
    [jobId]
  );
  const indexability = await pool.query(
    "SELECT indexable, COUNT(*) as count FROM crawler_results WHERE job_id = $1 GROUP BY indexable",
    [jobId]
  );

  return {
    totalPages: parseInt(totalPages.rows[0]?.c || "0"),
    statusCodes: statusCodes.rows,
    responseTime: avgResponseTime.rows[0] || {},
    issuesByType: issuesByType.rows,
    indexability: indexability.rows,
  };
}
