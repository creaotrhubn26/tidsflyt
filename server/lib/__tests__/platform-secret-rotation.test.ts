import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  clientQuery: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  processRotation: vi.fn(),
  runtimeStatus: vi.fn(),
}));

vi.mock("../../db", () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("../secure-dialog-governance", () => ({
  processSecureDialogKeyRotation: mocks.processRotation,
}));
vi.mock("../secret-box", () => ({
  getSecretBoxRuntimeStatus: mocks.runtimeStatus,
}));

import {
  getSecretRotationInventory,
  PlatformSecretRotationError,
  runPlatformSecretRotation,
} from "../platform-secret-rotation";

const emptyInventoryRow = {
  secure_conversations: 0,
  secure_messages: 0,
  archive_configs: 0,
  municipality_keys: 0,
  raw_intake_payloads: 0,
  poweroffice_credentials: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clientQuery.mockImplementation(async (sql: string) => (
    sql.includes("COUNT(*)::int AS count") ? { rows: [{ count: 0 }] } : { rows: [] }
  ));
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  mocks.runtimeStatus.mockReturnValue({
    configured: true,
    productionReady: true,
    source: "mounted-file",
    activeKeyId: "2026_11",
    keyCount: 2,
    legacyKeyConfigured: false,
    reason: "READY",
  });
});

describe("platform secret rotation", () => {
  it("returns aggregate exact-key inventory without selecting secret values", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => (
      sql.includes("AS secure_conversations")
        ? { rows: [{ ...emptyInventoryRow, archive_configs: "2", secure_messages: 3 }] }
        : { rows: [] }
    ));
    const inventory = await getSecretRotationInventory("2026_11");

    expect(inventory).toEqual({
      secureConversations: 0,
      secureMessages: 3,
      archiveConfigs: 2,
      municipalityKeys: 0,
      rawIntakePayloads: 0,
      powerOfficeCredentials: 0,
    });
    const [sql, params] = mocks.clientQuery.mock.calls.find(([statement]) => (
      String(statement).includes("AS secure_conversations")
    ))!;
    expect(sql).toContain("split_part(client_secret, ':', 3) = $1");
    expect(sql).toContain("COUNT(*)");
    expect(sql).not.toMatch(/SELECT\s+client_secret|SELECT\s+client_key/);
    expect(params).toEqual(["2026_11"]);
  });

  it("persists a completed manual run using counts and identifiers only", async () => {
    mocks.processRotation.mockResolvedValueOnce({
      conversations: 1,
      messages: 2,
      archiveConfigs: 3,
      municipalityKeys: 4,
      rawIntakePayloads: 5,
      powerOfficeCredentials: 6,
      activeKeyId: "2026_11",
    });
    mocks.clientQuery.mockImplementation(async (sql: string) => (
      sql.includes("AS secure_conversations") ? { rows: [emptyInventoryRow] } : { rows: [] }
    ));
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const result = await runPlatformSecretRotation({
      limit: 50,
      source: "manual",
      initiatedBy: "operator-1",
    });
    expect(result).toEqual(expect.objectContaining({
      runId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      activeKeyId: "2026_11",
      rotated: {
        secureConversations: 1,
        secureMessages: 2,
        archiveConfigs: 3,
        municipalityKeys: 4,
        rawIntakePayloads: 5,
        powerOfficeCredentials: 6,
      },
    }));
    expect(mocks.processRotation).toHaveBeenCalledWith(50, undefined, "manual");
    const auditParams = mocks.query.mock.calls[0][1];
    expect(auditParams).toEqual(expect.arrayContaining([
      "manual",
      "operator-1",
      "2026_11",
      "completed",
    ]));
    expect(JSON.stringify(auditParams)).not.toContain("client-secret");
  });

  it("records only a generic code when rotation fails", async () => {
    mocks.processRotation.mockRejectedValueOnce(new Error("upstream leaked detail"));
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await expect(runPlatformSecretRotation({
      limit: 50,
      source: "scheduled",
      initiatedBy: null,
    })).rejects.toEqual(expect.objectContaining<Partial<PlatformSecretRotationError>>({
      code: "ROTATION_FAILURE",
    }));
    const auditParams = mocks.query.mock.calls[0][1];
    expect(auditParams).toEqual(expect.arrayContaining([
      "scheduled",
      "2026_11",
      "failed",
      "ROTATION_FAILURE",
    ]));
    expect(JSON.stringify(auditParams)).not.toContain("upstream leaked detail");
  });

  it("refuses rotation without a versioned runtime keyring", async () => {
    mocks.runtimeStatus.mockReturnValueOnce({
      configured: true,
      productionReady: false,
      source: "environment",
      activeKeyId: "legacy-v1",
      keyCount: 0,
      legacyKeyConfigured: true,
      reason: "INVALID_CONFIGURATION",
    });
    await expect(runPlatformSecretRotation({
      limit: 50,
      source: "manual",
      initiatedBy: "operator-1",
    })).rejects.toEqual(expect.objectContaining<Partial<PlatformSecretRotationError>>({
      code: "NOT_CONFIGURED",
    }));
    expect(mocks.processRotation).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects an unidentified manual operator and out-of-range batches", async () => {
    await expect(runPlatformSecretRotation({
      limit: 50,
      source: "manual",
      initiatedBy: null,
    })).rejects.toEqual(expect.objectContaining<Partial<PlatformSecretRotationError>>({
      code: "INVALID_OPERATOR",
    }));
    await expect(runPlatformSecretRotation({
      limit: 501,
      source: "scheduled",
      initiatedBy: null,
    })).rejects.toEqual(expect.objectContaining<Partial<PlatformSecretRotationError>>({
      code: "INVALID_LIMIT",
    }));
    expect(mocks.processRotation).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
