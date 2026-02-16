import { test } from "@playwright/test";
import fs from "fs/promises";

const auditRoutes = [
  { path: "/", label: "Landing" },
  { path: "/dashboard", label: "Dashboard" },
  { path: "/time", label: "Time tracking" },
  { path: "/reports", label: "Reports" },
  { path: "/case-reports", label: "Case reports" },
  { path: "/admin/case-reviews", label: "Admin case reviews" },
  { path: "/users", label: "Users" },
  { path: "/profile", label: "Profile" },
  { path: "/invites", label: "Invites" },
  { path: "/cases", label: "Cases" },
  { path: "/settings", label: "Settings" },
  { path: "/vendors", label: "Vendors" },
  { path: "/cms", label: "CMS" },
  { path: "/cms-legacy", label: "CMS legacy" },
  { path: "/kontakt", label: "Contact" },
  { path: "/personvern", label: "Privacy" },
  { path: "/vilkar", label: "Terms" },
  { path: "/api-docs", label: "API docs" },
  { path: "/vendor/api", label: "Vendor API admin" },
  { path: "/admin/access-requests", label: "Access requests" },
  { path: "/hvorfor", label: "Why Tidum" },
];

const logoSelectors = [
  "img[alt*='Tidum']",
  "img[alt*='Tidum logo']",
  "img[src*='tidum-wordmark']",
  "img[src*='favicon']",
];

async function collectLogoMetrics(page: any) {
  const locator = page.locator(logoSelectors.join(", "));
  const count = await locator.count();
  let maxArea = 0;
  let visibleCount = 0;

  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    const isVisible = await item.isVisible().catch(() => false);
    if (!isVisible) {
      continue;
    }
    visibleCount += 1;
    const box = await item.boundingBox();
    if (box) {
      maxArea = Math.max(maxArea, box.width * box.height);
    }
  }

  return {
    total: count,
    visible: visibleCount,
    maxArea,
  };
}

async function collectNavigationMetrics(page: any) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return {
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEventEnd: nav ? Math.round(nav.loadEventEnd) : null,
    };
  });
}

test.describe("UX audit", () => {
  for (const route of auditRoutes) {
    test(`${route.label} (${route.path})`, async ({ page, baseURL }, testInfo) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const requestFailures: string[] = [];
      const responseErrors: Array<{ url: string; status: number }> = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      page.on("pageerror", (err) => {
        pageErrors.push(err.message);
      });

      page.on("requestfailed", (request) => {
        const failure = request.failure();
        requestFailures.push(`${request.url()} :: ${failure?.errorText || "unknown"}`);
      });

      page.on("response", (response) => {
        const status = response.status();
        if (status >= 400) {
          responseErrors.push({ url: response.url(), status });
        }
      });

      const start = Date.now();
      await page.goto(`${baseURL || ""}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      const loadMs = Date.now() - start;

      const navMetrics = await collectNavigationMetrics(page);
      const logoMetrics = await collectLogoMetrics(page);

      const findings: string[] = [];
      if (consoleErrors.length > 0) {
        findings.push(`Console errors: ${consoleErrors.length}`);
      }
      if (pageErrors.length > 0) {
        findings.push(`Page errors: ${pageErrors.length}`);
      }
      if (requestFailures.length > 0) {
        findings.push(`Request failures: ${requestFailures.length}`);
      }
      if (responseErrors.length > 0) {
        findings.push(`HTTP errors: ${responseErrors.length}`);
      }
      if (logoMetrics.visible === 0) {
        findings.push("No visible Tidum logo");
      }
      if (logoMetrics.maxArea > 0 && logoMetrics.maxArea < 400) {
        findings.push("Logo area too small (<400px^2)");
      }
      if (loadMs > 4000) {
        findings.push(`Slow navigation load: ${loadMs}ms`);
      }

      const result = {
        route,
        project: testInfo.project.name,
        url: `${baseURL || ""}${route.path}`,
        loadMs,
        navMetrics,
        logoMetrics,
        consoleErrors,
        pageErrors,
        requestFailures,
        responseErrors,
        findings,
      };

      const outputPath = testInfo.outputPath("ux-audit.json");
      await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
      await testInfo.attach("ux-audit", {
        path: outputPath,
        contentType: "application/json",
      });

      console.log(JSON.stringify(result));
    });
  }
});
