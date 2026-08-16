import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { csrfProtection, generateCsrfToken } from "../../../../server/lib/csrf";

describe("CSRF-vern", () => {
  beforeAll(() => {
    // csrf.ts's requireCsrfSecret() reads this lazily per-request, so it's
    // fine to set it here rather than in production code or global config.
    process.env.CSRF_SECRET ||= "test-secret-for-vitest";
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // simulerer en innlogget sesjon (det csrf-csrf sitt double-submit-cookie-mønster krever)
      (req as any).session = {};
      next();
    });
    app.get("/csrf-token", (req, res) => res.json({ token: generateCsrfToken(req, res) }));
    app.post("/state-changing", csrfProtection, (req, res) => res.json({ ok: true }));
    return app;
  }

  it("avviser POST uten gyldig CSRF-token", async () => {
    const app = buildApp();
    const res = await request(app).post("/state-changing").send({});
    expect(res.status).toBe(403);
  });

  it("godtar POST med gyldig token hentet fra /csrf-token", async () => {
    const app = buildApp();
    const agent = request.agent(app);
    const tokenRes = await agent.get("/csrf-token");
    const res = await agent
      .post("/state-changing")
      .set("x-csrf-token", tokenRes.body.token)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("CSRF-cookienavn (__Host- prefiks krever secure)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function getSetCookieHeader(nodeEnv: string): Promise<string> {
    vi.stubEnv("NODE_ENV", nodeEnv);
    process.env.CSRF_SECRET ||= "test-secret-for-vitest";
    vi.resetModules();
    const { generateCsrfToken: generate } = await import("../../../../server/lib/csrf");

    const app = express();
    app.use((req, _res, next) => {
      (req as any).session = {};
      next();
    });
    app.get("/csrf-token", (req, res) => {
      generate(req, res);
      res.end();
    });

    const res = await request(app).get("/csrf-token");
    return (res.headers["set-cookie"] || []).join(";");
  }

  it("bruker __Host-prefiks i production (secure=true)", async () => {
    const setCookie = await getSetCookieHeader("production");
    expect(setCookie).toContain("__Host-tidum.csrf=");
  });

  it("bruker plain cookienavn utenfor production (secure=false)", async () => {
    const setCookie = await getSetCookieHeader("test");
    expect(setCookie).toContain("tidum.csrf=");
    expect(setCookie).not.toContain("__Host-tidum.csrf=");
  });
});
