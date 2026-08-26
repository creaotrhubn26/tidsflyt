import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole, LogOut, MessageSquareText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConversationPanel } from "@/components/secure-dialog/conversation-panel";
import { useAuth } from "@/hooks/use-auth";
import { BUYPASS_LOGIN_URL, IDURA_LOGIN_URL } from "@/lib/auth-utils";
import { listSecureConversations } from "@/lib/secure-dialog-api";
import { cn } from "@/lib/utils";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

export default function InnbyggerPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const conversationsQuery = useQuery({
    queryKey: ["/api/secure-dialog/conversations"],
    queryFn: () => listSecureConversations(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!selectedConversationId && conversationsQuery.data?.[0]?.id) {
      setSelectedConversationId(conversationsQuery.data[0].id);
    }
  }, [conversationsQuery.data, selectedConversationId]);

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Innbygger";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary p-2.5 text-primary-foreground">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold leading-tight">Sikker portal</p>
              <p className="text-xs text-muted-foreground">Innlogget som {displayName}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => logout()} disabled={isLoggingOut}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Logg ut</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Mine sikre meldinger</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Her kan du lese og svare barnevernstjenesten. Innhold og dokumenter vises bare etter sikker innlogging.
              </p>
            </div>
            <Badge variant="secondary" className="w-fit gap-1.5 px-3 py-1.5">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              Sikker innlogging
            </Badge>
          </div>
        </section>

        {conversationsQuery.isError ? (
          <Card className="border-destructive/40">
            <CardContent className="py-10 text-center">
              <p className="font-medium text-destructive">Meldingene kunne ikke åpnes</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Logg inn på nytt med BankID eller Buypass. Kontakt barnevernstjenesten hvis problemet fortsetter.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Button asChild><a href={IDURA_LOGIN_URL}>Logg inn med BankID</a></Button>
                <Button variant="outline" asChild><a href={BUYPASS_LOGIN_URL}>Logg inn med Buypass</a></Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.65fr)_minmax(0,1.7fr)]">
            <aside aria-label="Samtaler">
              <Card>
                <CardContent className="p-3">
                  <div className="mb-2 flex items-center gap-2 px-2 py-2 font-semibold">
                    <MessageSquareText className="h-5 w-5" aria-hidden="true" />
                    Samtaler
                  </div>
                  {conversationsQuery.isLoading ? (
                    <p className="px-2 py-8 text-center text-sm text-muted-foreground">Laster meldinger…</p>
                  ) : (conversationsQuery.data ?? []).length === 0 ? (
                    <div className="px-3 py-10 text-center">
                      <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <p className="mt-3 font-medium">Ingen meldinger ennå</p>
                      <p className="mt-1 text-sm text-muted-foreground">Nye samtaler vises her når barnevernstjenesten sender dem.</p>
                    </div>
                  ) : conversationsQuery.data?.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className={cn(
                        "mb-2 w-full rounded-xl border p-3 text-left transition-colors last:mb-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selectedConversationId === conversation.id && "border-primary bg-primary/5",
                      )}
                      data-testid={`portal-conversation-${conversation.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{conversation.subject}</span>
                        {conversation.status === "closed" && <Badge variant="outline">Lukket</Badge>}
                      </div>
                      <span className="mt-1 block text-xs text-muted-foreground">Oppdatert {formatDate(conversation.updated_at)}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </aside>

            <ConversationPanel conversationId={selectedConversationId} viewer="party" />
          </div>
        )}

        <footer className="pb-4 text-center text-xs text-muted-foreground">
          Ikke send akutte henvendelser her. Kontakt nødnummer eller kommunens barnevernsvakt ved fare.
        </footer>
      </main>
    </div>
  );
}
