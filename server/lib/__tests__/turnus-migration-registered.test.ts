import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("startup migration registration", () => {
  it("registers 105_turnus_core.sql after 104", () => {
    const src = readFileSync("server/lib/run-startup-migrations.ts", "utf8");
    const i104 = src.indexOf("104_barnevern_dokumentmaler.sql");
    const i105 = src.indexOf("105_turnus_core.sql");
    expect(i104).toBeGreaterThan(-1);
    expect(i105).toBeGreaterThan(i104);
  });
});
