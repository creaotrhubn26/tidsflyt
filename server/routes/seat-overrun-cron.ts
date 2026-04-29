/**
 * server/routes/seat-overrun-cron.ts
 *
 * Daglig sikkerhetsnett for seat-overrun. Sweep alle aktive vendors og
 * kjør tier-bump + Stripe-prorering + e-post-flyt for de som har
 * passert max_users uten at det ble fanget av import-flyten (T13–T15).
 *
 * Kjører 03:00 norsk tid hver natt for å unngå å overlappe med
 * arbeidsdagens travle perioder. Stripe-flyten respekterer fortsatt
 * TIDUM_STRIPE_AUTOBUMP-flagget — er det av, blir bare DB + e-post
 * trigget og Daniel må manuelt fullføre i Stripe-dashbordet.
 *
 * Idempotent: hvis vendor allerede er på riktig tier, returnerer
 * processVendorSeatOverrun bare {bumped: false, reason: 'no_overrun'}
 * uten å sende e-post eller logge.
 */

import type { Express, Request, Response } from 'express';
import cron from 'node-cron';
import { sweepAllVendorsForSeatOverrun } from '../lib/seat-overrun';
import { requireAuth } from '../middleware/auth';

let cronStarted = false;

export function setupSeatOverrunCron(): void {
  if (cronStarted) return;
  // Daglig 03:00 lokaltid (Render kjører UTC, så 03:00 norsk = 02:00 UTC vinter / 01:00 UTC sommer.
  // Vi setter '0 1 * * *' for å treffe ca 02–03 norsk uavhengig av sommertid — er ikke kritisk
  // at det er nøyaktig 03:00 så lenge det ikke kolliderer med business hours).
  cron.schedule('0 1 * * *', async () => {
    console.log('⏰ Running seat-overrun sweep…');
    try {
      const res = await sweepAllVendorsForSeatOverrun();
      console.log(`Seat-overrun sweep ferdig: ${res.bumped}/${res.total} vendors bumped, ${res.errors} feil`);
    } catch (err) {
      console.error('Seat-overrun sweep feilet:', err);
    }
  });
  cronStarted = true;
  console.log('✅ Seat-overrun cron scheduled (daily 01:00 UTC ≈ 02–03 norsk)');
}

export function registerSeatOverrunRoutes(app: Express): void {
  // Manuell trigger (kun super_admin) — nyttig for testing og ad-hoc-sweep
  app.post('/api/admin/seat-overrun/sweep', requireAuth, async (req: Request, res: Response) => {
    const role = String(((req as any).authUser ?? (req as any).user)?.role || '')
      .toLowerCase().replace(/[\s-]/g, '_');
    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Kun super_admin' });
    }
    try {
      const result = await sweepAllVendorsForSeatOverrun();
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error('[seat-overrun] manual sweep feilet:', err);
      return res.status(500).json({ error: err?.message || 'Sweep feilet' });
    }
  });
}
