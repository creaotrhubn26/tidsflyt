import type { Express, Request, Response } from "express";
import { and, between, eq } from "drizzle-orm";
import { db } from "../db";
import { logRow } from "@shared/schema";
import { ExportService } from "../lib/export-service";
import { requireAuth } from "../middleware/auth";

const VENDOR_EXPORT_ROLES = new Set([
  "vendor_admin",
  "tiltaksleder",
  "teamleder",
  "hovedadmin",
  "admin",
  "super_admin",
]);

type ExportScope =
  | { ok: true; userId?: string; vendorId: number }
  | { ok: false; status: 403; error: string };

function normalizedRole(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[\s-]/g, "_");
}

export function resolveExportScope(req: Request, requestedUserId?: string): ExportScope {
  const user = (req as any).authUser ?? (req as any).user;
  const actorId = String(user?.id ?? "").trim();
  const vendorId = Number(user?.vendorId ?? user?.vendor_id);
  const requested = String(requestedUserId ?? "").trim();
  const canExportVendor = VENDOR_EXPORT_ROLES.has(normalizedRole(user?.role));
  const hasVendor = Number.isInteger(vendorId) && vendorId > 0;

  if (!actorId) return { ok: false, status: 403, error: "Mangler brukeridentitet" };
  if (!hasVendor) {
    return { ok: false, status: 403, error: "Mangler tenant-tilknytning" };
  }

  // No target means the authenticated user's own rows. There is never an
  // implicit global or tenant-wide export.
  if (!requested || requested === actorId) {
    return { ok: true, vendorId, userId: actorId };
  }

  if (requested === "all") {
    if (!canExportVendor) {
      return { ok: false, status: 403, error: "Krever lederrolle med tenant-tilknytning" };
    }
    return { ok: true, vendorId };
  }

  if (!canExportVendor) {
    return { ok: false, status: 403, error: "Kan bare eksportere egne timer" };
  }

  // A leader may request one employee, but vendor_id remains mandatory in
  // the database query. A changed userId can therefore never cross tenants.
  return { ok: true, vendorId, userId: requested };
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validatePeriod(startDate: unknown, endDate: unknown): string | null {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return "startDate og endDate må være gyldige datoer på formatet YYYY-MM-DD";
  }
  if (startDate > endDate) return "startDate kan ikke være etter endDate";
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
  if (days > 366) return "Eksportperioden kan ikke være lengre enn 367 dager";
  return null;
}

async function exportEntries(startDate: string, endDate: string, scope: Extract<ExportScope, { ok: true }>) {
  const conditions = [between(logRow.date, startDate, endDate)];
  if (scope.vendorId != null) conditions.push(eq(logRow.vendorId, scope.vendorId));
  if (scope.userId != null) conditions.push(eq(logRow.userId, scope.userId));

  const entries = await db
    .select()
    .from(logRow)
    .where(and(...conditions))
    .orderBy(logRow.date);

  return entries.map((entry) => {
    const startTime = entry.startTime || "";
    const endTime = entry.endTime || "";
    const breakHours = Number(entry.breakHours || 0);
    let hours = 0;
    if (startTime && endTime) {
      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);
      let minutes = endH * 60 + endM - (startH * 60 + startM);
      if (minutes < 0) minutes += 24 * 60;
      hours = Math.max(0, minutes / 60 - (Number.isFinite(breakHours) ? breakHours : 0));
    }

    return {
      id: entry.id,
      date: entry.date?.toString() || "",
      startTime,
      endTime,
      breakHours: Number.isFinite(breakHours) ? breakHours : 0,
      activity: entry.activity || "",
      title: entry.title || "",
      project: entry.project || "",
      place: entry.place || "",
      notes: entry.notes || "",
      hours,
    };
  });
}

function exportRequest(req: Request, res: Response) {
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;
  const periodError = validatePeriod(startDate, endDate);
  if (periodError) {
    res.status(400).json({ error: periodError });
    return null;
  }

  const scope = resolveExportScope(req, req.query.userId == null ? undefined : String(req.query.userId));
  if (!scope.ok) {
    res.status(scope.status).json({ error: scope.error });
    return null;
  }

  res.setHeader("Cache-Control", "no-store");
  return {
    startDate: startDate as string,
    endDate: endDate as string,
    includeNotes: req.query.includeNotes !== "false",
    scope,
  };
}

function exportFailure(res: Response, kind: string, error: unknown) {
  console.error(`${kind} export error:`, error);
  return res.status(500).json({ error: "Eksporten kunne ikke genereres" });
}

export function registerExportRoutes(app: Express) {
  app.get("/api/export/excel", requireAuth, async (req: Request, res: Response) => {
    const parsed = exportRequest(req, res);
    if (!parsed) return;

    try {
      const entries = await exportEntries(parsed.startDate, parsed.endDate, parsed.scope);
      const buffer = await ExportService.generateExcel(entries, {
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        title: "Timeregistreringer",
        includeNotes: parsed.includeNotes,
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="timeregistrering_${parsed.startDate}_${parsed.endDate}.xlsx"`);
      return res.send(buffer);
    } catch (error) {
      return exportFailure(res, "Excel", error);
    }
  });

  app.get("/api/export/csv", requireAuth, async (req: Request, res: Response) => {
    const parsed = exportRequest(req, res);
    if (!parsed) return;

    try {
      const entries = await exportEntries(parsed.startDate, parsed.endDate, parsed.scope);
      const csv = ExportService.generateCSV(entries, {
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        includeNotes: parsed.includeNotes,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="timeregistrering_${parsed.startDate}_${parsed.endDate}.csv"`);
      return res.send(`\uFEFF${csv}`);
    } catch (error) {
      return exportFailure(res, "CSV", error);
    }
  });

  app.get("/api/export/pdf", requireAuth, async (req: Request, res: Response) => {
    const parsed = exportRequest(req, res);
    if (!parsed) return;

    try {
      const entries = await exportEntries(parsed.startDate, parsed.endDate, parsed.scope);
      const html = ExportService.generatePDFHTML(entries, {
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        title: "Timerapport",
        includeNotes: parsed.includeNotes,
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (error) {
      return exportFailure(res, "PDF", error);
    }
  });
}
