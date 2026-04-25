/**
 * GpsConsentDialog
 *
 * Vises første gang en miljøarbeider stempler inn etter at sak-velger er
 * tatt i bruk. Spør om informert samtykke til posisjonsfangst for å auto-
 * registrere kjøregodtgjørelse.
 *
 * Juridisk ramme:
 *   - Posisjonsdata fra ansatte = "kontrolltiltak" etter Arbeidsmiljøloven
 *     §9-1 — krever (1) saklig grunn, (2) drøfting/informasjon, (3) ikke
 *     uforholdsmessig, (4) skriftlig informasjon. Denne dialogen er den
 *     skriftlige informasjonen.
 *   - Datatilsynet: rent samtykke er IKKE gyldig rettsgrunnlag mellom
 *     arbeidsgiver og ansatt grunnet asymmetrisk maktforhold. Kombineres
 *     derfor med rettsgrunnlag i berettiget interesse + arbeidskontrakt
 *     (kjøregodt = en kontrakts-fordel).
 *   - Brukerens "Ikke nå"-valg lagres så vi ikke spør igjen før de selv
 *     reverserer i innstillingene. Auto-kjøregodt deaktiveres da.
 *
 * Lagring: userSettings.dashboardPrefs.gpsCaptureEnabled (bool) +
 *          gpsConsentAt (ISO timestamp).
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, ShieldCheck, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: (decision: boolean) => void;
}

async function saveGpsPreference(enabled: boolean): Promise<void> {
  const res = await fetch("/api/user-state/settings", { credentials: "include" });
  const current = res.ok ? await res.json() : null;
  const prevPrefs = (current?.dashboardPrefs ?? {}) as Record<string, any>;
  const nextPrefs = {
    ...prevPrefs,
    gpsCaptureEnabled: enabled,
    gpsConsentAt: new Date().toISOString(),
  };
  await fetch("/api/user-state/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ dashboardPrefs: nextPrefs }),
  });
}

export function GpsConsentDialog({ open, onClose }: Props) {
  const [decision, setDecision] = useState<"accept" | "decline" | null>(null);
  const saveMutation = useMutation({
    mutationFn: async (accepted: boolean) => {
      await saveGpsPreference(accepted);
      return accepted;
    },
    onSuccess: (accepted) => onClose(accepted),
  });

  const handle = (accepted: boolean) => {
    setDecision(accepted ? "accept" : "decline");
    saveMutation.mutate(accepted);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saveMutation.isPending && onClose(false)}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Auto-kjøregodtgjørelse
          </DialogTitle>
          <DialogDescription>
            Skriftlig informasjon om kontrolltiltak (Arbeidsmiljøloven §9-1)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm text-foreground">
          <p>
            Når du stempler inn på en sak, kan Tidum automatisk fange din
            <strong> geografiske posisjon én gang</strong> for å beregne kjøregodtgjørelse
            mellom der du er og saksens registrerte arbeidssted.
          </p>

          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-xs">
            <p className="font-medium text-foreground">Hva vi gjør:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Henter posisjon én gang når du trykker «Fortsett»</li>
              <li>Bruker den til å beregne kilometer mellom punkt og sak</li>
              <li>Avrunder posisjonen til ~110 m presisjon etter 90 dager</li>
              <li>Sletter posisjonen helt etter 5 år (regnskaps-bilag)</li>
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-xs">
            <p className="font-medium text-foreground">Hva vi IKKE gjør:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Sporer deg kontinuerlig — kun ved klokk-inn</li>
              <li>Deler posisjonen med andre tjenester eller tredjeparter</li>
              <li>Bruker posisjonen til andre formål enn kjøregodt</li>
              <li>Knytter posisjonen til klient-IDer i klartekst</li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Du kan slå av auto-kjøregodtgjørelse når som helst i innstillingene dine.
            Da må du registrere kjøring manuelt. Behandlingen er nødvendig for å levere
            kjøregodt-fordelen din etter arbeidskontrakten (Personopplysningsloven §6 b)
            og kvalifiserer som kontrolltiltak etter Arbeidsmiljøloven §9-1.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handle(false)}
            disabled={saveMutation.isPending}
            data-testid="gps-consent-decline"
          >
            {saveMutation.isPending && decision === "decline"
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lagrer…</>
              : "Nei takk — registrer manuelt"}
          </Button>
          <Button
            onClick={() => handle(true)}
            disabled={saveMutation.isPending}
            data-testid="gps-consent-accept"
          >
            {saveMutation.isPending && decision === "accept"
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lagrer…</>
              : <><ShieldCheck className="h-4 w-4 mr-2" /> Aktiver auto-kjøring</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
