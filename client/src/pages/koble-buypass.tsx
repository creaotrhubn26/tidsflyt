import { Button } from "@/components/ui/button";
import { BUYPASS_LOGIN_URL } from "@/lib/auth-utils";

export default function KobleBuypass() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-2xl font-semibold">Koble Buypass til kontoen din</h1>
        <p className="text-muted-foreground">
          Dette gjøres kun én gang — etter koblingen kan du bruke Buypass for
          all fremtidig innlogging.
        </p>
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            onClick={() => {
              window.location.href = BUYPASS_LOGIN_URL;
            }}
          >
            Fortsett med Buypass
          </Button>
        </div>
      </div>
    </main>
  );
}
