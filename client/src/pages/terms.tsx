import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import { Link } from "wouter";
import { SmartTimingLogo } from "@/components/smart-timing-logo";
import { useQuery } from "@tanstack/react-query";

interface PageContent {
  title: string;
  subtitle: string;
  content: string;
  last_updated: string;
}

export default function Terms() {
  const { data: pageContent } = useQuery<PageContent>({
    queryKey: ['/api/cms/pages/terms'],
  });

  const content = pageContent || {
    title: "Brukervilkår",
    subtitle: "Vilkår for bruk av Tidum",
    content: `
## 1. Aksept av vilkår
Ved å bruke Tidum aksepterer du disse brukervilkårene. Hvis du ikke aksepterer vilkårene, må du ikke bruke tjenesten.

## 2. Beskrivelse av tjenesten
Tidum er en tidsregistrerings- og prosjektstyringsplattform. Tjenesten lar deg:
- Registrere arbeidstimer
- Administrere prosjekter og saker
- Generere rapporter
- Samarbeide med kolleger

## 3. Brukerkontoer
- Du må oppgi nøyaktig informasjon ved registrering
- Du er ansvarlig for å holde passordet ditt konfidensielt
- Du må varsle oss umiddelbart ved uautorisert bruk

## 4. Akseptabel bruk
Du samtykker i å ikke:
- Bruke tjenesten til ulovlige formål
- Forsøke å få uautorisert tilgang
- Dele din konto med andre
- Laste opp skadelig programvare

## 5. Immaterielle rettigheter
Alt innhold og programvare i Tidum er eid av Tidum AS eller våre lisensgivere. Du får en begrenset lisens til å bruke tjenesten.

## 6. Databehandling
Vi behandler data i henhold til vår personvernerklæring. Ved å bruke tjenesten samtykker du til denne behandlingen.

## 7. Ansvarsbegrensning
Tidum leveres "som den er". Vi garanterer ikke uavbrutt tilgang eller fravær av feil. Vårt maksimale ansvar er begrenset til beløpet du har betalt for tjenesten.

## 8. Abonnement og betaling
- Abonnementer faktureres forskuddsvis
- Priser kan endres med 30 dagers varsel
- Refusjoner gis i henhold til gjeldende lovgivning

## 9. Oppsigelse
Du kan si opp din konto når som helst. Vi kan si opp din tilgang ved brudd på vilkårene. Ved oppsigelse slettes dine data i henhold til personvernerklæringen.

## 10. Endringer i vilkårene
Vi kan oppdatere disse vilkårene. Fortsatt bruk etter endringer utgjør aksept av de nye vilkårene.

## 11. Gjeldende lov
Disse vilkårene er underlagt norsk lov. Tvister skal løses ved Oslo tingrett.

## 12. Kontakt
Spørsmål om vilkårene kan rettes til juridisk@tidum.no
    `,
    last_updated: "20. desember 2025"
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="rt-container py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tilbake
            </Button>
          </Link>
          <div className="flex items-center gap-2" data-testid="header-logo">
            <SmartTimingLogo size="sm" showText={false} />
            <h1 className="text-xl font-bold" data-testid="text-page-title">Tidum</h1>
          </div>
        </div>
      </header>

      <main className="rt-container py-12 max-w-3xl">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-primary/10">
              <FileText className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-4" data-testid="text-terms-title">{content.title}</h1>
          <p className="text-lg text-muted-foreground" data-testid="text-terms-subtitle">{content.subtitle}</p>
          <p className="text-sm text-muted-foreground mt-2" data-testid="text-last-updated">
            Sist oppdatert: {content.last_updated}
          </p>
        </div>

        <Card data-testid="card-terms-content">
          <CardContent className="prose prose-gray dark:prose-invert max-w-none pt-6">
            <div 
              className="space-y-4"
              data-testid="text-terms-content"
              dangerouslySetInnerHTML={{ 
                __html: content.content
                  .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-8 mb-4">$1</h2>')
                  .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-6 mb-3">$1</h3>')
                  .replace(/^\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
                  .replace(/^- (.*$)/gim, '<li class="ml-4">$1</li>')
                  .replace(/\n\n/g, '</p><p class="mb-4">')
              }}
            />
          </CardContent>
        </Card>
      </main>

      <footer className="border-t py-8 mt-12">
        <div className="rt-container text-center text-sm text-muted-foreground">
          <div className="flex justify-center gap-6 mb-4">
            <Link href="/kontakt" className="hover:text-foreground" data-testid="link-contact">Kontakt</Link>
            <Link href="/personvern" className="hover:text-foreground" data-testid="link-privacy">Personvern</Link>
          </div>
          <p data-testid="text-copyright">© 2025 Tidum. Alle rettigheter reservert.</p>
        </div>
      </footer>
    </div>
  );
}
