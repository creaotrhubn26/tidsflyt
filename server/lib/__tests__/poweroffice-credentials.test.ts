import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPowerOfficeCredentialStorageConfigured,
  openPowerOfficeClientKey,
  powerOfficeClientKeyNeedsRotation,
  PowerOfficeCredentialError,
  sealPowerOfficeClientKey,
} from "../poweroffice-credentials";

const OLD_KEY = "poweroffice-old-test-key-with-at-least-32-bytes";
const NEW_KEY = "poweroffice-new-test-key-with-at-least-32-bytes";

function configureKeyring(activeKeyId: "old" | "new"): void {
  vi.stubEnv("TIDUM_SECRET_KEY", "");
  vi.stubEnv("TIDUM_SECRET_KEYRING", JSON.stringify({ old: OLD_KEY, new: NEW_KEY }));
  vi.stubEnv("TIDUM_SECRET_ACTIVE_KEY_ID", activeKeyId);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PowerOffice credential envelope", () => {
  it("fails closed without a configured keyring", () => {
    vi.stubEnv("TIDUM_SECRET_KEY", "");
    vi.stubEnv("TIDUM_SECRET_KEYRING", "");
    vi.stubEnv("TIDUM_SECRET_ACTIVE_KEY_ID", "");

    expect(isPowerOfficeCredentialStorageConfigured()).toBe(false);
    expect(() => sealPowerOfficeClientKey("must-not-be-stored"))
      .toThrow(expect.objectContaining<Partial<PowerOfficeCredentialError>>({ code: "NOT_CONFIGURED" }));
    expect(() => openPowerOfficeClientKey("legacy-plaintext"))
      .toThrow(expect.objectContaining<Partial<PowerOfficeCredentialError>>({ code: "NOT_CONFIGURED" }));
  });

  it("stores an authenticated enc:v2 envelope and can open it", () => {
    configureKeyring("old");
    const clientKey = "po-client-key-never-log-this";
    const stored = sealPowerOfficeClientKey(clientKey);

    expect(stored).toMatch(/^enc:v2:old:/);
    expect(stored).not.toContain(clientKey);
    expect(openPowerOfficeClientKey(stored)).toBe(clientKey);
    expect(powerOfficeClientKeyNeedsRotation(stored)).toBe(false);
  });

  it("recognizes old-key and legacy plaintext values for controlled rotation", () => {
    configureKeyring("old");
    const oldStored = sealPowerOfficeClientKey("rotate-me");
    configureKeyring("new");

    expect(openPowerOfficeClientKey(oldStored)).toBe("rotate-me");
    expect(powerOfficeClientKeyNeedsRotation(oldStored)).toBe(true);
    expect(openPowerOfficeClientKey("legacy-client-key")).toBe("legacy-client-key");
    expect(powerOfficeClientKeyNeedsRotation("legacy-client-key")).toBe(true);
  });

  it("rejects a tampered envelope without exposing plaintext", () => {
    configureKeyring("old");
    const stored = sealPowerOfficeClientKey("sensitive-client-key");
    const parts = stored.split(":");
    parts[4] = `${parts[4].startsWith("A") ? "B" : "A"}${parts[4].slice(1)}`;
    const tampered = parts.join(":");

    expect(() => openPowerOfficeClientKey(tampered))
      .toThrow(expect.objectContaining<Partial<PowerOfficeCredentialError>>({ code: "UNREADABLE_CREDENTIAL" }));
  });
});
