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
  "img[src*='tidum-logo']",
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

async function collectSmoothnessMetrics(page: any, durationMs = 1200) {
  return page.evaluate(async (duration) => {
    const longTasksSupported = "PerformanceObserver" in window;
    const longTasks: PerformanceEntry[] = [];
    let observer: PerformanceObserver | undefined;

    if (longTasksSupported) {
      observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => longTasks.push(entry));
      });
      try {
        observer.observe({ entryTypes: ["longtask"] });
      } catch {
        observer = undefined;
      }
    }

    const start = performance.now();
    let last = start;
    const frames: number[] = [];

    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        frames.push(now - last);
        last = now;
        if (now - start >= duration) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    observer?.disconnect();

    const maxFrameMs = frames.length ? Math.max(...frames) : 0;
    const avgFrameMs = frames.length
      ? frames.reduce((sum, value) => sum + value, 0) / frames.length
      : 0;
    const jankFrames = frames.filter((value) => value > 50).length;
    const jankRatio = frames.length ? jankFrames / frames.length : 0;

    return {
      durationMs: duration,
      frameCount: frames.length,
      avgFrameMs: Math.round(avgFrameMs * 10) / 10,
      maxFrameMs: Math.round(maxFrameMs * 10) / 10,
      jankFrames,
      jankRatio: Math.round(jankRatio * 1000) / 1000,
      longTaskCount: longTasks.length,
    };
  }, durationMs);
}

async function collectTabSmoothness(page: any) {
  const tabMetrics: Array<{ tabId: string; metrics: any }> = [];
  const tabTriggers = page.locator("[data-testid^='tab-']");
  const tabCount = await tabTriggers.count();
  const maxTabs = Math.min(tabCount, 3);

  for (let i = 0; i < maxTabs; i += 1) {
    const tab = tabTriggers.nth(i);
    const isVisible = await tab.isVisible().catch(() => false);
    if (!isVisible) {
      continue;
    }
    const tabId = (await tab.getAttribute("data-testid")) || `tab-${i}`;
    await tab.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
    const metrics = await collectSmoothnessMetrics(page, 900);
    tabMetrics.push({ tabId, metrics });
  }

  return tabMetrics;
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
      const smoothness = await collectSmoothnessMetrics(page);
      const tabSmoothness = await collectTabSmoothness(page);

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
      if (smoothness.jankRatio > 0.2 || smoothness.maxFrameMs > 80) {
        findings.push(
          `Janky frames: max ${smoothness.maxFrameMs}ms, ratio ${smoothness.jankRatio}`,
        );
      }
      if (smoothness.longTaskCount > 2) {
        findings.push(`Long tasks during load: ${smoothness.longTaskCount}`);
      }
      const tabJank = tabSmoothness.find(
        (tab) => tab.metrics.jankRatio > 0.2 || tab.metrics.maxFrameMs > 80,
      );
      if (tabJank) {
        findings.push(
          `Jank after tab switch: ${tabJank.tabId} (max ${tabJank.metrics.maxFrameMs}ms)`,
        );
      }

      const result = {
        route,
        project: testInfo.project.name,
        url: `${baseURL || ""}${route.path}`,
        loadMs,
        navMetrics,
        logoMetrics,
        smoothness,
        tabSmoothness,
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
