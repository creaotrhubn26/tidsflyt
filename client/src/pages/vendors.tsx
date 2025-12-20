import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { 
  Building2, 
  Plus, 
  Edit, 
  Trash2, 
  Users, 
  UserPlus, 
  UserCheck,
  Loader2,
  Save,
  Search,
  Shield
} from "lucide-react";

interface VendorData {
  id: number;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  status: string;
  max_users: number;
  subscription_plan: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface VendorAdmin {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

function authenticatedApiRequest(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('admin_token');
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  }).then(async res => {
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Request failed');
    }
    return res.json();
  });
}

export default function VendorsPage() {
  const { toast } = useToast();
  const [showVendorDialog, setShowVendorDialog] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<VendorData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [vendorForm, setVendorForm] = useState({
    name: '',
    slug: '',
    email: '',
    phone: '',
    address: '',
    status: 'active',
    maxUsers: 50,
    subscriptionPlan: 'standard',
  });
  const [adminForm, setAdminForm] = useState({
    username: '',
    email: '',
    password: '',
  });

  const { data: vendors = [], isLoading } = useQuery<VendorData[]>({
    queryKey: ['/api/vendors'],
    queryFn: () => authenticatedApiRequest('/api/vendors'),
  });

  const { data: vendorAdmins = [], refetch: refetchAdmins } = useQuery<VendorAdmin[]>({
    queryKey: ['/api/vendors', selectedVendor?.id, 'admins'],
    queryFn: () => authenticatedApiRequest(`/api/vendors/${selectedVendor?.id}/admins`),
    enabled: !!selectedVendor,
  });

  const saveVendorMutation = useMutation({
    mutationFn: async (data: typeof vendorForm & { id?: number }) => {
      const url = data.id ? `/api/vendors/${data.id}` : '/api/vendors';
      return authenticatedApiRequest(url, {
        method: data.id ? 'PUT' : 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Lagret', description: 'Leverandør er lagret' });
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      setShowVendorDialog(false);
      setSelectedVendor(null);
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const deleteVendorMutation = useMutation({
    mutationFn: async (id: number) => {
      return authenticatedApiRequest(`/api/vendors/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: 'Slettet', description: 'Leverandør er slettet' });
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: async (data: typeof adminForm) => {
      return authenticatedApiRequest(`/api/vendors/${selectedVendor?.id}/admins`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Opprettet', description: 'Administrator er opprettet' });
      refetchAdmins();
      setShowAdminDialog(false);
      setAdminForm({ username: '', email: '', password: '' });
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const openVendorEditor = (vendor?: VendorData) => {
    if (vendor) {
      setSelectedVendor(vendor);
      setVendorForm({
        name: vendor.name,
        slug: vendor.slug,
        email: vendor.email || '',
        phone: vendor.phone || '',
        address: vendor.address || '',
        status: vendor.status,
        maxUsers: vendor.max_users,
        subscriptionPlan: vendor.subscription_plan,
      });
    } else {
      setSelectedVendor(null);
      setVendorForm({
        name: '',
        slug: '',
        email: '',
        phone: '',
        address: '',
        status: 'active',
        maxUsers: 50,
        subscriptionPlan: 'standard',
      });
    }
    setShowVendorDialog(true);
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };

  const statusLabels: Record<string, string> = {
    active: 'Aktiv',
    suspended: 'Suspendert',
    inactive: 'Inaktiv',
  };

  const planLabels: Record<string, string> = {
    basic: 'Basis',
    standard: 'Standard',
    premium: 'Premium',
  };

  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <PortalLayout user={{ name: "Super Admin", email: "admin@tidsflyt.no", role: "super_admin" }}>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Leverandøradministrasjon
            </h1>
            <p className="text-muted-foreground">Administrer leverandører og deres tilganger</p>
          </div>
          <Button onClick={() => openVendorEditor()} data-testid="button-add-vendor">
            <Plus className="h-4 w-4 mr-2" />
            Ny leverandør
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Leverandører ({filteredVendors.length})
                </CardTitle>
                <CardDescription>Alle registrerte leverandører i systemet</CardDescription>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk leverandører..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                  data-testid="input-search-vendors"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">
                  {searchQuery ? 'Ingen leverandører funnet' : 'Ingen leverandører registrert'}
                </p>
                <p className="mb-4">
                  {searchQuery ? 'Prøv et annet søkeord' : 'Legg til den første leverandøren for å komme i gang'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => openVendorEditor()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Legg til leverandør
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredVendors.map((vendor) => (
                  <div
                    key={vendor.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover-elevate"
                    data-testid={`vendor-row-${vendor.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-muted">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-semibold text-lg">{vendor.name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
                          <span className="font-mono">{vendor.slug}</span>
                          <Badge 
                            variant={vendor.status === 'active' ? 'default' : 'secondary'}
                            className={vendor.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : ''}
                          >
                            {statusLabels[vendor.status] || vendor.status}
                          </Badge>
                          <Badge variant="outline">
                            {planLabels[vendor.subscription_plan] || vendor.subscription_plan}
                          </Badge>
                          <span className="text-xs">Maks {vendor.max_users} brukere</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedVendor(vendor);
                          setShowAdminDialog(true);
                        }}
                        data-testid={`button-manage-admins-${vendor.id}`}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Admins
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openVendorEditor(vendor)}
                        data-testid={`button-edit-vendor-${vendor.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Er du sikker på at du vil slette ${vendor.name}?`)) {
                            deleteVendorMutation.mutate(vendor.id);
                          }
                        }}
                        data-testid={`button-delete-vendor-${vendor.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showVendorDialog} onOpenChange={setShowVendorDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedVendor ? 'Rediger leverandør' : 'Ny leverandør'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vendor-name">Navn</Label>
                  <Input
                    id="vendor-name"
                    value={vendorForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setVendorForm({ 
                        ...vendorForm, 
                        name,
                        slug: selectedVendor ? vendorForm.slug : generateSlug(name)
                      });
                    }}
                    placeholder="Bedriftsnavn"
                    data-testid="input-vendor-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-slug">Slug</Label>
                  <Input
                    id="vendor-slug"
                    value={vendorForm.slug}
                    onChange={(e) => setVendorForm({ ...vendorForm, slug: e.target.value })}
                    placeholder="bedriftsnavn"
                    data-testid="input-vendor-slug"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vendor-email">E-post</Label>
                  <Input
                    id="vendor-email"
                    type="email"
                    value={vendorForm.email}
                    onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                    placeholder="kontakt@bedrift.no"
                    data-testid="input-vendor-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-phone">Telefon</Label>
                  <Input
                    id="vendor-phone"
                    value={vendorForm.phone}
                    onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                    placeholder="+47 123 45 678"
                    data-testid="input-vendor-phone"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor-address">Adresse</Label>
                <Input
                  id="vendor-address"
                  value={vendorForm.address}
                  onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
                  placeholder="Gate 1, 0000 By"
                  data-testid="input-vendor-address"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select
                    value={vendorForm.status}
                    onChange={(e) => setVendorForm({ ...vendorForm, status: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="select-vendor-status"
                  >
                    <option value="active">Aktiv</option>
                    <option value="suspended">Suspendert</option>
                    <option value="inactive">Inaktiv</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Abonnement</Label>
                  <select
                    value={vendorForm.subscriptionPlan}
                    onChange={(e) => setVendorForm({ ...vendorForm, subscriptionPlan: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="select-vendor-plan"
                  >
                    <option value="basic">Basis</option>
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-max-users">Maks brukere</Label>
                  <Input
                    id="vendor-max-users"
                    type="number"
                    value={vendorForm.maxUsers}
                    onChange={(e) => setVendorForm({ ...vendorForm, maxUsers: parseInt(e.target.value) || 0 })}
                    data-testid="input-vendor-max-users"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowVendorDialog(false)}>
                Avbryt
              </Button>
              <Button
                onClick={() => saveVendorMutation.mutate({
                  ...vendorForm,
                  id: selectedVendor?.id,
                })}
                disabled={saveVendorMutation.isPending || !vendorForm.name || !vendorForm.slug}
                data-testid="button-save-vendor"
              >
                {saveVendorMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Lagre
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Administratorer for {selectedVendor?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                {vendorAdmins.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>Ingen administratorer lagt til</p>
                  </div>
                ) : (
                  vendorAdmins.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-muted">
                          <UserCheck className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium">{admin.username}</div>
                          <div className="text-sm text-muted-foreground">{admin.email}</div>
                        </div>
                      </div>
                      <Badge variant={admin.is_active ? 'default' : 'secondary'}>
                        {admin.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Legg til administrator
                </h4>
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="admin-username">Brukernavn</Label>
                      <Input
                        id="admin-username"
                        value={adminForm.username}
                        onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                        placeholder="brukernavn"
                        data-testid="input-admin-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-email">E-post</Label>
                      <Input
                        id="admin-email"
                        type="email"
                        value={adminForm.email}
                        onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                        placeholder="admin@bedrift.no"
                        data-testid="input-admin-email"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-password">Passord</Label>
                    <Input
                      id="admin-password"
                      type="password"
                      value={adminForm.password}
                      onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                      placeholder="Midlertidig passord"
                      data-testid="input-admin-password"
                    />
                  </div>
                  <Button
                    onClick={() => createAdminMutation.mutate(adminForm)}
                    disabled={createAdminMutation.isPending || !adminForm.username || !adminForm.email || !adminForm.password}
                    className="w-full"
                    data-testid="button-create-admin"
                  >
                    {createAdminMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                    Opprett administrator
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
