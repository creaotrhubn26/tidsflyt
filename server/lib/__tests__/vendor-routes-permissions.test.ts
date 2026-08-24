import { describe, it, expect, vi, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { db, pool } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

// Samme fallback-kjede som JWT_SECRET i server/smartTimingRoutes.ts:41 —
// konstanten selv er modul-privat og ikke eksportert, så testen regner den
// ut identisk fra samme miljøvariabler i stedet for å importere den.
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

function signAdminToken(payload: { id: string; email: string; role: string; roleId?: string }) {
  return jwt.sign(payload, JWT_SECRET);
}

describe("vendor routes use hasPermission()", () => {
  // vi.resetModules() below forces a fresh import of server/db.ts (see
  // comment in the tests), which eagerly opens its own pg Pool (up to 20
  // connections) at module load. Now that this file has 2 tests each doing
  // their own reset+import, a single dynamicDbPool variable would only ever
  // close the LAST test's pool and leak the others — collect every pool
  // opened and close them all here (same fix pattern as fase 1's Task 5).
  const dynamicDbPools: { end: () => Promise<void> }[] = [];
  afterAll(async () => {
    await Promise.all(dynamicDbPools.map((p) => p.end()));
  });

  it("rejects vendor admin creation without vendor.admin.create permission", async () => {
    // smartTimingRoutes.ts's isDevMode (`NODE_ENV !== 'production'`) is a
    // module-load-time constant, and Vitest's default NODE_ENV is "test" —
    // which trips the dev-mode bypass in authenticateAdmin and signs every
    // request in as the real super_admin (who legitimately has
    // vendor.admin.create), ignoring our crafted JWT entirely. Force
    // NODE_ENV to "production" and re-import the module fresh so this test
    // actually exercises the JWT + hasPermission() path — the only path
    // this permission check matters on in real deployments.
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    // Same reset module graph, so this resolves to the identical fresh
    // db.ts instance (and Pool) that smartTimingRoutes.ts imported
    // internally — grabbed here so afterAll can close it.
    const { pool: dynamicDbPool } = await import("../../db");
    dynamicDbPools.push(dynamicDbPool);
    process.env.NODE_ENV = prevNodeEnv;

    const [role] = await db
      .insert(roles)
      .values({ name: "test_role_no_vendor_perm", scope: "global" })
      .returning();

    try {
      const app = express();
      app.use(express.json());
      registerSmartTimingRoutes(app);

      // role: 'super_admin' deliberately — the legacy string check
      // (`req.admin.role !== 'super_admin'`) trusts this field blindly and
      // would ALLOW the request. roleId points to a role that genuinely has
      // no permissions granted, so hasPermission() correctly denies. A
      // payload with a non-super_admin role string wouldn't discriminate:
      // both the old and new checks deny it, so it can't prove the route
      // was actually migrated (verified by running this test against the
      // unmigrated route — see task-4-report.md).
      const token = signAdminToken({ id: "test-user-1", email: "t@example.com", role: "super_admin", roleId: role.id });
      const res = await request(app)
        .post("/api/vendors/1/admins")
        .set("Authorization", `Bearer ${token}`)
        .send({ username: "test", email: "test@example.com" });

      expect(res.status).toBe(403);
    } finally {
      // Runs even if the assertion above throws, so a real regression or a
      // flaky run never leaves a stray role row behind in the real DB.
      await db.delete(roles).where(eq(roles.id, role.id));
    }
  });

  it("POST /api/vendors/:id/admins succeeds for a brand-new email — public.users needs username/password too", async () => {
    // Regression test: this route's users-table insert used to omit
    // username/password, two hidden NOT NULL columns (no default) on the
    // shared public.users table (owned by an unrelated product — see
    // .claude/skills/rolle-tilgangssystem/references/fallgruver.md). Only
    // the ON CONFLICT UPDATE path (an email that already had a users row)
    // ever worked; a genuinely new email's INSERT failed with 23502.
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const { pool: dynamicDbPool } = await import("../../db");
    dynamicDbPools.push(dynamicDbPool);
    process.env.NODE_ENV = prevNodeEnv;

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const email = `test-vendor-admin-${suffix}@example.com`;
    // Deliberately not a real row in `vendors` — that table turns out to be
    // shaped entirely differently from shared/schema.ts's own description
    // of it in the real database (uuid `id`, required `user_id`, clearly
    // another product's table sharing the name — found while writing this
    // test, out of scope here). Safe to skip: this route only reads
    // `vendors` inside the `sendInvite`-gated invite-email block (we pass
    // `sendInvite: false`), and tidum_admin_users/users/tidum_company_users.vendor_id
    // are plain integer columns with no FK to vendors.id (which is a uuid
    // in the real table — a FK between those types couldn't exist), so an
    // arbitrary integer vendor_id exercises the exact same insert path.
    const vendorId = 900000000 + Math.floor(Math.random() * 99999999);
    const [vendorAdminRole] = await db.select().from(roles).where(eq(roles.name, "vendor_admin")).limit(1);
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);

    try {
      const app = express();
      app.use(express.json());
      registerSmartTimingRoutes(app);

      const token = signAdminToken({ id: "test-super-admin", email: "sa@example.com", role: "super_admin", roleId: superAdminRole.id });
      const res = await request(app)
        .post(`/api/vendors/${vendorId}/admins`)
        .set("Authorization", `Bearer ${token}`)
        .send({ username: `test_vendor_admin_${suffix}`, email, sendInvite: false });

      expect(res.status).toBe(201);

      const {
        rows: [userRow],
      } = await pool.query(`SELECT role, role_id FROM users WHERE email = $1`, [email]);
      expect(userRow).toBeDefined();
      expect(userRow.role).toBe("vendor_admin");
      expect(userRow.role_id).toBe(vendorAdminRole.id);
    } finally {
      await pool.query(`DELETE FROM tidum_company_users WHERE user_email = $1`, [email]);
      await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
      await pool.query(`DELETE FROM tidum_admin_users WHERE email = $1`, [email]);
    }
  });

  it("POST /api/vendors/:id/admins rejects account takeover of an email already belonging to another vendor", async () => {
    // BOLA regression: a vendor_admin with vendor.admin.create permission
    // for their own vendor could previously invite ANY email address —
    // including one that already had a `users` row scoped to a different
    // vendor_id — and the route's ON CONFLICT (email) DO UPDATE would
    // silently reassign that existing account to the attacker's vendor_id.
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const { pool: dynamicDbPool } = await import("../../db");
    dynamicDbPools.push(dynamicDbPool);
    process.env.NODE_ENV = prevNodeEnv;

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const email = `test-takeover-${suffix}@example.com`;
    const victimVendorId = 900000000 + Math.floor(Math.random() * 99999999);
    const attackerVendorId = victimVendorId + 1;
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);

    // Pre-existing users row scoped to the victim's vendor.
    await pool.query(
      `INSERT INTO users (username, password, email, role, vendor_id)
       VALUES ($1, 'unused-admin-users-pairing', $2, 'vendor_admin', $3)`,
      [`victim_${suffix}`, email, victimVendorId],
    );

    try {
      const app = express();
      app.use(express.json());
      registerSmartTimingRoutes(app);

      const token = signAdminToken({ id: "test-super-admin-2", email: "sa2@example.com", role: "super_admin", roleId: superAdminRole.id });
      const res = await request(app)
        .post(`/api/vendors/${attackerVendorId}/admins`)
        .set("Authorization", `Bearer ${token}`)
        .send({ username: `attacker_${suffix}`, email, sendInvite: false });

      expect(res.status).toBe(409);

      const {
        rows: [userRow],
      } = await pool.query(`SELECT vendor_id FROM users WHERE email = $1`, [email]);
      expect(userRow.vendor_id).toBe(victimVendorId);
    } finally {
      await pool.query(`DELETE FROM tidum_company_users WHERE user_email = $1`, [email]);
      await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
      await pool.query(`DELETE FROM tidum_admin_users WHERE email = $1`, [email]);
    }
  });

  it("POST /api/vendors/:id/admins rejects takeover of an email that only exists in tidum_company_users (bulk-imported employee, no users row yet)", async () => {
    // Follow-up BOLA regression: the takeover guard above only checked the
    // `users` table. Bulk-imported employees (server/routes/employee-import-routes.ts)
    // are written straight into tidum_company_users and never get a `users`
    // row (syncCompanyUserToPortalAccess is never called there) — so a
    // freshly-imported employee of vendor A had NO `users` row yet, and the
    // single-table guard let a different vendor "invite" that same email,
    // creating a fresh `users` row that bound the victim's email to the
    // attacker's vendor_id with an attacker-chosen password.
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const { pool: dynamicDbPool } = await import("../../db");
    dynamicDbPools.push(dynamicDbPool);
    process.env.NODE_ENV = prevNodeEnv;

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const email = `test-bulk-takeover-${suffix}@example.com`;
    const victimVendorId = 910000000 + Math.floor(Math.random() * 99999999);
    const attackerVendorId = victimVendorId + 1;

    // Bulk-imported employee: a tidum_company_users row, but deliberately NO
    // `users` row for this email.
    await pool.query(
      `INSERT INTO tidum_company_users (vendor_id, company_id, user_email, role, approved)
       VALUES ($1, $1, $2, 'miljoarbeider', true)`,
      [victimVendorId, email],
    );

    try {
      const app = express();
      app.use(express.json());
      registerSmartTimingRoutes(app);

      // vendor_admin for the ATTACKING vendor — `req.admin.vendorId === vendorId`
      // alone satisfies this route's `allowed` check, no roleId/hasPermission needed.
      const token = signAdminToken({ id: "test-bulk-attacker", email: "attacker-bulk@example.com", role: "vendor_admin", vendorId: attackerVendorId } as any);
      const res = await request(app)
        .post(`/api/vendors/${attackerVendorId}/admins`)
        .set("Authorization", `Bearer ${token}`)
        .send({ username: `attacker_bulk_${suffix}`, email, sendInvite: false });

      expect(res.status).toBe(409);

      const { rows: userRows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
      expect(userRows.length).toBe(0);
      const { rows: adminRows } = await pool.query(`SELECT id FROM tidum_admin_users WHERE LOWER(email) = LOWER($1)`, [email]);
      expect(adminRows.length).toBe(0);
    } finally {
      await pool.query(`DELETE FROM tidum_company_users WHERE user_email = $1`, [email]);
      await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
      await pool.query(`DELETE FROM tidum_admin_users WHERE LOWER(email) = LOWER($1)`, [email]);
    }
  });
});
