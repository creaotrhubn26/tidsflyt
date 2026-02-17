-- Tidum Design Tokens Table
DROP VIEW IF EXISTS design_tokens CASCADE;
ALTER TABLE IF EXISTS design_tokens RENAME TO design_tokens_old;

CREATE TABLE IF NOT EXISTS cms_tidum_tokens (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Tidum',
  primary_color TEXT DEFAULT '#0ea5e9',
  primary_color_light TEXT DEFAULT '#38bdf8',
  primary_color_dark TEXT DEFAULT '#0284c7',
  secondary_color TEXT DEFAULT '#64748b',
  accent_color TEXT DEFAULT '#8b5cf6',
  background_color TEXT DEFAULT '#ffffff',
  background_color_dark TEXT DEFAULT '#0f172a',
  surface_color TEXT DEFAULT '#f8fafc',
  surface_color_dark TEXT DEFAULT '#1e293b',
  text_color TEXT DEFAULT '#0f172a',
  text_color_dark TEXT DEFAULT '#f8fafc',
  muted_color TEXT DEFAULT '#64748b',
  border_color TEXT DEFAULT '#e2e8f0',
  font_family TEXT DEFAULT 'Inter',
  font_family_heading TEXT DEFAULT 'Inter',
  font_size_base TEXT DEFAULT '16px',
  font_size_scale TEXT DEFAULT '1.25',
  line_height_base TEXT DEFAULT '1.6',
  line_height_heading TEXT DEFAULT '1.2',
  font_weight_normal TEXT DEFAULT '400',
  font_weight_medium TEXT DEFAULT '500',
  font_weight_bold TEXT DEFAULT '700',
  letter_spacing TEXT DEFAULT '0',
  letter_spacing_heading TEXT DEFAULT '-0.02em',
  spacing_unit TEXT DEFAULT '4px',
  spacing_xs TEXT DEFAULT '8px',
  spacing_sm TEXT DEFAULT '12px',
  spacing_md TEXT DEFAULT '16px',
  spacing_lg TEXT DEFAULT '24px',
  spacing_xl TEXT DEFAULT '32px',
  spacing_2xl TEXT DEFAULT '48px',
  spacing_3xl TEXT DEFAULT '64px',
  border_radius_none TEXT DEFAULT '0',
  border_radius_sm TEXT DEFAULT '6px',
  border_radius_md TEXT DEFAULT '8px',
  border_radius_lg TEXT DEFAULT '12px',
  border_radius_xl TEXT DEFAULT '16px',
  border_radius_full TEXT DEFAULT '9999px',
  border_width TEXT DEFAULT '1px',
  shadow_none TEXT DEFAULT 'none',
  shadow_sm TEXT DEFAULT '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  shadow_md TEXT DEFAULT '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  shadow_lg TEXT DEFAULT '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  shadow_xl TEXT DEFAULT '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  animation_duration TEXT DEFAULT '200ms',
  animation_duration_slow TEXT DEFAULT '300ms',
  animation_duration_fast TEXT DEFAULT '150ms',
  animation_easing TEXT DEFAULT 'cubic-bezier(0.4, 0, 0.2, 1)',
  enable_animations BOOLEAN DEFAULT TRUE,
  enable_hover_effects BOOLEAN DEFAULT TRUE,
  container_max_width TEXT DEFAULT '1280px',
  container_padding TEXT DEFAULT '24px',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create compatible view
CREATE OR REPLACE VIEW design_tokens AS SELECT * FROM cms_tidum_tokens;

-- Insert Tidum Professional default
INSERT INTO cms_tidum_tokens (name) 
SELECT 'Tidum Professional'
WHERE NOT EXISTS (SELECT 1 FROM cms_tidum_tokens LIMIT 1);
