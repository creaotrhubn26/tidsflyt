import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity } from "lucide-react";

interface ActivityRow {
  id: string;
  user_id: string;
  user_email: string | null;
  event_type: "mutation" | "page_view";
  method: string | null;
  path: string;
  status_code: number | null;
  created_at: string;
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

export default function AdminAktivitetsloggPage() {
  const [userIdFilter, setUserIdFilter] = useState("");

  const { data: entries = [], isLoading, error } = useQuery<ActivityRow[]>({
    queryKey: ['/api/admin/activity', userIdFilter],
    queryFn: () =>
      authenticatedApiRequest(
        `/api/admin/activity${userIdFilter.trim() ? `?userId=${encodeURIComponent(userIdFilter.trim())}` : ''}`,
      ),
  });

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <Activity className="h-6 w-6" />
            Aktivitetslogg
          </h1>
          <p className="text-muted-foreground">Hva adminpanel-brukere har gjort og vært inne på</p>
        </div>

        <Input
          value={userIdFilter}
          onChange={(e) => setUserIdFilter(e.target.value)}
          placeholder="Filtrer på bruker-id..."
          data-testid="input-activity-user-filter"
          className="max-w-sm"
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="text-left p-3 font-medium">Bruker</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Sti</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Tidspunkt</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0" data-testid={`row-activity-${entry.id}`}>
                      <td className="p-3">{entry.user_email ?? entry.user_id}</td>
                      <td className="p-3">
                        <Badge variant={entry.event_type === "mutation" ? "default" : "secondary"}>
                          {entry.event_type === "mutation" ? "Handling" : "Sidevisning"}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {entry.method ? `${entry.method} ` : ""}
                        {entry.path}
                      </td>
                      <td className="p-3">{entry.status_code ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{new Date(entry.created_at).toLocaleString("no-NO")}</td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        Ingen aktivitet funnet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}
