import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useSEO } from "@/hooks/use-seo";
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
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [page, setPage] = useState(1);

  useSEO({
    title: "Blogg – Tidum",
    description: "Les artikler om timeføring, prosjektstyring, lønnsomhet og effektivisering for norske bedrifter. Tips, guider og bransjenyheter fra Tidum.",
    ogType: "website",
    canonical: "https://tidum.no/blog",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Tidum Blogg",
      url: "https://tidum.no/blog",
      inLanguage: "nb",
      description: "Artikler om timeføring, prosjektstyring og lønnsomhet for norske bedrifter",
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery);
    setPage(1);
  };

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
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <Newspaper className="h-16 w-16 mb-4 opacity-30" />
            <h2 className="text-xl font-medium mb-2">Ingen innlegg funnet</h2>
            <p className="mb-4">
              {activeSearch
                ? `Ingen resultater for "${activeSearch}"`
                : "Det er ingen publiserte innlegg ennå."}
            </p>
            {(activeSearch || selectedCategory) && (
              <Button variant="outline" onClick={clearFilters}>
                Vis alle innlegg
              </Button>
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
