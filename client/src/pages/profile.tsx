import { useState } from "react";
import { useLocation } from "wouter";
import { 
  User, 
  Mail, 
  Phone, 
  Clock, 
  Calendar, 
  Settings, 
  Bell,
  Shield,
  Globe,
  Moon,
  Sun,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { getRoleLabel, normalizeRole } from "@shared/roles";

export default function ProfilePage() {
  const [location] = useLocation();
  const isSettingsRoute = location === "/settings";
  const { setTheme, resolvedTheme } = useTheme();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    weekly: true,
  });
  const [language, setLanguage] = useState("no");

  // Fetch stats from API
  const { data: stats } = useQuery<{ totalHours: number }>({
    queryKey: ["/api/stats"],
    staleTime: 60_000,
  });

  const profile = {
    name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email?.split("@")[0] || "Bruker",
    email: user?.email || "",
    role: user?.role || "member",
    joinedAt: user?.createdAt ? new Date(user.createdAt).toLocaleDateString("nb-NO") : "",
    totalHours: stats?.totalHours ?? 0,
  };

  const normalizedRole = normalizeRole(profile.role);
  const isAdminLikeRole = ["super_admin", "hovedadmin", "admin", "vendor_admin", "tiltaksleder", "teamleder"].includes(normalizedRole);

  const initials = profile.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase();

  return (
    <PortalLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="profile-title">
            {isSettingsRoute ? "Innstillinger" : "Profil"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isSettingsRoute
              ? "Administrer kontoinnstillinger og preferanser"
              : "Administrer kontoinformasjon og preferanser"}
          </p>
        </div>

        <Card data-testid="profile-card">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                  <h2 className="text-xl font-bold">{profile.name}</h2>
                  <Badge variant={isAdminLikeRole ? "destructive" : "secondary"} className="w-fit">
                    <Shield className="h-3 w-3 mr-1" />
                    {getRoleLabel(profile.role)}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{profile.email}</p>

                <div className="flex flex-wrap gap-4 mt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono font-medium">{profile.totalHours.toFixed(1)}t</span>
                    <span className="text-muted-foreground">totalt</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Medlem siden {profile.joinedAt}</span>
                  </div>
                </div>
              </div>

              <Button variant="outline" data-testid="edit-profile-button">
                <Settings className="h-4 w-4 mr-2" />
                Rediger profil
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card data-testid="contact-info-card">
            <CardHeader>
              <CardTitle className="text-lg">Kontaktinformasjon</CardTitle>
              <CardDescription>Oppdater kontaktdetaljer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Navn</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="name" defaultValue={profile.name} className="pl-9" data-testid="input-name" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" defaultValue={profile.email} className="pl-9" data-testid="input-email" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="phone" type="tel" defaultValue="" className="pl-9" data-testid="input-phone" />
                </div>
              </div>
              <Button className="w-full" data-testid="save-contact-button">Lagre endringer</Button>
            </CardContent>
          </Card>

          <Card data-testid="preferences-card">
            <CardHeader>
              <CardTitle className="text-lg">Preferanser</CardTitle>
              <CardDescription>Tilpass applikasjonen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {resolvedTheme === "dark" ? (
                    <Moon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Sun className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">Mørk modus</p>
                    <p className="text-sm text-muted-foreground">Bytt til mørkt tema</p>
                  </div>
                </div>
                <Switch
                  checked={resolvedTheme === "dark"}
                  onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                  data-testid="dark-mode-switch"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <Label>Språk</Label>
                </div>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger data-testid="language-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Norsk</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="notifications-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Varsler
            </CardTitle>
            <CardDescription>Administrer varslingsinnstillinger</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">E-postvarsler</p>
                <p className="text-sm text-muted-foreground">Motta varsler på e-post</p>
              </div>
              <Switch
                checked={notifications.email}
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, email: checked }))}
                data-testid="email-notifications-switch"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Push-varsler</p>
                <p className="text-sm text-muted-foreground">Motta varsler i nettleseren</p>
              </div>
              <Switch
                checked={notifications.push}
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, push: checked }))}
                data-testid="push-notifications-switch"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Ukentlig oppsummering</p>
                <p className="text-sm text-muted-foreground">Motta ukentlig rapport på e-post</p>
              </div>
              <Switch
                checked={notifications.weekly}
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, weekly: checked }))}
                data-testid="weekly-summary-switch"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
