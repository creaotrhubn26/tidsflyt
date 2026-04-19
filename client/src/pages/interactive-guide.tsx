import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Folder,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  Mail,
  Palette,
  PlayCircle,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Timer,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSEO } from "@/hooks/use-seo";
import { usePublicLightTheme } from "@/hooks/use-public-light-theme";
import { useGuideConfig } from "@/hooks/use-guide-config";
import { useBrandInfo } from "@/hooks/use-brand-info";
import type { GuideArticle, GuideCategory, GuideFAQItem, GuideRole } from "@shared/guide-config";
import tidumWordmark from "@assets/tidum-wordmark.png";

/* Resolve string icon names from config to Lucide components. */
const ICON_MAP: Record<string, LucideIcon> = {
  ArrowRight, Building2, CheckCircle2, ChevronRight, ClipboardCheck, ClipboardList,
  Clock, FileText, Folder, HelpCircle, Inbox, LayoutDashboard, Mail, Palette,
  PlayCircle, Plus, Search, Send, Settings, Shield, Sparkles, Timer, TrendingUp,
  UserPlus, Users, Zap,
};
const resolveIcon = (name?: string): LucideIcon =>
  (name && ICON_MAP[name]) || HelpCircle;

/* View-model variants where the icon string has been resolved to a component. */
type ViewArticle = Omit<GuideArticle, "icon"> & { icon: LucideIcon };
type ViewCategory = Omit<GuideCategory, "icon" | "articles"> & {
  icon: LucideIcon;
  articles: ViewArticle[];
};

/** Map common video URLs (YouTube/Vimeo) into an embed URL. */
function toEmbedUrl(url: string): { type: "iframe" | "file"; src: string } {
  // YouTube watch / share / embed → embed
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { type: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` };
  // Vimeo
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { type: "iframe", src: `https://player.vimeo.com/video/${vm[1]}` };
  // Already an embed URL
  if (/\/embed\//.test(url) || /player\./.test(url)) return { type: "iframe", src: url };
  // Direct file (mp4, webm, mov)
  return { type: "file", src: url };
}

/* ─────────────────────────────────────────────────────────────────────────
   PAGE
   ───────────────────────────────────────────────────────────────────────── */

export default function InteractiveGuide() {
  usePublicLightTheme();
  const { config, isPreview } = useGuideConfig();
  const brand = useBrandInfo();

  // Resolve icon strings → Lucide components once per config change.
  const viewCategories = useMemo<ViewCategory[]>(
    () => config.categories.map((c) => ({
      ...c,
      icon: resolveIcon(c.icon),
      articles: c.articles.map((a) => ({ ...a, icon: resolveIcon(a.icon) })),
    })),
    [config.categories],
  );

  useSEO({
    title: "Brukerveiledning Tidum – timeføring, rapporter og admin",
    description:
      "Komplett guide til Tidum: dashboard, saker, rapportskriving, godkjenning, timeføring, fravær og leverandøradministrasjon. Søk eller bla gjennom kategoriene.",
    ogTitle: "Brukerveiledning Tidum – kom raskt i gang",
    ogDescription:
      "Guide for miljøarbeidere, tiltaksledere og admin: alle funksjonene i Tidum forklart med trinn for trinn og tips.",
    ogImage: "https://tidum.no/screenshots/landing.png",
    ogImageAlt: "Tidum brukerveiledning – kategorier for dashboard, saker, rapporter, tid og fravær",
    ogType: "website",
    twitterCard: "summary_large_image",
    canonical: "https://tidum.no/guide",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Brukerveiledning Tidum",
        url: "https://tidum.no/guide",
        inLanguage: "nb-NO",
        description:
          "Komplett guide til Tidum: dashboard, saker, rapportskriving, godkjenning, timeføring, fravær og leverandøradministrasjon.",
        isPartOf: { "@type": "WebSite", name: "Tidum", url: "https://tidum.no" },
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Tidum", item: "https://tidum.no/" },
            { "@type": "ListItem", position: 2, name: "Veiledning", item: "https://tidum.no/guide" },
          ],
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: config.faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  });

  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 1;

  // Restore scroll target from hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setActiveCategory(hash);
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const filteredCategories = useMemo<ViewCategory[]>(() => {
    if (!isSearching) return viewCategories;
    return viewCategories.map((c) => ({
      ...c,
      articles: c.articles.filter((a) => {
        const haystack = [
          a.title,
          a.summary,
          ...(a.steps?.map((s) => `${s.label} ${s.detail ?? ""}`) ?? []),
          ...(a.tips ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(trimmedQuery);
      }),
    })).filter((c) => c.articles.length > 0);
  }, [isSearching, trimmedQuery, viewCategories]);

  const totalArticleCount = viewCategories.reduce((n, c) => n + c.articles.length, 0);
  const matchCount = filteredCategories.reduce((n, c) => n + c.articles.length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-900">
      {isPreview && (
        <div className="sticky top-0 z-40 bg-amber-500 text-white text-xs font-semibold py-1.5 px-4 text-center shadow-md">
          Forhåndsvisning fra CMS — endringer er ikke lagret. Lukk fanen eller fjern <code className="font-mono">?preview=cms</code> for å se den publiserte versjonen.
        </div>
      )}

      {/* ── Top nav ── */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/80 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <img src={tidumWordmark} alt="Tidum" className="h-7 w-auto" />
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
              Veiledning
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Til forsiden</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard">
                Åpne Tidum
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero + Search ── */}
      <section className={`max-w-4xl mx-auto px-4 lg:px-8 pt-16 pb-10 ${
        config.layout.heroAlign === "left" ? "text-left" : "text-center"
      }`}>
        {config.layout.showUpdatedBadge && config.hero.updatedLabel && (
          <Badge variant="outline" className="mb-4 text-xs gap-1.5 border-emerald-300 text-emerald-700 bg-emerald-50">
            <Sparkles className="h-3 w-3" />
            {config.hero.updatedLabel} {new Date().toLocaleDateString("nb-NO", { month: "long", year: "numeric" })}
          </Badge>
        )}
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          {config.hero.title}
        </h1>
        <p className={`text-lg text-slate-600 max-w-2xl mb-8 leading-relaxed ${
          config.layout.heroAlign === "left" ? "" : "mx-auto"
        }`}>
          {config.hero.subtitle}
        </p>
        <div className={`relative max-w-xl ${config.layout.heroAlign === "left" ? "" : "mx-auto"}`}>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={config.hero.searchPlaceholder}
            className="h-14 pl-11 pr-4 text-base shadow-sm border-slate-200 bg-white focus-visible:ring-2 focus-visible:ring-emerald-400/40"
            data-testid="guide-search"
          />
          {isSearching && (
            <p className="absolute -bottom-7 left-1 text-xs text-slate-500">
              {matchCount} av {totalArticleCount} treff
            </p>
          )}
        </div>
      </section>

      {/* ── Quick start strip ── */}
      {!isSearching && config.layout.showQuickStart && (
        <section className="max-w-6xl mx-auto px-4 lg:px-8 pb-10">
          <div className="grid gap-3 md:grid-cols-3">
            <QuickCard
              icon={LayoutDashboard}
              label="1. Bli kjent med dashboardet"
              hint="Hvordan navigere oversikten"
              onClick={() => navigate("#oversikt")}
            />
            <QuickCard
              icon={FileText}
              label="2. Skriv din første rapport"
              hint="Steg for steg"
              onClick={() => navigate("#rapportering")}
            />
            <QuickCard
              icon={Clock}
              label="3. Registrer timer"
              hint="Med eller uten timer"
              onClick={() => navigate("#tid")}
            />
          </div>
        </section>
      )}

      {/* ── Category nav (sticky on desktop) ── */}
      {!isSearching && (
        <nav className="max-w-6xl mx-auto px-4 lg:px-8 pb-4">
          <div className="flex flex-wrap gap-2">
            {viewCategories.map((c) => {
              const Icon = c.icon;
              const isActive = activeCategory === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(c.id);
                    document.getElementById(c.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    history.replaceState(null, "", `#${c.id}`);
                  }}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40"
                  }`}
                  data-testid={`guide-category-${c.id}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {c.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Categories + articles ── */}
      <main className="max-w-6xl mx-auto px-4 lg:px-8 pb-16 space-y-16">
        {filteredCategories.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-base">Ingen treff på «{query}».</p>
            <Button variant="ghost" className="mt-3" onClick={() => setQuery("")}>
              Tøm søk
            </Button>
          </div>
        )}

        {filteredCategories.map((category) => (
          <section key={category.id} id={category.id} className="scroll-mt-24">
            <CategoryHeader category={category} />
            <div className="grid gap-5 mt-6 md:grid-cols-2">
              {category.articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  category={category}
                  isHighlighted={isSearching}
                  onOpenInApp={(p) => navigate(p)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* ── Stuck CTA ── */}
      {config.layout.showStuckCTA && (
        <section className="border-t border-slate-200 bg-white">
          <div className="max-w-4xl mx-auto px-4 lg:px-8 py-14 text-center">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md mb-4">
              <HelpCircle className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Sitter du fast?</h2>
            <p className="text-slate-600 mb-6 max-w-xl mx-auto">
              Du kan starte den interaktive omvisningen inne i appen når som helst — den peker på
              riktig knapp på riktig side. Hvis det fortsatt er uklart, send oss en e‑post.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/dashboard?tour=restart">
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Start interaktiv omvisning
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href={`mailto:${brand.supportEmail}`}>
                  <Inbox className="h-4 w-4 mr-2" />
                  Kontakt support
                </a>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      {config.layout.showFAQ && (
      <section className="max-w-4xl mx-auto px-4 lg:px-8 py-14">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Zap className="h-5 w-5 text-emerald-500" />
          Vanlige spørsmål
        </h2>
        <div className="space-y-3">
          {config.faq.map((item: GuideFAQItem, idx: number) => (
            <FAQAccordion key={idx} q={item.q} a={item.a} />
          ))}
        </div>
      </section>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 text-sm text-slate-500 flex flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} Tidum</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-slate-700">Personvern</Link>
            <Link href="/terms" className="hover:text-slate-700">Vilkår</Link>
            <a href={`mailto:${brand.supportEmail}`} className="hover:text-slate-700">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SUBCOMPONENTS
   ───────────────────────────────────────────────────────────────────────── */

function CategoryHeader({ category }: { category: ViewCategory }) {
  const Icon = category.icon;
  return (
    <div className="flex items-start gap-4">
      <div className={`flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br ${category.accent} text-white shadow-md shrink-0`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{category.label}</h2>
        <p className="text-slate-600 mt-1 text-base leading-relaxed">{category.blurb}</p>
      </div>
    </div>
  );
}

function ArticleCard({
  article,
  category,
  isHighlighted,
  onOpenInApp,
}: {
  article: ViewArticle;
  category: ViewCategory;
  isHighlighted: boolean;
  onOpenInApp: (path: string) => void;
}) {
  const Icon = article.icon;
  const [expanded, setExpanded] = useState(isHighlighted);
  return (
    <Card className={`overflow-hidden transition-all ${expanded ? "shadow-md" : "hover:shadow-sm"} bg-white border-slate-200`}>
      {/* Screenshot or illustration */}
      <ArticleVisual article={article} accent={category.accent} icon={Icon} />

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-slate-400" />
            <CardTitle className="text-lg leading-tight">{article.title}</CardTitle>
          </div>
          {article.roles && article.roles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {article.roles.map((r) => (
                <Badge key={r} variant="outline" className="text-[10px] capitalize">
                  {ROLE_LABELS[r] ?? r}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <CardDescription className="leading-relaxed">{article.summary}</CardDescription>
      </CardHeader>

      <CardContent>
        {(article.steps || article.tips) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 mb-3"
          >
            {expanded ? "Skjul detaljer" : "Vis steg for steg"}
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        )}

        {expanded && article.steps && (
          <ol className="space-y-2.5 mb-4">
            {article.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium text-slate-800">{s.label}</p>
                  {s.detail && <p className="text-slate-600 mt-0.5">{s.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {expanded && article.tips && article.tips.length > 0 && (
          <div className="rounded-lg bg-amber-50/60 border border-amber-200/70 p-3 text-sm text-amber-900">
            <p className="font-semibold flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Tips
            </p>
            <ul className="space-y-1 ml-5 list-disc marker:text-amber-500">
              {article.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {article.inAppPath && (
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpenInApp(article.inAppPath!)}>
              Åpne i Tidum
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
            <code className="text-[11px] font-mono text-slate-500">{article.inAppPath}</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ArticleVisual({
  article,
  accent,
  icon,
}: {
  article: ViewArticle;
  accent: string;
  icon: LucideIcon;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const Icon = icon;

  // Priority: video → screenshot → illustration. Each falls back if missing.
  if (article.videoUrl) {
    const embed = toEmbedUrl(article.videoUrl);
    return (
      <div className="relative aspect-[16/9] bg-slate-900 border-b border-slate-200 overflow-hidden">
        {embed.type === "iframe" ? (
          <iframe
            src={embed.src}
            title={article.videoLabel || `Videoguide: ${article.title}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="w-full h-full"
          />
        ) : (
          <video
            src={embed.src}
            controls
            preload="metadata"
            className="w-full h-full object-cover"
          />
        )}
      </div>
    );
  }
  // Accepts either a filename under /guide-screenshots/ or a full URL
  // (http://, https://, or absolute /path) so admin uploads can override.
  if (article.screenshot && !imgFailed) {
    const src = /^(https?:|\/)/.test(article.screenshot)
      ? article.screenshot
      : `/guide-screenshots/${article.screenshot}`;
    return (
      <div className="relative aspect-[16/9] bg-slate-100 border-b border-slate-200 overflow-hidden">
        <img
          src={src}
          alt={`Skjermbilde av ${article.title}`}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className={`aspect-[16/9] bg-gradient-to-br ${accent} relative overflow-hidden border-b border-slate-200`}>
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage:
          "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3), transparent 40%)",
      }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-white/90 flex flex-col items-center gap-3">
          <Icon className="h-12 w-12 drop-shadow" />
          <span className="text-xs uppercase tracking-wider font-semibold opacity-80">
            {article.title}
          </span>
        </div>
      </div>
    </div>
  );
}

function QuickCard({ icon: Icon, label, hint, onClick }: {
  icon: LucideIcon; label: string; hint: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:shadow-md hover:border-emerald-300 hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-tight">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
    </button>
  );
}

function FAQAccordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-xl border bg-white p-5 transition-all ${
        open ? "border-emerald-300 shadow-sm" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 text-left"
      >
        <span className="font-semibold text-slate-800">{q}</span>
        <ChevronRight
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <p className="mt-3 text-sm text-slate-600 leading-relaxed">{a}</p>}
    </div>
  );
}

const ROLE_LABELS: Partial<Record<GuideRole, string>> = {
  miljoarbeider: "Miljøarbeider",
  tiltaksleder: "Tiltaksleder",
  vendor_admin: "Vendor admin",
  super_admin: "Super admin",
};
