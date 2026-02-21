import { useMemo, useState } from "react";
import {
  Clock,
  FileText,
  Briefcase,
  Bell,
  ExternalLink,
  History,
} from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityFeed } from "@/components/portal/activity-feed";
import { cn } from "@/lib/utils";

export interface RecentItem {
  id: number;
  title: string;
  type: "time" | "report" | "case";
  timestamp: Date;
  status: "draft" | "pending" | "approved";
}

export interface ActivityItem {
  id: string;
  type: "stamp" | "approval" | "report_submitted" | "user_added";
  user: string;
  message: string;
  timestamp: string;
  userId?: string;
}

interface DashboardActivityProps {
  mode?: "default" | "tiltaksleder";
  recentItems: RecentItem[];
  activityItems: ActivityItem[];
  activitiesLoading: boolean;
  currentUserId?: string;
  navigate: (path: string) => void;
}

const STATUS_COLORS: Record<RecentItem["status"], string> = {
  draft: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  approved: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
};

const STATUS_LABELS: Record<RecentItem["status"], string> = {
  draft: "Utkast",
  pending: "Venter",
  approved: "Godkjent",
};

const TYPE_ICONS: Record<RecentItem["type"], typeof Clock> = {
  time: Clock,
  report: FileText,
  case: Briefcase,
};

export function DashboardActivity({
  mode = "default",
  recentItems,
  activityItems,
  activitiesLoading,
  currentUserId,
  navigate,
}: DashboardActivityProps) {
  const [tab, setTab] = useState<"mine" | "tiltak" | "team">("mine");
  const isTiltaksleder = mode === "tiltaksleder";

  // Filter activities by userId match instead of text-based matching
  const teamItems = useMemo(() => {
    if (!currentUserId) return activityItems;
    return activityItems.filter((a) => a.userId !== currentUserId);
  }, [activityItems, currentUserId]);

  const importantItems = useMemo(() => {
    return activityItems.filter((item) => {
      const text = `${item.message} ${item.type}`.toLowerCase();
      return (
        item.type === "approval" ||
        item.type === "report_submitted" ||
        /mangler|frist|forfalt|avvik|oppfølging/.test(text)
      );
    });
  }, [activityItems]);

  const tiltakItems = useMemo(() => {
    return activityItems.filter((item) => item.type === "report_submitted" || item.type === "approval");
  }, [activityItems]);

  if (activitiesLoading) {
    return (
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-foreground">
            Aktivitet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1">
                  <Skeleton className="mb-2 h-4 w-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {isTiltaksleder ? "Faglig logg" : "Aktivitet"}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Åpne timeføring"
            title="Åpne timeføring"
            onClick={() => navigate("/time-tracking")}
            className="text-xs text-muted-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "mine" | "tiltak" | "team")}
          className="w-full"
        >
          <TabsList className={isTiltaksleder ? "grid w-full grid-cols-3 mb-4" : "grid w-full grid-cols-2 mb-4"}>
            <TabsTrigger value="mine">
              <History className="mr-1.5 h-3.5 w-3.5" />
              {isTiltaksleder ? "Viktig" : "Mine siste"}
            </TabsTrigger>
            {isTiltaksleder && (
              <TabsTrigger value="tiltak">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Tiltak
              </TabsTrigger>
            )}
            <TabsTrigger value="team">
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              {isTiltaksleder ? "Team" : "Teamets aktivitet"}
            </TabsTrigger>
          </TabsList>

          {/* Viktig/Mine siste */}
          <TabsContent value="mine" className="mt-0">
            {isTiltaksleder ? (
              <ActivityFeed activities={importantItems} title="" variant="compact" compactLimit={8} />
            ) : (
              <div className="space-y-1.5">
                {recentItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground italic">
                  Ingen nylige elementer
                </p>
                ) : (
                  recentItems.map((item) => {
                  const ItemIcon = TYPE_ICONS[item.type];
                  return (
                    <Button
                      key={item.id}
                      variant="ghost"
                      className="w-full justify-start h-auto p-3 hover:bg-accent"
                      onClick={() => {
                        if (item.type === "time") navigate("/time-tracking");
                        else navigate("/cases");
                      }}
                    >
                      <div className="flex items-start gap-3 w-full">
                        <div className="p-2 rounded-lg bg-slate-50 dark:bg-muted shrink-0">
                          <ItemIcon className="h-4 w-4 text-slate-600 dark:text-muted-foreground" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-sm font-medium truncate">
                            {item.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(item.timestamp, "HH:mm \u00b7 dd MMM")}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] shrink-0", STATUS_COLORS[item.status])}
                        >
                          {STATUS_LABELS[item.status]}
                        </Badge>
                      </div>
                    </Button>
                  );
                  })
                )}
              </div>
            )}
          </TabsContent>

          {isTiltaksleder && (
            <TabsContent value="tiltak" className="mt-0">
              <ActivityFeed activities={tiltakItems} title="" variant="compact" compactLimit={8} />
            </TabsContent>
          )}

          {/* Teamets aktivitet – system/team log */}
          <TabsContent value="team" className="mt-0">
            <ActivityFeed activities={teamItems} title="" variant="compact" compactLimit={8} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
