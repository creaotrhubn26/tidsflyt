import passport from "passport";
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { adminUsers, users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { canAccessVendorApiAdmin, isSuperAdminLikeRole } from "@shared/roles";
import { getGoogleCallbackUrl } from "./lib/app-base-url";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
  provider: string;
  role: string;
  vendorId: number | null;
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
    conString: process.env.DATABASE_URL,
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
  const normalizedEmail = email.trim().toLowerCase();

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
  const firstName = profile.name?.givenName || profile.displayName || email.split("@")[0] || "";
  const lastName = profile.name?.familyName || "";
  const profileImageUrl = profile.photos?.[0]?.value || null;

  if (existingUser) {
    let resolvedUser = existingUser;

    if (
      matchingAdmin &&
      adminIsActive &&
      (existingUser.role !== adminRole ||
        (existingUser.vendorId ?? null) !== adminVendorId ||
        !existingUser.firstName ||
        !existingUser.profileImageUrl)
    ) {
      const [updatedUser] = await db
        .update(users)
        .set({
          firstName: existingUser.firstName || firstName,
          lastName: existingUser.lastName || lastName,
          profileImageUrl: existingUser.profileImageUrl || profileImageUrl,
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

    const fullName =
      [resolvedUser.firstName, resolvedUser.lastName].filter(Boolean).join(" ") ||
      profile.displayName ||
      "";
    return {
      id: resolvedUser.id.toString(),
      email: resolvedUser.email || email,
      name: fullName,
      profileImageUrl: resolvedUser.profileImageUrl || profileImageUrl,
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
        firstName,
        lastName,
        profileImageUrl,
        role: adminRole,
        vendorId: adminVendorId,
      })
      .returning();

    if (createdUser) {
      return {
        id: createdUser.id.toString(),
        email: createdUser.email || email,
        name: [createdUser.firstName, createdUser.lastName].filter(Boolean).join(" ") || profile.displayName || "",
        profileImageUrl: createdUser.profileImageUrl || profileImageUrl,
        provider,
        role: createdUser.role || adminRole,
        vendorId: createdUser.vendorId,
      };
    }
  }

  return null;
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
          return res.redirect("/dashboard");
        });
      })(req, res, next);
    }
  );

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
