import { useState } from "react";
import {
  Download,
  FileText,
  FileSpreadsheet,
  FileJson,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { CaseReport } from "@shared/schema";

interface CaseReportExportProps {
  reports: CaseReport[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = "pdf" | "csv" | "excel" | "json";
type ExportFields = {
  caseId: boolean;
  month: boolean;
  status: boolean;
  background: boolean;
  actions: boolean;
  progress: boolean;
  challenges: boolean;
  factors: boolean;
  assessment: boolean;
  recommendations: boolean;
  notes: boolean;
  createdAt: boolean;
  updatedAt: boolean;
  approvedAt: boolean;
  approvedBy: boolean;
};

const fieldLabels: Record<keyof ExportFields, string> = {
  caseId: "Saksnummer",
  month: "Måned",
  status: "Status",
  background: "Bakgrunn",
  actions: "Tiltak",
  progress: "Fremdrift",
  challenges: "Utfordringer",
  factors: "Faktorer",
  assessment: "Vurdering",
  recommendations: "Anbefalinger",
  notes: "Notater",
  createdAt: "Opprettet dato",
  updatedAt: "Sist endret",
  approvedAt: "Godkjent dato",
  approvedBy: "Godkjent av",
};

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  pending: "Til behandling",
  submitted: "Sendt inn",
  needs_revision: "Trenger revisjon",
  approved: "Godkjent",
  rejected: "Avslått",
};

export function CaseReportExport({ reports, open, onOpenChange }: CaseReportExportProps) {
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [fields, setFields] = useState<ExportFields>({
    caseId: true,
    month: true,
    status: true,
    background: true,
    actions: true,
    progress: true,
    challenges: true,
    factors: true,
    assessment: true,
    recommendations: true,
    notes: false,
    createdAt: true,
    updatedAt: false,
    approvedAt: true,
    approvedBy: true,
  });
  const [includeTidumBranding, setIncludeTidumBranding] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const toggleField = (field: keyof ExportFields) => {
    setFields({ ...fields, [field]: !fields[field] });
  };

  const selectAllFields = () => {
    const allSelected = Object.fromEntries(
      Object.keys(fields).map((key) => [key, true])
    ) as ExportFields;
    setFields(allSelected);
  };

  const deselectAllFields = () => {
    const allDeselected = Object.fromEntries(
      Object.keys(fields).map((key) => [key, false])
    ) as ExportFields;
    setFields(allDeselected);
  };

  const generateCSV = (data: CaseReport[]): string => {
    const selectedFields = Object.entries(fields)
      .filter(([_, isSelected]) => isSelected)
      .map(([field]) => field as keyof ExportFields);

    // Header row
    const headers = selectedFields.map((field) => fieldLabels[field]).join(",");

    // Data rows
    const rows = data.map((report) => {
      return selectedFields
        .map((field) => {
          let value = report[field as keyof CaseReport];
          
          // Format dates
          if (field === "createdAt" || field === "updatedAt" || field === "approvedAt") {
            value = value ? format(new Date(value as string), "dd.MM.yyyy HH:mm", { locale: nb }) : "";
          }
          
          // Format status
          if (field === "status") {
            value = statusLabels[value as string] || value;
          }

          // Escape CSV special characters
          if (typeof value === "string") {
            value = value.replace(/"/g, '""');
            if (value.includes(",") || value.includes("\n") || value.includes('"')) {
              value = `"${value}"`;
            }
          }

          return value || "";
        })
        .join(",");
    });

    return [headers, ...rows].join("\n");
  };

  const generateJSON = (data: CaseReport[]): string => {
    const selectedFields = Object.entries(fields)
      .filter(([_, isSelected]) => isSelected)
      .map(([field]) => field as keyof ExportFields);

    const filteredData = data.map((report) => {
      const filtered: any = {};
      selectedFields.forEach((field) => {
        filtered[field] = report[field as keyof CaseReport];
      });
      return filtered;
    });

    return JSON.stringify(filteredData, null, 2);
  };

  const generatePDF = async (data: CaseReport[]): Promise<void> => {
    // In a production app, use a library like jsPDF or react-pdf
    // For now, we'll create a printable HTML document
    
    const selectedFields = Object.entries(fields)
      .filter(([_, isSelected]) => isSelected)
      .map(([field]) => field as keyof ExportFields);

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Tidum Saksrapporter</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #1e293b;
            max-width: 210mm;
            margin: 0 auto;
            padding: 20mm;
          }
          ${includeTidumBranding ? `
          .header {
            border-bottom: 3px solid #0ea5e9;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .logo {
            color: #0ea5e9;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 10px;
          }
          ` : ''}
          .report {
            page-break-inside: avoid;
            margin-bottom: 40px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
          }
          .report-header {
            background: #f8fafc;
            padding: 15px;
            margin: -20px -20px 20px -20px;
            border-radius: 8px 8px 0 0;
            border-bottom: 2px solid #e2e8f0;
          }
          .report-title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 5px;
          }
          .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 500;
          }
          .status-approved { background: #dcfce7; color: #166534; }
          .status-pending { background: #fef3c7; color: #92400e; }
          .status-rejected { background: #fee2e2; color: #991b1b; }
          .status-draft { background: #f1f5f9; color: #475569; }
          .status-needs_revision { background: #fed7aa; color: #9a3412; }
          .field {
            margin-bottom: 20px;
          }
          .field-label {
            font-weight: 600;
            color: #475569;
            margin-bottom: 5px;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 0.5px;
          }
          .field-value {
            color: #1e293b;
            white-space: pre-wrap;
          }
          .meta {
            display: flex;
            gap: 20px;
            font-size: 13px;
            color: #64748b;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #e2e8f0;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            text-align: center;
            color: #64748b;
            font-size: 12px;
          }
          @media print {
            body { padding: 0; }
            .report { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
    `;

    if (includeTidumBranding) {
      html += `
        <div class="header">
          <div class="logo">Tidum</div>
          <div style="color: #64748b;">Saksrapporter - Generert ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm", { locale: nb })}</div>
        </div>
      `;
    }

    data.forEach((report) => {
      const statusClass = `status-${report.status}`;
      
      html += `
        <div class="report">
          <div class="report-header">
            <div class="report-title">Sak ${report.caseId} - ${report.month}</div>
            <span class="status ${statusClass}">${statusLabels[report.status] || report.status}</span>
          </div>
      `;

      selectedFields.forEach((field) => {
        if (field === "caseId" || field === "month" || field === "status") return; // Already in header
        
        let value = report[field as keyof CaseReport];
        
        if (!value) return;

        if (field === "createdAt" || field === "updatedAt" || field === "approvedAt") {
          value = format(new Date(value as string), "dd.MM.yyyy 'kl.' HH:mm", { locale: nb });
        }

        html += `
          <div class="field">
            <div class="field-label">${fieldLabels[field]}</div>
            <div class="field-value">${value}</div>
          </div>
        `;
      });

      html += `
          <div class="meta">
            ${report.createdAt ? `<span>Opprettet: ${format(new Date(report.createdAt), "dd.MM.yyyy", { locale: nb })}</span>` : ''}
            ${report.approvedAt ? `<span>Godkjent: ${format(new Date(report.approvedAt), "dd.MM.yyyy", { locale: nb })}</span>` : ''}
            ${report.approvedBy ? `<span>Godkjent av: ${report.approvedBy}</span>` : ''}
          </div>
        </div>
      `;
    });

    if (includeTidumBranding) {
      html += `
        <div class="footer">
          <strong>Tidum</strong> - Profesjonell saksrapportering<br>
          Dette dokumentet inneholder ${data.length} rapport${data.length !== 1 ? 'er' : ''}
        </div>
      `;
    }

    html += `
      </body>
      </html>
    `;

    // Open in new window for printing
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      let content: string;
      let filename: string;
      let mimeType: string;

      const timestamp = format(new Date(), "yyyyMMdd_HHmmss");

      switch (exportFormat) {
        case "csv":
          content = generateCSV(reports);
          filename = `tidum_rapporter_${timestamp}.csv`;
          mimeType = "text/csv;charset=utf-8;";
          break;

        case "json":
          content = generateJSON(reports);
          filename = `tidum_rapporter_${timestamp}.json`;
          mimeType = "application/json;charset=utf-8;";
          break;

        case "pdf":
          await generatePDF(reports);
          setIsExporting(false);
          onOpenChange(false);
          return;

        case "excel":
          // For Excel, we'll use CSV with .xlsx extension
          // In production, use a library like xlsx or exceljs
          content = generateCSV(reports);
          filename = `tidum_rapporter_${timestamp}.xlsx`;
          mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;";
          break;

        default:
          throw new Error("Ukjent format");
      }

      // Create download link
      const blob = new Blob(["\ufeff" + content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setIsExporting(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Export error:", error);
      setIsExporting(false);
      alert("Feil under eksport. Vennligst prøv igjen.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Eksporter rapporter</DialogTitle>
          <DialogDescription>
            Eksporter {reports.length} rapport{reports.length !== 1 ? "er" : ""} til ønsket format
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div className="space-y-2">
            <Label>Velg format</Label>
            <div className="grid grid-cols-2 gap-3">
              <Card
                className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${
                  exportFormat === "pdf" 
                    ? "ring-2 ring-primary bg-gradient-to-br from-blue-50 to-sky-50/50 shadow-md" 
                    : "hover:border-primary bg-gradient-to-br from-white to-slate-50/30 hover:shadow-red-200/30"
                }`}
                onClick={() => setExportFormat("pdf")}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-red-50 to-rose-50">
                    <FileText className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <div className="font-semibold">PDF</div>
                    <div className="text-xs text-muted-foreground">Profesjonelt dokument</div>
                  </div>
                  {exportFormat === "pdf" && <CheckCircle className="h-5 w-5 ml-auto text-primary" />}
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${
                  exportFormat === "csv" 
                    ? "ring-2 ring-primary bg-gradient-to-br from-blue-50 to-sky-50/50 shadow-md" 
                    : "hover:border-primary bg-gradient-to-br from-white to-slate-50/30 hover:shadow-green-200/30"
                }`}
                onClick={() => setExportFormat("csv")}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50">
                    <FileSpreadsheet className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <div className="font-semibold">CSV</div>
                    <div className="text-xs text-muted-foreground">Excel-kompatibel</div>
                  </div>
                  {exportFormat === "csv" && <CheckCircle className="h-5 w-5 ml-auto text-primary" />}
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${
                  exportFormat === "excel" 
                    ? "ring-2 ring-primary bg-gradient-to-br from-blue-50 to-sky-50/50 shadow-md" 
                    : "hover:border-primary bg-gradient-to-br from-white to-slate-50/30 hover:shadow-emerald-200/30"
                }`}
                onClick={() => setExportFormat("excel")}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-50 to-green-50">
                    <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <div className="font-semibold">Excel</div>
                    <div className="text-xs text-muted-foreground">Microsoft Excel</div>
                  </div>
                  {exportFormat === "excel" && <CheckCircle className="h-5 w-5 ml-auto text-primary" />}
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${
                  exportFormat === "json" 
                    ? "ring-2 ring-primary bg-gradient-to-br from-blue-50 to-sky-50/50 shadow-md" 
                    : "hover:border-primary bg-gradient-to-br from-white to-slate-50/30 hover:shadow-blue-200/30"
                }`}
                onClick={() => setExportFormat("json")}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-50 to-sky-50">
                    <FileJson className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-semibold">JSON</div>
                    <div className="text-xs text-muted-foreground">Strukturert data</div>
                  </div>
                  {exportFormat === "json" && <CheckCircle className="h-5 w-5 ml-auto text-primary" />}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Field Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Velg felter å inkludere</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAllFields}>
                  Velg alle
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAllFields}>
                  Fjern alle
                </Button>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(fieldLabels).map(([field, label]) => (
                    <div key={field} className="flex items-center space-x-2">
                      <Checkbox
                        id={field}
                        checked={fields[field as keyof ExportFields]}
                        onCheckedChange={() => toggleField(field as keyof ExportFields)}
                      />
                      <label
                        htmlFor={field}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* PDF Options */}
          {exportFormat === "pdf" && (
            <div className="space-y-2">
              <Label>PDF-alternativer</Label>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="branding"
                      checked={includeTidumBranding}
                      onCheckedChange={(checked) => setIncludeTidumBranding(checked as boolean)}
                    />
                    <label
                      htmlFor="branding"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Inkluder Tidum-branding (logo og footer)
                    </label>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Avbryt
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Eksporterer...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Eksporter {exportFormat.toUpperCase()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
