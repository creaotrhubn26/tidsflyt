import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FORMATS = [
  { key: "tripletex", label: "Tripletex", desc: "Import av timer (semikolon-separert)" },
  { key: "visma", label: "Visma Lønn", desc: "Lønnsart-transaksjoner" },
  { key: "poweroffice", label: "PowerOffice Go", desc: "Standard timelinje" },
] as const;

type Fmt = typeof FORMATS[number]["key"];

function currentMonthYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PayrollExportDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Fmt>("tripletex");
  const [period, setPeriod] = useState<string>(currentMonthYM());
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = `/api/payroll/export?format=${format}&period=${encodeURIComponent(period)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ukjent feil" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `tidum-${format}-${period}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast({ title: "Eksport lastet ned", description: `${format} · ${period}` });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Eksporter lønn
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eksporter lønn</DialogTitle>
          <DialogDescription>
            Last ned godkjente timer som CSV i formatet lønnssystemet deres forventer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Lønnssystem</Label>
            <div className="mt-1.5 space-y-1.5">
              {FORMATS.map((f) => (
                <label
                  key={f.key}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                    format === f.key ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="payroll-format"
                    value={f.key}
                    checked={format === f.key}
                    onChange={() => setFormat(f.key)}
                    className="h-4 w-4 accent-primary"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-[11px] text-muted-foreground">{f.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="payroll-period" className="text-xs">Periode (måned)</Label>
            <input
              id="payroll-period"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Filen kommer med UTF-8 BOM slik at Excel leser norske tegn riktig. Importer direkte i lønnssystemet.
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button onClick={handleDownload} disabled={downloading} className="gap-2">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Last ned
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
