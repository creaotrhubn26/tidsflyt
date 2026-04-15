/**
 * client/src/pages/invite-accept.tsx
 *
 * Public landing for shared invite links: /invite/:token
 *
 * Viser bedriftsnavn og rolle, lar bruker registrere seg med e-post.
 * Sender deretter magic-link for innlogging.
 */

import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, CheckCircle2, AlertCircle, Loader2, Mail, ArrowRight,
} from "lucide-react";

interface InvitePreview {
  ok: true;
  vendorName: string;
  vendorLogo: string | null;
  role: string;
  domainRestriction: string | null;
  usesRemaining: number | null;
}

const ROLE_LABELS: Record<string, string> = {
  miljoarbeider: "Miljøarbeider",
  tiltaksleder:  "Tiltaksleder",
  teamleder:     "Teamleder",
  vendor_admin:  "Bedriftsadmin",
};

export default function InviteAcceptPage() {
  const [, params] = useRoute("/invite/:token");
  const [, navigate] = useLocation();
  const token = params?.token;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/invite/${token}`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setError(body.error ?? "Lenken er ugyldig");
        } else {
          const data = await r.json();
          setPreview(data);
        }
      })
      .catch(() => !cancelled && setError("Kunne ikke laste invitasjonen"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Kunne ikke registrere", description: data.error, variant: "destructive" });
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 px-4 py-8">
      <Card className="w-full max-w-lg">
        {loading ? (
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
            Laster invitasjon…
          </CardContent>
        ) : error ? (
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="font-semibold">Lenken kan ikke brukes</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Til forsiden</Button>
          </CardContent>
        ) : done ? (
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-3" />
            <p className="font-semibold text-lg">Velkommen!</p>
            <p className="text-sm text-muted-foreground mt-2">
              Vi har sendt en innloggings-lenke til <strong>{email}</strong>.
              Sjekk innboksen din og klikk på lenken for å logge inn.
            </p>
            <Button className="mt-5" onClick={() => navigate("/")}>
              Til forsiden <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardContent>
        ) : preview && (
          <>
            <CardHeader>
              <div className="flex items-center gap-3">
                {preview.vendorLogo ? (
                  <img src={preview.vendorLogo} alt="" className="h-12 w-12 rounded-md object-contain bg-white border" />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                )}
                <div>
                  <CardTitle className="text-xl">Bli med i {preview.vendorName}</CardTitle>
                  <CardDescription>på Tidum</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Badge variant="secondary">{ROLE_LABELS[preview.role] ?? preview.role}</Badge>
                {preview.domainRestriction && (
                  <Badge variant="outline" className="text-[11px]">
                    Kun @{preview.domainRestriction}
                  </Badge>
                )}
                {preview.usesRemaining !== null && (
                  <Badge variant="outline" className="text-[11px]">
                    {preview.usesRemaining} ledige plasser
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">E-post <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={preview.domainRestriction ? `navn@${preview.domainRestriction}` : "din@e-post.no"}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Fornavn</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Etternavn</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1" />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!email.trim() || submitting}
                onClick={handleSubmit}
              >
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Bli med — send innloggings-lenke
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Vi sender en magic-link til e-posten din. Ingen passord nødvendig.
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
