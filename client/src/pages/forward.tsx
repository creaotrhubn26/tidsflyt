import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Send, FileSpreadsheet, CheckCircle, Clock, Building2, Mail, AlertCircle } from "lucide-react";

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

const reportTypes = [
  { value: "timesheet", label: "Timeregistrering", description: "Timer og arbeidstid" },
  { value: "case-report", label: "Saksrapport", description: "Oppfølgingsrapporter" },
  { value: "overtime", label: "Overtidsrapport", description: "Overtid og tillegg" },
];

function getDefaultPeriod() {
  const lastMonth = subMonths(new Date(), 1);
  return {
    start: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
    end: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
  };
}

export default function ForwardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const defaultPeriod = getDefaultPeriod();

  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [reportType, setReportType] = useState("timesheet");
  const [periodStart, setPeriodStart] = useState(defaultPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.end);
  const [message, setMessage] = useState("");

  const { data: history = [] } = useQuery<ForwardHistoryItem[]>({
    queryKey: ["/api/forward/history"],
    queryFn: async () => {
      const res = await fetch("/api/forward/history", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/forward/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          recipientEmail,
          recipientName: recipientName || undefined,
          institutionName: institutionName || undefined,
          reportType,
          periodStart,
          periodEnd,
          message: message || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ukjent feil" }));
        throw new Error(err.error || err.hint || "Kunne ikke sende rapport");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sendt!",
        description: data.message || `Rapporten ble sendt til ${recipientEmail}`,
      });
      setRecipientEmail("");
      setRecipientName("");
      setInstitutionName("");
      setMessage("");
    },
    onError: (err: Error) => {
      toast({ title: "Feil", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail.includes("@")) {
      toast({ title: "Ugyldig e-post", description: "Skriv inn en gyldig e-postadresse", variant: "destructive" });
      return;
    }
    sendMutation.mutate();
  };

  const reportTypeLabels: Record<string, string> = {
    timesheet: "Timeregistrering",
    "case-report": "Saksrapport",
    overtime: "Overtidsrapport",
  };

  return (
    <PortalLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Send videre til institusjon</h1>
          <p className="text-muted-foreground">
            Send rapporter og timelister direkte til institusjoner, NAV, eller kommune
          </p>
        </div>

        {/* Send form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send rapport
            </CardTitle>
            <CardDescription>
              Velg rapporttype og periode, og send til mottaker med Excel-vedlegg
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder="NAV, kommune, barne­vern, etc."
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

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={sendMutation.isPending || !recipientEmail}>
                  <Send className="mr-2 h-4 w-4" />
                  {sendMutation.isPending ? "Sender..." : "Send rapport"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Rapporten sendes som e-post med Excel-vedlegg
                </p>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardContent className="flex gap-3 pt-6">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">Hva sendes?</p>
              <p className="text-blue-700 dark:text-blue-300 mt-1">
                Rapporten inneholder en oversikt over registrerte timer for valgt periode, 
                med oppsummering av totalt timer og dager. En Excel-fil med detaljert data 
                legges ved e-posten. Mottaker kan åpne filen i Excel, Google Sheets eller 
                annet regneark.
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
                {history.map((item) => (
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
                      <Badge
                        className={
                          item.status === "sent"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }
                      >
                        {item.status === "sent" ? (
                          <><CheckCircle className="mr-1 h-3 w-3" /> Sendt</>
                        ) : (
                          "Feilet"
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.created_at), "dd.MM.yyyy", { locale: nb })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}
