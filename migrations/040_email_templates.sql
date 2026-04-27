-- Migration 040: E-postmaler i CMS
--
-- Flytter hardkodet brevtekst (subject, intro, body, CTA-tekst) ut
-- av server/lib/email-service.ts og inn i salg_email_templates. Layout
-- (renderTidumEmail wrapper) beholdes i koden — bare innholdet er DB.
--
-- Hver mal har en `slug` som kode bruker for å hente riktig mal.
-- Variabler i tekst-feltene støtter {{placeholders}} samme syntaks
-- som contract-renderer (kunde_navn, leverandor_navn, lead.* osv).

CREATE TABLE IF NOT EXISTS salg_email_templates (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  badge TEXT NOT NULL DEFAULT 'Tidum',
  title TEXT NOT NULL,
  intro TEXT NOT NULL,
  body_md TEXT NOT NULL,
  cta_label TEXT,
  cta_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salg_email_templates_slug
  ON salg_email_templates(slug);

-- Seed default-malene som matcher dagens hardkodede tekster
INSERT INTO salg_email_templates (slug, name, description, subject, badge, title, intro, body_md, cta_label, cta_url, is_active)
VALUES
  (
    'access-request-received',
    'Tilgangsforespørsel mottatt',
    'Sendes til kunden som kvittering når de fyller ut /kontakt-skjemaet.',
    'Vi har mottatt tilgangsforespørselen din',
    'Tidum Access',
    'Tilgangsforespørselen er mottatt',
    'Vi har registrert forespørselen din for {{kunde_company}}.',
E'Hei {{kunde_navn}},\n\nForespørselen din er sendt til vurdering. Når virksomheten er godkjent, sender vi deg neste steg for innlogging og oppsett.\n\n**Hva skjer nå:**\n- Vi går gjennom virksomhetsopplysningene\n- En super admin godkjenner eller følger opp forespørselen\n- Du får e-post så snart tilgangen er klar',
    NULL, NULL, TRUE
  ),
  (
    'lead-assigned',
    'Lead tildelt selger',
    'Sendes internt til assignee-eposten i sales_routing_rules når et nytt lead matcher tier-båndet.',
    '[{{assignee_label}}] Nytt lead: {{kunde_company}} ({{bruker_antall}} brukere)',
    'Tidum Salg — {{assignee_label}}',
    'Nytt lead tildelt deg',
    'Et nytt lead matcher tier-båndet du eier. Mål-responstid: {{response_time_hours}} timer.',
E'**Bedrift:** {{kunde_company}}\n**Org.nr:** {{kunde_org_nr}}\n**Kontaktperson:** {{kunde_navn}}\n**E-post:** {{kunde_email}}\n**Telefon:** {{kunde_phone}}\n**Type virksomhet:** {{kunde_institution}}\n**Brukerantall:** {{bruker_antall}}\n**Tier:** {{tier_label}}\n**Kilde:** {{lead_source}}\n\n{{lead_message_section}}',
    'Åpne lead i admin', '{{app_url}}/admin/leads/{{lead_id}}', TRUE
  ),
  (
    'access-approved',
    'Tilgang godkjent',
    'Sendes til kunden når super-admin godkjenner deres forespørsel.',
    'Velkommen til Tidum – tilgangen din er godkjent!',
    'Tidum Access',
    'Velkommen til Tidum',
    'Tilgangen din er godkjent, og du kan nå komme i gang i Tidum for {{kunde_company}}.',
E'Hei {{kunde_navn}},\n\nTilgangen din er godkjent, og kontoen din er aktivert i Tidum. Du kan nå logge inn og begynne å føre timer, sende inn rapporter og følge arbeidsflyten som gjelder for din rolle.\n\n**Kom i gang:**\n- Logg inn med Google eller sikker e-postlenke\n- Se hvilke oppgaver og flater du har tilgang til\n- Ta kontakt med leder eller admin hvis du trenger mer tilgang',
    'Gå til innlogging', '{{app_url}}/auth', TRUE
  ),
  (
    'access-rejected',
    'Tilgang avslått',
    'Sendes når super-admin avviser en tilgangsforespørsel.',
    'Oppdatering om din tilgangsforespørsel – Tidum',
    'Tidum Access',
    'Tilgangsforespørselen ble ikke godkjent',
    'Vi kunne ikke aktivere kontoen din i denne omgang.',
E'Hei {{kunde_navn}},\n\nVi har gått gjennom forespørselen din, men kan ikke aktivere tilgang til Tidum akkurat nå. Du kan gjerne svare på denne e-posten dersom du ønsker å sende inn mer informasjon.\n\n{{rejection_reason_section}}',
    NULL, NULL, TRUE
  )
ON CONFLICT (slug) DO NOTHING;
