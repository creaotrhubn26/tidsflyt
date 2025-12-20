import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface PageContent {
  title: string;
  subtitle: string;
  content: string;
  last_updated: string;
}

export default function Privacy() {
  const { data: pageContent } = useQuery<PageContent>({
    queryKey: ['/api/cms/pages/privacy'],
  });

  const content = pageContent || {
    title: "Personvernerklæring",
    subtitle: "Slik beskytter vi dine personopplysninger",
    content: `
## 1. Innledning
Smart Timing AS ("vi", "oss", "vår") er opptatt av å beskytte personvernet til våre brukere. Denne personvernerklæringen forklarer hvordan vi samler inn, bruker, deler og beskytter personopplysninger.

## 2. Hvilke opplysninger vi samler inn
Vi samler inn følgende typer personopplysninger:
- **Kontaktinformasjon**: Navn, e-postadresse, telefonnummer
- **Kontoopplysninger**: Brukernavn, passord (kryptert)
- **Arbeidsdata**: Timeregistreringer, prosjektdata, saksnumre
- **Tekniske data**: IP-adresse, nettlesertype, enhetsdata

## 3. Hvordan vi bruker opplysningene
Vi bruker personopplysningene til å:
- Levere og forbedre våre tjenester
- Kommunisere med deg om din konto
- Sende viktige oppdateringer og varsler
- Overholde juridiske forpliktelser

## 4. Deling av opplysninger
Vi deler ikke personopplysninger med tredjeparter, med unntak av:
- Når du har gitt samtykke
- For å oppfylle juridiske forpliktelser
- Med tjenesteleverandører som behandler data på våre vegne

## 5. Lagring og sikkerhet
Vi lagrer personopplysninger så lenge det er nødvendig for formålene beskrevet i denne erklæringen. Vi bruker bransjestandarder for sikkerhet, inkludert kryptering og sikre servere.

## 6. Dine rettigheter
Du har rett til å:
- Be om innsyn i dine personopplysninger
- Be om retting eller sletting
- Protestere mot behandling
- Trekke tilbake samtykke

## 7. Informasjonskapsler (cookies)
Vi bruker informasjonskapsler for å forbedre brukeropplevelsen. Du kan administrere dine preferanser i nettleserinnstillingene.

## 8. Kontakt
Har du spørsmål om personvern? Kontakt oss på personvern@smarttiming.no
    `,
    last_updated: "20. desember 2025"
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tilbake
            </Button>
          </Link>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Smart Timing</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-4" data-testid="text-privacy-title">{content.title}</h1>
          <p className="text-lg text-muted-foreground" data-testid="text-privacy-subtitle">{content.subtitle}</p>
          <p className="text-sm text-muted-foreground mt-2" data-testid="text-last-updated">
            Sist oppdatert: {content.last_updated}
          </p>
        </div>

        <Card data-testid="card-privacy-content">
          <CardContent className="prose prose-gray dark:prose-invert max-w-none pt-6">
            <div 
              className="space-y-4"
              data-testid="text-privacy-content"
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
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <div className="flex justify-center gap-6 mb-4">
            <Link href="/kontakt" className="hover:text-foreground" data-testid="link-contact">Kontakt</Link>
            <Link href="/vilkar" className="hover:text-foreground" data-testid="link-terms">Vilkår</Link>
          </div>
          <p data-testid="text-copyright">© 2025 Smart Timing. Alle rettigheter reservert.</p>
        </div>
      </footer>
    </div>
  );
}
