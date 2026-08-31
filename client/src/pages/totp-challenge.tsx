import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

export default function TotpChallenge() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleVerify() {
    setError("");
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/totp/verify", { code });
      navigate("/dashboard");
    } catch {
      setError("Ugyldig kode. Prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-2xl font-semibold">Bekreft tofaktorautentisering</h1>
        <p className="text-muted-foreground">
          Skriv inn en 6-sifret kode fra autentiseringsappen din, eller en av
          gjenopprettingskodene dine.
        </p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          placeholder="6-sifret kode eller gjenopprettingskode"
          className="text-center tracking-widest"
          autoFocus
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-3">
          <Button type="button" onClick={handleVerify} disabled={!code || submitting}>
            Bekreft
          </Button>
        </div>
      </div>
    </main>
  );
}
