/**
 * Arkiv-tilkoblingskort (Noark 5 via Documaster).
 *
 * Vises på /settings for vendor_admin+ — samme plassering og mønster som
 * PowerOffice-kortet. Admin fyller inn Documaster-instansens base-URL,
 * OAuth2 client_id/secret og arkivdel; serveren verifiserer tilkoblingen
 * før noe lagres. Secret vises aldri tilbake.
 *
 * Kortet viser også arkivloggen (outbox-radene) med manuell retry for
 * feilede arkiveringer.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  AlertTriangle, Archive, CheckCircle2, ChevronDown, FileArchive,
  Loader2, PlugZap, RefreshCw, ShieldAlert, Unplug,
} from "lucide-react";

interface ArkivStatusResponse {
  connected?: boolean;
  hidden?: boolean;
  id?: string;
  provider?: string;
  baseUrl?: string;
  arkivdelId?: string | null;
  journalenhet?: string | null;
  klasseId?: string | null;
  autoArchive?: boolean;
  skjermingshjemmel?: string | null;
  tilgangsrestriksjon?: string | null;
  status?: string;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
}

interface ArkivEntry {
  id: string;
  entityType: string;
  entityId: string;
  status: "pending" | "processing" | "archived" | "failed" | "skipped";
  triggerKind?: string | null;
  attempts: number;
  journalpostIdent?: string | null;
  error?: string | null;
  archivedAt?: string | null;
  createdAt?: string | null;
}

const STATUS_KEY = ["/api/integrations/arkiv/status"];
const ENTRIES_KEY = ["/api/integrations/arkiv/entries"];

// Vanlige hjemler for skjerming i klientrettet arbeid — fritekstfeltet
// tillater alt, disse er bare snarveier.
const HJEMMEL_PRESETS = [
  "Offl. § 13 jf. fvl. § 13",
  "Offl. § 13 jf. bvl. § 13-1",
];

function cleanErr(err: unknown): string {
  return String((err as any)?.message || err).replace(/^\d+:\s*/, "");
}

function EntryStatusBadge({ status }: { status: ArkivEntry["status"] }) {
  switch (status) {
    case "archived":
      return (
        <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 bg-emerald-50">
          <CheckCircle2 className="h-3 w-3" /> Arkivert
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 bg-amber-50">
          <Loader2 className="h-3 w-3" /> Venter
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="outline" className="gap-1 border-blue-300 text-blue-700 bg-blue-50">
          <Loader2 className="h-3 w-3 animate-spin" /> Arkiverer
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="gap-1 border-red-300 text-red-700 bg-red-50">
          <AlertTriangle className="h-3 w-3" /> Feilet
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function ArkivEntriesTable() {
  const { toast } = useToast();
  const { data: entries, isLoading } = useQuery<ArkivEntry[]>({
    queryKey: ENTRIES_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/integrations/arkiv/entries");
      return res.json();
    },
    staleTime: 15_000,
  });

  const retryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const res = await apiRequest("POST", `/api/integrations/arkiv/entries/${entryId}/retry`);
      return res.json();
    },
    onSuccess: (entry: ArkivEntry) => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_KEY });
      if (entry.status === "archived") {
        toast({ title: "Arkivert", description: "Rapporten ble arkivert i arkivkjernen." });
      } else {
        toast({
          title: "Forsøk startet",
          description: entry.error ? `Feilet igjen: ${entry.error}` : "Arkivering pågår.",
          variant: entry.error ? "destructive" : undefined,
        });
      }
    },
    onError: (err: unknown) => {
      toast({ title: "Retry feilet", description: cleanErr(err), variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Henter arkivlogg…
      </div>
    );
  }
  if (!entries?.length) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Ingen arkiveringer ennå. Dokumenter og avsluttede sikre dialoger dukker opp her.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm" aria-label="Arkivlogg">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th scope="col" className="px-3 py-2 font-medium">Type</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 font-medium">Journalpost</th>
            <th scope="col" className="px-3 py-2 font-medium">Tidspunkt</th>
            <th scope="col" className="px-3 py-2 font-medium sr-only">Handling</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border last:border-0 align-top">
              <td className="px-3 py-2 capitalize">{entry.entityType}</td>
              <td className="px-3 py-2">
                <div className="space-y-1">
                  <EntryStatusBadge status={entry.status} />
                  {entry.status !== "archived" && entry.attempts > 0 && (
                    <div className="text-[11px] text-muted-foreground">{entry.attempts} forsøk</div>
                  )}
                  {entry.error && (
                    <div className="text-[11px] text-red-600 max-w-[260px] break-words">{entry.error}</div>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{entry.journalpostIdent ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                {entry.archivedAt
                  ? new Date(entry.archivedAt).toLocaleString("nb-NO")
                  : entry.createdAt
                    ? new Date(entry.createdAt).toLocaleString("nb-NO")
                    : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {(entry.status === "failed" || entry.status === "pending") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => retryMutation.mutate(entry.id)}
                    disabled={retryMutation.isPending}
                    data-testid={`arkiv-retry-${entry.id}`}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", retryMutation.isPending && "animate-spin")} />
                    Prøv igjen
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ArkivConnectCard() {
  const { toast } = useToast();
  const [baseUrl, setBaseUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [arkivdelId, setArkivdelId] = useState("");
  const [journalenhet, setJournalenhet] = useState("");
  const [klasseId, setKlasseId] = useState("");
  const [skjermingshjemmel, setSkjermingshjemmel] = useState(HJEMMEL_PRESETS[0]);
  const [logOpen, setLogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading } = useQuery<ArkivStatusResponse>({
    queryKey: STATUS_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/integrations/arkiv/status");
      return res.json();
    },
    staleTime: 30_000,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/arkiv/connect", {
        provider: "documaster",
        baseUrl: baseUrl.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        arkivdelId: arkivdelId.trim() || undefined,
        journalenhet: journalenhet.trim() || undefined,
        klasseId: klasseId.trim() || undefined,
        skjermingshjemmel: skjermingshjemmel.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Arkiv tilkoblet", description: "Tilkoblingen er verifisert og lagret." });
      setClientSecret("");
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    onError: (err: unknown) => {
      toast({ title: "Tilkobling feilet", description: cleanErr(err), variant: "destructive" });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", "/api/integrations/arkiv/settings", patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    onError: (err: unknown) => {
      toast({ title: "Kunne ikke oppdatere", description: cleanErr(err), variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/arkiv/test");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Tilkobling OK", description: "Arkivkjernen svarte." });
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    onError: (err: unknown) => {
      toast({ title: "Tilkobling feilet", description: cleanErr(err), variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/integrations/arkiv/disconnect");
    },
    onSuccess: () => {
      toast({ title: "Arkiv koblet fra" });
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    onError: (err: unknown) => {
      toast({ title: "Kunne ikke koble fra", description: cleanErr(err), variant: "destructive" });
    },
  });

  const connected = !!data?.connected;
  if (data?.hidden) return null;

  const canSubmit =
    baseUrl.trim().startsWith("https://") && clientId.trim() && clientSecret.trim();

  return (
    <Card data-testid="arkiv-connect-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Archive className="h-5 w-5" />
          Arkiv (Noark 5 / Documaster)
          {connected && (
            <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 bg-emerald-50">
              <CheckCircle2 className="h-3 w-3" /> Tilkoblet
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Dokumenter og avsluttede sikre dialoger arkiveres som journalposter i arkivkjernen deres,
          med skjerming og idempotent kvittering. Offentlige titler inneholder ikke navn eller emne.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter status…
          </div>
        ) : connected ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Instans:</dt>
                <dd className="font-medium break-all">{data?.baseUrl}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Arkivdel:</dt>
                <dd className="font-mono text-xs self-center">{data?.arkivdelId ?? "—"}</dd>
              </div>
              {data?.klasseId && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Primærklasse:</dt>
                  <dd className="font-mono text-xs self-center">{data.klasseId}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Skjerming:</dt>
                <dd>{data?.skjermingshjemmel} ({data?.tilgangsrestriksjon})</dd>
              </div>
              {data?.lastVerifiedAt && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Sist verifisert:</dt>
                  <dd>{new Date(data.lastVerifiedAt).toLocaleString("nb-NO")}</dd>
                </div>
              )}
            </dl>

            {data?.lastError && (
              <p className="flex items-start gap-1.5 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Siste feil: {data.lastError}</span>
              </p>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <Label htmlFor="arkiv-auto" className="text-sm font-medium">
                  Automatisk arkivering
                </Label>
                <p className="text-xs text-muted-foreground">
                  Arkiver rapporter i det de godkjennes. Manuell arkivering er alltid tilgjengelig.
                </p>
              </div>
              <Switch
                id="arkiv-auto"
                checked={data?.autoArchive !== false}
                onCheckedChange={(checked) => settingsMutation.mutate({ autoArchive: checked })}
                disabled={settingsMutation.isPending}
                data-testid="arkiv-auto-archive-switch"
              />
            </div>

            {/* Arkivlogg */}
            <Collapsible open={logOpen} onOpenChange={setLogOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between" data-testid="arkiv-log-toggle">
                  <span className="flex items-center gap-2">
                    <FileArchive className="h-4 w-4" />
                    Arkivlogg
                  </span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", logOpen && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <ArkivEntriesTable />
              </CollapsibleContent>
            </Collapsible>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                data-testid="arkiv-test"
              >
                {testMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Tester…</>
                ) : (
                  <><PlugZap className="h-4 w-4 mr-2" /> Test tilkobling</>
                )}
              </Button>

              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="arkiv-disconnect">
                    <Unplug className="h-4 w-4 mr-2" /> Koble fra
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Koble fra arkivet?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dette fjerner lagrede tilkoblingsdetaljer og stanser arkivering av nye
                      rapporter. Allerede arkiverte journalposter blir liggende i arkivkjernen.
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
              <Label htmlFor="arkiv-baseurl">Base-URL</Label>
              <Input
                id="arkiv-baseurl"
                type="url"
                placeholder="https://dinvirksomhet.documaster.no"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                autoComplete="off"
                data-testid="arkiv-baseurl-input"
              />
              <p className="text-xs text-muted-foreground">
                Adressen til Documaster-instansen deres. Må bruke https.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="arkiv-clientid">Client ID</Label>
                <Input
                  id="arkiv-clientid"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  autoComplete="off"
                  data-testid="arkiv-clientid-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="arkiv-clientsecret">Client secret</Label>
                <Input
                  id="arkiv-clientsecret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  autoComplete="off"
                  data-testid="arkiv-clientsecret-input"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="arkiv-arkivdel">Arkivdel-ID</Label>
                <Input
                  id="arkiv-arkivdel"
                  value={arkivdelId}
                  onChange={(e) => setArkivdelId(e.target.value)}
                  autoComplete="off"
                  data-testid="arkiv-arkivdel-input"
                />
                <p className="text-xs text-muted-foreground">
                  Arkivdelen journalposter skal registreres i.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="arkiv-journalenhet">Journalenhet (valgfritt)</Label>
                <Input
                  id="arkiv-journalenhet"
                  value={journalenhet}
                  onChange={(e) => setJournalenhet(e.target.value)}
                  autoComplete="off"
                  data-testid="arkiv-journalenhet-input"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arkiv-klasse">Primærklasse-ID (valgfritt)</Label>
              <Input
                id="arkiv-klasse"
                value={klasseId}
                onChange={(e) => setKlasseId(e.target.value)}
                autoComplete="off"
                data-testid="arkiv-klasse-input"
              />
              <p className="text-xs text-muted-foreground">
                Fylles kun ut hvis arkivkjernen krever klassifikasjon på saksmapper —
                id-en til klassen mappene skal knyttes til.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arkiv-hjemmel">Skjermingshjemmel</Label>
              <Input
                id="arkiv-hjemmel"
                value={skjermingshjemmel}
                onChange={(e) => setSkjermingshjemmel(e.target.value)}
                data-testid="arkiv-hjemmel-input"
              />
              <div className="flex flex-wrap gap-1.5">
                {HJEMMEL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSkjermingshjemmel(preset)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      skjermingshjemmel === preset
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Alle journalposter skjermes med denne hjemmelen (unntatt offentlighet).
                  For barnevernssaker: bruk bvl. § 13-1-varianten.
                </span>
              </p>
            </div>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={!canSubmit || connectMutation.isPending}
              data-testid="arkiv-connect-submit"
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
