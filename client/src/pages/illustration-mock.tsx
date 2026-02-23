import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  BarChart3,
  Check,
  Clock,
  Copy,
  Download,
  Image as ImageIcon,
  Lightbulb,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { tidumPageStyles } from "@/lib/tidum-page-styles";
import { useSEO } from "@/hooks/use-seo";
import { PortalLayout } from "@/components/portal/portal-layout";

type MockScene = {
  id: string;
  title: string;
  description: string;
  image: string;
  prompt: string;
  tags: string[];
  icon: ComponentType<{ className?: string }>;
};

const mockScenes: MockScene[] = [
  {
    id: "time-tracking",
    title: "Mock: Timeføring på mobil",
    description: "Ren komposisjon av mobil visning, ukesummer og raske handlinger.",
    image: "/illustrations/mock-time-tracking.svg",
    prompt:
      "Scandinavian SaaS illustration of mobile time tracking UI. Worker logging hours on smartphone, clean cards and week summary, soft daylight, teal and neutral palette, modern editorial vector style, high clarity, no logos, no text, no watermark.",
    tags: ["mobil", "timeføring", "dashboard"],
    icon: Clock,
  },
  {
    id: "analytics",
    title: "Mock: Rapport og analyse",
    description: "Metrikker, trender og visualiseringer i en rolig og profesjonell scene.",
    image: "/illustrations/mock-analytics.svg",
    prompt:
      "Professional product illustration for analytics dashboard. Manager reviewing charts, KPI cards and trend panel, Scandinavian office mood, muted teal + warm gray palette, modern vector editorial style, no logos, no text, no watermark.",
    tags: ["rapporter", "analyse", "kpi"],
    icon: BarChart3,
  },
  {
    id: "case-collab",
    title: "Mock: Saksrapport samarbeid",
    description: "Saksflyt med dokumentasjon, godkjenning og team-samarbeid.",
    image: "/illustrations/mock-case-collaboration.svg",
    prompt:
      "Editorial software illustration of case management collaboration. Team discussing case cards and approval workflow on screens, Scandinavian office style, calm trustworthy colors, modern vector style, no logos, no text, no watermark.",
    tags: ["saksrapporter", "godkjenning", "team"],
    icon: Users,
  },
];

export default function IllustrationMockPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useSEO({
    title: "Illustrasjons mock - Tidum",
    description:
      "Mock-sider for å lage illustrasjonsbilder til Tidum. Ferdige scener, prompts og nedlastbare SVG-referanser.",
    canonical: "https://tidum.no/illustration-mock",
  });

  const helperTips = useMemo(
    () => [
      "Bruk SVG-mocken som visuell referanse i bildegenerator.",
      "Kopier prompten og juster bare motiv/stil per kampanje.",
      "Hold samme fargepalett for konsistent uttrykk i hele appen.",
    ],
    [],
  );

  const copyPrompt = async (scene: MockScene) => {
    try {
      await navigator.clipboard.writeText(scene.prompt);
      setCopiedId(scene.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <PortalLayout>
      <main className="tidum-page">
        <style>{tidumPageStyles}</style>

        <section className="tidum-panel rounded-[26px] p-5 sm:p-7">
          <div className="grid gap-5 lg:grid-cols-[1.3fr,0.7fr]">
            <div>
              <h1 className="tidum-title text-[clamp(28px,4.5vw,42px)]">Illustrasjonsmock i appen</h1>
              <p className="tidum-text mt-4 max-w-2xl">
                Her lager du mock-visuals direkte i Tidum. Velg scene, kopier prompt og bruk SVG-fila
                som referanse når du genererer nye illustrasjonsbilder.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#ECF4F1] px-3 py-1.5 text-sm text-[var(--color-primary)]">
                <ImageIcon className="h-4 w-4" />
                Klar for illustrasjonsproduksjon
              </div>
            </div>

            <Card className="border-[var(--color-border)] bg-white/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[#1D2C31]">
                  <Lightbulb className="h-5 w-5 text-[var(--color-primary)]" />
                  Praktiske tips
                </CardTitle>
                <CardDescription>Hold samme uttrykk i alle illustrasjoner</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {helperTips.map((tip) => (
                  <div
                    key={tip}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-section)] px-3 py-2 text-sm"
                  >
                    {tip}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-3">
          {mockScenes.map((scene) => {
            const Icon = scene.icon;
            const copied = copiedId === scene.id;
            return (
              <Card key={scene.id} className="border-[var(--color-border)] bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg text-[#1D2C31]">
                    <Icon className="h-5 w-5 text-[var(--color-primary)]" />
                    {scene.title}
                  </CardTitle>
                  <CardDescription>{scene.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#F7FBF9]">
                    <img src={scene.image} alt={scene.title} className="w-full h-auto object-cover" />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {scene.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="bg-[#F7FBF9]">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[#F7FBF9] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
                      Prompt
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">{scene.prompt}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => copyPrompt(scene)}
                    >
                      {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                      {copied ? "Kopiert" : "Kopier prompt"}
                    </Button>
                    <a href={scene.image} download className="w-full">
                      <Button className="w-full rounded-xl tidum-btn-primary">
                        <Download className="h-4 w-4 mr-2" />
                        Last ned SVG
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </main>
    </PortalLayout>
  );
}
