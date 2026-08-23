import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { db } from "../../db";
import { kommuner, insertKommuneSchema } from "@shared/schema";
import { canManageUsersDynamic, canManageRoleDynamic } from "../permissions";
import { normalizeRole, canManageRole } from "@shared/roles";

describe("kommune-tenant datamodell", () => {
  const cleanupIds: number[] = [];

  afterEach(async () => {
    for (const id of cleanupIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
    }
  });

  it("kan opprette en kommune med gyldig orgNummer", async () => {
    const data = insertKommuneSchema.parse({ navn: "Testkommune", orgNummer: "912345678" });
    const [row] = await db.insert(kommuner).values(data).returning();
    cleanupIds.push(row.id);

    expect(row.navn).toBe("Testkommune");
    expect(row.orgNummer).toBe("912345678");
    expect(row.entraIdTenantId).toBeNull();
    expect(row.status).toBe("active");
  });

  it("avviser orgNummer som ikke er 9 siffer", () => {
    expect(() => insertKommuneSchema.parse({ navn: "X", orgNummer: "123" })).toThrow();
  });

  it("normalizeRole/canManageRole kjenner de nye rollene (statisk fallback-system)", () => {
    expect(normalizeRole("barnevernsleder")).toBe("barnevernsleder");
    expect(normalizeRole("kommune_saksbehandler")).toBe("kommune_saksbehandler");
    expect(canManageRole("barnevernsleder", "kommune_saksbehandler")).toBe(true);
    expect(canManageRole("kommune_saksbehandler", "barnevernsleder")).toBe(false);
  });

  it("canManageUsersDynamic/canManageRoleDynamic kjenner de nye rollene (DB-drevet, fase 1.6)", async () => {
    expect(await canManageUsersDynamic("barnevernsleder")).toBe(true);
    expect(await canManageUsersDynamic("kommune_saksbehandler")).toBe(false);
    expect(await canManageRoleDynamic("barnevernsleder", "kommune_saksbehandler")).toBe(true);
    expect(await canManageRoleDynamic("kommune_saksbehandler", "barnevernsleder")).toBe(false);
    expect(await canManageRoleDynamic("super_admin", "barnevernsleder")).toBe(true);
    // Regresjonsvern: rank 85/82 må holde disse rollene utenfor rekkevidde
    // for vendor-side roller (canManageRoleDynamic er tenant-blind, se
    // migrations/063_kommuner.sql).
    expect(await canManageRoleDynamic("vendor_admin", "kommune_saksbehandler")).toBe(false);
    expect(await canManageRoleDynamic("hovedadmin", "barnevernsleder")).toBe(false);
  });
});
