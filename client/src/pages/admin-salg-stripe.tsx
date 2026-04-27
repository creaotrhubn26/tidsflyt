import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, RefreshCw, ExternalLink, AlertCircle, CheckCircle2, Settings,
} from "lucide-react";

interface StripeStatus {
  configured: boolean;
  mode: "test" | "live" | null;
  tiers: Array<{
    id: number;
    slug: string;
    label: string;
    isActive: boolean;
    isEnterprise: boolean;
    stripeProductId: string | null;
    stripePriceIdMonthly: string | null;
    stripePriceIdAnnual: string | null;
    stripeOnboardingPriceId: string | null;
    stripeSyncedAt: string | null;
    syncedToStripe: boolean;
  }>;
}

interface SyncResult {
  results: Array<{
    tierId: number;
    slug: string;
    productId: string;
    monthlyPriceId: string | null;
    annualPriceId: string | null;
    onboardingPriceId: string | null;
    created: { product: boolean; monthly: boolean; annual: boolean; onboarding: boolean };
  }>;
  skipped: Array<{ slug: string; reason: string }>;
}

export default function AdminSalgStripe() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<StripeStatus>({
    queryKey: ["/api/admin/stripe/status"],
  });

  const syncAll = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/stripe/sync-tiers", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Sync feilet");
      return res.json() as Promise<SyncResult>;
    },
    onSuccess: (result) => {
      const created = result.results.reduce(
        (sum, r) => sum + (r.created.product ? 1 : 0) + (r.created.monthly ? 1 : 0) + (r.created.annual ? 1 : 0) + (r.created.onboarding ? 1 : 0),
        0,
      );
      toast({
        title: "Sync ferdig",
        description: `${result.results.length} tiers oppdatert · ${created} nye Stripe-objekter · ${result.skipped.length} hoppet over`,
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/stripe/status"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/pricing/tiers"] });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const syncOne = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/stripe/sync-tier/${id}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Sync feilet");
      return res.json();
    },
    onSuccess: (_data, id) => {
      toast({ title: "Synkronisert", description: `Tier #${id} oppdatert i Stripe` });
      qc.invalidateQueries({ queryKey: ["/api/admin/stripe/status"] });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const stripeDashboardBase =
    data?.mode === "live"
      ? "https://dashboard.stripe.com"
      : "https://dashboard.stripe.com/test";

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
            <h1 className="text-3xl font-bold tracking-tight">Stripe-integrasjon</h1>
            <p className="mt-2 text-muted-foreground">
              Synker pris-tiers til Stripe Products + Prices. Onboarding logges som
              en separat éngangs-pris. Enterprise-tiers hoppes over (selges manuelt).
            </p>
          </div>
          {data?.configured && (
            <Badge variant={data.mode === "live" ? "destructive" : "secondary"}>
              {data.mode === "live" ? "LIVE-mode" : "TEST-mode"}
            </Badge>
          )}
        </div>

        {/* Status banner */}
        {!isLoading && !data?.configured && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600" />
              <div className="flex-1">
                <strong>Stripe-nøkkel mangler.</strong>
                <p className="mt-1 text-sm">
                  Sett <code>stripe_secret_key</code> i{" "}
                  <Link href="/admin/salg/innstillinger" className="underline">Innstillinger → Stripe</Link>
                  {" "}før du kan synke produkter. Hent nøkkelen fra Stripe Dashboard → Developers → API keys.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action bar */}
        <div className="mb-6 flex flex-wrap gap-3">
          <Button onClick={() => syncAll.mutate()} disabled={!data?.configured || syncAll.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncAll.isPending ? "animate-spin" : ""}`} />
            {syncAll.isPending ? "Synker…" : "Sync alle tiers til Stripe"}
          </Button>
          <Link href="/admin/salg/innstillinger">
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />Stripe-nøkler
            </Button>
          </Link>
          {data?.configured && (
            <a href={`${stripeDashboardBase}/products`} target="_blank" rel="noreferrer">
              <Button variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" />Åpne Stripe Dashboard
              </Button>
            </a>
          )}
          <Button variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />Oppdater status
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tier-sync-status</CardTitle>
            <CardDescription>
              Hver tier blir til 1 Product + opptil 3 Prices i Stripe (månedlig per bruker, årlig per bruker, onboarding éngangs).
              Pris-endringer skaper ny Stripe Price (gamle arkiveres) — Stripe Prices er immutable på beløp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center text-muted-foreground">Laster…</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tier</TableHead>
                    <TableHead>Stripe Product</TableHead>
                    <TableHead>Månedlig price</TableHead>
                    <TableHead>Årlig price</TableHead>
                    <TableHead>Onboarding</TableHead>
                    <TableHead>Sist syncet</TableHead>
                    <TableHead className="text-right">Handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.tiers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.slug}
                          {t.isEnterprise && <Badge variant="outline" className="ml-1">Enterprise</Badge>}
                          {!t.isActive && <Badge variant="outline" className="ml-1">Inaktiv</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {t.stripeProductId ? (
                          <a
                            href={`${stripeDashboardBase}/products/${t.stripeProductId}`}
                            target="_blank" rel="noreferrer"
                            className="text-primary underline"
                          >
                            {t.stripeProductId.slice(0, 14)}…
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.stripePriceIdMonthly ? `${t.stripePriceIdMonthly.slice(0, 14)}…` : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.stripePriceIdAnnual ? `${t.stripePriceIdAnnual.slice(0, 14)}…` : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.stripeOnboardingPriceId ? `${t.stripeOnboardingPriceId.slice(0, 14)}…` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.stripeSyncedAt ? new Date(t.stripeSyncedAt).toLocaleString("no-NO") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.isEnterprise || !t.isActive ? (
                          <span className="text-xs text-muted-foreground">Skip</span>
                        ) : (
                          <Button size="sm" variant="ghost"
                            onClick={() => syncOne.mutate(t.id)}
                            disabled={!data?.configured || syncOne.isPending}>
                            {t.syncedToStripe ? (
                              <><CheckCircle2 className="mr-1 h-4 w-4 text-green-600" />Re-sync</>
                            ) : (
                              <><RefreshCw className="mr-1 h-4 w-4" />Sync</>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Webhook-oppsett</CardTitle>
            <CardDescription>
              For at signups skal logges til revenue_events automatisk, må du sette opp en Stripe webhook
              som peker til denne URL-en og lytter på følgende eventer:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <strong>Endpoint URL:</strong>
              <div className="mt-1 rounded bg-muted px-3 py-2 font-mono text-xs">
                {typeof window !== "undefined" ? `${window.location.origin}/api/stripe/webhook` : "/api/stripe/webhook"}
              </div>
            </div>
            <div>
              <strong>Events å lytte på:</strong>
              <ul className="ml-4 mt-1 list-disc space-y-1 text-muted-foreground">
                <li><code>checkout.session.completed</code> — ny signup</li>
                <li><code>customer.subscription.created</code> — bekreftet abonnement</li>
                <li><code>customer.subscription.updated</code> — upgrade/downgrade</li>
                <li><code>customer.subscription.deleted</code> — churn</li>
                <li><code>invoice.payment_failed</code> — dunning</li>
              </ul>
            </div>
            <div>
              <strong>Webhook signing secret:</strong> kopier <code>whsec_…</code> fra Stripe Dashboard
              og sett som <code>stripe_webhook_secret</code> i{" "}
              <Link href="/admin/salg/innstillinger" className="underline">Innstillinger</Link>.
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
