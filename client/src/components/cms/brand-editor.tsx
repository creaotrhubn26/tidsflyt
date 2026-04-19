/**
 * CMS BrandEditor — edits the global brand contact info (support email,
 * phone, address, legal email, company name + tagline). These render in
 * footers, contact CTAs and accessibility/legal pages across the public
 * surface.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { BrandInfo } from "@/hooks/use-brand-info";
import { Loader2, Save, Building2 } from "lucide-react";

const KEY = ["/api/cms/brand"];

export function BrandEditor() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<BrandInfo>({ queryKey: KEY });
  const [draft, setDraft] = useState<BrandInfo | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (next: BrandInfo) => {
      const res = await fetch("/api/cms/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Lagring feilet");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast({ title: "Merkevare-info lagret", description: "Endringene gjelder umiddelbart for footer og kontakt-lenker." });
    },
    onError: (e: any) => toast({ title: "Lagring feilet", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !draft) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Laster merkevare-info…
      </div>
    );
  }

  const set = <K extends keyof BrandInfo>(k: K, v: BrandInfo[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          Merkevare og kontakt
        </CardTitle>
        <CardDescription>
          Vises i footer, på kontakt-/personvern-/tilgjengelighetssidene og i e-post-lenker overalt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Selskapsnavn">
            <Input value={draft.companyName} onChange={(e) => set("companyName", e.target.value)} />
          </Field>
          <Field label="Slagord / kort beskrivelse">
            <Input value={draft.companyTagline} onChange={(e) => set("companyTagline", e.target.value)} />
          </Field>
          <Field label="Support e-post">
            <Input type="email" value={draft.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} />
          </Field>
          <Field label="Telefon">
            <Input value={draft.supportPhone} onChange={(e) => set("supportPhone", e.target.value)} />
          </Field>
          <Field label="Adresse">
            <Input value={draft.supportAddress} onChange={(e) => set("supportAddress", e.target.value)} />
          </Field>
          <Field label="Juridisk e-post">
            <Input type="email" value={draft.legalEmail} onChange={(e) => set("legalEmail", e.target.value)} />
          </Field>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Lagre
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
