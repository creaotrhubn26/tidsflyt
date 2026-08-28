import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// hasTotpEnrolled treffer databasen — mocket så denne filen aldri trenger en
// levende tilkobling. Alle andre totp.ts-eksporter passerer urørt.
vi.mock("../../../../server/lib/totp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../server/lib/totp")>();
  return {
    ...actual,
    hasTotpEnrolled: vi.fn().mockResolvedValue(true),
  };
});

const TOTP_401 = { message: "TOTP-verifisering påkrevd" };

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

describe("requireVendorAuth / requireSuperAdmin / requireAdminRole avviser til TOTP-utfordringen er bestått denne sesjonen", () => {
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
    return {
      session,
      user: { id: "u1", email: "a@b.no", role, vendorId: null },
      isAuthenticated: () => true,
    } as any;
  }

  function makeRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  // Mains guards gjør i tillegg et ferskt DB-oppslag av aktøren ETTER
  // TOTP-gaten. Testene her verifiserer gaten: totpVerified=false skal gi
  // nøyaktig TOTP-401 FØR noe oppslag; true/undefined skal ALDRI gi
  // TOTP-401 (oppslaget kan så gi 403/503 avhengig av database — irrelevant).
  it("requireVendorAuth avviser med TOTP-401 når totpVerified=false", async () => {
    const { requireVendorAuth } = await import("../../../../server/custom-auth");
    const req = makeReq("vendor_admin", false);
    const res = makeRes();
    const next = vi.fn();

    await requireVendorAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(TOTP_401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireVendorAuth gir aldri TOTP-401 når totpVerified=true", async () => {
    const { requireVendorAuth } = await import("../../../../server/custom-auth");
    const req = makeReq("vendor_admin", true);
    const res = makeRes();

    await requireVendorAuth(req, res, vi.fn());

    expect(res.json).not.toHaveBeenCalledWith(TOTP_401);
  });

  it("requireVendorAuth gir aldri TOTP-401 når totpVerified aldri er satt (ingen step-up krevd denne sesjonen)", async () => {
    const { requireVendorAuth } = await import("../../../../server/custom-auth");
    const req = makeReq("vendor_admin", undefined);
    const res = makeRes();

    await requireVendorAuth(req, res, vi.fn());

    expect(res.json).not.toHaveBeenCalledWith(TOTP_401);
  });

  it("requireSuperAdmin avviser med TOTP-401 når totpVerified=false", async () => {
    const { requireSuperAdmin } = await import("../../../../server/custom-auth");
    const req = makeReq("super_admin", false);
    const res = makeRes();
    const next = vi.fn();

    await requireSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(TOTP_401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireSuperAdmin gir aldri TOTP-401 når totpVerified=true", async () => {
    const { requireSuperAdmin } = await import("../../../../server/custom-auth");
    const req = makeReq("super_admin", true);
    const res = makeRes();

    await requireSuperAdmin(req, res, vi.fn());

    expect(res.json).not.toHaveBeenCalledWith(TOTP_401);
  });

  it("requireAdminRole (middleware/auth) avviser med TOTP-feil når totpVerified=false", async () => {
    const { requireAdminRole } = await import("../../../../server/middleware/auth");
    const req = makeReq("super_admin", false);
    const res = makeRes();
    const next = vi.fn();

    requireAdminRole(req, res, next as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "TOTP-verifisering påkrevd" });
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAdminRole slipper gjennom når totpVerified=true", async () => {
    const { requireAdminRole } = await import("../../../../server/middleware/auth");
    const req = makeReq("super_admin", true);
    const res = makeRes();
    const next = vi.fn();

    requireAdminRole(req, res, next as any);

    expect(next).toHaveBeenCalled();
  });
});
