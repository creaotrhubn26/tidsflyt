import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Mail, Send, FileText, Clock, Paperclip, Eye, Plus,
  CheckCircle, AlertCircle, Trash2, ChevronDown, ChevronUp, Building2, Users,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface EmailTemplate {
  id: number;
  name: string;
  slug: string;
  subject: string;
  htmlContent: string;
  textContent: string | null;
  variables: string[] | null;
  category: string | null;
  isActive: boolean | null;
}

interface SentEmail {
  id: number;
  sentBy: string | null;
  recipientEmail: string;
  recipientName: string | null;
  ccEmail: string | null;
  bccEmail: string | null;
  subject: string;
  body: string | null;
  status: string | null;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  metadata: any;
}

interface TeamMember {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
}

// ── Component ──────────────────────────────────────────────────────────

export default function EmailComposer() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Compose state
  const [toEmail, setToEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [bccEmail, setBccEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [attachReport, setAttachReport] = useState(false);
  const [reportType, setReportType] = useState("timesheet");
  const [periodStart, setPeriodStart] = useState(format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"));
  const [showPreview, setShowPreview] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [recipientName, setRecipientName] = useState("");

  // Save-as-template state
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState("general");

  // Queries
  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email/templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/email/templates");
      return res.json();
    },
  });

  const { data: sentHistory = [] } = useQuery<SentEmail[]>({
    queryKey: ["/api/email/sent"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/email/sent");
      return res.json();
    },
  });

  const { data: smtpStatus } = useQuery<{ smtp: boolean }>({
    queryKey: ["/api/email/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/email/status");
      return res.json();
    },
  });

  // Team members for tiltaksleder user picker
  const isTiltaksleder = ['tiltaksleder', 'super_admin', 'admin', 'hovedadmin', 'teamleder'].includes(user?.role || '');

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/email/team-members"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/email/team-members");
      return res.json();
    },
    enabled: isTiltaksleder,
  });

  // Send mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { toEmail, subject, body, category: resolvedCategory };
      if (ccEmail) payload.ccEmail = ccEmail;
      if (bccEmail) payload.bccEmail = bccEmail;
      if (selectedTemplateId) {
        payload.templateId = selectedTemplateId;
        payload.templateVars = templateVars;
      }
      if (attachReport) {
        payload.attachReport = true;
        payload.reportType = reportType;
        payload.periodStart = periodStart;
        payload.periodEnd = periodEnd;
        if (targetUserId) payload.targetUserId = targetUserId;
      }
      if (institutionName) payload.institutionName = institutionName;
      if (recipientName) payload.recipientName = recipientName;
      const res = await apiRequest("POST", "/api/email/send", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Sendt!", description: data.message || "E-posten ble sendt." });
      queryClient.invalidateQueries({ queryKey: ["/api/email/sent"] });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Feil", description: err.message || "Kunne ikke sende e-post.", variant: "destructive" });
    },
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/email/templates", {
        name: newTemplateName,
        subject,
        htmlContent: body,
        textContent: body?.replace(/<[^>]+>/g, ''),
        variables: Object.keys(templateVars).length > 0 ? Object.keys(templateVars) : [],
        category: newTemplateCategory,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Lagret!", description: "Malen ble lagret." });
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
      setShowSaveTemplate(false);
      setNewTemplateName("");
    },
    onError: (err: any) => {
      toast({ title: "Feil", description: err.message || "Kunne ikke lagre malen.", variant: "destructive" });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/email/templates/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Slettet", description: "Malen ble slettet." });
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
    },
  });

  // Load template into compose form
  function loadTemplate(tpl: EmailTemplate) {
    setSelectedTemplateId(tpl.id);
    setSubject(tpl.subject);
    setBody(tpl.htmlContent);
    const vars: Record<string, string> = {};
    if (tpl.variables) {
      for (const v of tpl.variables) {
        vars[v] = templateVars[v] || '';
      }
    }
    setTemplateVars(vars);
    toast({ title: "Mal lastet", description: `"${tpl.name}" ble lastet inn.` });
  }

  function resetForm() {
    setToEmail("");
    setCcEmail("");
    setBccEmail("");
    setSubject("");
    setBody("");
    setSelectedTemplateId(null);
    setTemplateVars({});
    setAttachReport(false);
    setShowCcBcc(false);
    setShowPreview(false);
    setTargetUserId("");
    setInstitutionName("");
    setRecipientName("");
  }

  // Resolve category from template or reportType
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const resolvedCategory = selectedTemplate?.category || (attachReport ? reportType : 'general');

  // Preview: replace template variables in body
  function getPreviewHtml() {
    let html = body;
    const vars = {
      ...templateVars,
      avsender: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Du',
    };
    for (const [key, val] of Object.entries(vars)) {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || `{{${key}}}`);
    }
    return html;
  }

  const categoryLabels: Record<string, string> = {
    timesheet: 'Timeliste',
    'case-report': 'Saksrapport',
    overtime: 'Overtid',
    general: 'Generell',
  };

  const smtpAvailable = smtpStatus?.smtp ?? false;

  return (
    <PortalLayout>
      <div className="container mx-auto max-w-5xl py-4 sm:py-6 px-2 sm:px-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Mail className="h-6 w-6 text-primary" />
              E-post
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Skriv og send e-poster med maler, vedlegg og historikk
            </p>
          </div>
          <Badge variant={smtpAvailable ? "default" : "destructive"} className="gap-1.5">
            {smtpAvailable ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {smtpAvailable ? "SMTP aktiv" : "SMTP ikke tilkoblet"}
          </Badge>
        </div>

        <Tabs defaultValue="compose">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="compose" className="gap-1.5">
              <Send className="h-4 w-4" /> Skriv
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5">
              <FileText className="h-4 w-4" /> Maler
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <Clock className="h-4 w-4" /> Historikk
            </TabsTrigger>
          </TabsList>

          {/* ═══ Compose Tab ═══ */}
          <TabsContent value="compose" className="space-y-4 mt-4">

            {/* Template selector */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Velg mal (valgfritt)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedTemplateId === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setSelectedTemplateId(null); }}
                  >
                    Ingen mal
                  </Button>
                  {templates.map(tpl => (
                    <Button
                      key={tpl.id}
                      variant={selectedTemplateId === tpl.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => loadTemplate(tpl)}
                    >
                      {tpl.name}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Template variables */}
            {selectedTemplate?.variables && selectedTemplate.variables.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Malvariabler</CardTitle>
                  <CardDescription>Fyll inn verdier som brukes i malen</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedTemplate.variables.filter(v => v !== 'avsender').map(v => (
                      <div key={v}>
                        <Label className="capitalize">{v}</Label>
                        <Input
                          value={templateVars[v] || ''}
                          onChange={e => setTemplateVars(prev => ({ ...prev, [v]: e.target.value }))}
                          placeholder={`Skriv {{${v}}}`}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recipient + subject */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="toEmail">Til *</Label>
                    <Input
                      id="toEmail"
                      type="email"
                      placeholder="mottaker@eksempel.no"
                      value={toEmail}
                      onChange={e => setToEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recipientName">Mottakernavn</Label>
                    <Input
                      id="recipientName"
                      placeholder="Navn på mottaker"
                      value={recipientName}
                      onChange={e => setRecipientName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Institution name */}
                <div className="space-y-2">
                  <Label htmlFor="institutionName" className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> Institusjon
                  </Label>
                  <Input
                    id="institutionName"
                    placeholder="F.eks. NAV, kommune, arbeidsgiver..."
                    value={institutionName}
                    onChange={e => setInstitutionName(e.target.value)}
                  />
                </div>

                <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowCcBcc(!showCcBcc)}>
                  {showCcBcc ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Kopi / Blindkopi
                </Button>

                {showCcBcc && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="ccEmail">Kopi (CC)</Label>
                      <Input
                        id="ccEmail"
                        type="email"
                        placeholder="kopi@eksempel.no"
                        value={ccEmail}
                        onChange={e => setCcEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="bccEmail">Blindkopi (BCC)</Label>
                      <Input
                        id="bccEmail"
                        type="email"
                        placeholder="blindkopi@eksempel.no"
                        value={bccEmail}
                        onChange={e => setBccEmail(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="subject">Emne *</Label>
                  <Input
                    id="subject"
                    placeholder="Emne for e-posten"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="body">Melding</Label>
                  <Textarea
                    id="body"
                    rows={8}
                    placeholder="Skriv meldingen din her..."
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    className="resize-y"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Attach report */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Paperclip className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Legg ved rapport</p>
                      <p className="text-xs text-muted-foreground">Genererer Excel-rapport og legger den ved</p>
                    </div>
                  </div>
                  <Switch checked={attachReport} onCheckedChange={setAttachReport} />
                </div>

                {attachReport && (
                  <div className="mt-4 space-y-3">
                    {/* Tiltaksleder: pick which user's report */}
                    {isTiltaksleder && teamMembers.length > 1 && (
                      <div className="space-y-1">
                        <Label className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" /> Send rapport for bruker
                        </Label>
                        <Select value={targetUserId} onValueChange={setTargetUserId}>
                          <SelectTrigger><SelectValue placeholder="Velg bruker (standard: deg selv)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value=" ">Meg selv</SelectItem>
                            {teamMembers.map(m => (
                              <SelectItem key={m.id} value={m.id}>
                                {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || m.id}
                                {m.role ? ` (${m.role})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>Rapporttype</Label>
                        <Select value={reportType} onValueChange={setReportType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="timesheet">Timeliste</SelectItem>
                            <SelectItem value="case-report">Saksrapport</SelectItem>
                            <SelectItem value="overtime">Overtidsrapport</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Fra</Label>
                        <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Til</Label>
                        <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preview */}
            {showPreview && body && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" /> Forhåndsvisning
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-md p-4 bg-white dark:bg-zinc-900 text-sm">
                    <p className="font-medium mb-2">Til: {toEmail || '–'}{recipientName ? ` (${recipientName})` : ''}</p>
                    {institutionName && <p className="text-xs text-muted-foreground mb-1">Institusjon: {institutionName}</p>}
                    {ccEmail && <p className="text-xs text-muted-foreground mb-1">CC: {ccEmail}</p>}
                    {bccEmail && <p className="text-xs text-muted-foreground mb-1">BCC: {bccEmail}</p>}
                    <p className="font-medium mb-3">Emne: {subject || '–'}</p>
                    <hr className="mb-3" />
                    <div dangerouslySetInnerHTML={{ __html: getPreviewHtml() }} />
                    {attachReport && (
                      <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        Vedlegg: {categoryLabels[reportType] || 'Rapport'} ({periodStart} – {periodEnd}).xlsx
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reply-To info */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">
                  <strong>Svar-til (Reply-To):</strong>{" "}
                  {['timesheet', 'case-report', 'overtime'].includes(resolvedCategory)
                    ? "Svar sendes til tiltaksleder (eller support@tidum.no som reserve)"
                    : "Svar sendes til support@tidum.no"}
                </p>
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={!toEmail || !subject || sendMutation.isPending || !smtpAvailable}
                className="gap-2"
              >
                {sendMutation.isPending ? <Clock className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendMutation.isPending ? 'Sender...' : 'Send e-post'}
              </Button>

              <Button variant="outline" className="gap-2" onClick={() => setShowPreview(!showPreview)}>
                <Eye className="h-4 w-4" />
                {showPreview ? 'Skjul forhåndsvisning' : 'Forhåndsvisning'}
              </Button>

              <Button variant="outline" className="gap-2" onClick={() => setShowSaveTemplate(!showSaveTemplate)}>
                <Plus className="h-4 w-4" />
                Lagre som mal
              </Button>

              <Button variant="ghost" onClick={resetForm}>
                Nullstill
              </Button>
            </div>

            {/* Save-as-template form */}
            {showSaveTemplate && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Lagre som ny mal</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Navn på mal</Label>
                      <Input
                        value={newTemplateName}
                        onChange={e => setNewTemplateName(e.target.value)}
                        placeholder="F.eks. Ukentlig statusrapport"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Kategori</Label>
                      <Select value={newTemplateCategory} onValueChange={setNewTemplateCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">Generell</SelectItem>
                          <SelectItem value="timesheet">Timeliste</SelectItem>
                          <SelectItem value="case-report">Saksrapport</SelectItem>
                          <SelectItem value="overtime">Overtid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => saveTemplateMutation.mutate()}
                    disabled={!newTemplateName || !subject || saveTemplateMutation.isPending}
                  >
                    {saveTemplateMutation.isPending ? 'Lagrer...' : 'Lagre mal'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ Templates Tab ═══ */}
          <TabsContent value="templates" className="mt-4">
            <div className="space-y-3">
              {templates.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Ingen maler opprettet ennå. Bruk "Lagre som mal" i skjemaet for å opprette en.
                  </CardContent>
                </Card>
              )}
              {templates.map(tpl => (
                <Card key={tpl.id}>
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{tpl.name}</p>
                        <Badge variant="secondary" className="text-xs">
                          {categoryLabels[tpl.category || 'general'] || tpl.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{tpl.subject}</p>
                      {tpl.variables && tpl.variables.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Variabler: {tpl.variables.map(v => `{{${v}}}`).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-3">
                      <Button size="sm" variant="outline" onClick={() => { loadTemplate(tpl); /* switch to compose tab handled by clicking tab */ }}>
                        Bruk
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteTemplateMutation.mutate(tpl.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ═══ History Tab ═══ */}
          <TabsContent value="history" className="mt-4">
            <div className="space-y-3">
              {sentHistory.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Ingen e-poster sendt ennå.
                  </CardContent>
                </Card>
              )}
              {sentHistory.map(item => (
                <Card key={item.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{item.subject}</p>
                          <Badge
                            variant={item.status === 'sent' ? 'default' : 'destructive'}
                            className="text-xs"
                          >
                            {item.status === 'sent' ? 'Sendt' : item.status === 'failed' ? 'Feilet' : item.status || 'Ukjent'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Til: {item.recipientEmail}
                          {item.ccEmail && <span> · CC: {item.ccEmail}</span>}
                        </p>
                        {item.errorMessage && (
                          <p className="text-xs text-destructive mt-1">{item.errorMessage}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {item.sentAt
                          ? format(new Date(item.sentAt), 'dd.MM.yyyy HH:mm', { locale: nb })
                          : item.createdAt
                            ? format(new Date(item.createdAt), 'dd.MM.yyyy HH:mm', { locale: nb })
                            : '–'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PortalLayout>
  );
}
