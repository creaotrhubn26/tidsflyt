/**
 * Integrasjonstest for CSRF PÅ TVERS av klient og server.
 *
 * client/src/test/server/csrf.test.ts tester serveren isolert med supertest og
 * et manuelt satt `x-csrf-token`-header — den kan per konstruksjon ikke fange
 * at KLIENTEN aldri sendte headeren. Denne testen kjører den ekte
 * `apiRequest`-funksjonen fra client/src/lib/queryClient.ts mot en ekte
 * Express-server med den ekte, betinget monterte `csrfProtection`-middlewaren
 * fra server/custom-auth.ts, over en ekte HTTP-socket.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import session from "express-session";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { csrfProtection, generateCsrfToken } from "../../../../server/lib/csrf";
import { apiRequest } from "../../lib/queryClient";
import { installCsrfFetch } from "../../lib/csrf";

let server: Server;
let baseUrl: string;
const cookieJar = new Map<string, string>();

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: true }));
  // Simulerer en sesjons-autentisert bruker (det csrfProtection er montert på).
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    next();
  });

  app.get("/api/csrf-token", (req, res) => {
    res.json({ token: generateCsrfToken(req, res) });
  });

  // Nøyaktig samme betingede montering som server/custom-auth.ts.
  app.use((req, res, next) => {
    const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
    const isSessionAuthed = (req as any).isAuthenticated?.() === true;
    if (isStateChanging && isSessionAuthed) {
      return csrfProtection(req, res, next);
    }
    next();
  });

  app.post("/api/echo", (req, res) => res.json({ ok: true, body: req.body }));
  return app;
}

/**
 * Basis-fetch for testen: løser relative URL-er mot testserveren og holder en
 * cookie-jar (Node-fetch har ingen). Installeres FØR installCsrfFetch, slik at
 * CSRF-wrapperen legger seg utenpå den — akkurat som i nettleseren der den
 * legger seg utenpå nettleserens egen fetch.
 */
function installBaseFetch() {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: any, init?: RequestInit) => {
    const url = new URL(String(input), baseUrl);
    const headers = new Headers(init?.headers);
    const cookies = [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookies) headers.set("cookie", cookies);
    const res = await realFetch(url, { ...init, headers, redirect: "manual" });
    const setCookies: string[] =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : [res.headers.get("set-cookie")].filter(Boolean) as string[];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const idx = pair.indexOf("=");
      cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    return res;
  };
}

describe("CSRF ende-til-ende: apiRequest mot montert csrfProtection", () => {
  beforeAll(async () => {
    process.env.CSRF_SECRET ||= "test-secret-for-vitest";
    await new Promise<void>((resolve) => {
      server = buildApp().listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    installBaseFetch();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("uten CSRF-klienten: apiRequest sin POST avvises med 403 (regresjonsvakt)", async () => {
    await expect(apiRequest("POST", "/api/echo", { hello: "world" })).rejects.toThrow(/403/);
  });

  it("med installCsrfFetch(): samme apiRequest-kall går gjennom", async () => {
    installCsrfFetch();
    const res = await apiRequest("POST", "/api/echo", { hello: "world" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, body: { hello: "world" } });
  });

  it("GET-er får ikke headeren (og trenger den ikke)", async () => {
    const res = await fetch("/api/csrf-token");
    expect(res.status).toBe(200);
  });
});
