/**
 * Shared authentication & authorization middleware.
 * Import these in any route-file that needs auth checks.
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Egen hemmelighet for Bearer-token-verifisering i denne filen, ikke delt
// med magic-link (custom-auth.ts) eller mobil-JWT (lib/mobile-auth.ts).
export function requireAuthJwtSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET er ikke konfigurert");
  }
  return secret;
}

export function isDevAuthBypassAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_AUTH_BYPASS === "true";
}

/** Roles considered "admin-level" (can approve, manage users, etc.) */
export const ADMIN_ROLES = ['tiltaksleder', 'teamleder', 'hovedadmin', 'admin', 'super_admin'];

// ─── helpers ────────────────────────────────────────────────────────────

/** Normalise whitespace / dashes in role names so comparison is reliable. */
function normalizeRoleName(role: string): string {
  return (role || '').toLowerCase().replace(/[\s-]/g, '_');
}

/**
 * Attach authenticated user info to `(req as any).authUser`.
 * Returns true if the request is authenticated, false otherwise.
 */
function authenticate(req: Request): boolean {
  if (isDevAuthBypassAllowed()) {
    (req as any).authUser = { id: '1', email: 'dev@tidum.no', role: 'super_admin' };
    return true;
  }

  // Session-based (Google OAuth / passport)
  if (req.isAuthenticated?.() && req.user) {
    const u = req.user as any;
    (req as any).authUser = { id: u.id, email: u.email, role: u.role };
    return true;
  }

  // JWT Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], requireAuthJwtSecret()) as any;
      (req as any).authUser = decoded;
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

// ─── middleware exports ─────────────────────────────────────────────────

/** Require *any* authenticated user (session or JWT). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (authenticate(req)) return next();
  return res.status(401).json({ error: 'Authentication required' });
}

/** Require an admin-level role (tiltaksleder, teamleder, admin, …). */
export function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  if (!authenticate(req)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const role = normalizeRoleName((req as any).authUser?.role);
  if (!ADMIN_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Kun tiltaksleder eller admin kan utføre denne handlingen' });
  }
  next();
}
