/**
 * Floating email compose modal — Gmail-style bottom-right on desktop, fullscreen on mobile.
 * Supports minimize, expand, fullscreen. Accessible from anywhere via useCompose().
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCompose } from "./compose-context";
import { useAuth } from "@/hooks/use-auth";
import { useRolePreview } from "@/hooks/use-role-preview";
import { useToast } from "@/hooks/use-toast";
import { useGdprChecker } from "@/hooks/useGdprChecker";
import { useUserSettings } from "@/hooks/use-user-settings";
import { cn } from "@/lib/utils";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge }    from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  X, Minus, Maximize2, Minimize2, Send, Paperclip,
  ChevronDown, ChevronUp, FileText, Users, Trash2, Eye,
  Sparkles, Calendar, Loader2, AlertTriangle, Wand2, Check,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface EmailTemplate {
  id: number;
  name: string;
  slug: string;
  subject: string;
  htmlContent: string;
  textContent: string | null;
  variables: string[] | null;
  category: string | null;
}

interface TeamMember {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ComposeModal() {
  const { isOpen, isMinimized, defaults, minimize, restore, close } = useCompose();
  const { user } = useAuth();
  const { effectiveRole } = useRolePreview();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Form state
  const [to, setTo]           = useState("");
  const [cc, setCc]           = useState("");
  const [bcc, setBcc]         = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [showTemplates, setShowTemplates] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [recipientName, setRecipientName] = useState("");

  // ── New: rich text mode, attachments, draft, scheduling, AI dialog
  const [richMode, setRichMode] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ url: string; filename: string; size?: number }>>([]);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sendAt, setSendAt] = useState<string>(""); // datetime-local format
  const [aiOpen, setAiOpen] = useState(false);
  const [aiState, setAiState] = useState<{ recipient: string; sak: string; tema: string; tone: string; loading: boolean }>({
    recipient: "", sak: "", tema: "", tone: "vennlig", loading: false,
  });
  const [gdprConfirmOpen, setGdprConfirmOpen] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftSaveTimer = useRef<number | null>(null);

  // ── User settings for GDPR auto-replace
  const { settings: userSettings } = useUserSettings();
  // ── GDPR check on the body text (works for both plain + HTML; strips tags)
  const bodyForGdprCheck = useMemo(
    () => (richMode ? body.replace(/<[^>]+>/g, " ") : body),
    [body, richMode],
  );
  const gdpr = useGdprChecker();
  useEffect(() => {
    gdpr.check(bodyForGdprCheck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyForGdprCheck]);

  // ── Populate from defaults
  useEffect(() => {
    if (!isOpen) return;
    setTo(defaults.to ?? "");
    setCc(defaults.cc ?? "");
    setSubject(defaults.subject ?? "");
    setBody(defaults.body ?? "");
    setRecipientName(defaults.recipientName ?? "");
    if (defaults.templateId) setSelectedTemplateId(defaults.templateId);
    setShowCcBcc(!!defaults.cc);
    setIsFullscreen(false);
    setShowPreview(false);
    setShowTemplates(false);
    setShowTeam(false);
  }, [isOpen, defaults]);

  // ── Queries
  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email/templates"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/email/templates"); return r.json(); },
    enabled: isOpen,
  });

  const isTiltaksleder = ["tiltaksleder", "super_admin", "admin", "hovedadmin", "teamleder"].includes(effectiveRole);
  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/email/team-members"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/email/team-members"); return r.json(); },
    enabled: isOpen && isTiltaksleder,
  });

  // ── Send (also handles scheduled sends via the drafts endpoint)
  const sendMutation = useMutation({
    mutationFn: async () => {
      // If a sendAt is set, store as a scheduled draft instead of sending now.
      if (sendAt) {
        const payload: any = {
          id: draftId, toEmail: to, ccEmail: cc, bccEmail: bcc, subject, body,
          templateId: selectedTemplateId, recipientName, attachments,
          sendAt: new Date(sendAt).toISOString(),
        };
        const res = await apiRequest("POST", "/api/email/drafts", payload);
        return res.json();
      }
      const payload: any = { toEmail: to, subject, body, category: "general", attachments };
      if (cc) payload.ccEmail = cc;
      if (bcc) payload.bccEmail = bcc;
      if (draftId) payload.draftId = draftId;
      if (selectedTemplateId) {
        payload.templateId = selectedTemplateId;
        const mergedVars: Record<string, string> = { ...templateVars };
        if (body && !mergedVars.melding) mergedVars.melding = body;
        if (recipientName && !mergedVars.mottaker) mergedVars.mottaker = recipientName;
        payload.templateVars = mergedVars;
      }
      if (recipientName) payload.recipientName = recipientName;
      const res = await apiRequest("POST", "/api/email/send", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: sendAt ? "Planlagt sending lagret" : "E-post sendt" });
      qc.invalidateQueries({ queryKey: ["/api/email/sent"] });
      qc.invalidateQueries({ queryKey: ["/api/email/drafts"] });
      close();
    },
    onError: () => toast({ title: "Kunne ikke sende", variant: "destructive" }),
  });

  /** Click handler — runs GDPR check first; auto-replace if user opted in. */
  function handleSendClick() {
    if (gdpr.hits.length > 0) {
      if (userSettings.gdprAutoReplace) {
        // Replace inline + send
        const cleaned = gdpr.autoReplaceAll(bodyForGdprCheck);
        setBody(richMode ? cleaned : cleaned);
        setTimeout(() => sendMutation.mutate(), 0);
        return;
      }
      setGdprConfirmOpen(true);
      return;
    }
    sendMutation.mutate();
  }

  // ── Auto-save draft on changes (debounced 5s)
  useEffect(() => {
    if (!isOpen) return;
    // Don't save empty
    if (!to && !subject && !body) return;
    if (draftSaveTimer.current) window.clearTimeout(draftSaveTimer.current);
    setDraftStatus("idle");
    draftSaveTimer.current = window.setTimeout(async () => {
      try {
        setDraftStatus("saving");
        const payload: any = {
          id: draftId, toEmail: to, ccEmail: cc, bccEmail: bcc, subject, body,
          templateId: selectedTemplateId, recipientName, attachments,
        };
        const res = await apiRequest("POST", "/api/email/drafts", payload);
        const data = await res.json();
        if (data?.id) setDraftId(data.id);
        setDraftSavedAt(new Date());
        setDraftStatus("saved");
      } catch {
        setDraftStatus("error");
      }
    }, 5_000);
    return () => {
      if (draftSaveTimer.current) window.clearTimeout(draftSaveTimer.current);
    };
  }, [isOpen, to, cc, bcc, subject, body, selectedTemplateId, recipientName, attachments, draftId]);

  // ── Attachments: upload picked files to /api/cms/upload and store URL
  const [uploadingFile, setUploadingFile] = useState(false);
  async function uploadFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "Filen er for stor", description: "Maks 25 MB per vedlegg.", variant: "destructive" });
      return;
    }
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const token = sessionStorage.getItem("cms_admin_token");
      const res = await fetch("/api/cms/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Opplasting feilet");
      const data = await res.json();
      if (data?.url) {
        setAttachments((prev) => [...prev, { url: data.url, filename: file.name, size: file.size }]);
      }
    } catch (e: any) {
      toast({ title: "Opplasting feilet", description: e.message, variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
  }

  // ── AI draft
  async function generateAi() {
    setAiState((s) => ({ ...s, loading: true }));
    try {
      const res = await apiRequest("POST", "/api/email/ai-draft", {
        recipient: aiState.recipient || recipientName || to,
        sak: aiState.sak,
        tema: aiState.tema,
        tone: aiState.tone,
      });
      const data = await res.json();
      if (data?.subject) setSubject(data.subject);
      if (data?.body) {
        setRichMode(true);
        setBody(data.body);
      }
      setAiOpen(false);
      setAiState((s) => ({ ...s, loading: false }));
    } catch (e: any) {
      toast({ title: "AI-utkast feilet", description: e.message, variant: "destructive" });
      setAiState((s) => ({ ...s, loading: false }));
    }
  }

  // ── Template helpers
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  function loadTemplate(tpl: EmailTemplate) {
    setSelectedTemplateId(tpl.id);
    setSubject(tpl.subject);
    // Don't dump raw HTML into the textarea — keep the user-authored text only.
    // The `{{melding}}` variable is wired to the body field (see sendMutation).
    setBody("");
    const vars: Record<string, string> = {};
    if (tpl.variables) { for (const v of tpl.variables) { vars[v] = ""; } }
    setTemplateVars(vars);
    setShowTemplates(false);
  }

  function clearTemplate() {
    setSelectedTemplateId(null);
    setTemplateVars({});
  }

  function selectTeamMember(m: TeamMember) {
    if (m.email) {
      setTo(m.email);
      setRecipientName([m.firstName, m.lastName].filter(Boolean).join(" "));
    }
    setShowTeam(false);
  }

  function escapeHtml(s: string) {
    return s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function getPreviewHtml() {
    const senderName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Du";

    if (selectedTemplate) {
      // Render the template's HTML with variables substituted. The user's body
      // text (plain-text multi-line) becomes {{melding}} — escape and convert
      // newlines to <br> so line breaks show up correctly.
      const meldingHtml = body ? escapeHtml(body).replace(/\n/g, "<br/>") : "";
      const vars: Record<string, string> = {
        avsender: senderName,
        ...templateVars,
        mottaker: templateVars.mottaker || recipientName || "mottaker",
        melding: meldingHtml || "{{melding}}",
      };
      let html = selectedTemplate.htmlContent;
      for (const [key, val] of Object.entries(vars)) {
        html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val || `{{${key}}}`);
      }
      return html;
    }

    // No template — just render the body text as simple HTML paragraphs
    return body
      ? escapeHtml(body).split(/\n{2,}/).map(p => `<p style="margin:0 0 12px;line-height:1.5">${p.replace(/\n/g, "<br/>")}</p>`).join("")
      : '<p style="color:#888">Skriv en melding…</p>';
  }

  const canSend = to.includes("@") && subject.trim().length > 0;

  if (!isOpen) return null;

  // ── Minimized bar
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-0 right-4 md:right-6 z-50 w-72 bg-primary text-primary-foreground rounded-t-xl shadow-2xl cursor-pointer select-none"
        onClick={restore}
        role="button"
        aria-label="Gjenopprett e-postkomposør"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") restore(); }}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Send className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-sm font-medium truncate">{subject || "Ny e-post"}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); restore(); }} className="p-1 hover:bg-white/10 rounded" aria-label="Utvid">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); close(); }} className="p-1 hover:bg-white/10 rounded" aria-label="Lukk">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Container classes
  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-background flex flex-col"
    : "fixed bottom-0 right-0 md:right-6 z-50 w-full md:w-[520px] md:max-h-[85vh] bg-card border border-border md:rounded-t-2xl shadow-2xl flex flex-col md:bottom-0";

  return (
    <>
      {/* Backdrop on mobile fullscreen */}
      {isFullscreen && <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setIsFullscreen(false)} />}

      <div className={containerClass} role="dialog" aria-label="Skriv e-post">

        {/* ── TITLE BAR ────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-primary text-primary-foreground md:rounded-t-2xl flex-shrink-0 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <Send className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-sm font-medium truncate">{subject || "Ny e-post"}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={minimize} className="p-1.5 hover:bg-white/10 rounded" aria-label="Minimer">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 hover:bg-white/10 rounded" aria-label={isFullscreen ? "Forminsk" : "Fullskjerm"}>
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button onClick={close} className="p-1.5 hover:bg-white/10 rounded" aria-label="Lukk">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── BODY ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-4 py-2 border-b bg-muted/30 flex-wrap">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowTemplates(!showTemplates)}>
              <FileText className="h-3 w-3" /> Maler <ChevronDown className="h-3 w-3" />
            </Button>
            {isTiltaksleder && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowTeam(!showTeam)}>
                <Users className="h-3 w-3" /> Team <ChevronDown className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>
              {uploadingFile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
              Vedlegg
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                e.target.value = "";
              }}
            />
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setAiOpen(true)}>
              <Sparkles className="h-3 w-3" /> AI‑utkast
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 text-xs gap-1", richMode && "bg-primary/10 text-primary")}
              onClick={() => setRichMode((m) => !m)}
              title="Bytt mellom rik tekst og vanlig tekst"
            >
              <Wand2 className="h-3 w-3" /> {richMode ? "Vanlig" : "Rik tekst"}
            </Button>
            <div className="flex-1" />
            {gdpr.hits.length > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-700">
                <AlertTriangle className="h-2.5 w-2.5" />
                {gdpr.hits.length} mulig PII
              </Badge>
            )}
            {draftStatus === "saving" && <span className="text-[10px] text-muted-foreground">Lagrer…</span>}
            {draftStatus === "saved" && draftSavedAt && (
              <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                <Check className="h-2.5 w-2.5" />Utkast lagret
              </span>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowPreview(!showPreview)}>
              <Eye className="h-3 w-3" /> {showPreview ? "Rediger" : "Forhåndsvis"}
            </Button>
          </div>

          {/* Template picker dropdown */}
          {showTemplates && (
            <div className="border-b bg-muted/20 px-4 py-2 space-y-1 max-h-48 overflow-y-auto">
              <button onClick={() => { setSelectedTemplateId(null); setShowTemplates(false); }}
                className={cn("w-full text-left text-sm px-3 py-2 rounded-lg transition-colors", !selectedTemplateId ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}>
                Ingen mal
              </button>
              {templates.map(tpl => (
                <button key={tpl.id} onClick={() => loadTemplate(tpl)}
                  className={cn("w-full text-left text-sm px-3 py-2 rounded-lg transition-colors", selectedTemplateId === tpl.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}>
                  <span className="font-medium">{tpl.name}</span>
                  {tpl.category && <Badge variant="outline" className="ml-2 text-[10px]">{tpl.category}</Badge>}
                </button>
              ))}
            </div>
          )}

          {/* Team member picker dropdown */}
          {showTeam && teamMembers.length > 0 && (
            <div className="border-b bg-muted/20 px-4 py-2 space-y-1 max-h-48 overflow-y-auto">
              {teamMembers.filter(m => m.email).map(m => (
                <button key={m.id} onClick={() => selectTeamMember(m)}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {(m.firstName?.[0] ?? "").toUpperCase()}{(m.lastName?.[0] ?? "").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{[m.firstName, m.lastName].filter(Boolean).join(" ")}</div>
                    <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  </div>
                  {m.role && <Badge variant="outline" className="ml-auto text-[10px] flex-shrink-0">{m.role}</Badge>}
                </button>
              ))}
            </div>
          )}

          {/* Template variables (exclude avsender, melding, mottaker — handled elsewhere) */}
          {selectedTemplate?.variables && selectedTemplate.variables.filter(v => !["avsender", "melding", "mottaker"].includes(v)).length > 0 && (
            <div className="px-4 py-2 border-b bg-primary/5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground">Fyll inn detaljer</p>
                <button onClick={clearTemplate} className="text-[11px] text-muted-foreground hover:text-foreground">
                  Bruk uten mal
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {selectedTemplate.variables
                  .filter(v => !["avsender", "melding", "mottaker"].includes(v))
                  .map(v => (
                    <div key={v}>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{v}</Label>
                      <Input
                        className="h-8 text-xs mt-0.5"
                        value={templateVars[v] ?? ""}
                        placeholder={`Skriv ${v}…`}
                        onChange={e => setTemplateVars(prev => ({ ...prev, [v]: e.target.value }))}
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Fields */}
          <div className="px-4 pt-3 space-y-0">
            {/* To */}
            <div className="flex items-center gap-2 py-1.5 border-b">
              <span className="text-xs text-muted-foreground w-8 flex-shrink-0">Til</span>
              <Input value={to} onChange={e => setTo(e.target.value)} placeholder="e-post@eksempel.no"
                className="border-0 shadow-none h-8 text-sm focus-visible:ring-0 px-0" />
              <button onClick={() => setShowCcBcc(!showCcBcc)} className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0">
                {showCcBcc ? <ChevronUp className="h-3.5 w-3.5" /> : "Cc/Bcc"}
              </button>
            </div>

            {/* Cc / Bcc */}
            {showCcBcc && (
              <>
                <div className="flex items-center gap-2 py-1.5 border-b">
                  <span className="text-xs text-muted-foreground w-8 flex-shrink-0">Cc</span>
                  <Input value={cc} onChange={e => setCc(e.target.value)} placeholder="cc@eksempel.no"
                    className="border-0 shadow-none h-8 text-sm focus-visible:ring-0 px-0" />
                </div>
                <div className="flex items-center gap-2 py-1.5 border-b">
                  <span className="text-xs text-muted-foreground w-8 flex-shrink-0">Bcc</span>
                  <Input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="bcc@eksempel.no"
                    className="border-0 shadow-none h-8 text-sm focus-visible:ring-0 px-0" />
                </div>
              </>
            )}

            {/* Subject */}
            <div className="flex items-center gap-2 py-1.5 border-b">
              <span className="text-xs text-muted-foreground w-8 flex-shrink-0">Emne</span>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Emne…"
                className="border-0 shadow-none h-8 text-sm font-medium focus-visible:ring-0 px-0" />
            </div>
          </div>

          {/* Body / Preview */}
          <div className="px-4 py-3 flex-1">
            {showPreview ? (
              <div className="text-sm min-h-[120px] p-3 rounded-lg bg-muted/30 border overflow-auto max-h-[60vh]"
                dangerouslySetInnerHTML={{ __html: getPreviewHtml() }} />
            ) : richMode ? (
              <RichTextEditor
                value={body}
                onChange={setBody}
                placeholder={selectedTemplate ? "Skriv meldingen din her — mal-rammen legges til automatisk." : "Skriv meldingen din her…"}
                minHeight="180px"
              />
            ) : (
              <>
                <Textarea
                  ref={bodyRef}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder={selectedTemplate ? "Skriv meldingen din her — mal-rammen legges til automatisk." : "Skriv meldingen din her…"}
                  className="min-h-[120px] md:min-h-[180px] border-0 shadow-none resize-none text-sm focus-visible:ring-0 p-0"
                />
                {selectedTemplate && (
                  <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Eye className="h-3 w-3" />
                    Mal aktivert: {selectedTemplate.name}. Klikk "Forhåndsvis" for å se hvordan e-posten ser ut for mottaker.
                  </p>
                )}
              </>
            )}

            {/* Attachments list */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Vedlegg</p>
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                    <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs flex-1 truncate">{a.filename}</span>
                    {a.size && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {(a.size / 1024).toFixed(0)} kB
                      </span>
                    )}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                      aria-label="Fjern vedlegg"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER ───────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 flex-shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button onClick={handleSendClick} disabled={!canSend || sendMutation.isPending} size="sm" className="gap-1.5">
              {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : sendAt ? <Calendar className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {sendMutation.isPending ? "Sender…" : sendAt ? "Planlegg" : "Send"}
            </Button>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <Input
                type="datetime-local"
                value={sendAt}
                onChange={(e) => setSendAt(e.target.value)}
                className="h-7 w-44 text-xs"
                title="La stå tom for å sende nå"
              />
              {sendAt && (
                <button
                  type="button"
                  onClick={() => setSendAt("")}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Send nå
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {selectedTemplate && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <FileText className="h-2.5 w-2.5" /> {selectedTemplate.name}
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              aria-label="Forkast e-post" onClick={close}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── GDPR confirm dialog ──────────────────────────── */}
      <Dialog open={gdprConfirmOpen} onOpenChange={setGdprConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Mulig personlig informasjon oppdaget
            </DialogTitle>
            <DialogDescription>
              GDPR‑hjelperen fant {gdpr.hits.length} treff i meldingen. Sjekk at det er greit å sende, eller la systemet anonymisere før sending.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {gdpr.hits.slice(0, 12).map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs rounded border px-2 py-1 bg-muted/30">
                <Badge variant="outline" className="text-[9px]">{m.type}</Badge>
                <code className="font-mono">{m.word}</code>
              </div>
            ))}
            {gdpr.hits.length > 12 && (
              <p className="text-[11px] text-muted-foreground italic">+ {gdpr.hits.length - 12} til</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGdprConfirmOpen(false)}>Avbryt</Button>
            <Button
              variant="outline"
              onClick={() => {
                const cleaned = gdpr.autoReplaceAll(bodyForGdprCheck);
                setBody(cleaned);
                setGdprConfirmOpen(false);
                setTimeout(() => sendMutation.mutate(), 0);
              }}
            >
              Anonymiser og send
            </Button>
            <Button
              onClick={() => { setGdprConfirmOpen(false); sendMutation.mutate(); }}
            >
              Send som det er
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI draft dialog ──────────────────────────────── */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Skriv utkast med AI
            </DialogTitle>
            <DialogDescription>
              Beskriv tema og kontekst, så lager AI et utkast du kan tilpasse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Mottaker</Label>
              <Input
                value={aiState.recipient}
                onChange={(e) => setAiState((s) => ({ ...s, recipient: e.target.value }))}
                placeholder={recipientName || to || "Navn på mottaker"}
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Sak / kontekst (valgfritt)</Label>
              <Input
                value={aiState.sak}
                onChange={(e) => setAiState((s) => ({ ...s, sak: e.target.value }))}
                placeholder="F.eks. saksnummer, klient eller kort kontekst"
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Hva e-posten skal handle om</Label>
              <Textarea
                rows={3}
                value={aiState.tema}
                onChange={(e) => setAiState((s) => ({ ...s, tema: e.target.value }))}
                placeholder="F.eks. «be om bekreftelse på ferieperioden» eller «purre på faktura 1234»"
              />
            </div>
            <div>
              <Label className="text-xs">Tone</Label>
              <select
                value={aiState.tone}
                onChange={(e) => setAiState((s) => ({ ...s, tone: e.target.value }))}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="vennlig">Vennlig og uformell</option>
                <option value="profesjonell">Profesjonell</option>
                <option value="formell">Formell</option>
                <option value="kort og direkte">Kort og direkte</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiOpen(false)}>Avbryt</Button>
            <Button onClick={generateAi} disabled={!aiState.tema.trim() || aiState.loading}>
              {aiState.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Lag utkast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
