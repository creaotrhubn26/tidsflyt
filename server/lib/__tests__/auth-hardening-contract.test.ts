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

describe("smartTiming auth hardening contract", () => {
  it("uses the shared explicit dev-bypass guard in both auth stacks", () => {
    expect(smartRoutesSource.match(/isDevAuthBypassAllowed\(\)/g)).toHaveLength(2);
    expect(smartRoutesSource).not.toMatch(/NODE_ENV\s*!==?\s*["']production["']/);
  });

  it("uses only the required bearer-token secret for verification and signing", () => {
    expect(smartRoutesSource.match(/requireAuthJwtSecret\(\)/g)).toHaveLength(4);
    expect(smartRoutesSource).not.toContain("change-me-in-production");
    expect(smartRoutesSource).not.toMatch(/process\.env\.JWT_SECRET/);
  });

  it("uses cryptographic randomness for legacy invite-password placeholders", () => {
    expect(routesSource).toContain('randomBytes(32).toString("base64url")');
    expect(routesSource).not.toContain("invite-${email}-${Date.now()}");
  });

  it("suppresses registration-time schema and seed jobs under Vitest", () => {
    expect(smartRoutesSource).toContain(
      "process.env.NODE_ENV !== 'test' && !process.env.VITEST",
    );
    expect(routesSource).toContain(
      'process.env.NODE_ENV !== "test" && !process.env.VITEST',
    );
  });
});
