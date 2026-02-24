import type { Express } from "express";
import { pool } from "../db";
import { isAuthenticated } from "../custom-auth";

/**
 * Notification helper — create a notification for a user
 * Uses the existing notifications table schema:
 *   id (varchar, uuid), recipient_type, recipient_id, type, title, body, payload,
 *   related_entity_type, related_entity_id, actor_type, actor_id, actor_name, read_at, sent_via, created_at
 */
export async function createNotification(opts: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}): Promise<void> {
  try {
    const payload = JSON.stringify({ ...(opts.metadata || {}), link: opts.link || null });
    await pool.query(
      `INSERT INTO notifications (id, recipient_type, recipient_id, type, title, body, payload, actor_id, created_at)
       VALUES (gen_random_uuid(), 'user', $1, $2, $3, $4, $5, $6, NOW())`,
      [
        opts.userId,
        opts.type,
        opts.title,
        opts.message,
        payload,
        opts.createdBy || null,
      ]
    );
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}

/**
 * Notify all users with a given role in a vendor
 */
export async function notifyByRole(
  role: string,
  vendorId: number | null,
  opts: Omit<Parameters<typeof createNotification>[0], "userId">
): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT id FROM users WHERE role = $1 ${vendorId ? "AND vendor_id = $2" : ""}`,
      vendorId ? [role, vendorId] : [role]
    );
    for (const row of result.rows) {
      await createNotification({ ...opts, userId: row.id });
    }
  } catch (err) {
    console.error("Failed to notify by role:", err);
  }
}

export function registerNotificationRoutes(app: Express) {
  // Get notifications for current user (unread first, then recent)
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Ikke autentisert" });

      const limit = parseInt(req.query.limit as string) || 50;
      const unreadOnly = req.query.unread === "true";

      const whereClause = unreadOnly
        ? "WHERE recipient_id = $1 AND read_at IS NULL"
        : "WHERE recipient_id = $1";

      const result = await pool.query(
        `SELECT id, recipient_id as user_id, type, title, body as message, payload, 
                read_at, actor_id as created_by, created_at,
                CASE WHEN read_at IS NULL THEN false ELSE true END as is_read
         FROM notifications ${whereClause}
         ORDER BY CASE WHEN read_at IS NULL THEN 0 ELSE 1 END, created_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      // Parse payload to extract link and metadata
      const notifications = result.rows.map((row: any) => {
        let parsed: any = {};
        try { parsed = JSON.parse(row.payload || '{}'); } catch (_) {}
        return {
          ...row,
          link: parsed.link || null,
          metadata: parsed,
        };
      });

      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get unread count
  app.get("/api/notifications/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Ikke autentisert" });

      const result = await pool.query(
        "SELECT COUNT(*) as count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL",
        [userId]
      );

      res.json({ count: parseInt(result.rows[0].count) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Ikke autentisert" });

      const result = await pool.query(
        "UPDATE notifications SET read_at = NOW() WHERE id = $1 AND recipient_id = $2 RETURNING *",
        [req.params.id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Varsel ikke funnet" });
      }

      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/mark-all-read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Ikke autentisert" });

      await pool.query(
        "UPDATE notifications SET read_at = NOW() WHERE recipient_id = $1 AND read_at IS NULL",
        [userId]
      );

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a notification
  app.delete("/api/notifications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Ikke autentisert" });

      await pool.query(
        "DELETE FROM notifications WHERE id = $1 AND recipient_id = $2",
        [req.params.id, userId]
      );

      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
