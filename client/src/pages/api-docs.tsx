import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code, Key, Clock, Users, FileText, Settings, Shield, Zap } from "lucide-react";

const API_VERSION = "1.0.0";
const BASE_URL = "/api/v1/vendor";

interface EndpointProps {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  permission: string;
  parameters?: { name: string; type: string; description: string; required?: boolean }[];
  response: string;
}

function Endpoint({ method, path, description, permission, parameters, response }: EndpointProps) {
  const methodColors = {
    GET: "bg-green-500/10 text-green-600 border-green-500/20",
    POST: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    PUT: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    DELETE: "bg-red-500/10 text-red-600 border-red-500/20",
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className={methodColors[method]} variant="outline">{method}</Badge>
          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{BASE_URL}{path}</code>
        </div>
        <CardDescription className="mt-2">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>Krever tillatelse: <code className="bg-muted px-1 rounded">{permission}</code></span>
        </div>
        
        {parameters && parameters.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Parametere:</p>
            <div className="space-y-1">
              {parameters.map((param) => (
                <div key={param.name} className="flex items-start gap-2 text-sm">
                  <code className="bg-muted px-1 rounded">{param.name}</code>
                  <span className="text-muted-foreground">({param.type})</span>
                  {param.required && <Badge variant="secondary" className="text-xs">Obligatorisk</Badge>}
                  <span className="text-muted-foreground">- {param.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div>
          <p className="text-sm font-medium mb-2">Eksempel respons:</p>
          <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
            <code>{response}</code>
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Code className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-api-docs-title">Smart Timing API</h1>
          <Badge variant="outline">v{API_VERSION}</Badge>
        </div>
        <p className="text-muted-foreground text-lg">
          Komplett API-dokumentasjon for leverandører. Tilgang koster 99 kr/mnd.
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4" data-testid="tabs-api-docs">
          <TabsTrigger value="overview" data-testid="tab-overview">Oversikt</TabsTrigger>
          <TabsTrigger value="auth" data-testid="tab-auth">Autentisering</TabsTrigger>
          <TabsTrigger value="endpoints" data-testid="tab-endpoints">Endepunkter</TabsTrigger>
          <TabsTrigger value="errors" data-testid="tab-errors">Feilkoder</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Kom i gang
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>Smart Timing API gir programmatisk tilgang til timeregistreringer, brukere, prosjekter og rapporter.</p>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 border rounded-md">
                  <h3 className="font-medium mb-2">Base URL</h3>
                  <code className="text-sm bg-muted px-2 py-1 rounded block">{BASE_URL}</code>
                </div>
                <div className="p-4 border rounded-md">
                  <h3 className="font-medium mb-2">Versjon</h3>
                  <code className="text-sm bg-muted px-2 py-1 rounded block">v{API_VERSION}</code>
                </div>
              </div>

              <div className="p-4 bg-primary/5 rounded-md border border-primary/20">
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Prising
                </h3>
                <p className="text-sm text-muted-foreground">
                  API-tilgang koster <strong>99 kr/mnd</strong> per leverandor. Inkluderer opptil 60 foresporsler per minutt.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tilgjengelige ressurser</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3 p-3 border rounded-md">
                  <Clock className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">Timeregistreringer</h4>
                    <p className="text-sm text-muted-foreground">Hent og filtrer timeregistreringer</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-md">
                  <Users className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">Brukere</h4>
                    <p className="text-sm text-muted-foreground">Administrer og hent brukerdata</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-md">
                  <FileText className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">Rapporter</h4>
                    <p className="text-sm text-muted-foreground">Tilgang til saksrapporter</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-md">
                  <Settings className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">Prosjekter</h4>
                    <p className="text-sm text-muted-foreground">Hent prosjektinformasjon</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API-nokkel autentisering
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>Alle API-foresporsler ma autentiseres med en API-nokkel. Nokkelen sendes i Authorization-headeren.</p>
              
              <div>
                <h4 className="font-medium mb-2">Eksempel:</h4>
                <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`curl -X GET "${BASE_URL}/time-entries" \\
  -H "Authorization: Bearer st_ditt_api_nokkel_her" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>

              <div className="p-4 bg-warning/10 rounded-md border border-warning/20">
                <h4 className="font-medium mb-1">Viktig</h4>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Hold API-nokkelen hemmelig - del den aldri i offentlig kode</li>
                  <li>Nokkelen begynner med <code className="bg-muted px-1 rounded">st_</code></li>
                  <li>Du kan generere nye nokler i administrasjonspanelet</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tillatelser</CardTitle>
              <CardDescription>API-nokler kan ha folgende tillatelser</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { name: "read:time_entries", desc: "Les timeregistreringer" },
                  { name: "read:users", desc: "Les brukerdata" },
                  { name: "read:reports", desc: "Les saksrapporter" },
                  { name: "read:projects", desc: "Les prosjekter" },
                  { name: "*", desc: "Full tilgang til alle ressurser" },
                ].map((perm) => (
                  <div key={perm.name} className="flex items-center gap-3 p-2 border rounded">
                    <code className="bg-muted px-2 py-1 rounded text-sm">{perm.name}</code>
                    <span className="text-muted-foreground text-sm">{perm.desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate Limiting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>For a sikre stabil ytelse er API-foresporsler begrenset til 60 per minutt per API-nokkel.</p>
              
              <div>
                <h4 className="font-medium mb-2">Response headers:</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex gap-2">
                    <code className="bg-muted px-1 rounded">X-RateLimit-Limit</code>
                    <span className="text-muted-foreground">- Maks antall foresporsler per minutt</span>
                  </div>
                  <div className="flex gap-2">
                    <code className="bg-muted px-1 rounded">X-RateLimit-Remaining</code>
                    <span className="text-muted-foreground">- Gjenstående foresporsler</span>
                  </div>
                  <div className="flex gap-2">
                    <code className="bg-muted px-1 rounded">X-RateLimit-Reset</code>
                    <span className="text-muted-foreground">- Unix timestamp for nullstilling</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="endpoints">
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Timeregistreringer
                </h3>
                <Endpoint
                  method="GET"
                  path="/time-entries"
                  description="Hent alle timeregistreringer med paginering"
                  permission="read:time_entries"
                  parameters={[
                    { name: "page", type: "number", description: "Sidenummer (standard: 1)" },
                    { name: "limit", type: "number", description: "Antall per side (maks 100, standard: 50)" },
                    { name: "from", type: "string", description: "Startdato (YYYY-MM-DD)" },
                    { name: "to", type: "string", description: "Sluttdato (YYYY-MM-DD)" },
                  ]}
                  response={`{
  "data": [
    {
      "id": "uuid-her",
      "date": "2024-01-15",
      "startTime": "08:00",
      "endTime": "16:00",
      "activity": "Arbeid",
      "userId": "bruker-id"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}`}
                />
                <Endpoint
                  method="GET"
                  path="/time-entries/:id"
                  description="Hent en spesifikk timeregistrering"
                  permission="read:time_entries"
                  response={`{
  "data": {
    "id": "uuid-her",
    "date": "2024-01-15",
    "startTime": "08:00",
    "endTime": "16:00",
    "breakHours": "0.5",
    "activity": "Arbeid",
    "notes": "Notat her"
  }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Brukere
                </h3>
                <Endpoint
                  method="GET"
                  path="/users"
                  description="Hent alle brukere med paginering"
                  permission="read:users"
                  parameters={[
                    { name: "page", type: "number", description: "Sidenummer" },
                    { name: "limit", type: "number", description: "Antall per side" },
                  ]}
                  response={`{
  "data": [
    {
      "id": 1,
      "companyId": 1,
      "userEmail": "bruker@eksempel.no",
      "role": "member",
      "approved": true
    }
  ],
  "pagination": { ... }
}`}
                />
                <Endpoint
                  method="GET"
                  path="/users/:id"
                  description="Hent en spesifikk bruker"
                  permission="read:users"
                  response={`{
  "data": {
    "id": 1,
    "companyId": 1,
    "userEmail": "bruker@eksempel.no",
    "role": "member"
  }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Rapporter
                </h3>
                <Endpoint
                  method="GET"
                  path="/reports"
                  description="Hent alle saksrapporter"
                  permission="read:reports"
                  response={`{
  "data": [
    {
      "id": 1,
      "userId": "bruker-id",
      "caseId": "sak-123",
      "month": "2024-01",
      "status": "approved"
    }
  ],
  "pagination": { ... }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Prosjekter
                </h3>
                <Endpoint
                  method="GET"
                  path="/projects"
                  description="Hent alle prosjekter"
                  permission="read:projects"
                  response={`{
  "data": [
    {
      "id": 1,
      "konsulent": "Navn",
      "bedrift": "Bedriftsnavn",
      "tiltak": "Tiltak her",
      "isActive": true
    }
  ],
  "pagination": { ... }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Bruk og status
                </h3>
                <Endpoint
                  method="GET"
                  path="/usage"
                  description="Hent API-bruksstatistikk og abonnementsinformasjon"
                  permission="(autentisert)"
                  response={`{
  "data": {
    "subscription": {
      "enabled": true,
      "startDate": "2024-01-01",
      "endDate": "2025-01-01",
      "monthlyPrice": "99.00"
    },
    "usage": {
      "requestsLast30Days": 1250
    },
    "apiKeys": [
      {
        "id": 1,
        "name": "Produksjon",
        "keyPrefix": "st_abc123...",
        "isActive": true
      }
    ]
  }
}`}
                />
                <Endpoint
                  method="GET"
                  path="/health"
                  description="Sjekk API-status (krever ikke autentisering)"
                  permission="(ingen)"
                  response={`{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00.000Z"
}`}
                />
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="errors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feilkoder</CardTitle>
              <CardDescription>
                Alle feilresponser folger samme format med error, message og code
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { code: 400, name: "Bad Request", desc: "Ugyldig forespørsel eller parametere" },
                  { code: 401, name: "Unauthorized", desc: "Manglende eller ugyldig API-nokkel" },
                  { code: 403, name: "Forbidden", desc: "Manglende tillatelser eller utloopt abonnement" },
                  { code: 404, name: "Not Found", desc: "Ressursen ble ikke funnet" },
                  { code: 429, name: "Too Many Requests", desc: "Rate limit overskredet" },
                  { code: 500, name: "Internal Server Error", desc: "Serverfeil - kontakt support" },
                ].map((err) => (
                  <div key={err.code} className="flex items-start gap-4 p-3 border rounded-md">
                    <Badge variant={err.code >= 500 ? "destructive" : err.code >= 400 ? "secondary" : "default"}>
                      {err.code}
                    </Badge>
                    <div>
                      <p className="font-medium">{err.name}</p>
                      <p className="text-sm text-muted-foreground">{err.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Eksempel feilrespons</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`{
  "error": "Unauthorized",
  "message": "Invalid API key",
  "code": "INVALID_API_KEY"
}`}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vanlige feilkoder</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {[
                  { code: "MISSING_API_KEY", desc: "Authorization header mangler" },
                  { code: "INVALID_API_KEY", desc: "API-nokkelen er ugyldig" },
                  { code: "EXPIRED_API_KEY", desc: "API-nokkelen har utlopt" },
                  { code: "API_ACCESS_DISABLED", desc: "API-tilgang er ikke aktivert" },
                  { code: "SUBSCRIPTION_EXPIRED", desc: "Abonnementet har utlopt" },
                  { code: "RATE_LIMIT_EXCEEDED", desc: "For mange foresporsler" },
                  { code: "INSUFFICIENT_PERMISSIONS", desc: "Mangler nodvendig tillatelse" },
                ].map((err) => (
                  <div key={err.code} className="flex gap-2">
                    <code className="bg-muted px-1 rounded">{err.code}</code>
                    <span className="text-muted-foreground">- {err.desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
