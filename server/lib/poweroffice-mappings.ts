/**
 * server/lib/poweroffice-mappings.ts
 *
 * Per-vendor mapping of Tidum user_id → PowerOffice Go employee_id.
 * Populated by vendor_admin/tiltaksleder before the first push.
 *
 * Lazy DDL so no migration step is required on deploy.
 */

import { pool } from '../db';

export interface PowerOfficeEmployeeMapping {
  vendorId: number;
  tidumUserId: string;
  poEmployeeId: string;
  employeeName: string | null;
  updatedAt: string;
}

let ensured = false;
export async function ensurePowerOfficeMappingsTable(): Promise<void> {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS poweroffice_employee_mappings (
      vendor_id INTEGER NOT NULL,
      tidum_user_id TEXT NOT NULL,
      po_employee_id TEXT NOT NULL,
      employee_name TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (vendor_id, tidum_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_po_empmap_vendor ON poweroffice_employee_mappings(vendor_id);
  `);
  ensured = true;
}

function mapRow(r: any): PowerOfficeEmployeeMapping {
  return {
    vendorId: r.vendor_id,
    tidumUserId: r.tidum_user_id,
    poEmployeeId: r.po_employee_id,
    employeeName: r.employee_name,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export async function listMappings(vendorId: number): Promise<PowerOfficeEmployeeMapping[]> {
  await ensurePowerOfficeMappingsTable();
  const r = await pool.query(
    `SELECT * FROM poweroffice_employee_mappings WHERE vendor_id = $1 ORDER BY employee_name NULLS LAST, tidum_user_id`,
    [vendorId],
  );
  return r.rows.map(mapRow);
}

export async function getMapping(vendorId: number, tidumUserId: string): Promise<PowerOfficeEmployeeMapping | null> {
  await ensurePowerOfficeMappingsTable();
  const r = await pool.query(
    `SELECT * FROM poweroffice_employee_mappings WHERE vendor_id = $1 AND tidum_user_id = $2 LIMIT 1`,
    [vendorId, tidumUserId],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function upsertMapping(args: {
  vendorId: number;
  tidumUserId: string;
  poEmployeeId: string;
  employeeName?: string | null;
}): Promise<PowerOfficeEmployeeMapping> {
  await ensurePowerOfficeMappingsTable();
  const r = await pool.query(
    `INSERT INTO poweroffice_employee_mappings (vendor_id, tidum_user_id, po_employee_id, employee_name, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (vendor_id, tidum_user_id) DO UPDATE
       SET po_employee_id = EXCLUDED.po_employee_id,
           employee_name = EXCLUDED.employee_name,
           updated_at = NOW()
     RETURNING *`,
    [args.vendorId, args.tidumUserId, args.poEmployeeId, args.employeeName ?? null],
  );
  return mapRow(r.rows[0]);
}

export async function deleteMapping(vendorId: number, tidumUserId: string): Promise<boolean> {
  await ensurePowerOfficeMappingsTable();
  const r = await pool.query(
    `DELETE FROM poweroffice_employee_mappings WHERE vendor_id = $1 AND tidum_user_id = $2 RETURNING vendor_id`,
    [vendorId, tidumUserId],
  );
  return r.rows.length > 0;
}
