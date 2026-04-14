/**
 * Floating email compose modal — Gmail-style bottom-right on desktop, fullscreen on mobile.
 * Supports minimize, expand, fullscreen. Accessible from anywhere via useCompose().
 */

import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCompose } from "./compose-context";
import { useAuth } from "@/hooks/use-auth";
import { useRolePreview } from "@/hooks/use-role-preview";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge }    from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  X, Minus, Maximize2, Minimize2, Send, Paperclip,
  ChevronDown, ChevronUp, FileText, Users, Trash2, Eye,
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

  const bodyRef = useRef<HTMLTextAreaElement>(null);

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

  // ── Send
  const sendMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { toEmail: to, subject, body, category: "general" };
      if (cc) payload.ccEmail = cc;
      if (bcc) payload.bccEmail = bcc;
      if (selectedTemplateId) {
        payload.templateId = selectedTemplateId;
        // User's free-text message goes into {{melding}}; recipient/name alias too
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
      toast({ title: "E-post sendt" });
      qc.invalidateQueries({ queryKey: ["/api/email/sent"] });
      close();
    },
    onError: () => toast({ title: "Kunne ikke sende", variant: "destructive" }),
  });

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
          <div className="flex items-center gap-1 px-4 py-2 border-b bg-muted/30">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowTemplates(!showTemplates)}>
              <FileText className="h-3 w-3" /> Maler <ChevronDown className="h-3 w-3" />
            </Button>
            {isTiltaksleder && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowTeam(!showTeam)}>
                <Users className="h-3 w-3" /> Team <ChevronDown className="h-3 w-3" />
              </Button>
            )}
            <div className="flex-1" />
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
          </div>
        </div>

        {/* ── FOOTER ───────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 flex-shrink-0">
          <div className="flex items-center gap-1">
            <Button onClick={() => sendMutation.mutate()} disabled={!canSend || sendMutation.isPending} size="sm" className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              {sendMutation.isPending ? "Sender…" : "Send"}
            </Button>
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
    </>
  );
}
