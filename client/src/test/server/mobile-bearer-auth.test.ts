import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

beforeAll(() => {
  process.env.MOBILE_JWT_SECRET = "test-secret-do-not-use-in-prod";
  // isAuthenticatedOrBearer (like isAuthenticated) short-circuits to next()
  // whenever isDev (NODE_ENV !== "production") is true. Vitest sets
  // NODE_ENV=test by default, so without this the "reject" test below
  // would pass through unauthenticated and never actually exercise the
  // rejection path.
  process.env.NODE_ENV = "production";
});

describe("isAuthenticatedOrBearer", () => {
  it("rejects a request with no credentials", async () => {
    const { isAuthenticatedOrBearer } = await import("../../../../server/custom-auth");
    const app = express();
    app.get("/protected", isAuthenticatedOrBearer, (_req, res) => res.json({ ok: true }));
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("accepts a request with a valid Bearer access token and populates req.user", async () => {
    const { resolveBearerUser, isAuthenticatedOrBearer } = await import("../../../../server/custom-auth");
    const { signAccessToken } = await import("../../../../server/lib/mobile-auth");
    const { db } = await import("../../../../server/db");
    const { users } = await import("../../../../shared/schema");

    const [user] = await db
      .insert(users)
      .values({ email: `bearer-test-${Date.now()}@example.com`, role: "member", firstName: "Test" })
      .returning();

    const app = express();
    app.use(resolveBearerUser);
    app.get("/protected", isAuthenticatedOrBearer, (req, res) => res.json({ id: (req.user as any).id }));

    const token = signAccessToken(user.id);
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);

    const { eq } = await import("drizzle-orm");
    await db.delete(users).where(eq(users.id, user.id));
  });
});

describe("isAuthenticated stays session-cookie-only", () => {
  it("rejects a request where only req.user is set (what resolveBearerUser produces for a Bearer token), with no req.session.passport", async () => {
    const { isAuthenticated } = await import("../../../../server/custom-auth");
    const app = express();
    // Simulates exactly the post-condition resolveBearerUser leaves behind
    // for a Bearer-only request: req.user populated, no Passport session.
    // No need to round-trip through a real JWT/DB lookup to prove this
    // boundary — isAuthenticated must reject on req.session alone.
    app.use((req: any, _res, next) => {
      req.user = { id: "bearer-user-1" };
      next();
    });
    app.get("/protected", isAuthenticated, (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("accepts a request with a real Passport session (req.session.passport.user set)", async () => {
    const { isAuthenticated } = await import("../../../../server/custom-auth");
    const app = express();
    // Mirrors what passport.deserializeUser produces on a real session-backed
    // request — no need for the full express-session + passport middleware
    // stack to unit-test that isAuthenticated reads this field.
    app.use((req: any, _res, next) => {
      req.session = { passport: { user: { id: "session-user-1" } } };
      req.user = { id: "session-user-1" };
      next();
    });
    app.get("/protected", isAuthenticated, (req, res) => res.json({ id: (req.user as any).id }));

    const res = await request(app).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("session-user-1");
  });
});
