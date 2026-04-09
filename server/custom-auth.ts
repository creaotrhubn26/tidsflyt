import passport from "passport";
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from "passport-google-oauth20";
import session from "express-session";
import type { Express, Request, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { adminUsers, users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { canAccessVendorApiAdmin, isSuperAdminLikeRole } from "@shared/roles";
import { getAppBaseUrl, getGoogleCallbackUrl } from "./lib/app-base-url";
import { requireDatabaseConnectionString } from "./database-config";
import { authRateLimit } from "./rate-limit";
import { emailService } from "./lib/email-service";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
  provider: string;
  role: string;
  vendorId: number | null;
}

type EmailIdentityInput = {
  email: string;
  provider: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
};

const EMAIL_LINK_TTL_SECONDS = 15 * 60;
const DEFAULT_POST_AUTH_REDIRECT = "/dashboard";
const AUTH_RETURN_TO_SESSION_KEY = "authReturnTo";

function getEmailLoginSecret(): string {
  return (
    process.env.EMAIL_MAGIC_LINK_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    ""
  );
}

function sanitizeReturnTo(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const candidate = value.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return null;
  }

  try {
    const parsed = new URL(candidate, "https://tidum.no");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function getPostAuthRedirect(req: Request, fallback?: unknown): string {
  const session = req.session as unknown as Record<string, unknown> | undefined;
  const sessionReturnTo = sanitizeReturnTo(session?.[AUTH_RETURN_TO_SESSION_KEY]);
  if (session && AUTH_RETURN_TO_SESSION_KEY in session) {
    delete session[AUTH_RETURN_TO_SESSION_KEY];
  }
  return sessionReturnTo ?? sanitizeReturnTo(fallback) ?? DEFAULT_POST_AUTH_REDIRECT;
}

export function buildEmailLoginUrl(email: string, returnTo?: string | null): string {
  const normalizedEmail = email.trim().toLowerCase();
  const secret = getEmailLoginSecret();
  const sanitizedReturnTo = sanitizeReturnTo(returnTo);

  if (!normalizedEmail || !secret) {
    throw new Error("Email magic link is not configured.");
  }

  const token = jwt.sign(
    {
      purpose: "email_login",
      email: normalizedEmail,
      returnTo: sanitizedReturnTo || undefined,
    },
    secret,
    { expiresIn: EMAIL_LINK_TTL_SECONDS },
  );

  return `${getAppBaseUrl()}/api/auth/email/verify?token=${encodeURIComponent(token)}`;
}

function deriveDisplayName(firstName?: string | null, lastName?: string | null, fallback?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback || "";
}

async function resolveAuthorizedUserByEmail({
  email,
  provider,
  displayName,
  firstName,
  lastName,
  profileImageUrl,
}: EmailIdentityInput): Promise<AuthUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const [existingUser] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`)
    .limit(1);
  const [matchingAdmin] = await db
    .select()
    .from(adminUsers)
    .where(sql`lower(${adminUsers.email}) = ${normalizedEmail}`)
    .limit(1);

  const adminIsActive = matchingAdmin?.isActive !== false;
  const adminRole = matchingAdmin?.role || "vendor_admin";
  const adminVendorId = matchingAdmin?.vendorId ?? null;
  const derivedFirstName =
    firstName?.trim() ||
    matchingAdmin?.username?.trim() ||
    displayName?.trim() ||
    normalizedEmail.split("@")[0];
  const derivedLastName = lastName?.trim() || "";
  const derivedProfileImage = profileImageUrl || null;

  if (existingUser) {
    let resolvedUser = existingUser;

    if (
      matchingAdmin &&
      adminIsActive &&
      (existingUser.role !== adminRole ||
        (existingUser.vendorId ?? null) !== adminVendorId ||
        !existingUser.firstName ||
        (!existingUser.lastName && derivedLastName) ||
        (!existingUser.profileImageUrl && derivedProfileImage))
    ) {
      const [updatedUser] = await db
        .update(users)
        .set({
          firstName: existingUser.firstName || derivedFirstName,
          lastName: existingUser.lastName || derivedLastName,
          profileImageUrl: existingUser.profileImageUrl || derivedProfileImage,
          role: adminRole,
          vendorId: adminVendorId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      if (updatedUser) {
        resolvedUser = updatedUser;
      }
    }

    const fullName = deriveDisplayName(
      resolvedUser.firstName,
      resolvedUser.lastName,
      displayName || derivedFirstName,
    );

    return {
      id: resolvedUser.id.toString(),
      email: resolvedUser.email || normalizedEmail,
      name: fullName,
      profileImageUrl: resolvedUser.profileImageUrl || derivedProfileImage,
      provider,
      role: resolvedUser.role || "user",
      vendorId: resolvedUser.vendorId,
    };
  }

  if (matchingAdmin && adminIsActive) {
    const [createdUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        firstName: derivedFirstName,
        lastName: derivedLastName,
        profileImageUrl: derivedProfileImage,
        role: adminRole,
        vendorId: adminVendorId,
      })
      .returning();

    if (createdUser) {
      return {
        id: createdUser.id.toString(),
        email: createdUser.email || normalizedEmail,
        name: deriveDisplayName(
          createdUser.firstName,
          createdUser.lastName,
          displayName || derivedFirstName,
        ),
        profileImageUrl: createdUser.profileImageUrl || derivedProfileImage,
        provider,
        role: createdUser.role || adminRole,
        vendorId: createdUser.vendorId,
      };
    }
  }

  return null;
}

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: requireDatabaseConnectionString(),
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

async function findOrCreateUser(profile: GoogleProfile, provider: string): Promise<AuthUser | null> {
  const email = profile.emails?.[0]?.value;
  if (!email) return null;
  return resolveAuthorizedUserByEmail({
    email,
    provider,
    displayName: profile.displayName || null,
    firstName: profile.name?.givenName || null,
    lastName: profile.name?.familyName || null,
    profileImageUrl: profile.photos?.[0]?.value || null,
  });
}

const isDev = process.env.NODE_ENV !== "production";

const DEV_USER: AuthUser = {
  id: "1",
  email: "dev@tidum.no",
  name: "Dev Bruker",
  profileImageUrl: null,
  provider: "dev",
  role: "super_admin",
  vendorId: null,
};

export async function setupCustomAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // DEV MODE: inject a mock user so all API routes work without OAuth
  if (isDev) {
    app.use((req, _res, next) => {
      if (!req.user) {
        req.user = DEV_USER;
        (req as any).isAuthenticated = () => true;
      }
      next();
    });
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI || getGoogleCallbackUrl(),
      scope: ["openid", "email"],
    }, async (_accessToken, _refreshToken, profile, done) => {
      try {
        const user = await findOrCreateUser(profile, "google");
        if (!user) {
          return done(null, false, { message: "Brukeren er ikke registrert. Vennligst send en tilgangsforespørsel." });
        }
        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    }));
  }

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: AuthUser, done) => {
    done(null, user);
  });

  app.get("/api/auth/google", (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: "Google OAuth er ikke konfigurert" });
    }
    const nextPath = sanitizeReturnTo(req.query?.returnTo);
    const session = req.session as unknown as Record<string, unknown> | undefined;
    if (session) {
      if (nextPath) {
        session[AUTH_RETURN_TO_SESSION_KEY] = nextPath;
      } else {
        delete session[AUTH_RETURN_TO_SESSION_KEY];
      }
    }
    passport.authenticate("google", { 
      scope: ["openid", "email"],
      prompt: "select_account"
    })(req, res, next);
  });

  app.get("/api/auth/google/callback", 
    (req, res, next) => {
      passport.authenticate("google", (err: Error | null, user: AuthUser | false, info?: { message?: string }) => {
        if (err) {
          return next(err);
        }

        if (!user) {
          const normalizedMessage = info?.message?.toLowerCase() || "";
          const errorCode = normalizedMessage.includes("tilgangsforespørsel")
            ? "access_request_required"
            : "auth_failed";
          return res.redirect(`/?error=${errorCode}`);
        }

        req.logIn(user, (loginError) => {
          if (loginError) {
            return next(loginError);
          }
          return res.redirect(getPostAuthRedirect(req));
        });
      })(req, res, next);
    }
  );

  app.post("/api/auth/email/request-link", authRateLimit, async (req, res) => {
    const rawEmail = typeof req.body?.email === "string" ? req.body.email : "";
    const email = rawEmail.trim().toLowerCase();
    const returnTo = sanitizeReturnTo(req.body?.returnTo);

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Gyldig e-post er påkrevd." });
    }

    try {
      const user = await resolveAuthorizedUserByEmail({
        email,
        provider: "email",
      });

      if (user) {
        const loginUrl = buildEmailLoginUrl(email, returnTo);
        await emailService.sendEmailLoginLink(email, user.name || email, loginUrl);
      }

      return res.json({
        success: true,
        message: "Hvis kontoen finnes hos oss, har vi sendt en innloggingslenke.",
      });
    } catch (error) {
      console.error("Email login link error:", error);
      return res.status(500).json({ error: "Kunne ikke sende innloggingslenke akkurat nå." });
    }
  });

  app.get("/api/auth/email/verify", async (req, res, next) => {
    try {
      const token = typeof req.query?.token === "string" ? req.query.token : "";
      const secret = getEmailLoginSecret();

      if (!token || !secret) {
        return res.redirect("/?error=magic_link_invalid");
      }

      const payload = jwt.verify(token, secret) as { email?: string; purpose?: string; returnTo?: string };
      if (payload?.purpose !== "email_login" || !payload.email) {
        return res.redirect("/?error=magic_link_invalid");
      }

      const user = await resolveAuthorizedUserByEmail({
        email: payload.email,
        provider: "email",
      });

      if (!user) {
        return res.redirect("/?error=access_request_required");
      }

      req.logIn(user, (loginError) => {
        if (loginError) {
          return next(loginError);
        }
        return res.redirect(getPostAuthRedirect(req, payload?.returnTo));
      });
    } catch (error) {
      console.error("Email login verify error:", error);
      return res.redirect("/?error=magic_link_expired");
    }
  });

  app.get("/api/auth/apple", (_req, res) => {
    res.status(501).json({ 
      error: "Apple Sign-In krever ytterligere konfigurasjon",
      message: "Kontakt administrator for å sette opp Apple Sign-In"
    });
  });

  app.get("/api/auth/user", (req, res) => {
    if (isDev && !req.isAuthenticated?.()) {
      return res.json(DEV_USER);
    }
    if (req.isAuthenticated() && req.user) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Ikke autentisert" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Kunne ikke logge ut" });
      }
      req.session.destroy((_err) => {
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    });
  });

  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.redirect("/?error=logout_failed");
      }
      req.session.destroy((_err) => {
        res.clearCookie("connect.sid");
        res.redirect("/");
      });
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (isDev) return next();
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  res.status(401).json({ message: "Ikke autentisert" });
};

export const requireVendorAuth: RequestHandler = (req, res, next) => {
  if (isDev) return next();
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Ikke autentisert" });
  }
  
  const user = req.user as AuthUser;
  if (!canAccessVendorApiAdmin(user.role)) {
    return res.status(403).json({ message: "Krever vendor_admin eller super_admin rolle" });
  }
  
  next();
};

export const requireSuperAdmin: RequestHandler = (req, res, next) => {
  if (isDev) return next();
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Ikke autentisert" });
  }
  
  const user = req.user as AuthUser;
  if (!isSuperAdminLikeRole(user.role)) {
    return res.status(403).json({ message: "Krever super_admin rolle" });
  }
  
  next();
};
