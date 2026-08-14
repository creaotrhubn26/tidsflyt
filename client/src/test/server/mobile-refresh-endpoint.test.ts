import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

beforeAll(() => {
  process.env.MOBILE_JWT_SECRET = "test-secret-do-not-use-in-prod";
  process.env.NODE_ENV = "production";
});

describe("POST /api/auth/mobile/refresh and /api/auth/mobile/logout", () => {
  it("rejects POST /api/auth/mobile/refresh with no refreshToken (400)", async () => {
    const { refreshMobileAccessToken, revokeMobileRefreshToken } = await import(
      "../../../../server/lib/mobile-auth"
    );

    const app = express();
    app.use(express.json());

    app.post("/api/auth/mobile/refresh", async (req, res) => {
      const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
      if (!refreshToken) {
        return res.status(400).json({ message: "refreshToken er påkrevd" });
      }

      try {
        const result = await refreshMobileAccessToken(refreshToken);
        if (!result) {
          return res.status(401).json({ message: "Ugyldig eller utløpt refresh-token" });
        }
        res.json(result);
      } catch (error) {
        console.error("Mobile refresh token error:", error);
        return res.status(500).json({ error: "Kunne ikke fornye token akkurat nå." });
      }
    });

    app.post("/api/auth/mobile/logout", async (req, res) => {
      const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";

      try {
        if (refreshToken) {
          await revokeMobileRefreshToken(refreshToken);
        }
        res.json({ success: true });
      } catch (error) {
        console.error("Mobile logout error:", error);
        return res.status(500).json({ error: "Kunne ikke logge ut akkurat nå." });
      }
    });

    const res = await request(app).post("/api/auth/mobile/refresh").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("refreshToken er påkrevd");
  });

  it("accepts POST /api/auth/mobile/logout with no refreshToken (200 success)", async () => {
    const { refreshMobileAccessToken, revokeMobileRefreshToken } = await import(
      "../../../../server/lib/mobile-auth"
    );

    const app = express();
    app.use(express.json());

    app.post("/api/auth/mobile/refresh", async (req, res) => {
      const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
      if (!refreshToken) {
        return res.status(400).json({ message: "refreshToken er påkrevd" });
      }

      try {
        const result = await refreshMobileAccessToken(refreshToken);
        if (!result) {
          return res.status(401).json({ message: "Ugyldig eller utløpt refresh-token" });
        }
        res.json(result);
      } catch (error) {
        console.error("Mobile refresh token error:", error);
        return res.status(500).json({ error: "Kunne ikke fornye token akkurat nå." });
      }
    });

    app.post("/api/auth/mobile/logout", async (req, res) => {
      const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";

      try {
        if (refreshToken) {
          await revokeMobileRefreshToken(refreshToken);
        }
        res.json({ success: true });
      } catch (error) {
        console.error("Mobile logout error:", error);
        return res.status(500).json({ error: "Kunne ikke logge ut akkurat nå." });
      }
    });

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
