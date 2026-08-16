import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Task 9 fix-runde 2, Kritisk 2: /api/v1/vendor/* autentiseres med API-nøkkel.
// apiKeyAuth setter req.vendorId, ALDRI req.user, så den globalt monterte
// withVendorScopedDb returnerer tidlig og disse rutene kjørte helt uten RLS.
// I tillegg er apiKeyAuth montert PER RUTE, så en global middleware ville
// uansett kjørt før req.vendorId fantes — derfor må withApiKeyScopedDb stå
// rett etter apiKeyAuth på hver enkelt rute.
const root = resolve(__dirname, "../../../..");
const vendorApi = readFileSync(resolve(root, "server/vendor-api.ts"), "utf8");
const middleware = readFileSync(resolve(root, "server/middleware/vendor-scoped-db.ts"), "utf8");

describe("API-nøkkel-autentiserte ruter er RLS-scopet", () => {
  it("hver rute som bruker apiKeyAuth har withApiKeyScopedDb rett etter", () => {
    const routes = vendorApi
      .split("\n")
      .filter((l) => /^router\.(get|post|put|patch|delete)\(/.test(l));
    const withAuth = routes.filter((l) => l.includes("apiKeyAuth"));

    // Sikrer at testen ikke blir vakuøs hvis rutene flyttes/omdøpes.
    expect(withAuth.length).toBeGreaterThanOrEqual(8);

    for (const line of withAuth) {
      expect(line, `mangler withApiKeyScopedDb: ${line.slice(0, 80)}`).toContain(
        "apiKeyAuth, withApiKeyScopedDb",
      );
    }
  });

  it("ruter uten apiKeyAuth (f.eks. /health) er ikke scopet", () => {
    const health = vendorApi.split("\n").find((l) => l.includes('router.get("/health"'));
    expect(health).toBeDefined();
    expect(health).not.toContain("withApiKeyScopedDb");
  });

  it("withApiKeyScopedDb feiler lukket når req.vendorId mangler", async () => {
    const { withApiKeyScopedDb } = await import(
      "../../../../server/middleware/vendor-scoped-db"
    );
    const err = await new Promise<unknown>((res) => {
      withApiKeyScopedDb({} as any, {} as any, ((e: unknown) => res(e)) as any);
    });
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toMatch(/req\.vendorId mangler/);
  });

  it("API-nøkler får aldri super_admin-omgåelse av policyen", () => {
    // withApiKeyScopedDb må sende isSuperAdmin: false — ellers ville
    // app.is_super_admin = 'true' slått av vendor-filteret helt.
    expect(middleware).toMatch(/withApiKeyScopedDb[\s\S]*isSuperAdmin:\s*false/);
  });

  it("begge sporene deler samme transaksjons- og opprydningslogikk", () => {
    // Én runWithScopedDb, kalt fra begge middlewarene — ingen duplisert
    // BEGIN/set_config/commit-logikk som kan komme ut av sync.
    expect(middleware.match(/async function runWithScopedDb/g)).toHaveLength(1);
    expect(middleware.match(/runWithScopedDb\(/g)).toHaveLength(3); // def + 2 kallsteder
    expect(middleware.match(/client\.query\("BEGIN"\)/g)).toHaveLength(1);
  });
});
