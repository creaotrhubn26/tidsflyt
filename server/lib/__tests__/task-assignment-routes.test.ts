import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";

// registerRoutes(httpServer, app) sin httpServer-parameter brukes KUN som
// et rent gjennomgangs-returverdi (server/routes.ts:6608, `return
// httpServer;`) — aldri kalt, aldri lyttet på. En aldri-startet
// http.createServer() er derfor trygg og tilstrekkelig her; ingen ekte
// port åpnes.
//
// VIKTIG: sett IKKE NODE_ENV til "production" i denne testfilen.
// /api/tasks er gatet av isAuthenticated (server/custom-auth.ts:596), som
// har sin EGEN, uavhengige dev-bypass (`isDev = NODE_ENV !== "production"`,
// custom-auth.ts:275) — helt separat fra authenticateAdmin sin
// dev-bypass i smartTimingRoutes.ts som andre tester i denne økten måtte
// forsvare seg mot. isAuthenticated sin dev-bypass gjør bare `return
// next()` UTEN å røre req.user, så den nedenstående middlewarens
// injiserte req.user overlever uendret — nøyaktig det testen trenger.
// Å sette NODE_ENV=production her ville i stedet KREVD en ekte
// passport-sesjon (hasSessionAuth sjekker req.session.passport.user,
// ikke bare req.user) og latt alle testene 401 med vilje feil årsak.
describe("oppgavetildeling: POST /api/tasks + GET /api/tasks/assignable-colleagues", () => {
  const cleanupTaskIds: number[] = [];
  const cleanupNotificationUserIds: string[] = [];
  const cleanupUserIds: string[] = [];
  afterEach(async () => {
    for (const id of cleanupTaskIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_dashboard_tasks WHERE id = $1`, [id]);
    }
    for (const uid of cleanupNotificationUserIds.splice(0)) {
      await pool.query(`DELETE FROM notifications WHERE recipient_id = $1`, [uid]);
    }
    for (const id of cleanupUserIds.splice(0)) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
  });

  // POST /api/tasks requires the target of an assignment to exist as a real
  // `users` row with the SAME vendor_id as the actor (tenant-scoping fix) —
  // a bare string id like the pre-fix tests used no longer qualifies as a
  // valid assignment target.
  async function insertUser(vendorId: number | null): Promise<string> {
    const email = `test_assignee_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    const { rows: [row] } = await pool.query(
      `INSERT INTO users (username, password, email, vendor_id) VALUES ($1, 'x', $2, $3) RETURNING id`,
      [email, email, vendorId],
    );
    cleanupUserIds.push(row.id);
    return row.id;
  }

  async function appWithUser(user: { id: string; role: string; vendorId?: number | null }) {
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = user;
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);
    return app;
  }

  it("vendor_admin kan tildele en oppgave til en annen bruker i samme vendor, mottakeren får en notifikasjon", async () => {
    const assignerId = `test_assigner_${Date.now()}`;
    const assigneeId = await insertUser(42);
    cleanupNotificationUserIds.push(assigneeId);
    const app = await appWithUser({ id: assignerId, role: "vendor_admin", vendorId: 42 });

    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Følg opp sak", assigneeUserId: assigneeId, dueAt: new Date(Date.now() + 86_400_000).toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(assigneeId);
    expect(res.body.assignedByUserId).toBe(assignerId);
    cleanupTaskIds.push(res.body.id);

    const { rows } = await pool.query(
      `SELECT * FROM notifications WHERE recipient_id = $1 AND type = 'task_assigned'`,
      [assigneeId],
    );
    expect(rows.length).toBe(1);
  });

  it("vendor_admin kan IKKE tildele en oppgave til en bruker i en ANNEN vendor (403)", async () => {
    const assignerId = `test_assigner_x_${Date.now()}`;
    const foreignAssigneeId = await insertUser(99);
    const app = await appWithUser({ id: assignerId, role: "vendor_admin", vendorId: 42 });

    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Skal feile på tenant-grense", assigneeUserId: foreignAssigneeId });

    expect(res.status).toBe(403);
  });

  it("vendor_admin uten egen vendorId kan IKKE tildele til noen (403, fail-closed)", async () => {
    const assignerId = `test_assigner_novendor_${Date.now()}`;
    const targetId = await insertUser(42);
    const app = await appWithUser({ id: assignerId, role: "vendor_admin", vendorId: null });

    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Skal feile, aktør mangler vendorId", assigneeUserId: targetId });

    expect(res.status).toBe(403);
  });

  it("member kan IKKE tildele en oppgave til noen andre (403)", async () => {
    const memberId = `test_member_${Date.now()}`;
    const targetId = `test_target_${Date.now()}`;
    const app = await appWithUser({ id: memberId, role: "member" });

    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Skal feile", assigneeUserId: targetId });

    expect(res.status).toBe(403);
  });

  it("en bruker kan fortsatt opprette en oppgave til seg selv uten noen sjekk", async () => {
    const userId = `test_self_${Date.now()}`;
    const app = await appWithUser({ id: userId, role: "member" });

    const res = await request(app).post("/api/tasks").send({ title: "Egen oppgave" });

    expect(res.status).toBe(201);
    expect(res.body.assignedByUserId).toBeNull();
    cleanupTaskIds.push(res.body.id);
  });

  it("GET /api/tasks/assignable-colleagues returnerer canAssign:false for member", async () => {
    const app = await appWithUser({ id: `test_member2_${Date.now()}`, role: "member" });

    const res = await request(app).get("/api/tasks/assignable-colleagues");
    expect(res.status).toBe(200);
    expect(res.body.canAssign).toBe(false);
    expect(res.body.colleagues).toEqual([]);
  });
});
