import { pool } from "../db";
import {
  DEFAULT_BLOG_CATEGORIES,
  DEFAULT_BLOG_POSTS,
  type DefaultBlogPostSeed,
} from "@shared/default-blog-content";

function calculateReadingStats(content: string): { readingTime: number; wordCount: number } {
  const text = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  return { readingTime, wordCount };
}

async function ensureCategoryMap() {
  const categoryMap = new Map<string, number>();

  for (const category of DEFAULT_BLOG_CATEGORIES) {
    const result = await pool.query(
      `INSERT INTO cms_categories (name, slug, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description,
           updated_at = NOW()
       RETURNING id, slug`,
      [category.name, category.slug, category.description],
    );

    categoryMap.set(result.rows[0].slug, result.rows[0].id);
  }

  return categoryMap;
}

async function upsertPost(post: DefaultBlogPostSeed, categoryId: number) {
  const { readingTime, wordCount } = calculateReadingStats(post.content);

  await pool.query(
    `INSERT INTO cms_posts (
       title, slug, excerpt, content, featured_image, author, category_id, tags, status,
       meta_title, meta_description, og_image, reading_time, word_count, published_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, NOW()
     )
     ON CONFLICT (slug) DO UPDATE
     SET title = EXCLUDED.title,
         excerpt = EXCLUDED.excerpt,
         content = EXCLUDED.content,
         featured_image = EXCLUDED.featured_image,
         author = EXCLUDED.author,
         category_id = EXCLUDED.category_id,
         tags = EXCLUDED.tags,
         status = EXCLUDED.status,
         meta_title = EXCLUDED.meta_title,
         meta_description = EXCLUDED.meta_description,
         og_image = EXCLUDED.og_image,
         reading_time = EXCLUDED.reading_time,
         word_count = EXCLUDED.word_count,
         published_at = EXCLUDED.published_at,
         updated_at = NOW()`,
    [
      post.title,
      post.slug,
      post.excerpt,
      post.content,
      post.featuredImage,
      post.author,
      categoryId,
      post.tags,
      post.status,
      post.metaTitle,
      post.metaDescription,
      post.ogImage,
      readingTime,
      wordCount,
      new Date(post.publishedAt),
    ],
  );
}

export async function ensureDefaultBlogSeed() {
  try {
    const categoryMap = await ensureCategoryMap();

    for (const post of DEFAULT_BLOG_POSTS) {
      const categoryId = categoryMap.get(post.categorySlug);
      if (!categoryId) {
        throw new Error(`Missing blog category for slug "${post.categorySlug}"`);
      }
      await upsertPost(post, categoryId);
    }

    console.log(`[blog-seed] Ensured ${DEFAULT_BLOG_CATEGORIES.length} categories and ${DEFAULT_BLOG_POSTS.length} posts`);
  } catch (error: any) {
    const message = String(error?.message || error);

    if (message.includes("cms_posts") || message.includes("cms_categories") || message.includes("does not exist")) {
      console.warn("[blog-seed] Skipping default blog seed because CMS tables are not available yet");
      return;
    }

    console.error("[blog-seed] Failed to seed default blog content", error);
  }
}
