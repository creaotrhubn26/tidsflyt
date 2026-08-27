import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request } from "express";

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

describe("route middleware: dev-mode bypasses krever flagg", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ALLOW_DEV_AUTH_BYPASS;

  const mockRequest = (overrides?: Partial<Request>): any => ({
    session: undefined,
    user: undefined,
    isAuthenticated: () => false,
    ...overrides,
  });

  const mockResponse = (): any => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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

  it("isAuthenticated: nekter tilgang i dev uten flagget", async () => {
    process.env.NODE_ENV = "development";
    const mod = await import("../../../../server/custom-auth.ts");
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    mod.isAuthenticated(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("isAuthenticated: tillater tilgang i dev med flagget satt", async () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEV_AUTH_BYPASS = "true";
    const mod = await import("../../../../server/custom-auth.ts");
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    mod.isAuthenticated(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("requireVendorAuth: nekter tilgang i dev uten flagget", async () => {
    process.env.NODE_ENV = "development";
    const mod = await import("../../../../server/custom-auth.ts");
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    mod.requireVendorAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireVendorAuth: tillater tilgang i dev med flagget satt", async () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEV_AUTH_BYPASS = "true";
    const mod = await import("../../../../server/custom-auth.ts");
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    mod.requireVendorAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("requireSuperAdmin: nekter tilgang i dev uten flagget", async () => {
    process.env.NODE_ENV = "development";
    const mod = await import("../../../../server/custom-auth.ts");
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    mod.requireSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireSuperAdmin: tillater tilgang i dev med flagget satt", async () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEV_AUTH_BYPASS = "true";
    const mod = await import("../../../../server/custom-auth.ts");
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    mod.requireSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
