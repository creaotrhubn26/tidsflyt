import type { Request, RequestHandler, Response } from "express";
import cookieParser from "cookie-parser";
import { doubleCsrf } from "csrf-csrf";

// CSRF-tokens signeres med sin egen hemmelighet — ikke delt med noen annen
// tokentype (samme isolasjonsprinsipp som resten av G-10-arbeidet, se
// requireEmailLoginSecret i server/custom-auth.ts og requireAuthJwtSecret i
// server/middleware/auth.ts).
function requireCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret) {
    throw new Error("CSRF_SECRET er ikke konfigurert");
  }
  return secret;
}

// __Host- is a browser-enforced cookie-name prefix: the cookie is silently
// rejected unless Secure is also set, regardless of transport. secure is
// only true when NODE_ENV === "production", so the prefix must match —
// otherwise the cookie never lands outside production and every real
// session-authenticated state-changing request fails CSRF silently.
const isProd = process.env.NODE_ENV === "production";

const { doubleCsrfProtection, generateCsrfToken: generate } = doubleCsrf({
  getSecret: () => requireCsrfSecret(),
  cookieName: isProd ? "__Host-tidum.csrf" : "tidum.csrf",
  cookieOptions: {
    sameSite: "lax",
    secure: isProd,
    path: "/",
  },
  getSessionIdentifier: (req) => (req as any).sessionID || "no-session",
});

// csrf-csrf reads/writes the CSRF cookie via req.cookies, which only exists
// once cookie-parser middleware has run. Rather than requiring every mount
// point (server/custom-auth.ts, this module's own tests) to remember to
// mount cookie-parser globally beforehand, parse cookies here if they
// haven't been parsed yet — cookie-parser is synchronous, so this is a
// plain function call, not an extra async hop.
const parseCookies: RequestHandler = cookieParser();

function ensureCookiesParsed(req: Request, res: Response, done: () => void) {
  if ((req as any).cookies) {
    done();
    return;
  }
  parseCookies(req, res, done);
}

export const csrfProtection: RequestHandler = (req, res, next) => {
  ensureCookiesParsed(req, res, () => doubleCsrfProtection(req, res, next));
};

export function generateCsrfToken(req: Request, res: Response): string {
  let token = "";
  ensureCookiesParsed(req, res, () => {
    token = generate(req, res);
  });
  return token;
}
