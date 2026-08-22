/**
 * SakJournalDialog
 *
 * Kronologisk, uforanderlig journal for én sak. Ingen rediger-/slett-knapp
 * noe sted her — kun "Korriger", som oppretter en ny, lenket oppføring.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Paperclip, CornerDownRight } from "lucide-react";

interface JournalEntry {
  id: string;
  sakId: string;
  userId: number;
  content: string;
  correctsEntryId: string | null;
  createdAt: string;
}

interface JournalAttachment {
  id: string;
  originalName: string;
  mimeType: string;
}

interface SakRecord {
  id: string;
  saksnummer?: string;
  tittel?: string;
}

interface CompanyUser {
  id: number | string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface Props {
  sak: SakRecord | null;
  open: boolean;
  onClose: () => void;
  companyTeam: CompanyUser[];
}

function authorName(userId: number, companyTeam: CompanyUser[]): string {
  const u = companyTeam.find((t) => Number(t.id) === userId);
  if (!u) return `Bruker #${userId}`;
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || `Bruker #${userId}`;
}

export function SakJournalDialog({ sak, open, onClose, companyTeam }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: entries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: [`/api/saker/${sak?.id}/journal`],
    enabled: !!sak && open,
  });

  const createMut = useMutation({
    mutationFn: async (vars: { content: string; correctsEntryId?: string | null; file: File | null }) => {
      const entry = await apiRequest("POST", `/api/saker/${sak!.id}/journal`, {
        content: vars.content,
        correctsEntryId: vars.correctsEntryId ?? undefined,
      });
      const created = await entry.json();
      if (vars.file) {
        const form = new FormData();
        form.append("file", vars.file);
        await fetch(`/api/saker/${sak!.id}/journal/${created.id}/attachments`, {
          method: "POST",
          body: form,
          credentials: "include",
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/saker/${sak?.id}/journal`] });
      setDraft("");
      setCorrectingId(null);
      setPendingFile(null);
      toast({ title: "Journalnotat lagret" });
    },
    onError: (e: any) => toast({ title: "Feil", description: e.message, variant: "destructive" }),
  });

  if (!sak) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Journal — {sak.saksnummer}</DialogTitle>
          <DialogDescription>
            Uforanderlig journalføring. En feilskrevet oppføring rettes med en ny, lenket korreksjon —
            originalen kan aldri endres eller slettes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mx-auto" />}
          {!isLoading && entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Ingen journalnotater ennå.</p>
          )}
          {entries.map((e) => (
            <div key={e.id} className="rounded-md border border-border/60 p-3 text-sm space-y-1">
              {e.correctsEntryId && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <CornerDownRight className="h-3 w-3" />
                  Korrigerer oppføring fra{" "}
                  {new Date(entries.find((o) => o.id === e.correctsEntryId)?.createdAt ?? e.createdAt).toLocaleString("nb-NO")}
                </p>
              )}
              <p className="whitespace-pre-wrap">{e.content}</p>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                <span>{authorName(e.userId, companyTeam)} · {new Date(e.createdAt).toLocaleString("nb-NO")}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setCorrectingId(e.id)}
                >
                  Korriger
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 border-t border-border/60 pt-3">
          {correctingId && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Skriver en korreksjon — originalen endres ikke.{" "}
              <button className="underline" onClick={() => setCorrectingId(null)}>Avbryt korreksjon</button>
            </p>
          )}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nytt journalnotat…"
            rows={3}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Paperclip className="h-3.5 w-3.5" />
              {pendingFile ? pendingFile.name : "Legg ved fil"}
              <input
                type="file"
                className="hidden"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              size="sm"
              disabled={!draft.trim() || createMut.isPending}
              onClick={() => createMut.mutate({ content: draft.trim(), correctsEntryId: correctingId, file: pendingFile })}
            >
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Lagre
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
