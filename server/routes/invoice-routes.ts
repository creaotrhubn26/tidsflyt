import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { invoices, invoiceLineItems, logRow, userSettings } from '@shared/schema';
import { eq, and, between, desc } from 'drizzle-orm';
import { format, addDays } from 'date-fns';
import { nb } from 'date-fns/locale';
import { ExportService } from '../lib/export-service';
import { requireAuth } from '../middleware/auth';

export function registerInvoiceRoutes(app: Express) {
  /**
   * Get invoices for a user
   * GET /api/invoices?userId=default&status=draft
   */
  app.get('/api/invoices', requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId, status } = req.query;

      const conditions = [];
      if (userId) {
        conditions.push(eq(invoices.userId, userId as string));
      }
      if (status) {
        conditions.push(eq(invoices.status, status as string));
      }

      const results = await db
        .select()
        .from(invoices)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(invoices.invoiceDate));

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get a single invoice with line items
   * GET /api/invoices/:id
   */
  app.get('/api/invoices/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const lineItems = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, id))
        .orderBy(invoiceLineItems.displayOrder);

      res.json({ ...invoice, lineItems });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Generate invoice from time entries
   * POST /api/invoices/generate
   */
  app.post('/api/invoices/generate', requireAuth, async (req: Request, res: Response) => {
    try {
      const {
        userId,
        clientName,
        clientEmail,
        clientAddress,
        periodStart,
        periodEnd,
        dueDate,
        taxRate = 25,
        notes,
      } = req.body;

      if (!userId || !clientName || !periodStart || !periodEnd) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Get user settings for hourly rate
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

      const hourlyRate = parseFloat(settings?.hourlyRate || '500');

      // Get time entries for the period
      const entries = await db
        .select()
        .from(logRow)
        .where(
          and(
            eq(logRow.userId, userId),
            between(logRow.date, periodStart, periodEnd)
          )
        )
        .orderBy(logRow.date);

      // Group entries by project/activity
      const groupedEntries: Record<string, { hours: number; description: string }> = {};

      entries.forEach((entry) => {
        const key = entry.project || entry.activity || 'Generelt arbeid';
        if (!groupedEntries[key]) {
          groupedEntries[key] = { hours: 0, description: key };
        }

        // Calculate hours
        if (entry.startTime && entry.endTime) {
          const [startH, startM] = entry.startTime.split(':').map(Number);
          const [endH, endM] = entry.endTime.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          const breakHours = parseFloat(entry.breakHours || '0');
          const hours = (endMinutes - startMinutes) / 60 - breakHours;
          groupedEntries[key].hours += hours;
        }
      });

      // Generate invoice number
      const invoiceDate = format(new Date(), 'yyyy-MM-dd');
      const invoiceNumber = `INV-${format(new Date(), 'yyyyMMdd')}-${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, '0')}`;

      // Calculate totals
      let subtotal = 0;
      const lineItemsData = Object.values(groupedEntries).map((item, index) => {
        const amount = item.hours * hourlyRate;
        subtotal += amount;
        return {
          description: item.description,
          quantity: item.hours.toFixed(2),
          unitPrice: hourlyRate.toFixed(2),
          amount: amount.toFixed(2),
          displayOrder: index,
        };
      });

      const taxAmount = (subtotal * parseFloat(taxRate.toString())) / 100;
      const totalAmount = subtotal + taxAmount;

      // Create invoice
      const [invoice] = await db
        .insert(invoices)
        .values({
          invoiceNumber,
          userId,
          clientName,
          clientEmail,
          clientAddress,
          invoiceDate,
          dueDate: dueDate || format(addDays(new Date(), 14), 'yyyy-MM-dd'),
          periodStart,
          periodEnd,
          subtotal: subtotal.toFixed(2),
          taxRate: taxRate.toString(),
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          currency: 'NOK',
          status: 'draft',
          notes,
        })
        .returning();

      // Create line items
      const lineItems = await db
        .insert(invoiceLineItems)
        .values(
          lineItemsData.map((item) => ({
            invoiceId: invoice.id,
            ...item,
          }))
        )
        .returning();

      res.json({ ...invoice, lineItems });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Update invoice
   * PATCH /api/invoices/:id
   */
  app.patch('/api/invoices/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const [updated] = await db
        .update(invoices)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Delete invoice
   * DELETE /api/invoices/:id
   */
  app.delete('/api/invoices/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Delete line items first
      await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

      // Delete invoice
      await db.delete(invoices).where(eq(invoices.id, id));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Export invoice as PDF
   * GET /api/invoices/:id/pdf
   */
  app.get('/api/invoices/:id/pdf', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const lineItems = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, id))
        .orderBy(invoiceLineItems.displayOrder);

      // Generate HTML for invoice
      const html = generateInvoiceHTML(invoice, lineItems);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

/**
 * Generate invoice HTML template
 */
function generateInvoiceHTML(invoice: any, lineItems: any[]): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Faktura ${invoice.invoiceNumber}</title>
  <style>
    @page { margin: 20mm; }
    body { 
      font-family: Arial, sans-serif; 
      font-size: 10pt; 
      color: #333;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #0066cc;
    }
    .company-info h1 {
      color: #0066cc;
      margin: 0 0 10px 0;
      font-size: 24pt;
    }
    .invoice-details {
      text-align: right;
    }
    .invoice-number {
      font-size: 18pt;
      font-weight: bold;
      color: #0066cc;
      margin: 0;
    }
    .client-info {
      background: #f5f5f5;
      padding: 20px;
      border-radius: 4px;
      margin-bottom: 30px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
    }
    th {
      background-color: #0066cc;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: bold;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #ddd;
    }
    .text-right { text-align: right; }
    .totals {
      margin-left: auto;
      width: 300px;
      margin-top: 20px;
    }
    .totals table {
      margin: 0;
    }
    .totals td {
      border: none;
      padding: 5px 10px;
    }
    .totals .total-row {
      font-weight: bold;
      font-size: 12pt;
      background: #f0f0f0;
    }
    .payment-info {
      margin-top: 40px;
      padding: 20px;
      background: #f9f9f9;
      border-left: 4px solid #0066cc;
    }
    .notes {
      margin-top: 30px;
      font-size: 9pt;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      <h1>Smart Timing</h1>
      <p>Timeføringssystem<br>
      Org.nr: 123 456 789<br>
      kontakt@tidsflyt.no</p>
    </div>
    <div class="invoice-details">
      <p class="invoice-number">FAKTURA</p>
      <p><strong>${invoice.invoiceNumber}</strong></p>
      <p>Dato: ${format(new Date(invoice.invoiceDate), 'dd.MM.yyyy', { locale: nb })}<br>
      Forfall: ${format(new Date(invoice.dueDate), 'dd.MM.yyyy', { locale: nb })}</p>
    </div>
  </div>

  <div class="client-info">
    <strong>Faktura til:</strong><br>
    ${invoice.clientName}<br>
    ${invoice.clientAddress ? invoice.clientAddress.replace(/\n/g, '<br>') : ''}
    ${invoice.clientEmail ? `<br>${invoice.clientEmail}` : ''}
  </div>

  <p><strong>Periode:</strong> ${format(new Date(invoice.periodStart), 'dd.MM.yyyy', { locale: nb })} - ${format(
    new Date(invoice.periodEnd),
    'dd.MM.yyyy',
    { locale: nb }
  )}</p>

  <table>
    <thead>
      <tr>
        <th>Beskrivelse</th>
        <th class="text-right">Antall timer</th>
        <th class="text-right">Timepris</th>
        <th class="text-right">Beløp</th>
      </tr>
    </thead>
    <tbody>
      ${lineItems
        .map(
          (item) => `
        <tr>
          <td>${item.description}</td>
          <td class="text-right">${parseFloat(item.quantity).toFixed(2)}</td>
          <td class="text-right">${parseFloat(item.unitPrice).toFixed(2)} kr</td>
          <td class="text-right">${parseFloat(item.amount).toFixed(2)} kr</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td>Subtotal:</td>
        <td class="text-right">${parseFloat(invoice.subtotal).toFixed(2)} kr</td>
      </tr>
      <tr>
        <td>MVA (${parseFloat(invoice.taxRate).toFixed(0)}%):</td>
        <td class="text-right">${parseFloat(invoice.taxAmount).toFixed(2)} kr</td>
      </tr>
      <tr class="total-row">
        <td>Total å betale:</td>
        <td class="text-right">${parseFloat(invoice.totalAmount).toFixed(2)} kr</td>
      </tr>
    </table>
  </div>

  <div class="payment-info">
    <strong>Betalingsinformasjon:</strong><br>
    Kontonummer: 1234 56 78901<br>
    KID: ${invoice.invoiceNumber}<br>
    Betalingsfrist: ${format(new Date(invoice.dueDate), 'dd.MM.yyyy', { locale: nb })}
  </div>

  ${
    invoice.notes
      ? `
  <div class="notes">
    <strong>Merknader:</strong><br>
    ${invoice.notes}
  </div>
  `
      : ''
  }

  <div class="notes" style="margin-top: 50px; text-align: center; border-top: 1px solid #ddd; padding-top: 20px;">
    Generert ${format(new Date(), 'dd.MM.yyyy HH:mm', { locale: nb })} | Smart Timing
  </div>
</body>
</html>
  `.trim();
}
