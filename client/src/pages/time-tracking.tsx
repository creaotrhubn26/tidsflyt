import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Play, Pause, Square, Plus, Clock, Trash2, Edit2, Save, X } from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface TimeEntry {
  id: string;
  userId: string;
  caseNumber: string | null;
  description: string;
  hours: number;
  date: string;
  status: string;
  createdAt: string;
}

const projectOptions = [
  { id: "general", name: "Generelt arbeid", color: "bg-primary" },
  { id: "development", name: "Utvikling", color: "bg-success" },
  { id: "meeting", name: "Møte", color: "bg-warning" },
  { id: "support", name: "Kundesupport", color: "bg-info" },
  { id: "admin", name: "Administrasjon", color: "bg-muted" },
];

export default function TimeTrackingPage() {
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [taskDescription, setTaskDescription] = useState("");
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualProject, setManualProject] = useState("");
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  
  const timerStartRef = useRef<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const clockIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const currentUserId = "default";
  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    clockIntervalRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
      }
    };
  }, []);

  const { data: todayEntries = [], isLoading, refetch } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries", { startDate: today, endDate: today }],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { description: string; hours: number; caseNumber: string | null }) => {
      return apiRequest("POST", "/api/time-entries", {
        userId: currentUserId,
        caseNumber: data.caseNumber,
        description: data.description,
        hours: data.hours,
        date: today,
        status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Registrert", description: "Timeregistrering lagret." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke lagre.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; description?: string; hours?: number }) => {
      return apiRequest("PATCH", `/api/time-entries/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setEditingEntry(null);
      toast({ title: "Oppdatert", description: "Endringene er lagret." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke oppdatere.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/time-entries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Slettet", description: "Registreringen er fjernet." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke slette.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (isRunning) {
      timerStartRef.current = new Date(Date.now() - elapsedSeconds * 1000);
      intervalRef.current = setInterval(() => {
        if (timerStartRef.current) {
          const now = new Date();
          const diff = Math.floor((now.getTime() - timerStartRef.current.getTime()) / 1000);
          setElapsedSeconds(diff);
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatDuration = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}t ${m}m`;
  };

  const startTimer = () => {
    if (!selectedProject) {
      toast({ title: "Velg prosjekt", description: "Du må velge et prosjekt før du starter timeren.", variant: "destructive" });
      return;
    }
    setIsRunning(true);
  };

  const pauseTimer = () => {
    setIsRunning(false);
  };

  const stopTimer = () => {
    if (elapsedSeconds < 60) {
      toast({ title: "For kort", description: "Timeren må kjøre i minst 1 minutt.", variant: "destructive" });
      return;
    }

    const hours = Math.round((elapsedSeconds / 3600) * 100) / 100;
    const project = projectOptions.find(p => p.id === selectedProject);
    const description = taskDescription || project?.name || "Arbeid";

    createMutation.mutate({
      description,
      hours,
      caseNumber: selectedProject,
    });

    setIsRunning(false);
    setElapsedSeconds(0);
    setTaskDescription("");
    timerStartRef.current = null;
  };

  const handleManualSave = () => {
    const hours = parseFloat(manualHours);
    if (isNaN(hours) || hours <= 0) {
      toast({ title: "Ugyldig tid", description: "Angi et gyldig antall timer.", variant: "destructive" });
      return;
    }
    if (!manualDescription.trim()) {
      toast({ title: "Mangler beskrivelse", description: "Legg til en beskrivelse.", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      description: manualDescription,
      hours,
      caseNumber: manualProject || null,
    });

    setShowManualDialog(false);
    setManualHours("");
    setManualDescription("");
    setManualProject("");
  };

  const handleEditSave = () => {
    if (!editingEntry) return;
    
    updateMutation.mutate({
      id: editingEntry.id,
      description: editingEntry.description,
      hours: editingEntry.hours,
    });
  };

  const totalToday = todayEntries.reduce((sum, e) => sum + e.hours, 0);

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
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1" data-testid="current-date">
                  {format(currentTime, "EEEE d. MMMM yyyy", { locale: nb })}
                </p>
                <div 
                  className="text-5xl md:text-6xl font-mono font-bold tracking-tight text-foreground" 
                  data-testid="live-clock"
                >
                  {format(currentTime, "HH:mm:ss", { locale: nb })}
                </div>
              </div>

              {(isRunning || elapsedSeconds > 0) && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Arbeidstid</p>
                  <div 
                    className={cn(
                      "text-3xl md:text-4xl font-mono font-bold tracking-tight transition-colors",
                      isRunning && "text-success"
                    )} 
                    data-testid="timer-display"
                  >
                    {formatTime(elapsedSeconds)}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="flex-1" data-testid="project-select">
                    <SelectValue placeholder="Velg prosjekt" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectOptions.map((project) => (
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
                {!isRunning ? (
                  <Button
                    size="lg"
                    className="w-16 h-16 rounded-full bg-success hover:bg-success/90"
                    onClick={startTimer}
                    data-testid="timer-start"
                  >
                    <Play className="h-6 w-6 ml-1" />
                  </Button>
                ) : (
                  <>
                    <Button
                      size="lg"
                      className="w-16 h-16 rounded-full bg-warning hover:bg-warning/90"
                      onClick={pauseTimer}
                      data-testid="timer-pause"
                    >
                      <Pause className="h-6 w-6" />
                    </Button>
                    <Button
                      size="lg"
                      variant="destructive"
                      className="w-16 h-16 rounded-full"
                      onClick={stopTimer}
                      disabled={createMutation.isPending}
                      data-testid="timer-stop"
                    >
                      <Square className="h-5 w-5" />
                    </Button>
                  </>
                )}
              </div>

              {isRunning && (
                <Badge variant="outline" className="text-sm py-1 px-3">
                  <Clock className="h-3 w-3 mr-1" />
                  Timer kjører - {projectOptions.find(p => p.id === selectedProject)?.name || "Ingen prosjekt valgt"}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Dagens registreringer</h2>
            <p className="text-sm text-muted-foreground">
              Totalt: <span className="font-mono font-medium text-foreground">{formatDuration(totalToday)}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowManualDialog(true)} data-testid="add-manual-entry">
            <Plus className="h-4 w-4 mr-2" />
            Legg til manuelt
          </Button>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Laster registreringer...
              </CardContent>
            </Card>
          ) : todayEntries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">Ingen registreringer i dag</h3>
                <p className="text-muted-foreground">Start timeren eller legg til en manuell registrering.</p>
              </CardContent>
            </Card>
          ) : (
            todayEntries
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((entry) => {
                const project = projectOptions.find(p => p.id === entry.caseNumber);
                const isEditing = editingEntry?.id === entry.id;
                
                return (
                  <Card key={entry.id} className="overflow-visible" data-testid={`time-entry-${entry.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={cn("w-1 h-full min-h-[60px] rounded-full flex-shrink-0", project?.color || "bg-muted")} />
                        
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="space-y-2">
                              <Input
                                value={editingEntry.description}
                                onChange={(e) => setEditingEntry({ ...editingEntry, description: e.target.value })}
                                data-testid="edit-description"
                              />
                              <div className="flex gap-2 items-center">
                                <Input
                                  type="number"
                                  step="0.25"
                                  value={editingEntry.hours}
                                  onChange={(e) => setEditingEntry({ ...editingEntry, hours: parseFloat(e.target.value) || 0 })}
                                  className="w-24"
                                  data-testid="edit-hours"
                                />
                                <span className="text-sm text-muted-foreground">timer</span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p className="font-medium">{entry.description}</p>
                              <p className="text-sm text-muted-foreground">{project?.name || "Annet"}</p>
                            </div>
                          )}
                        </div>
                        
                        <div className="text-right flex-shrink-0">
                          {!isEditing && (
                            <>
                              <p className="font-mono font-medium">{formatDuration(entry.hours)}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(entry.createdAt), "HH:mm", { locale: nb })}
                              </p>
                            </>
                          )}
                        </div>

                        <div className="flex gap-1 flex-shrink-0">
                          {isEditing ? (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={handleEditSave}
                                disabled={updateMutation.isPending}
                                data-testid="save-edit"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setEditingEntry(null)}
                                data-testid="cancel-edit"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setEditingEntry(entry)}
                                data-testid={`edit-entry-${entry.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteMutation.mutate(entry.id)}
                                disabled={deleteMutation.isPending}
                                data-testid={`delete-entry-${entry.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
          )}
        </div>
      </div>

      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Legg til manuell registrering</DialogTitle>
            <DialogDescription>
              Registrer timer manuelt for dagens dato.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-hours">Antall timer</Label>
              <Input
                id="manual-hours"
                type="number"
                step="0.25"
                min="0"
                value={manualHours}
                onChange={(e) => setManualHours(e.target.value)}
                placeholder="F.eks. 2.5"
                data-testid="manual-hours"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-project">Prosjekt</Label>
              <Select value={manualProject} onValueChange={setManualProject}>
                <SelectTrigger data-testid="manual-project-select">
                  <SelectValue placeholder="Velg prosjekt (valgfritt)" />
                </SelectTrigger>
                <SelectContent>
                  {projectOptions.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", project.color)} />
                        {project.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-description">Beskrivelse</Label>
              <Input
                id="manual-description"
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="Hva jobbet du med?"
                data-testid="manual-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualDialog(false)}>
              Avbryt
            </Button>
            <Button onClick={handleManualSave} disabled={createMutation.isPending} data-testid="save-manual-entry">
              {createMutation.isPending ? "Lagrer..." : "Lagre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
