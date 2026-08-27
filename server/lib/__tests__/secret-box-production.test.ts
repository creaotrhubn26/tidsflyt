import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSecretBoxProductionReady,
  getSecretBoxRuntimeStatus,
  openSecret,
  rewrapSecret,
  sealSecret,
} from "../secret-box";

const tempDirectories = new Set<string>();

function clearSecretEnvironment(): void {
  vi.stubEnv("TIDUM_SECRET_KEY", "");
  vi.stubEnv("TIDUM_SECRET_KEYRING", "");
  vi.stubEnv("TIDUM_SECRET_KEYRING_FILE", "");
  vi.stubEnv("TIDUM_SECRET_ACTIVE_KEY_ID", "");
}

function configureInline(): void {
  clearSecretEnvironment();
  vi.stubEnv("TIDUM_SECRET_KEYRING", JSON.stringify({
    "prod-v1": "production-test-key-with-at-least-32-bytes",
  }));
  vi.stubEnv("TIDUM_SECRET_ACTIVE_KEY_ID", "prod-v1");
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of tempDirectories) rmSync(directory, { recursive: true, force: true });
  tempDirectories.clear();
});

describe("secret-box production runtime", () => {
  it("fails startup, writes, and ordinary legacy reads closed without a keyring", () => {
    clearSecretEnvironment();
    vi.stubEnv("NODE_ENV", "production");

    expect(getSecretBoxRuntimeStatus()).toEqual(expect.objectContaining({
      configured: false,
      productionReady: false,
      reason: "NOT_CONFIGURED",
    }));
    expect(() => assertSecretBoxProductionReady()).toThrow(/SECRET_RUNTIME_NOT_CONFIGURED/);
    expect(() => sealSecret("must-not-be-plaintext")).toThrow(/SECRET_RUNTIME_NOT_CONFIGURED/);
    expect(() => openSecret("legacy-plaintext")).toThrow(/LEGACY_PLAINTEXT_SECRET_DISABLED/);
  });

  it("rejects a legacy-only key as production keyring configuration", () => {
    clearSecretEnvironment();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TIDUM_SECRET_KEY", "legacy-production-test-key-at-least-32-bytes");

    expect(getSecretBoxRuntimeStatus()).toEqual(expect.objectContaining({
      configured: true,
      productionReady: false,
      keyCount: 0,
      legacyKeyConfigured: true,
    }));
    expect(() => assertSecretBoxProductionReady()).toThrow(/INVALID_CONFIGURATION/);
  });

  it("rejects the separate legacy key as active even when versioned keys exist", () => {
    configureInline();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TIDUM_SECRET_KEY", "legacy-production-test-key-at-least-32-bytes");
    vi.stubEnv("TIDUM_SECRET_ACTIVE_KEY_ID", "legacy-v1");

    expect(getSecretBoxRuntimeStatus()).toEqual(expect.objectContaining({
      configured: true,
      productionReady: false,
      keyCount: 1,
      activeKeyId: "legacy-v1",
    }));
    expect(() => assertSecretBoxProductionReady()).toThrow(/INVALID_CONFIGURATION/);
  });

  it("loads a locked absolute mounted-secret file without exposing its values", () => {
    clearSecretEnvironment();
    vi.stubEnv("NODE_ENV", "production");
    const directory = mkdtempSync(join(tmpdir(), "tidum-secret-box-"));
    tempDirectories.add(directory);
    const file = join(directory, "keyring.json");
    writeFileSync(file, JSON.stringify({
      "file-v1": "mounted-file-test-key-with-at-least-32-bytes",
    }), { mode: 0o600 });
    chmodSync(file, 0o600);
    vi.stubEnv("TIDUM_SECRET_KEYRING_FILE", file);
    vi.stubEnv("TIDUM_SECRET_ACTIVE_KEY_ID", "file-v1");

    const status = getSecretBoxRuntimeStatus();
    expect(status).toEqual(expect.objectContaining({
      configured: true,
      productionReady: true,
      source: "mounted-file",
      activeKeyId: "file-v1",
      keyCount: 1,
    }));
    expect(JSON.stringify(status)).not.toContain("mounted-file-test-key");
    expect(() => assertSecretBoxProductionReady()).not.toThrow();
    const sealed = sealSecret("mounted-secret-roundtrip");
    expect(sealed).toMatch(/^enc:v2:file-v1:/);
    expect(openSecret(sealed)).toBe("mounted-secret-roundtrip");
  });

  it("rejects ambiguous sources and overly broad production file permissions", () => {
    clearSecretEnvironment();
    vi.stubEnv("NODE_ENV", "production");
    const directory = mkdtempSync(join(tmpdir(), "tidum-secret-box-"));
    tempDirectories.add(directory);
    const file = join(directory, "keyring.json");
    writeFileSync(file, JSON.stringify({
      "file-v1": "mounted-file-test-key-with-at-least-32-bytes",
    }), { mode: 0o644 });
    chmodSync(file, 0o644);
    vi.stubEnv("TIDUM_SECRET_KEYRING_FILE", file);
    vi.stubEnv("TIDUM_SECRET_ACTIVE_KEY_ID", "file-v1");
    expect(getSecretBoxRuntimeStatus()).toEqual(expect.objectContaining({
      productionReady: false,
      reason: "INVALID_CONFIGURATION",
    }));

    vi.stubEnv("TIDUM_SECRET_KEYRING", JSON.stringify({
      "inline-v1": "inline-test-key-with-at-least-32-bytes",
    }));
    expect(getSecretBoxRuntimeStatus()).toEqual(expect.objectContaining({
      productionReady: false,
      reason: "INVALID_CONFIGURATION",
    }));
  });

  it("allows only the explicit rewrap path to migrate production legacy plaintext", () => {
    configureInline();
    vi.stubEnv("NODE_ENV", "production");

    expect(() => openSecret("legacy-client-secret")).toThrow(/LEGACY_PLAINTEXT_SECRET_DISABLED/);
    const migrated = rewrapSecret("legacy-client-secret");
    expect(migrated).toMatch(/^enc:v2:prod-v1:/);
    expect(openSecret(migrated)).toBe("legacy-client-secret");
  });
});
