/**
 * PowerOffice Go connect card.
 *
 * Shown on /settings for vendor_admin+ roles. Lets the admin paste their
 * per-tenant ClientKey from their PowerOffice Go client; the server
 * verifies it with PowerOffice (client_credentials token exchange)
 * before persisting.
 *
 * The ClientKey is a secret — we never display it back; the UI only
 * shows connection status + an optional label.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, Link2, Loader2, Unplug, Upload, AlertTriangle,
  PlugZap, ChevronDown, Users,
} from "lucide-react";
import { PowerOfficeMappingsTable } from "./poweroffice-mappings-table";

interface StatusResponse {
  connected?: boolean;
  serverConfigured: boolean;
  hidden?: boolean;
  id?: string;
  label?: string | null;
  status?: string;
  lastVerifiedAt?: string | null;
  lastUsedAt?: string | null;
  lastError?: string | null;
}

const STATUS_KEY = ["/api/integrations/poweroffice/status"];

function defaultPushMonth(): string {
  // Default to the previous calendar month — that's what admins normally push.
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface PushResponse {
  month: string;
  vendorId: number;
  pushed: number;
  failed: number;
  skipped: number;
  errors: Array<{ userId: string; date?: string; reason: string }>;
}

export function PowerOfficeConnectCard() {
  const { toast } = useToast();
  const [clientKey, setClientKey] = useState("");
  const [label, setLabel] = useState("");
  const [pushMonth, setPushMonth] = useState<string>(defaultPushMonth());
  const [lastPushResult, setLastPushResult] = useState<PushResponse | null>(null);
  const [mappingsOpen, setMappingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading } = useQuery<StatusResponse>({
    queryKey: STATUS_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/integrations/poweroffice/status");
      return res.json();
    },
    staleTime: 30_000,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/poweroffice/connect", {
        clientKey: clientKey.trim(),
        label: label.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Koblet til PowerOffice", description: "ClientKey verifisert og lagret." });
      setClientKey("");
      setLabel("");
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    onError: (err: any) => {
      toast({
        title: "Tilkobling feilet",
        description: String(err?.message || err).replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/integrations/poweroffice/disconnect");
    },
    onSuccess: () => {
      toast({ title: "Koblet fra PowerOffice" });
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    onError: (err: any) => {
      toast({
        title: "Kunne ikke koble fra",
        description: String(err?.message || err),
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/poweroffice/test");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Tilkobling OK", description: "PowerOffice bekreftet ClientKey." });
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    onError: (err: any) => {
      toast({
        title: "Tilkobling feilet",
        description: String(err?.message || err).replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });

  const pushMutation = useMutation({
    mutationFn: async (): Promise<PushResponse> => {
      const res = await apiRequest("POST", "/api/integrations/poweroffice/push-timer", {
        month: pushMonth,
      });
      return res.json();
    },
    onSuccess: (result) => {
      setLastPushResult(result);
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      if (result.pushed > 0 && result.failed === 0) {
        toast({
          title: "Timeliste sendt",
          description: `${result.pushed} oppføringer pushet til PowerOffice for ${result.month}.`,
        });
      } else if (result.pushed > 0 && result.failed > 0) {
        toast({
          title: "Delvis sendt",
          description: `${result.pushed} pushet, ${result.failed} feilet. Se detaljer nedenfor.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Ingenting sendt",
          description: result.errors[0]?.reason ?? "Ingen godkjente timelister for denne måneden.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Push feilet",
        description: String(err?.message || err).replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const connected = !!data?.connected;
  const serverConfigured = !!data?.serverConfigured;

  // Super-admin has hidden the integration for this vendor. Render nothing —
  // the tiltaksleder should not see a hint that it exists.
  if (data?.hidden) return null;

  return (
    <Card data-testid="poweroffice-connect-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          PowerOffice Go
          {connected && (
            <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 bg-emerald-50">
              <CheckCircle2 className="h-3 w-3" /> Tilkoblet
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Godkjente timelister pushes automatisk til PowerOffice Go. Miljøarbeidere trenger ikke gjøre
          noe — de logger timer, du som tiltaksleder godkjenner, og overføringen skjer i bakgrunnen.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!serverConfigured && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
            Serveren har ikke PowerOffice-nøkler konfigurert ennå. Kontakt support.
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter status…
          </div>
        ) : connected ? (
          <div className="space-y-3">
            {data?.label && (
              <div className="text-sm">
                <span className="text-muted-foreground">Klient: </span>
                <span className="font-medium">{data.label}</span>
              </div>
            )}
            {data?.lastVerifiedAt && (
              <div className="text-xs text-muted-foreground">
                Sist verifisert: {new Date(data.lastVerifiedAt).toLocaleString("nb-NO")}
              </div>
            )}
            {data?.lastUsedAt && (
              <div className="text-xs text-muted-foreground">
                Sist brukt: {new Date(data.lastUsedAt).toLocaleString("nb-NO")}
              </div>
            )}
            {data?.lastError && (
              <p className="flex items-start gap-1.5 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Siste feil: {data.lastError}</span>
              </p>
            )}

            {/* Re-push panel — primary flow is auto-push on approve */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Overfør på nytt</p>
                  <p className="text-xs text-muted-foreground">
                    Godkjente timelister pushes automatisk. Bruk denne for å re-pushe ved feil eller etter nye mappings.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="month"
                  value={pushMonth}
                  onChange={(e) => setPushMonth(e.target.value)}
                  className="max-w-[180px]"
                  data-testid="poweroffice-push-month"
                />
                <Button
                  variant="outline"
                  onClick={() => pushMutation.mutate()}
                  disabled={pushMutation.isPending || !/^\d{4}-\d{2}$/.test(pushMonth)}
                  data-testid="poweroffice-push-submit"
                >
                  {pushMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sender…</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" /> Re-push måned</>
                  )}
                </Button>
              </div>
              {lastPushResult && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="tabular-nums">
                    {lastPushResult.pushed} pushet · {lastPushResult.failed} feilet · {lastPushResult.skipped} hoppet over
                  </div>
                  {lastPushResult.errors.length > 0 && (
                    <details className="text-[11px]">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Feildetaljer ({lastPushResult.errors.length})
                      </summary>
                      <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                        {lastPushResult.errors.slice(0, 8).map((e, i) => (
                          <li key={i}>
                            <span className="font-mono">{e.userId}</span>
                            {e.date ? ` · ${e.date}` : ""} — {e.reason}
                          </li>
                        ))}
                        {lastPushResult.errors.length > 8 && (
                          <li className="italic">…og {lastPushResult.errors.length - 8} til</li>
                        )}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* Mappings — collapsible list with all users */}
            <Collapsible open={mappingsOpen} onOpenChange={setMappingsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between" data-testid="poweroffice-mappings-toggle">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Ansatt-kobling
                  </span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", mappingsOpen && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <PowerOfficeMappingsTable />
              </CollapsibleContent>
            </Collapsible>

            {/* Actions row */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                data-testid="poweroffice-test"
              >
                {testMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Tester…</>
                ) : (
                  <><PlugZap className="h-4 w-4 mr-2" /> Test tilkobling</>
                )}
              </Button>

              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="poweroffice-disconnect">
                    <Unplug className="h-4 w-4 mr-2" /> Koble fra
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Koble fra PowerOffice?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dette fjerner lagret ClientKey og stanser pushing av timelister.
                      Ansatt-koblinger beholdes, men brukes ikke før du kobler til igjen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => { setConfirmOpen(false); disconnectMutation.mutate(); }}
                    >
                      Koble fra
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-clientkey">ClientKey</Label>
              <Input
                id="po-clientkey"
                type="password"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={clientKey}
                onChange={(e) => setClientKey(e.target.value)}
                autoComplete="off"
                data-testid="poweroffice-clientkey-input"
              />
              <p className="text-xs text-muted-foreground">
                Hentet fra PowerOffice Go: Innstillinger → Integrasjoner → API-nøkler.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-label">Etikett (valgfritt)</Label>
              <Input
                id="po-label"
                placeholder="F.eks. «Hovedklient»"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                data-testid="poweroffice-label-input"
              />
            </div>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={!clientKey.trim() || connectMutation.isPending || !serverConfigured}
              data-testid="poweroffice-connect-submit"
            >
              {connectMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verifiserer…</>
              ) : (
                "Koble til"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
