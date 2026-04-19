import { useEffect, useState, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Clock,
  FileText,
  Users,
  ArrowRight,
  X,
  Command,
  LayoutDashboard,
  ClipboardCheck,
  ClipboardList,
  Building2,
  CheckCircle,
  TrendingUp,
  AlertTriangle,
  Send,
  Mail,
  Palette,
  Settings,
  HelpCircle,
  UserPlus,
  FolderKanban,
  Sparkles,
} from "lucide-react";
import { normalizeRole } from "@shared/roles";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRolePreview } from "@/hooks/use-role-preview";

interface SearchResult {
  id: string;
  type: "page" | "guide";
  title: string;
  description?: string;
  icon: any;
  href: string;
  /** Extra search keywords (in addition to title + description). */
  keywords?: string[];
  /** Roles that should see this entry. Empty = visible to everyone. */
  roles?: string[];
}

/** All navigable pages in the portal. Real, no fake data. */
const PORTAL_PAGES: SearchResult[] = [
  { id: "dashboard",     type: "page", title: "Dashboard",            href: "/dashboard",                 icon: LayoutDashboard, description: "Oversikt over dagen din", keywords: ["hjem", "start"] },
  { id: "tiltaksleder",  type: "page", title: "Lederoversikt",        href: "/tiltaksleder",              icon: ClipboardCheck,  description: "Godkjenninger og team", keywords: ["leder", "oversikt", "team"], roles: ["tiltaksleder", "teamleder", "vendor_admin"] },
  { id: "saker",         type: "page", title: "Saker",                href: "/cases",                     icon: FolderKanban,    description: "Klient- og oppdragssaker", keywords: ["sak", "klient", "oppdrag"], roles: ["tiltaksleder", "vendor_admin", "super_admin"] },
  { id: "institusjoner", type: "page", title: "Institusjoner",        href: "/institusjoner",             icon: Building2,       description: "Bedrifter og oppdragsgivere", keywords: ["bedrift", "oppdragsgiver", "brreg"], roles: ["tiltaksleder", "vendor_admin", "hovedadmin", "admin", "super_admin"] },
  { id: "invites",       type: "page", title: "Invitasjoner",         href: "/invites",                   icon: UserPlus,        description: "Inviter team og delbare lenker", keywords: ["invitere", "bruker", "ansatt"], roles: ["tiltaksleder"] },

  { id: "rapporter",     type: "page", title: "Rapporter",            href: "/rapporter",                 icon: FileText,        description: "Skriv og bla i saksrapporter", keywords: ["rapport", "saksrapport", "skriv"] },
  { id: "godkjenning",   type: "page", title: "Godkjenning",          href: "/rapporter/godkjenning",     icon: ClipboardCheck,  description: "Rapporter som venter på godkjenning", keywords: ["godkjenn", "vurdering", "review"], roles: ["tiltaksleder"] },
  { id: "rapport-maler", type: "page", title: "Rapport-maler",        href: "/admin/rapport-maler",       icon: ClipboardList,   description: "Definer rapport-strukturer", keywords: ["mal", "template", "rapportmal"], roles: ["vendor_admin", "hovedadmin", "admin", "super_admin"] },
  { id: "avvik",         type: "page", title: "Avvik",                href: "/avvik",                     icon: AlertTriangle,   description: "Registrer og følg opp hendelser", keywords: ["hendelse", "vold", "uhell"] },

  { id: "timeforing",    type: "page", title: "Timeføring",           href: "/time",                      icon: Clock,           description: "Stempel inn/ut og registrer aktivitet", keywords: ["timer", "time", "stempel", "klokke", "registrer"] },
  { id: "timesheets",    type: "page", title: "Timelister",           href: "/timesheets",                icon: CheckCircle,     description: "Månedlige timelister", keywords: ["timeliste", "månedsoversikt"], roles: ["tiltaksleder", "miljoarbeider"] },
  { id: "overtime",      type: "page", title: "Overtid",              href: "/overtime",                  icon: TrendingUp,      description: "Overtidstimer og beregning", keywords: ["overtid", "merarbeid"] },
  { id: "leave",         type: "page", title: "Fravær",               href: "/leave",                     icon: Clock,           description: "Søk om ferie og sykefravær", keywords: ["ferie", "syk", "permisjon"] },
  { id: "recurring",     type: "page", title: "Faste oppgaver",       href: "/recurring",                 icon: ClipboardList,   description: "Tilbakevendende oppgaver", keywords: ["fast", "rutine", "ukentlig", "månedlig"] },

  { id: "invoices",      type: "page", title: "Fakturaer",            href: "/invoices",                  icon: FileText,        description: "Generer og send fakturaer", keywords: ["faktura", "økonomi"], roles: ["tiltaksleder"] },
  { id: "email",         type: "page", title: "E-post",               href: "/email",                     icon: Mail,            description: "Send e-post fra Tidum", keywords: ["mail", "epost", "send"], roles: ["tiltaksleder"] },
  { id: "forward",       type: "page", title: "Send videre",          href: "/forward",                   icon: Send,            description: "Videresend rapporter til oppdragsgiver", keywords: ["videresend", "share"], roles: ["tiltaksleder"] },

  { id: "vendors",       type: "page", title: "Leverandører",         href: "/vendors",                   icon: Building2,       description: "Administrer leverandører", keywords: ["leverandor", "vendor", "kunde"], roles: ["super_admin"] },
  { id: "cms",           type: "page", title: "CMS",                  href: "/cms",                       icon: Palette,         description: "Rediger landingsside og blogg", keywords: ["innhold", "side", "blogg"], roles: ["super_admin"] },
  { id: "tester",        type: "page", title: "Tester-feedback",      href: "/admin/tester-feedback",     icon: Sparkles,        description: "Tilbakemelding fra prototype-testere", keywords: ["tester", "feedback", "prototype"], roles: ["super_admin"] },

  { id: "settings",      type: "page", title: "Innstillinger",        href: "/settings",                  icon: Settings,        description: "Profil, varsler og preferanser", keywords: ["innstilling", "preferanser", "profil", "tema", "språk"] },

  { id: "guide",         type: "guide", title: "Brukerveiledning",    href: "/guide",                     icon: HelpCircle,      description: "Søkbar guide til alle funksjoner", keywords: ["hjelp", "guide", "veiledning", "manual"] },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();
  const { effectiveRole } = useRolePreview();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedIndex = useRef<number>(0);

  // Real, role-aware page search — no mock entities.
  const results = useMemo((): SearchResult[] => {
    const role = normalizeRole(effectiveRole);
    const allowed = PORTAL_PAGES.filter(
      (p) => !p.roles || p.roles.map(normalizeRole).includes(role),
    );

    if (!query.trim()) {
      // Default: surface the most-used handful for quick keyboard nav.
      const defaultIds = ["dashboard", "rapporter", "timeforing", "guide"];
      if (role === "tiltaksleder") defaultIds.splice(2, 0, "godkjenning");
      return defaultIds
        .map((id) => allowed.find((p) => p.id === id))
        .filter((p): p is SearchResult => !!p);
    }

    const q = query.toLowerCase();
    const matches = allowed
      .map((p) => {
        const haystack = [
          p.title,
          p.description ?? "",
          ...(p.keywords ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return null;
        // Title-prefix matches rank highest, then word-boundary, then substring.
        const titleLower = p.title.toLowerCase();
        let score = 0;
        if (titleLower.startsWith(q)) score = 100;
        else if (titleLower.includes(q)) score = 60;
        else score = 20;
        return { page: p, score };
      })
      .filter((m): m is { page: SearchResult; score: number } => !!m)
      .sort((a, b) => b.score - a.score)
      .map((m) => m.page);

    return matches.slice(0, 8);
  }, [effectiveRole, query]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSelect = (result: SearchResult) => {
    if (result.href) {
      setLocation(result.href);
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <>
      {/* Search Trigger Button */}
      <Button
        variant="outline"
        className="relative w-full md:w-64 justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4 mr-2" />
        <span className="hidden md:inline-flex">Søk... </span>
        <span className="inline-flex md:hidden">Søk</span>
        <kbd className="pointer-events-none ml-auto hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 md:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/* Search Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 shadow-lg">
          <div className="flex flex-col h-[500px]">
            {/* Search Input */}
            <div className="flex items-center border-b px-4 py-3">
              <Command className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
              <Input
                ref={inputRef}
                placeholder="Søk i Tidum..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  selectedIndex.current = 0;
                }}
                className="border-0 shadow-none focus-visible:ring-0 pl-0"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Tøm søk"
                  title="Tøm søk"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12 px-4">
                  <Search className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Ingen resultater funnet</p>
                </div>
              ) : (
                <div className="space-y-1 p-3">
                  {results.map((result, idx) => {
                    const Icon = result.icon;
                    return (
                      <button
                        key={result.id}
                        onClick={() => handleSelect(result)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg group transition-colors flex items-start gap-3",
                          idx === selectedIndex.current
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {result.description}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex gap-2">
                <Badge variant="outline" className="h-6">
                  <Command className="h-3 w-3 mr-1" />
                  Enter
                </Badge>
                <Badge variant="outline" className="h-6">
                  Esc
                </Badge>
              </div>
              <div className="text-xs">
                {results.length} resultater
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
