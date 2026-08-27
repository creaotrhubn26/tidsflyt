import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inventory: vi.fn(),
  rotate: vi.fn(),
  runtime: vi.fn(),
}));

vi.mock("../../custom-auth", () => ({
  requireSuperAdmin: (req: any, res: any, next: any) => {
    if (req.get("x-test-superadmin") !== "yes") {
      return res.status(403).json({ message: "Krever global super_admin rolle" });
    }
    req.user = { id: "fresh-global-superadmin", role: "super_admin" };
    next();
  },
}));
vi.mock("../platform-secret-rotation", async () => {
  class PlatformSecretRotationError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    getSecretRotationInventory: mocks.inventory,
    runPlatformSecretRotation: mocks.rotate,
    PlatformSecretRotationError,
  };
});
vi.mock("../secret-box", () => ({
  getSecretBoxRuntimeStatus: mocks.runtime,
}));

import { registerSecretOperationsRoutes } from "../../routes/secret-operations-routes";

function app() {
  const instance = express();
  instance.use(express.json());
  registerSecretOperationsRoutes(instance);
  return instance;
}

const emptyInventory = {
  secureConversations: 0,
  secureMessages: 0,
  archiveConfigs: 0,
  municipalityKeys: 0,
  rawIntakePayloads: 0,
  powerOfficeCredentials: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runtime.mockReturnValue({
    configured: true,
    productionReady: true,
    source: "mounted-file",
    activeKeyId: "2026-11",
    keyCount: 2,
    legacyKeyConfigured: false,
    reason: "READY",
  });
  mocks.inventory.mockResolvedValue(emptyInventory);
  mocks.rotate.mockResolvedValue({
    runId: "11111111-1111-4111-8111-111111111111",
    activeKeyId: "2026-11",
    rotated: emptyInventory,
    remaining: emptyInventory,
  });
});

describe("secret operations routes", () => {
  it("rejects callers outside the fresh global control plane", async () => {
    const status = await request(app()).get("/api/admin/security/secret-runtime");
    const rotation = await request(app())
      .post("/api/admin/security/rotate-secrets")
      .send({ confirm: "ROTATE", limit: 100 });
    expect(status.status).toBe(403);
    expect(rotation.status).toBe(403);
    expect(mocks.inventory).not.toHaveBeenCalled();
    expect(mocks.rotate).not.toHaveBeenCalled();
  });

  it("returns only runtime metadata and aggregate inventory", async () => {
    const response = await request(app())
      .get("/api/admin/security/secret-runtime")
      .set("x-test-superadmin", "yes");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      runtime: expect.objectContaining({
        source: "mounted-file",
        activeKeyId: "2026-11",
        keyCount: 2,
      }),
      remaining: emptyInventory,
    });
    expect(JSON.stringify(response.body)).not.toContain("secret-value");
  });

  it("requires explicit confirmation and a bounded integer batch", async () => {
    const missingConfirm = await request(app())
      .post("/api/admin/security/rotate-secrets")
      .set("x-test-superadmin", "yes")
      .send({ limit: 100 });
    const invalidLimit = await request(app())
      .post("/api/admin/security/rotate-secrets")
      .set("x-test-superadmin", "yes")
      .send({ confirm: "ROTATE", limit: 501 });
    expect(missingConfirm.status).toBe(400);
    expect(invalidLimit.status).toBe(400);
    expect(mocks.rotate).not.toHaveBeenCalled();
  });

  it("binds a manual run to the freshly resolved operator", async () => {
    const response = await request(app())
      .post("/api/admin/security/rotate-secrets")
      .set("x-test-superadmin", "yes")
      .send({ confirm: "ROTATE", limit: 75 });
    expect(response.status).toBe(200);
    expect(response.body.runId).toBe("11111111-1111-4111-8111-111111111111");
    expect(mocks.rotate).toHaveBeenCalledWith({
      limit: 75,
      source: "manual",
      initiatedBy: "fresh-global-superadmin",
    });
  });

  it("does not expose internal rotation failures", async () => {
    mocks.rotate.mockRejectedValueOnce(new Error("database schema detail"));
    const response = await request(app())
      .post("/api/admin/security/rotate-secrets")
      .set("x-test-superadmin", "yes")
      .send({ confirm: "ROTATE", limit: 75 });
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("schema detail");
  });
});
