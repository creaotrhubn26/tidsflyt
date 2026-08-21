import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { purgeOldActivityLogEntries } from "../../routes/activity-log-cron";

describe("admin activity log retention purge", () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM tidum_admin_activity_log WHERE user_id = 'test-activity-cron'`);
  });

  it("deletes rows older than 90 days, keeps newer ones", async () => {
    await pool.query(
      `INSERT INTO tidum_admin_activity_log (user_id, event_type, path, created_at)
       VALUES ('test-activity-cron', 'page_view', '/admin/old', NOW() - INTERVAL '91 days')`,
    );
    await pool.query(
      `INSERT INTO tidum_admin_activity_log (user_id, event_type, path, created_at)
       VALUES ('test-activity-cron', 'page_view', '/admin/new', NOW() - INTERVAL '1 day')`,
    );

    const purgedCount = await purgeOldActivityLogEntries();
    expect(purgedCount).toBeGreaterThanOrEqual(1);

    const { rows } = await pool.query(
      `SELECT path FROM tidum_admin_activity_log WHERE user_id = 'test-activity-cron'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].path).toBe("/admin/new");
  });
});
