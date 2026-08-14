import { Button } from "@/components/ui/button";
import { buildEidAuthUrl } from "@/lib/auth-utils";

export default function KobleBankId() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-2xl font-semibold">Koble BankID til kontoen din</h1>
        <p className="text-muted-foreground">
          Tidum krever BankID for din rolle. Dette gjøres kun én gang — etter
          koblingen bruker du BankID for all fremtidig innlogging.
        </p>
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            onClick={() => {
              window.location.href = buildEidAuthUrl("bankid", "/dashboard");
            }}
          >
            Fortsett med BankID
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.location.href = buildEidAuthUrl("buypass", "/dashboard");
            }}
          >
            Fortsett med Buypass
          </Button>
        </div>
      </div>
    </main>
  );
}
