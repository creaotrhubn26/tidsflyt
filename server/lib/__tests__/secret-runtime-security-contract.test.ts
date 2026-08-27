import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const index = readFileSync("server/index.ts", "utf8");
const secretBox = readFileSync("server/lib/secret-box.ts", "utf8");
const governance = readFileSync("server/lib/secure-dialog-governance.ts", "utf8");
const operations = readFileSync("server/routes/secret-operations-routes.ts", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");
const health = readFileSync("server/smartTimingRoutes.ts", "utf8");
const migration = readFileSync("migrations/082_secret_rotation_run_audit.sql", "utf8");
const render = readFileSync("render.yaml", "utf8");

describe("secret runtime security contract", () => {
  it("validates the production keyring before migrations, routes, jobs, and listen", () => {
    const assertion = index.indexOf("assertSecretBoxProductionReady();");
    expect(assertion).toBeGreaterThan(-1);
    expect(assertion).toBeLessThan(index.indexOf("await runStartupMigrations();"));
    expect(assertion).toBeLessThan(index.indexOf("await registerRoutes(httpServer, app);"));
    expect(assertion).toBeLessThan(index.indexOf("httpServer.listen"));
  });

  it("supports one unambiguous provider-neutral source and blocks production plaintext", () => {
    expect(secretBox).toContain("TIDUM_SECRET_KEYRING_FILE");
    expect(secretBox).toContain("SECRET_KEYRING_SOURCE_CONFLICT");
    expect(secretBox).toContain("SECRET_KEYRING_FILE_PERMISSIONS_TOO_OPEN");
    expect(secretBox).toContain("LEGACY_PLAINTEXT_SECRET_DISABLED");
    expect(secretBox).toContain("allowLegacyPlaintextForRotation");
  });

  it("uses exact key-id comparison instead of LIKE wildcards in general rotation", () => {
    expect(governance).toContain("split_part(subject, ':', 3) = $1");
    expect(governance).toContain("split_part(client_secret, ':', 3) = $1");
    expect(governance).not.toContain("subject NOT LIKE $1");
    expect(governance).not.toContain("client_secret NOT LIKE $1");
  });

  it("protects inventory and manual rotation with fresh global superadmin", () => {
    expect(operations).toContain('app.get("/api/admin/security/secret-runtime", requireSuperAdmin');
    expect(operations).toContain('app.post("/api/admin/security/rotate-secrets", requireSuperAdmin');
    expect(operations).toContain('req.body?.confirm !== "ROTATE"');
    expect(routes).toContain("registerSecretOperationsRoutes(app)");
  });

  it("publishes only coarse readiness and no backend error text", () => {
    const healthRoute = health.slice(
      health.indexOf('app.get("/api/health"'),
      health.indexOf("// ========== LOGS"),
    );
    expect(healthRoute).toContain("secrets.configured ? 'ready' : 'not_configured'");
    expect(healthRoute).toContain("res.status(503)");
    expect(healthRoute).not.toContain("err.message");
    expect(healthRoute).not.toContain("activeKeyId");
  });

  it("keeps rotation evidence append-only and free of secret-value columns", () => {
    expect(migration).toContain("tidum_secret_rotation_runs_immutable_trigger");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("rotated_counts JSONB");
    expect(migration).not.toMatch(/^\s*(client_key|client_secret|secret_value)\s+/m);
  });

  it("does not configure a supplier-global tenant ClientKey", () => {
    expect(render).not.toContain("POWEROFFICE_CLIENT_KEY");
  });
});
