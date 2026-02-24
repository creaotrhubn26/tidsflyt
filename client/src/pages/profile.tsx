import { useEffect, useState } from "react";
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
  Loader2,
  CheckCircle2,
  Pencil,
  X,
  SlidersHorizontal,
  BarChart3,
  RotateCcw,
  UserCog,
  XCircle,
  Plus,
  Trash2,
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRoleLabel, normalizeRole } from "@shared/roles";
import { useToast } from "@/hooks/use-toast";
import { useSuggestionSettings } from "@/hooks/use-suggestion-settings";
import { type SuggestionMode, type SuggestionFrequency, type SuggestionBlockCategory } from "@/lib/suggestion-settings";

/* ─── types ────────────────────────────────────────── */

interface ProfileData {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string | null;
  vendorId: number | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
  phone: string | null;
  language: string;
  notificationEmail: boolean;
  notificationPush: boolean;
  notificationWeekly: boolean;
}

type ProfilePatch = Partial<Omit<ProfileData, "id" | "email" | "profileImageUrl" | "vendorId" | "createdAt" | "updatedAt">>;

interface SuggestionMetrics {
  totalFeedback: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number | null;
  overrideRate: number | null;
  estimatedTimeSavedMinutes: number;
  preventedMisentries: number;
  period7d: {
    totalFeedback: number;
    accepted: number;
    rejected: number;
    acceptanceRate: number | null;
  };
}

interface TeamSuggestionPreset {
  mode: SuggestionMode;
  frequency: SuggestionFrequency;
  confidenceThreshold: number;
}

interface TeamSuggestionDefaultsResponse {
  defaults: Record<string, TeamSuggestionPreset>;
}

type TimeTrackingEntryMode = "timer_or_manual" | "manual_only";

interface TimeTrackingWorkType {
  id: string;
  name: string;
  color: string;
  entryMode: TimeTrackingEntryMode;
}

interface TimeTrackingWorkTypesAdminResponse {
  config: Record<string, TimeTrackingWorkType[]>;
}

async function fetchProfile(): Promise<ProfileData> {
  const res = await fetch("/api/profile", { credentials: "include" });
  if (!res.ok) throw new Error("Kunne ikke laste profil");
  return res.json();
}

async function patchProfile(data: ProfilePatch): Promise<ProfileData> {
  const res = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Kunne ikke lagre endringer");
  return res.json();
}

export default function ProfilePage() {
  const [location] = useLocation();
  const isSettingsRoute = location === "/settings";
  const { setTheme, resolvedTheme } = useTheme();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /* ── Remote profile data ── */
  const { data: profile, isLoading: profileLoading } = useQuery<ProfileData>({
    queryKey: ["/api/profile"],
    queryFn: fetchProfile,
    staleTime: 60_000,
  });

  const { data: stats } = useQuery<{ totalHours: number }>({
    queryKey: ["/api/stats"],
    staleTime: 60_000,
  });

  const { data: suggestionMetrics } = useQuery<SuggestionMetrics>({
    queryKey: ["/api/suggestions/metrics"],
    staleTime: 60_000,
  });

  const {
    settings: suggestionSettings,
    saveSettingsAsync: saveSuggestionSettingsAsync,
    unblockSuggestionAsync,
    resetToTeamDefaultAsync,
    isSaving: isSuggestionSettingsSaving,
  } = useSuggestionSettings();
  const [selectedTeamRole, setSelectedTeamRole] = useState("default");
  const [miljoarbeiderWorkTypesDraft, setMiljoarbeiderWorkTypesDraft] = useState<TimeTrackingWorkType[]>([]);

  /* ── Derived role flags (needed for queries below) ── */
  const role = profile?.role || user?.role || "user";
  const normalizedRole = normalizeRole(role);
  const isAdminLikeRole = ["super_admin", "hovedadmin", "admin", "vendor_admin", "tiltaksleder", "teamleder"].includes(normalizedRole);
  const canManageTimeTrackingWorkTypes = ["super_admin", "hovedadmin", "admin", "vendor_admin"].includes(normalizedRole);

  const { data: teamDefaultsData } = useQuery<TeamSuggestionDefaultsResponse>({
    queryKey: ["/api/suggestion-team-defaults"],
    enabled: isAdminLikeRole,
    staleTime: 60_000,
  });

  const { data: workTypesAdminData } = useQuery<TimeTrackingWorkTypesAdminResponse>({
    queryKey: ["/api/time-tracking/work-types/admin"],
    enabled: canManageTimeTrackingWorkTypes,
    staleTime: 60_000,
  });

  /* ── Contact form state ── */
  const [editingContact, setEditingContact] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  /* Populate form whenever profile loads */
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setPhone(profile.phone ?? "");
  }, [profile]);

  useEffect(() => {
    if (!workTypesAdminData) return;
    const seeded = workTypesAdminData.config?.miljoarbeider || [];
    setMiljoarbeiderWorkTypesDraft(seeded.map((workType) => ({ ...workType })));
  }, [workTypesAdminData]);

  /* ── Mutation ── */
  const mutation = useMutation({
    mutationFn: patchProfile,
    onSuccess: (updated) => {
      queryClient.setQueryData<ProfileData>(["/api/profile"], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Endringer lagret", description: "Profilen din er oppdatert." });
      setEditingContact(false);
    },
    onError: (err: Error) => {
      toast({ title: "Feil", description: err.message, variant: "destructive" });
    },
  });

  /* ── Helpers ── */
  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    user?.email?.split("@")[0] ||
    "Bruker";

  const email = profile?.email || user?.email || "";
  const joinedAt = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("nb-NO")
    : "";
  const totalHours = stats?.totalHours ?? 0;

  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  /* ── Notification toggle helper (auto-saves immediately) ── */
  function saveNotification(patch: Partial<Pick<ProfileData, "notificationEmail" | "notificationPush" | "notificationWeekly">>) {
    mutation.mutate(patch);
  }

  /* ── Language save (auto-saves on change) ── */
  function saveLanguage(lang: string) {
    mutation.mutate({ language: lang as "no" | "en" });
  }

  /* ── Contact save ── */
  function saveContact() {
    mutation.mutate({ firstName, lastName, phone });
  }

  async function updateSuggestionSettings(patch: {
    mode?: SuggestionMode;
    frequency?: SuggestionFrequency;
    confidenceThreshold?: number;
  }) {
    try {
      await saveSuggestionSettingsAsync(patch);
    } catch (error: any) {
      toast({
        title: "Feil",
        description: error?.message || "Kunne ikke lagre forslag-innstillinger.",
        variant: "destructive",
      });
    }
  }

  const teamDefaultsMutation = useMutation({
    mutationFn: async (payload: { role: string; preset: TeamSuggestionPreset }) => {
      const response = await fetch("/api/suggestion-team-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Kunne ikke oppdatere team-standard.");
      }
      return response.json() as Promise<TeamSuggestionDefaultsResponse>;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["/api/suggestion-team-defaults"], next);
      toast({
        title: "Lagt til",
        description: "Team-standard for forslag er oppdatert.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Feil",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const workTypesMutation = useMutation({
    mutationFn: async (payload: { role: string; workTypes: Array<{ id?: string; name: string; color?: string; entryMode: TimeTrackingEntryMode }> }) => {
      const response = await fetch("/api/time-tracking/work-types/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Kunne ikke oppdatere arbeidstyper.");
      }
      return response.json() as Promise<{ config: Record<string, TimeTrackingWorkType[]>; workTypes: TimeTrackingWorkType[] }>;
    },
    onSuccess: (next) => {
      queryClient.setQueryData<TimeTrackingWorkTypesAdminResponse>(
        ["/api/time-tracking/work-types/admin"],
        { config: next.config },
      );
      setMiljoarbeiderWorkTypesDraft(next.workTypes || []);
      toast({
        title: "Lagringsfullført",
        description: "Arbeidstyper for miljøarbeider er oppdatert.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Feil",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMiljoarbeiderWorkType = (
    index: number,
    patch: Partial<TimeTrackingWorkType>,
  ) => {
    setMiljoarbeiderWorkTypesDraft((previous) =>
      previous.map((workType, workTypeIndex) => (workTypeIndex === index ? { ...workType, ...patch } : workType)),
    );
  };

  const removeMiljoarbeiderWorkType = (index: number) => {
    setMiljoarbeiderWorkTypesDraft((previous) => previous.filter((_, workTypeIndex) => workTypeIndex !== index));
  };

  const addMiljoarbeiderWorkType = () => {
    setMiljoarbeiderWorkTypesDraft((previous) => [
      ...previous,
      {
        id: `lokal-${Date.now()}`,
        name: "",
        color: "bg-primary",
        entryMode: "timer_or_manual",
      },
    ]);
  };

  const saveMiljoarbeiderWorkTypes = () => {
    const cleaned = miljoarbeiderWorkTypesDraft
      .map((workType) => ({
        id: workType.id,
        name: workType.name.trim(),
        color: workType.color,
        entryMode: workType.entryMode,
      }))
      .filter((workType) => workType.name.length > 0);

    if (cleaned.length === 0) {
      toast({
        title: "Mangler arbeidstyper",
        description: "Legg til minst én arbeidstype før lagring.",
        variant: "destructive",
      });
      return;
    }

    workTypesMutation.mutate({
      role: "miljoarbeider",
      workTypes: cleaned,
    });
  };

  async function removeBlockedSuggestion(category: SuggestionBlockCategory, value: string) {
    try {
      await unblockSuggestionAsync({ category, value });
      toast({
        title: "Fjernet",
        description: "Forslaget kan nå brukes igjen.",
      });
    } catch (error: any) {
      toast({
        title: "Feil",
        description: error?.message || "Kunne ikke fjerne blokkert forslag.",
        variant: "destructive",
      });
    }
  }

  async function handleResetSuggestionSettings() {
    try {
      await resetToTeamDefaultAsync();
      toast({
        title: "Tilbakestilt",
        description: "Dine forslag følger nå team-standard.",
      });
    } catch (error: any) {
      toast({
        title: "Feil",
        description: error?.message || "Kunne ikke tilbakestille innstillingene.",
        variant: "destructive",
      });
    }
  }

  const selectedTeamPreset = teamDefaultsData?.defaults?.[selectedTeamRole]
    || teamDefaultsData?.defaults?.default
    || null;

  /* ── Cancel contact edit ── */
  function cancelEdit() {
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
    setPhone(profile?.phone ?? "");
    setEditingContact(false);
  }

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

        {/* ── Profile card ── */}
        <Card data-testid="profile-card">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {profileLoading ? "…" : initials}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                  {profileLoading ? (
                    <div className="h-6 w-40 rounded bg-muted animate-pulse" />
                  ) : (
                    <h2 className="text-xl font-bold">{displayName}</h2>
                  )}
                  <Badge variant={isAdminLikeRole ? "destructive" : "secondary"} className="w-fit">
                    <Shield className="h-3 w-3 mr-1" />
                    {getRoleLabel(role)}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{email}</p>

                <div className="flex flex-wrap gap-4 mt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono font-medium">{totalHours.toFixed(1)}t</span>
                    <span className="text-muted-foreground">totalt</span>
                  </div>
                  {joinedAt && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Medlem siden {joinedAt}</span>
                    </div>
                  )}
                  {profile?.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{profile.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                data-testid="edit-profile-button"
                onClick={() => setEditingContact((v) => !v)}
                className="gap-2"
              >
                {editingContact ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {editingContact ? "Avbryt" : "Rediger profil"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* ── Contact info ── */}
          <Card data-testid="contact-info-card">
            <CardHeader>
              <CardTitle className="text-lg">Kontaktinformasjon</CardTitle>
              <CardDescription>
                {editingContact ? "Gjør endringene dine og trykk Lagre" : "Oppdater kontaktdetaljer"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Fornavn</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => { setFirstName(e.target.value); setEditingContact(true); }}
                      className="pl-9"
                      data-testid="input-firstname"
                      readOnly={!editingContact}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Etternavn</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); setEditingContact(true); }}
                    data-testid="input-lastname"
                    readOnly={!editingContact}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    readOnly
                    className="pl-9 bg-muted/40 cursor-not-allowed text-muted-foreground"
                    data-testid="input-email"
                    title="E-post administreres via din OAuth-leverandør"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">Administreres via innloggingsleverandør</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setEditingContact(true); }}
                    placeholder="+47 000 00 000"
                    className="pl-9"
                    data-testid="input-phone"
                    readOnly={!editingContact}
                  />
                </div>
              </div>

              {editingContact && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={saveContact}
                    disabled={mutation.isPending}
                    data-testid="save-contact-button"
                  >
                    {mutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Lagre endringer
                  </Button>
                  <Button variant="ghost" onClick={cancelEdit} disabled={mutation.isPending}>
                    Avbryt
                  </Button>
                </div>
              )}

              {!editingContact && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setEditingContact(true)}
                  data-testid="save-contact-button"
                >
                  <Settings className="h-4 w-4" />
                  Rediger kontaktinfo
                </Button>
              )}
            </CardContent>
          </Card>

          {/* ── Preferences ── */}
          <Card data-testid="preferences-card">
            <CardHeader>
              <CardTitle className="text-lg">Preferanser</CardTitle>
              <CardDescription>Tilpass applikasjonen. Endringer lagres automatisk.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Dark mode */}
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

              {/* Language */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <Label>Språk</Label>
                  {mutation.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <Select
                  value={profile?.language ?? "no"}
                  onValueChange={saveLanguage}
                  disabled={profileLoading}
                >
                  <SelectTrigger data-testid="language-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Norsk</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Lagres automatisk</p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="suggestion-settings-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5" />
                Forslag
                {isSuggestionSettingsSaving && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />
                )}
              </CardTitle>
              <CardDescription>
                Juster hvor mye forslag Tidum viser i hverdagen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {suggestionSettings.rollout && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Aktiv kilde: <span className="font-medium">{suggestionSettings.rollout.source}</span>
                  {" · "}
                  Variant: <span className="font-medium">{suggestionSettings.rollout.variant}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Aktiver forslag</p>
                  <p className="text-sm text-muted-foreground">Skru av for helt manuell flyt</p>
                </div>
                <Switch
                  checked={suggestionSettings.mode !== "off"}
                  onCheckedChange={(checked) => {
                    const nextMode: SuggestionMode = checked
                      ? (suggestionSettings.mode === "off" ? "balanced" : suggestionSettings.mode)
                      : "off";
                    void updateSuggestionSettings({ mode: nextMode });
                  }}
                  disabled={isSuggestionSettingsSaving}
                  data-testid="suggestions-enabled-switch"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Modus</Label>
                <Select
                  value={suggestionSettings.mode}
                  onValueChange={(value) => {
                    void updateSuggestionSettings({ mode: value as SuggestionMode });
                  }}
                  disabled={isSuggestionSettingsSaving}
                >
                  <SelectTrigger data-testid="suggestion-mode-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Av</SelectItem>
                    <SelectItem value="dashboard_only">Kun dashboard</SelectItem>
                    <SelectItem value="balanced">Balansert (anbefalt)</SelectItem>
                    <SelectItem value="proactive">Proaktiv</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Balansert viser forslag i Dashboard, Timeføring og Saksrapporter.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Hyppighet</Label>
                <Select
                  value={suggestionSettings.frequency}
                  onValueChange={(value) => {
                    void updateSuggestionSettings({ frequency: value as SuggestionFrequency });
                  }}
                  disabled={isSuggestionSettingsSaving}
                >
                  <SelectTrigger data-testid="suggestion-frequency-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Lav</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Høy</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Lav frekvens gir lengre pause mellom forslag.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Sikkerhetsterskel</Label>
                <Select
                  value={String(suggestionSettings.confidenceThreshold)}
                  onValueChange={(value) => {
                    void updateSuggestionSettings({ confidenceThreshold: Number(value) });
                  }}
                  disabled={isSuggestionSettingsSaving}
                >
                  <SelectTrigger data-testid="suggestion-threshold-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.35">Vis flere forslag (35%)</SelectItem>
                    <SelectItem value="0.45">Balansert terskel (45%)</SelectItem>
                    <SelectItem value="0.6">Kun høy sikkerhet (60%)</SelectItem>
                    <SelectItem value="0.75">Kun svært sikre forslag (75%)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Høyere terskel betyr færre forslag med lav sikkerhet.
                </p>
              </div>

              {suggestionSettings.userOverride && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    void handleResetSuggestionSettings();
                  }}
                  disabled={isSuggestionSettingsSaving}
                  data-testid="suggestion-reset-team-default"
                >
                  <RotateCcw className="h-4 w-4" />
                  Tilbakestill til team-standard
                </Button>
              )}

              {(suggestionSettings.blocked.projects.length > 0
                || suggestionSettings.blocked.descriptions.length > 0
                || suggestionSettings.blocked.caseIds.length > 0) && (
                <div className="space-y-2 rounded-md border bg-background/70 p-3">
                  <p className="text-sm font-medium">Blokkerte forslag</p>
                  <div className="space-y-2">
                    {suggestionSettings.blocked.projects.map((value) => (
                      <div key={`project-${value}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Prosjekt: {value}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => { void removeBlockedSuggestion("project", value); }}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Fjern
                        </Button>
                      </div>
                    ))}
                    {suggestionSettings.blocked.descriptions.map((value) => (
                      <div key={`description-${value}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Beskrivelse: {value}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => { void removeBlockedSuggestion("description", value); }}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Fjern
                        </Button>
                      </div>
                    ))}
                    {suggestionSettings.blocked.caseIds.map((value) => (
                      <div key={`case-${value}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Sak: {value}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => { void removeBlockedSuggestion("case_id", value); }}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Fjern
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="suggestion-kpi-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Forslagseffekt
              </CardTitle>
              <CardDescription>
                Målinger fra hvordan forslag brukes i praksis.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border bg-background/70 p-3">
                <p className="text-muted-foreground">Treffsikkerhet</p>
                <p className="font-semibold" data-testid="suggestion-kpi-acceptance-rate">
                  {suggestionMetrics?.acceptanceRate != null
                    ? `${Math.round(suggestionMetrics.acceptanceRate * 100)}%`
                    : "–"}
                </p>
              </div>
              <div className="rounded-md border bg-background/70 p-3">
                <p className="text-muted-foreground">Overstyrt</p>
                <p className="font-semibold">
                  {suggestionMetrics?.overrideRate != null
                    ? `${Math.round(suggestionMetrics.overrideRate * 100)}%`
                    : "–"}
                </p>
              </div>
              <div className="rounded-md border bg-background/70 p-3">
                <p className="text-muted-foreground">Estimert spart tid</p>
                <p className="font-semibold">{suggestionMetrics?.estimatedTimeSavedMinutes ?? 0} min</p>
              </div>
              <div className="rounded-md border bg-background/70 p-3">
                <p className="text-muted-foreground">Potensielle feil unngått</p>
                <p className="font-semibold">{suggestionMetrics?.preventedMisentries ?? 0}</p>
              </div>
            </CardContent>
          </Card>

          {isAdminLikeRole && (
            <Card data-testid="team-suggestion-defaults-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserCog className="h-5 w-5" />
                  Team-standard for forslag
                </CardTitle>
                <CardDescription>
                  Sett standard per rolle. Brukere kan fortsatt overstyre lokalt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Rolle</Label>
                  <Select value={selectedTeamRole} onValueChange={setSelectedTeamRole}>
                    <SelectTrigger data-testid="team-suggestion-role-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Standard (alle)</SelectItem>
                      <SelectItem value="miljoarbeider">Miljøarbeider</SelectItem>
                      <SelectItem value="teamleder">Teamleder</SelectItem>
                      <SelectItem value="tiltaksleder">Tiltaksleder</SelectItem>
                      <SelectItem value="case_manager">Saksbehandler</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {selectedTeamPreset ? (
                  <div className="space-y-2 rounded-md border bg-background/70 p-3 text-sm">
                    <p><span className="text-muted-foreground">Modus:</span> {selectedTeamPreset.mode}</p>
                    <p><span className="text-muted-foreground">Hyppighet:</span> {selectedTeamPreset.frequency}</p>
                    <p><span className="text-muted-foreground">Terskel:</span> {Math.round(selectedTeamPreset.confidenceThreshold * 100)}%</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Ingen team-standard funnet for valgt rolle.</p>
                )}

                {selectedTeamPreset && (
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        teamDefaultsMutation.mutate({
                          role: selectedTeamRole,
                          preset: { ...selectedTeamPreset, mode: "dashboard_only" },
                        });
                      }}
                      disabled={teamDefaultsMutation.isPending}
                    >
                      Sett til Dashboard-only
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        teamDefaultsMutation.mutate({
                          role: selectedTeamRole,
                          preset: { ...selectedTeamPreset, mode: "balanced" },
                        });
                      }}
                      disabled={teamDefaultsMutation.isPending}
                    >
                      Sett til Balansert
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        teamDefaultsMutation.mutate({
                          role: selectedTeamRole,
                          preset: { ...selectedTeamPreset, mode: "proactive" },
                        });
                      }}
                      disabled={teamDefaultsMutation.isPending}
                    >
                      Sett til Proaktiv
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {canManageTimeTrackingWorkTypes && (
            <Card data-testid="time-worktypes-admin-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Arbeidstyper for Miljøarbeider
                </CardTitle>
                <CardDescription>
                  Denne listen styrer Type arbeid i Timeføring for miljøarbeidere.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {miljoarbeiderWorkTypesDraft.map((workType, index) => (
                    <div key={`${workType.id}-${index}`} className="grid grid-cols-1 gap-2 rounded-md border bg-background/70 p-3 md:grid-cols-[1fr_180px_auto]">
                      <Input
                        value={workType.name}
                        onChange={(event) => {
                          updateMiljoarbeiderWorkType(index, { name: event.target.value });
                        }}
                        placeholder="Navn på arbeidstype"
                        data-testid={`worktype-name-${index}`}
                      />
                      <Select
                        value={workType.entryMode}
                        onValueChange={(value) => {
                          updateMiljoarbeiderWorkType(index, { entryMode: value as TimeTrackingEntryMode });
                        }}
                      >
                        <SelectTrigger data-testid={`worktype-mode-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="timer_or_manual">Stempling + manuell</SelectItem>
                          <SelectItem value="manual_only">Kun manuell timer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMiljoarbeiderWorkType(index)}
                        data-testid={`worktype-remove-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addMiljoarbeiderWorkType}
                    data-testid="worktype-add"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Legg til type
                  </Button>
                  <Button
                    type="button"
                    onClick={saveMiljoarbeiderWorkTypes}
                    disabled={workTypesMutation.isPending}
                    data-testid="worktype-save"
                  >
                    {workTypesMutation.isPending ? "Lagrer..." : "Lagre arbeidstyper"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tips: Sett "Rapportskriving" til "Kun manuell timer" for å kreve manuell timeføring.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Notifications ── */}
        <Card data-testid="notifications-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Varsler
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
            </CardTitle>
            <CardDescription>Varslingsinnstillinger lagres umiddelbart</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">E-postvarsler</p>
                <p className="text-sm text-muted-foreground">Motta varsler på e-post</p>
              </div>
              <Switch
                checked={profile?.notificationEmail ?? true}
                onCheckedChange={(checked) => saveNotification({ notificationEmail: checked })}
                disabled={profileLoading || mutation.isPending}
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
                checked={profile?.notificationPush ?? false}
                onCheckedChange={(checked) => saveNotification({ notificationPush: checked })}
                disabled={profileLoading || mutation.isPending}
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
                checked={profile?.notificationWeekly ?? true}
                onCheckedChange={(checked) => saveNotification({ notificationWeekly: checked })}
                disabled={profileLoading || mutation.isPending}
                data-testid="weekly-summary-switch"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
