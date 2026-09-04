import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { turnusOrganisasjoner, turnusAvdelinger } from "../schema";

describe("turnus drizzle schema", () => {
  it("maps to the migration table names", () => {
    expect(getTableConfig(turnusOrganisasjoner).name).toBe("tidum_turnus_organisasjoner");
    expect(getTableConfig(turnusAvdelinger).name).toBe("tidum_turnus_avdelinger");
  });

  it("avdelinger carries org_id", () => {
    const cols = getTableConfig(turnusAvdelinger).columns.map((c) => c.name);
    expect(cols).toContain("org_id");
  });
});
