import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Shield, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Severity = "lav" | "middels" | "hoy" | "kritisk";
type Category =
  | "vold_trusler"
  | "egen_skade"
  | "andre_skade"
  | "rutinebrudd"
  | "klientrelatert"
  | "arbeidsmiljo"
  | "annet";

const SEVERITIES: { key: Severity; label: string; color: string; desc: string }[] = [
  { key: "lav", label: "Lav", color: "bg-emerald-100 text-emerald-900 border-emerald-300", desc: "Observasjon uten risiko" },
  { key: "middels", label: "Middels", color: "bg-amber-100 text-amber-900 border-amber-300", desc: "Bør følges opp" },
  { key: "hoy", label: "Høy", color: "bg-orange-100 text-orange-900 border-orange-300", desc: "Må følges opp raskt" },
  { key: "kritisk", label: "Kritisk", color: "bg-red-100 text-red-900 border-red-300", desc: "Varsel umiddelbart — gir e-post" },
];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "vold_trusler", label: "Vold eller trusler" },
  { key: "egen_skade", label: "Egen skade" },
  { key: "andre_skade", label: "Andre ble skadet" },
  { key: "rutinebrudd", label: "Brudd på rutine" },
  { key: "klientrelatert", label: "Klient-relatert hendelse" },
  { key: "arbeidsmiljo", label: "Arbeidsmiljø" },
  { key: "annet", label: "Annet" },
];

interface Props {
  trigger?: React.ReactNode;
  rapportId?: string | null;
  sakId?: string | null;
  institutionId?: string | null;
  defaultDate?: string;
  onDone?: () => void;
}

interface PersonItem {
  name: string;
  role: string;
}

function ymd(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function AvvikDialog({
  trigger,
  rapportId,
  sakId,
  institutionId,
  defaultDate,
  onDone,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [severity, setSeverity] = useState<Severity>("middels");
  const [category, setCategory] = useState<Category>("klientrelatert");
  const [dateOccurred, setDateOccurred] = useState<string>(defaultDate ?? ymd());
  const [timeOccurred, setTimeOccurred] = useState<string>("");
  const [location, setLocation] = useState<string>("");

  // Step 2
  const [description, setDescription] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [applyGdpr, setApplyGdpr] = useState(true);

  // Step 3
  const [followUp, setFollowUp] = useState(false);
  const [witnesses, setWitnesses] = useState<PersonItem[]>([]);
  const [personsInvolved, setPersonsInvolved] = useState<PersonItem[]>([]);

  const reset = () => {
    setStep(1);
    setSeverity("middels");
    setCategory("klientrelatert");
    setDateOccurred(defaultDate ?? ymd());
    setTimeOccurred("");
    setLocation("");
    setDescription("");
    setImmediateAction("");
    setApplyGdpr(true);
    setFollowUp(false);
    setWitnesses([]);
    setPersonsInvolved([]);
  };

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/avvik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rapportId: rapportId || null,
          sakId: sakId || null,
          institutionId: institutionId || null,
          dateOccurred,
          timeOccurred: timeOccurred || null,
          location: location || null,
          severity,
          category,
          description,
          immediateAction: immediateAction || null,
          followUpNeeded: followUp,
          witnesses,
          personsInvolved,
          applyGdprAutoReplace: applyGdpr,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Kunne ikke sende" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/avvik/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/avvik"] });
      queryClient.invalidateQueries({ queryKey: ["/api/avvik/stats"] });
      toast({
        title: "Avvik registrert",
        description: data?.gdprAutoReplaced
          ? "Takk. Personnavn i beskrivelsen er maskert."
          : "Takk. Tiltaksleder er varslet.",
      });
      setOpen(false);
      reset();
      onDone?.();
    },
    onError: (e: any) => {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    },
  });

  const canProceed1 = !!severity && !!category && !!dateOccurred;
  const canProceed2 = description.trim().length >= 10;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2 border-amber-300 text-amber-900 hover:bg-amber-50">
            <AlertTriangle className="h-4 w-4" />
            Meld avvik
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Meld avvik
          </DialogTitle>
          <DialogDescription>
            Steg {step} av 3 — {step === 1 ? "Hva skjedde?" : step === 2 ? "Beskrivelse" : "Hvem var involvert og oppfølging"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-1">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                n <= step ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Alvorlighetsgrad</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {SEVERITIES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSeverity(s.key)}
                    className={cn(
                      "rounded-md border-2 px-3 py-2 text-left transition-all",
                      severity === s.key ? s.color + " shadow-sm" : "border-muted hover:bg-accent/40",
                    )}
                  >
                    <p className="text-sm font-semibold">{s.label}</p>
                    <p className="text-[10px] opacity-70">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Kategori</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] border transition-colors",
                      category === c.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-muted hover:bg-accent/40",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Dato</Label>
                <Input
                  type="date"
                  value={dateOccurred}
                  onChange={(e) => setDateOccurred(e.target.value)}
                  max={ymd()}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Tidspunkt (valgfritt)</Label>
                <Input
                  type="time"
                  value={timeOccurred}
                  onChange={(e) => setTimeOccurred(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Sted (valgfritt)</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="F.eks. institusjon, klients hjem, kjøretøy"
                className="mt-1"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="avvik-desc" className="text-xs">
                Hva skjedde? <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="avvik-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="Beskriv hendelsen så konkret som mulig. Hvor var du, hva skjedde, hva gjorde du."
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Minimum 10 tegn. {description.length} tegn skrevet.
              </p>
            </div>

            <div>
              <Label htmlFor="avvik-action" className="text-xs">Hva ble gjort i øyeblikket?</Label>
              <Textarea
                id="avvik-action"
                value={immediateAction}
                onChange={(e) => setImmediateAction(e.target.value)}
                rows={3}
                placeholder="Kort om umiddelbar handling — varsling, førstehjelp, evakuering, ingen."
                className="mt-1"
              />
            </div>

            <label className="flex items-start gap-2 rounded-md border bg-emerald-50/50 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={applyGdpr}
                onChange={(e) => setApplyGdpr(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-700"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-900 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Smart GDPR — masker personnavn automatisk
                </p>
                <p className="text-[11px] text-emerald-800/80 mt-0.5">
                  Navn du skriver inn i "Involverte personer" (neste steg) erstattes med initialer i beskrivelsen før lagring. Opprinnelig tekst lagres kryptert og kan hentes av leder ved behov.
                </p>
              </div>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            <PersonListEditor
              title="Involverte personer"
              hint="Navn og rolle (f.eks. klient, kollega, pårørende). Brukes for GDPR-maskering hvis aktivert."
              items={personsInvolved}
              setItems={setPersonsInvolved}
            />

            <PersonListEditor
              title="Vitner"
              hint="Personer som observerte hendelsen."
              items={witnesses}
              setItems={setWitnesses}
            />

            <label className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={followUp}
                onChange={(e) => setFollowUp(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">Avviket krever videre oppfølging</span>
            </label>

            <div className="rounded-md border bg-primary/5 p-3 text-xs">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                Klart for innsending
              </p>
              <ul className="mt-2 space-y-0.5 text-muted-foreground">
                <li>• Tiltaksleder varsles umiddelbart</li>
                {severity === "kritisk" && <li className="text-red-700">• E-post sendes i tillegg grunnet kritisk nivå</li>}
                {applyGdpr && personsInvolved.length > 0 && (
                  <li className="text-emerald-700">• Personnavn maskeres i beskrivelsen</li>
                )}
                <li>• Du kan se status og leder-kommentarer under "Mine avvik"</li>
              </ul>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>
              Tilbake
            </Button>
          )}
          {step < 3 && (
            <Button
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              disabled={(step === 1 && !canProceed1) || (step === 2 && !canProceed2)}
            >
              Neste
            </Button>
          )}
          {step === 3 && (
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send inn avvik
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PersonListEditor ─────────────────────────────────────────────────────────

function PersonListEditor({
  title,
  hint,
  items,
  setItems,
}: {
  title: string;
  hint: string;
  items: PersonItem[];
  setItems: (v: PersonItem[]) => void;
}) {
  const [draftName, setDraftName] = useState("");
  const [draftRole, setDraftRole] = useState("");

  return (
    <div>
      <Label className="text-xs">{title}</Label>
      <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
      <div className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5">
            <span className="text-sm">{it.name}</span>
            {it.role && <Badge variant="secondary" className="text-[10px]">{it.role}</Badge>}
            <button
              type="button"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
              className="ml-auto text-muted-foreground hover:text-destructive"
              aria-label="Fjern"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Navn"
            className="text-sm"
          />
          <Input
            value={draftRole}
            onChange={(e) => setDraftRole(e.target.value)}
            placeholder="Rolle (valgfritt)"
            className="text-sm w-40"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (!draftName.trim()) return;
              setItems([...items, { name: draftName.trim(), role: draftRole.trim() }]);
              setDraftName("");
              setDraftRole("");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
