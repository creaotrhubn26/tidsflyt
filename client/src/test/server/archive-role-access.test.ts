import { describe, expect, it } from "vitest";
import {
  canAccessVendorApiAdmin,
  canConfigureArchiveIntegration,
} from "../../../../shared/roles";

describe("arkivkortets rollegate", () => {
  it("viser arkivkonfigurasjon til kommuneleder uten vendor-administrasjon", () => {
    expect(canConfigureArchiveIntegration("barnevernsleder")).toBe(true);
    expect(canAccessVendorApiAdmin("barnevernsleder")).toBe(false);
  });

  it.each(["super_admin", "hovedadmin", "admin", "vendor_admin"])(
    "beholder arkivkortet for %s",
    (role) => {
      expect(canConfigureArchiveIntegration(role)).toBe(true);
    },
  );

  it.each(["kommune_saksbehandler", "innbygger", "member", "miljoarbeider"])(
    "skjuler arkivkonfigurasjon for %s",
    (role) => {
      expect(canConfigureArchiveIntegration(role)).toBe(false);
    },
  );
});
