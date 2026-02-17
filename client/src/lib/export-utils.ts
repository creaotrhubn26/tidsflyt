import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface ExportOptions {
  filename: string;
  title?: string;
  subtitle?: string;
  includeBranding?: boolean;
  includeLogo?: boolean;
}

interface ExcelRow {
  [key: string]: string | number | boolean | Date | null | undefined;
}

/**
 * Export data to CSV format
 */
export function exportToCSV(
  data: ExcelRow[],
  filename: string = "export.csv"
) {
  if (data.length === 0) {
    console.warn("No data to export");
    return;
  }

  // Get headers from first row
  const headers = Object.keys(data[0]);

  // Create CSV content
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma
          if (value === null || value === undefined) return "";
          const stringValue = String(value);
          return stringValue.includes(",") || stringValue.includes('"')
            ? `"${stringValue.replace(/"/g, '""')}"`
            : stringValue;
        })
        .join(",")
    ),
  ].join("\n");

  downloadFile(csvContent, filename, "text/csv");
}

/**
 * Export data to Excel format with basic formatting
 */
export function exportToExcel(
  data: ExcelRow[],
  filename: string = "export.xlsx",
  sheetName: string = "Data"
) {
  // This is a simplified version that exports to XLSX format
  // For production, consider using libraries like "xlsx" or "exceljs"
  // For now, we'll export to CSV and suggest converting to XLSX

  if (data.length === 0) {
    console.warn("No data to export");
    return;
  }

  const headers = Object.keys(data[0]);

  // Create simple HTML table that can be opened in Excel
  let html = `
    <html xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:o="urn:schemas-microsoft-com:office:office">
    <head>
      <meta charset="UTF-8">
      <style>
        table { border-collapse: collapse; }
        th { 
          background-color: #1F6B73; 
          color: white; 
          padding: 10px; 
          border: 1px solid #ddd;
          font-weight: bold;
        }
        td { 
          padding: 8px; 
          border: 1px solid #ddd;
        }
        tr:nth-child(even) { 
          background-color: #f9f9f9; 
        }
      </style>
    </head>
    <body>
      <table>
        <thead>
          <tr>
            ${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              (row) => `
            <tr>
              ${headers.map((h) => `<td>${escapeHtml(String(row[h] || ""))}</td>`).join("")}
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </body>
    </html>
  `.trim();

  downloadFile(html, filename.replace(".xlsx", ".xls"), "application/vnd.ms-excel");
}

/**
 * Export data to PDF format (requires server-side processing)
 * This function creates a formatted HTML that can be printed to PDF
 */
export async function exportToPDF(
  data: ExcelRow[],
  options: ExportOptions = { filename: "export.pdf" }
) {
  const {
    filename,
    title = "Rapport",
    subtitle,
    includeBranding = true,
    includeLogo = true,
  } = options;

  if (data.length === 0) {
    console.warn("No data to export");
    return;
  }

  const headers = Object.keys(data[0]);
  const timestamp = format(new Date(), "d. MMMM yyyy HH:mm", { locale: nb });

  let html = `
    <!DOCTYPE html>
    <html lang="no">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
          color: #333;
          line-height: 1.6;
          background: white;
          padding: 20px;
        }
        .page-break { page-break-after: always; }
        
        .header {
          border-bottom: 3px solid #1F6B73;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .header-branding {
          font-size: 24px;
          font-weight: bold;
          color: #1F6B73;
          margin-bottom: 10px;
        }
        .header-subtitle {
          color: #666;
          font-size: 14px;
          margin-bottom: 10px;
        }
        .header-timestamp {
          font-size: 12px;
          color: #999;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th {
          background-color: #1F6B73;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          border: 1px solid #1F6B73;
          font-size: 12px;
        }
        td {
          padding: 10px 12px;
          border: 1px solid #ddd;
          font-size: 11px;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 10px;
          color: #999;
        }
        @media print {
          body { padding: 0; }
          .page-break { page-break-after: always; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${includeBranding ? `<div class="header-branding">📊 TIDUM</div>` : ""}
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="header-subtitle">${escapeHtml(subtitle)}</div>` : ""}
        <div class="header-timestamp">Generert: ${timestamp}</div>
      </div>

      <table>
        <thead>
          <tr>
            ${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              (row, idx) => `
            <tr${idx > 0 && idx % 20 === 0 ? ' class="page-break"' : ""}>
              ${headers
                .map((h) => {
                  const value = row[h];
                  let formatted = "";
                  if (value instanceof Date) {
                    formatted = format(value, "d.M.yyyy", { locale: nb });
                  } else {
                    formatted = String(value || "");
                  }
                  return `<td>${escapeHtml(formatted)}</td>`;
                })
                .join("")}
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <div class="footer">
        <p>Total rader: ${data.length}</p>
        <p>© ${new Date().getFullYear()} Tidum. Alle rettigheter reservert.</p>
      </div>
    </body>
    </html>
  `.trim();

  // Create blob and download
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Helper function to download file
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Helper function to escape HTML
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Format data for export with proper types and formatting
 */
export function formatExportData<T extends Record<string, any>>(
  items: T[],
  columnMapping?: Record<string, (value: any) => string>
): ExcelRow[] {
  return items.map((item) => {
    const row: ExcelRow = {};

    Object.entries(item).forEach(([key, value]) => {
      if (columnMapping && columnMapping[key]) {
        row[key] = columnMapping[key](value);
      } else if (value instanceof Date) {
        row[key] = format(value, "d.M.yyyy HH:mm", { locale: nb });
      } else if (typeof value === "boolean") {
        row[key] = value ? "Ja" : "Nei";
      } else {
        row[key] = value;
      }
    });

    return row;
  });
}
