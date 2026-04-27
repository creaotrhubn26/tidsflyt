import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, ExternalLink } from "lucide-react";

// Mirrors the pricing-page CMS content shape (server-side defaults in
// smartTimingRoutes.ts → getPageDefaults('pricing')). Each key is a piece
// of customer-facing copy that admin can override without code-deploy.
interface PricingCopy {
  title?: string;
  subtitle?: string;
  calculator_title?: string;
  calculator_user_label?: string;
  cta_request_access?: string;
  cta_enterprise?: string;
  cta_contact_sales?: string;
  footer_note?: string;
}

const FIELDS: Array<{
  key: keyof PricingCopy;
  label: string;
  hint: string;
  multiline?: boolean;
}> = [
  { key: "title",                 label: "Sidetittel", hint: "Hovedoverskrift øverst på /priser" },
  { key: "subtitle",              label: "Underbrødtekst", hint: "Vises under tittelen", multiline: true },
  { key: "calculator_title",      label: "Kalkulator-tittel", hint: "Header på pris-kalkulatoren" },
  { key: "calculator_user_label", label: "Slider-etikett", hint: "Tekst over brukerantall-slideren" },
  { key: "cta_request_access",    label: "CTA: Be om tilgang", hint: "Knappetekst for standard tier" },
  { key: "cta_enterprise",        label: "CTA: Enterprise", hint: "Knappetekst når kunden er > Custom-bånd" },
  { key: "cta_contact_sales",     label: "CTA: Kontakt salg", hint: "Knappetekst på Custom/Enterprise-tier-kort" },
  { key: "footer_note",           label: "Footer-info", hint: "Disclaimer nederst på siden", multiline: true },
];

export default function AdminSalgSidetekster() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<PricingCopy>({
    queryKey: ["/api/cms/pages/pricing"],
  });

  const [edits, setEdits] = useState<PricingCopy>({});

  useEffect(() => {
    if (data) setEdits(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (next: PricingCopy) => {
      const res = await fetch("/api/cms/pages/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Lagring feilet");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cms/pages/pricing"] });
      toast({ title: "Lagret", description: "Endringer er live på /priser umiddelbart." });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-8">
        <Link href="/admin/salg">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />Tilbake
          </Button>
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sidetekster — /priser</h1>
            <p className="mt-2 text-muted-foreground">
              All kundevendt tekst på prissiden. Endringer trer i kraft umiddelbart.
              Selve tier-tabellen og inkluderte features ligger i
              <Link href="/admin/salg/tiers" className="ml-1 underline">Pris-tiers</Link>.
            </p>
          </div>
          <a href="/priser" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-2 h-4 w-4" />Se siden
            </Button>
          </a>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tekstinnhold</CardTitle>
            <CardDescription>
              Tom verdi gir innebygd standardtekst. Lagre én gang for å overstyre.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center text-muted-foreground">Laster…</div>
            ) : (
              <div className="space-y-5">
                {FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label>{f.label}</Label>
                    {f.multiline ? (
                      <Textarea
                        rows={3}
                        value={edits[f.key] ?? ""}
                        onChange={(e) => setEdits((p) => ({ ...p, [f.key]: e.target.value }))}
                      />
                    ) : (
                      <Input
                        value={edits[f.key] ?? ""}
                        onChange={(e) => setEdits((p) => ({ ...p, [f.key]: e.target.value }))}
                      />
                    )}
                    <p className="text-xs text-muted-foreground">{f.hint}</p>
                  </div>
                ))}

                <Button onClick={() => save.mutate(edits)} disabled={save.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {save.isPending ? "Lagrer…" : "Lagre alle"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Andre sidetekster</CardTitle>
            <CardDescription>
              Kontakt-, personvern- og vilkår-sidene redigeres i CMS.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/cms">
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />Åpne CMS
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
