import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save } from "lucide-react";

interface AppSetting {
  key: string;
  value: string | null;
  dataType: string;
  category: string;
  label: string | null;
  description: string | null;
  sortOrder: number;
  isSecret: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  pricing: "Pricing",
  contract: "Kontrakt",
  brand: "Leverandør / kontaktinfo",
  sla: "SLA",
  general: "Generelt",
};

export default function AdminSalgSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery<AppSetting[]>({
    queryKey: ["/api/admin/settings"],
  });

  const [edits, setEdits] = useState<Record<string, string>>({});

  // Initialise edits when settings load
  useEffect(() => {
    if (settings) {
      const initial: Record<string, string> = {};
      for (const s of settings) initial[s.key] = s.value ?? "";
      setEdits(initial);
    }
  }, [settings]);

  const grouped = useMemo(() => {
    if (!settings) return {};
    const out: Record<string, AppSetting[]> = {};
    for (const s of settings) {
      if (!out[s.category]) out[s.category] = [];
      out[s.category].push(s);
    }
    return out;
  }, [settings]);

  const update = useMutation({
    mutationFn: async (input: { key: string; value: string }) => {
      const res = await fetch(`/api/admin/settings/${input.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: input.value }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Lagring feilet");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      qc.invalidateQueries({ queryKey: ["/api/pricing/tiers"] });
    },
    onError: (err: any) =>
      toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const handleSave = async (key: string) => {
    await update.mutateAsync({ key, value: edits[key] ?? "" });
    toast({ title: "Lagret", description: key });
  };

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-8">
        <Link href="/admin/salg">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tilbake
          </Button>
        </Link>

        <h1 className="mb-2 text-3xl font-bold tracking-tight">Innstillinger</h1>
        <p className="mb-8 text-muted-foreground">
          Globale konfig-verdier som styrer pricing-side, kontraktsmaler og SLA-tekst.
          Endringer trer i kraft umiddelbart.
        </p>

        {isLoading ? (
          <div className="text-center text-muted-foreground">Laster…</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, rows]) => (
              <Card key={cat}>
                <CardHeader>
                  <CardTitle>{CATEGORY_LABELS[cat] ?? cat}</CardTitle>
                  <CardDescription>{rows.length} verdier</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {rows.map((s) => (
                    <div key={s.key} className="grid gap-2 sm:grid-cols-[280px_1fr_auto] sm:items-start">
                      <div>
                        <Label className="font-medium">{s.label ?? s.key}</Label>
                        <div className="text-xs text-muted-foreground">{s.key}</div>
                        {s.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                        )}
                      </div>
                      <Input
                        value={edits[s.key] ?? ""}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                        type={s.dataType === "number" ? "number" : "text"}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={(edits[s.key] ?? "") === (s.value ?? "")}
                        onClick={() => handleSave(s.key)}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Lagre
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
