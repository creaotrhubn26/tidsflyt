/**
 * server/lib/poweroffice-visibility.ts
 *
 * Tidum super_admin toggle: hide the PowerOffice integration from a given
 * vendor (vendor_admin/tiltaksleder won't see the connect card, manual push,
 * mappings, or auto-push on approve).
 *
 * Backed by `vendors.settings.powerOfficeHidden` (boolean). No new table.
 */

import { db } from '../db';
import { vendors } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface VisibilityState {
  hidden: boolean;
  hiddenAt: string | null;
  hiddenBy: string | null;
  reason: string | null;
}

/** Read the hidden flag for a given vendor. Missing vendor → visible (fallback-safe). */
export async function getPowerOfficeVisibility(vendorId: number): Promise<VisibilityState> {
  if (!Number.isFinite(vendorId) || vendorId <= 0) {
    return { hidden: false, hiddenAt: null, hiddenBy: null, reason: null };
  }
  const [row] = await db
    .select({ settings: vendors.settings })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1);
  const settings = (row?.settings ?? {}) as Record<string, any>;
  return {
    hidden: settings.powerOfficeHidden === true,
    hiddenAt: settings.powerOfficeHiddenAt ?? null,
    hiddenBy: settings.powerOfficeHiddenBy ?? null,
    reason: settings.powerOfficeHiddenReason ?? null,
  };
}

export async function setPowerOfficeVisibility(args: {
  vendorId: number;
  hidden: boolean;
  actorEmail?: string | null;
  reason?: string | null;
}): Promise<VisibilityState> {
  const [row] = await db
    .select({ settings: vendors.settings })
    .from(vendors)
    .where(eq(vendors.id, args.vendorId))
    .limit(1);
  if (!row) throw new Error('Vendor ikke funnet');

  const prev = (row.settings ?? {}) as Record<string, any>;
  const next: Record<string, any> = { ...prev };

  if (args.hidden) {
    next.powerOfficeHidden = true;
    next.powerOfficeHiddenAt = new Date().toISOString();
    next.powerOfficeHiddenBy = args.actorEmail ?? null;
    next.powerOfficeHiddenReason = args.reason ?? null;
  } else {
    // Soft-unset — remove the flag entirely so future code treats it as never-set.
    delete next.powerOfficeHidden;
    delete next.powerOfficeHiddenAt;
    delete next.powerOfficeHiddenBy;
    delete next.powerOfficeHiddenReason;
  }

  await db
    .update(vendors)
    .set({ settings: next, updatedAt: new Date() })
    .where(eq(vendors.id, args.vendorId));

  return {
    hidden: !!next.powerOfficeHidden,
    hiddenAt: next.powerOfficeHiddenAt ?? null,
    hiddenBy: next.powerOfficeHiddenBy ?? null,
    reason: next.powerOfficeHiddenReason ?? null,
  };
}
