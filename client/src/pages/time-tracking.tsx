import { useState } from "react";
import { Play, Pause, Square, Plus, Clock, ChevronDown, Trash2, Edit2 } from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface TimeEntry {
  id: string;
  project: string;
  task: string;
  startTime: string;
  endTime?: string;
  duration: number;
  notes?: string;
}

const mockProjects = [
  { id: "1", name: "Kundeprosjekt A", color: "bg-primary" },
  { id: "2", name: "Intern utvikling", color: "bg-success" },
  { id: "3", name: "Vedlikehold", color: "bg-warning" },
  { id: "4", name: "Kundeprosjekt B", color: "bg-info" },
];

const mockTimeEntries: TimeEntry[] = [
  { id: "1", project: "Kundeprosjekt A", task: "Frontend utvikling", startTime: "2024-12-19T08:00:00", endTime: "2024-12-19T12:00:00", duration: 4, notes: "Jobbet med dashboard" },
  { id: "2", project: "Intern utvikling", task: "Møte", startTime: "2024-12-19T13:00:00", endTime: "2024-12-19T14:30:00", duration: 1.5 },
  { id: "3", project: "Kundeprosjekt A", task: "Backend API", startTime: "2024-12-19T14:30:00", endTime: "2024-12-19T17:00:00", duration: 2.5, notes: "API endpoints for rapporter" },
  { id: "4", project: "Vedlikehold", task: "Bug fix", startTime: "2024-12-18T09:00:00", endTime: "2024-12-18T11:00:00", duration: 2 },
  { id: "5", project: "Kundeprosjekt B", task: "Design review", startTime: "2024-12-18T13:00:00", endTime: "2024-12-18T15:30:00", duration: 2.5 },
];

export default function TimeTrackingPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState("00:00:00");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [taskDescription, setTaskDescription] = useState("");

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const formatDuration = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}t ${m}m`;
  };

  const totalToday = mockTimeEntries
    .filter(e => e.startTime.startsWith("2024-12-19"))
    .reduce((sum, e) => sum + e.duration, 0);

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="time-tracking-title">Timeføring</h1>
          <p className="text-muted-foreground mt-1">Registrer og administrer arbeidstid</p>
        </div>

        <Card className="overflow-visible" data-testid="timer-card">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col items-center gap-6">
              <div className="text-6xl md:text-7xl font-mono font-bold tracking-tight" data-testid="timer-display">
                {currentTime}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="flex-1" data-testid="project-select">
                    <SelectValue placeholder="Velg prosjekt" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", project.color)} />
                          {project.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Hva jobber du med?"
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="flex-1"
                  data-testid="task-input"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  size="lg"
                  className={cn(
                    "w-16 h-16 rounded-full",
                    isRunning ? "bg-warning hover:bg-warning/90" : "bg-success hover:bg-success/90"
                  )}
                  onClick={toggleTimer}
                  data-testid="timer-toggle"
                >
                  {isRunning ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6 ml-1" />
                  )}
                </Button>

                {isRunning && (
                  <Button
                    size="lg"
                    variant="destructive"
                    className="w-16 h-16 rounded-full"
                    data-testid="timer-stop"
                  >
                    <Square className="h-5 w-5" />
                  </Button>
                )}
              </div>

              {isRunning && (
                <Badge variant="outline" className="text-sm py-1 px-3">
                  <Clock className="h-3 w-3 mr-1" />
                  Timer kjører - {mockProjects.find(p => p.id === selectedProject)?.name || "Ingen prosjekt valgt"}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Dagens registreringer</h2>
            <p className="text-sm text-muted-foreground">
              Totalt: <span className="font-mono font-medium text-foreground">{formatDuration(totalToday)}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" data-testid="add-manual-entry">
            <Plus className="h-4 w-4 mr-2" />
            Legg til manuelt
          </Button>
        </div>

        <div className="space-y-3">
          {mockTimeEntries
            .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
            .map((entry) => {
              const project = mockProjects.find(p => p.name === entry.project);
              const startDate = new Date(entry.startTime);
              const endDate = entry.endTime ? new Date(entry.endTime) : null;
              
              return (
                <Card key={entry.id} className="overflow-visible" data-testid={`time-entry-${entry.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={cn("w-1 h-full min-h-[60px] rounded-full flex-shrink-0", project?.color || "bg-muted")} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{entry.task}</p>
                            <p className="text-sm text-muted-foreground">{entry.project}</p>
                            {entry.notes && (
                              <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
                            )}
                          </div>
                          
                          <div className="text-right flex-shrink-0">
                            <p className="font-mono font-bold">{formatDuration(entry.duration)}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(startDate, "HH:mm")} - {endDate ? format(endDate, "HH:mm") : "pågår"}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {format(startDate, "d. MMM", { locale: nb })}
                          </Badge>
                          
                          <div className="flex-1" />
                          
                          <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`edit-entry-${entry.id}`}>
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" data-testid={`delete-entry-${entry.id}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </div>
    </PortalLayout>
  );
}
