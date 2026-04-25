/**
 * SakLocationDialog
 *
 * Tiltaksleder/vendor_admin sets the sak's "standard arbeidssted":
 * an address + lat/lng that auto-kjøregodt uses to compute mileage
 * when miljøarbeidere clocks in/out.
 *
 * Address search: Kartverket / Geonorge — free, no auth, no API key.
 * Endpoint: https://ws.geonorge.no/adresser/v1/sok
 *
 * Persists to saker.ekstra_felter.defaultLocation via PATCH /api/saker/:id
 * (preserves any other ekstra_felter keys already on the sak).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, MapPin, Search, X } from "lucide-react";

interface KartverketAddress {
  adressetekst: string;
  adressenavn?: string;
  poststed?: string;
  postnummer?: string;
  representasjonspunkt?: { lat: number; lon: number };
}

interface SakRecord {
  id: string;
  saksnummer?: string;
  tittel?: string;
  ekstraFelter?: Record<string, any> | null;
}

interface Props {
  sak: SakRecord | null;
  open: boolean;
  onClose: () => void;
}

interface DefaultLocation {
  address: string;
  lat: number | null;
  lng: number | null;
}

function readLocation(sak: SakRecord | null): DefaultLocation {
  const loc = (sak?.ekstraFelter as any)?.defaultLocation;
  return {
    address: typeof loc?.address === "string" ? loc.address : "",
    lat: typeof loc?.lat === "number" ? loc.lat : null,
    lng: typeof loc?.lng === "number" ? loc.lng : null,
  };
}

async function searchKartverket(query: string): Promise<KartverketAddress[]> {
  if (query.trim().length < 3) return [];
  const url = `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(query)}&treffPerSide=6&utkoordsys=4258`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kartverket-søk feilet (${res.status})`);
  const json = await res.json() as { adresser?: KartverketAddress[] };
  return Array.isArray(json.adresser) ? json.adresser : [];
}

export function SakLocationDialog({ sak, open, onClose }: Props) {
  const { toast } = useToast();
  const initial = useMemo(() => readLocation(sak), [sak]);
  const [address, setAddress] = useState(initial.address);
  const [lat, setLat] = useState<string>(initial.lat != null ? String(initial.lat) : "");
  const [lng, setLng] = useState<string>(initial.lng != null ? String(initial.lng) : "");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KartverketAddress[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset form when dialog opens for a new sak
  useEffect(() => {
    if (open) {
      const loc = readLocation(sak);
      setAddress(loc.address);
      setLat(loc.lat != null ? String(loc.lat) : "");
      setLng(loc.lng != null ? String(loc.lng) : "");
      setSearchQuery("");
      setSearchResults([]);
      setSearchOpen(false);
    }
  }, [open, sak]);

  // Debounced Kartverket search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchKartverket(searchQuery);
        setSearchResults(results);
        setSearchOpen(true);
      } catch (err: any) {
        toast({ title: "Adresse-søk feilet", description: err?.message || "Prøv igjen", variant: "destructive" });
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, toast]);

  // Click-outside to close suggestion list
  useEffect(() => {
    if (!searchOpen) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [searchOpen]);

  const pickResult = (r: KartverketAddress) => {
    setAddress(r.adressetekst);
    if (r.representasjonspunkt) {
      setLat(String(r.representasjonspunkt.lat));
      setLng(String(r.representasjonspunkt.lon));
    }
    setSearchQuery("");
    setSearchResults([]);
    setSearchOpen(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!sak) throw new Error("Ingen sak");
      const latNum = lat.trim() ? Number(lat) : null;
      const lngNum = lng.trim() ? Number(lng) : null;
      if (latNum != null && (!Number.isFinite(latNum) || latNum < -90 || latNum > 90)) {
        throw new Error("Ugyldig breddegrad (lat). Forventer -90 til 90.");
      }
      if (lngNum != null && (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180)) {
        throw new Error("Ugyldig lengdegrad (lng). Forventer -180 til 180.");
      }
      const existing = (sak.ekstraFelter ?? {}) as Record<string, any>;
      const nextEkstra = address.trim() || latNum != null
        ? {
            ...existing,
            defaultLocation: {
              address: address.trim(),
              lat: latNum,
              lng: lngNum,
            },
          }
        : (() => {
            const { defaultLocation, ...rest } = existing;
            return rest;
          })();
      const res = await apiRequest("PATCH", `/api/saker/${sak.id}`, { ekstraFelter: nextEkstra });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Standard arbeidssted lagret" });
      queryClient.invalidateQueries({ queryKey: ["/api/saker"] });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Lagring feilet", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const handleClear = () => {
    setAddress("");
    setLat("");
    setLng("");
    setSearchQuery("");
    setSearchResults([]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Standard arbeidssted
          </DialogTitle>
          <DialogDescription>
            Sett primær-adresse for {sak?.tittel || "saken"}. Brukes for å auto-beregne kjøregodtgjørelse når miljøarbeider stempler inn.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Address search */}
          <div className="space-y-1.5" ref={containerRef}>
            <Label htmlFor="sak-loc-search">Søk i Kartverket</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="sak-loc-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                placeholder="Skriv inn adresse, f.eks. «Karl Johans gate 1»"
                className="pl-9"
                autoComplete="off"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              )}
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-64 overflow-y-auto">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickResult(r)}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b border-border last:border-0"
                    >
                      <p className="font-medium truncate">{r.adressetekst}</p>
                      {r.representasjonspunkt && (
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {r.representasjonspunkt.lat.toFixed(5)}, {r.representasjonspunkt.lon.toFixed(5)}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Manual fields (also auto-populated by search) */}
          <div className="space-y-1.5">
            <Label htmlFor="sak-loc-address">Adresse</Label>
            <Input
              id="sak-loc-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Karl Johans gate 1, 0154 Oslo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sak-loc-lat">Breddegrad (lat)</Label>
              <Input
                id="sak-loc-lat"
                type="number"
                inputMode="decimal"
                step="0.000001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="59.91085"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sak-loc-lng">Lengdegrad (lng)</Label>
              <Input
                id="sak-loc-lng"
                type="number"
                inputMode="decimal"
                step="0.000001"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="10.74033"
              />
            </div>
          </div>

          {(address || lat || lng) && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground">
              <X className="h-3.5 w-3.5 mr-1" />
              Fjern arbeidssted
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>Avbryt</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lagrer…</> : "Lagre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
