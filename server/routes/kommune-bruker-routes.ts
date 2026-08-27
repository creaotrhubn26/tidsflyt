import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { canManageRole, getRoleLabel, isKommuneRole, normalizeRole } from "../../shared/roles";

/**
 * Krav 14: kommunal brukeradministrasjon. kommune_admin (og
 * barnevernsleder) ser kommunens brukere; rollebytte følger
 * canManageRole-matrisen (kommune_admin kan dele ut fagroller,
 * barnevernsleder kun saksbehandler), aldri på seg selv, aldri på
 * brukere utenfor egen kommune, og aldri til/fra roller utenfor
 * kommune-hierarkiet (innbygger provisjoneres kun via partsflyten).
 */

interface KommuneAdminActor {
  userId: string;
  role: string;
  kommuneId: number;
}

async function requireKommuneAdminActor(req: Request): Promise<KommuneAdminActor | null> {
  const user = (req as any).user;
  if (!user?.id) return null;
  const { rows: [row] } = await pool.query(
    `SELECT role, kommune_id FROM users WHERE id = $1`,
    [user.id],
  );
  if (!row || row.kommune_id == null) return null;
  const role = normalizeRole(row.role);
  if (role !== "kommune_admin" && role !== "barnevernsleder") return null;
  return { userId: user.id, role, kommuneId: row.kommune_id };
}

export function registerKommuneBrukerRoutes(app: Express): void {
  app.get("/api/kommune/brukere", async (req: Request, res: Response) => {
    const actor = await requireKommuneAdminActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const { rows } = await pool.query(
        `SELECT id, email, first_name, last_name, role
           FROM users
          WHERE kommune_id = $1 AND role IN ('barnevernsleder', 'kommune_saksbehandler', 'kommune_admin')
          ORDER BY role, email`,
        [actor.kommuneId],
      );
      res.json(rows.map((r: any) => ({
        id: r.id,
        email: r.email,
        navn: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
        rolle: normalizeRole(r.role),
        rolleLabel: getRoleLabel(r.role),
      })));
    } catch (err) {
      console.error("[kommune-bruker] listing feilet", err);
      res.status(500).json({ error: "Kunne ikke hente brukerne." });
    }
  });

  app.patch("/api/kommune/brukere/:id/rolle", async (req: Request, res: Response) => {
    const actor = await requireKommuneAdminActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const nyRolle = normalizeRole(req.body?.rolle);
    if (!isKommuneRole(nyRolle)) {
      return res.status(400).json({ error: "Rollen må være en kommunerolle." });
    }
    if (req.params.id === actor.userId) {
      return res.status(400).json({ error: "Du kan ikke endre din egen rolle." });
    }
    if (!canManageRole(actor.role, nyRolle)) {
      return res.status(403).json({ error: "Rollen din kan ikke dele ut denne rollen." });
    }

    try {
      const { rows: [target] } = await pool.query(
        `SELECT id, role, kommune_id FROM users WHERE id = $1`,
        [req.params.id],
      );
      if (!target || target.kommune_id !== actor.kommuneId) {
        return res.status(404).json({ error: "Brukeren finnes ikke i din kommune." });
      }
      const gjeldendeRolle = normalizeRole(target.role);
      if (!isKommuneRole(gjeldendeRolle)) {
        return res.status(400).json({ error: "Brukeren har ikke en kommunerolle." });
      }
      if (!canManageRole(actor.role, gjeldendeRolle)) {
        return res.status(403).json({ error: "Rollen din kan ikke endre denne brukeren." });
      }

      const { rows: [updated] } = await pool.query(
        `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND kommune_id = $3 RETURNING id, role`,
        [nyRolle, req.params.id, actor.kommuneId],
      );
      res.json({ id: updated.id, rolle: normalizeRole(updated.role), rolleLabel: getRoleLabel(updated.role) });
    } catch (err) {
      console.error("[kommune-bruker] rollebytte feilet", err);
      res.status(500).json({ error: "Kunne ikke endre rollen." });
    }
  });
}
