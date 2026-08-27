import type { NextFunction, Request, RequestHandler, Response } from "express";
import cookieParser from "cookie-parser";
import { doubleCsrf } from "csrf-csrf";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_ERROR_HEADER = "X-CSRF-Error";

export function requireCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret) {
    throw new Error("CSRF_SECRET er ikke konfigurert");
  }
  return secret;
}

const isProduction = process.env.NODE_ENV === "production";
const { doubleCsrfProtection, generateCsrfToken: generate } = doubleCsrf({
  getSecret: () => requireCsrfSecret(),
  getSessionIdentifier: (req) => req.sessionID || "no-session",
  cookieName: isProduction ? "__Host-tidum.csrf" : "tidum.csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  },
  errorConfig: {
    statusCode: 403,
    message: "Invalid CSRF token",
    code: "EBADCSRFTOKEN",
  },
});

const parseCookies: RequestHandler = cookieParser();

function ensureCookiesParsed(req: Request, res: Response, next: NextFunction) {
  if ((req as Request & { cookies?: unknown }).cookies) {
    next();
    return;
  }
  parseCookies(req, res, next);
}

/** True only for a real Passport cookie session, never for Bearer-only auth. */
export function hasPassportSession(req: Request): boolean {
  const session = req.session as unknown as Record<string, unknown> | undefined;
  const passportSession = session?.passport as { user?: unknown } | undefined;
  return !!passportSession?.user;
}

export const csrfProtection: RequestHandler = (req, res, next) => {
  ensureCookiesParsed(req, res, (parseError?: unknown) => {
    if (parseError) return next(parseError);

    try {
      doubleCsrfProtection(req, res, (csrfError?: unknown) => {
        if (!csrfError) return next();

        res.setHeader(CSRF_ERROR_HEADER, "invalid-token");
        res.setHeader("Cache-Control", "no-store");
        return res.status(403).json({ message: "Ugyldig eller manglende CSRF-token" });
      });
    } catch (error) {
      next(error);
    }
  });
};

/** Apply CSRF only to state-changing requests authenticated by session cookie. */
export const sessionCsrfProtection: RequestHandler = (req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method) || !hasPassportSession(req)) {
    return next();
  }
  return csrfProtection(req, res, next);
};

export function generateCsrfToken(req: Request, res: Response): string {
  let token: string | undefined;
  let parseError: unknown;

  ensureCookiesParsed(req, res, (error?: unknown) => {
    parseError = error;
    if (!error) token = generate(req, res, { validateOnReuse: true });
  });

  if (parseError) throw parseError;
  if (!token) throw new Error("Kunne ikke generere CSRF-token");
  return token;
}
