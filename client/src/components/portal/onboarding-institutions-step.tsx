import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Building2, Search, Plus, Trash2, CheckCircle2, Loader2, Forward, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBrregSearch, type BrregCompany } from "@/hooks/use-brreg-search";
import { useInstitutions } from "@/hooks/use-institutions";
import { cn } from "@/lib/utils";

/**
 * Onboarding step: add the institutions (oppdragsgivere) the vendor works with.
 * Uses Brreg lookup for fast entry, then asks per-institution about
 * overtime applicability and optional auto-forwarding.
 */
export function OnboardingInstitutionsStep() {
  const { toast } = useToast();
  const { institutions, create, remove } = useInstitutions();
  const brreg = useBrregSearch();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) brreg.setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [brreg]);

  const handleAdd = async (company: BrregCompany) => {
    setCreating(true);
    try {
      const addr = company.forretningsadresse;
      const addressStr = addr
        ? [addr.adresse?.join(", "), addr.postnummer, addr.poststed].filter(Boolean).join(", ")
        : "";
      await create.mutateAsync({
        name: company.navn,
        orgNumber: company.organisasjonsnummer,
        address: addressStr || undefined,
        brregVerified: true,
        // Smart defaults — tiltaksleder can refine later
        institutionType: guessTypeFromName(company.navn),
        overtimeApplicable: true,
        autoForwardRapport: false,
      });
      toast({ title: "Lagt til", description: company.navn });
      setQuery("");
      brreg.reset();
    } catch (e: any) {
      toast({
        title: "Kunne ikke legge til",
        description: e.message?.includes("finnes allerede")
          ? "Institusjonen er allerede registrert"
          : e.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-primary/5 border-primary/20 p-4">
        <div className="flex items-start gap-3">
          <Building2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Hvilke institusjoner jobber dere med?</p>
            <p className="text-xs text-muted-foreground">
              Legg til oppdragsgiverne deres — barnevernstjenester, NAV-kontor, kommuner. Søk i Brønnøysundregisteret for å fylle ut automatisk.
            </p>
          </div>
        </div>
      </div>

      {/* Brreg search */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); brreg.search(e.target.value); }}
            onFocus={() => { if (brreg.results.length > 0) brreg.setOpen(true); }}
            placeholder="Søk etter institusjon — navn eller org-nr (9 siffer)…"
            className="pl-9"
            autoComplete="off"
          />
          {brreg.loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        {brreg.open && brreg.results.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {brreg.results.map((c: BrregCompany) => {
              const exists = institutions.some(i => i.orgNumber === c.organisasjonsnummer);
              return (
                <button
                  key={c.organisasjonsnummer}
                  type="button"
                  disabled={exists || creating}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b last:border-0 transition-colors",
                    exists ? "opacity-50 cursor-not-allowed" : "hover:bg-accent",
                  )}
                  onClick={() => !exists && handleAdd(c)}
                >
                  <div className="flex items-start gap-2">
                    <Plus className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{c.navn}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span className="font-mono">{c.organisasjonsnummer}</span>
                        {c.forretningsadresse?.poststed && <span>· {c.forretningsadresse.poststed}</span>}
                      </div>
                    </div>
                    {exists && <Badge variant="outline" className="text-[10px]">Lagt til</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Added list */}
      {institutions.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          Ingen institusjoner lagt til ennå.<br />
          <span className="text-xs">Du kan også gjøre dette senere fra "Institusjoner" i menyen.</span>
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Lagt til ({institutions.length})
          </Label>
          {institutions.map((inst) => (
            <InstitutionRow key={inst.id} inst={inst} onRemove={() => remove.mutate(inst.id)} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Du kan endre detaljer, slå på auto-videresending og overtidsregler senere fra <span className="font-medium">Institusjoner</span>-siden.
      </p>
    </div>
  );
}

function InstitutionRow({ inst, onRemove }: { inst: any; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card p-2.5">
      <div className="rounded p-1.5 bg-primary/10 text-primary flex-shrink-0">
        <Building2 className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{inst.name}</p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {inst.orgNumber && <span className="font-mono">{inst.orgNumber}</span>}
          {inst.brregVerified && (
            <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-600 px-1 py-0">
              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Brreg
            </Badge>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
        onClick={onRemove}
        aria-label={`Fjern ${inst.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * Heuristic to pre-pick a plausible institution type from the name.
 * Vendor admin can change it later.
 */
function guessTypeFromName(name: string): string {
  const n = name.toLowerCase();
  if (/barnevern/i.test(n)) return "barnevern";
  if (/\bnav\b/i.test(n)) return "nav";
  if (/kommune|kommunen|fylke/i.test(n)) return "kommune";
  if (/sykehus|legevakt|helse|legekontor|klinikk/i.test(n)) return "helsevesen";
  if (/\bas\b|\basa\b|stiftelse|forening/i.test(n)) return "privat";
  return "annet";
}
