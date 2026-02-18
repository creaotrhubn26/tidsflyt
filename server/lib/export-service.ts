import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

interface TimeEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  breakHours: number;
  activity: string;
  title?: string;
  project?: string;
  place?: string;
  notes?: string;
  hours: number;
  userName?: string;
  department?: string;
}

interface ExportOptions {
  startDate: string;
  endDate: string;
  title?: string;
  includeNotes?: boolean;
}

export class ExportService {
  /**
   * Generate Excel file from time entries
   */
  static async generateExcel(entries: TimeEntry[], options: ExportOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Timeregistreringer');

    // Set column widths
    worksheet.columns = [
      { header: 'Dato', key: 'date', width: 12 },
      { header: 'Inn', key: 'startTime', width: 8 },
      { header: 'Ut', key: 'endTime', width: 8 },
      { header: 'Pause', key: 'breakHours', width: 8 },
      { header: 'Timer', key: 'hours', width: 8 },
      { header: 'Aktivitet', key: 'activity', width: 15 },
      { header: 'Tittel', key: 'title', width: 20 },
      { header: 'Prosjekt', key: 'project', width: 15 },
      { header: 'Sted', key: 'place', width: 15 },
      ...(options.includeNotes ? [{ header: 'Notater', key: 'notes', width: 30 }] : []),
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0066CC' },
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data rows
    entries.forEach((entry) => {
      worksheet.addRow({
        date: format(new Date(entry.date), 'dd.MM.yyyy', { locale: nb }),
        startTime: entry.startTime || '-',
        endTime: entry.endTime || '-',
        breakHours: entry.breakHours || 0,
        hours: entry.hours,
        activity: entry.activity || '-',
        title: entry.title || '-',
        project: entry.project || '-',
        place: entry.place || '-',
        ...(options.includeNotes ? { notes: entry.notes || '-' } : {}),
      });
    });

    // Add totals row
    const totalRow = worksheet.addRow({
      date: 'TOTALT',
      hours: { formula: `SUM(E2:E${entries.length + 1})` },
    });
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Apply borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generate CSV file from time entries
   */
  static generateCSV(entries: TimeEntry[], options: ExportOptions): string {
    const headers = [
      'Dato',
      'Inn',
      'Ut',
      'Pause',
      'Timer',
      'Aktivitet',
      'Tittel',
      'Prosjekt',
      'Sted',
      ...(options.includeNotes ? ['Notater'] : []),
    ];

    const rows = entries.map((entry) => [
      format(new Date(entry.date), 'dd.MM.yyyy', { locale: nb }),
      entry.startTime || '-',
      entry.endTime || '-',
      entry.breakHours || 0,
      entry.hours,
      entry.activity || '-',
      entry.title || '-',
      entry.project || '-',
      entry.place || '-',
      ...(options.includeNotes ? [entry.notes || '-'] : []),
    ]);

    // Add totals
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    rows.push(['TOTALT', '', '', '', totalHours.toString(), '', '', '', '', ...(options.includeNotes ? [''] : [])]);

    // Escape CSV values
    const escapeCsv = (value: any): string => {
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [headers.map(escapeCsv).join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');

    return csv;
  }

  /**
   * Generate PDF report (using HTML template that can be converted server-side)
   */
  static generatePDFHTML(entries: TimeEntry[], options: ExportOptions): string {
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const period = `${format(new Date(options.startDate), 'dd.MM.yyyy')} - ${format(
      new Date(options.endDate),
      'dd.MM.yyyy'
    )}`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Timerapport - ${period}</title>
  <style>
    @page { margin: 20mm; }
    body { 
      font-family: Arial, sans-serif; 
      font-size: 10pt; 
      color: #333;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #0066cc;
    }
    h1 { color: #0066cc; margin: 0; font-size: 18pt; }
    .period { color: #666; font-size: 11pt; margin-top: 5px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      font-size: 9pt;
    }
    th {
      background-color: #0066cc;
      color: white;
      padding: 8px;
      text-align: left;
      font-weight: bold;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #ddd;
    }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .totals {
      font-weight: bold;
      background-color: #e0e0e0 !important;
      border-top: 2px solid #0066cc;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 8pt;
      color: #999;
      border-top: 1px solid #ddd;
      padding-top: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${options.title || 'Timerapport'}</h1>
    <div class="period">Periode: ${period}</div>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Dato</th>
        <th>Inn</th>
        <th>Ut</th>
        <th>Pause</th>
        <th>Timer</th>
        <th>Aktivitet</th>
        <th>Tittel</th>
        <th>Prosjekt</th>
        ${options.includeNotes ? '<th>Notater</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${entries
        .map(
          (entry) => `
        <tr>
          <td>${format(new Date(entry.date), 'dd.MM.yyyy', { locale: nb })}</td>
          <td>${entry.startTime || '-'}</td>
          <td>${entry.endTime || '-'}</td>
          <td>${entry.breakHours || 0}</td>
          <td>${entry.hours.toFixed(2)}</td>
          <td>${entry.activity || '-'}</td>
          <td>${entry.title || '-'}</td>
          <td>${entry.project || '-'}</td>
          ${options.includeNotes ? `<td>${entry.notes || '-'}</td>` : ''}
        </tr>
      `
        )
        .join('')}
      <tr class="totals">
        <td colspan="4">TOTALT</td>
        <td>${totalHours.toFixed(2)}</td>
        <td colspan="${options.includeNotes ? 4 : 3}"></td>
      </tr>
    </tbody>
  </table>
  
  <div class="footer">
    Generert ${format(new Date(), 'dd.MM.yyyy HH:mm', { locale: nb })} | Smart Timing
  </div>
</body>
</html>
    `.trim();
  }
}
