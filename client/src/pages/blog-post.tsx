import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import DOMPurify from "dompurify";
import { useSEO } from "@/hooks/use-seo";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Tag,
  MessageSquare,
  Share2,
  User,
  Send,
  Loader2,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface BlogPostFull {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  featured_image: string | null;
  author: string | null;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
  tags: string[] | null;
  status: string;
  meta_title: string | null;
  meta_description: string | null;
  og_image: string | null;
  reading_time: number | null;
  word_count: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BlogComment {
  id: number;
  post_id: number;
  parent_id: number | null;
  author_name: string;
  author_url: string | null;
  content: string;
  created_at: string;
}

interface RelatedPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image: string | null;
  reading_time: number | null;
  published_at: string | null;
  category_name: string | null;
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: post, isLoading, error } = useQuery<BlogPostFull>({
    queryKey: ["/api/blog", slug],
    queryFn: async () => {
      const res = await fetch(`/api/blog/${slug}`);
      if (!res.ok) throw new Error("Post not found");
      return res.json();
    },
    enabled: !!slug,
  });

  const { data: comments } = useQuery<BlogComment[]>({
    queryKey: ["/api/blog", slug, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/blog/${slug}/comments`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug,
  });

  const { data: relatedPosts } = useQuery<RelatedPost[]>({
    queryKey: ["/api/blog", slug, "related"],
    queryFn: async () => {
      const res = await fetch(`/api/blog/${slug}/related?limit=3`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug,
  });

  // SEO meta tags
  const seoTitle = post ? (post.meta_title || post.title) + " | Tidum Blogg" : "Tidum Blogg";
  const seoDescription = post?.meta_description || post?.excerpt || "";
  const seoImage = post?.og_image || post?.featured_image || undefined;

  useSEO({
    title: seoTitle,
    description: seoDescription,
    ogTitle: post ? (post.meta_title || post.title) : undefined,
    ogDescription: seoDescription || undefined,
    ogImage: seoImage,
    ogType: "article",
    ogUrl: post ? `https://tidum.no/blog/${post.slug}` : undefined,
    twitterCard: "summary_large_image",
    canonical: post ? `https://tidum.no/blog/${post.slug}` : undefined,
    articlePublished: post?.published_at || undefined,
    articleModified: post?.updated_at || undefined,
    jsonLd: post ? {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      image: post.featured_image,
      url: `https://tidum.no/blog/${post.slug}`,
      inLanguage: "nb",
      author: post.author ? { "@type": "Person", name: post.author } : undefined,
      publisher: {
        "@type": "Organization",
        name: "Tidum",
        url: "https://tidum.no",
        logo: { "@type": "ImageObject", url: "https://tidum.no/favicon-512x512.png" },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": `https://tidum.no/blog/${post.slug}` },
      datePublished: post.published_at,
      dateModified: post.updated_at,
      wordCount: post.word_count,
      keywords: post.tags?.join(", "),
    } : undefined,
  });

  const sanitizedContent = useMemo(() => {
    if (!post?.content) return "";
    return DOMPurify.sanitize(post.content, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "h4",
        "ul", "ol", "li", "blockquote", "a", "img", "pre", "code",
        "table", "thead", "tbody", "tr", "th", "td", "hr", "figure", "figcaption",
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "width", "height", "class"],
    });
  }, [post?.content]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("nb-NO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: post?.title,
        text: post?.excerpt || undefined,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Lenke kopiert til utklippstavlen" });
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="inline-flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Laster innlegg...
        </div>
      </main>
    );
  }

  if (error || !post) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-semibold">Innlegg ikke funnet</h1>
        <p className="text-muted-foreground">Artikkelen du ser etter finnes ikke eller er ikke publisert.</p>
        <Link href="/blog">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Tilbake til bloggen
          </Button>
        </Link>
      </main>
    );
  }

  // Build threaded comments
  const topLevelComments = (comments ?? []).filter((c) => !c.parent_id);
  const replies = (comments ?? []).filter((c) => c.parent_id);
  const getReplies = (parentId: number) => replies.filter((r) => r.parent_id === parentId);

  return (
    <main className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/blog">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Blogg
              </Button>
            </Link>
            {post.category_name && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <Link href={`/blog?category=${post.category_slug || ""}`}>
                  <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    {post.category_name}
                  </span>
                </Link>
              </>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleShare} className="gap-1.5">
            <Share2 className="h-4 w-4" />
            Del
          </Button>
        </div>
      </header>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero image */}
        {post.featured_image && (
          <div className="aspect-video rounded-xl overflow-hidden mb-8 bg-muted">
            <img
              src={post.featured_image}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">{post.title}</h1>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {post.author && (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-4 w-4" />
                {post.author}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(post.published_at || post.created_at)}
            </span>
            {post.reading_time && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {post.reading_time} min lesetid
              </span>
            )}
            {post.word_count && (
              <span className="text-xs opacity-60">{post.word_count.toLocaleString("nb-NO")} ord</span>
            )}
          </div>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {post.tags.map((tag) => (
                <Link key={tag} href={`/blog?tag=${encodeURIComponent(tag)}`}>
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer">
                    <Tag className="h-3 w-3" />
                    {tag}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </header>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-lg text-muted-foreground leading-relaxed mb-8 border-l-4 border-primary/30 pl-4 italic">
            {post.excerpt}
          </p>
        )}

        {/* Content */}
        <div
          className="prose prose-lg dark:prose-invert max-w-none mb-12 
                     prose-headings:font-semibold prose-a:text-primary prose-img:rounded-lg
                     prose-blockquote:border-primary/30"
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />

        {/* Share footer */}
        <div className="flex items-center justify-between border-t border-b py-4 mb-10">
          <div className="text-sm text-muted-foreground">
            {post.author && <>Skrevet av <strong>{post.author}</strong></>}
          </div>
          <Button variant="outline" size="sm" onClick={handleShare} className="gap-2">
            <Share2 className="h-4 w-4" />
            Del artikkelen
          </Button>
        </div>

        {/* Related Posts */}
        {relatedPosts && relatedPosts.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold mb-4">Relaterte artikler</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {relatedPosts.map((rp) => (
                <Link key={rp.id} href={`/blog/${rp.slug}`}>
                  <Card className="overflow-hidden h-full cursor-pointer hover:shadow-md transition-shadow group">
                    {rp.featured_image && (
                      <div className="aspect-video overflow-hidden bg-muted">
                        <img
                          src={rp.featured_image}
                          alt={rp.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <CardContent className="p-4">
                      <h3 className="font-medium line-clamp-2 group-hover:text-primary transition-colors">
                        {rp.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        {rp.reading_time && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {rp.reading_time} min
                          </span>
                        )}
                        {rp.category_name && <span>{rp.category_name}</span>}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Comments Section */}
        <section id="kommentarer">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Kommentarer
            {topLevelComments.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({topLevelComments.length})
              </span>
            )}
          </h2>

          {/* Comment form */}
          <CommentForm slug={slug!} />

          {/* Comments list */}
          {topLevelComments.length > 0 && (
            <div className="mt-8 space-y-4">
              {topLevelComments.map((comment) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  replies={getReplies(comment.id)}
                  slug={slug!}
                />
              ))}
            </div>
          )}
          {topLevelComments.length === 0 && (
            <p className="text-sm text-muted-foreground mt-4">
              Ingen kommentarer ennå. Bli den første til å kommentere!
            </p>
          )}
        </section>
      </article>
    </main>
  );
}

// ── Comment Form ──

function CommentForm({ slug, parentId, onSubmitted }: { slug: string; parentId?: number; onSubmitted?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/blog/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_name: name,
          author_email: email || undefined,
          content,
          parent_id: parentId || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit comment");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Kommentar sendt", description: "Kommentaren din vil vises etter moderering." });
      setName("");
      setEmail("");
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["/api/blog", slug, "comments"] });
      onSubmitted?.();
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke sende kommentaren.", variant: "destructive" });
    },
  });

  return (
    <form
      className="space-y-3 p-4 rounded-lg border bg-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (name && content) submitMutation.mutate();
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="comment-name">Navn *</Label>
          <Input
            id="comment-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ditt navn"
            required
          />
        </div>
        <div>
          <Label htmlFor="comment-email">E-post (vises ikke)</Label>
          <Input
            id="comment-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="din@epost.no"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="comment-content">Kommentar *</Label>
        <Textarea
          id="comment-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Skriv en kommentar..."
          rows={3}
          required
        />
      </div>
      <Button type="submit" disabled={!name || !content || submitMutation.isPending} size="sm" className="gap-2">
        {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send kommentar
      </Button>
    </form>
  );
}

// ── Comment Thread ──

function CommentThread({
  comment,
  replies,
  slug,
}: {
  comment: BlogComment;
  replies: BlogComment[];
  slug: string;
}) {
  const [showReply, setShowReply] = useState(false);

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-lg border bg-card/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
            {comment.author_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="font-medium text-sm">
              {comment.author_url ? (
                <a
                  href={comment.author_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="hover:text-primary transition-colors"
                >
                  {comment.author_name}
                  <ExternalLink className="inline h-3 w-3 ml-1" />
                </a>
              ) : (
                comment.author_name
              )}
            </span>
            <p className="text-xs text-muted-foreground">
              {new Date(comment.created_at).toLocaleDateString("nb-NO", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 text-xs gap-1"
          onClick={() => setShowReply(!showReply)}
        >
          <MessageSquare className="h-3 w-3" />
          Svar
        </Button>
      </div>

      {showReply && (
        <div className="ml-8">
          <CommentForm slug={slug} parentId={comment.id} onSubmitted={() => setShowReply(false)} />
        </div>
      )}

      {replies.length > 0 && (
        <div className="ml-8 space-y-3">
          {replies.map((reply) => (
            <div key={reply.id} className="p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                  {reply.author_name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-xs">{reply.author_name}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(reply.created_at).toLocaleDateString("nb-NO", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
