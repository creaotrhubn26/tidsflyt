import type { Request } from "express";
import { pool } from "../db";

export interface TurnusActor {
  userId: string;
  orgId: number;
  role: string;
}

/**
 * Resolves the turnus tenant actor from the authenticated user's org membership
 * (tidum_turnus_org_members). Mirrors requireKommuneActor: reads (req as any).user,
 * queries the DB, returns null on failure (caller sends the response). The lookup
 * runs under system RLS context because the member row's own org is what we are
 * resolving. A user with no membership row gets null (fail-closed).
 */
export async function requireTurnusActor(req: Request): Promise<TurnusActor | null> {
  const user = (req as any).user;
  if (!user?.id) return null;
  const { rows: [row] } = await pool.query(
    `SELECT m.org_id, m.rolle
       FROM tidum_turnus_org_members m
      WHERE m.user_id = $1
      ORDER BY m.created_at ASC
      LIMIT 1`,
    [String(user.id)],
  );
  if (!row) return null;
  return { userId: String(user.id), orgId: Number(row.org_id), role: String(row.rolle ?? "") };
}
