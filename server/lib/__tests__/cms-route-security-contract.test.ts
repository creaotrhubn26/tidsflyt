import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const smartRoutesSource = readFileSync(
  join(process.cwd(), "server", "smartTimingRoutes.ts"),
  "utf8",
);
const routesSource = readFileSync(
  join(process.cwd(), "server", "routes.ts"),
  "utf8",
);
const crawlerSource = readFileSync(
  join(process.cwd(), "server", "crawler-engine.ts"),
  "utf8",
);
const reportDesignerSource = readFileSync(
  join(process.cwd(), "client", "src", "components", "reports", "time-tracking-pdf-designer.tsx"),
  "utf8",
);

describe("CMS route security contract", () => {
  it("protects admin blog reads with authenticateAdmin", () => {
    expect(smartRoutesSource).toContain(
      'app.get("/api/cms/posts", authenticateAdmin',
    );
    expect(smartRoutesSource).toContain(
      'app.get("/api/cms/posts/:id", authenticateAdmin',
    );
  });

  it("protects builder admin reads and keeps the public slug route reachable", () => {
    const listRoute = 'app.get("/api/cms/builder-pages", authenticateAdmin';
    const slugRoute = 'app.get("/api/cms/builder-pages/slug/:slug", publicReadRateLimit';
    const idRoute = 'app.get("/api/cms/builder-pages/:id", authenticateAdmin';

    expect(routesSource).toContain(listRoute);
    expect(routesSource).toContain(slugRoute);
    expect(routesSource).toContain(idRoute);
    expect(routesSource.indexOf(slugRoute)).toBeLessThan(routesSource.indexOf(idRoute));
  });

  it("only returns published pages from the public slug route", () => {
    const slugStart = routesSource.indexOf(
      'app.get("/api/cms/builder-pages/slug/:slug"',
    );
    const idStart = routesSource.indexOf(
      'app.get("/api/cms/builder-pages/:id"',
    );
    const slugHandler = routesSource.slice(slugStart, idStart);

    expect(slugHandler).toContain('eq(builderPages.status, "published")');
  });

  it("requires global CMS access before multer writes a CMS upload", () => {
    expect(routesSource).toContain(
      'app.post("/api/cms/upload", authenticateAdmin, uploadRateLimit, receiveCmsImage',
    );
    expect(routesSource).toContain(
      'app.post("/api/report-assets/upload", requireAnyAuth, uploadRateLimit, receiveCmsImage',
    );
    expect(reportDesignerSource).toContain('fetch("/api/report-assets/upload"');
    expect(routesSource).not.toContain("image/svg+xml");
    expect(routesSource).not.toContain("serve original file instead");
    expect(routesSource).toContain("private-uploads', 'cms-processing");
  });

  it("requires the global CMS permission for the control plane", () => {
    expect(smartRoutesSource).toContain('requestPath.startsWith("/api/cms/")');
    expect(smartRoutesSource).toContain('hasPermission(req.admin?.roleId, "cms.manage")');
    expect(smartRoutesSource).toContain('app.get("/api/cms/media", authenticateAdmin');
    expect(smartRoutesSource).toContain('app.get("/api/cms/forms", authenticateAdmin');
    expect(smartRoutesSource).toContain('app.get("/api/cms/settings", authenticateAdmin');
    expect(routesSource).toContain('app.get("/api/cms/section-templates", authenticateAdmin');
    expect(routesSource).toContain('app.get("/api/cms/page-versions/:pageId", authenticateAdmin');
    expect(routesSource).toContain('app.get("/api/cms/form-submissions", authenticateAdmin');
    expect(routesSource).toContain('app.get("/api/cms/page-analytics/:pageId", authenticateAdmin');
  });

  it("keeps only the intended published-page writes public", () => {
    expect(routesSource).toContain(
      'app.post("/api/cms/form-submissions", publicWriteRateLimit',
    );
    expect(routesSource).toContain(
      'app.post("/api/cms/page-analytics/track", publicWriteRateLimit',
    );
    expect(routesSource).toContain('eq(builderPages.status, "published")');
  });

  it("validates and pins every crawler request, including redirects", () => {
    expect(crawlerSource).toContain('import { fetchCrawlerUrl } from "./lib/crawler-fetch"');
    expect(crawlerSource).toContain("await fetchCrawlerUrl(currentUrl");
    expect(crawlerSource).not.toMatch(/\bfetch\(/);
    expect(smartRoutesSource).toContain("await resolveCrawlerUrl(target_url)");
    expect(smartRoutesSource).toContain("await resolveCrawlerUrl(absolute)");
  });

  it("never creates or resets an admin account from the CMS setup route", () => {
    expect(smartRoutesSource).not.toContain("bcrypt.hash('admin123'");
    expect(smartRoutesSource).not.toContain("admin@smarttiming.no");
    expect(smartRoutesSource).not.toMatch(
      /UPDATE tidum_admin_users SET password_hash[^;]+username = \$2/,
    );
  });
});
