import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FeedbackRequest {
  id: number;
  vendorId: number | null;
  userId: string | null;
  requestType: string;
  status: string;
  triggeredAt: string;
  metadata: any;
}

interface FeedbackDialogProps {
  userId?: string;
  vendorId?: number;
}

export function FeedbackDialog({ userId, vendorId }: FeedbackDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const { toast } = useToast();

  const { data: pendingRequest } = useQuery<FeedbackRequest | null>({
    queryKey: ["/api/feedback/pending", { userId, vendorId: vendorId?.toString() }],
    enabled: !!(userId || vendorId),
  });

  useEffect(() => {
    if (pendingRequest && pendingRequest.status === "pending") {
      setIsOpen(true);
    }
  }, [pendingRequest]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/feedback/respond", {
        requestId: pendingRequest?.id,
        vendorId,
        userId,
        ratingScore: rating,
        satisfactionLabel: rating >= 4 ? "satisfied" : rating >= 3 ? "neutral" : "unsatisfied",
        textualFeedback: feedback || null,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Takk for tilbakemeldingen!",
        description: "Din vurdering hjelper oss å forbedre tjenesten.",
      });
      setIsOpen(false);
      setRating(0);
      setFeedback("");
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/stats"] });
    },
    onError: () => {
      toast({
        title: "Noe gikk galt",
        description: "Kunne ikke sende tilbakemeldingen. Prøv igjen senere.",
        variant: "destructive",
      });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/feedback/snooze", {
        requestId: pendingRequest?.id,
        snoozeHours: 24,
      });
      return response.json();
    },
    onSuccess: () => {
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/pending"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/feedback/dismiss", {
        requestId: pendingRequest?.id,
      });
      return response.json();
    },
    onSuccess: () => {
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/pending"] });
    },
  });

  const handleSubmit = () => {
    if (rating === 0) {
      toast({
        title: "Velg en vurdering",
        description: "Vennligst gi oss en stjerne-vurdering før du sender.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate();
  };

  if (!pendingRequest) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Hvordan trives du med Tidum?</DialogTitle>
          <DialogDescription>
            Din tilbakemelding hjelper oss å gjøre tjenesten bedre for alle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">Gi oss en vurdering</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="p-1 transition-transform hover:scale-110"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  data-testid={`button-star-${star}`}
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= (hoverRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm font-medium">
                {rating === 5 && "Fantastisk!"}
                {rating === 4 && "Veldig bra!"}
                {rating === 3 && "Helt OK"}
                {rating === 2 && "Kunne vært bedre"}
                {rating === 1 && "Ikke fornøyd"}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="feedback" className="text-sm font-medium">
              Har du noen kommentarer? (valgfritt)
            </label>
            <Textarea
              id="feedback"
              placeholder="Fortell oss hva du synes..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[80px]"
              data-testid="input-feedback-text"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="w-full"
            data-testid="button-submit-feedback"
          >
            {submitMutation.isPending ? "Sender..." : "Send tilbakemelding"}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => snoozeMutation.mutate()}
              disabled={snoozeMutation.isPending}
              className="flex-1"
              data-testid="button-snooze-feedback"
            >
              Spør meg senere
            </Button>
            <Button
              variant="ghost"
              onClick={() => dismissMutation.mutate()}
              disabled={dismissMutation.isPending}
              className="flex-1"
              data-testid="button-dismiss-feedback"
            >
              Ikke vis igjen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
