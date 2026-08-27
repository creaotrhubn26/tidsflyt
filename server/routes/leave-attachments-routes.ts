import type { Express, NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { uploadRateLimit } from "../rate-limit";
import {
  canManageLeave,
  resolveLeaveActor,
  type LeaveActor,
} from "../lib/leave-authorization";
import {
  createLeaveAttachmentStorageName,
  leaveAttachmentContentDisposition,
  leaveAttachmentDirectory,
  resolveLeaveAttachmentStoragePath,
  safeLeaveAttachmentName,
  validateLeaveAttachment,
} from "../lib/leave-attachment-security";
import {
  MalwareScannerUnavailableError,
  scanSecureAttachmentForMalware,
} from "../lib/secure-attachment-malware-scanner";

type LeaveAttachmentRequest = Request & { leaveActor?: LeaveActor };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_STORED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

function receiveLeaveAttachment(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error: any) => {
    if (error) return res.status(400).json({ error: "Ugyldig eller for stor fil" });
    next();
  });
}

async function requireLeaveActor(req: LeaveAttachmentRequest, res: Response, next: NextFunction) {
  try {
    const actor = await resolveLeaveActor(req);
    if (!actor) {
      return res.status(403).json({ error: "Vedleggstilgang krever aktiv leverandørtilknytning" });
    }
    req.leaveActor = actor;
    next();
  } catch (error) {
    console.error("[leave-attachments] actor resolution failed", error);
    res.status(503).json({ error: "Kunne ikke kontrollere tilgang" });
  }
}

function actor(req: LeaveAttachmentRequest): LeaveActor {
  return req.leaveActor!;
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

type ScopedLeaveRequest = {
  id: number;
  vendor_id: number;
  user_id: string;
};

async function loadAccessibleLeaveRequest(
  requestActor: LeaveActor,
  leaveRequestId: number,
): Promise<ScopedLeaveRequest | null> {
  const result = await pool.query(
    `SELECT id, vendor_id, user_id
       FROM tidum_leave_requests
      WHERE id = $1
        AND vendor_id = $2
      LIMIT 1`,
    [leaveRequestId, requestActor.vendorId],
  );
  const row = result.rows[0] as ScopedLeaveRequest | undefined;
  if (!row) return null;
  if (row.user_id !== requestActor.id && !canManageLeave(requestActor)) return null;
  return row;
}

function publicAttachmentRow(row: any) {
  return {
    id: row.id,
    leaveRequestId: row.leave_request_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

export function registerLeaveAttachmentsRoutes(app: Express) {
  app.post(
    "/api/leave/:id/attachments",
    requireAuth,
    requireLeaveActor,
    uploadRateLimit,
    receiveLeaveAttachment,
    async (req: LeaveAttachmentRequest, res: Response) => {
      try {
        const leaveRequestId = parsePositiveInteger(req.params.id);
        if (!leaveRequestId) return res.status(400).json({ error: "Ugyldig id" });
        if (!req.file) return res.status(400).json({ error: "Ingen fil mottatt" });

        const parent = await loadAccessibleLeaveRequest(actor(req), leaveRequestId);
        if (!parent) return res.status(404).json({ error: "Fraværssøknaden finnes ikke" });

        let detected;
        try {
          detected = await validateLeaveAttachment(req.file.buffer, req.file.mimetype);
        } catch {
          return res.status(400).json({ error: "Filen er ikke en gyldig PDF-, JPEG-, PNG- eller WebP-fil" });
        }

        let scan;
        try {
          scan = await scanSecureAttachmentForMalware(req.file.buffer);
        } catch (error) {
          if (error instanceof MalwareScannerUnavailableError) {
            return res.status(503).json({ error: "Sikkerhetskontroll av vedlegg er midlertidig utilgjengelig" });
          }
          throw error;
        }
        if (scan.status === "infected") {
          return res.status(422).json({ error: "Vedlegget ble avvist av sikkerhetskontrollen" });
        }

        const directory = leaveAttachmentDirectory();
        await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
        const storageName = createLeaveAttachmentStorageName(detected);
        const storagePath = path.join(directory, storageName);
        await fs.promises.writeFile(storagePath, req.file.buffer, { flag: "wx", mode: 0o600 });

        try {
          const result = await pool.query(
            `INSERT INTO tidum_leave_attachments
               (vendor_id, leave_request_id, filename, original_name, mime_type,
                size_bytes, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, leave_request_id, original_name, mime_type,
                       size_bytes, uploaded_by, uploaded_at`,
            [
              actor(req).vendorId,
              parent.id,
              storageName,
              safeLeaveAttachmentName(req.file.originalname),
              detected.mimeType,
              req.file.size,
              actor(req).id,
            ],
          );
          res.status(201).json(publicAttachmentRow(result.rows[0]));
        } catch (error) {
          await fs.promises.unlink(storagePath).catch(() => undefined);
          throw error;
        }
      } catch (error) {
        console.error("[leave-attachments] upload failed", error);
        res.status(500).json({ error: "Kunne ikke lagre vedlegget" });
      }
    },
  );

  app.get("/api/leave/:id/attachments", requireAuth, requireLeaveActor, async (req: LeaveAttachmentRequest, res: Response) => {
    try {
      const leaveRequestId = parsePositiveInteger(req.params.id);
      if (!leaveRequestId) return res.status(400).json({ error: "Ugyldig id" });
      const parent = await loadAccessibleLeaveRequest(actor(req), leaveRequestId);
      if (!parent) return res.status(404).json({ error: "Fraværssøknaden finnes ikke" });

      const result = await pool.query(
        `SELECT id, leave_request_id, original_name, mime_type, size_bytes,
                uploaded_by, uploaded_at
           FROM tidum_leave_attachments
          WHERE leave_request_id = $1
            AND vendor_id = $2
          ORDER BY uploaded_at DESC`,
        [parent.id, actor(req).vendorId],
      );
      res.setHeader("Cache-Control", "no-store");
      res.json(result.rows.map(publicAttachmentRow));
    } catch (error) {
      console.error("[leave-attachments] list failed", error);
      res.status(500).json({ error: "Kunne ikke hente vedlegg" });
    }
  });

  app.get("/api/leave/attachments/:attId/download", requireAuth, requireLeaveActor, async (req: LeaveAttachmentRequest, res: Response) => {
    try {
      if (!UUID_PATTERN.test(req.params.attId)) return res.status(404).json({ error: "Ikke funnet" });
      const result = await pool.query(
        `SELECT la.leave_request_id, la.filename, la.original_name, la.mime_type,
                lr.user_id
           FROM tidum_leave_attachments la
           JOIN tidum_leave_requests lr
             ON lr.id = la.leave_request_id
            AND lr.vendor_id = la.vendor_id
          WHERE la.id = $1
            AND la.vendor_id = $2
          LIMIT 1`,
        [req.params.attId, actor(req).vendorId],
      );
      const row = result.rows[0];
      if (!row || (row.user_id !== actor(req).id && !canManageLeave(actor(req)))) {
        return res.status(404).json({ error: "Ikke funnet" });
      }
      const filePath = resolveLeaveAttachmentStoragePath(row.filename);
      if (!filePath || !ALLOWED_STORED_MIME.has(String(row.mime_type))) {
        return res.status(410).json({ error: "Vedlegget kan ikke leveres sikkert" });
      }
      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
      } catch {
        return res.status(410).json({ error: "Filen eksisterer ikke lenger" });
      }

      res.setHeader("Content-Type", row.mime_type);
      res.setHeader("Content-Disposition", leaveAttachmentContentDisposition(row.original_name));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      const stream = fs.createReadStream(filePath);
      stream.once("error", (error) => {
        console.error("[leave-attachments] stream failed", error);
        if (!res.headersSent) res.status(500).json({ error: "Kunne ikke lese vedlegget" });
        else res.destroy(error);
      });
      stream.pipe(res);
    } catch (error) {
      console.error("[leave-attachments] download failed", error);
      res.status(500).json({ error: "Kunne ikke hente vedlegget" });
    }
  });

  app.delete("/api/leave/attachments/:attId", requireAuth, requireLeaveActor, async (req: LeaveAttachmentRequest, res: Response) => {
    try {
      if (!UUID_PATTERN.test(req.params.attId)) return res.status(404).json({ error: "Ikke funnet" });
      const result = await pool.query(
        `SELECT la.filename, lr.user_id
           FROM tidum_leave_attachments la
           JOIN tidum_leave_requests lr
             ON lr.id = la.leave_request_id
            AND lr.vendor_id = la.vendor_id
          WHERE la.id = $1
            AND la.vendor_id = $2
          LIMIT 1`,
        [req.params.attId, actor(req).vendorId],
      );
      const row = result.rows[0];
      if (!row || (row.user_id !== actor(req).id && !canManageLeave(actor(req)))) {
        return res.status(404).json({ error: "Ikke funnet" });
      }
      await pool.query(
        "DELETE FROM tidum_leave_attachments WHERE id = $1 AND vendor_id = $2",
        [req.params.attId, actor(req).vendorId],
      );
      const filePath = resolveLeaveAttachmentStoragePath(row.filename);
      if (filePath) await fs.promises.unlink(filePath).catch(() => undefined);
      res.status(204).send();
    } catch (error) {
      console.error("[leave-attachments] delete failed", error);
      res.status(500).json({ error: "Kunne ikke slette vedlegget" });
    }
  });
}
