import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({
  db: { select: vi.fn() },
}));

import { hasPermission } from "../permissions";
import { db } from "../../db";

describe("hasPermission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns false when roleId is null", async () => {
    expect(await hasPermission(null, "vendor.create")).toBe(false);
  });

  it("returns false when roleId is undefined", async () => {
    expect(await hasPermission(undefined, "vendor.create")).toBe(false);
  });

  it("returns true when the role has the permission", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: "role-1" }]),
          }),
        }),
      }),
    });
    expect(await hasPermission("role-1", "vendor.create")).toBe(true);
  });

  it("returns false when the role lacks the permission", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    });
    expect(await hasPermission("role-1", "vendor.create")).toBe(false);
  });

  it("returns false (not throw) when the DB query rejects", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.reject(new Error("connection lost")),
          }),
        }),
      }),
    });
    expect(await hasPermission("role-1", "vendor.create")).toBe(false);
  });

  it("caches a positive result and does not re-query", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "role-1" }]);
    (db.select as any).mockReturnValue({
      from: () => ({ innerJoin: () => ({ where: () => ({ limit }) }) }),
    });
    const cache = new Map<string, boolean>();
    await hasPermission("role-1", "vendor.create", cache);
    await hasPermission("role-1", "vendor.create", cache);
    expect(limit).toHaveBeenCalledTimes(1);
  });
});
