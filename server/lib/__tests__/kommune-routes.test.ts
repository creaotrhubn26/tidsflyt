import { describe, it, expect, afterEach, afterAll, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";

// registerRoutes(httpServer, app) sin httpServer-parameter er kun en
// gjennomgangs-returverdi — samme mønster som andre ruter-tester denne
// økten.
//
// VIKTIG (funnet ved kjøring, ikke antatt): smartTimingRoutes.ts sin
// isDevMode (`NODE_ENV !== 'production'`) er en modul-last-tidspunkt-
// konstant, og Vitests standard NODE_ENV er "test" — det utløser
// dev-mode-bypasset FØRST i authenticateAdmin, som ALLTID overskriver
// req.admin til en hardkodet super_admin uansett hva som er satt før den
// kjører. Å injisere req.admin direkte (slik andre req.user-baserte
// ruter-tester denne økten gjør, f.eks. task-assignment-routes.test.ts)
// virker derfor IKKE her — bekreftet empirisk: "ikke-super_admin"-testen
// fikk 201 i stedet for 403 inntil dette ble rettet. Samme fallgruve og
// samme løsning som vendor-routes-permissions.test.ts: tving NODE_ENV til
// "production" og importer modulgrafen på nytt FØR noen test kjører, slik
// at isDevMode=false bakes inn i denne filens modulinstans for alle
// testene. NODE_ENV settes tilbake til "test" rett etter (så
// attachActivityLoggings egen kjøretids-sjekk `NODE_ENV === "test"`
// fortsatt hindrer stray-rader i den delte aktivitetsloggen når testene
// faktisk sender forespørsler). Gjøres ÉN gang (ikke per test, ulikt
// vendor-routes-permissions.test.ts) for å unngå å åpne 7 separate
// pg.Pool-er (se dens kommentar om nøyaktig denne lekkasjen) — vi trenger
// bare étt fungerende NODE_ENV=production-import for hele filen.
describe("kommune-administrasjon API", () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupUserIds: string[] = [];
  let dynamicPool: { end: () => Promise<void> } | undefined;

  beforeAll(async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    await import("../../routes");
    const { pool: freshPool } = await import("../../db");
    dynamicPool = freshPool;
    process.env.NODE_ENV = prevNodeEnv;
  });

  afterAll(async () => {
    await dynamicPool?.end();
  });

  afterEach(async () => {
    for (const id of cleanupUserIds.splice(0)) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    for (const id of cleanupKommuneIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
    }
  });

  // authenticateAdmin's sesjon-gren (server/smartTimingRoutes.ts) leser
  // req.user/req.isAuthenticated() og bygger req.admin fra den — så
  // dette er den delen av harnesset som faktisk må stå urørt fra
  // dev-mode-bypasset over for å styre rollen per test.
  async function appWithAdmin(admin: { roleId: string | null; role: string; vendorId?: number | null; kommuneId?: number | null }) {
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.isAuthenticated = () => true;
      req.user = { id: "test-admin", email: "test-admin@example.com", ...admin };
      next();
    });
    await registerRoutes(http.createServer(), app);
    return app;
  }

  it("super_admin kan opprette en kommune", async () => {
    const app = await appWithAdmin({ roleId: null, role: "super_admin" });

    const res = await request(app).post("/api/kommuner").send({ navn: "Testkommune API", orgNummer: "923456789" });
    expect(res.status).toBe(201);
    expect(res.body.navn).toBe("Testkommune API");
    cleanupKommuneIds.push(res.body.id);
  });

  it("ikke-super_admin kan IKKE opprette en kommune (403)", async () => {
    const app = await appWithAdmin({ roleId: null, role: "vendor_admin" });

    const res = await request(app).post("/api/kommuner").send({ navn: "Skal feile", orgNummer: "934567890" });
    expect(res.status).toBe(403);
  });

  it("ugyldig orgNummer gir 400", async () => {
    const app = await appWithAdmin({ roleId: null, role: "super_admin" });

    const res = await request(app).post("/api/kommuner").send({ navn: "X", orgNummer: "123" });
    expect(res.status).toBe(400);
  });

  it("duplisert orgNummer gir 409", async () => {
    const app = await appWithAdmin({ roleId: null, role: "super_admin" });
    const first = await request(app).post("/api/kommuner").send({ navn: "Første", orgNummer: "945678901" });
    cleanupKommuneIds.push(first.body.id);

    const res = await request(app).post("/api/kommuner").send({ navn: "Duplikat", orgNummer: "945678901" });
    expect(res.status).toBe(409);
  });

  it("super_admin kan invitere den første barnevernslederen på en kommune", async () => {
    const app = await appWithAdmin({ roleId: null, role: "super_admin" });
    const kommune = await request(app).post("/api/kommuner").send({ navn: "Med leder", orgNummer: "956789012" });
    cleanupKommuneIds.push(kommune.body.id);

    const res = await request(app)
      .post(`/api/kommuner/${kommune.body.id}/admins`)
      .send({ email: `leder-${Date.now()}@example.com`, fullName: "Test Leder", role: "barnevernsleder", sendInvite: false });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("barnevernsleder");
    cleanupUserIds.push(res.body.id);

    const { rows } = await pool.query(`SELECT kommune_id, role FROM users WHERE id = $1`, [res.body.id]);
    expect(rows[0].kommune_id).toBe(kommune.body.id);
    expect(rows[0].role).toBe("barnevernsleder");
  });

  it("kan invitere en kommune_saksbehandler til samme kommune", async () => {
    const app = await appWithAdmin({ roleId: null, role: "super_admin" });
    const kommune = await request(app).post("/api/kommuner").send({ navn: "Med saksbehandler", orgNummer: "967890123" });
    cleanupKommuneIds.push(kommune.body.id);

    const res = await request(app)
      .post(`/api/kommuner/${kommune.body.id}/admins`)
      .send({ email: `sb-${Date.now()}@example.com`, fullName: "Test SB", role: "kommune_saksbehandler", sendInvite: false });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("kommune_saksbehandler");
    cleanupUserIds.push(res.body.id);
  });

  it("ugyldig rolle på invitasjon gir 400", async () => {
    const app = await appWithAdmin({ roleId: null, role: "super_admin" });
    const kommune = await request(app).post("/api/kommuner").send({ navn: "Ugyldig rolle-test", orgNummer: "978901234" });
    cleanupKommuneIds.push(kommune.body.id);

    const res = await request(app)
      .post(`/api/kommuner/${kommune.body.id}/admins`)
      .send({ email: "x@example.com", role: "super_admin", sendInvite: false });
    expect(res.status).toBe(400);
  });
});
