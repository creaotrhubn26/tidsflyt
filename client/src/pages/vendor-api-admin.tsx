import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Key, Plus, Trash2, Copy, CheckCircle, XCircle, Clock, Shield, RefreshCw, ExternalLink, LogIn, Lock } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Link } from "wouter";

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  permissions: string[];
  rateLimit: number;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface VendorApiStatus {
  apiAccessEnabled: boolean;
  apiSubscriptionStart: string | null;
  apiSubscriptionEnd: string | null;
  apiMonthlyPrice: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: "read:time_entries", label: "Les timeregistreringer" },
  { id: "read:users", label: "Les brukere" },
  { id: "read:reports", label: "Les rapporter" },
  { id: "read:projects", label: "Les prosjekter" },
  { id: "*", label: "Full tilgang" },
];

export default function VendorApiAdminPage() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(["read:time_entries"]);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const isAuthorized = user?.role === "vendor_admin" || user?.role === "super_admin";

  const { data: apiStatus, isLoading: statusLoading } = useQuery<VendorApiStatus>({
    queryKey: ["/api/vendor/api-status"],
    enabled: isAuthenticated && isAuthorized,
  });

  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/vendor/api-keys"],
    enabled: isAuthenticated && isAuthorized,
  });

  const createKeyMutation = useMutation({
    mutationFn: async (data: { name: string; permissions: string[] }) => {
      const response = await apiRequest("POST", "/api/vendor/api-keys", data);
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedKey(data.key);
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/api-keys"] });
      toast({ title: "API-nokkel opprettet" });
    },
    onError: () => {
      toast({ title: "Kunne ikke opprette API-nokkel", variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      await apiRequest("DELETE", `/api/vendor/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/api-keys"] });
      toast({ title: "API-nokkel deaktivert" });
    },
    onError: () => {
      toast({ title: "Kunne ikke deaktivere API-nokkel", variant: "destructive" });
    },
  });

  const enableApiMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/vendor/enable-api");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/api-status"] });
      toast({ title: "API-tilgang aktivert" });
    },
    onError: () => {
      toast({ title: "Kunne ikke aktivere API-tilgang", variant: "destructive" });
    },
  });

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      toast({ title: "Navn er pakrevd", variant: "destructive" });
      return;
    }
    createKeyMutation.mutate({ name: newKeyName, permissions: selectedPermissions });
  };

  const handleCopyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      toast({ title: "Kopiert til utklippstavle" });
    }
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    setNewKeyName("");
    setSelectedPermissions(["read:time_entries"]);
    setGeneratedKey(null);
  };

  const togglePermission = (permId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permId)
        ? prev.filter((p) => p !== permId)
        : [...prev, permId]
    );
  };

  if (authLoading) {
    return <div className="p-8 text-center text-muted-foreground">Laster...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-16 px-4 max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <LogIn className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Logg inn for a fortsette</CardTitle>
            <CardDescription>
              Du ma vaere innlogget for a administrere API-nokler
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <a href="/api/login">
              <Button data-testid="button-login">
                <LogIn className="h-4 w-4 mr-2" />
                Logg inn
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="container mx-auto py-16 px-4 max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Ingen tilgang</CardTitle>
            <CardDescription>
              Du har ikke tilgang til a administrere API-nokler. Kontakt din administrator for a fa tilgang.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Link href="/">
              <Button variant="outline" data-testid="link-go-home">
                Ga til forsiden
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (statusLoading) {
    return <div className="p-8 text-center text-muted-foreground">Laster...</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-api-admin-title">
            <Key className="h-6 w-6" />
            API-administrasjon
          </h1>
          <p className="text-muted-foreground">Administrer API-tilgang og nokler</p>
        </div>
        <Link href="/api-docs">
          <Button variant="outline" data-testid="link-api-docs">
            <ExternalLink className="h-4 w-4 mr-2" />
            Se dokumentasjon
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Abonnementsstatus
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {apiStatus?.apiAccessEnabled ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="font-medium">API-tilgang er aktivert</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">API-tilgang er ikke aktivert</span>
                    </>
                  )}
                </div>
                {apiStatus?.apiAccessEnabled && apiStatus.apiSubscriptionEnd && (
                  <p className="text-sm text-muted-foreground">
                    Gyldig til: {format(new Date(apiStatus.apiSubscriptionEnd), "d. MMMM yyyy", { locale: nb })}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Pris: <strong>{apiStatus?.apiMonthlyPrice || "99.00"} kr/mnd</strong>
                </p>
              </div>
              {!apiStatus?.apiAccessEnabled && (
                <Button 
                  onClick={() => enableApiMutation.mutate()} 
                  disabled={enableApiMutation.isPending}
                  data-testid="button-enable-api"
                >
                  {enableApiMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                  Aktiver API-tilgang
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>API-nokler</CardTitle>
              <CardDescription>Administrer dine API-nokler for integrasjon</CardDescription>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  disabled={!apiStatus?.apiAccessEnabled}
                  data-testid="button-create-api-key"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ny nokkel
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Opprett ny API-nokkel</DialogTitle>
                  <DialogDescription>
                    {generatedKey 
                      ? "Kopier nokkelen na - den vises ikke igjen!" 
                      : "Velg navn og tillatelser for den nye nokkelen"}
                  </DialogDescription>
                </DialogHeader>

                {generatedKey ? (
                  <div className="space-y-4 py-4">
                    <div className="p-4 bg-muted rounded-md">
                      <Label className="text-sm text-muted-foreground">Din nye API-nokkel:</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <code className="text-sm font-mono flex-1 break-all">{generatedKey}</code>
                        <Button size="icon" variant="ghost" onClick={handleCopyKey}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-3 bg-warning/10 rounded-md border border-warning/20 text-sm">
                      Viktig: Lagre denne nokkelen trygt. Du kan ikke se den igjen etter at du lukker dette vinduet.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="key-name">Navn</Label>
                      <Input
                        id="key-name"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="f.eks. Produksjon, Test"
                        data-testid="input-api-key-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tillatelser</Label>
                      <div className="space-y-2">
                        {AVAILABLE_PERMISSIONS.map((perm) => (
                          <div key={perm.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={perm.id}
                              checked={selectedPermissions.includes(perm.id)}
                              onCheckedChange={() => togglePermission(perm.id)}
                              data-testid={`checkbox-permission-${perm.id}`}
                            />
                            <label htmlFor={perm.id} className="text-sm cursor-pointer">
                              <code className="bg-muted px-1 rounded mr-2">{perm.id}</code>
                              {perm.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <DialogFooter>
                  {generatedKey ? (
                    <Button onClick={handleCloseCreateDialog} data-testid="button-close-key-dialog">
                      Lukk
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={handleCloseCreateDialog}>
                        Avbryt
                      </Button>
                      <Button 
                        onClick={handleCreateKey} 
                        disabled={createKeyMutation.isPending}
                        data-testid="button-confirm-create-key"
                      >
                        {createKeyMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                        Opprett
                      </Button>
                    </>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {keysLoading ? (
              <p className="text-muted-foreground text-center py-4">Laster nokler...</p>
            ) : !apiKeys || apiKeys.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Ingen API-nokler opprettet enna. Klikk "Ny nokkel" for a opprette en.
              </p>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div 
                    key={key.id} 
                    className="flex items-center justify-between p-4 border rounded-md gap-4 flex-wrap"
                    data-testid={`api-key-row-${key.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{key.name}</span>
                        {key.isActive ? (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-600">Aktiv</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-red-500/10 text-red-600">Deaktivert</Badge>
                        )}
                      </div>
                      <code className="text-sm text-muted-foreground">{key.keyPrefix}...</code>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Opprettet: {format(new Date(key.createdAt), "d. MMM yyyy", { locale: nb })}
                        </span>
                        {key.lastUsedAt && (
                          <span>Sist brukt: {format(new Date(key.lastUsedAt), "d. MMM yyyy", { locale: nb })}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {key.permissions.map((perm) => (
                          <Badge key={perm} variant="outline" className="text-xs">{perm}</Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => revokeKeyMutation.mutate(key.id)}
                      disabled={!key.isActive || revokeKeyMutation.isPending}
                      data-testid={`button-revoke-key-${key.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
