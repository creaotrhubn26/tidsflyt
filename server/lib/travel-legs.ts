/**
 * server/lib/travel-legs.ts
 *
 * Mileage-reimbursement (kjøregodtgjørelse) model for miljøarbeider-stamping.
 *
 * Conceptually: each workday may have one or more travel legs — typically
 *   start → saks-sted → (detour stop) → ... → home. The tiltaksleder sets the
 *   primary sak location via `saker.ekstra_felter.defaultLocation`; workers
 *   extend the chain with ad-hoc stops during the day.
 *
 * Distance may be pre-computed via a pluggable provider (Haversine today;
 *   Statens vegvesen / Google Directions later) or entered manually.
 *
 * 2026 Norway reference rates (tax-free):
 *   kjøregodtgjørelse: 3.50 kr/km
 *   passasjertillegg:  1.00 kr/km per passasjer
 */

import { pool } from '../db';

/** Norwegian 2026 skattefri sats — overridable via env. */
export const DEFAULT_RATE_PER_KM = Number(process.env.MILEAGE_RATE_PER_KM ?? 3.5);
export const DEFAULT_PASSENGER_RATE_PER_KM = Number(process.env.MILEAGE_PASSENGER_RATE_PER_KM ?? 1.0);

let ensured = false;
export async function ensureTravelLegsTable(): Promise<void> {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS travel_legs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      log_row_id UUID REFERENCES log_row(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      sak_id UUID,
      date DATE NOT NULL,
      leg_order INTEGER NOT NULL DEFAULT 0,
      from_name TEXT NOT NULL,
      to_name TEXT NOT NULL,
      from_lat NUMERIC(10, 7),
      from_lng NUMERIC(10, 7),
      to_lat NUMERIC(10, 7),
      to_lng NUMERIC(10, 7),
      kilometers NUMERIC(8, 2) NOT NULL,
      rate_per_km NUMERIC(6, 2) NOT NULL,
      passenger_count INTEGER NOT NULL DEFAULT 0,
      passenger_rate_per_km NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
      total_amount NUMERIC(10, 2) NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      calculated_by TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_travel_legs_user_date ON travel_legs(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_travel_legs_log_row ON travel_legs(log_row_id);
    CREATE INDEX IF NOT EXISTS idx_travel_legs_sak ON travel_legs(sak_id);
  `);
  ensured = true;
}

export interface TravelLegInput {
  userId: string;
  logRowId?: string | null;
  sakId?: string | null;
  date: string;
  legOrder?: number;
  fromName: string;
  toName: string;
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
  kilometers: number;
  ratePerKm?: number;
  passengerCount?: number;
  passengerRatePerKm?: number;
  source?: 'primary' | 'stop' | 'manual';
  calculatedBy?: 'haversine' | 'vegvesen' | 'osrm' | 'ors' | 'manual' | null;
  notes?: string | null;
}

export interface TravelLeg {
  id: string;
  logRowId: string | null;
  userId: string;
  sakId: string | null;
  date: string;
  legOrder: number;
  fromName: string;
  toName: string;
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  kilometers: number;
  ratePerKm: number;
  passengerCount: number;
  passengerRatePerKm: number;
  totalAmount: number;
  source: 'primary' | 'stop' | 'manual';
  calculatedBy: 'haversine' | 'vegvesen' | 'osrm' | 'ors' | 'manual' | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Total kr for a single leg (kjøregodt + passasjertillegg). */
export function computeLegTotal(
  kilometers: number,
  ratePerKm: number,
  passengerCount: number,
  passengerRatePerKm: number,
): number {
  const base = kilometers * ratePerKm;
  const passenger = kilometers * passengerCount * passengerRatePerKm;
  return Math.round((base + passenger) * 100) / 100;
}

function mapRow(r: any): TravelLeg {
  return {
    id: r.id,
    logRowId: r.log_row_id,
    userId: r.user_id,
    sakId: r.sak_id,
    date: typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10),
    legOrder: r.leg_order,
    fromName: r.from_name,
    toName: r.to_name,
    fromLat: r.from_lat != null ? Number(r.from_lat) : null,
    fromLng: r.from_lng != null ? Number(r.from_lng) : null,
    toLat: r.to_lat != null ? Number(r.to_lat) : null,
    toLng: r.to_lng != null ? Number(r.to_lng) : null,
    kilometers: Number(r.kilometers),
    ratePerKm: Number(r.rate_per_km),
    passengerCount: r.passenger_count,
    passengerRatePerKm: Number(r.passenger_rate_per_km),
    totalAmount: Number(r.total_amount),
    source: r.source,
    calculatedBy: r.calculated_by,
    notes: r.notes,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export async function createTravelLeg(input: TravelLegInput): Promise<TravelLeg> {
  await ensureTravelLegsTable();
  const ratePerKm = input.ratePerKm ?? DEFAULT_RATE_PER_KM;
  const passengerCount = input.passengerCount ?? 0;
  const passengerRatePerKm = input.passengerRatePerKm ?? DEFAULT_PASSENGER_RATE_PER_KM;
  const totalAmount = computeLegTotal(input.kilometers, ratePerKm, passengerCount, passengerRatePerKm);

  const result = await pool.query(
    `INSERT INTO travel_legs
       (log_row_id, user_id, sak_id, date, leg_order,
        from_name, to_name, from_lat, from_lng, to_lat, to_lng,
        kilometers, rate_per_km, passenger_count, passenger_rate_per_km,
        total_amount, source, calculated_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      input.logRowId ?? null,
      input.userId,
      input.sakId ?? null,
      input.date,
      input.legOrder ?? 0,
      input.fromName,
      input.toName,
      input.fromLat ?? null,
      input.fromLng ?? null,
      input.toLat ?? null,
      input.toLng ?? null,
      input.kilometers,
      ratePerKm,
      passengerCount,
      passengerRatePerKm,
      totalAmount,
      input.source ?? 'manual',
      input.calculatedBy ?? null,
      input.notes ?? null,
    ],
  );
  return mapRow(result.rows[0]);
}

export async function listTravelLegs(filters: {
  userId?: string;
  date?: string;
  from?: string;
  to?: string;
  logRowId?: string;
  sakId?: string;
}): Promise<TravelLeg[]> {
  await ensureTravelLegsTable();
  const where: string[] = [];
  const params: any[] = [];
  if (filters.userId) { params.push(filters.userId); where.push(`user_id = $${params.length}`); }
  if (filters.date) { params.push(filters.date); where.push(`date = $${params.length}`); }
  if (filters.from) { params.push(filters.from); where.push(`date >= $${params.length}`); }
  if (filters.to) { params.push(filters.to); where.push(`date <= $${params.length}`); }
  if (filters.logRowId) { params.push(filters.logRowId); where.push(`log_row_id = $${params.length}`); }
  if (filters.sakId) { params.push(filters.sakId); where.push(`sak_id = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT * FROM travel_legs ${clause} ORDER BY date DESC, leg_order ASC, created_at ASC`,
    params,
  );
  return result.rows.map(mapRow);
}

export async function getTravelLeg(id: string): Promise<TravelLeg | null> {
  await ensureTravelLegsTable();
  const r = await pool.query('SELECT * FROM travel_legs WHERE id = $1 LIMIT 1', [id]);
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function updateTravelLeg(id: string, patch: Partial<TravelLegInput>): Promise<TravelLeg | null> {
  await ensureTravelLegsTable();
  const existing = await getTravelLeg(id);
  if (!existing) return null;

  const next = {
    kilometers: patch.kilometers ?? existing.kilometers,
    ratePerKm: patch.ratePerKm ?? existing.ratePerKm,
    passengerCount: patch.passengerCount ?? existing.passengerCount,
    passengerRatePerKm: patch.passengerRatePerKm ?? existing.passengerRatePerKm,
  };
  const totalAmount = computeLegTotal(next.kilometers, next.ratePerKm, next.passengerCount, next.passengerRatePerKm);

  const r = await pool.query(
    `UPDATE travel_legs SET
        from_name = COALESCE($1, from_name),
        to_name = COALESCE($2, to_name),
        from_lat = $3,
        from_lng = $4,
        to_lat = $5,
        to_lng = $6,
        kilometers = $7,
        rate_per_km = $8,
        passenger_count = $9,
        passenger_rate_per_km = $10,
        total_amount = $11,
        source = COALESCE($12, source),
        calculated_by = $13,
        notes = $14,
        leg_order = COALESCE($15, leg_order),
        updated_at = NOW()
      WHERE id = $16
      RETURNING *`,
    [
      patch.fromName ?? null,
      patch.toName ?? null,
      patch.fromLat ?? existing.fromLat,
      patch.fromLng ?? existing.fromLng,
      patch.toLat ?? existing.toLat,
      patch.toLng ?? existing.toLng,
      next.kilometers,
      next.ratePerKm,
      next.passengerCount,
      next.passengerRatePerKm,
      totalAmount,
      patch.source ?? null,
      patch.calculatedBy ?? existing.calculatedBy,
      patch.notes ?? existing.notes,
      patch.legOrder ?? null,
      id,
    ],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function deleteTravelLeg(id: string): Promise<boolean> {
  await ensureTravelLegsTable();
  const r = await pool.query('DELETE FROM travel_legs WHERE id = $1 RETURNING id', [id]);
  return r.rows.length > 0;
}
