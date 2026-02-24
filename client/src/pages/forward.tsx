import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Send, FileSpreadsheet, CheckCircle, Clock, Building2, Mail,
  AlertCircle, Download, ExternalLink, Wifi, WifiOff, Check,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface ForwardHistoryItem {
  id: number;
  user_id: string;
  recipient_email: string;
  institution_name: string | null;
  report_type: string;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
}

interface EmailStatus {
  smtp: boolean;
  manual: boolean;
}

interface PrepareResult {
  success: boolean;
  downloadUrl: string;
  fileName: string;
  mailtoLink: string;
  entriesCount: number;
  totalHours: string;
  totalDays: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const reportTypes = [
  { value: "timesheet", label: "Timeregistrering", description: "Timer og arbeidstid" },
  { value: "case-report", label: "Saksrapport", description: "Oppfølgingsrapporter" },
  { value: "overtime", label: "Overtidsrapport", description: "Overtid og tillegg" },
];

const reportTypeLabels: Record<string, string> = {
  timesheet: "Timeregistrering",
  "case-report": "Saksrapport",
  overtime: "Overtidsrapport",
};

const statusConfig: Record<string, { label: string; className: string }> = {
  sent:      { label: "Sendt",      className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  confirmed: { label: "Bekreftet", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  prepared:  { label: "Forberedt", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  failed:    { label: "Feilet",    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

function getDefaultPeriod() {
  const lastMonth = subMonths(new Date(), 1);
  return {
    start: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
    end: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
  };
}

// ── Component ──────────────────────────────────────────────────────────

export default function ForwardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const defaultPeriod = getDefaultPeriod();

  // Form state
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [reportType, setReportType] = useState("timesheet");
  const [periodStart, setPeriodStart] = useState(defaultPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.end);
  const [message, setMessage] = useState("");

  // Manual-flow state (shown after prepare)
  const [prepareResult, setPrepareResult] = useState<PrepareResult | null>(null);

  // ─ Queries ────────────────────────────────────────────────────────────

  const { data: emailStatus } = useQuery<EmailStatus>({
    queryKey: ["/api/forward/email-status"],
    queryFn: async () => {
      const res = await fetch("/api/forward/email-status", { credentials: "include" });
      if (!res.ok) return { smtp: false, manual: true };
      return res.json();
    },
    staleTime: 60_000,
  });

  const smtpAvailable = emailStatus?.smtp ?? false;

  const { data: history = [] } = useQuery<ForwardHistoryItem[]>({
    queryKey: ["/api/forward/history"],
    queryFn: async () => {
      const res = await fetch("/api/forward/history", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ─ Build form payload ─────────────────────────────────────────────────

  function payload() {
    return {
      recipientEmail,
      recipientName: recipientName || undefined,
      institutionName: institutionName || undefined,
      reportType,
      periodStart,
      periodEnd,
      message: message || undefined,
    };
  }

  function resetForm() {
    setRecipientEmail("");
    setRecipientName("");
    setInstitutionName("");
    setMessage("");
    setPrepareResult(null);
  }

  // ─ Mutations ──────────────────────────────────────────────────────────

  /** SMTP direct send */
  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/forward/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload()),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ukjent feil" }));
        throw new Error(err.error || "Kunne ikke sende rapport");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sendt!", description: data.message || `Rapporten ble sendt til ${recipientEmail}` });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/forward/history"] });
    },
    onError: (err: Error) => {
      toast({ title: "Feil", description: err.message, variant: "destructive" });
    },
  });

  /** Manual mode: prepare Excel for download */
  const prepareMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/forward/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload()),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ukjent feil" }));
        throw new Error(err.error || "Kunne ikke generere rapport");
      }
      return res.json() as Promise<PrepareResult>;
    },
    onSuccess: (data) => {
      setPrepareResult(data);
      toast({ title: "Rapport klar!", description: "Last ned Excel-filen og send den via e-post." });
      queryClient.invalidateQueries({ queryKey: ["/api/forward/history"] });
    },
    onError: (err: Error) => {
      toast({ title: "Feil", description: err.message, variant: "destructive" });
    },
  });

  /** Confirm manual send */
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/forward/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Kunne ikke bekrefte");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bekreftet!", description: "Rapporten er markert som sendt." });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/forward/history"] });
    },
  });

  // ─ Handlers ───────────────────────────────────────────────────────────

  const validate = () => {
    if (!recipientEmail.includes("@")) {
      toast({ title: "Ugyldig e-post", description: "Skriv inn en gyldig e-postadresse", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSmtpSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    sendMutation.mutate();
  };

  const handlePrepare = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    prepareMutation.mutate();
  };

  const isBusy = sendMutation.isPending || prepareMutation.isPending;

  // ─ Render ─────────────────────────────────────────────────────────────

  return (
    <PortalLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Send videre til institusjon</h1>
          <p className="text-muted-foreground">
            Send rapporter og timelister direkte til institusjoner, NAV, eller kommune
          </p>
        </div>

        {/* Email-status indicator */}
        <Card className={smtpAvailable
          ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
          : "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
        }>
          <CardContent className="flex items-center gap-3 py-3">
            {smtpAvailable ? (
              <>
                <Wifi className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800 dark:text-green-300">
                  E-posttjeneste aktiv — rapporter sendes direkte fra noreply@tidum.no
                </span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Manuell modus — rapport lastes ned og sendes via egen e-post
                </span>
              </>
            )}
          </CardContent>
        </Card>

        {/* ───── Send / Prepare form ───── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              {smtpAvailable ? "Send rapport" : "Forbered rapport"}
            </CardTitle>
            <CardDescription>
              {smtpAvailable
                ? "Velg rapporttype og periode — rapporten sendes automatisk med Excel-vedlegg"
                : "Generer Excel-fil som du kan laste ned og sende via din e-postklient"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={smtpAvailable ? handleSmtpSend : handlePrepare} className="space-y-4">
              {/* Recipient */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="recipientEmail">
                    <Mail className="inline mr-1 h-3.5 w-3.5" />
                    Mottakerens e-post *
                  </Label>
                  <Input
                    id="recipientEmail"
                    type="email"
                    placeholder="kontakt@institusjon.no"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recipientName">Mottakerens navn</Label>
                  <Input
                    id="recipientName"
                    placeholder="Navn på kontaktperson (valgfritt)"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="institutionName">
                  <Building2 className="inline mr-1 h-3.5 w-3.5" />
                  Institusjon / organisasjon
                </Label>
                <Input
                  id="institutionName"
                  placeholder="NAV, kommune, barnevern, etc."
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                />
              </div>

              {/* Report type */}
              <div className="space-y-1.5">
                <Label>
                  <FileSpreadsheet className="inline mr-1 h-3.5 w-3.5" />
                  Rapporttype
                </Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reportTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="font-medium">{t.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">– {t.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Period */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="periodStart">
                    <Clock className="inline mr-1 h-3.5 w-3.5" />
                    Fra dato
                  </Label>
                  <Input
                    id="periodStart"
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="periodEnd">Til dato</Label>
                  <Input
                    id="periodEnd"
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <Label htmlFor="message">Melding (valgfritt)</Label>
                <Textarea
                  id="message"
                  placeholder="Tilleggsmelding til mottaker..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Submit button */}
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={isBusy || !recipientEmail}>
                  {smtpAvailable ? (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      {sendMutation.isPending ? "Sender..." : "Send rapport"}
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      {prepareMutation.isPending ? "Genererer..." : "Generer rapport"}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {smtpAvailable
                    ? "Sendes automatisk med Excel-vedlegg"
                    : "Genererer Excel-fil for nedlasting"}
                </p>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ───── Manual-mode: Download + mailto + confirm panel ───── */}
        {prepareResult && (
          <Card className="border-blue-300 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Download className="h-5 w-5" />
                Rapport klar — 3 steg
              </CardTitle>
              <CardDescription>
                {prepareResult.entriesCount} oppføringer · {prepareResult.totalHours} timer · {prepareResult.totalDays} dager
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step 1: Download */}
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800 dark:bg-blue-900 dark:text-blue-200">1</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Last ned Excel-filen</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1.5"
                    onClick={() => window.open(prepareResult.downloadUrl, "_blank")}
                  >
                    <Download className="mr-2 h-3.5 w-3.5" />
                    {prepareResult.fileName}
                  </Button>
                </div>
              </div>

              {/* Step 2: Open email client */}
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800 dark:bg-blue-900 dark:text-blue-200">2</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Åpne e-postklienten og legg ved filen</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1.5"
                    asChild
                  >
                    <a href={prepareResult.mailtoLink}>
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      Åpne e-post med ferdig emne og tekst
                    </a>
                  </Button>
                </div>
              </div>

              {/* Step 3: Confirm */}
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800 dark:bg-blue-900 dark:text-blue-200">3</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Bekreft at du har sendt e-posten</p>
                  <Button
                    size="sm"
                    className="mt-1.5"
                    onClick={() => confirmMutation.mutate()}
                    disabled={confirmMutation.isPending}
                  >
                    <Check className="mr-2 h-3.5 w-3.5" />
                    {confirmMutation.isPending ? "Bekrefter..." : "Ja, e-posten er sendt"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info card */}
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardContent className="flex gap-3 pt-6">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">Hva sendes?</p>
              <p className="text-blue-700 dark:text-blue-300 mt-1">
                Rapporten inneholder en oversikt over registrerte timer for valgt periode,
                med oppsummering av totalt timer og dager. En Excel-fil med detaljert data
                {smtpAvailable
                  ? " legges ved e-posten automatisk."
                  : " lastes ned slik at du kan legge den ved selv."}{" "}
                Mottaker kan åpne filen i Excel, Google Sheets eller annet regneark.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* History */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Sendehistorikk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((item) => {
                  const sc = statusConfig[item.status] || statusConfig.failed;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between border rounded-lg p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{item.recipient_email}</span>
                          {item.institution_name && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {item.institution_name}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {reportTypeLabels[item.report_type] || item.report_type} · {item.period_start} → {item.period_end}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <Badge className={sc.className}>
                          {item.status === "sent" && <CheckCircle className="mr-1 h-3 w-3" />}
                          {sc.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(item.created_at), "dd.MM.yyyy", { locale: nb })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}
