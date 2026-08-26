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
    const listRoute = 'app.get("/api/cms/builder-pages", requireAdminRole';
    const slugRoute = 'app.get("/api/cms/builder-pages/slug/:slug", publicReadRateLimit';
    const idRoute = 'app.get("/api/cms/builder-pages/:id", requireAdminRole';

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

  it("requires authentication before multer writes a CMS upload", () => {
    expect(routesSource).toContain(
      'app.post("/api/cms/upload", requireAnyAuth, cmsUpload.single(\'image\')',
    );
  });

  it("never creates or resets an admin account from the CMS setup route", () => {
    expect(smartRoutesSource).not.toContain("bcrypt.hash('admin123'");
    expect(smartRoutesSource).not.toContain("admin@smarttiming.no");
    expect(smartRoutesSource).not.toMatch(
      /UPDATE tidum_admin_users SET password_hash[^;]+username = \$2/,
    );
  });
});
