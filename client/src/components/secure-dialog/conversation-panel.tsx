import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, LockKeyhole, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  getSecureConversation,
  secureAttachmentUrl,
  sendSecureMessage,
  type SecureDialogApiError,
} from "@/lib/secure-dialog-api";
import { cn } from "@/lib/utils";

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

function formatTimestamp(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} kB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

type ConversationPanelProps = {
  conversationId: string | null;
  viewer: "staff" | "party";
  onSent?: () => void;
};

export function ConversationPanel({ conversationId, viewer, onSent }: ConversationPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  const conversationQuery = useQuery({
    queryKey: ["/api/secure-dialog/conversations", conversationId],
    queryFn: () => getSecureConversation(conversationId!),
    enabled: !!conversationId,
  });

  const sendMutation = useMutation({
    mutationFn: () => sendSecureMessage(conversationId!, content.trim(), attachment),
    onSuccess: async () => {
      setContent("");
      setAttachment(null);
      if (fileInput.current) fileInput.current.value = "";
      await queryClient.invalidateQueries({
        queryKey: ["/api/secure-dialog/conversations", conversationId],
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/secure-dialog/conversations"] });
      onSent?.();
      toast({ title: "Sendt sikkert", description: "Meldingen ligger nå i den sikre samtalen." });
    },
    onError: (error: SecureDialogApiError) => {
      toast({
        title: "Kunne ikke sende",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!conversationId) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
          <LockKeyhole className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">Velg en sikker samtale</p>
            <p className="mt-1 text-sm text-muted-foreground">Innholdet åpnes først etter tilgangskontroll.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (conversationQuery.isLoading) {
    return (
      <Card>
        <CardContent className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">
          Laster sikker samtale…
        </CardContent>
      </Card>
    );
  }

  if (conversationQuery.isError || !conversationQuery.data) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex min-h-48 items-center justify-center text-center text-sm text-destructive">
          Samtalen kunne ikke åpnes. Kontroller tilgangen og prøv igjen.
        </CardContent>
      </Card>
    );
  }

  const conversation = conversationQuery.data;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{conversation.subject}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {conversation.participants.map((participant) => participant.displayName).join(", ")}
            </p>
          </div>
          <Badge variant={conversation.status === "open" ? "secondary" : "outline"}>
            {conversation.status === "open" ? "Åpen" : "Lukket"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <section aria-label="Meldinger" aria-live="polite" className="max-h-[52vh] space-y-4 overflow-y-auto p-4 sm:p-6">
          {conversation.messages.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Ingen meldinger ennå.</div>
          ) : conversation.messages.map((message) => {
            const ownMessage = message.senderKind === viewer;
            const senderLabel = ownMessage
              ? "Du"
              : message.senderKind === "staff"
                ? "Barnevernstjenesten"
                : "Innbygger";
            return (
              <article
                key={message.id}
                className={cn(
                  "max-w-[92%] rounded-2xl border px-4 py-3 shadow-sm sm:max-w-[78%]",
                  ownMessage
                    ? "ml-auto border-primary/20 bg-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                <div className={cn("mb-2 flex items-center justify-between gap-4 text-xs", ownMessage ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  <span className="font-medium">{senderLabel}</span>
                  <time dateTime={message.sentAt ?? message.createdAt}>{formatTimestamp(message.sentAt ?? message.createdAt)}</time>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
                {message.attachments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.attachments.map((file) => (
                      <a
                        key={file.id}
                        href={secureAttachmentUrl(conversation.id, file.id)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          ownMessage ? "border-primary-foreground/30" : "border-border",
                        )}
                        download
                      >
                        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
                        <span className="shrink-0 text-xs opacity-75">{formatBytes(file.sizeBytes)}</span>
                      </a>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {conversation.status === "open" ? (
          <form
            className="space-y-4 border-t bg-muted/20 p-4 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (content.trim()) sendMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={`secure-reply-${conversation.id}`}>Skriv svar</Label>
              <Textarea
                id={`secure-reply-${conversation.id}`}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={100_000}
                rows={4}
                placeholder="Skriv meldingen her. Innholdet sendes ikke på e-post."
                data-testid="secure-dialog-reply"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Label
                  htmlFor={`secure-file-${conversation.id}`}
                  className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium"
                >
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                  Legg ved fil
                </Label>
                <input
                  ref={fileInput}
                  id={`secure-file-${conversation.id}`}
                  type="file"
                  accept={ALLOWED_FILE_TYPES}
                  className="sr-only"
                  onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                  data-testid="secure-dialog-file"
                />
                {attachment && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="max-w-64 truncate">{attachment.name}</span>
                    <button type="button" className="underline" onClick={() => {
                      setAttachment(null);
                      if (fileInput.current) fileInput.current.value = "";
                    }}>Fjern</button>
                  </div>
                )}
              </div>
              <Button
                type="submit"
                disabled={!content.trim() || sendMutation.isPending}
                className="gap-2"
                data-testid="secure-dialog-send"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {sendMutation.isPending ? "Sender sikkert…" : "Send sikkert"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Vedlegg kan være opptil 10 MB. Mottakeren får bare et nøytralt varsel og må logge inn for å lese innholdet.
            </p>
          </form>
        ) : (
          <div className="border-t bg-muted/20 p-4 text-center text-sm text-muted-foreground">Samtalen er lukket og kan ikke besvares.</div>
        )}
      </CardContent>
    </Card>
  );
}
