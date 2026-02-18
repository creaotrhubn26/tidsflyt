import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { PortalLayout } from "@/components/portal/portal-layout";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { FileText, Plus, Download, Send, CheckCircle2, Clock, XCircle, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Invoice {
  id: number;
  invoiceNumber: string;
  userId: string;
  clientName: string;
  clientAddress: string | null;
  clientOrg: string | null;
  clientEmail: string | null;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  mva: number;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  notes: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems?: InvoiceLineItem[];
}

interface InvoiceLineItem {
  id: number;
  invoiceId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function InvoicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);

  // Form state for generating invoice
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientOrg, setClientOrg] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [hourlyRate, setHourlyRate] = useState("1200");
  const [notes, setNotes] = useState("");

  // Fetch invoices
  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  // Generate invoice mutation
  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/invoices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Kunne ikke generere faktura");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "✅ Generert!", description: "Faktura opprettet" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({ title: "❌ Feil", description: "Kunne ikke generere faktura", variant: "destructive" });
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/invoices/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Kunne ikke oppdatere status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "✅ Oppdatert!", description: "Status endret" });
    },
  });

  const resetForm = () => {
    setClientName("");
    setClientAddress("");
    setClientOrg("");
    setClientEmail("");
    setStartDate(new Date());
    setEndDate(new Date());
    setHourlyRate("1200");
    setNotes("");
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();

    generateMutation.mutate({
      clientName,
      clientAddress: clientAddress || null,
      clientOrg: clientOrg || null,
      clientEmail: clientEmail || null,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
      hourlyRate: parseFloat(hourlyRate),
      notes: notes || null,
    });
  };

  const handleDownloadPDF = async (invoiceId: number) => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Kunne ikke laste ned PDF");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faktura-${invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: "✅ Lastet ned!", description: "PDF-faktura lastet ned" });
    } catch (error) {
      toast({ title: "❌ Feil", description: "Kunne ikke laste ned PDF", variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Betalt</Badge>;
      case "sent":
        return <Badge className="bg-blue-500"><Send className="h-3 w-3 mr-1" />Sendt</Badge>;
      case "overdue":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Forfalt</Badge>;
      case "cancelled":
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Kansellert</Badge>;
      default:
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Utkast</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: "NOK",
    }).format(amount);
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Fakturaer</h1>
            <p className="text-muted-foreground">
              Generer og administrer fakturaer basert på timelister
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Ny faktura
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Generer faktura</DialogTitle>
                <DialogDescription>
                  Opprett faktura basert på registrerte timer i perioden
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleGenerate} className="space-y-4">
                {/* Client Info */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Kundeinformasjon</h3>
                  
                  <div>
                    <Label htmlFor="clientName">Kundenavn *</Label>
                    <Input
                      id="clientName"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Firma AS"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="clientOrg">Organisasjonsnummer</Label>
                    <Input
                      id="clientOrg"
                      value={clientOrg}
                      onChange={(e) => setClientOrg(e.target.value)}
                      placeholder="123 456 789"
                    />
                  </div>

                  <div>
                    <Label htmlFor="clientAddress">Adresse</Label>
                    <Textarea
                      id="clientAddress"
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                      placeholder="Gate 1&#10;0123 Oslo"
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label htmlFor="clientEmail">E-post</Label>
                    <Input
                      id="clientEmail"
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="kunde@firma.no"
                    />
                  </div>
                </div>

                {/* Period */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Faktureringsperiode</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Fra dato *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !startDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {startDate ? format(startDate, "PPP", { locale: nb }) : "Velg dato"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={startDate}
                            onSelect={(date) => date && setStartDate(date)}
                            locale={nb}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div>
                      <Label>Til dato *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !endDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {endDate ? format(endDate, "PPP", { locale: nb }) : "Velg dato"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={endDate}
                            onSelect={(date) => date && setEndDate(date)}
                            locale={nb}
                            disabled={(date) => date < startDate}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>

                {/* Pricing */}
                <div>
                  <Label htmlFor="hourlyRate">Timepris (NOK) *</Label>
                  <Input
                    id="hourlyRate"
                    type="number"
                    step="0.01"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    required
                  />
                </div>

                {/* Notes */}
                <div>
                  <Label htmlFor="notes">Notater</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ekstra informasjon på fakturaen"
                    rows={3}
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      resetForm();
                    }}
                  >
                    Avbryt
                  </Button>
                  <Button type="submit" disabled={generateMutation.isPending}>
                    Generer faktura
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Totalt antall
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{invoices.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ubetalte
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">
                {invoices.filter((i) => i.status === "sent" || i.status === "overdue").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Betalte
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {invoices.filter((i) => i.status === "paid").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total verdi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(invoices.reduce((sum, i) => sum + i.total, 0))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invoices Table */}
        <Card>
          <CardHeader>
            <CardTitle>Alle fakturaer</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground">Laster...</div>
            ) : invoices.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Ingen fakturaer ennå. Opprett din første faktura!
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fakturanr.</TableHead>
                    <TableHead>Kunde</TableHead>
                    <TableHead>Dato</TableHead>
                    <TableHead>Forfallsdato</TableHead>
                    <TableHead>Beløp</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Handlinger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                      <TableCell>{invoice.clientName}</TableCell>
                      <TableCell>
                        {format(new Date(invoice.invoiceDate), "dd.MM.yyyy", { locale: nb })}
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.dueDate), "dd.MM.yyyy", { locale: nb })}
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(invoice.total)}</TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadPDF(invoice.id)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                          {invoice.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateStatusMutation.mutate({ id: invoice.id, status: "sent" })
                              }
                            >
                              <Send className="h-4 w-4 mr-1" />
                              Send
                            </Button>
                          )}
                          {invoice.status === "sent" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateStatusMutation.mutate({ id: invoice.id, status: "paid" })
                              }
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Marker betalt
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Hvordan det fungerer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              • Fakturaer genereres automatisk fra timelister i valgt periode
            </p>
            <p className="text-sm text-muted-foreground">
              • MVA (25%) beregnes automatisk på totalsummen
            </p>
            <p className="text-sm text-muted-foreground">
              • Last ned som PDF for profesjonell utsending
            </p>
            <p className="text-sm text-muted-foreground">
              • Forfallsdato settes automatisk til 14 dager fra fakturadato
            </p>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
