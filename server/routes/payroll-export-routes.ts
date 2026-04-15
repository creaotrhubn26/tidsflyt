/**
 * server/routes/payroll-export-routes.ts
 *
 * Payroll-ready CSV export for common Norwegian payroll systems:
 *   - Tripletex     (timeregistrering-import format)
 *   - Visma Lønn    (lønnsart-format)
 *   - PowerOffice Go (standard timelinje-format)
 *
 * Endpoint:
 *   GET /api/payroll/export?format=tripletex|visma|poweroffice&period=YYYY-MM[&userId=<id>]
 *
 * Only vendor_admin and tiltaksleder may export. Data is scoped to the
 * caller's vendor_id. Output is a downloadable CSV with UTF-8 BOM to ensure
 * correct handling of Norwegian characters in Excel.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { logRow, users } from "@shared/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

type Format = "tripletex" | "visma" | "poweroffice";

function authedUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}

function userVendorId(req: Request): number | null {
  const u = authedUser(req);
  const v = u?.vendorId ?? u?.vendor_id;
  return v ? Number(v) : null;
}

function hasPayrollAccess(req: Request): boolean {
  const r = String(authedUser(req)?.role ?? "").toLowerCase();
  return (
    r === "vendor_admin" ||
    r === "tiltaksleder" ||
    r === "teamleder" ||
    r === "hovedadmin" ||
    r === "admin" ||
    r === "super_admin"
  );
}

/** RFC-4180 quoted field with semicolon-safe escaping */
function csv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Hours (decimal) between two HH:MM[:SS] strings, minus break in decimal hours */
function computeHours(start: string, end: string, breakDecimal: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight shift
  const hours = mins / 60 - (Number.isFinite(breakDecimal) ? breakDecimal : 0);
  return Math.max(0, Math.round(hours * 100) / 100);
}

/** ISO year-month YYYY-MM → [first, last] date strings */
function periodBounds(period: string): [string, string] {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error("period må være på formatet YYYY-MM");
  const year = Number(m[1]);
  const month = Number(m[2]);
  const first = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const last = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  return [first, last];
}

interface EnrichedRow {
  date: string;
  start: string;
  end: string;
  hours: number;
  activity: string;
  project: string;
  place: string;
  notes: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
}

async function fetchRows(
  vendorId: number,
  from: string,
  to: string,
  userIdFilter?: string,
): Promise<EnrichedRow[]> {
  const whereExprs = [
    eq(logRow.vendorId, vendorId),
    gte(logRow.date, from),
    lte(logRow.date, to),
  ];
  if (userIdFilter) whereExprs.push(eq(logRow.userId, userIdFilter));

  const rows = await db
    .select({
      row: logRow,
      user: users,
    })
    .from(logRow)
    .leftJoin(users, eq(users.id, logRow.userId as any))
    .where(and(...whereExprs));

  return rows.map(({ row, user }) => {
    const breakDecimal = Number(row.breakHours ?? 0);
    const hours = computeHours(String(row.startTime), String(row.endTime), breakDecimal);
    const empName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || String(row.userId ?? "");
    return {
      date: String(row.date),
      start: String(row.startTime).slice(0, 5),
      end: String(row.endTime).slice(0, 5),
      hours,
      activity: row.activity ?? "",
      project: row.project ?? "",
      place: row.place ?? "",
      notes: row.notes ?? "",
      employeeId: String(user?.id ?? row.userId ?? ""),
      employeeName: empName,
      employeeEmail: user?.email ?? "",
    };
  });
}

// ── Formatters ──────────────────────────────────────────────────────────────

/**
 * Tripletex — «Import av timer» (semicolon-separert, UTF-8).
 * Docs: https://hjelp.tripletex.no/hc/no — reference column names.
 */
function formatTripletex(rows: EnrichedRow[]): string {
  const header = [
    "Ansattnr",
    "Dato",
    "Aktivitet",
    "Prosjekt",
    "Timer",
    "Starttid",
    "Sluttid",
    "Kommentar",
  ].join(";");
  const lines = rows.map((r) =>
    [
      csv(r.employeeId),
      csv(r.date),
      csv(r.activity || "Ordinær arbeidstid"),
      csv(r.project),
      csv(r.hours.toFixed(2).replace(".", ",")),
      csv(r.start),
      csv(r.end),
      csv(r.notes),
    ].join(";"),
  );
  return [header, ...lines].join("\n");
}

/**
 * Visma Lønn — bulkimport av lønnsart-transaksjoner.
 * Mapping: alle timer → lønnsart «10» (ordinær arbeidstid).
 */
function formatVisma(rows: EnrichedRow[]): string {
  const header = [
    "AnsattNr",
    "Dato",
    "LønnsArt",
    "Antall",
    "Beskrivelse",
  ].join(";");
  const lines = rows.map((r) =>
    [
      csv(r.employeeId),
      csv(r.date.split("-").reverse().join(".")), // dd.mm.yyyy for Visma
      csv("10"),
      csv(r.hours.toFixed(2).replace(".", ",")),
      csv([r.activity, r.place, r.notes].filter(Boolean).join(" — ")),
    ].join(";"),
  );
  return [header, ...lines].join("\n");
}

/**
 * PowerOffice Go — standard timelinje-import.
 */
function formatPowerOffice(rows: EnrichedRow[]): string {
  const header = [
    "EmployeeId",
    "EmployeeName",
    "Date",
    "FromTime",
    "ToTime",
    "Hours",
    "ActivityCode",
    "ProjectCode",
    "Description",
  ].join(";");
  const lines = rows.map((r) =>
    [
      csv(r.employeeId),
      csv(r.employeeName),
      csv(r.date),
      csv(r.start),
      csv(r.end),
      csv(r.hours.toFixed(2).replace(".", ",")),
      csv(r.activity),
      csv(r.project),
      csv(r.notes),
    ].join(";"),
  );
  return [header, ...lines].join("\n");
}

export function registerPayrollExportRoutes(app: Express) {
  app.get("/api/payroll/export", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasPayrollAccess(req)) return res.status(403).json({ error: "Krever leder-rolle" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const format = String(req.query.format ?? "").toLowerCase() as Format;
      if (!["tripletex", "visma", "poweroffice"].includes(format)) {
        return res.status(400).json({
          error: "Ugyldig format",
          hint: "Bruk format=tripletex|visma|poweroffice",
        });
      }

      const period = String(req.query.period ?? "");
      if (!/^\d{4}-\d{2}$/.test(period)) {
        return res.status(400).json({ error: "period må være YYYY-MM" });
      }

      const [from, to] = periodBounds(period);
      const userIdFilter = req.query.userId ? String(req.query.userId) : undefined;

      const rows = await fetchRows(vendorId, from, to, userIdFilter);

      let body: string;
      switch (format) {
        case "tripletex":
          body = formatTripletex(rows);
          break;
        case "visma":
          body = formatVisma(rows);
          break;
        case "poweroffice":
          body = formatPowerOffice(rows);
          break;
      }

      // UTF-8 BOM for Excel compatibility with Norwegian characters
      const bom = "\uFEFF";
      const filename = `tidum-${format}-${period}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(bom + body);
    } catch (e: any) {
      console.error("Payroll export failed:", e);
      res.status(500).json({ error: e.message });
    }
  });
}
