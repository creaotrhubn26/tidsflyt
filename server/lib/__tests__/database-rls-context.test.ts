import { afterEach, describe, expect, it, vi } from "vitest";

describe("database RLS runtime role configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails closed in production without a dedicated runtime role", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TIDUM_RLS_RUNTIME_ROLE", "");
    await expect(import("../database-rls-context")).rejects.toThrow(
      "DEDICATED_RLS_RUNTIME_ROLE_REQUIRED",
    );
  });

  it("rejects the development compatibility role in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TIDUM_RLS_RUNTIME_ROLE", "pg_database_owner");
    await expect(import("../database-rls-context")).rejects.toThrow(
      "DEDICATED_RLS_RUNTIME_ROLE_REQUIRED",
    );
  });

  it("rejects a role name that could alter SET ROLE syntax", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TIDUM_RLS_RUNTIME_ROLE", "safe_role; RESET ROLE");
    await expect(import("../database-rls-context")).rejects.toThrow(
      "INVALID_RLS_RUNTIME_ROLE",
    );
  });

  it("rejects an invalid portal actor before setting database context", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TIDUM_RLS_RUNTIME_ROLE", "pg_database_owner");
    const { setLocalSecurePartyRlsContext } = await import("../database-rls-context");
    const query = vi.fn();
    await expect(setLocalSecurePartyRlsContext({ query } as any, "actor\nspoof"))
      .rejects.toThrow("INVALID_RLS_ACTOR_USER_ID");
    expect(query).not.toHaveBeenCalled();
  });
});
