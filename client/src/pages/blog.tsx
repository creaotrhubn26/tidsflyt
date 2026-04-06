import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useSEO } from "@/hooks/use-seo";
import { usePublicLightTheme } from "@/hooks/use-public-light-theme";
import {
  Calendar,
  Clock,
  Search,
  Tag,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Rss,
  Newspaper,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface BlogPostSummary {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image: string | null;
  author: string | null;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
  tags: string[] | null;
  reading_time: number | null;
  published_at: string | null;
  created_at: string;
}

interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  post_count: string;
}

interface BlogResponse {
  posts: BlogPostSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function Blog() {
  usePublicLightTheme();

  const initialParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState(initialParams.get("q") ?? "");
  const [activeSearch, setActiveSearch] = useState(initialParams.get("q") ?? "");
  const [selectedCategory, setSelectedCategory] = useState(initialParams.get("category") ?? "");
  const [page, setPage] = useState(1);

  useSEO({
    title: "Blogg – Tidum",
    description: "Les artikler om timeregistrering, turnus, arbeidstid og dokumentasjonskrav for barn, omsorg og miljøarbeid. Guider og råd fra Tidum.",
    ogType: "website",
    canonical: "https://tidum.no/blog",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Tidum Blogg",
      url: "https://tidum.no/blog",
      inLanguage: "nb",
      description: "Artikler om timeregistrering, turnus og dokumentasjonskrav for barn, omsorg og miljøarbeid",
      publisher: {
        "@type": "Organization",
        name: "Tidum",
        url: "https://tidum.no",
        logo: { "@type": "ImageObject", url: "https://tidum.no/favicon-512x512.png" },
      },
    },
  });

  const { data: blogData, isLoading } = useQuery<BlogResponse>({
    queryKey: ["/api/blog", page, selectedCategory, activeSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "12");
      if (selectedCategory) params.set("category", selectedCategory);
      if (activeSearch) params.set("q", activeSearch);
      const res = await fetch(`/api/blog?${params}`);
      if (!res.ok) throw new Error("Failed to load posts");
      return res.json();
    },
  });

  const { data: categories } = useQuery<BlogCategory[]>({
    queryKey: ["/api/cms/categories"],
    queryFn: async () => {
      const res = await fetch("/api/cms/categories");
      return res.json();
    },
  });

  const posts = blogData?.posts ?? [];
  const pagination = blogData?.pagination;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams();
    if (selectedCategory) params.set("category", selectedCategory);
    if (activeSearch) params.set("q", activeSearch);
    if (page > 1) params.set("page", String(page));
    const nextUrl = params.toString() ? `/blog?${params}` : "/blog";
    window.history.replaceState({}, "", nextUrl);
  }, [selectedCategory, activeSearch, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery);
    setPage(1);
  };

  const scenarioCards = [
    {
      title: "Mistet oversikten?",
      description: "Start med problemartiklene om Excel, stress og typiske feil i timelistene.",
      icon: Search,
      category: "problem-og-oversikt",
    },
    {
      title: "Jobber du i turnus eller felt?",
      description: "Les yrkesguidene for miljøarbeid, BPA, helse og skiftarbeid.",
      icon: Users,
      category: "yrkesguider",
    },
    {
      title: "Må du følge regler og krav?",
      description: "Gå rett til artiklene om arbeidsmiljøloven, timelister og dokumentasjon.",
      icon: ShieldCheck,
      category: "regelverk-og-krav",
    },
  ];

  const clearFilters = () => {
    setSearchQuery("");
    setActiveSearch("");
    setSelectedCategory("");
    setPage(1);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("nb-NO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Hjem</span>
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Newspaper className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Blogg</h1>
            </div>
          </div>
          <a
            href="/feed.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            title="RSS Feed"
          >
            <Rss className="h-4 w-4" />
            <span className="hidden sm:inline">RSS</span>
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <section className="mb-8 overflow-hidden rounded-[28px] border border-[#d8e5df] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,247,244,0.92))] p-6 shadow-[0_14px_44px_rgba(22,43,49,0.06)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr] lg:items-end">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#d7e7df] bg-white/90 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-[#31545c]">
                <Newspaper className="h-3.5 w-3.5" />
                Problemartikler, yrkesguider og regelverk
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-[#15343D] sm:text-4xl">
                Bloggen til Tidum er bygget rundt reelle arbeidshverdager
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#486066] sm:text-lg">
                Finn innhold etter det som faktisk skaper friksjon: manglende oversikt, turnus og feltarbeid,
                eller krav til arbeidstid og dokumentasjon. Målet er at artiklene skal hjelpe deg fra problem
                til løsning, ikke bare fylle siden med generelle råd.
              </p>
            </div>
            <div className="grid gap-3">
              {scenarioCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.category}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(card.category);
                      setSearchQuery("");
                      setActiveSearch("");
                      setPage(1);
                    }}
                    className="rounded-2xl border border-[#d7e5df] bg-white/92 p-4 text-left shadow-[0_10px_30px_rgba(22,43,49,0.05)] transition-transform hover:-translate-y-0.5 hover:border-[#bfd6cb]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-xl bg-[#E7F3EE] p-2.5 text-[#2E7A66]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[#16373F]">{card.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-[#50666B]">{card.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Search & Filters */}
        <div className="mb-8 space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2 max-w-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Søk i artikler..."
                className="pl-10"
                aria-label="Søk i blogginnlegg"
              />
            </div>
            <Button type="submit" variant="secondary">
              Søk
            </Button>
          </form>

          {/* Category filters */}
          {categories && categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === "" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectedCategory("");
                  setPage(1);
                }}
              >
                Alle
              </Button>
              {categories
                .filter((c) => parseInt(c.post_count) > 0)
                .map((cat) => (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.slug ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedCategory(cat.slug);
                      setPage(1);
                    }}
                  >
                    {cat.name}
                    <span className="ml-1.5 text-xs opacity-70">({cat.post_count})</span>
                  </Button>
                ))}
            </div>
          )}

          {(activeSearch || selectedCategory) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {pagination?.total ?? 0} resultat{(pagination?.total ?? 0) !== 1 ? "er" : ""}
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Nullstill filter
              </Button>
            </div>
          )}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden animate-pulse">
                <div className="h-48 bg-muted" />
                <CardContent className="p-5 space-y-3">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            {(activeSearch || selectedCategory) ? (
              <>
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-muted/60 border border-border mb-4">
                  <Newspaper className="h-6 w-6 text-muted-foreground" />
                </div>
                <h2 className="text-base font-semibold mb-1">Ingen innlegg funnet</h2>
                <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
                  {activeSearch ? `Ingen resultater for "${activeSearch}"` : "Ingen innlegg i denne kategorien."}
                </p>
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Vis alle innlegg
                </Button>
              </>
            ) : (
              <>
                <div className="relative mb-8">
                  <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-150" />
                  <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-indigo-500/20 border border-primary/20 shadow-lg">
                    <Newspaper className="h-9 w-9 text-primary" />
                  </div>
                </div>
                <h2 className="text-2xl font-semibold mb-3">Ingen innlegg ennå</h2>
                <p className="text-muted-foreground text-center max-w-sm mb-6 leading-relaxed">
                  Det er ingen publiserte innlegg ennå. Sjekk tilbake snart.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-700 dark:text-blue-400">
                    <Rss className="h-3.5 w-3.5" />
                    Nyheter & oppdateringer
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs font-medium text-purple-700 dark:text-purple-400">
                    <Tag className="h-3.5 w-3.5" />
                    Kategorier & emner
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Post grid */}
        {!isLoading && posts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <article key={post.id}>
                <Card
                  className="overflow-hidden h-full flex flex-col cursor-pointer hover:shadow-lg transition-shadow group"
                  onClick={() => setLocation(`/blog/${post.slug}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setLocation(`/blog/${post.slug}`);
                    }
                  }}
                >
                  {post.featured_image && (
                    <div className="aspect-video overflow-hidden bg-muted">
                      <img
                        src={post.featured_image}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <CardContent className="p-5 flex flex-col flex-1">
                    {/* Meta line */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                      {post.category_name && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          <Tag className="h-3 w-3" />
                          {post.category_name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(post.published_at || post.created_at)}
                      </span>
                      {post.reading_time && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {post.reading_time} min
                        </span>
                      )}
                    </div>

                    <h2 className="text-lg font-semibold mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
                        {post.excerpt}
                      </p>
                    )}

                    {/* Tags */}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                          >
                            #{tag}
                          </span>
                        ))}
                        {post.tags.length > 3 && (
                          <span className="text-xs px-2 py-0.5 text-muted-foreground">
                            +{post.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Author */}
                    {post.author && (
                      <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                        Av {post.author}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </article>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <nav
            className="flex items-center justify-center gap-2 mt-10"
            aria-label="Blogg paginering"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Forrige
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (pagination.totalPages <= 7) return true;
                  if (p === 1 || p === pagination.totalPages) return true;
                  if (Math.abs(p - page) <= 1) return true;
                  return false;
                })
                .map((p, idx, arr) => (
                  <span key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="px-1 text-muted-foreground">…</span>
                    )}
                    <Button
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      className="min-w-[36px]"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  </span>
                ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
            >
              Neste
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </nav>
        )}
      </div>
    </main>
  );
}
