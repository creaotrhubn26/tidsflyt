import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, LockKeyhole, MessageSquareText, Paperclip, Plus, Send, ShieldCheck, UserRoundPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConversationPanel } from "@/components/secure-dialog/conversation-panel";
import { useToast } from "@/hooks/use-toast";
import {
  createSecureConversation,
  createSecureParty,
  grantSecureCaseAccess,
  listBarnevernMeldinger,
  listSecureConversations,
  listSecureParties,
  sendSecureMessage,
  SecureDialogApiError,
  type SecurePartyRole,
} from "@/lib/secure-dialog-api";
import { cn } from "@/lib/utils";

const PARTY_ROLE_LABELS: Record<SecurePartyRole, string> = {
  forelder: "Forelder",
  barn: "Barn",
  verge: "Verge",
  fullmektig: "Fullmektig",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

export default function SecureDialogStaffPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [meldingId, setMeldingId] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [recipientMode, setRecipientMode] = useState<"existing" | "new">("existing");
  const [partyId, setPartyId] = useState("");
  const [partyRole, setPartyRole] = useState<SecurePartyRole>("forelder");
  const [displayName, setDisplayName] = useState("");
  const [personnummer, setPersonnummer] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  const meldingerQuery = useQuery({
    queryKey: ["/api/barnevern/meldinger"],
    queryFn: listBarnevernMeldinger,
  });
  const partiesQuery = useQuery({
    queryKey: ["/api/secure-dialog/parties", meldingId],
    queryFn: () => listSecureParties(meldingId),
    enabled: !!meldingId,
  });
  const conversationsQuery = useQuery({
    queryKey: ["/api/secure-dialog/conversations", { meldingId }],
    queryFn: () => listSecureConversations(meldingId),
    enabled: !!meldingId,
  });

  useEffect(() => {
    if (!meldingId && meldingerQuery.data?.[0]?.id) setMeldingId(meldingerQuery.data[0].id);
  }, [meldingId, meldingerQuery.data]);

  useEffect(() => {
    setSelectedConversationId(null);
    setPartyId("");
  }, [meldingId]);

  useEffect(() => {
    if (partiesQuery.data?.length === 0) setRecipientMode("new");
  }, [partiesQuery.data]);

  const selectedParty = useMemo(
    () => partiesQuery.data?.find((party) => party.id === partyId) ?? null,
    [partiesQuery.data, partyId],
  );

  const canSubmit = !!meldingId
    && !!subject.trim()
    && !!content.trim()
    && (recipientMode === "existing"
      ? !!partyId
      : !!displayName.trim() && /^\d{11}$/.test(personnummer) && notificationEmail.includes("@"));

  const createSending = useMutation({
    mutationFn: async () => {
      let resolvedPartyId = partyId;
      let hasAccess = selectedParty?.access != null;
      if (recipientMode === "new") {
        const party = await createSecureParty({
          displayName: displayName.trim(),
          personnummer,
          notificationEmail: notificationEmail.trim().toLowerCase(),
        });
        resolvedPartyId = party.id;
        hasAccess = false;
      }
      if (!hasAccess) {
        await grantSecureCaseAccess(meldingId, { partyId: resolvedPartyId, partyRole });
      }
      const conversation = await createSecureConversation({
        meldingId,
        subject: subject.trim(),
        participantPartyIds: [resolvedPartyId],
      });
      await sendSecureMessage(conversation.id, content.trim(), attachment);
      return conversation;
    },
    onSuccess: async (conversation) => {
      setSelectedConversationId(conversation.id);
      setSubject("");
      setContent("");
      setAttachment(null);
      setDisplayName("");
      setPersonnummer("");
      setNotificationEmail("");
      if (fileInput.current) fileInput.current.value = "";
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/secure-dialog/parties", meldingId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/secure-dialog/conversations"] }),
      ]);
      toast({
        title: "Sendt sikkert",
        description: "Mottakeren får et nøytralt varsel og leser innholdet etter innlogging.",
      });
    },
    onError: (error: SecureDialogApiError) => {
      toast({ title: "Kunne ikke sende", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary p-3 text-primary-foreground">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sikker sending</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Send meldinger og dokumenter til innbyggere. Innholdet blir liggende i den sikre portalen, ikke i e-posten.
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="w-fit gap-1.5 px-3 py-1.5">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
          BankID eller Buypass hos mottaker
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Velg melding</CardTitle>
          <CardDescription>Part og samtaler avgrenses automatisk til valgt bekymringsmelding.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="secure-case">Bekymringsmelding</Label>
          <Select value={meldingId} onValueChange={setMeldingId}>
            <SelectTrigger id="secure-case" className="mt-2 w-full" data-testid="secure-case-select">
              <SelectValue placeholder={meldingerQuery.isLoading ? "Laster meldinger…" : "Velg melding"} />
            </SelectTrigger>
            <SelectContent>
              {(meldingerQuery.data ?? []).map((melding) => (
                <SelectItem key={melding.id} value={melding.id}>
                  {melding.meldingsnummer}{melding.barnNavn ? ` – ${melding.barnNavn}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {meldingerQuery.isError && <p className="mt-2 text-sm text-destructive">Meldingene kunne ikke hentes.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.5fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5" aria-hidden="true" />
                Ny sikker sending
              </CardTitle>
              <CardDescription>Velg en registrert part eller registrer en ny mottaker.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canSubmit) createSending.mutate();
                }}
              >
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1" role="group" aria-label="Velg mottakertype">
                  <Button
                    type="button"
                    variant={recipientMode === "existing" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setRecipientMode("existing")}
                    disabled={(partiesQuery.data?.length ?? 0) === 0}
                  >
                    Registrert part
                  </Button>
                  <Button
                    type="button"
                    variant={recipientMode === "new" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setRecipientMode("new")}
                  >
                    Ny part
                  </Button>
                </div>

                {recipientMode === "existing" ? (
                  <div className="space-y-2">
                    <Label htmlFor="secure-party">Mottaker</Label>
                    <Select value={partyId} onValueChange={setPartyId}>
                      <SelectTrigger id="secure-party" data-testid="secure-party-select">
                        <SelectValue placeholder={partiesQuery.isLoading ? "Laster parter…" : "Velg mottaker"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(partiesQuery.data ?? []).map((party) => (
                          <SelectItem key={party.id} value={party.id}>{party.displayName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedParty && (
                      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                        <p>{selectedParty.notificationEmail || "Ingen varslingsadresse registrert"}</p>
                        <p className="mt-1">
                          {selectedParty.access ? `Aktiv tilgang som ${PARTY_ROLE_LABELS[selectedParty.access.partyRole].toLowerCase()}` : "Tilgang til meldingen opprettes ved sending"}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 rounded-xl border p-4">
                    <div className="flex items-center gap-2 font-medium">
                      <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
                      Registrer mottaker
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secure-party-name">Navn</Label>
                      <Input id="secure-party-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={200} autoComplete="name" data-testid="secure-party-name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secure-party-ssn">Fødselsnummer</Label>
                      <Input
                        id="secure-party-ssn"
                        value={personnummer}
                        onChange={(event) => setPersonnummer(event.target.value.replace(/\D/g, "").slice(0, 11))}
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={11}
                        data-testid="secure-party-ssn"
                      />
                      <p className="text-xs text-muted-foreground">Brukes bare til sikker eID-kobling og lagres ikke i klartekst.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secure-party-email">E-post for nøytralt varsel</Label>
                      <Input id="secure-party-email" type="email" value={notificationEmail} onChange={(event) => setNotificationEmail(event.target.value)} maxLength={320} autoComplete="email" data-testid="secure-party-email" />
                    </div>
                  </div>
                )}

                {!selectedParty?.access && (
                  <div className="space-y-2">
                    <Label htmlFor="secure-party-role">Rolle i saken</Label>
                    <Select value={partyRole} onValueChange={(value) => setPartyRole(value as SecurePartyRole)}>
                      <SelectTrigger id="secure-party-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PARTY_ROLE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="secure-subject">Emne i portalen</Label>
                  <Input id="secure-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} data-testid="secure-subject" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secure-message">Melding</Label>
                  <Textarea id="secure-message" value={content} onChange={(event) => setContent(event.target.value)} rows={6} maxLength={100_000} data-testid="secure-message" />
                </div>
                <div>
                  <Label htmlFor="secure-initial-file" className="inline-flex cursor-pointer items-center gap-2">
                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                    Legg ved fil
                  </Label>
                  <input
                    ref={fileInput}
                    id="secure-initial-file"
                    type="file"
                    className="sr-only"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      if (nextFile && nextFile.size > 10 * 1024 * 1024) {
                        event.target.value = "";
                        setAttachment(null);
                        toast({ title: "Filen er for stor", description: "Maksimal filstørrelse er 10 MB.", variant: "destructive" });
                        return;
                      }
                      setAttachment(nextFile);
                    }}
                    data-testid="secure-initial-file"
                  />
                  {attachment && (
                    <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      {attachment.name}
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full gap-2" disabled={!canSubmit || createSending.isPending} data-testid="secure-create-send">
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {createSending.isPending ? "Sender sikkert…" : "Send sikkert"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquareText className="h-5 w-5" aria-hidden="true" />
                Samtaler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(conversationsQuery.data ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Ingen sikre samtaler for denne meldingen.</p>
              ) : conversationsQuery.data?.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedConversationId === conversation.id && "border-primary bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{conversation.subject}</span>
                    <Badge variant="outline">{conversation.status === "open" ? "Åpen" : "Lukket"}</Badge>
                  </div>
                  <span className="mt-1 block text-xs text-muted-foreground">Oppdatert {formatDate(conversation.updated_at)}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <ConversationPanel
          conversationId={selectedConversationId}
          viewer="staff"
          onSent={() => queryClient.invalidateQueries({ queryKey: ["/api/secure-dialog/conversations"] })}
        />
      </div>
    </div>
  );
}
