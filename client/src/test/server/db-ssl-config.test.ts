import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("databasetilkoblingens SSL-konfigurasjon", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = "postgres://user:pass@some-remote-host.neon.tech/db";
    delete process.env.DATABASE_SSL;
    delete process.env.PGSSLMODE;
  });

  afterEach(() => {
    vi.resetModules();
    process.env = { ...savedEnv };
  });

  it("krever gyldig sertifikat mot en ikke-lokal tilkobling", async () => {
    const { buildSslConfig } = await import("../../../../server/db.ts");
    expect(buildSslConfig()).toEqual({ rejectUnauthorized: true });
  });

  it("bruker ingen SSL mot en lokal tilkobling", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    vi.resetModules();
    const { buildSslConfig } = await import("../../../../server/db.ts");
    expect(buildSslConfig()).toBe(false);
  });
});
