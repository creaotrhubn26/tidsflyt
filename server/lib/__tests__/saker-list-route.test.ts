import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";

// Regresjonstest for en datalekkasje funnet i helhets-branch-reviewen av
// sak-journalføring: GET /api/saker hadde kun grener for role === "user"
// og role === "vendor_admin" — enhver annen rolle (f.eks. den faktiske
// "tiltaksleder"-rollen, som er den eneste rollen /cases-siden slapp inn
// på tidspunktet dette ble funnet) falt gjennom til super_admin-grenen og
// så ALLE saker på tvers av alle leverandører.
describe("GET /api/saker: rollebasert tilgang, ikke fall-gjennom til alt", () => {
  const cleanupSakIds: string[] = [];

  afterEach(async () => {
    for (const id of cleanupSakIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_saker WHERE id = $1`, [id]);
    }
  });

  async function insertTestSak(overrides: { vendorId: number; tiltakslederId: string; tildelteUserId?: string[] }): Promise<string> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_saker (saksnummer, tittel, vendor_id, tiltaksleder_id, tildelte_user_id)
       VALUES ($1, 'Test-sak liste-tilgang', $2, $3, $4::jsonb) RETURNING id`,
      [`TEST-LIST-${Date.now()}-${Math.random()}`, overrides.vendorId, overrides.tiltakslederId, JSON.stringify(overrides.tildelteUserId ?? [])],
    );
    cleanupSakIds.push(row.id);
    return row.id;
  }

  async function appWithUser(user: { id: string; role: string; vendorId?: number }) {
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

  it("teamleder (uten spesiell eierrolle) ser IKKE andre vendorers saker — kun egne tildelte", async () => {
    const foreignVendorId = 700001 + Math.floor(Math.random() * 1000);
    const ownVendorId = 700002 + Math.floor(Math.random() * 1000);
    const foreignSakId = await insertTestSak({ vendorId: foreignVendorId, tiltakslederId: "leader-1" });
    const app = await appWithUser({ id: "team-55", role: "teamleder", vendorId: ownVendorId });

    const res = await request(app).get("/api/saker");
    expect(res.status).toBe(200);
    expect(res.body.find((s: any) => s.id === foreignSakId)).toBeUndefined();
  });

  it("teamleder ser saker de faktisk er tildelt, i egen vendor", async () => {
    const vendorId = 700003 + Math.floor(Math.random() * 1000);
    const sakId = await insertTestSak({ vendorId, tiltakslederId: "leader-1", tildelteUserId: ["team-55"] });
    const app = await appWithUser({ id: "team-55", role: "teamleder", vendorId });

    const res = await request(app).get("/api/saker");
    expect(res.status).toBe(200);
    expect(res.body.find((s: any) => s.id === sakId)).toBeDefined();
  });

  it("tiltaksleder (rollen) ser saker der de er satt som tiltaksleder_id", async () => {
    const vendorId = 700004 + Math.floor(Math.random() * 1000);
    const sakId = await insertTestSak({ vendorId, tiltakslederId: "leader-77" });
    const app = await appWithUser({ id: "leader-77", role: "tiltaksleder", vendorId });

    const res = await request(app).get("/api/saker");
    expect(res.status).toBe(200);
    expect(res.body.find((s: any) => s.id === sakId)).toBeDefined();
  });

  it("super_admin ser fortsatt alle saker på tvers av vendorer", async () => {
    const vendorId = 700005 + Math.floor(Math.random() * 1000);
    const sakId = await insertTestSak({ vendorId, tiltakslederId: "leader-1" });
    const app = await appWithUser({ id: "super-1", role: "super_admin" });

    const res = await request(app).get("/api/saker");
    expect(res.status).toBe(200);
    expect(res.body.find((s: any) => s.id === sakId)).toBeDefined();
  });

  it("ukjent/uhåndtert rolle får tom liste, ikke alle saker (fail-closed)", async () => {
    const vendorId = 700006 + Math.floor(Math.random() * 1000);
    await insertTestSak({ vendorId, tiltakslederId: "leader-1" });
    const app = await appWithUser({ id: "unknown-999", role: "helt_ukjent_rolle", vendorId });

    const res = await request(app).get("/api/saker");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
