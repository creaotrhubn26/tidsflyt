/**
 * server/routes/leave-attachments-routes.ts
 *
 * Sykmelding / annen dokumentasjon på leave_requests. PDF eller bilder.
 *
 *   POST   /api/leave/:id/attachments   — upload 1 fil
 *   GET    /api/leave/:id/attachments   — list
 *   GET    /api/leave/attachments/:attId/download  — stream to caller (owner/admin/tiltaksleder)
 *   DELETE /api/leave/attachments/:attId
 *
 * Lagring: lokalt `uploads/leave/` — kan byttes til S3-liknende senere.
 */

import type { Express, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../db';
import { requireAuth, ADMIN_ROLES } from '../middleware/auth';

const LEAVE_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'leave');
if (!fs.existsSync(LEAVE_UPLOAD_DIR)) fs.mkdirSync(LEAVE_UPLOAD_DIR, { recursive: true });

const leaveStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LEAVE_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `leave-${unique}${ext}`);
  },
});

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

const upload = multer({
  storage: leaveStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB — sick notes are usually small but may be multi-page PDFs
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('Kun PDF og bildefiler er tillatt (JPEG, PNG, HEIC, WebP)'));
  },
});

let ensured = false;
async function ensureTable(): Promise<void> {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      leave_request_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_by TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_leave_attachments_request ON leave_attachments(leave_request_id);
  `);
  ensured = true;
}

function authedUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}

function isAdminOrTiltaksleder(req: Request): boolean {
  const role = String(authedUser(req)?.role || '').toLowerCase().replace(/[\s-]/g, '_');
  return ADMIN_ROLES.includes(role) || role === 'tiltaksleder';
}

async function canAccessAttachment(req: Request, leaveRequestId: number): Promise<boolean> {
  if (isAdminOrTiltaksleder(req)) return true;
  const userId = authedUser(req)?.id;
  if (!userId) return false;
  const r = await pool.query('SELECT user_id FROM leave_requests WHERE id = $1 LIMIT 1', [leaveRequestId]);
  return r.rows[0]?.user_id === String(userId);
}

export function registerLeaveAttachmentsRoutes(app: Express) {
  app.post('/api/leave/:id/attachments', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
    try {
      await ensureTable();
      const leaveRequestId = Number(req.params.id);
      if (!Number.isInteger(leaveRequestId)) return res.status(400).json({ error: 'Ugyldig id' });
      if (!req.file) return res.status(400).json({ error: 'Ingen fil mottatt (feltnavn må være "file")' });

      // Authorisation: eier eller admin/tiltaksleder
      const lr = await pool.query('SELECT user_id FROM leave_requests WHERE id = $1 LIMIT 1', [leaveRequestId]);
      if (lr.rows.length === 0) {
        // Rydd opp filen siden vi ikke knytter den
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Leave-request ikke funnet' });
      }
      const owner = lr.rows[0].user_id;
      const caller = authedUser(req);
      if (String(caller?.id) !== owner && !isAdminOrTiltaksleder(req)) {
        fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: 'Kan ikke laste opp til andres søknad' });
      }

      const result = await pool.query(
        `INSERT INTO leave_attachments
           (leave_request_id, filename, original_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, leave_request_id, filename, original_name, mime_type, size_bytes, uploaded_by, uploaded_at`,
        [
          leaveRequestId,
          path.basename(req.file.path),
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          caller?.id ?? null,
        ],
      );
      res.status(201).json(result.rows[0]);
    } catch (e: any) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/leave/:id/attachments', requireAuth, async (req: Request, res: Response) => {
    try {
      await ensureTable();
      const leaveRequestId = Number(req.params.id);
      if (!Number.isInteger(leaveRequestId)) return res.status(400).json({ error: 'Ugyldig id' });
      if (!(await canAccessAttachment(req, leaveRequestId))) {
        return res.status(403).json({ error: 'Ikke tilgang' });
      }
      const r = await pool.query(
        `SELECT id, leave_request_id, filename, original_name, mime_type, size_bytes,
                uploaded_by, uploaded_at
         FROM leave_attachments WHERE leave_request_id = $1 ORDER BY uploaded_at DESC`,
        [leaveRequestId],
      );
      res.json(r.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/leave/attachments/:attId/download', requireAuth, async (req: Request, res: Response) => {
    try {
      await ensureTable();
      const r = await pool.query(
        'SELECT leave_request_id, filename, original_name, mime_type FROM leave_attachments WHERE id = $1 LIMIT 1',
        [req.params.attId],
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'Ikke funnet' });
      const row = r.rows[0];
      if (!(await canAccessAttachment(req, row.leave_request_id))) {
        return res.status(403).json({ error: 'Ikke tilgang' });
      }
      const filePath = path.join(LEAVE_UPLOAD_DIR, row.filename);
      if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'Filen eksisterer ikke lenger' });
      res.setHeader('Content-Type', row.mime_type);
      res.setHeader('Content-Disposition', `inline; filename="${row.original_name}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/leave/attachments/:attId', requireAuth, async (req: Request, res: Response) => {
    try {
      await ensureTable();
      const r = await pool.query(
        'SELECT leave_request_id, filename FROM leave_attachments WHERE id = $1 LIMIT 1',
        [req.params.attId],
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'Ikke funnet' });
      const row = r.rows[0];
      if (!(await canAccessAttachment(req, row.leave_request_id))) {
        return res.status(403).json({ error: 'Ikke tilgang' });
      }
      await pool.query('DELETE FROM leave_attachments WHERE id = $1', [req.params.attId]);
      const filePath = path.join(LEAVE_UPLOAD_DIR, row.filename);
      fs.unlink(filePath, () => {}); // best-effort
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
