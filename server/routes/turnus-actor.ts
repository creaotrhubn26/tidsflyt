import type { Request } from "express";

export interface TurnusActor {
  userId: string;
  orgId: number;
  role: string;
}

/**
 * Org-tilhørighet leses foreløpig fra user.turnusOrgId — en stub inntil A0b
 * kobler inn ekte org-medlemskap (tilsvarende hvordan requireKommuneActor
 * henter kommune_id fra DB, se barnevern-melding-routes.ts). Feiler lukket:
 * mangler bruker eller gyldig org, er svaret null.
 */
export function requireTurnusActor(req: Request): TurnusActor | null {
  const user = (req as any).user;
  if (!user?.id) return null;
  const orgId = user.turnusOrgId;
  if (!Number.isInteger(orgId) || orgId <= 0) return null;
  return { userId: String(user.id), orgId, role: String(user.role ?? "") };
}
