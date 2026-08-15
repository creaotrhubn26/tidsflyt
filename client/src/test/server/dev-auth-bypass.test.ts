import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("dev-mode auth-bypass krever eksplisitt opt-in", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ALLOW_DEV_AUTH_BYPASS;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.ALLOW_DEV_AUTH_BYPASS;
  });

  afterEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalFlag === undefined) {
      delete process.env.ALLOW_DEV_AUTH_BYPASS;
    } else {
      process.env.ALLOW_DEV_AUTH_BYPASS = originalFlag;
    }
  });

  it("middleware/auth.ts: isBypassAllowed er false uten ALLOW_DEV_AUTH_BYPASS, selv i dev", async () => {
    process.env.NODE_ENV = "development";
    const mod = await import("../../../../server/middleware/auth.ts");
    expect(mod.isDevAuthBypassAllowed()).toBe(false);
  });

  it("middleware/auth.ts: isBypassAllowed er true kun når BÅDE dev og flagget er satt", async () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEV_AUTH_BYPASS = "true";
    const mod = await import("../../../../server/middleware/auth.ts");
    expect(mod.isDevAuthBypassAllowed()).toBe(true);
  });

  it("middleware/auth.ts: isBypassAllowed er false i produksjon selv med flagget satt", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_DEV_AUTH_BYPASS = "true";
    const mod = await import("../../../../server/middleware/auth.ts");
    expect(mod.isDevAuthBypassAllowed()).toBe(false);
  });
});
