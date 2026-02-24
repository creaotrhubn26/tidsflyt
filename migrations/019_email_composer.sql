-- 019: Email composer – create/extend email tables + seed default templates
-- ============================================================

-- Email templates (reusable message templates)
CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR,
  name VARCHAR(255) NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  subject VARCHAR(255) NOT NULL,
  body TEXT,
  html_content TEXT NOT NULL DEFAULT '',
  text_content TEXT,
  variables JSONB DEFAULT '[]',
  category VARCHAR(100) DEFAULT 'general',
  is_active BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- If table already existed without these columns, add them
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS html_content TEXT;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS text_content TEXT;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS body TEXT;

-- Email send history (every email sent via composer or forward)
CREATE TABLE IF NOT EXISTS email_send_history (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES email_templates(id),
  sent_by TEXT,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  cc_email TEXT,
  bcc_email TEXT,
  subject TEXT NOT NULL,
  body TEXT,
  attachments JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email settings (SMTP config stored in DB – optional override)
CREATE TABLE IF NOT EXISTS email_settings (
  id SERIAL PRIMARY KEY,
  provider TEXT DEFAULT 'smtp',
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_secure BOOLEAN DEFAULT FALSE,
  smtp_user TEXT,
  from_email TEXT,
  from_name TEXT,
  reply_to_email TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default Norwegian templates
INSERT INTO email_templates (name, slug, subject, html_content, text_content, variables, category)
VALUES
  (
    'Månedlig timeliste',
    'monthly-timesheet',
    'Timeliste for {{periode}} – {{avsender}}',
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#1a1a2e">Timeliste</h2><p>Hei {{mottaker}},</p><p>Vedlagt finner du timelisten for <strong>{{periode}}</strong>.</p><p>{{melding}}</p><p style="color:#666;font-size:13px;margin-top:30px">📎 Se vedlagt Excel-fil for detaljert oversikt.</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0"/><p style="color:#999;font-size:11px">Sendt via Tidum – Smart Timing</p></div>',
    'Timeliste for {{periode}} fra {{avsender}}.\n\n{{melding}}\n\nSe vedlagt Excel-fil for detaljer.\n\nSendt via Tidum',
    ARRAY['mottaker','periode','avsender','melding'],
    'timesheet'
  ),
  (
    'Saksrapport',
    'case-report',
    'Saksrapport – {{saksnavn}} – {{periode}}',
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#1a1a2e">Saksrapport</h2><p>Hei {{mottaker}},</p><p>Her er saksrapporten for <strong>{{saksnavn}}</strong> i perioden <strong>{{periode}}</strong>.</p><p>{{melding}}</p><p style="color:#666;font-size:13px;margin-top:30px">📎 Se vedlagt fil for detaljer.</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0"/><p style="color:#999;font-size:11px">Sendt via Tidum – Smart Timing</p></div>',
    'Saksrapport for {{saksnavn}} ({{periode}}) fra {{avsender}}.\n\n{{melding}}\n\nSendt via Tidum',
    ARRAY['mottaker','saksnavn','periode','avsender','melding'],
    'case-report'
  ),
  (
    'Overtidsrapport',
    'overtime-report',
    'Overtidsrapport – {{periode}} – {{avsender}}',
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#1a1a2e">Overtidsrapport</h2><p>Hei {{mottaker}},</p><p>Vedlagt finner du overtidsrapporten for perioden <strong>{{periode}}</strong>.</p><p>{{melding}}</p><p style="color:#666;font-size:13px;margin-top:30px">📎 Se vedlagt Excel-fil.</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0"/><p style="color:#999;font-size:11px">Sendt via Tidum – Smart Timing</p></div>',
    'Overtidsrapport for {{periode}} fra {{avsender}}.\n\n{{melding}}\n\nSendt via Tidum',
    ARRAY['mottaker','periode','avsender','melding'],
    'overtime'
  ),
  (
    'Generell melding',
    'general-message',
    '{{emne}}',
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><p>Hei {{mottaker}},</p><p>{{melding}}</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0"/><p style="color:#999;font-size:11px">Sendt via Tidum – Smart Timing</p></div>',
    'Hei {{mottaker}},\n\n{{melding}}\n\nSendt via Tidum',
    ARRAY['mottaker','emne','melding'],
    'general'
  )
ON CONFLICT (slug) DO NOTHING;
