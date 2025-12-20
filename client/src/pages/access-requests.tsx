import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserPlus, Check, X, Clock, Building, Mail, Phone, MessageSquare, CheckCircle, XCircle, LogIn, Lock } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Link } from "wouter";

interface AccessRequest {
  id: number;
  fullName: string;
  email: string;
  orgNumber: string | null;
  company: string | null;
  phone: string | null;
  message: string | null;
  brregVerified: boolean;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  vendorId: number | null;
  createdAt: string;
}

interface Vendor {
  id: number;
  name: string;
}

export default function AccessRequestsPage() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");

  const isSuperAdmin = user?.role === "super_admin";

  const { data: requests, isLoading } = useQuery<AccessRequest[]>({
    queryKey: ["/api/access-requests", statusFilter],
    queryFn: async () => {
      const response = await fetch(`/api/access-requests?status=${statusFilter}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
    enabled: isAuthenticated && isSuperAdmin,
  });

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated && isSuperAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, vendorId }: { id: number; status: string; vendorId?: number }) => {
      await apiRequest("PATCH", `/api/access-requests/${id}`, { status, vendorId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/access-requests"] });
      toast({ title: "Foresporsel oppdatert" });
      setApproveDialogOpen(false);
      setSelectedRequest(null);
      setSelectedVendorId("");
    },
    onError: () => {
      toast({ title: "Kunne ikke oppdatere foresporsel", variant: "destructive" });
    },
  });

  const handleApprove = (request: AccessRequest) => {
    setSelectedRequest(request);
    setApproveDialogOpen(true);
  };

  const handleReject = (request: AccessRequest) => {
    updateMutation.mutate({ id: request.id, status: "rejected" });
  };

  const confirmApprove = () => {
    if (selectedRequest && selectedVendorId) {
      updateMutation.mutate({
        id: selectedRequest.id,
        status: "approved",
        vendorId: parseInt(selectedVendorId),
      });
    }
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
              Du ma vaere innlogget for a administrere tilgangsforesporsler
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

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto py-16 px-4 max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Ingen tilgang</CardTitle>
            <CardDescription>
              Kun super-administratorer kan administrere tilgangsforesporsler.
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Venter</Badge>;
      case "approved":
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Godkjent</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Avvist</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-access-requests-title">
            <UserPlus className="h-6 w-6" />
            Tilgangsforesporsler
          </h1>
          <p className="text-muted-foreground">Administrer forespørsler om tilgang til Tidsflyt</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="Filtrer etter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Venter</SelectItem>
            <SelectItem value="approved">Godkjent</SelectItem>
            <SelectItem value="rejected">Avvist</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Laster foresporsler...</div>
      ) : !requests?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Ingen foresporsler med status "{statusFilter}"</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id} data-testid={`card-request-${request.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-lg">{request.fullName}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
                      <Mail className="h-3 w-3" />
                      {request.email}
                      {request.phone && (
                        <>
                          <span className="text-muted-foreground">|</span>
                          <Phone className="h-3 w-3" />
                          {request.phone}
                        </>
                      )}
                    </CardDescription>
                  </div>
                  {getStatusBadge(request.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(request.company || request.orgNumber) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span>{request.company}</span>
                    {request.orgNumber && (
                      <span className="text-muted-foreground">
                        (Org.nr: {request.orgNumber})
                        {request.brregVerified && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                            Brreg-verifisert
                          </Badge>
                        )}
                      </span>
                    )}
                  </div>
                )}
                {request.message && (
                  <div className="flex items-start gap-2 text-sm">
                    <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <p className="text-muted-foreground">{request.message}</p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground">
                    Mottatt: {format(new Date(request.createdAt), "d. MMMM yyyy 'kl.' HH:mm", { locale: nb })}
                  </span>
                  {request.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(request)}
                        disabled={updateMutation.isPending}
                        data-testid={`button-reject-${request.id}`}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Avvis
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(request)}
                        disabled={updateMutation.isPending}
                        data-testid={`button-approve-${request.id}`}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Godkjenn
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Godkjenn tilgang</DialogTitle>
            <DialogDescription>
              Velg hvilken leverandor brukeren skal tilhorere
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Bruker</Label>
              <p className="text-sm text-muted-foreground">{selectedRequest?.fullName} ({selectedRequest?.email})</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-select">Leverandor</Label>
              <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                <SelectTrigger id="vendor-select" data-testid="select-vendor">
                  <SelectValue placeholder="Velg leverandor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors?.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id.toString()}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Avbryt
            </Button>
            <Button 
              onClick={confirmApprove} 
              disabled={!selectedVendorId || updateMutation.isPending}
              data-testid="button-confirm-approve"
            >
              <Check className="h-4 w-4 mr-1" />
              Godkjenn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
