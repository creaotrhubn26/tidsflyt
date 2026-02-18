import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { Clock, UserPlus, FileText, CheckCircle, AlertCircle } from "lucide-react";

interface Activity {
  id: string;
  type: "stamp" | "user_added" | "report_submitted" | "approval" | "alert";
  user?: string;
  message: string;
  timestamp: string;
}

interface ActivityFeedProps {
  activities: Activity[];
  loading?: boolean;
  title?: string;
}

const activityIcons = {
  stamp: Clock,
  user_added: UserPlus,
  report_submitted: FileText,
  approval: CheckCircle,
  alert: AlertCircle,
};

const activityColors = {
  stamp: "bg-primary/10 text-primary",
  user_added: "bg-success/10 text-success",
  report_submitted: "bg-info/10 text-info",
  approval: "bg-success/10 text-success",
  alert: "bg-warning/10 text-warning",
};

function ActivityFeedComponent({ activities, loading, title = "Aktivitet" }: ActivityFeedProps) {
  if (loading) {
    return (
      <Card className="rounded-2xl border-[#d8e4e0] dark:border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf9)] dark:bg-card shadow-[0_12px_30px_rgba(20,58,65,0.07)] dark:shadow-none" data-testid="activity-feed-skeleton">
        <CardHeader className="pb-3">
          <CardTitle className="text-2xl font-semibold tracking-tight text-[#153c46] dark:text-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-[#d8e4e0] dark:border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf9)] dark:bg-card shadow-[0_12px_30px_rgba(20,58,65,0.07)] dark:shadow-none" data-testid="activity-feed">
      <CardHeader className="pb-3">
        <CardTitle className="text-2xl font-semibold tracking-tight text-[#153c46] dark:text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[420px]">
          <div className="px-6 pb-6 space-y-1">
            {activities.length === 0 ? (
              <div className="py-10 text-center text-[#5f6f74] dark:text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-60" />
                <p className="text-sm">Ingen aktivitet ennå</p>
              </div>
            ) : (
              activities.map((activity) => {
                const Icon = activityIcons[activity.type] || Clock;
                const colorClass = activityColors[activity.type] || "bg-muted text-muted-foreground";
                
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-[#dbe6e2] dark:hover:border-border hover:bg-white/80 dark:hover:bg-muted"
                    data-testid={`activity-item-${activity.id}`}
                  >
                    <div className={`p-2 rounded-full ${colorClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed text-[#24383e] dark:text-foreground">
                        {activity.user && (
                          <span className="font-medium">{activity.user} </span>
                        )}
                        {activity.message}
                      </p>
                      <p className="text-xs text-[#5d6d72] dark:text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(activity.timestamp), {
                          addSuffix: true,
                          locale: nb,
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export const ActivityFeed = memo(ActivityFeedComponent);
