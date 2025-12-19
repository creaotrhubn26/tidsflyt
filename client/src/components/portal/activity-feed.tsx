import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export function ActivityFeed({ activities, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <Card data-testid="activity-feed-skeleton">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Aktivitet</CardTitle>
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
    <Card data-testid="activity-feed">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Aktivitet</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="px-6 pb-6 space-y-1">
            {activities.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Ingen aktivitet ennå</p>
              </div>
            ) : (
              activities.map((activity) => {
                const Icon = activityIcons[activity.type] || Clock;
                const colorClass = activityColors[activity.type] || "bg-muted text-muted-foreground";
                
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 py-3 hover-elevate rounded-lg px-2 -mx-2"
                    data-testid={`activity-item-${activity.id}`}
                  >
                    <div className={`p-2 rounded-full ${colorClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">
                        {activity.user && (
                          <span className="font-medium">{activity.user} </span>
                        )}
                        {activity.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
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
