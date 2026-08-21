/**
 * server/routes/activity-log-cron.ts
 *
 * Retention cron for the admin activity log (`tidum_admin_activity_log`):
 * purges rows older than 90 days.
 *
 * Cron: daily 02:30 — same low-traffic window as the GDPR job (02:00),
 * offset 30 minutes so the two don't hit the database at the same time.
 */

import cron from 'node-cron';
import { pool } from '../db';

// ── Retention cron ───────────────────────────────────────────────────────────

let cronStarted = false;
export function setupActivityLogCron() {
  if (cronStarted) return;
  cron.schedule('30 2 * * *', async () => {
    console.log('🗑️  Running admin activity log retention purge…');
    try {
      const purged = await purgeOldActivityLogEntries();
      console.log(`[activity-log] purged ${purged} row(s) older than 90 days`);
    } catch (e: any) {
      console.error('[activity-log] retention purge failed:', e);
    }
  });
  cronStarted = true;
  console.log('✅ Admin activity log retention cron scheduled (daily 02:30)');
}

/** Exported separately from the cron schedule for direct testing. */
export async function purgeOldActivityLogEntries(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM tidum_admin_activity_log WHERE created_at < NOW() - INTERVAL '90 days'`,
  );
  return result.rowCount ?? 0;
}
