import { pool } from "../db";
import { createNotification } from "../routes/notification-routes";

export const FRIST_TYPE_CONFIG: Record<string, { escalationOffsetDays: number[] }> = {
  avklaring: { escalationOffsetDays: [-2, 0, 1, 3] },
};

export async function registerFrist(params: {
  entityType: string;
  entityId: string;
  kommuneId?: number;
  vendorId?: string; // vendors.id er varchar/UUID i live DB (avvik fra shared/schema.ts:474 sin serial()-erklæring — se Task 1-ruling i ledger), IKKE number
  fristType: string;
  dueAt: Date;
  notifyUserId?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO tidum_frister (entity_type, entity_id, kommune_id, vendor_id, frist_type, due_at, notify_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (entity_type, entity_id, frist_type)
     DO UPDATE SET due_at = EXCLUDED.due_at, notify_user_id = EXCLUDED.notify_user_id,
       status = 'aktiv', varslet_offsets = '{}', updated_at = NOW()`,
    [
      params.entityType,
      params.entityId,
      params.kommuneId ?? null,
      params.vendorId ?? null,
      params.fristType,
      params.dueAt,
      params.notifyUserId ?? null,
    ],
  );
}

export async function cancelFrist(entityType: string, entityId: string, fristType: string): Promise<void> {
  await pool.query(
    `UPDATE tidum_frister SET status = 'kansellert', updated_at = NOW()
     WHERE entity_type = $1 AND entity_id = $2 AND frist_type = $3 AND status = 'aktiv'`,
    [entityType, entityId, fristType],
  );
}

export async function runFristEscalations(now: Date = new Date()): Promise<{ notified: number; expired: number }> {
  const { rows } = await pool.query(
    `SELECT id, entity_type, entity_id, frist_type, due_at, varslet_offsets, notify_user_id
     FROM tidum_frister WHERE status = 'aktiv'`,
  );

  let notified = 0;
  let expired = 0;

  for (const row of rows) {
    const config = FRIST_TYPE_CONFIG[row.frist_type];
    if (!config) continue;
    if (!row.notify_user_id) continue;

    const daysDiff = Math.floor((now.getTime() - new Date(row.due_at).getTime()) / 86400000);
    const alreadySent: number[] = row.varslet_offsets || [];
    const dueOffsets = config.escalationOffsetDays.filter(
      (offset) => offset <= daysDiff && !alreadySent.includes(offset),
    );
    if (dueOffsets.length === 0) continue;

    for (const offset of dueOffsets) {
      await createNotification({
        userId: row.notify_user_id,
        type: "frist_eskalering",
        title: `Frist nærmer seg eller er oversittet (${row.frist_type})`,
        message: `Frist for ${row.entity_type} ${row.entity_id} har passert offset ${offset} dager fra forfall.`,
        metadata: { entityType: row.entity_type, entityId: row.entity_id, fristType: row.frist_type, offset },
      });
      notified += 1;
    }

    await pool.query(
      `UPDATE tidum_frister SET varslet_offsets = varslet_offsets || $1::integer[], updated_at = NOW() WHERE id = $2`,
      [dueOffsets, row.id],
    );
    if (daysDiff > 0) expired += 1;
  }

  return { notified, expired };
}
