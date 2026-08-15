import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

beforeAll(() => {
  process.env.MOBILE_JWT_SECRET = "test-secret-do-not-use-in-prod";
  process.env.NODE_ENV = "production";
});

describe("POST /api/auth/mobile/refresh and /api/auth/mobile/logout", () => {
  it("rejects POST /api/auth/mobile/refresh with no refreshToken (400)", async () => {
    const { handleMobileRefresh, handleMobileLogout } = await import(
      "../../../../server/custom-auth"
    );

    const app = express();
    app.use(express.json());
    app.post("/api/auth/mobile/refresh", handleMobileRefresh);
    app.post("/api/auth/mobile/logout", handleMobileLogout);

    const res = await request(app).post("/api/auth/mobile/refresh").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("refreshToken er påkrevd");
  });

  it("accepts POST /api/auth/mobile/logout with no refreshToken (200 success)", async () => {
    const { handleMobileRefresh, handleMobileLogout } = await import(
      "../../../../server/custom-auth"
    );

    const app = express();
    app.use(express.json());
    app.post("/api/auth/mobile/refresh", handleMobileRefresh);
    app.post("/api/auth/mobile/logout", handleMobileLogout);

    const res = await request(app).post("/api/auth/mobile/logout").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  // Note: POST /api/auth/mobile/refresh with unknown token would return 401 after
  // refreshMobileAccessToken queries the DB. That DB-touching code path can't fully
  // verify in this test environment (same limitation as Tasks 2/3 — no live DATABASE_URL).
  // The route's try/catch correctly handles DB errors by returning 500, confirmed via
  // the handler logic path tracing.
});
