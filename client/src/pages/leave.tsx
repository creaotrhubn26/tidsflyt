import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Plus, Check, X, Clock } from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, differenceInBusinessDays } from "date-fns";
import { nb } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

export default function LeavePage() {
  const { toast } = useToast();
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState("");

  const currentYear = new Date().getFullYear();
  const userId = "default";

  const { data: leaveTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/leave/types"],
  });

  const { data: balances = [] } = useQuery<any[]>({
    queryKey: ["/api/leave/balance", { userId, year: currentYear }],
  });

  const { data: requests = [] } = useQuery<any[]>({
    queryKey: ["/api/leave/requests", { userId }],
  });

  const createRequest = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/leave/requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave/balance"] });
      setShowRequestDialog(false);
      resetForm();
      toast({ title: "Sendt", description: "Ferieforespørsel sendt til godkjenning" });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke sende forespørsel", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedType("");
    setStartDate(undefined);
    setEndDate(undefined);
    setReason("");
  };

  const handleSubmitRequest = () => {
    if (!selectedType || !startDate || !endDate) {
      toast({ title: "Mangler informasjon", description: "Fyll ut alle felt", variant: "destructive" });
      return;
    }

    const days = differenceInBusinessDays(endDate, startDate) + 1;

    createRequest.mutate({
      userId,
      leaveTypeId: parseInt(selectedType),
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
      days,
      reason,
    });
  };

  const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning border-warning/20",
    approved: "bg-success/10 text-success border-success/20",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Ferieoversikt</h1>
            <p className="text-muted-foreground mt-1">Administrer ferie og fravær</p>
          </div>
          <Button onClick={() => setShowRequestDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Ny forespørsel
          </Button>
        </div>

        {/* Leave Balances */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {balances.map((balance: any) => (
            <Card key={balance.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <span className="text-2xl">{balance.leaveTypeIcon || "📅"}</span>
                  {balance.leaveTypeName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Totalt:</span>
                    <span className="font-medium">{parseFloat(balance.totalDays || 0).toFixed(1)} dager</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Brukt:</span>
                    <span className="font-medium">{parseFloat(balance.usedDays || 0).toFixed(1)} dager</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Venter:</span>
                    <span className="font-medium">{parseFloat(balance.pendingDays || 0).toFixed(1)} dager</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span className="font-medium">Gjenstående:</span>
                    <span className="font-bold text-primary">{parseFloat(balance.remainingDays || 0).toFixed(1)} dager</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Leave Requests */}
        <Card>
          <CardHeader>
            <CardTitle>Mine forespørsler</CardTitle>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Ingen forespørsler ennå</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Fra</TableHead>
                    <TableHead>Til</TableHead>
                    <TableHead>Dager</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sendt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request: any) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.leaveTypeName}</TableCell>
                      <TableCell>{format(new Date(request.startDate), "dd.MM.yyyy", { locale: nb })}</TableCell>
                      <TableCell>{format(new Date(request.endDate), "dd.MM.yyyy", { locale: nb })}</TableCell>
                      <TableCell>{parseFloat(request.days).toFixed(1)}</TableCell>
                      <TableCell>
                        <Badge className={cn("border", statusColors[request.status || "pending"])}>
                          {request.status === "pending" && "Venter"}
                          {request.status === "approved" && "Godkjent"}
                          {request.status === "rejected" && "Avvist"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(request.createdAt), "dd.MM.yyyy", { locale: nb })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* New Request Dialog */}
        <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ny ferieforespørsel</DialogTitle>
              <DialogDescription>Send en forespørsel om fravær til godkjenning</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Type fravær</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Velg type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((type: any) => (
                      <SelectItem key={type.id} value={type.id.toString()}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fra dato</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "dd.MM.yyyy", { locale: nb }) : "Velg dato"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Til dato</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "dd.MM.yyyy", { locale: nb }) : "Velg dato"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus disabled={(date) => startDate ? date < startDate : false} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {startDate && endDate && (
                <div className="text-sm text-muted-foreground">
                  Antall virkedager: {differenceInBusinessDays(endDate, startDate) + 1}
                </div>
              )}

              <div className="space-y-2">
                <Label>Grunn (valgfritt)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Beskriv årsaken til fraværet..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRequestDialog(false)}>
                Avbryt
              </Button>
              <Button onClick={handleSubmitRequest} disabled={createRequest.isPending}>
                Send forespørsel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
