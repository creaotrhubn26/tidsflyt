import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Shield,
  BarChart3,
  TrendingUp,
  AlertCircle,
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"all" | "analytics">("all");
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

  // Analytics calculations
  const analytics = useMemo(() => {
    if (!vendors) return { 
      total: 0, 
      active: 0, 
      suspended: 0, 
      inactive: 0,
      totalUsers: 0,
      avgUsersPerVendor: 0,
      basicCount: 0,
      standardCount: 0,
      premiumCount: 0,
    };
    
    const total = vendors.length;
    const active = vendors.filter(v => v.status === 'active').length;
    const suspended = vendors.filter(v => v.status === 'suspended').length;
    const inactive = vendors.filter(v => v.status === 'inactive').length;
    const totalUsers = vendors.reduce((sum, v) => sum + v.max_users, 0);
    const avgUsersPerVendor = total > 0 ? (totalUsers / total).toFixed(1) : '0';
    const basicCount = vendors.filter(v => v.subscription_plan === 'basic').length;
    const standardCount = vendors.filter(v => v.subscription_plan === 'standard').length;
    const premiumCount = vendors.filter(v => v.subscription_plan === 'premium').length;
    
    return { 
      total, 
      active, 
      suspended, 
      inactive,
      totalUsers,
      avgUsersPerVendor: parseFloat(avgUsersPerVendor as string),
      basicCount,
      standardCount,
      premiumCount,
    };
  }, [vendors]);

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

  const filteredVendors = vendors.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          v.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
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

        <Tabs value={viewMode} onValueChange={(val) => setViewMode(val as "all" | "analytics")}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-vendors">
              <Building2 className="h-4 w-4 mr-1" />
              Leverandører
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              <BarChart3 className="h-4 w-4 mr-1" />
              Statistikk
            </TabsTrigger>
          </TabsList>

          {/* Leverandører Tab */}
          <TabsContent value="all" className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filtrer etter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statuser</SelectItem>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="suspended">Suspendert</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk leverandører..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-vendors"
                />
              </div>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                {searchQuery ? (
                  <>
                    <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-muted/60 border border-border mb-4">
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-semibold mb-1">Ingen leverandører funnet</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-xs">Prøv et annet søkeord eller juster filteret.</p>
                  </>
                ) : (
                  <>
                    <div className="relative mb-8">
                      <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-2xl scale-150" />
                      <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 shadow-lg">
                        <Building2 className="h-9 w-9 text-blue-500" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-semibold mb-3">Ingen leverandører ennå</h3>
                    <p className="text-muted-foreground text-center max-w-sm mb-8 leading-relaxed">
                      Legg til den første leverandøren for å komme i gang med administrasjonen.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mb-8">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-700 dark:text-blue-400">
                        <Users className="h-3.5 w-3.5" />
                        Brukeradministrasjon
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-medium text-green-700 dark:text-green-400">
                        <Shield className="h-3.5 w-3.5" />
                        Tilgangsstyring
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs font-medium text-purple-700 dark:text-purple-400">
                        <BarChart3 className="h-3.5 w-3.5" />
                        Statistikk & rapporter
                      </div>
                    </div>
                    <Button size="lg" className="gap-2 px-8 shadow-md" onClick={() => { setSelectedVendor(null); setShowVendorDialog(true); }}>
                      <Plus className="h-5 w-5" />
                      Legg til første leverandør
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredVendors.map((vendor) => (
                  <Card key={vendor.id} className="bg-gradient-to-br from-slate-50 to-slate-100/30 dark:from-slate-900/40 dark:to-slate-800/20 hover:from-slate-100 hover:to-slate-100/50 border-slate-200/60 dark:border-border hover:shadow-md hover:shadow-slate-200/50 dark:hover:shadow-none cursor-pointer transition-all hover:-translate-y-0.5 duration-300" data-testid={`vendor-card-${vendor.id}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <Badge 
                          variant={vendor.status === 'active' ? 'default' : 'secondary'}
                          className={vendor.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : ''}
                        >
                          {statusLabels[vendor.status] || vendor.status}
                        </Badge>
                      </div>
                      
                      <h3 className="font-semibold text-lg mb-1">{vendor.name}</h3>
                      <p className="text-xs text-muted-foreground mb-3 font-mono">{vendor.slug}</p>
                      
                      <div className="space-y-2 mb-4 pb-4 border-b">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Abonnement:</span>
                          <Badge variant="outline" className="text-xs">
                            {planLabels[vendor.subscription_plan] || vendor.subscription_plan}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Maks brukere:</span>
                          <span className="font-medium">{vendor.max_users}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedVendor(vendor);
                            setShowAdminDialog(true);
                          }}
                          data-testid={`button-manage-admins-${vendor.id}`}
                          className="flex-1 text-xs"
                        >
                          <Users className="h-3 w-3 mr-1" />
                          Admins
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openVendorEditor(vendor)}
                          data-testid={`button-edit-vendor-${vendor.id}`}
                          className="h-8 w-8"
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
                          className="h-8 w-8 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Statistikk Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              {/* Total Vendors Card */}
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100/30 dark:from-blue-950/40 dark:to-blue-900/20 border-blue-200/60 dark:border-blue-800/40">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Totalt leverandører</p>
                      <p className="text-3xl font-bold mt-1">{analytics.total}</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-3 rounded-full">
                      <Building2 className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Active Vendors Card */}
              <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/30 dark:from-emerald-950/40 dark:to-emerald-900/20 border-emerald-200/60 dark:border-emerald-800/40">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Aktive</p>
                      <p className="text-3xl font-bold mt-1">{analytics.active}</p>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-3 rounded-full">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Total Users Card */}
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100/30 dark:from-purple-950/40 dark:to-purple-900/20 border-purple-200/60 dark:border-purple-800/40">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Totalt brukere</p>
                      <p className="text-3xl font-bold mt-1">{analytics.totalUsers}</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-3 rounded-full">
                      <Users className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Average Users Card */}
              <Card className="bg-gradient-to-br from-orange-50 to-orange-100/30 dark:from-orange-950/40 dark:to-orange-900/20 border-orange-200/60 dark:border-orange-800/40">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Gj.snitt per lev.</p>
                      <p className="text-3xl font-bold mt-1">{analytics.avgUsersPerVendor}</p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-3 rounded-full">
                      <BarChart3 className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Statusfordeling
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                      <span className="text-sm font-medium">Aktive</span>
                    </div>
                    <span className="text-sm font-bold">{analytics.active}</span>
                  </div>
                  <div className="flex items-center justify-between pb-3 border-b">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                      <span className="text-sm font-medium">Suspendert</span>
                    </div>
                    <span className="text-sm font-bold">{analytics.suspended}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span className="text-sm font-medium">Inaktiv</span>
                    </div>
                    <span className="text-sm font-bold">{analytics.inactive}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subscription Plans Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Abonnementsfordeling
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-sm font-medium">Basis</span>
                    </div>
                    <span className="text-sm font-bold">{analytics.basicCount}</span>
                  </div>
                  <div className="flex items-center justify-between pb-3 border-b">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                      <span className="text-sm font-medium">Standard</span>
                    </div>
                    <span className="text-sm font-bold">{analytics.standardCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                      <span className="text-sm font-medium">Premium</span>
                    </div>
                    <span className="text-sm font-bold">{analytics.premiumCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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
                  <Label htmlFor="vendor-status">Status</Label>
                  <select
                    id="vendor-status"
                    aria-label="Status"
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
                  <Label htmlFor="vendor-plan">Abonnement</Label>
                  <select
                    id="vendor-plan"
                    aria-label="Abonnement"
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
