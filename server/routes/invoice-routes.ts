import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import PDFDocument from "pdfkit";
import { addDays, format, parseISO } from "date-fns";
import { nb } from "date-fns/locale";
import { and, between, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { invoiceLineItems, invoices, logRow, userSettings } from "@shared/schema";
import { requireAuth } from "../middleware/auth";

const INVOICE_STATUSES = new Set(["draft", "sent", "paid", "overdue", "cancelled"]);

type InvoiceActor = {
  id: string;
  vendorId: number;
};

function invoiceActor(req: Request): InvoiceActor | null {
  const user = (req as any).authUser ?? (req as any).user;
  const id = String(user?.id ?? "").trim();
  const vendorId = Number(user?.vendorId ?? user?.vendor_id);
  if (!id || !Number.isInteger(vendorId) || vendorId <= 0) return null;
  return { id, vendorId };
}

function requireInvoiceActor(req: Request, res: Response): InvoiceActor | null {
  const actor = invoiceActor(req);
  if (!actor) {
    res.status(403).json({ error: "Brukeren mangler gyldig tenant-tilknytning" });
    return null;
  }
  res.setHeader("Cache-Control", "no-store");
  return actor;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("INVALID_INPUT");
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error("INVALID_INPUT");
  return normalized || null;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function invoiceOwnerWhere(id: string, actor: InvoiceActor) {
  return and(
    eq(invoices.id, id),
    eq(invoices.vendorId, actor.vendorId),
    eq(invoices.userId, actor.id),
  );
}

function reportInvoiceError(res: Response, operation: string, error: unknown) {
  console.error(`Invoice ${operation} error:`, error);
  if (error instanceof Error && error.message === "INVALID_INPUT") {
    return res.status(400).json({ error: "Ugyldige fakturadata" });
  }
  return res.status(500).json({ error: "Fakturaoperasjonen kunne ikke fullføres" });
}

export function registerInvoiceRoutes(app: Express) {
  app.get("/api/invoices", requireAuth, async (req: Request, res: Response) => {
    const actor = requireInvoiceActor(req, res);
    if (!actor) return;

    try {
      const status = req.query.status == null ? null : String(req.query.status);
      if (status && !INVOICE_STATUSES.has(status)) {
        return res.status(400).json({ error: "Ugyldig fakturastatus" });
      }

      const conditions = [
        eq(invoices.vendorId, actor.vendorId),
        eq(invoices.userId, actor.id),
      ];
      if (status) conditions.push(eq(invoices.status, status));

      const results = await db
        .select()
        .from(invoices)
        .where(and(...conditions))
        .orderBy(desc(invoices.invoiceDate));

      return res.json(results);
    } catch (error) {
      return reportInvoiceError(res, "list", error);
    }
  });

  app.get("/api/invoices/:id", requireAuth, async (req: Request, res: Response) => {
    const actor = requireInvoiceActor(req, res);
    if (!actor) return;

    try {
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(invoiceOwnerWhere(req.params.id, actor))
        .limit(1);

      if (!invoice) return res.status(404).json({ error: "Faktura ikke funnet" });

      const lineItems = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, invoice.id))
        .orderBy(invoiceLineItems.displayOrder);

      return res.json({ ...invoice, lineItems });
    } catch (error) {
      return reportInvoiceError(res, "read", error);
    }
  });

  app.post("/api/invoices/generate", requireAuth, async (req: Request, res: Response) => {
    const actor = requireInvoiceActor(req, res);
    if (!actor) return;

    try {
      const requestedUserId = String(req.body?.userId ?? "").trim();
      if (requestedUserId && requestedUserId !== actor.id) {
        return res.status(403).json({ error: "Kan ikke opprette faktura for en annen bruker" });
      }

      const clientName = optionalText(req.body?.clientName, 200);
      const clientOrgNumber = optionalText(req.body?.clientOrgNumber ?? req.body?.clientOrg, 50);
      const clientEmail = optionalText(req.body?.clientEmail, 320);
      const clientAddress = optionalText(req.body?.clientAddress, 2000);
      const notes = optionalText(req.body?.notes, 5000);
      const periodStart = req.body?.periodStart ?? req.body?.startDate;
      const periodEnd = req.body?.periodEnd ?? req.body?.endDate;
      const dueDateInput = req.body?.dueDate;

      if (!clientName || !isIsoDate(periodStart) || !isIsoDate(periodEnd)) {
        return res.status(400).json({ error: "Kundenavn og gyldig periode er påkrevd" });
      }
      if (periodStart > periodEnd) {
        return res.status(400).json({ error: "Periodestart kan ikke være etter periodeslutt" });
      }
      if (dueDateInput != null && !isIsoDate(dueDateInput)) {
        return res.status(400).json({ error: "Ugyldig forfallsdato" });
      }

      const requestedTaxRate = finiteNumber(req.body?.taxRate);
      const taxRate = requestedTaxRate ?? 25;
      if (taxRate < 0 || taxRate > 100) {
        return res.status(400).json({ error: "MVA-sats må være mellom 0 og 100" });
      }

      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, actor.id))
        .limit(1);

      const requestedHourlyRate = finiteNumber(req.body?.hourlyRate);
      const settingsHourlyRate = finiteNumber(settings?.hourlyRate);
      const hourlyRate = requestedHourlyRate ?? settingsHourlyRate ?? 500;
      if (hourlyRate <= 0 || hourlyRate > 1_000_000) {
        return res.status(400).json({ error: "Ugyldig timepris" });
      }

      const entries = await db
        .select()
        .from(logRow)
        .where(and(
          eq(logRow.vendorId, actor.vendorId),
          eq(logRow.userId, actor.id),
          between(logRow.date, periodStart, periodEnd),
        ))
        .orderBy(logRow.date);

      const groupedEntries: Record<string, { hours: number; description: string }> = {};
      for (const entry of entries) {
        const key = entry.project || entry.activity || "Generelt arbeid";
        if (!groupedEntries[key]) groupedEntries[key] = { hours: 0, description: key };
        if (!entry.startTime || !entry.endTime) continue;

        const [startH, startM] = entry.startTime.split(":").map(Number);
        const [endH, endM] = entry.endTime.split(":").map(Number);
        let minutes = endH * 60 + endM - (startH * 60 + startM);
        if (minutes < 0) minutes += 24 * 60;
        const breakHours = finiteNumber(entry.breakHours) ?? 0;
        groupedEntries[key].hours += Math.max(0, minutes / 60 - breakHours);
      }

      let subtotal = 0;
      const lineItemsData = Object.values(groupedEntries).map((item, index) => {
        const roundedHours = Math.round(item.hours * 100) / 100;
        const amount = Math.round(roundedHours * hourlyRate * 100) / 100;
        subtotal += amount;
        return {
          description: item.description,
          quantity: roundedHours.toFixed(2),
          unitPrice: hourlyRate.toFixed(2),
          amount: amount.toFixed(2),
          displayOrder: index,
        };
      });

      const taxAmount = Math.round(subtotal * taxRate) / 100;
      const totalAmount = subtotal + taxAmount;
      const invoiceDate = format(new Date(), "yyyy-MM-dd");
      const dueDate = dueDateInput ?? format(addDays(new Date(), 14), "yyyy-MM-dd");
      const invoiceNumber = `INV-${format(new Date(), "yyyyMMdd")}-${randomBytes(4).toString("hex").toUpperCase()}`;

      const result = await db.transaction(async (tx) => {
        const [invoice] = await tx
          .insert(invoices)
          .values({
            vendorId: actor.vendorId,
            userId: actor.id,
            invoiceNumber,
            clientName,
            clientOrgNumber,
            clientEmail,
            clientAddress,
            invoiceDate,
            dueDate,
            periodStart,
            periodEnd,
            subtotal: subtotal.toFixed(2),
            taxRate: taxRate.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            totalAmount: totalAmount.toFixed(2),
            currency: "NOK",
            status: "draft",
            notes,
          })
          .returning();

        const lineItems = lineItemsData.length
          ? await tx
              .insert(invoiceLineItems)
              .values(lineItemsData.map((item) => ({ invoiceId: invoice.id, ...item })))
              .returning()
          : [];

        return { ...invoice, lineItems };
      });

      return res.status(201).json(result);
    } catch (error) {
      return reportInvoiceError(res, "generate", error);
    }
  });

  app.patch("/api/invoices/:id", requireAuth, async (req: Request, res: Response) => {
    const actor = requireInvoiceActor(req, res);
    if (!actor) return;

    try {
      if (req.body?.userId != null || req.body?.vendorId != null || req.body?.vendor_id != null) {
        return res.status(403).json({ error: "Eierskap kan ikke endres" });
      }

      const updates: Record<string, unknown> = {};
      if (req.body?.status != null) {
        const status = String(req.body.status);
        if (!INVOICE_STATUSES.has(status)) {
          return res.status(400).json({ error: "Ugyldig fakturastatus" });
        }
        updates.status = status;
      }
      if (req.body?.dueDate != null) {
        if (!isIsoDate(req.body.dueDate)) {
          return res.status(400).json({ error: "Ugyldig forfallsdato" });
        }
        updates.dueDate = req.body.dueDate;
      }
      if (req.body?.clientName != null) {
        const clientName = optionalText(req.body.clientName, 200);
        if (!clientName) return res.status(400).json({ error: "Kundenavn kan ikke være tomt" });
        updates.clientName = clientName;
      }
      if (req.body?.clientOrgNumber !== undefined || req.body?.clientOrg !== undefined) {
        updates.clientOrgNumber = optionalText(req.body.clientOrgNumber ?? req.body.clientOrg, 50);
      }
      if (req.body?.clientEmail !== undefined) updates.clientEmail = optionalText(req.body.clientEmail, 320);
      if (req.body?.clientAddress !== undefined) updates.clientAddress = optionalText(req.body.clientAddress, 2000);
      if (req.body?.notes !== undefined) updates.notes = optionalText(req.body.notes, 5000);

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Ingen tillatte felt å oppdatere" });
      }

      const [updated] = await db
        .update(invoices)
        .set({ ...updates, updatedAt: new Date() })
        .where(invoiceOwnerWhere(req.params.id, actor))
        .returning();

      if (!updated) return res.status(404).json({ error: "Faktura ikke funnet" });
      return res.json(updated);
    } catch (error) {
      return reportInvoiceError(res, "update", error);
    }
  });

  app.delete("/api/invoices/:id", requireAuth, async (req: Request, res: Response) => {
    const actor = requireInvoiceActor(req, res);
    if (!actor) return;

    try {
      const [deleted] = await db
        .delete(invoices)
        .where(invoiceOwnerWhere(req.params.id, actor))
        .returning({ id: invoices.id });

      if (!deleted) return res.status(404).json({ error: "Faktura ikke funnet" });
      return res.json({ success: true });
    } catch (error) {
      return reportInvoiceError(res, "delete", error);
    }
  });

  app.get("/api/invoices/:id/pdf", requireAuth, async (req: Request, res: Response) => {
    const actor = requireInvoiceActor(req, res);
    if (!actor) return;

    try {
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(invoiceOwnerWhere(req.params.id, actor))
        .limit(1);

      if (!invoice) return res.status(404).json({ error: "Faktura ikke funnet" });

      const lineItems = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, invoice.id))
        .orderBy(invoiceLineItems.displayOrder);
      const pdf = await generateInvoicePdf(invoice, lineItems);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="faktura-${invoice.id}.pdf"`);
      return res.send(pdf);
    } catch (error) {
      return reportInvoiceError(res, "pdf", error);
    }
  });
}

function displayDate(value: string | Date): string {
  const date = value instanceof Date ? value : parseISO(String(value));
  return format(date, "dd.MM.yyyy", { locale: nb });
}

function money(value: unknown): string {
  const parsed = Number(value ?? 0);
  return `${(Number.isFinite(parsed) ? parsed : 0).toFixed(2)} kr`;
}

export function generateInvoicePdf(invoice: any, lineItems: any[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Faktura ${invoice.invoiceNumber}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(22).fillColor("#0066cc").text("FAKTURA", { align: "right" });
    doc.moveDown(0.5).fontSize(11).fillColor("#222222");
    doc.text(`Fakturanummer: ${String(invoice.invoiceNumber)}`, { align: "right" });
    doc.text(`Dato: ${displayDate(invoice.invoiceDate)}`, { align: "right" });
    doc.text(`Forfall: ${displayDate(invoice.dueDate)}`, { align: "right" });

    doc.moveUp(3).fontSize(18).fillColor("#0066cc").text("Tidum");
    doc.fontSize(10).fillColor("#333333").text("Timeføringssystem").text("kontakt@tidsflyt.no");
    doc.moveDown(2);

    doc.fontSize(11).fillColor("#222222").text("Faktura til", { underline: true });
    doc.fontSize(10).text(String(invoice.clientName));
    if (invoice.clientOrgNumber) doc.text(`Org.nr: ${String(invoice.clientOrgNumber)}`);
    if (invoice.clientAddress) doc.text(String(invoice.clientAddress));
    if (invoice.clientEmail) doc.text(String(invoice.clientEmail));
    doc.moveDown();
    doc.text(`Periode: ${displayDate(invoice.periodStart)} – ${displayDate(invoice.periodEnd)}`);
    doc.moveDown();

    const startY = doc.y;
    const columns = { description: 50, quantity: 330, unitPrice: 405, amount: 490 };
    doc.rect(50, startY, 495, 22).fill("#0066cc");
    doc.fillColor("#ffffff").fontSize(9);
    doc.text("Beskrivelse", columns.description + 5, startY + 7, { width: 270 });
    doc.text("Timer", columns.quantity, startY + 7, { width: 60, align: "right" });
    doc.text("Timepris", columns.unitPrice, startY + 7, { width: 70, align: "right" });
    doc.text("Beløp", columns.amount, startY + 7, { width: 50, align: "right" });

    let rowY = startY + 30;
    doc.fillColor("#222222");
    for (const item of lineItems) {
      if (rowY > 700) {
        doc.addPage();
        rowY = 60;
      }
      doc.text(String(item.description), columns.description + 5, rowY, { width: 270 });
      doc.text(Number(item.quantity ?? 0).toFixed(2), columns.quantity, rowY, { width: 60, align: "right" });
      doc.text(money(item.unitPrice), columns.unitPrice, rowY, { width: 70, align: "right" });
      doc.text(money(item.amount), columns.amount, rowY, { width: 50, align: "right" });
      rowY += 22;
      doc.moveTo(50, rowY - 6).lineTo(545, rowY - 6).strokeColor("#dddddd").stroke();
    }

    rowY += 10;
    doc.fontSize(10).fillColor("#222222");
    doc.text(`Subtotal: ${money(invoice.subtotal)}`, 365, rowY, { width: 175, align: "right" });
    rowY += 18;
    doc.text(`MVA (${Number(invoice.taxRate ?? 0).toFixed(0)} %): ${money(invoice.taxAmount)}`, 365, rowY, { width: 175, align: "right" });
    rowY += 22;
    doc.fontSize(12).font("Helvetica-Bold").text(`Total: ${money(invoice.totalAmount)}`, 365, rowY, { width: 175, align: "right" });
    doc.font("Helvetica");

    if (invoice.notes) {
      doc.moveDown(3).fontSize(10).text("Merknader", { underline: true });
      doc.text(String(invoice.notes));
    }

    doc.fontSize(8).fillColor("#777777").text(
      `Generert ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: nb })} | Tidum`,
      50,
      780,
      { width: 495, align: "center" },
    );
    doc.end();
  });
}
