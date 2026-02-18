import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { logRow } from '@shared/schema';
import { ExportService } from '../lib/export-service';
import { between, eq, and } from 'drizzle-orm';
import { format } from 'date-fns';

export function registerExportRoutes(app: Express) {
  /**
   * Export time entries as Excel
   * GET /api/export/excel?startDate=2024-01-01&endDate=2024-01-31&userId=default
   */
  app.get('/api/export/excel', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, userId = 'default', includeNotes = 'true' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      // Fetch time entries
      const conditions = [
        between(logRow.date, startDate as string, endDate as string),
      ];

      if (userId && userId !== 'all') {
        conditions.push(eq(logRow.userId, userId as string));
      }

      const entries = await db
        .select()
        .from(logRow)
        .where(and(...conditions))
        .orderBy(logRow.date);

      // Convert to export format
      const exportData = entries.map((entry) => {
        const startTime = entry.startTime || '';
        const endTime = entry.endTime || '';
        const breakHours = parseFloat(entry.breakHours || '0');
        
        // Calculate hours
        let hours = 0;
        if (startTime && endTime) {
          const [startH, startM] = startTime.split(':').map(Number);
          const [endH, endM] = endTime.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          hours = (endMinutes - startMinutes) / 60 - breakHours;
        }

        return {
          id: entry.id,
          date: entry.date?.toString() || '',
          startTime: startTime,
          endTime: endTime,
          breakHours: breakHours,
          activity: entry.activity || '',
          title: entry.title || '',
          project: entry.project || '',
          place: entry.place || '',
          notes: entry.notes || '',
          hours: hours,
        };
      });

      const buffer = await ExportService.generateExcel(exportData, {
        startDate: startDate as string,
        endDate: endDate as string,
        title: 'Timeregistreringer',
        includeNotes: includeNotes === 'true',
      });

      const filename = `timeregistrering_${startDate}_${endDate}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: any) {
      console.error('Excel export error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate Excel file' });
    }
  });

  /**
   * Export time entries as CSV
   * GET /api/export/csv?startDate=2024-01-01&endDate=2024-01-31&userId=default
   */
  app.get('/api/export/csv', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, userId = 'default', includeNotes = 'true' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const conditions = [
        between(logRow.date, startDate as string, endDate as string),
      ];

      if (userId && userId !== 'all') {
        conditions.push(eq(logRow.userId, userId as string));
      }

      const entries = await db
        .select()
        .from(logRow)
        .where(and(...conditions))
        .orderBy(logRow.date);

      const exportData = entries.map((entry) => {
        const startTime = entry.startTime || '';
        const endTime = entry.endTime || '';
        const breakHours = parseFloat(entry.breakHours || '0');
        
        let hours = 0;
        if (startTime && endTime) {
          const [startH, startM] = startTime.split(':').map(Number);
          const [endH, endM] = endTime.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          hours = (endMinutes - startMinutes) / 60 - breakHours;
        }

        return {
          id: entry.id,
          date: entry.date?.toString() || '',
          startTime,
          endTime,
          breakHours,
          activity: entry.activity || '',
          title: entry.title || '',
          project: entry.project || '',
          place: entry.place || '',
          notes: entry.notes || '',
          hours,
        };
      });

      const csv = ExportService.generateCSV(exportData, {
        startDate: startDate as string,
        endDate: endDate as string,
        includeNotes: includeNotes === 'true',
      });

      const filename = `timeregistrering_${startDate}_${endDate}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\uFEFF' + csv); // Add BOM for Excel compatibility
    } catch (error: any) {
      console.error('CSV export error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate CSV file' });
    }
  });

  /**
   * Export time entries as PDF (HTML preview for now, can be converted server-side with puppeteer)
   * GET /api/export/pdf?startDate=2024-01-01&endDate=2024-01-31&userId=default
   */
  app.get('/api/export/pdf', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, userId = 'default', includeNotes = 'true' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const conditions = [
        between(logRow.date, startDate as string, endDate as string),
      ];

      if (userId && userId !== 'all') {
        conditions.push(eq(logRow.userId, userId as string));
      }

      const entries = await db
        .select()
        .from(logRow)
        .where(and(...conditions))
        .orderBy(logRow.date);

      const exportData = entries.map((entry) => {
        const startTime = entry.startTime || '';
        const endTime = entry.endTime || '';
        const breakHours = parseFloat(entry.breakHours || '0');
        
        let hours = 0;
        if (startTime && endTime) {
          const [startH, startM] = startTime.split(':').map(Number);
          const [endH, endM] = endTime.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          hours = (endMinutes - startMinutes) / 60 - breakHours;
        }

        return {
          id: entry.id,
          date: entry.date?.toString() || '',
          startTime,
          endTime,
          breakHours,
          activity: entry.activity || '',
          title: entry.title || '',
          project: entry.project || '',
          place: entry.place || '',
          notes: entry.notes || '',
          hours,
        };
      });

      const html = ExportService.generatePDFHTML(exportData, {
        startDate: startDate as string,
        endDate: endDate as string,
        title: 'Timerapport',
        includeNotes: includeNotes === 'true',
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error: any) {
      console.error('PDF export error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate PDF' });
    }
  });
}
