/**
 * server/routes/travel-legs-routes.ts
 *
 * REST for travel_legs (kjøregodt-segmenter) brukt fra stemplings-flyten.
 *
 *   GET    /api/travel-legs             — list (filter: date, from, to, sakId, logRowId)
 *   POST   /api/travel-legs             — create; auto-beregner km hvis coords gitt
 *   GET    /api/travel-legs/:id         — single
 *   PATCH  /api/travel-legs/:id         — update
 *   DELETE /api/travel-legs/:id         — delete
 *   POST   /api/travel-legs/calculate   — preview (km, total) uten å lagre
 *   GET    /api/travel-legs/rate        — gjeldende sats + passasjertillegg
 */

import type { Express, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createTravelLeg, listTravelLegs, getTravelLeg, updateTravelLeg, deleteTravelLeg,
  computeLegTotal, DEFAULT_RATE_PER_KM, DEFAULT_PASSENGER_RATE_PER_KM,
} from '../lib/travel-legs';
import { calculateDistance } from '../lib/distance-provider';

function authedUserId(req: Request): string | null {
  const u = (req as any).authUser ?? (req as any).user;
  return u?.id ? String(u.id) : null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function registerTravelLegsRoutes(app: Express) {
  app.get('/api/travel-legs/rate', (_req: Request, res: Response) => {
    res.json({
      ratePerKm: DEFAULT_RATE_PER_KM,
      passengerRatePerKm: DEFAULT_PASSENGER_RATE_PER_KM,
    });
  });

  app.post('/api/travel-legs/calculate', requireAuth, async (req: Request, res: Response) => {
    try {
      const { fromLat, fromLng, toLat, toLng, kilometers, ratePerKm, passengerCount, passengerRatePerKm } = req.body ?? {};
      let km = num(kilometers);
      let source: string = 'manual';

      if (km == null) {
        const fLat = num(fromLat); const fLng = num(fromLng);
        const tLat = num(toLat); const tLng = num(toLng);
        if (fLat == null || fLng == null || tLat == null || tLng == null) {
          return res.status(400).json({ error: 'Trenger enten `kilometers` eller alle fire koordinatene' });
        }
        const result = await calculateDistance({ lat: fLat, lng: fLng }, { lat: tLat, lng: tLng });
        km = result.km;
        source = result.source;
      }

      const rate = num(ratePerKm) ?? DEFAULT_RATE_PER_KM;
      const passengers = num(passengerCount) ?? 0;
      const passengerRate = num(passengerRatePerKm) ?? DEFAULT_PASSENGER_RATE_PER_KM;
      const total = computeLegTotal(km, rate, passengers, passengerRate);
      res.json({ kilometers: km, ratePerKm: rate, passengerCount: passengers, passengerRatePerKm: passengerRate, totalAmount: total, source });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/travel-legs', requireAuth, async (req: Request, res: Response) => {
    try {
      const authId = authedUserId(req);
      const filters = {
        userId: (req.query.userId as string) || authId || undefined,
        date: req.query.date as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        logRowId: req.query.logRowId as string | undefined,
        sakId: req.query.sakId as string | undefined,
      };
      const legs = await listTravelLegs(filters);
      res.json(legs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/travel-legs/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const leg = await getTravelLeg(req.params.id);
      if (!leg) return res.status(404).json({ error: 'Ikke funnet' });
      res.json(leg);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/travel-legs', requireAuth, async (req: Request, res: Response) => {
    try {
      const authId = authedUserId(req);
      const b = req.body ?? {};
      if (!b.fromName || !b.toName || !b.date) {
        return res.status(400).json({ error: 'fromName, toName og date er påkrevd' });
      }

      // Auto-calc km if not supplied but both coords are present
      let kilometers = num(b.kilometers);
      let calculatedBy: 'haversine' | 'vegvesen' | 'osrm' | 'manual' | null = b.calculatedBy ?? null;
      if (kilometers == null) {
        const fLat = num(b.fromLat); const fLng = num(b.fromLng);
        const tLat = num(b.toLat); const tLng = num(b.toLng);
        if (fLat != null && fLng != null && tLat != null && tLng != null) {
          const r = await calculateDistance({ lat: fLat, lng: fLng }, { lat: tLat, lng: tLng });
          kilometers = r.km;
          calculatedBy = r.source === 'manual' ? null : r.source;
        } else {
          return res.status(400).json({ error: 'Angi `kilometers` eller både fra- og til-koordinater' });
        }
      } else if (!calculatedBy) {
        calculatedBy = 'manual';
      }

      const userId = (b.userId as string) || authId;
      if (!userId) return res.status(401).json({ error: 'Ikke autentisert' });

      const leg = await createTravelLeg({
        userId,
        logRowId: b.logRowId ?? null,
        sakId: b.sakId ?? null,
        date: b.date,
        legOrder: num(b.legOrder) ?? 0,
        fromName: b.fromName,
        toName: b.toName,
        fromLat: num(b.fromLat),
        fromLng: num(b.fromLng),
        toLat: num(b.toLat),
        toLng: num(b.toLng),
        kilometers,
        ratePerKm: num(b.ratePerKm) ?? undefined,
        passengerCount: num(b.passengerCount) ?? 0,
        passengerRatePerKm: num(b.passengerRatePerKm) ?? undefined,
        source: b.source ?? 'manual',
        calculatedBy,
        notes: b.notes ?? null,
      });
      res.status(201).json(leg);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/travel-legs/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const b = req.body ?? {};
      const patch: any = {};
      for (const k of ['fromName', 'toName', 'notes', 'source']) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
      for (const k of ['kilometers', 'ratePerKm', 'passengerCount', 'passengerRatePerKm', 'legOrder', 'fromLat', 'fromLng', 'toLat', 'toLng']) {
        if (b[k] !== undefined) {
          const n = num(b[k]);
          if (n != null) patch[k] = n;
        }
      }
      const leg = await updateTravelLeg(req.params.id, patch);
      if (!leg) return res.status(404).json({ error: 'Ikke funnet' });
      res.json(leg);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/travel-legs/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await deleteTravelLeg(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Ikke funnet' });
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
