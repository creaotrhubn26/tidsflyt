import { describe, it, expect, beforeAll } from "vitest";
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
