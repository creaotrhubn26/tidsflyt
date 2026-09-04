/**
 * server/routes/turnus-generering-routes.ts
 *
 * Generation + XAI + override consequence-preview for Tidum Turnus (A1c).
 *
 *  POST /api/turnus/planer/:id/generer   → build SolverRequest from the plan's
 *        org-scoped data, run the CP-SAT sidecar, persist a generering run +
 *        deviations, write the generated kalendervakter, return the run.
 *  GET  /api/turnus/genereringer/:id     → run status + objective + deviations
 *        (the structured XAI "why / what could not be fulfilled").
 *  POST /api/turnus/konsekvens           → evaluate a proposed edited shift set
 *        against AML (no DB write) so the UI can preview override consequences.
 *
 * Every DB access is inside withTurnusOrgRlsContext(actor.orgId, ...); all
 * inserts bind actor.orgId; the plan :id is org-validated before use.
 */

import type { Express, Request, Response } from 'express';
import { withTurnusOrgRlsContext } from '../lib/database-rls-context';
import { requireTurnusActor } from './turnus-actor';
import { runSolver } from '../lib/turnus-solver-client';
import { evaluateTurnusAml } from '../lib/turnus-aml';
import { byggForklaring, narrer } from '../lib/turnus-xai';
import { CONTRACT_VERSION } from '@shared/turnus-solver-contract';
import type {
  SolverRequest, DekningsKrav, TurnusShift,
} from '@shared/turnus-solver-contract';

type Q = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };

/** Expand a bemanningsbehov row into concrete dated coverage requirements. */
function expandBehov(
  behov: any,
  startDato: string,
  rotasjonUker: number,
): DekningsKrav[] {
  const base = {
    avdelingId: behov.avdeling_id,
    vaktkodeId: behov.vaktkode_id,
    antallKrevd: behov.antall_krevd,
    kompetanseKravId: behov.kompetanse_krav_id ?? null,
  };
  if (behov.dato) return [{ ...base, dato: String(behov.dato).slice(0, 10) }];
  if (behov.ukedag == null) return [];
  const out: DekningsKrav[] = [];
  const start = new Date(startDato + 'T00:00:00');
  for (let i = 0; i < rotasjonUker * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isoDow = d.getDay() || 7; // Sun=0 → 7
    if (isoDow === behov.ukedag) {
      out.push({ ...base, dato: d.toISOString().slice(0, 10) });
    }
  }
  return out;
}

export function registerTurnusGenereringRoutes(app: Express): void {
  app.post('/api/turnus/planer/:id/generer', async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: 'Ikke tilgang.' });
    const planId = Number(req.params.id);
    if (!Number.isInteger(planId) || planId <= 0) {
      return res.status(400).json({ error: 'Ugyldig plan-id.' });
    }
    try {
      const result = await withTurnusOrgRlsContext(actor.orgId, async (client: Q) => {
        const { rows: [plan] } = await client.query(
          `SELECT id, avdeling_id, rotasjon_uker, start_dato::text AS start_dato
             FROM tidum_turnus_planer WHERE id = $1 AND org_id = $2`,
          [planId, actor.orgId],
        );
        if (!plan) return { notFound: true as const };

        const [{ rows: ansatte }, { rows: vaktkoder }, { rows: behov }, { rows: onsker }, { rows: [prof] }] =
          await Promise.all([
            client.query(
              `SELECT a.id, a.stillingsprosent, a.primar_avdeling_id,
                      COALESCE(array_agg(ak.kompetanse_id) FILTER (WHERE ak.kompetanse_id IS NOT NULL), '{}') AS kompetanser
                 FROM tidum_turnus_ansatte a
                 LEFT JOIN tidum_turnus_ansatt_kompetanser ak ON ak.ansatt_id = a.id AND ak.org_id = $1
                WHERE a.org_id = $1 GROUP BY a.id`,
              [actor.orgId],
            ),
            client.query(
              `SELECT id, kode, start_tid::text AS start_tid, slutt_tid::text AS slutt_tid,
                      varighet_timer, teller_som_arbeid
                 FROM tidum_turnus_vaktkoder WHERE org_id = $1`,
              [actor.orgId],
            ),
            client.query(
              `SELECT avdeling_id, ukedag, dato::text AS dato, vaktkode_id, antall_krevd, kompetanse_krav_id
                 FROM tidum_turnus_bemanningsbehov WHERE org_id = $1 AND avdeling_id = $2`,
              [actor.orgId, plan.avdeling_id],
            ),
            client.query(
              `SELECT ansatt_id, dato::text AS dato, ukedag, vaktkode_id, type, prioritet
                 FROM tidum_turnus_onsker WHERE org_id = $1 AND (plan_id = $2 OR plan_id IS NULL)`,
              [actor.orgId, planId],
            ),
            client.query(
              `SELECT * FROM tidum_turnus_prioriteringsprofil
                WHERE org_id = $1 AND (plan_id = $2 OR plan_id IS NULL)
                ORDER BY created_at DESC LIMIT 1`,
              [actor.orgId, planId],
            ),
          ]);

        const dekningskrav = behov.flatMap((b) =>
          expandBehov(b, plan.start_dato, plan.rotasjon_uker || 6));

        const solverReq: SolverRequest = {
          contractVersion: CONTRACT_VERSION,
          planId,
          orgId: actor.orgId,
          rotasjonUker: plan.rotasjon_uker || 6,
          startDato: plan.start_dato,
          ansatte: ansatte.map((a) => ({
            ansattId: a.id,
            stillingsprosent: Number(a.stillingsprosent ?? 100),
            kompetanser: (a.kompetanser as number[]) ?? [],
            primarAvdelingId: a.primar_avdeling_id ?? null,
          })),
          vaktkoder: vaktkoder.map((v) => ({
            vaktkodeId: v.id,
            startTid: (v.start_tid ?? '08:00').slice(0, 5),
            sluttTid: (v.slutt_tid ?? '16:00').slice(0, 5),
            varighetTimer: v.varighet_timer != null ? Number(v.varighet_timer) : null,
            tellerSomArbeid: v.teller_som_arbeid !== false,
          })),
          dekningskrav,
          onsker: onsker
            .filter((o) => o.dato)
            .map((o) => ({
              ansattId: o.ansatt_id,
              dato: String(o.dato).slice(0, 10),
              vaktkodeId: o.vaktkode_id ?? null,
              type: o.type,
              prioritet: o.prioritet ?? 'bor',
            })),
          vekter: {
            vektOnsker: prof?.vekt_onsker ?? 5,
            vektHelgefrekvens: prof?.vekt_helgefrekvens ?? 5,
            vektRettferdighet: prof?.vekt_rettferdighet ?? 5,
            vektKontinuitet: prof?.vekt_kontinuitet ?? 5,
            vektKostnad: prof?.vekt_kostnad ?? 5,
          },
          laasteVakter: [],
        };

        // Record the run as 'kjorer' first so a crash leaves a trace.
        const { rows: [gen] } = await client.query(
          `INSERT INTO tidum_turnus_genereringer (org_id, plan_id, status, utlost_av)
           VALUES ($1, $2, 'kjorer', $3) RETURNING id`,
          [actor.orgId, planId, actor.userId],
        );
        const generId = gen.id;

        const resp = await runSolver(solverReq);

        const statusMap: Record<string, string> = {
          optimal: 'fullfort', feasible: 'fullfort', infeasible: 'infeasible', error: 'feilet',
        };
        const dbStatus = statusMap[resp.status] ?? 'feilet';

        await client.query(
          `UPDATE tidum_turnus_genereringer
              SET status = $1, solver_versjon = $2, solve_tid_ms = $3,
                  objektiv_json = $4, fullfort = NOW()
            WHERE id = $5 AND org_id = $6`,
          [dbStatus, resp.solverVersjon, resp.solveTidMs,
           JSON.stringify(resp.objektiv ?? {}), generId, actor.orgId],
        );

        // Deviations: unmet soft goals (+ infeasibility conflicts) → XAI rows.
        const avvik = [
          ...resp.uoppfylte.map((u) => ({ type: u.type, alvor: 'advarsel', ref: u.referanse, f: u.forklaring })),
          ...(resp.konfliktsett ?? []).map((c) => ({ type: 'infeasible_constraint', alvor: 'feil', ref: c.referanse, f: c.forklaring })),
        ];
        for (const av of avvik) {
          await client.query(
            `INSERT INTO tidum_turnus_genereringsavvik (org_id, generering_id, type, alvor, referanse, forklaring)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [actor.orgId, generId, av.type, av.alvor, av.ref, av.f],
          );
        }

        // On success, write the generated shifts as proposed kalendervakter.
        let skrevet = 0;
        if (dbStatus === 'fullfort') {
          for (const v of resp.vakter) {
            await client.query(
              `INSERT INTO tidum_turnus_kalendervakter
                 (org_id, avdeling_id, dato, vaktkode_id, ansatt_id, kilde, generering_id, status)
               VALUES ($1, $2, $3, $4, $5, 'rotasjon', $6, 'foreslaatt')`,
              [actor.orgId, plan.avdeling_id, v.dato, v.vaktkodeId, v.ansattId, generId],
            );
            skrevet++;
          }
        }

        return {
          generId, status: dbStatus, solverStatus: resp.status,
          vakterSkrevet: skrevet, avvik: avvik.length,
          solveTidMs: resp.solveTidMs, feilmelding: resp.feilmelding ?? null,
        };
      });

      if ((result as any)?.notFound) return res.status(404).json({ error: 'Plan ikke funnet.' });
      res.json(result);
    } catch (err) {
      console.error('[turnus-generering] generer feilet', err);
      res.status(500).json({ error: 'Serverfeil.' });
    }
  });

  app.get('/api/turnus/genereringer/:id', async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: 'Ikke tilgang.' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ugyldig id.' });
    try {
      const data = await withTurnusOrgRlsContext(actor.orgId, async (client: Q) => {
        const { rows: [gen] } = await client.query(
          `SELECT * FROM tidum_turnus_genereringer WHERE id = $1 AND org_id = $2`,
          [id, actor.orgId],
        );
        if (!gen) return null;
        const { rows: avvik } = await client.query(
          `SELECT type, alvor, referanse, forklaring FROM tidum_turnus_genereringsavvik
            WHERE generering_id = $1 AND org_id = $2 ORDER BY id`,
          [id, actor.orgId],
        );
        return { generering: gen, avvik };
      });
      if (!data) return res.status(404).json({ error: 'Generering ikke funnet.' });
      res.json(data);
    } catch (err) {
      console.error('[turnus-generering] hent feilet', err);
      res.status(500).json({ error: 'Serverfeil.' });
    }
  });

  // XAI: structured (deterministic) + optional OpenAI narration of a run.
  app.get('/api/turnus/genereringer/:id/forklaring', async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: 'Ikke tilgang.' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ugyldig id.' });
    try {
      const loaded = await withTurnusOrgRlsContext(actor.orgId, async (client: Q) => {
        const { rows: [gen] } = await client.query(
          `SELECT status::text AS status, objektiv_json, solve_tid_ms
             FROM tidum_turnus_genereringer WHERE id = $1 AND org_id = $2`,
          [id, actor.orgId],
        );
        if (!gen) return null;
        const { rows: avvik } = await client.query(
          `SELECT type, alvor, referanse, forklaring FROM tidum_turnus_genereringsavvik
            WHERE generering_id = $1 AND org_id = $2 ORDER BY id`,
          [id, actor.orgId],
        );
        return { gen, avvik };
      });
      if (!loaded) return res.status(404).json({ error: 'Generering ikke funnet.' });
      const strukturert = byggForklaring({
        status: loaded.gen.status,
        objektivJson: loaded.gen.objektiv_json ?? {},
        solveTidMs: loaded.gen.solve_tid_ms ?? null,
        avvik: loaded.avvik,
      });
      const narrasjon = await narrer(strukturert);
      res.json({ strukturert, narrasjon });
    } catch (err) {
      console.error('[turnus-generering] forklaring feilet', err);
      res.status(500).json({ error: 'Serverfeil.' });
    }
  });

  // Generated shifts of a run, joined with shift-code times + employee name, so
  // the override grid can render them and rebuild TurnusShift[] for konsekvens.
  app.get('/api/turnus/genereringer/:id/vakter', async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: 'Ikke tilgang.' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ugyldig id.' });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client: Q) => {
        const { rows: [gen] } = await client.query(
          `SELECT id FROM tidum_turnus_genereringer WHERE id = $1 AND org_id = $2`,
          [id, actor.orgId],
        );
        if (!gen) return null;
        const { rows } = await client.query(
          `SELECT kv.id, kv.ansatt_id, a.navn AS ansatt_navn, kv.dato::text AS dato,
                  kv.vaktkode_id, vk.kode, vk.start_tid::text AS start_tid, vk.slutt_tid::text AS slutt_tid
             FROM tidum_turnus_kalendervakter kv
             JOIN tidum_turnus_vaktkoder vk ON vk.id = kv.vaktkode_id AND vk.org_id = $2
             LEFT JOIN tidum_turnus_ansatte a ON a.id = kv.ansatt_id AND a.org_id = $2
            WHERE kv.generering_id = $1 AND kv.org_id = $2
            ORDER BY kv.dato, kv.ansatt_id`,
          [id, actor.orgId],
        );
        return rows.map((r) => ({
          id: r.id, ansattId: r.ansatt_id, ansattNavn: r.ansatt_navn,
          dato: r.dato, vaktkodeId: r.vaktkode_id, kode: r.kode,
          startTid: (r.start_tid ?? '08:00').slice(0, 5),
          sluttTid: (r.slutt_tid ?? '16:00').slice(0, 5),
        }));
      });
      if (rows == null) return res.status(404).json({ error: 'Generering ikke funnet.' });
      res.json(rows);
    } catch (err) {
      console.error('[turnus-generering] vakter feilet', err);
      res.status(500).json({ error: 'Serverfeil.' });
    }
  });

  // Override consequence-preview: no DB write, pure AML evaluation of a proposed
  // edited shift set (typically one employee's shifts after a manual change).
  app.post('/api/turnus/konsekvens', async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: 'Ikke tilgang.' });
    const endringer = req.body?.endringer;
    if (!Array.isArray(endringer)) {
      return res.status(400).json({ error: 'endringer (TurnusShift[]) kreves.' });
    }
    // Validate each element's shape before the (synchronous) evaluator touches it,
    // so a malformed item can never throw and leave the request hanging.
    const gyldig = endringer.every((e) =>
      e && typeof e === 'object'
      && Number.isFinite(Number((e as any).ansattId))
      && typeof (e as any).dato === 'string'
      && typeof (e as any).startTid === 'string'
      && typeof (e as any).sluttTid === 'string');
    if (!gyldig) {
      return res.status(400).json({ error: 'Hver endring krever ansattId, dato, startTid, sluttTid.' });
    }
    try {
      const brudd = evaluateTurnusAml(endringer as TurnusShift[]);
      res.json({ brudd, harHardeBrudd: brudd.some((b) => b.severity === 'error') });
    } catch (err) {
      console.error('[turnus-generering] konsekvens feilet', err);
      res.status(500).json({ error: 'Serverfeil.' });
    }
  });
}
