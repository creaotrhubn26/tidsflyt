import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// hasTotpEnrolled hits the DB — mocked so this file never needs a live
// connection. All other totp.ts exports pass through untouched.
vi.mock("../../../../server/lib/totp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../server/lib/totp")>();
  return {
    ...actual,
    hasTotpEnrolled: vi.fn().mockResolvedValue(true),
  };
});

describe("redirectAfterLogin sender en allerede-registrert admin til /totp-challenge, ikke rett til dashbordet", () => {
  it("satisfied-status: redirecter til /totp-challenge og nullstiller sesjonens totpVerified til false", async () => {
    const { redirectAfterLogin } = await import("../../../../server/custom-auth");
    const req: any = { session: {} };
    const res: any = { redirect: vi.fn() };
    const adminUser = {
      id: "u1",
      email: "admin@tidum.no",
      name: "Admin",
      profileImageUrl: null,
      provider: "google",
      role: "vendor_admin",
      vendorId: null,
    };

    await redirectAfterLogin(req, res, adminUser as any);

    expect(res.redirect).toHaveBeenCalledWith("/totp-challenge");
    expect(req.session.totpVerified).toBe(false);
  });
});

describe("requireVendorAuth / requireSuperAdmin avviser til TOTP-utfordringen er bestått denne sesjonen", () => {
  const savedBypass = process.env.ALLOW_DEV_AUTH_BYPASS;

  beforeEach(() => {
    // Dev-bypass må ikke maskere håndhevelsen som testes her.
    delete process.env.ALLOW_DEV_AUTH_BYPASS;
  });

  afterEach(() => {
    if (savedBypass === undefined) {
      delete process.env.ALLOW_DEV_AUTH_BYPASS;
    } else {
      process.env.ALLOW_DEV_AUTH_BYPASS = savedBypass;
    }
  });

  function makeReq(role: string, totpVerified: boolean | undefined) {
    const session: any = { passport: { user: { id: "u1" } } };
    if (totpVerified !== undefined) session.totpVerified = totpVerified;
    return { session, user: { id: "u1", email: "a@b.no", role, vendorId: null } } as any;
  }

  function makeRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  it("requireVendorAuth avviser vendor_admin med totpVerified=false (401)", async () => {
    const { requireVendorAuth } = await import("../../../../server/custom-auth");
    const req = makeReq("vendor_admin", false);
    const res = makeRes();
    const next = vi.fn();

    requireVendorAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireVendorAuth slipper vendor_admin gjennom når totpVerified=true", async () => {
    const { requireVendorAuth } = await import("../../../../server/custom-auth");
    const req = makeReq("vendor_admin", true);
    const res = makeRes();
    const next = vi.fn();

    requireVendorAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("requireVendorAuth slipper gjennom når totpVerified aldri er satt (ingen step-up krevd denne sesjonen)", async () => {
    const { requireVendorAuth } = await import("../../../../server/custom-auth");
    const req = makeReq("vendor_admin", undefined);
    const res = makeRes();
    const next = vi.fn();

    requireVendorAuth(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("requireSuperAdmin avviser super_admin med totpVerified=false (401)", async () => {
    const { requireSuperAdmin } = await import("../../../../server/custom-auth");
    const req = makeReq("super_admin", false);
    const res = makeRes();
    const next = vi.fn();

    requireSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireSuperAdmin slipper super_admin gjennom når totpVerified=true", async () => {
    const { requireSuperAdmin } = await import("../../../../server/custom-auth");
    const req = makeReq("super_admin", true);
    const res = makeRes();
    const next = vi.fn();

    requireSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
