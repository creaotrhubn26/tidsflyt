/**
 * Shared authentication & authorization middleware.
 * Import these in any route-file that needs auth checks.
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'change-me-in-production';
const isDevMode = process.env.NODE_ENV !== 'production';

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
  if (isDevMode) {
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
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
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
