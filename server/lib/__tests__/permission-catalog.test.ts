import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { PERMISSION_CATALOG } from "../permission-catalog";

describe("PERMISSION_CATALOG matches migration seed", () => {
  it("every catalog key exists in migrations/054_role_permission_system.sql", () => {
    const sql = readFileSync("migrations/054_role_permission_system.sql", "utf8");
    for (const { key } of PERMISSION_CATALOG) {
      expect(sql.includes(`'${key}'`)).toBe(true);
    }
  });

  it("has exactly 7 entries (update this test when you add one)", () => {
    expect(PERMISSION_CATALOG.length).toBe(7);
  });
});
