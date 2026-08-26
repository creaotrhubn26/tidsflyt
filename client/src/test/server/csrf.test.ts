import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  csrfProtection,
  generateCsrfToken,
  requireCsrfSecret,
  sessionCsrfProtection,
} from "../../../../server/lib/csrf";

describe("CSRF protection", () => {
  beforeAll(() => {
    process.env.CSRF_SECRET ||= "test-secret-for-vitest";
  });

  function addSession(req: express.Request) {
    (req as any).sessionID = "test-session-id";
    (req as any).session = { passport: { user: "user-1" } };
  }

  function buildProtectedApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      addSession(req);
      next();
    });
    app.get("/csrf-token", (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.json({ token: generateCsrfToken(req, res) });
    });
    app.use(sessionCsrfProtection);
    app.post("/state-changing", (_req, res) => res.json({ ok: true }));
    return app;
  }

  it("rejects a session-authenticated POST without a token", async () => {
    const response = await request(buildProtectedApp())
      .post("/state-changing")
      .send({});

    expect(response.status).toBe(403);
    expect(response.headers["x-csrf-error"]).toBe("invalid-token");
    expect(response.body).toEqual({ message: "Ugyldig eller manglende CSRF-token" });
  });

  it("accepts a session-authenticated POST with its cookie-bound token", async () => {
    const agent = request.agent(buildProtectedApp());
    const tokenResponse = await agent.get("/csrf-token");
    const response = await agent
      .post("/state-changing")
      .set("x-csrf-token", tokenResponse.body.token)
      .send({});

    expect(tokenResponse.headers["cache-control"]).toBe("no-store");
    expect(response.status).toBe(200);
  });

  it("does not impose CSRF on a Bearer-only request", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { id: "mobile-user" };
      (req as any).session = {};
      next();
    });
    app.use(sessionCsrfProtection);
    app.post("/mobile", (_req, res) => res.json({ ok: true }));

    const response = await request(app)
      .post("/mobile")
      .set("authorization", "Bearer mobile-token")
      .send({});

    expect(response.status).toBe(200);
  });

  it("does not impose CSRF on read-only session requests", async () => {
    const app = express();
    app.use((req, _res, next) => {
      addSession(req);
      next();
    });
    app.use(sessionCsrfProtection);
    app.get("/read", (_req, res) => res.json({ ok: true }));

    expect((await request(app).get("/read")).status).toBe(200);
  });

  it("fails closed when CSRF_SECRET is missing", () => {
    const original = process.env.CSRF_SECRET;
    delete process.env.CSRF_SECRET;
    expect(() => requireCsrfSecret()).toThrow(/CSRF_SECRET/);
    process.env.CSRF_SECRET = original;
  });
});

describe("CSRF cookie policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function getCookie(nodeEnv: string): Promise<string> {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("CSRF_SECRET", "test-secret-for-vitest");
    vi.resetModules();
    const { generateCsrfToken: generate } = await import("../../../../server/lib/csrf");

    const app = express();
    app.use((req, _res, next) => {
      (req as any).sessionID = "cookie-policy-session";
      (req as any).session = {};
      next();
    });
    app.get("/csrf-token", (req, res) => {
      generate(req, res);
      res.end();
    });

    const response = await request(app).get("/csrf-token");
    return (response.headers["set-cookie"] || []).join(";");
  }

  it("uses a secure __Host- cookie in production", async () => {
    const cookie = await getCookie("production");
    expect(cookie).toContain("__Host-tidum.csrf=");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("uses a local-development compatible cookie outside production", async () => {
    const cookie = await getCookie("test");
    expect(cookie).toContain("tidum.csrf=");
    expect(cookie).not.toContain("__Host-tidum.csrf=");
    expect(cookie).not.toContain("Secure");
  });
});

// Direct middleware export remains covered separately from the conditional
// session wrapper so future route-level use cannot silently weaken it.
describe("direct csrfProtection", () => {
  it("rejects a mutation without a token", async () => {
    const app = express();
    app.post("/write", csrfProtection, (_req, res) => res.json({ ok: true }));
    expect((await request(app).post("/write")).status).toBe(403);
  });
});
