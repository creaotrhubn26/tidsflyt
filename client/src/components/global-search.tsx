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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: "report" | "user" | "case" | "time_entry" | "page";
  title: string;
  description?: string;
  icon: any;
  href?: string;
  metadata?: any;
  timestamp?: string;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedIndex = useRef<number>(0);

  // Mock search results
  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) {
      return [
        { id: "1", type: "page", title: "Dashboard", href: "/dashboard", icon: FileText, description: "Oversikt og statistikk" },
        { id: "2", type: "page", title: "Timeføring", href: "/time-tracking", icon: Clock, description: "Registrer arbeidstid" },
        { id: "3", type: "page", title: "Rapporter", href: "/reports", icon: FileText, description: "Se og eksporter rapporter" },
        { id: "4", type: "page", title: "Brukere", href: "/users", icon: Users, description: "Administrer teammedlemmer" },
      ];
    }

    const filtered: SearchResult[] = [];
    const q = query.toLowerCase();

    // Mock case reports
    if ("case".includes(q) || "rapport".includes(q)) {
      filtered.push({
        id: "case-1",
        type: "case",
        title: "SAK-2024-001 - Kundesupport",
        href: "/case-reports",
        icon: FileText,
        description: "Venter på godkjenning",
        timestamp: "I dag 14:30",
      });
    }

    // Mock users
    if ("bruker".includes(q) || "ansatt".includes(q)) {
      filtered.push({
        id: "user-1",
        type: "user",
        title: "John Doe",
        href: "/users",
        icon: Users,
        description: "Saksbehandler",
        metadata: { role: "case_manager" },
      });
    }

    // Mock time entries
    if ("time".includes(q) || "timer".includes(q) || "arbeid".includes(q)) {
      filtered.push({
        id: "time-1",
        type: "time_entry",
        title: "Timeføring i dag",
        href: "/time-tracking",
        icon: Clock,
        description: "7.5t registrert",
        timestamp: "I dag",
      });
    }

    // Mock pages
    if ("rapporter".includes(q)) {
      filtered.push({
        id: "page-1",
        type: "page",
        title: "Rapporter",
        href: "/reports",
        icon: FileText,
        description: "Se og eksporter rapporter",
      });
    }

    return filtered.slice(0, 8);
  }, [query]);

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
                            {result.description || (result.timestamp && `${result.timestamp}`)}
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
