import type { PoolClient } from "pg";
import { createNotification } from "../routes/notification-routes";
import {
  withDualTenantRlsContext,
  withSystemRlsContext,
  type DualTenantRlsContext,
} from "./database-rls-context";

type QueryClient = Pick<PoolClient, "query">;
type FristTenant = DualTenantRlsContext;
type FristRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  kommune_id: number | null;
  vendor_id: number | null;
  frist_type: string;
  due_at: Date | string;
  varslet_offsets: number[];
  notify_user_id: string | null;
};

// Eskaleringsmatrise: escalationOffsetDays styrer når eieren varsles
// (dager relativt til forfall); lederEskaleringFraOffset er terskelen der
// kommunens barnevernsleder i tillegg varsles (oversittelse).
export const FRIST_TYPE_CONFIG: Record<string, {
  escalationOffsetDays: number[];
  lederEskaleringFraOffset?: number;
}> = {
  avklaring: { escalationOffsetDays: [-2, 0, 1, 3], lederEskaleringFraOffset: 1 },
  // Undersøkelsesfrist (bvl. § 2-2, tre måneder) på den kommunale saken.
  undersokelse: { escalationOffsetDays: [-14, -7, 0, 3], lederEskaleringFraOffset: 0 },
  // Oppgavefrister på barnevernsobjekter (migrasjon 090).
  oppgave: { escalationOffsetDays: [-3, -1, 0, 1, 3], lederEskaleringFraOffset: 1 },
  // Evalueringsfrist på godkjent plan (migrasjon 092).
  evaluering: { escalationOffsetDays: [-14, -7, 0, 3], lederEskaleringFraOffset: 0 },
  // Behandlingsfrist for innsynsbegjæring (migrasjon 094).
  innsyn: { escalationOffsetDays: [-2, 0, 1], lederEskaleringFraOffset: 0 },
};

function requireFristTenant(input: { kommuneId?: number; vendorId?: number }): FristTenant {
  const kommuneId = input.kommuneId;
  const vendorId = input.vendorId;
  const hasKommune = Number.isInteger(kommuneId) && kommuneId! > 0;
  const hasVendor = Number.isInteger(vendorId) && vendorId! > 0;
  if (hasKommune === hasVendor) throw new Error("INVALID_FRIST_TENANT");
  return hasKommune ? { kommuneId: kommuneId! } : { vendorId: vendorId! };
}

function tenantForFristRow(row: Pick<FristRow, "kommune_id" | "vendor_id">): FristTenant {
  return requireFristTenant({
    kommuneId: row.kommune_id ?? undefined,
    vendorId: row.vendor_id ?? undefined,
  });
}

async function withFristTenantClient<T>(
  tenant: FristTenant,
  client: QueryClient | undefined,
  callback: (scopedClient: QueryClient) => Promise<T>,
): Promise<T> {
  return client
    ? callback(client)
    : withDualTenantRlsContext(tenant, callback);
}

export async function registerFrist(params: {
  entityType: string;
  entityId: string;
  kommuneId?: number;
  vendorId?: number;
  fristType: string;
  dueAt: Date;
  notifyUserId?: string;
}, client?: QueryClient): Promise<void> {
  const tenant = requireFristTenant(params);
  await withFristTenantClient(tenant, client, async (scopedClient) => {
    const result = await scopedClient.query(
      `INSERT INTO tidum_frister (entity_type, entity_id, kommune_id, vendor_id, frist_type, due_at, notify_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (entity_type, entity_id, frist_type)
       DO UPDATE SET due_at = EXCLUDED.due_at, notify_user_id = EXCLUDED.notify_user_id,
         status = 'aktiv', varslet_offsets = '{}', updated_at = NOW()
       WHERE tidum_frister.kommune_id IS NOT DISTINCT FROM EXCLUDED.kommune_id
         AND tidum_frister.vendor_id IS NOT DISTINCT FROM EXCLUDED.vendor_id
       RETURNING id`,
      [
        params.entityType,
        params.entityId,
        tenant.kommuneId ?? null,
        tenant.vendorId ?? null,
        params.fristType,
        params.dueAt,
        params.notifyUserId ?? null,
      ],
    );
    if (result.rowCount !== 1) throw new Error("FRIST_TENANT_CONFLICT");
  });
}

export async function cancelFrist(
  entityType: string,
  entityId: string,
  fristType: string,
  tenantInput: FristTenant,
  client?: QueryClient,
): Promise<void> {
  const tenant = requireFristTenant(tenantInput);
  await withFristTenantClient(tenant, client, (scopedClient) => scopedClient.query(
    `UPDATE tidum_frister SET status = 'kansellert', updated_at = NOW()
     WHERE entity_type = $1 AND entity_id = $2 AND frist_type = $3 AND status = 'aktiv'
       AND kommune_id IS NOT DISTINCT FROM $4::integer
       AND vendor_id IS NOT DISTINCT FROM $5::integer`,
    [entityType, entityId, fristType, tenant.kommuneId ?? null, tenant.vendorId ?? null],
  ).then(() => undefined));
}

// entityIds er test-only (samme mønster som runTaskEscalations): uten
// filter scanner kjøringen ALLE aktive frister — det er riktig for den
// daglige cronen, men gjør tester som kaller den mot en delt database
// flaky (de claimer/varsler andre testers rader). Tester sender sine egne
// entity-id-er for å scope kjøringen til rader de eier og rydder.
export async function runFristEscalations(
  now: Date = new Date(),
  entityIds?: string[],
): Promise<{ notified: number; expired: number }> {
  const rows = await withSystemRlsContext("frist_escalation_scan", async (client) => {
    const result = await client.query<FristRow>(
      `SELECT id, entity_type, entity_id, kommune_id, vendor_id, frist_type,
              due_at, varslet_offsets, notify_user_id
         FROM tidum_frister
        WHERE status = 'aktiv'
          ${entityIds ? "AND entity_id = ANY($1)" : ""}`,
      entityIds ? [entityIds] : [],
    );
    return result.rows;
  });

  let notified = 0;
  let expired = 0;

  for (const row of rows) {
    // Feilisolasjon per rad (samme mønster som task-escalation-cron.ts): ett kast
    // skal ikke stanse behandlingen av resten av fristene i kjøringen.
    try {
      const config = FRIST_TYPE_CONFIG[row.frist_type];
      if (!config) continue;
      if (!row.notify_user_id) continue;

      const daysDiff = Math.floor((now.getTime() - new Date(row.due_at).getTime()) / 86400000);
      const alreadySent: number[] = row.varslet_offsets || [];
      const dueOffsets = config.escalationOffsetDays.filter(
        (offset) => offset <= daysDiff && !alreadySent.includes(offset),
      );
      if (dueOffsets.length === 0) continue;

      // Claim FØR varsling, ikke etter: to samtidige kjøringer (manuell trigger
      // som race'r 08:00-cronen, eller flere serverinstanser) kan begge lese
      // samme rad før noen skriver tilbake. Den betingede WHERE gjør claimet
      // atomisk mot databasen — kun kjøringen som faktisk oppdaterer raden
      // fortsetter til å varsle. `&&` sjekker array-overlapp.
      const tenant = tenantForFristRow(row);
      const claimResult = await withDualTenantRlsContext(tenant, (client) => client.query(
        `UPDATE tidum_frister SET varslet_offsets = varslet_offsets || $1::integer[], updated_at = NOW()
         WHERE id = $2 AND NOT (varslet_offsets && $1::integer[])
         RETURNING id`,
        [dueOffsets, row.id],
      ));
      if (claimResult.rows.length === 0) continue; // en annen samtidig kjøring claimet allerede disse offsetene

      for (const offset of dueOffsets) {
        await createNotification({
          userId: row.notify_user_id,
          type: "frist_eskalering",
          title: `Frist nærmer seg eller er oversittet (${row.frist_type})`,
          message: `Frist for ${row.entity_type} ${row.entity_id} har passert offset ${offset} dager fra forfall.`,
          metadata: { entityType: row.entity_type, entityId: row.entity_id, fristType: row.frist_type, offset },
        });
        notified += 1;

        // Eskaleringsmatrise: oversittelse forbi terskelen varsler i tillegg
        // kommunens barnevernsleder (aldri dobbelt til samme person).
        if (
          config.lederEskaleringFraOffset != null
          && offset >= config.lederEskaleringFraOffset
          && row.kommune_id != null
        ) {
          const lederResult = await withDualTenantRlsContext(tenant, (client) => client.query(
            `SELECT id FROM users WHERE kommune_id = $1 AND role = 'barnevernsleder' ORDER BY id LIMIT 1`,
            [row.kommune_id],
          ));
          const lederId: string | undefined = lederResult.rows[0]?.id;
          if (lederId && lederId !== row.notify_user_id) {
            await createNotification({
              userId: lederId,
              type: "frist_eskalering_leder",
              title: `Eskalert: oversittet frist (${row.frist_type})`,
              message: `Frist for ${row.entity_type} ${row.entity_id} er oversittet (${offset} dager). Eier er varslet.`,
              metadata: { entityType: row.entity_type, entityId: row.entity_id, fristType: row.frist_type, offset, eskalertFra: row.notify_user_id },
            });
            notified += 1;
          }
        }
      }

      if (daysDiff > 0) expired += 1;
    } catch (rowErr) {
      // ponytail: claimet står igjen som sendt selv om varselet feilet — offset
      // må da rulles tilbake manuelt. Aksepteres framfor å risikere dobbeltvarsling.
      console.error(`[frist-engine] Feil ved behandling av frist ${row.id}:`, rowErr);
      continue;
    }
  }

  return { notified, expired };
}
