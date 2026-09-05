/**
 * server/routes/turnus-reminder-cron.ts
 *
 * Shift reminders: notify each employee a configurable lead time before their
 * shift starts (per-org settings in tidum_turnus_varsel_innstillinger). A cron
 * scans published shifts whose start is within the lead window and not yet
 * reminded, claims them (sets paaminnet_at inside the tx — at-most-once, so a
 * crash never double-reminds), then sends notifications outside the tx.
 *
 * ponytail: shift wall-clock is interpreted in Europe/Oslo (kommunal drift);
 * make it a per-org tz column if multi-tz orgs ever matter.
 */
import type { Express, Request, Response } from 'express';
import cron from 'node-cron';
import { pool } from '../db';
import { withSystemRlsContext, withTurnusOrgRlsContext } from '../lib/database-rls-context';
import { requireTurnusActor } from './turnus-actor';
import { createNotification } from './notification-routes';
import { emailService } from '../lib/email-service';
import { getSmsGateway, normaliserTelefon } from '../lib/sms/sms-gateway';

const OSLO = 'Europe/Oslo';

interface DueVakt {
  id: number; org_id: number; ansatt_navn: string | null; user_email: string | null;
  telefon: string | null; kode: string; start_tid: string; dato: string;
  epost: boolean; app: boolean; sms: boolean;
}

/** Claim due shifts (mark paaminnet_at) and return them for out-of-tx sending.
 *  `naaLocal` overrides the Oslo wall-clock "now" (test hook). */
export async function claimDueReminders(naaLocal?: string): Promise<DueVakt[]> {
  return withSystemRlsContext('turnus_paaminnelse', async (client) => {
    const { rows } = await client.query(
      `WITH naa AS (SELECT COALESCE($1::timestamp, (now() AT TIME ZONE '${OSLO}')) AS t)
       UPDATE tidum_turnus_kalendervakter kv
          SET paaminnet_at = now()
         FROM tidum_turnus_vaktkoder vk, tidum_turnus_varsel_innstillinger s,
              tidum_turnus_ansatte a, naa
        WHERE kv.vaktkode_id = vk.id AND vk.org_id = kv.org_id
          AND s.org_id = kv.org_id AND s.aktiv
          AND a.id = kv.ansatt_id AND a.org_id = kv.org_id
          AND kv.status = 'publisert' AND kv.paaminnet_at IS NULL
          AND (kv.dato + vk.start_tid) >= naa.t
          AND (kv.dato + vk.start_tid) <= naa.t + make_interval(mins => s.paaminnelse_min)
        RETURNING kv.id, kv.org_id, kv.dato::text AS dato, vk.kode,
                  vk.start_tid::text AS start_tid, a.navn AS ansatt_navn,
                  a.user_email, a.telefon, s.epost, s.app, s.sms`,
      [naaLocal ?? null]);
    return rows as DueVakt[];
  });
}

async function sendReminder(v: DueVakt): Promise<boolean> {
  const tid = (v.start_tid ?? '').slice(0, 5);
  const tekst = `Påminnelse: vakt ${v.kode} starter kl. ${tid} (${v.dato}).`;
  let ok = false;
  if (v.app && v.user_email) {
    const { rows: [u] } = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [v.user_email]);
    if (u) { await createNotification({ userId: String(u.id), type: 'turnus_paaminnelse', title: 'Vakt-påminnelse', message: tekst, link: '/turnus' }); ok = true; }
  }
  if (v.epost && v.user_email) {
    try { await emailService.sendEmail({ purpose: 'administrative', to: v.user_email, subject: 'Vakt-påminnelse', html: `<p>Hei ${v.ansatt_navn ?? ''},</p><p>${tekst}</p><p>Hilsen Tidum Turnus</p>`, throwOnError: true }); ok = true; } catch { /* counted via ok */ }
  }
  if (v.sms && v.telefon) {
    const gw = getSmsGateway(); const t = normaliserTelefon(v.telefon);
    if (gw && t) { try { await gw.send({ telefon: t, melding: tekst + ' – Tidum Turnus' }); ok = true; } catch { /* counted */ } }
  }
  return ok;
}

export async function runTurnusReminders(naaLocal?: string): Promise<{ sendt: number; kandidater: number }> {
  const due = await claimDueReminders(naaLocal);
  const utfall = await Promise.allSettled(due.map(sendReminder));
  const sendt = utfall.filter((u) => u.status === 'fulfilled' && u.value === true).length;
  return { sendt, kandidater: due.length };
}

let cronStarted = false;
export function setupTurnusReminderCron(): void {
  if (cronStarted) return;
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { sendt, kandidater } = await runTurnusReminders();
      if (kandidater > 0) console.log(`⏰ Turnus-påminnelser: ${sendt}/${kandidater} sendt`);
    } catch (err) { console.error('[turnus-reminder] cron feilet', err); }
  });
  cronStarted = true;
  console.log('✅ Turnus-påminnelse-cron aktiv (hvert 5. minutt)');
}

export function registerTurnusReminderRoutes(app: Express): void {
  app.get('/api/turnus/varsel-innstillinger', async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: 'Ikke tilgang.' });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
        const { rows: [s] } = await client.query(
          `SELECT paaminnelse_min, epost, app, sms, aktiv FROM tidum_turnus_varsel_innstillinger WHERE org_id = $1`,
          [actor.orgId]);
        return s ?? { paaminnelse_min: 60, epost: false, app: true, sms: false, aktiv: true };
      });
      res.json(row);
    } catch (err) { console.error('[turnus-reminder] hent innstillinger feilet', err); res.status(500).json({ error: 'Serverfeil.' }); }
  });

  app.put('/api/turnus/varsel-innstillinger', async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: 'Ikke tilgang.' });
    const b = req.body ?? {};
    const min = Number(b.paaminnelseMin);
    if (!Number.isInteger(min) || min < 0 || min > 10080) return res.status(400).json({ error: 'paaminnelseMin må være 0–10080 min.' });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
        const { rows: [s] } = await client.query(
          `INSERT INTO tidum_turnus_varsel_innstillinger (org_id, paaminnelse_min, epost, app, sms, aktiv)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (org_id) DO UPDATE SET paaminnelse_min = EXCLUDED.paaminnelse_min,
             epost = EXCLUDED.epost, app = EXCLUDED.app, sms = EXCLUDED.sms, aktiv = EXCLUDED.aktiv
           RETURNING paaminnelse_min, epost, app, sms, aktiv`,
          [actor.orgId, min, !!b.epost, b.app !== false, !!b.sms, b.aktiv !== false]);
        return s;
      });
      res.json(row);
    } catch (err) { console.error('[turnus-reminder] lagre innstillinger feilet', err); res.status(500).json({ error: 'Serverfeil.' }); }
  });
}
