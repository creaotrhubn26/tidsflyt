import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Shield, Plus, Edit, Trash2, Loader2, Save, Users } from "lucide-react";

interface PermissionRow {
  id: string;
  key: string;
  label: string;
  module: string;
}

interface RoleRow {
  id: string;
  name: string;
  scope: string;
  is_system_default: boolean;
  permission_ids: string[];
  user_count: number | string;
}

async function getOrMintAdminToken(): Promise<string | null> {
  const existing = sessionStorage.getItem('cms_admin_token');
  if (existing) return existing;
  try {
    const res = await fetch('/api/admin/session-token', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.token) {
      sessionStorage.setItem('cms_admin_token', data.token);
      return data.token;
    }
  } catch {}
  return null;
}

async function authenticatedApiRequest(url: string, options: RequestInit = {}) {
  const send = async (token: string | null) =>
    fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

  let token = await getOrMintAdminToken();
  let res = await send(token);
  if (res.status === 401) {
    sessionStorage.removeItem('cms_admin_token');
    token = await getOrMintAdminToken();
    if (token) res = await send(token);
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return res.json();
}

export default function AdminRollerPage() {
  const { toast } = useToast();
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());
  const [showNewRoleDialog, setShowNewRoleDialog] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const { data: roles = [], isLoading } = useQuery<RoleRow[]>({
    queryKey: ['/api/admin/roles'],
    queryFn: () => authenticatedApiRequest('/api/admin/roles'),
  });

  const { data: permissions = [] } = useQuery<PermissionRow[]>({
    queryKey: ['/api/admin/permissions'],
    queryFn: () => authenticatedApiRequest('/api/admin/permissions'),
  });

  const permissionsByModule = useMemo(() => {
    const groups: Record<string, PermissionRow[]> = {};
    for (const p of permissions) {
      (groups[p.module] ??= []).push(p);
    }
    return groups;
  }, [permissions]);

  const createRoleMutation = useMutation({
    mutationFn: (name: string) =>
      authenticatedApiRequest('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({ name, scope: 'global' }),
      }),
    onSuccess: () => {
      toast({ title: 'Opprettet', description: 'Rollen er opprettet' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/roles'] });
      setShowNewRoleDialog(false);
      setNewRoleName("");
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const savePermissionsMutation = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) =>
      authenticatedApiRequest(`/api/admin/roles/${roleId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissionIds }),
      }),
    onSuccess: () => {
      toast({ title: 'Lagret', description: 'Tillatelser er oppdatert' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/roles'] });
      setEditingRole(null);
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) =>
      authenticatedApiRequest(`/api/admin/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Slettet', description: 'Rollen er slettet' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/roles'] });
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });

  const openEditor = (role: RoleRow) => {
    setEditingRole(role);
    setSelectedPermissionIds(new Set(role.permission_ids));
  };

  const togglePermission = (id: string) => {
    setSelectedPermissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
              <Shield className="h-6 w-6" />
              Rolleadministrasjon
            </h1>
            <p className="text-muted-foreground">Administrer roller og hvilke tillatelser de har</p>
          </div>
          <Button onClick={() => setShowNewRoleDialog(true)} data-testid="button-add-role">
            <Plus className="h-4 w-4 mr-2" />
            Ny rolle
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => (
              <Card key={role.id} data-testid={`role-card-${role.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-lg">{role.name}</h3>
                    {role.is_system_default && (
                      <Badge variant="secondary" className="text-xs">Systemrolle</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
                    <Users className="h-3.5 w-3.5" />
                    {role.user_count} bruker(e)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditor(role)}
                      data-testid={`button-edit-role-${role.id}`}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1.5" />
                      Rediger tillatelser
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      disabled={role.is_system_default || deleteRoleMutation.isPending}
                      onClick={() => {
                        if (confirm(`Er du sikker på at du vil slette rollen "${role.name}"?`)) {
                          deleteRoleMutation.mutate(role.id);
                        }
                      }}
                      data-testid={`button-delete-role-${role.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Ny rolle */}
        <Dialog open={showNewRoleDialog} onOpenChange={setShowNewRoleDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ny rolle</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="new-role-name">Navn</Label>
                <Input
                  id="new-role-name"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="f.eks. regnskap_admin"
                  data-testid="input-new-role-name"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowNewRoleDialog(false)}>Avbryt</Button>
              <Button
                onClick={() => createRoleMutation.mutate(newRoleName.trim())}
                disabled={!newRoleName.trim() || createRoleMutation.isPending}
                data-testid="button-save-new-role"
              >
                {createRoleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Opprett
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rediger tillatelser */}
        <Dialog open={!!editingRole} onOpenChange={(o) => !o && setEditingRole(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Tillatelser for {editingRole?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              {Object.entries(permissionsByModule).map(([module, modulePermissions]) => (
                <div key={module} className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {module}
                  </h4>
                  <div className="space-y-2">
                    {modulePermissions.map((permission) => (
                      <label
                        key={permission.id}
                        className="flex items-start gap-2 cursor-pointer rounded-md border p-2.5 hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={selectedPermissionIds.has(permission.id)}
                          onCheckedChange={() => togglePermission(permission.id)}
                          data-testid={`checkbox-permission-${permission.key}`}
                        />
                        <div className="text-sm">
                          <span className="font-medium">{permission.label}</span>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{permission.key}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditingRole(null)}>Avbryt</Button>
              <Button
                onClick={() =>
                  editingRole &&
                  savePermissionsMutation.mutate({
                    roleId: editingRole.id,
                    permissionIds: Array.from(selectedPermissionIds),
                  })
                }
                disabled={savePermissionsMutation.isPending}
                data-testid="button-save-permissions"
              >
                {savePermissionsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Lagre
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
