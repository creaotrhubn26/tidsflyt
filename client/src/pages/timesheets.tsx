import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Send, CheckCircle, XCircle, Clock, FileText } from "lucide-react";

interface TimesheetSubmission {
  id: number;
  user_id: string;
  month: string;
  status: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  reviewer_notes: string | null;
  total_hours: number | null;
  total_days: number | null;
}

const statusLabels: Record<string, string> = {
  submitted: "Innsendt",
  approved: "Godkjent",
  rejected: "Avvist",
  draft: "Utkast",
};

const statusColors: Record<string, string> = {
  submitted: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  draft: "bg-gray-100 text-gray-800",
};

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy", { locale: nb }),
    });
  }
  return options;
}

export default function TimesheetsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role && ["tiltaksleder", "teamleder", "hovedadmin", "admin", "super_admin"].includes(user.role);

  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [notes, setNotes] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const monthOptions = getMonthOptions();

  // Worker: own submissions
  const { data: submissions = [], isLoading } = useQuery<TimesheetSubmission[]>({
    queryKey: ["/api/timesheets/submissions"],
    queryFn: async () => {
      const res = await fetch("/api/timesheets/submissions", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Admin: all submissions
  const { data: allSubmissions = [], isLoading: adminLoading } = useQuery<TimesheetSubmission[]>({
    queryKey: ["/api/admin/timesheets"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const res = await fetch("/api/admin/timesheets", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Submit timesheet
  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/timesheets/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ month: selectedMonth, notes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Feil" }));
        throw new Error(err.error || "Kunne ikke sende timeliste");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/timesheets"] });
      setNotes("");
      toast({ title: "Sendt!", description: `Timeliste for ${selectedMonth} er innsendt.` });
    },
    onError: (err: Error) => {
      toast({ title: "Feil", description: err.message, variant: "destructive" });
    },
  });

  // Admin: approve
  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/timesheets/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewer_notes: reviewNotes }),
      });
      if (!res.ok) throw new Error("Feil ved godkjenning");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/timesheets"] });
      setReviewNotes("");
      toast({ title: "Godkjent", description: "Timelisten er godkjent." });
    },
  });

  // Admin: reject
  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/timesheets/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewer_notes: reviewNotes }),
      });
      if (!res.ok) throw new Error("Feil ved avvisning");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/timesheets"] });
      setReviewNotes("");
      toast({ title: "Avvist", description: "Timelisten er sendt tilbake." });
    },
  });

  const currentSubmission = submissions.find((s) => s.month === selectedMonth);

  return (
    <PortalLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Timelister</h1>
          <p className="text-muted-foreground">Send inn og administrer timelister</p>
        </div>

        {/* Submit section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send inn timeliste
            </CardTitle>
            <CardDescription>
              Velg måned og send inn timelisten din for godkjenning
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Måned</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px] space-y-1.5">
                <label className="text-sm font-medium">Kommentar (valgfritt)</label>
                <Textarea
                  placeholder="Eventuelle merknader til timelisten..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            {currentSubmission && (
              <div className="flex items-center gap-2 text-sm">
                <span>Status for {selectedMonth}:</span>
                <Badge className={statusColors[currentSubmission.status] || ""}>
                  {statusLabels[currentSubmission.status] || currentSubmission.status}
                </Badge>
                {currentSubmission.reviewer_notes && (
                  <span className="text-muted-foreground ml-2">
                    — {currentSubmission.reviewer_notes}
                  </span>
                )}
              </div>
            )}

            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || currentSubmission?.status === "approved"}
            >
              <Send className="mr-2 h-4 w-4" />
              {currentSubmission ? "Send på nytt" : "Send inn"}
            </Button>
          </CardContent>
        </Card>

        {/* My submissions history */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Mine innsendinger
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Laster...</p>
            ) : submissions.length === 0 ? (
              <p className="text-muted-foreground">Ingen innsendinger ennå.</p>
            ) : (
              <div className="space-y-3">
                {submissions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between border rounded-lg p-3"
                  >
                    <div>
                      <span className="font-medium">{s.month}</span>
                      {s.notes && (
                        <span className="text-sm text-muted-foreground ml-2">— {s.notes}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[s.status] || ""}>
                        {statusLabels[s.status] || s.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(s.submitted_at), "dd.MM.yyyy HH:mm", { locale: nb })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admin: review section */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Timelister til godkjenning
              </CardTitle>
              <CardDescription>Gjennomgå og godkjenn innsendte timelister</CardDescription>
            </CardHeader>
            <CardContent>
              {adminLoading ? (
                <p className="text-muted-foreground">Laster...</p>
              ) : allSubmissions.filter((s) => s.status === "submitted").length === 0 ? (
                <p className="text-muted-foreground">Ingen timelister venter på godkjenning.</p>
              ) : (
                <div className="space-y-4">
                  {allSubmissions
                    .filter((s) => s.status === "submitted")
                    .map((s) => (
                      <div
                        key={s.id}
                        className="border rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium">{s.user_id}</span>
                            <span className="text-muted-foreground ml-2">— {s.month}</span>
                            {s.total_hours && (
                              <span className="text-sm text-muted-foreground ml-2">
                                ({s.total_hours} timer)
                              </span>
                            )}
                          </div>
                          <Badge className={statusColors[s.status] || ""}>
                            {statusLabels[s.status] || s.status}
                          </Badge>
                        </div>
                        {s.notes && (
                          <p className="text-sm bg-muted/50 p-2 rounded">
                            <strong>Kommentar:</strong> {s.notes}
                          </p>
                        )}
                        <div className="space-y-2">
                          <Textarea
                            placeholder="Tilbakemelding (valgfritt)..."
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate(s.id)}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle className="mr-1 h-4 w-4" />
                              Godkjenn
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => rejectMutation.mutate(s.id)}
                              disabled={rejectMutation.isPending}
                            >
                              <XCircle className="mr-1 h-4 w-4" />
                              Avvis
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}
