import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { requireTurnusActor } from "../turnus-actor";

describe("requireTurnusActor", () => {
  it("returns null when req.user is missing", () => {
    const req = {} as Request;
    expect(requireTurnusActor(req)).toBeNull();
  });

  it("returns null when turnusOrgId is missing or invalid", () => {
    const reqNoOrg = { user: { id: "u1", role: "leder" } } as any as Request;
    expect(requireTurnusActor(reqNoOrg)).toBeNull();

    const reqInvalidOrg = { user: { id: "u1", role: "leder", turnusOrgId: 0 } } as any as Request;
    expect(requireTurnusActor(reqInvalidOrg)).toBeNull();

    const reqNegativeOrg = { user: { id: "u1", role: "leder", turnusOrgId: -3 } } as any as Request;
    expect(requireTurnusActor(reqNegativeOrg)).toBeNull();
  });

  it("returns the actor when turnusOrgId is a valid positive integer", () => {
    const req = { user: { id: "u1", role: "leder", turnusOrgId: 7 } } as any as Request;
    expect(requireTurnusActor(req)).toEqual({ userId: "u1", orgId: 7, role: "leder" });
  });
});
