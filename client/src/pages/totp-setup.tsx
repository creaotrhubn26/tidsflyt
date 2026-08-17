import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

type Step = "loading" | "scan" | "recovery" | "load-error";

export default function TotpSetup() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("loading");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/totp/setup/start");
        const data = await res.json();
        setQrDataUrl(data.qrDataUrl);
        setSecret(data.secret);
        setStep("scan");
      } catch {
        setStep("load-error");
      }
    })();
  }, []);

  async function handleConfirm() {
    setError("");
    try {
      const res = await apiRequest("POST", "/api/totp/setup/confirm", { code });
      const data = await res.json();
      setRecoveryCodes(data.recoveryCodes);
      setStep("recovery");
    } catch {
      setError("Ugyldig kode. Prøv igjen.");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {step === "loading" && <p className="text-muted-foreground">Laster …</p>}

        {step === "load-error" && (
          <>
            <h1 className="text-2xl font-semibold">Kunne ikke starte TOTP-oppsett</h1>
            <p className="text-muted-foreground">Prøv å laste siden på nytt.</p>
          </>
        )}

        {step === "scan" && (
          <>
            <h1 className="text-2xl font-semibold">Sett opp tofaktorautentisering</h1>
            <p className="text-muted-foreground">
              Din rolle krever 2FA. Skann QR-koden med en autentiseringsapp
              (f.eks. Google Authenticator eller 1Password), eller skriv inn
              nøkkelen manuelt.
            </p>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR-kode for TOTP-oppsett"
                className="mx-auto h-48 w-48"
              />
            )}
            <p className="text-xs font-mono break-all text-muted-foreground">{secret}</p>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-sifret kode"
              inputMode="numeric"
              maxLength={6}
              className="text-center tracking-widest"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-col gap-3">
              <Button type="button" onClick={handleConfirm} disabled={code.length !== 6}>
                Bekreft
              </Button>
            </div>
          </>
        )}

        {step === "recovery" && (
          <>
            <h1 className="text-2xl font-semibold">Lagre gjenopprettingskodene dine</h1>
            <p className="text-destructive font-medium">
              Disse vises kun én gang. Lagre dem et trygt sted nå — de kan
              ikke hentes frem igjen senere.
            </p>
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((rc) => (
                <li key={rc} className="border rounded px-2 py-1">
                  {rc}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3">
              <Button type="button" onClick={() => navigate("/dashboard")}>
                Jeg har lagret kodene
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
