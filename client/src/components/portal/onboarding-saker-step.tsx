import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FolderKanban, Building2, Users, Plus, Trash2, CheckCircle2, Loader2, UserPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstitutions } from "@/hooks/use-institutions";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
}

interface Sak {
  id: string;
  saksnummer: string;
  tittel: string;
  klientRef?: string | null;
  oppdragsgiver?: string | null;
  institutionId?: string | null;
  tildelteUserId?: number[];
}

export function OnboardingSakerStep() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { institutions } = useInstitutions();

  const { data: saker = [] } = useQuery<Sak[]>({
    queryKey: ["/api/saker"],
    staleTime: 30_000,
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/email/team-members"],
    staleTime: 60_000,
  });

  // Only miljøarbeidere/members are assignable to saker
  const assignables = useMemo(
    () => teamMembers.filter(m => {
      const r = String(m.role || "").toLowerCase();
      return r === "miljoarbeider" || r === "miljøarbeider" || r === "member" || r === "user";
    }),
    [teamMembers],
  );

  // Form state
  const [saksnummer, setSaksnummer] = useState(() => suggestSaksnummer());
  const [tittel, setTittel] = useState("");
  const [klientRef, setKlientRef] = useState("");
  const [institutionId, setInstitutionId] = useState<string>("");
  const [oppdragsgiver, setOppdragsgiver] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const selectedInstitution = institutions.find(i => i.id === institutionId);

  const createSak = useMutation({
    mutationFn: async () => {
      // 1. Create the sak
      const sak = await apiRequest("POST", "/api/saker", {
        saksnummer: saksnummer.trim(),
        tittel: tittel.trim(),
        klientRef: klientRef.trim() || null,
        oppdragsgiver: oppdragsgiver.trim() || selectedInstitution?.name || null,
        institutionId: institutionId || null,
        tiltakstype: "miljøarbeid",
      }).then(r => r.json());

      // 2. Assign users (if any)
      if (selectedAssignees.length > 0 && sak?.id) {
        await apiRequest("POST", `/api/saker/${sak.id}/tildel`, {
          userIds: selectedAssignees.map(id => Number(id) || id),
        });
      }
      return sak;
    },
    onSuccess: () => {
      toast({ title: "Sak opprettet", description: `${saksnummer} er lagt til` });
      qc.invalidateQueries({ queryKey: ["/api/saker"] });
      // Reset form
      setSaksnummer(suggestSaksnummer());
      setTittel("");
      setKlientRef("");
      setInstitutionId("");
      setOppdragsgiver("");
      setSelectedAssignees([]);
    },
    onError: (e: any) => {
      toast({ title: "Feil", description: e?.message || "Kunne ikke opprette sak", variant: "destructive" });
    },
  });

  const deleteSak = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/saker/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/saker"] }),
  });

  const canCreate = saksnummer.trim() && tittel.trim();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-primary/5 border-primary/20 p-4">
        <div className="flex items-start gap-3">
          <FolderKanban className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Registrer første sak</p>
            <p className="text-xs text-muted-foreground">
              Opprett en sak og tildel den til miljøarbeidere. Knytt den gjerne til en institusjon — da får rapportene riktig mal automatisk.
            </p>
          </div>
        </div>
      </div>

      {/* Existing saker */}
      {saker.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Registrerte saker ({saker.length})
          </Label>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {saker.map((s) => {
              const assignCount = Array.isArray(s.tildelteUserId) ? s.tildelteUserId.length : 0;
              const inst = institutions.find(i => i.id === s.institutionId);
              return (
                <div key={s.id} className="flex items-start gap-2 rounded-lg border bg-card p-2.5">
                  <div className="rounded p-1.5 bg-primary/10 text-primary flex-shrink-0">
                    <FolderKanban className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-primary">{s.saksnummer}</span>
                      <span className="text-sm truncate">{s.tittel}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                      {inst && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {inst.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {assignCount} tildelt
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={() => {
                      if (confirm(`Slett sak ${s.saksnummer}?`)) deleteSak.mutate(s.id);
                    }}
                    aria-label="Slett sak"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create new sak form */}
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          {saker.length === 0 ? "Første sak" : "Ny sak"}
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Saksnummer *</Label>
            <Input
              value={saksnummer}
              onChange={(e) => setSaksnummer(e.target.value)}
              placeholder="BV-2026-001"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Klient-ref (anonym)</Label>
            <Input
              value={klientRef}
              onChange={(e) => setKlientRef(e.target.value)}
              placeholder="ungdom-A"
              className="h-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Tittel *</Label>
          <Input
            value={tittel}
            onChange={(e) => setTittel(e.target.value)}
            placeholder="Oppfølging av ungdom i bolig"
            className="h-9"
          />
        </div>

        {institutions.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Building2 className="h-3 w-3" /> Institusjon (valgfri)
            </Label>
            <Select
              value={institutionId || "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") {
                  setInstitutionId("");
                } else {
                  setInstitutionId(v);
                  const inst = institutions.find(i => i.id === v);
                  if (inst && !oppdragsgiver) setOppdragsgiver(inst.name);
                }
              }}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Velg institusjon…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— ikke knyttet —</SelectItem>
                {institutions.map(i => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Oppdragsgiver (valgfri)</Label>
          <Input
            value={oppdragsgiver}
            onChange={(e) => setOppdragsgiver(e.target.value)}
            placeholder={selectedInstitution?.name || "Auto-utfylles fra institusjon"}
            className="h-9"
          />
        </div>

        {/* Assignees */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <UserPlus className="h-3 w-3" /> Tildel til miljøarbeidere
          </Label>
          {assignables.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground text-center">
              Ingen miljøarbeidere i teamet ennå. Du kan invitere folk først, eller opprette saken uten tildeling — tildel senere fra sak-detaljene.
            </div>
          ) : (
            <div className="grid gap-1.5 md:grid-cols-2 max-h-44 overflow-y-auto pr-1">
              {assignables.map((m) => {
                const checked = selectedAssignees.includes(m.id);
                const displayName = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || "Uten navn";
                return (
                  <label
                    key={m.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer transition-colors",
                      checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        if (v) setSelectedAssignees([...selectedAssignees, m.id]);
                        else setSelectedAssignees(selectedAssignees.filter(id => id !== m.id));
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{displayName}</p>
                      {m.email && <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <Button
          onClick={() => createSak.mutate()}
          disabled={!canCreate || createSak.isPending}
          className="w-full"
        >
          {createSak.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Oppretter…</>
          ) : (
            <><CheckCircle2 className="h-4 w-4 mr-2" /> Opprett {saker.length === 0 ? "første sak" : "sak"}</>
          )}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Du kan alltids legge til flere saker senere fra <span className="font-medium">Saker</span>-menyen.
      </p>
    </div>
  );
}

function suggestSaksnummer(): string {
  const year = new Date().getFullYear();
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `SAK-${year}-${rand}`;
}
