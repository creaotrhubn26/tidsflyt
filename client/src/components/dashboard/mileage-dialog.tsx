import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export interface MileageDialogProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  date: string;           // YYYY-MM-DD
  sakId?: string | null;
  defaultFromName?: string;
  defaultToName?: string;
  onSaved?: () => void;
}

interface RateInfo { ratePerKm: number; passengerRatePerKm: number }

export function MileageDialog({
  open, onClose, userId, date,
  sakId = null, defaultFromName = "", defaultToName = "",
  onSaved,
}: MileageDialogProps) {
  const { toast } = useToast();
  const [fromName, setFromName] = useState(defaultFromName);
  const [toName, setToName] = useState(defaultToName);
  const [kilometers, setKilometers] = useState("");
  const [passengerCount, setPassengerCount] = useState("0");
  const [rateInfo, setRateInfo] = useState<RateInfo | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFromName(defaultFromName);
    setToName(defaultToName);
    setKilometers("");
    setPassengerCount("0");
    fetch("/api/travel-legs/rate", { credentials: "include" })
      .then((r) => r.json())
      .then(setRateInfo)
      .catch(() => { /* ignore */ });
  }, [open, defaultFromName, defaultToName]);

  const km = Number(kilometers);
  const passengers = Number(passengerCount) || 0;
  const rate = rateInfo?.ratePerKm ?? 3.5;
  const passRate = rateInfo?.passengerRatePerKm ?? 1.0;
  const estimatedTotal = Number.isFinite(km) && km > 0
    ? Math.round((km * rate + km * passengers * passRate) * 100) / 100
    : 0;

  const canSave = fromName.trim() && toName.trim() && Number.isFinite(km) && km > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await apiRequest("POST", "/api/travel-legs", {
        userId,
        date,
        sakId,
        fromName: fromName.trim(),
        toName: toName.trim(),
        kilometers: km,
        passengerCount: passengers,
        source: "manual",
        calculatedBy: "manual",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Kunne ikke lagre kjøring");
      }
      toast({ title: "Kjøring registrert", description: `${km.toFixed(1)} km — kr ${estimatedTotal.toFixed(2)}` });
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast({ title: "Feilet", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Legg til kjøring</DialogTitle>
          <DialogDescription>Registrer kjørestrekning for {date}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="mileage-from">Fra</Label>
            <Input id="mileage-from" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="f.eks. Hjemmeadresse" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mileage-to">Til</Label>
            <Input id="mileage-to" value={toName} onChange={(e) => setToName(e.target.value)} placeholder="f.eks. Sakens adresse" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mileage-km">Kilometer</Label>
              <Input
                id="mileage-km"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                value={kilometers}
                onChange={(e) => setKilometers(e.target.value)}
                placeholder="0.0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mileage-passengers">Passasjerer</Label>
              <Input
                id="mileage-passengers"
                type="number"
                inputMode="numeric"
                min="0"
                max="10"
                value={passengerCount}
                onChange={(e) => setPassengerCount(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Estimert godtgjørelse</span>
              <span className="font-medium tabular-nums">kr {estimatedTotal.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {rate.toFixed(2)} kr/km{passengers > 0 ? ` + ${passRate.toFixed(2)} kr/km × ${passengers} passasjer` : ""}
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Avbryt</Button>
          <Button onClick={handleSave} disabled={!canSave}>{saving ? "Lagrer…" : "Lagre kjøring"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
