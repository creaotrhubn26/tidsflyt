-- Blog System: Add new columns to cms_posts + create blog_comments table
-- Run against Neon DB

-- Add SEO and scheduling columns to cms_posts
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS meta_title TEXT;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS og_image TEXT;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS reading_time INTEGER;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS word_count INTEGER;
ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;

-- Blog Comments table
CREATE TABLE IF NOT EXISTS blog_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES cms_posts(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES blog_comments(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT,
  author_url TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, spam, trash
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_post_id ON blog_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_status ON blog_comments(status);
CREATE INDEX IF NOT EXISTS idx_blog_comments_parent_id ON blog_comments(parent_id);

-- Full-text search index for blog posts
CREATE INDEX IF NOT EXISTS idx_cms_posts_search ON cms_posts USING gin(to_tsvector('norwegian', coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(content, '')));
CREATE INDEX IF NOT EXISTS idx_cms_posts_slug ON cms_posts(slug);
CREATE INDEX IF NOT EXISTS idx_cms_posts_status ON cms_posts(status);
CREATE INDEX IF NOT EXISTS idx_cms_posts_scheduled_at ON cms_posts(scheduled_at);
