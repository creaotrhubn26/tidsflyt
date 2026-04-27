import { Link } from "wouter";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, Tag, Settings as SettingsIcon, Route as RouteIcon,
  MessageSquare, FileText, Workflow, ListChecks, Users, BarChart3, Type, CreditCard, Mail,
} from "lucide-react";

interface PipelineSummary {
  stage_slug: string;
  stage_label: string;
  probability_pct: number;
  lead_count: string;
  weighted_arr_kr: string;
  weighted_arr_kr_unweighted: string;
}

const SECTIONS = [
  { href: "/admin/salg/analytics",     icon: BarChart3,     label: "Inntekts-analytics", desc: "ARR/MRR per tier, kilde, segment, selger og over tid" },
  { href: "/admin/leads",              icon: Users,         label: "Leads",            desc: "Innkommende leads med pipeline-håndtering" },
  { href: "/admin/salg/tiers",        icon: Tag,           label: "Pris-tiers",       desc: "Brukerintervall, pris, onboarding, binding" },
  { href: "/admin/salg/innstillinger", icon: SettingsIcon,  label: "Innstillinger",    desc: "Sweet spot, valuta, leverandør-info, SLA" },
  { href: "/admin/salg/inclusions",    icon: ListChecks,    label: "Inkluderte features", desc: "Hva som er inkludert per tier" },
  { href: "/admin/salg/routing",       icon: RouteIcon,     label: "Salgs-routing",    desc: "Hvilken selger får leads i hvilket bånd" },
  { href: "/admin/salg/scripts",       icon: MessageSquare, label: "Salgs-script",     desc: "Discovery, demo, close, innvendinger" },
  { href: "/admin/salg/kontrakter",    icon: FileText,      label: "Kontraktsmaler",   desc: "Markdown-mal med {{placeholders}}" },
  { href: "/admin/salg/pipeline",      icon: Workflow,      label: "Pipeline-stages",  desc: "Stages + sannsynlighet for ARR-prognose" },
  { href: "/admin/salg/sidetekster",   icon: Type,          label: "Sidetekster",      desc: "Tittel, undertittel og CTA-tekst på /priser (CMS)" },
  { href: "/admin/salg/stripe",        icon: CreditCard,    label: "Stripe-integrasjon", desc: "Sync tiers til Stripe Products + checkout-link generator" },
  { href: "/admin/salg/emails",        icon: Mail,          label: "E-postmaler",      desc: "Brevtekst for lead-tildeling, kvitteringer, godkjenning/avslag" },
];

export default function AdminSalg() {
  const { data: summary } = useQuery<PipelineSummary[]>({
    queryKey: ["/api/admin/leads/pipeline-summary"],
  });

  const totalLeads = summary?.reduce((sum, s) => sum + Number(s.lead_count || 0), 0) ?? 0;
  const totalWeightedArr = summary?.reduce((sum, s) => sum + Number(s.weighted_arr_kr || 0), 0) ?? 0;
  const totalUnweightedArr = summary?.reduce((sum, s) => sum + Number(s.weighted_arr_kr_unweighted || 0), 0) ?? 0;

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Salg & Priser</h1>
          <p className="mt-2 text-muted-foreground">
            Administrer hele pricing-stakken og lead-pipelinen. Alt er DB-drevet —
            ingen pris, mal eller routing-regel er hardkodet.
          </p>
        </div>

        {/* Pipeline-snapshot */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Pipeline-snapshot
            </CardTitle>
            <CardDescription>
              Vektet ARR bruker sannsynlighet pr. stage × snapshot-tier × estimert brukerantall × 12 mnd.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Aktive leads</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{totalLeads}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Pipeline (uvektet)</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {new Intl.NumberFormat("no-NO").format(totalUnweightedArr)} kr
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Vektet ARR</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-primary">
                  {new Intl.NumberFormat("no-NO").format(totalWeightedArr)} kr
                </div>
              </div>
            </div>

            {summary && summary.length > 0 && (
              <div className="mt-6 space-y-2">
                {summary.map((s) => (
                  <div key={s.stage_slug} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <span>
                      <strong>{s.stage_label}</strong>
                      <span className="ml-2 text-muted-foreground">({s.probability_pct}%)</span>
                    </span>
                    <span className="tabular-nums">
                      {s.lead_count} leads · {new Intl.NumberFormat("no-NO").format(Number(s.weighted_arr_kr))} kr
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <s.icon className="h-5 w-5 text-primary" />
                    {s.label}
                  </CardTitle>
                  <CardDescription className="text-sm">{s.desc}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
