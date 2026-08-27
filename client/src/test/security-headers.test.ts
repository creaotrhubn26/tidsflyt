import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createSecurityHeadersMiddleware } from "../../../server/lib/security-headers";

function buildApp(isProduction: boolean) {
  const app = express();
  app.use(createSecurityHeadersMiddleware(isProduction));
  app.get("/", (_req, res) => res.send("ok"));
  return app;
}

describe("HTTP security headers", () => {
  it("enforces CSP, clickjacking protection and HSTS in production", async () => {
    const response = await request(buildApp(true)).get("/");
    const csp = response.headers["content-security-policy"];

    expect(response.status).toBe(200);
    expect(response.headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(response.headers["strict-transport-security"]).toContain("includeSubDomains");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).toContain("https://data.brreg.no");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("does not force HTTPS or HSTS in local development", async () => {
    const response = await request(buildApp(false)).get("/");
    const csp = response.headers["content-security-policy"];

    expect(response.headers["strict-transport-security"]).toBeUndefined();
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(csp).toContain("'unsafe-eval'");
  });
});
