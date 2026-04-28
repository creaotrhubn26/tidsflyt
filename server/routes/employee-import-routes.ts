/**
 * server/routes/employee-import-routes.ts
 *
 * Ansatt-import for onboarding (Planday/Visma/Quinyx/CSV → Tidum).
 *
 *   POST   /api/imports/employees                  — upload + parse + stage
 *   GET    /api/imports/:id                        — preview-data (rader + summary)
 *   PATCH  /api/imports/:id/rows/:rowId            — endre rolle-tildeling per rad
 *   POST   /api/imports/:id/confirm                — transaksjonell commit til company_users
 *   DELETE /api/imports/:id                        — rollback innen 7 dager
 *
 * Tilgang: hovedadmin, vendor_admin, super_admin (ikke tiltaksleder/teamleder —
 * bulk-bruker-opprettelse skal være snevert tilgjengelig).
 *
 * Stabilitet:
 *  - Multer i minnet (ingen midlertidig fil) — hash filinnhold før vi rører DB
 *  - Cap 10 MB / 10 000 rader
 *  - Per-rad feilhåndtering, én dårlig rad sprenger ikke importen
 *  - Idempotent på (vendor_id, lower(user_email)) takket være migration 043
 *  - Rollback-vindu: 7 dager fra confirmed_at
 */

import type { Express, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { imports, importRows, companyUsers, vendors } from '@shared/schema';
import { requireAuth } from '../middleware/auth';
import { getParser } from '../lib/import-parsers';
import type { ImportSource, ParsedRow } from '../lib/import-parsers/types';
import { emailService } from '../lib/email-service';
import { TIDUM_SUPPORT_EMAIL } from '@shared/brand';
import { applyTierBump, type TierBumpResult } from '../lib/tier-bump';
import { oreToKr } from '../lib/pricing-service';
import { bumpStripeSubscriptionToNewTier, isStripeAutobumpEnabled, type StripeBumpResult } from '../lib/stripe-service';
import { accessRequests } from '@shared/schema';

const MAX_FILE_BYTES = 10 * 1024 * 1024;     // 10 MB
const MAX_ROWS = 10_000;
const ROLLBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 dager

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
});

const ALLOWED_SOURCES: ImportSource[] = ['planday', 'visma', 'quinyx', 'csv'];
const ROLE_DROPDOWN_ALLOWED = new Set(['miljoarbeider', 'tiltaksleder', 'teamleder', 'case_manager', 'vendor_admin']);
const ADMIN_ROLES = new Set(['hovedadmin', 'vendor_admin', 'super_admin']);

function currentUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}
function userVendorId(req: Request): number | null {
  const u = currentUser(req);
  const v = u?.vendorId ?? u?.vendor_id;
  return v ? Number(v) : null;
}
function userEmail(req: Request): string | null {
  return currentUser(req)?.email ?? null;
}
function normalizeRole(role: string): string {
  return role.toLowerCase().replace(/[\s-]/g, '_');
}
function isAdmin(req: Request): boolean {
  const role = normalizeRole(String(currentUser(req)?.role || ''));
  return ADMIN_ROLES.has(role);
}
function isSuperAdmin(req: Request): boolean {
  return normalizeRole(String(currentUser(req)?.role || '')) === 'super_admin';
}

/** Heuristic: foreslå tiltaksleder hvis Job title matcher leder/manager/koordinator. */
function suggestRoleFromJobTitle(jobTitle: string | null): string {
  if (!jobTitle) return 'miljoarbeider';
  if (/leder|manager|supervisor|koordinator|coordinator|sjef/i.test(jobTitle)) {
    return 'tiltaksleder';
  }
  return 'miljoarbeider';
}

function summarizeRows(rows: ParsedRow[]): {
  total: number;
  valid: number;
  errors: number;
} {
  let valid = 0;
  let errors = 0;
  for (const r of rows) {
    if (r.errors.length === 0) valid++;
    else errors++;
  }
  return { total: rows.length, valid, errors };
}

interface SeatWarning {
  current_users: number;
  will_have: number;
  max_users: number;
  overrun_by: number;
}

/**
 * Sammenligner kommende brukerantall (current + valid_rows som ikke er
 * duplikater) mot vendor.max_users. Hvis overrun, returnerer vi info som
 * UI kan vise i preview og confirm-modal. Tier-oppgraderingen selv
 * (auto-bump + Stripe-prorering) ligger i T14 — her bare advarer vi.
 */
async function computeSeatWarning(
  vendorId: number,
  validNewRows: number,
): Promise<SeatWarning | null> {
  const [v] = await db.select({ maxUsers: vendors.maxUsers }).from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!v || v.maxUsers == null) return null;

  const [cnt] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companyUsers)
    .where(eq(companyUsers.vendorId, vendorId));
  const currentUsers = Number(cnt?.count ?? 0);
  const willHave = currentUsers + validNewRows;
  if (willHave <= v.maxUsers) return null;

  return {
    current_users: currentUsers,
    will_have: willHave,
    max_users: v.maxUsers,
    overrun_by: willHave - v.maxUsers,
  };
}

export function registerEmployeeImportRoutes(app: Express) {
  /**
   * POST /api/imports/employees
   * multipart/form-data: file=<csv|xlsx>, source=<planday|visma|quinyx|csv>
   * Parser fil, stager rader, returnerer { import_id, summary }.
   */
  app.post(
    '/api/imports/employees',
    requireAuth,
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        if (!isAdmin(req)) {
          return res.status(403).json({ error: 'Kun hovedadmin eller leverandøradmin kan importere ansatte' });
        }
        const vendorId = userVendorId(req);
        if (!vendorId && !isSuperAdmin(req)) {
          return res.status(400).json({ error: 'Ingen vendor knyttet til konto' });
        }
        if (!req.file) {
          return res.status(400).json({ error: 'Ingen fil mottatt (feltnavn må være "file")' });
        }

        const sourceRaw = String(req.body.source || '').toLowerCase();
        if (!ALLOWED_SOURCES.includes(sourceRaw as ImportSource)) {
          return res.status(400).json({
            error: `Ugyldig kilde "${sourceRaw}". Tillatt: ${ALLOWED_SOURCES.join(', ')}`,
          });
        }
        const source = sourceRaw as ImportSource;

        const buf = req.file.buffer;
        const fileHash = crypto.createHash('sha256').update(buf).digest('hex');
        const fileName = req.file.originalname;

        const parser = getParser(source);
        const parsedRows = await parser.parse(buf, fileName);

        if (parsedRows.length === 0) {
          return res.status(400).json({ error: 'Filen inneholder ingen rader' });
        }
        if (parsedRows.length > MAX_ROWS) {
          return res.status(400).json({
            error: `For mange rader (${parsedRows.length}). Maks ${MAX_ROWS} per import.`,
          });
        }

        const summary = summarizeRows(parsedRows);

        // Sjekk hvilke e-poster som allerede finnes i company_users for denne vendoren
        const emails = parsedRows
          .filter((r) => r.parsed?.email)
          .map((r) => r.parsed!.email!.toLowerCase());

        const existingEmails = new Set<string>();
        if (emails.length > 0 && vendorId) {
          const existing = await db
            .select({ email: companyUsers.userEmail })
            .from(companyUsers)
            .where(and(
              eq(companyUsers.vendorId, vendorId),
              sql`lower(${companyUsers.userEmail}) IN (${sql.join(emails.map((e) => sql`${e}`), sql`, `)})`,
            ));
          for (const r of existing) existingEmails.add(r.email.toLowerCase());
        }

        // Lagre imports + import_rows i en transaksjon
        const importedById = userEmail(req) || 'unknown';

        // Seat-warning: regn ut om vendor går over max_users etter denne importen.
        // Inkluderer ikke duplikat-rader siden de ikke skaper nye brukere.
        const validNonDup = parsedRows.filter(
          (r) => r.errors.length === 0 && !(r.parsed?.email && existingEmails.has(r.parsed.email.toLowerCase())),
        ).length;
        const seatWarning = vendorId ? await computeSeatWarning(vendorId, validNonDup) : null;

        const [importRec] = await db
          .insert(imports)
          .values({
            vendorId: vendorId ?? 0,
            source,
            status: 'staged',
            fileName,
            fileHash,
            rowCount: parsedRows.length,
            createdBy: importedById,
            summaryJsonb: { ...summary, seat_warning: seatWarning },
          })
          .returning();

        const rowsToInsert = parsedRows.map((r) => {
          const isDuplicate =
            r.parsed?.email && existingEmails.has(r.parsed.email.toLowerCase());
          let status: 'valid' | 'error' | 'duplicate' = 'valid';
          if (r.errors.length > 0) status = 'error';
          else if (isDuplicate) status = 'duplicate';

          const suggested = r.parsed
            ? suggestRoleFromJobTitle(r.parsed.jobTitle)
            : 'miljoarbeider';

          return {
            importId: importRec.id,
            rowIndex: r.rowIndex,
            externalId: r.parsed?.externalId ?? null,
            rawJsonb: r.raw,
            parsedJsonb: r.parsed ?? null,
            status,
            errorMsg: r.errors.length > 0 ? r.errors.join('; ') : null,
            roleAssigned: status === 'valid' ? suggested : null,
          };
        });

        await db.insert(importRows).values(rowsToInsert);

        return res.status(201).json({
          import_id: importRec.id,
          summary: {
            total: parsedRows.length,
            valid: rowsToInsert.filter((r) => r.status === 'valid').length,
            errors: rowsToInsert.filter((r) => r.status === 'error').length,
            duplicates: rowsToInsert.filter((r) => r.status === 'duplicate').length,
            seat_warning: seatWarning,
          },
        });
      } catch (err: any) {
        console.error('[imports] upload failed', err);
        return res.status(500).json({ error: err?.message || 'Import feilet' });
      }
    },
  );

  /**
   * GET /api/imports/:id
   * Returnerer import-metadata + alle rader for preview.
   */
  app.get('/api/imports/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const id = String(req.params.id);
      const [rec] = await db.select().from(imports).where(eq(imports.id, id)).limit(1);
      if (!rec) return res.status(404).json({ error: 'Import ikke funnet' });
      if (!isSuperAdmin(req) && rec.vendorId !== userVendorId(req)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const rows = await db
        .select()
        .from(importRows)
        .where(eq(importRows.importId, id))
        .orderBy(importRows.rowIndex);

      return res.json({ import: rec, rows });
    } catch (err: any) {
      console.error('[imports] get failed', err);
      return res.status(500).json({ error: err?.message || 'Feilet' });
    }
  });

  /**
   * PATCH /api/imports/:id/rows/:rowId
   * Endre rolle-tildeling for én rad. Brukes av preview-UI.
   */
  app.patch(
    '/api/imports/:id/rows/:rowId',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
        const importId = String(req.params.id);
        const rowId = String(req.params.rowId);
        const role = String(req.body.role_assigned || '').toLowerCase();

        if (!ROLE_DROPDOWN_ALLOWED.has(role)) {
          return res.status(400).json({
            error: `Ugyldig rolle "${role}". Tillatt: ${Array.from(ROLE_DROPDOWN_ALLOWED).join(', ')}`,
          });
        }

        const [imp] = await db.select().from(imports).where(eq(imports.id, importId)).limit(1);
        if (!imp) return res.status(404).json({ error: 'Import ikke funnet' });
        if (!isSuperAdmin(req) && imp.vendorId !== userVendorId(req)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (imp.status !== 'staged') {
          return res.status(400).json({ error: `Kan ikke endre rolle på status=${imp.status}` });
        }

        await db
          .update(importRows)
          .set({ roleAssigned: role })
          .where(and(eq(importRows.id, rowId), eq(importRows.importId, importId)));

        return res.json({ ok: true });
      } catch (err: any) {
        console.error('[imports] patch row failed', err);
        return res.status(500).json({ error: err?.message || 'Feilet' });
      }
    },
  );

  /**
   * POST /api/imports/:id/confirm
   * Transaksjonell commit. INSERT i company_users for alle valid-rader.
   * Idempotent via UNIQUE (vendor_id, lower(user_email)) — hvis e-post finnes
   * markeres raden som duplicate i stedet for å feile.
   */
  app.post(
    '/api/imports/:id/confirm',
    requireAuth,
    async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const client = await pool.connect();
      try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });

        // GDPR-bekreftelse: hovedadmin må eksplisitt dokumentere at de
        // har rettsgrunnlag og har informert de ansatte. Denne ack-en er
        // den "dokumenterte instruksen" DPA §1.2 krever — uten den har vi
        // ingen lovlig basis for å committe importen.
        const gdprAckRaw = req.body?.gdpr_ack;
        if (gdprAckRaw !== true && gdprAckRaw !== 'true') {
          return res.status(400).json({
            error: 'GDPR-bekreftelse mangler',
            code: 'gdpr_ack_required',
            hint: 'Hovedadmin må bekrefte rettsgrunnlag og informasjons-plikt før import kan fullføres.',
          });
        }

        const [imp] = await db.select().from(imports).where(eq(imports.id, id)).limit(1);
        if (!imp) return res.status(404).json({ error: 'Import ikke funnet' });
        if (!isSuperAdmin(req) && imp.vendorId !== userVendorId(req)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (imp.status !== 'staged') {
          return res.status(400).json({ error: `Allerede ${imp.status}` });
        }

        // Seat-overrun-sjekk: re-beregn på nytt slik at vi ikke stoler blindt på
        // det som ble lagret ved upload (current_users kan ha endret seg mellom
        // upload og confirm). Hvis overrun fortsatt finnes, krev eksplisitt ack.
        const rows = await db
          .select()
          .from(importRows)
          .where(eq(importRows.importId, id));

        const validNonDup = rows.filter((r) => r.status === 'valid').length;
        const seatWarning = imp.vendorId ? await computeSeatWarning(imp.vendorId, validNonDup) : null;

        if (seatWarning) {
          const seatAckRaw = req.body?.seat_overrun_ack;
          if (seatAckRaw !== true && seatAckRaw !== 'true') {
            return res.status(400).json({
              error: `Importen vil ta dere fra ${seatWarning.current_users} til ${seatWarning.will_have} brukere — ${seatWarning.overrun_by} over avtalt grense på ${seatWarning.max_users}. Bekreftelse mangler.`,
              code: 'seat_overrun_ack_required',
              seat_warning: seatWarning,
            });
          }
        }

        const adminGrants: string[] = [];
        let imported = 0;
        let skipped = 0;

        // Tier-bump + Stripe-bump-resultater blir tilgjengelig utenfor
        // transaksjons-try-en for bruk i e-post-varslingene etterpå.
        let tierBump: TierBumpResult | null = null;
        let stripeBump: StripeBumpResult | null = null;

        await client.query('BEGIN');
        try {
          for (const r of rows) {
            if (r.status !== 'valid') {
              skipped++;
              continue;
            }
            const parsed = r.parsedJsonb as { email?: string } | null;
            if (!parsed?.email) {
              skipped++;
              continue;
            }
            const role = r.roleAssigned || 'miljoarbeider';

            // INSERT med ON CONFLICT for å være tolerant mot race conditions
            const insertRes = await client.query(
              `INSERT INTO company_users (vendor_id, company_id, user_email, role, approved)
               VALUES ($1, $1, $2, $3, true)
               ON CONFLICT (COALESCE(vendor_id, 0), lower(user_email)) DO NOTHING
               RETURNING id`,
              [imp.vendorId, parsed.email, role],
            );

            if (insertRes.rows.length > 0) {
              const newId = Number(insertRes.rows[0].id);
              await client.query(
                `UPDATE import_rows SET status='imported', target_user_id=$1 WHERE id=$2`,
                [newId, r.id],
              );
              imported++;
              if (role === 'vendor_admin') adminGrants.push(parsed.email);
            } else {
              await client.query(
                `UPDATE import_rows SET status='duplicate' WHERE id=$1`,
                [r.id],
              );
              skipped++;
            }
          }

          const finalSummary: any = {
            ...(imp.summaryJsonb as object || {}),
            imported,
            skipped,
            admin_grants: adminGrants,
            gdpr_ack: {
              at: new Date().toISOString(),
              by_email: userEmail(req) || 'unknown',
              by_role: normalizeRole(String(currentUser(req)?.role || '')),
              ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                || req.socket?.remoteAddress
                || null,
              user_agent: req.headers['user-agent'] || null,
            },
          };

          if (seatWarning) {
            finalSummary.seat_overrun = {
              ...seatWarning,
              acked_by: userEmail(req) || 'unknown',
              acked_at: new Date().toISOString(),
            };
          }

          // T14: tier-bump i DB. T15: Stripe-prorering hvis feature-flag PÅ.
          // Best-effort på begge — feil her skal ikke rolle tilbake importen.
          if (seatWarning && imp.vendorId) {
            try {
              tierBump = await applyTierBump(imp.vendorId, seatWarning.will_have);
              if (tierBump?.changed) {
                finalSummary.tier_bump = {
                  from_max_users: tierBump.vendorBefore.maxUsers,
                  from_plan:      tierBump.vendorBefore.subscriptionPlan,
                  to_max_users:   tierBump.vendorAfter.maxUsers,
                  to_plan:        tierBump.vendorAfter.subscriptionPlan,
                  to_tier_id:     tierBump.toTier.id,
                  to_tier_label:  tierBump.toTier.label,
                  applied_at:     new Date().toISOString(),
                  stripe_pending: true,  // settes false hvis Stripe-bump under lykkes
                };

                // T15: prøv å oppdatere Stripe-subscription med proration.
                // Bare hvis TIDUM_STRIPE_AUTOBUMP=1 og kunden har en aktiv
                // subscription. Default-OFF-flagget bygger inn sikkerhet
                // mot at en ufullstendig pris-konfigurasjon påvirker fakturering.
                try {
                  const [activeSub] = await db
                    .select({ subId: accessRequests.stripeSubscriptionId })
                    .from(accessRequests)
                    .where(and(
                      eq(accessRequests.vendorId, imp.vendorId),
                      eq(accessRequests.status, 'approved'),
                    ))
                    .orderBy(desc(accessRequests.createdAt))
                    .limit(1);

                  stripeBump = await bumpStripeSubscriptionToNewTier(
                    activeSub?.subId ?? null,
                    tierBump.toTier,
                    seatWarning.will_have,
                  );
                  finalSummary.tier_bump.stripe_result = stripeBump;
                  if (stripeBump.ok) {
                    finalSummary.tier_bump.stripe_pending = false;
                  }
                } catch (stripeErr) {
                  console.error('[imports] Stripe-bump feilet (ikke fatalt):', stripeErr);
                  stripeBump = null;
                }
              }
            } catch (bumpErr) {
              console.error('[imports] tier-bump feilet (ikke fatalt):', bumpErr);
            }
          }

          await client.query(
            `UPDATE imports
                SET status='confirmed', confirmed_at=NOW(), summary_jsonb=$1
              WHERE id=$2`,
            [finalSummary, id],
          );

          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK');
          throw txErr;
        }

        // Varsler ved bekreftet seat-overrun:
        //  1) E-post til hovedadmin med formell tier-oppgraderings-varsling (§2.4)
        //  2) E-post til Daniel (super_admin) med Stripe-action-needed
        if (seatWarning && imp.vendorId) {
          const ackerEmail = userEmail(req) || 'ukjent';
          const ackedAtNb = new Date().toLocaleString('nb');
          try {
            const [vendorRow] = await db
              .select({ name: vendors.name })
              .from(vendors)
              .where(eq(vendors.id, imp.vendorId))
              .limit(1);
            const vendorName = vendorRow?.name || `vendor #${imp.vendorId}`;

            // 1) Hovedadmin-varsel — formell §2.4-notice
            if (tierBump?.changed) {
              try {
                await emailService.sendTierUpgradeNoticeEmail({
                  to: ackerEmail,
                  hovedadminName: null,
                  vendorName,
                  fromUserCount: seatWarning.current_users,
                  toUserCount: seatWarning.will_have,
                  fromTierLabel: tierBump.fromTier?.label ?? null,
                  toTierLabel: tierBump.toTier.label,
                  pricePerUserKr: oreToKr(tierBump.toTier.pricePerUserOre),
                });
              } catch (notifyErr) {
                console.error('[imports] Hovedadmin tier-notice e-post feilet:', notifyErr);
              }
            }

            // 2) Daniel-varsel — beriket med tier-info og Stripe-status
            let tierLine: string;
            let stripeActionHtml: string;
            let stripeActionText: string;
            if (!tierBump?.changed) {
              tierLine = 'Tier ikke endret — vendor allerede på riktig tier eller ingen tier matchet.';
              stripeActionHtml = '';
              stripeActionText = '';
            } else if (stripeBump?.ok) {
              tierLine = `Tier auto-oppgradert i DB: ${tierBump.fromTier?.label || '—'} → ${tierBump.toTier.label} (max_users: ${tierBump.vendorBefore.maxUsers ?? '—'} → ${tierBump.vendorAfter.maxUsers ?? '—'}). Stripe-subscription auto-oppdatert med proration.`;
              stripeActionHtml = `
                <div style="margin-top: 12px; padding: 12px; background: #f0fdf4; border-left: 3px solid #16a34a;">
                  <strong>Stripe:</strong> Subscription ${stripeBump.subscription_id} oppdatert til pris ${stripeBump.new_price_id} (qty=${stripeBump.new_quantity}, ${stripeBump.interval}). ${stripeBump.invoice_id ? `Prorerings-invoice: ${stripeBump.invoice_id}.` : ''} Auto-prorering OK.
                </div>`;
              stripeActionText = `STRIPE: Subscription ${stripeBump.subscription_id} auto-oppdatert (pris=${stripeBump.new_price_id}, qty=${stripeBump.new_quantity}, ${stripeBump.interval}). ${stripeBump.invoice_id ? `Invoice ${stripeBump.invoice_id}.` : ''}`;
            } else {
              const reasonLabel = stripeBump?.reason === 'flag_off'
                ? 'TIDUM_STRIPE_AUTOBUMP er av — manuell oppdatering kreves'
                : stripeBump?.reason === 'no_subscription'
                ? 'Vendor har ingen Stripe-subscription registrert'
                : stripeBump?.reason === 'subscription_not_found'
                ? 'Subscription ikke funnet i Stripe'
                : stripeBump?.reason === 'no_seat_item'
                ? 'Subscription mangler seat-item (recurring price)'
                : stripeBump?.reason === 'no_price_id'
                ? 'Tier mangler Stripe-pris-id — kjør syncAllTiersToStripe()'
                : stripeBump?.reason === 'enterprise'
                ? 'Enterprise-tier — manuell behandling'
                : stripeBump?.reason === 'stripe_error'
                ? `Stripe-feil: ${stripeBump?.error_message ?? 'ukjent'}`
                : 'Stripe-bump ikke forsøkt';
              tierLine = `Tier auto-oppgradert i DB: ${tierBump.fromTier?.label || '—'} → ${tierBump.toTier.label} (max_users: ${tierBump.vendorBefore.maxUsers ?? '—'} → ${tierBump.vendorAfter.maxUsers ?? '—'}). Stripe-bump status: ${reasonLabel}.`;
              stripeActionHtml = `
                <div style="margin-top: 12px; padding: 12px; background: #fff7e6; border-left: 3px solid #f0c674;">
                  <strong>Stripe-action kreves manuelt:</strong> Oppdater subscription i Stripe-dashbordet til ny pris (${tierBump.toTier.stripePriceIdAnnual || tierBump.toTier.stripePriceIdMonthly || 'pris-id mangler'}) med qty=${seatWarning.will_have}. Reason: ${reasonLabel}.
                </div>`;
              stripeActionText = `STRIPE-ACTION KREVET (manuelt): Oppdater subscription til pris (${tierBump.toTier.stripePriceIdAnnual || tierBump.toTier.stripePriceIdMonthly || 'pris-id mangler'}) qty=${seatWarning.will_have}. Reason: ${reasonLabel}.`;
            }

            await emailService.sendEmail({
              to: TIDUM_SUPPORT_EMAIL,
              subject: `Seat-overrun: ${vendorName} har overskredet avtalt brukerantall`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
                  <h2 style="color: #0f172a;">Seat-overrun bekreftet</h2>
                  <p><strong>Vendor:</strong> ${vendorName} (id ${imp.vendorId})</p>
                  <p><strong>Før import:</strong> ${seatWarning.current_users} brukere</p>
                  <p><strong>Etter import:</strong> ${seatWarning.will_have} brukere</p>
                  <p><strong>Tidligere grense (max_users):</strong> ${seatWarning.max_users}</p>
                  <p><strong>Overrun:</strong> ${seatWarning.overrun_by} over</p>
                  <p><strong>Akseptert av:</strong> ${ackerEmail} kl. ${ackedAtNb}</p>
                  <div style="margin-top: 16px; padding: 12px; background: #fff7e6; border-left: 3px solid #f0c674;">
                    <strong>Tier-status:</strong><br>${tierLine}
                  </div>
                  ${stripeActionHtml}
                </div>
              `,
              text: [
                'Seat-overrun bekreftet',
                `Vendor: ${vendorName} (id ${imp.vendorId})`,
                `Før: ${seatWarning.current_users}, Etter: ${seatWarning.will_have}, Grense: ${seatWarning.max_users}, Overrun: ${seatWarning.overrun_by}`,
                `Akseptert av: ${ackerEmail} kl. ${ackedAtNb}`,
                '',
                tierLine,
                '',
                stripeActionText,
              ].filter(Boolean).join('\n'),
            });
          } catch (mailErr) {
            console.error('[imports] Failed to email seat-overrun notice:', mailErr);
          }
        }

        return res.json({ ok: true, imported, skipped, admin_grants: adminGrants, seat_warning: seatWarning });
      } catch (err: any) {
        console.error('[imports] confirm failed', err);
        return res.status(500).json({ error: err?.message || 'Confirm feilet' });
      } finally {
        client.release();
      }
    },
  );

  /**
   * DELETE /api/imports/:id
   * Rollback en bekreftet import innen 7 dager. Sletter company_users-radene
   * som ble opprettet, markerer importen rolled_back.
   */
  app.delete('/api/imports/:id', requireAuth, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const client = await pool.connect();
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });

      const [imp] = await db.select().from(imports).where(eq(imports.id, id)).limit(1);
      if (!imp) return res.status(404).json({ error: 'Import ikke funnet' });
      if (!isSuperAdmin(req) && imp.vendorId !== userVendorId(req)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (imp.status === 'staged') {
        // Bare slett — ingenting commit-et til company_users
        await db.delete(imports).where(eq(imports.id, id));
        return res.json({ ok: true, deleted: 'staged' });
      }
      if (imp.status !== 'confirmed') {
        return res.status(400).json({ error: `Kan ikke rolle tilbake status=${imp.status}` });
      }
      const confirmedAt = imp.confirmedAt ? new Date(imp.confirmedAt).getTime() : 0;
      if (Date.now() - confirmedAt > ROLLBACK_WINDOW_MS) {
        return res.status(400).json({ error: 'Rollback-vinduet på 7 dager er utløpt' });
      }

      const rows = await db
        .select({ id: importRows.id, targetUserId: importRows.targetUserId })
        .from(importRows)
        .where(and(eq(importRows.importId, id), eq(importRows.status, 'imported')));

      const targetIds = rows.map((r) => r.targetUserId).filter((x): x is number => x != null);

      await client.query('BEGIN');
      try {
        if (targetIds.length > 0) {
          await client.query(
            `DELETE FROM company_users WHERE id = ANY($1::int[])`,
            [targetIds],
          );
        }
        await client.query(
          `UPDATE import_rows SET status='valid', target_user_id=NULL
             WHERE import_id=$1 AND status='imported'`,
          [id],
        );
        await client.query(
          `UPDATE imports SET status='rolled_back', rolled_back_at=NOW() WHERE id=$1`,
          [id],
        );
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      }

      return res.json({ ok: true, rolled_back: targetIds.length });
    } catch (err: any) {
      console.error('[imports] rollback failed', err);
      return res.status(500).json({ error: err?.message || 'Rollback feilet' });
    } finally {
      client.release();
    }
  });

  /**
   * GET /api/imports
   * Liste over imports for vendoren (eller alle hvis super_admin).
   */
  app.get('/api/imports', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const vendorId = userVendorId(req);

      const rows = isSuperAdmin(req)
        ? await db.select().from(imports).orderBy(desc(imports.createdAt)).limit(100)
        : vendorId
          ? await db
              .select()
              .from(imports)
              .where(eq(imports.vendorId, vendorId))
              .orderBy(desc(imports.createdAt))
              .limit(100)
          : [];

      return res.json({ imports: rows });
    } catch (err: any) {
      console.error('[imports] list failed', err);
      return res.status(500).json({ error: err?.message || 'Feilet' });
    }
  });
}
