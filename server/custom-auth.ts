import passport from "passport";
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from "passport-google-oauth20";
import session from "express-session";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import connectPg from "connect-pg-simple";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { verifyAccessToken, issueMobileTokens, refreshMobileAccessToken, revokeMobileRefreshToken } from "./lib/mobile-auth";
import { adminUsers, users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { getAppBaseUrl, getGoogleCallbackUrl } from "./lib/app-base-url";
import { requireDatabaseConnectionString } from "./database-config";
import { authRateLimit } from "./rate-limit";
import { emailService } from "./lib/email-service";
import type { AuthUser } from "./lib/auth-types";
import { requiresEidLogin, hasLinkedEid } from "./eid-auth";
import { isDevAuthBypassAllowed, isTotpStepUpPending } from "./middleware/auth";
import { hasTotpEnrolled } from "./lib/totp";
import { canAccessVendorApiAdmin } from "@shared/roles";
import {
  generateCsrfToken,
  requireCsrfSecret,
  sessionCsrfProtection,
} from "./lib/csrf";
import {
  resolveFreshGlobalSuperAdmin,
  resolveFreshIntegrationAdmin,
  resolveFreshVendorCredentialAdmin,
  resolveFreshVendorDataAdmin,
  resolveFreshVendorMember,
  type FreshAdminActor,
  type FreshIntegrationAdminActor,
} from "./lib/global-admin-authorization";

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

const HARDCODED_SUPER_ADMIN_EMAILS = ["daniel@creatorhubn.com"];

function getSuperAdminEmails(): Set<string> {
  const fromEnv = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...HARDCODED_SUPER_ADMIN_EMAILS, ...fromEnv]);
}

function isSuperAdminEmail(email: string): boolean {
  return getSuperAdminEmails().has(email.trim().toLowerCase());
}

// Magic links have their own signing secret. Do not fall back to session,
// bearer or mobile secrets: token types must remain cryptographically split.
export function requireEmailLoginSecret(): string {
  const secret = process.env.EMAIL_MAGIC_LINK_SECRET;
  if (!secret) {
    throw new Error("EMAIL_MAGIC_LINK_SECRET er ikke konfigurert");
  }
  return secret;
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

// Krav 20 (G-10): TOTP for admin-roller. Utrullingsdato styrer 30-dagers
// nådeperioden for allerede aktive admins uten innrullering.
const TOTP_ROLLOUT_DATE = new Date(process.env.TOTP_ROLLOUT_DATE || "2026-09-01T00:00:00Z");

async function checkTotpRequirement(user: AuthUser): Promise<"not_required" | "grace_period" | "required_missing" | "satisfied"> {
  if (!canAccessVendorApiAdmin(user.role)) return "not_required";
  const enrolled = await hasTotpEnrolled(user.id);
  if (enrolled) return "satisfied";
  const daysSinceRollout = (Date.now() - TOTP_ROLLOUT_DATE.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceRollout < 30 ? "grace_period" : "required_missing";
}

// Kalles rett etter en vellykket req.logIn for de web-sesjonsbaserte
// innloggingsflytene (Google-callback, magic-link, BankID/eID og Entra ID).
// "required_missing": sesjonen er opprettet, men klienten skal ikke vise
// dashbordet før TOTP er satt opp — send til oppsettsiden.
// "grace_period": sesjonsflagg klienten kan lese for et varsel; fortsett.
// "satisfied": brukeren HAR en registrert TOTP-credential — TOTP kreves ved
// HVER innlogging etter innrullering. totpVerified settes eksplisitt til
// false her, og admin-guardene avviser til /api/totp/verify setter true.
export async function redirectAfterLogin(req: Request, res: Response, user: AuthUser, fallback?: unknown): Promise<void> {
  const totpStatus = await checkTotpRequirement(user);
  if (totpStatus === "required_missing") {
    res.redirect("/totp-setup");
    return;
  }
  if (totpStatus === "grace_period") {
    (req.session as any).totpGracePeriod = true;
  }
  if (totpStatus === "satisfied") {
    (req.session as any).totpVerified = false;
    res.redirect("/totp-challenge");
    return;
  }
  res.redirect(getPostAuthRedirect(req, fallback));
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
  const secret = requireEmailLoginSecret();
  const sanitizedReturnTo = sanitizeReturnTo(returnTo);

  if (!normalizedEmail) {
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

  const isAllowlistedSuperAdmin = isSuperAdminEmail(normalizedEmail);
  const adminIsActive = matchingAdmin
    ? matchingAdmin.isActive !== false
    : isAllowlistedSuperAdmin;
  const adminRole = isAllowlistedSuperAdmin
    ? "super_admin"
    : matchingAdmin?.role || "vendor_admin";
  const adminVendorId = isAllowlistedSuperAdmin
    ? null
    : matchingAdmin?.vendorId ?? null;
  const hasAdminGrant = !!matchingAdmin || isAllowlistedSuperAdmin;
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
      hasAdminGrant &&
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

  if (hasAdminGrant && adminIsActive) {
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

export function shouldRejectNonEidLogin(role: string | null | undefined, eidLinked: boolean): boolean {
  return requiresEidLogin(role) && eidLinked;
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
    tableName: "tidum_sessions",
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

const DEV_USER: AuthUser = {
  id: "1",
  email: "dev@tidum.no",
  name: "Dev Bruker",
  profileImageUrl: null,
  provider: "dev",
  role: "super_admin",
  vendorId: null,
};

export async function handleMobileRefresh(req: Request, res: any) {
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
}

export async function handleMobileLogout(req: Request, res: any) {
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
}

export async function setupCustomAuth(app: Express) {
  // Fail at startup instead of discovering a missing CSRF signing secret on
  // the first authenticated write request.
  requireCsrfSecret();

  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(resolveBearerUser);

  app.get("/api/csrf-token", (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json({ token: generateCsrfToken(req, res) });
    } catch (error) {
      next(error);
    }
  });

  // This inspects req.session.passport directly. req.isAuthenticated() is
  // not sufficient here because resolveBearerUser also populates req.user.
  app.use(sessionCsrfProtection);

  // Local super-admin injection is opt-in as well as non-production.
  if (isDevAuthBypassAllowed()) {
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

        hasLinkedEid(user.id)
          .then((eidLinked) => {
            if (shouldRejectNonEidLogin(user.role, eidLinked)) {
              return res.redirect("/?error=eid_required");
            }
            req.logIn(user, (loginError) => {
              if (loginError) {
                return next(loginError);
              }
              redirectAfterLogin(req, res, user).catch(next);
            });
          })
          .catch(next);
      })(req, res, next);
    }
  );

  // Mobilappens Google-innlogging. passport-oauth2 lar callbackURL overstyres
  // per authenticate()-kall (options.callbackURL || this._callbackURL, se
  // node_modules/passport-oauth2/lib/strategy.js) — samme registrerte
  // "google"-strategi gjenbrukes, bare med et annet mål for redirect_uri enn
  // web-varianten. MOBILE_AUTH_CALLBACK_URL er custom URL scheme-en appen
  // fanger opp via ASWebAuthenticationSession.
  const MOBILE_AUTH_CALLBACK_URL = "tidum://auth-callback";
  const getGoogleMobileCallbackUrl = () => `${getAppBaseUrl()}/api/auth/google/callback-mobile`;

  app.get("/api/auth/google-mobile", authRateLimit, (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: "Google OAuth er ikke konfigurert" });
    }
    passport.authenticate("google", {
      scope: ["openid", "email"],
      prompt: "select_account",
      callbackURL: getGoogleMobileCallbackUrl(),
    } as any)(req, res, next);
  });

  app.get("/api/auth/google/callback-mobile", authRateLimit, (req, res, next) => {
    passport.authenticate(
      "google",
      { callbackURL: getGoogleMobileCallbackUrl() } as any,
      (err: Error | null, user: AuthUser | false, info?: { message?: string }) => {
        if (err) return next(err);
        if (!user) {
          const normalizedMessage = info?.message?.toLowerCase() || "";
          const errorCode = normalizedMessage.includes("tilgangsforespørsel")
            ? "access_request_required"
            : "auth_failed";
          return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=${errorCode}`);
        }
        hasLinkedEid(user.id)
          .then(async (eidLinked) => {
            if (shouldRejectNonEidLogin(user.role, eidLinked)) {
              return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_required`);
            }
            const { accessToken, refreshToken, expiresIn } = await issueMobileTokens(user.id);
            const redirectUrl = new URL(MOBILE_AUTH_CALLBACK_URL);
            redirectUrl.searchParams.set("access_token", accessToken);
            redirectUrl.searchParams.set("refresh_token", refreshToken);
            redirectUrl.searchParams.set("expires_in", String(expiresIn));
            return res.redirect(redirectUrl.toString());
          })
          .catch(next);
      },
    )(req, res, next);
  });

  app.post("/api/auth/mobile/refresh", authRateLimit, handleMobileRefresh);
  app.post("/api/auth/mobile/logout", authRateLimit, handleMobileLogout);

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
      const secret = requireEmailLoginSecret();

      if (!token) {
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

      const eidLinked = await hasLinkedEid(user.id);
      if (shouldRejectNonEidLogin(user.role, eidLinked)) {
        return res.redirect("/?error=eid_required");
      }

      req.logIn(user, (loginError) => {
        if (loginError) {
          return next(loginError);
        }
        redirectAfterLogin(req, res, user, payload?.returnTo).catch(next);
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
    if (isDevAuthBypassAllowed() && !req.user) {
      return res.json(DEV_USER);
    }
    if (req.user) {
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

  app.get("/api/logout", (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({ message: "Bruk POST for å logge ut" });
  });
}

// req.isAuthenticated() (from passport) is literally `!!req.user` — it has
// no concept of session vs. Bearer-JWT auth. Since resolveBearerUser also
// populates req.user (intentionally, for routes that check req.user
// directly), guards that must stay session-cookie-only cannot use
// req.isAuthenticated() anymore. This checks the raw Passport session-store
// field instead — resolveBearerUser never touches req.session.passport, only
// req.user, so this correctly excludes Bearer-only requests. Matches this
// file's existing ad-hoc session-field-access style (see
// AUTH_RETURN_TO_SESSION_KEY usage above).
export function hasSessionAuth(req: Request): boolean {
  const session = req.session as unknown as Record<string, unknown> | undefined;
  const passportSession = session?.passport as { user?: unknown } | undefined;
  return !!passportSession?.user;
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (isDevAuthBypassAllowed()) return next();
  if (hasSessionAuth(req) && req.user) {
    return next();
  }
  res.status(401).json({ message: "Ikke autentisert" });
};

// Populerer req.user fra en Bearer-JWT hvis til stede — påvirker ALDRI en
// gyldig Passport-sesjon (web), og blokkerer aldri selv: en manglende/ugyldig
// header lar requesten fortsette usatt, og ruten under avgjør 401 selv.
// Montert globalt i setupCustomAuth, rett etter passport.session(), slik at
// ALLE ruter i appen — også de som sjekker req.user direkte uten
// isAuthenticatedOrBearer (f.eks. sakerRapportRoutes.ts sin lokale
// requireAuth) — automatisk fungerer med mobil-token uten videre endring.
export const resolveBearerUser: RequestHandler = async (req, _res, next) => {
  if (req.user) return next();
  const authHeader = req.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return next();
  try {
    const userId = verifyAccessToken(authHeader.slice("Bearer ".length));
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user && !user.email?.toLowerCase().endsWith("@erased.tidum.local")) {
      req.user = {
        id: user.id,
        email: user.email || "",
        name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "",
        profileImageUrl: user.profileImageUrl,
        provider: "mobile",
        role: user.role || "member",
        vendorId: user.vendorId,
      };
    }
  } catch {
    // Ugyldig/utløpt token — req.user forblir usatt, ruten under avgjør 401.
  }
  next();
};

export const isAuthenticatedOrBearer: RequestHandler = (req, res, next) => {
  if (isDevAuthBypassAllowed()) return next();
  if (req.user) return next();
  res.status(401).json({ message: "Ikke autentisert" });
};

function applyFreshVendorActor(req: Request, actor: FreshAdminActor): void {
  req.user = {
    ...(req.user as AuthUser),
    email: actor.email ?? (req.user as AuthUser).email,
    role: actor.role,
    vendorId: actor.vendorId,
  };
  (req as any).vendorId = actor.vendorId;
  (req as any).isSuperAdmin = false;
  (req as any).userId = actor.id;
  (req as any).userRole = actor.role;
  (req as any).freshVendorActor = actor;
}

async function requireFreshVendorActor(
  req: Request,
  res: Response,
  next: NextFunction,
  resolver: (request: Request) => Promise<FreshAdminActor | null>,
  deniedMessage: string,
) {
  if (isDevAuthBypassAllowed()) return next();
  if (!hasSessionAuth(req) || !req.user) {
    return res.status(401).json({ message: "Ikke autentisert" });
  }

  if (isTotpStepUpPending(req)) {
    return res.status(401).json({ message: "TOTP-verifisering påkrevd" });
  }

  try {
    const actor = await resolver(req);
    if (!actor) return res.status(403).json({ message: deniedMessage });
    applyFreshVendorActor(req, actor);
    next();
  } catch (error) {
    console.error("[vendor-admin] authorization lookup failed", error);
    return res.status(503).json({ message: "Kunne ikke kontrollere administratortilgang" });
  }
}

export const requireVendorAuth: RequestHandler = async (req, res, next) => {
  return requireFreshVendorActor(
    req,
    res,
    next,
    resolveFreshVendorCredentialAdmin,
    "Krever hovedadmin eller vendor_admin i virksomheten",
  );
};

export const requireVendorDataAdmin: RequestHandler = async (req, res, next) => {
  return requireFreshVendorActor(
    req,
    res,
    next,
    resolveFreshVendorDataAdmin,
    "Krever lederrolle i virksomheten",
  );
};

export const requireVendorMember: RequestHandler = async (req, res, next) => {
  return requireFreshVendorActor(
    req,
    res,
    next,
    resolveFreshVendorMember,
    "Krever aktiv virksomhetstilknytning",
  );
};

function applyFreshIntegrationAdmin(req: Request, actor: FreshIntegrationAdminActor): void {
  req.user = {
    ...(req.user as AuthUser),
    email: actor.email ?? (req.user as AuthUser).email,
    role: actor.role,
    vendorId: actor.vendorId,
  };
  (req as any).vendorId = actor.vendorId;
  (req as any).isSuperAdmin = actor.integrationAdminScope === "global";
  (req as any).userId = actor.id;
  (req as any).userRole = actor.role;
  (req as any).freshIntegrationAdmin = actor;
}

export const requireIntegrationAdmin: RequestHandler = async (req, res, next) => {
  if (isDevAuthBypassAllowed()) return next();
  if (!hasSessionAuth(req) || !req.user) {
    return res.status(401).json({ message: "Ikke autentisert" });
  }

  try {
    const actor = await resolveFreshIntegrationAdmin(req);
    if (!actor) {
      return res.status(403).json({ message: "Krever global systemadmin eller virksomhetens integrasjonsadmin" });
    }
    applyFreshIntegrationAdmin(req, actor);
    next();
  } catch (error) {
    console.error("[integration-admin] authorization lookup failed", error);
    return res.status(503).json({ message: "Kunne ikke kontrollere integrasjonstilgang" });
  }
};

export const requireSuperAdmin: RequestHandler = async (req, res, next) => {
  if (isDevAuthBypassAllowed()) return next();
  if (!hasSessionAuth(req) || !req.user) {
    return res.status(401).json({ message: "Ikke autentisert" });
  }
  if (isTotpStepUpPending(req)) {
    return res.status(401).json({ message: "TOTP-verifisering påkrevd" });
  }

  try {
    const actor = await resolveFreshGlobalSuperAdmin(req);
    if (!actor) {
      return res.status(403).json({ message: "Krever global super_admin rolle" });
    }
    req.user = {
      ...(req.user as AuthUser),
      email: actor.email ?? (req.user as AuthUser).email,
      role: actor.assignedAdminRole ?? "super_admin",
      vendorId: null,
    };
    next();
  } catch (error) {
    console.error("[global-admin] authorization lookup failed", error);
    return res.status(503).json({ message: "Kunne ikke kontrollere administratortilgang" });
  }
};
