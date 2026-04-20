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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle2, Link2, Loader2, Unplug } from "lucide-react";

interface StatusResponse {
  connected?: boolean;
  serverConfigured: boolean;
  id?: string;
  label?: string | null;
  status?: string;
  lastVerifiedAt?: string | null;
  lastUsedAt?: string | null;
  lastError?: string | null;
}

const STATUS_KEY = ["/api/integrations/poweroffice/status"];

export function PowerOfficeConnectCard() {
  const { toast } = useToast();
  const [clientKey, setClientKey] = useState("");
  const [label, setLabel] = useState("");

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

  const connected = !!data?.connected;
  const serverConfigured = !!data?.serverConfigured;

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
          Push timeregistreringer direkte til PowerOffice Go. Generer en ClientKey i din PowerOffice-klient
          og lim den inn her.
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
            {data?.lastError && (
              <p className="text-sm text-red-600">Siste feil: {data.lastError}</p>
            )}
            <Button
              variant="outline"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="poweroffice-disconnect"
            >
              {disconnectMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Kobler fra…</>
              ) : (
                <><Unplug className="h-4 w-4 mr-2" /> Koble fra</>
              )}
            </Button>
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
