import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { MessageSquarePlus, Bug, Lightbulb, Heart, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRolePreview } from "@/hooks/use-role-preview";
import { cn } from "@/lib/utils";

type Category = "bug" | "idea" | "praise" | "other";
type Severity = "low" | "medium" | "high" | "critical";

const CATEGORIES: { value: Category; label: string; icon: typeof Bug; hint: string }[] = [
  { value: "bug",    label: "Bug / feil",  icon: Bug,       hint: "Noe fungerer ikke som forventet" },
  { value: "idea",   label: "Forslag",     icon: Lightbulb, hint: "Idé til forbedring eller ny funksjon" },
  { value: "praise", label: "Ros",         icon: Heart,     hint: "Ting som funker bra og bør beholdes" },
  { value: "other",  label: "Annet",       icon: Sparkles,  hint: "Generell tilbakemelding" },
];

/**
 * Visible only to users with role prototype_tester (or via preview).
 * Renders a floating bottom-right button that opens a contextual feedback
 * modal pre-filled with current page info.
 */
export function TesterFeedbackButton() {
  const { user } = useAuth();
  const { effectiveRole } = useRolePreview();
  const [location] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const [category, setCategory] = useState<Category>("bug");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [message, setMessage] = useState("");
  const [steps, setSteps] = useState("");

  const isTester = effectiveRole === "prototype_tester" || (user as any)?.role === "prototype_tester";

  const submit = useMutation({
    mutationFn: async () => {
      const payload = {
        message: message.trim(),
        category,
        severity,
        stepsToReproduce: steps.trim() || null,
        pagePath: location,
        pageTitle: typeof document !== "undefined" ? document.title : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        viewportWidth: typeof window !== "undefined" ? window.innerWidth : null,
        viewportHeight: typeof window !== "undefined" ? window.innerHeight : null,
        fullName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
        email: user?.email || null,
        extraContext: {
          role: effectiveRole,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        },
      };
      const res = await fetch("/api/tester-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Kunne ikke sende tilbakemelding");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Takk!", description: "Tilbakemelding sendt — vi svarer så snart som mulig." });
      setMessage("");
      setSteps("");
      setCategory("bug");
      setSeverity("medium");
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  // Keyboard shortcut: Shift+? opens the modal
  useEffect(() => {
    if (!isTester) return;
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "?" || e.key === "¿")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isTester]);

  if (!isTester) return null;

  const Icon = CATEGORIES.find(c => c.value === category)?.icon ?? Bug;

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed z-50 bottom-6 right-6 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all px-4 py-3 font-medium text-sm"
        aria-label="Gi tilbakemelding (Shift+?)"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Tilbakemelding</span>
        <Badge variant="secondary" className="ml-1 text-[9px] bg-primary-foreground/20 text-primary-foreground border-0">Tester</Badge>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
              Gi tilbakemelding
            </DialogTitle>
            <DialogDescription>
              Du er på <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{location}</span> —
              vi lagrer automatisk hvilken side du var på, nettleser og skjermstørrelse.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Category picker */}
            <div className="space-y-2">
              <Label>Kategori</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {CATEGORIES.map(({ value, label, icon: CatIcon, hint }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCategory(value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-colors",
                      category === value
                        ? "border-primary bg-primary/5 text-foreground"
                        : "hover:bg-muted/50 text-muted-foreground",
                    )}
                    title={hint}
                  >
                    <CatIcon className="h-5 w-5" />
                    <span className="font-medium">{label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {CATEGORIES.find(c => c.value === category)?.hint}
              </p>
            </div>

            {/* Severity (only for bugs) */}
            {category === "bug" && (
              <div className="space-y-2">
                <Label>Alvorlighetsgrad</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Lav — småting</SelectItem>
                    <SelectItem value="medium">Middels — påvirker flyten</SelectItem>
                    <SelectItem value="high">Høy — blokkerer meg</SelectItem>
                    <SelectItem value="critical">Kritisk — mister data eller går i kluss</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="fb-message">
                {category === "bug"
                  ? "Hva skjedde?"
                  : category === "idea"
                  ? "Beskriv forslaget"
                  : category === "praise"
                  ? "Hva likte du?"
                  : "Din tilbakemelding"}
                <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={category === "bug" ? "Det jeg prøvde, det som skjedde, og det jeg forventet…" : "Skriv så detaljert du kan."}
                rows={4}
                autoFocus
              />
            </div>

            {/* Steps (bug only) */}
            {category === "bug" && (
              <div className="space-y-2">
                <Label htmlFor="fb-steps">Steg for å reprodusere (valgfri)</Label>
                <Textarea
                  id="fb-steps"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  placeholder={"1. Gikk til…\n2. Klikket på…\n3. Forventet…, men fikk…"}
                  rows={3}
                />
              </div>
            )}

            {/* Context summary */}
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-foreground flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" /> Det vi sender automatisk
              </div>
              <div>Side: <span className="font-mono">{location}</span></div>
              <div className="truncate">Nettleser: {typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) + "…" : "—"}</div>
              <div>Skjerm: {typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight}` : "—"}</div>
              <div>Innlogget som: {user?.email ?? "ukjent"} ({effectiveRole})</div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button onClick={() => submit.mutate()} disabled={!message.trim() || submit.isPending}>
              {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageSquarePlus className="h-4 w-4 mr-2" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
