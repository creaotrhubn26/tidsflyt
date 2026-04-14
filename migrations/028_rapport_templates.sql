-- Migration 028: Rapport template system
-- Defines the structure of a saksrapport — which sections to show, what they
-- contain, which are required. System templates are seeded (vendor_id NULL).
-- Vendors can clone and customize.

CREATE TABLE IF NOT EXISTS rapport_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id INTEGER,                      -- NULL = system default, available to everyone
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  suggested_institution_type TEXT,        -- barnevern | nav | kommune | helsevesen | annet | null

  -- Sections: ordered array. Each section is { key, title, type, required, ... }
  -- Types: rich_text | structured_observations | goals_list | activities_log | checklist | summary
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Optional branding/styling overrides per template
  branding JSONB DEFAULT '{}'::jsonb,

  is_system BOOLEAN DEFAULT false,        -- true = shipped by Tidum
  is_active BOOLEAN DEFAULT true,

  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE (vendor_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_rapport_templates_vendor ON rapport_templates(vendor_id);
CREATE INDEX IF NOT EXISTS idx_rapport_templates_system ON rapport_templates(is_system);

-- Per-institution default template (null falls back to general)
ALTER TABLE vendor_institutions
  ADD COLUMN IF NOT EXISTS default_rapport_template_id UUID
  REFERENCES rapport_templates(id) ON DELETE SET NULL;

-- Per-rapport template snapshot (so changes to template don't break old rapporter)
ALTER TABLE rapporter
  ADD COLUMN IF NOT EXISTS rapport_template_id UUID
  REFERENCES rapport_templates(id) ON DELETE SET NULL;
