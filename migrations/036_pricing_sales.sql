-- Migration 036: Tidum SaaS pricing + sales pipeline
--
-- Hele pricing/salgs-stakken er DB-drevet — admin kan endre alt fra
-- /admin/salg uten kode-deploy. Ingen tier-pris, sweet-spot, routing-
-- regel, kontraktsmal eller pipeline-stage er hardkodet i appen.
--
-- Tabeller:
--   pricing_tiers              — pris-tabellen
--   pricing_inclusions         — globale "hva er inkludert"-features
--   pricing_tier_inclusions    — M:M tier↔inclusion
--   salg_settings               — generic key/value-config (sweet spot,
--                                valuta, binding, leverandør-info, SLA)
--   sales_routing_rules        — brukerantall → assignee
--   sales_script_blocks        — discovery / demo / close / objection
--   salg_contract_templates         — Markdown med {{placeholders}}
--   lead_pipeline_stages       — new → contacted → … → won/lost
--
-- Seed-data settes inn med ON CONFLICT DO NOTHING / WHERE NOT EXISTS
-- så admin-endringer ikke overskrives ved redeploy.

CREATE TABLE IF NOT EXISTS pricing_tiers (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  min_users INTEGER NOT NULL,
  max_users INTEGER,
  price_per_user_ore INTEGER NOT NULL,
  onboarding_ore INTEGER NOT NULL DEFAULT 0,
  binding_months INTEGER NOT NULL DEFAULT 12,
  is_enterprise BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pricing_inclusions (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pricing_tier_inclusions (
  tier_id INTEGER NOT NULL REFERENCES pricing_tiers(id) ON DELETE CASCADE,
  inclusion_id INTEGER NOT NULL REFERENCES pricing_inclusions(id) ON DELETE CASCADE,
  PRIMARY KEY (tier_id, inclusion_id)
);

CREATE TABLE IF NOT EXISTS salg_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  data_type TEXT NOT NULL DEFAULT 'string',
  category TEXT NOT NULL DEFAULT 'general',
  label TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_secret BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS sales_routing_rules (
  id SERIAL PRIMARY KEY,
  min_users INTEGER NOT NULL,
  max_users INTEGER,
  assignee_label TEXT NOT NULL,
  assignee_email TEXT,
  response_time_hours INTEGER DEFAULT 24,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_script_blocks (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salg_contract_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  body_md TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_pipeline_stages (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  probability_pct INTEGER NOT NULL DEFAULT 0,
  is_terminal BOOLEAN DEFAULT FALSE,
  is_won BOOLEAN DEFAULT FALSE,
  sort_order INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS user_count_estimate INTEGER,
  ADD COLUMN IF NOT EXISTS tier_snapshot_id INTEGER REFERENCES pricing_tiers(id),
  ADD COLUMN IF NOT EXISTS pipeline_stage_id INTEGER REFERENCES lead_pipeline_stages(id),
  ADD COLUMN IF NOT EXISTS assigned_to_email TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to_label TEXT,
  ADD COLUMN IF NOT EXISTS expected_close_date DATE,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_pricing_tiers_active
  ON pricing_tiers(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_salg_settings_category
  ON salg_settings(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_routing_active
  ON sales_routing_rules(is_active, min_users);
CREATE INDEX IF NOT EXISTS idx_pipeline_active
  ON lead_pipeline_stages(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_access_req_pipeline
  ON access_requests(pipeline_stage_id);
CREATE INDEX IF NOT EXISTS idx_access_req_assignee
  ON access_requests(assigned_to_email);

-- ====================== SEED DATA ======================

INSERT INTO pricing_tiers (slug, label, min_users, max_users, price_per_user_ore, onboarding_ore, binding_months, is_enterprise, sort_order, description)
VALUES
  ('starter',     'Starter (5–10 brukere)',    5,   10,  13900,   500000,  6, FALSE, 1, 'For mindre virksomheter som vil komme i gang.'),
  ('small',       'Small (11–25 brukere)',    11,   25,  11900,  1200000, 12, FALSE, 2, NULL),
  ('mid',         'Mid (26–50 brukere)',      26,   50,   9900,  1800000, 12, FALSE, 3, 'Sweet spot for tjenestebedrifter.'),
  ('growth',      'Growth (51–100 brukere)',  51,  100,   8900,  2500000, 12, FALSE, 4, NULL),
  ('enterprise',  'Enterprise (101–200)',    101,  200,   7900,  4000000, 12, FALSE, 5, 'Forhandlbart, dedikert AE.'),
  ('custom',      'Custom (200+)',           201, NULL,      0,        0, 24, TRUE,  6, 'Tilpasset avtale — kontakt oss.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO pricing_inclusions (slug, label, sort_order)
VALUES
  ('platform-access',    'Tilgang til Tidum-plattformen',           1),
  ('updates',            'Løpende oppdateringer og nye funksjoner', 2),
  ('email-support',      'Support per e-post (hverdager 09–16)',    3),
  ('sla-uptime',         '99,5 % oppetidsgaranti (SLA)',            4),
  ('gdpr',               'Datasikkerhet og GDPR-tilpasning',        5),
  ('dpa',                'Norsk databehandleravtale (DPA)',         6),
  ('data-export',        'Eksport av data ved opphør (30 dager)',   7),
  ('brreg-onboarding',   'Brønnøysund-verifisering ved onboarding', 8),
  ('priority-support',   'Prioritert support (telefonsupport)',     9),
  ('dedicated-am',       'Dedikert kundeansvarlig',                10),
  ('custom-onboarding',  'Tilpasset onboarding på sted',           11)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO sales_routing_rules (min_users, max_users, assignee_label, assignee_email, response_time_hours, notes, sort_order)
SELECT * FROM (VALUES
  (5,    25,  'SDR',     CAST(NULL AS TEXT), 24, 'Self-serve onboarding, 30-min demo',          1),
  (26,   100, 'AE',      CAST(NULL AS TEXT), 4,  'Tilpasset demo + skriftlig tilbud innen 5d', 2),
  (101,  CAST(NULL AS INTEGER), 'Founder', CAST(NULL AS TEXT), 2, 'Workshop + RFP-håndtering', 3)
) AS t(min_users, max_users, assignee_label, assignee_email, response_time_hours, notes, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM sales_routing_rules);

INSERT INTO lead_pipeline_stages (slug, label, probability_pct, is_terminal, is_won, sort_order)
VALUES
  ('new',         'Ny',                  5, FALSE, FALSE, 1),
  ('contacted',   'Kontaktet',          15, FALSE, FALSE, 2),
  ('discovery',   'Discovery booket',   30, FALSE, FALSE, 3),
  ('demo',        'Demo gjennomført',   50, FALSE, FALSE, 4),
  ('quoted',      'Tilbud sendt',       70, FALSE, FALSE, 5),
  ('negotiating', 'Forhandling',        85, FALSE, FALSE, 6),
  ('won',         'Vunnet',            100, TRUE,  TRUE,  7),
  ('lost',        'Tapt',                0, TRUE,  FALSE, 8)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO sales_script_blocks (slug, category, title, body_md, sort_order)
VALUES
  ('discovery-opening', 'discovery', 'Åpning (30 sek)',
'Takk for at du tok kontakt. Før jeg viser noe — kan du si litt om hvordan dere håndterer dokumentasjon og oppfølging i dag?', 1),

  ('discovery-spin', 'discovery', 'SPIN-loop (10 min)',
E'**Situasjon**: Hvor mange ansatte er det dette gjelder? *(bekreft brukerantall fra skjema)*\n\n**Problem**: Hva er det største friksjonspunktet i dag — er det dokumentasjon, oppfølging, eller noe annet?\n\n**Implication**: Hva har det kostet dere sist det glapp? Tid, penger, eller noe annet?\n\n**Need-payoff**: Hvis dere fikk én ting riktig her, hvilken ville utgjort størst forskjell?', 2),

  ('discovery-close', 'discovery', 'Avslutning (3 min)',
'Det jeg hører er at [oppsummering av Implication]. Jeg foreslår at vi setter opp en demo der jeg viser nøyaktig hvordan vi løser akkurat det. Passer [dato]?', 3),

  ('demo-three-things', 'demo', 'Demo — vis tre ting',
E'1. Det de sa var viktigst (Need-payoff fra discovery)\n2. Dokumentasjons-trail (hovedverdi)\n3. Eksport/audit (compliance-anker for kommune)', 1),

  ('demo-price-moment', 'demo', 'Pris-momentet (helt til slutt)',
'For deres størrelse — **{{user_count}} brukere** — ligger dette på rundt **{{annual_total_kr}} kr i året**, inkludert onboarding første år. Skal jeg sende skriftlig tilbud?', 2),

  ('close-one-rec', 'close', 'One-recommendation close',
'Basert på det dere har fortalt meg, anbefaler jeg at dere starter med Tidum for **{{user_count}} brukere**. Onboarding kan starte [dato]. Skal jeg sende kontrakt?', 1),

  ('obj-planday', 'objection', 'Innvending: Planday er billigere',
'Helt enig — Planday er best på vakt. Vi løser dokumentasjon og oppfølging. To forskjellige behov. Mange av kundene våre kjører begge.', 1),

  ('obj-binding', 'objection', 'Innvending: 12 måneders binding er mye',
'Forstår. Grunnen er at de første 3 månedene er mest verdifulle for dere — vi får data og rutiner på plass. Hvis vi ikke leverer i den perioden, finner vi en løsning sammen.', 2),

  ('obj-budget', 'objection', 'Innvending: Vi har budsjett til halvparten',
'OK, da må vi enten kutte i scope eller starte med færre brukere. Hva er viktigst for dere?', 3),

  ('obj-internal', 'objection', 'Innvending: Vi må diskutere internt',
'Helt forståelig. Hva trenger du fra meg for at den diskusjonen skal gå raskt? Skal jeg sende et 1-siders sammendrag?', 4),

  ('obj-pricepdf', 'objection', 'Innvending: Send tilbud så ser vi',
'Ja, men før jeg sender — er det X eller Y som er viktigst? Da skreddersyr jeg det.', 5)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO salg_contract_templates (name, version, body_md, is_default, is_active)
SELECT
  'Standard SaaS-avtale', 1,
E'# ABONNEMENTSAVTALE — {{leverandor_navn}}\n\nMellom **{{leverandor_navn}}** (org.nr. {{leverandor_org_nr}}), heretter "Leverandør"\nog **{{kunde_navn}}**, org.nr. {{kunde_org_nr}}, heretter "Kunde".\n\n## §1 Omfang\n1.1 Leverandør gir Kunde rett til å benytte SaaS-tjenesten Tidum i avtaleperioden.\n1.2 Tjenesten leveres "as a service" via internett. Kunde har ikke rett til kildekode eller installasjon on-premise.\n\n## §2 Brukere og pris\n2.1 Avtalt baseline brukerantall: **{{bruker_antall}} brukere** ({{tier_navn}}).\n2.2 Pris per lisensiert bruker: **{{pris_per_bruker_kr}} kr/mnd**, fakturert årlig forskuddsvis.\n2.3 Lisensiert bruker = konto med innloggingsrett som har vært aktiv siste 30 dager. Vikarer og sesongarbeidere kan dekkes av Flex-bruker ({{flex_pris_kr}} kr/mnd, max {{flex_max_dager}} dagers sammenhengende aktivitet per bruker).\n2.4 Krysser faktisk bruk over avtalt tier-bånd, varsles Kunde 30 dager før neste fakturasyklus om automatisk oppgradering til riktig tier. Nedjustering kan kun skje ved fornyelse.\n2.5 Onboarding-honorar år 1: **{{onboarding_kr}} kr**, faktureres ved signering.\n2.6 Total år 1 (lisens + onboarding): **{{total_aar_1_kr}} kr**.\n\n## §3 Avtaleperiode og oppsigelse\n3.1 Bindingstid: **{{binding_mnd}} måneder** fra oppstartsdato.\n3.2 Avtalen fornyes automatisk for 12 nye måneder, med mindre skriftlig oppsigelse mottas senest **{{oppsigelse_mnd}} måneder** før utløp.\n3.3 Leverandør kan justere pris ved fornyelse med skriftlig varsel minimum **{{prisendring_dager}} dager** før fornyelse. Justering inntil KPI + 3 % krever ikke samtykke; større endringer gir Kunde rett til oppsigelse innen 30 dager etter varsel.\n\n## §4 Data og GDPR\n4.1 Kunde eier alle data som lastes opp/genereres i tjenesten.\n4.2 Leverandør er databehandler iht. GDPR art. 28. Egen databehandleravtale (DPA) er vedlegg 1.\n4.3 Data oppbevares i EU/EØS. Underleverandører listet i DPA.\n4.4 Ved opphør får Kunde sine data eksportert i strukturert format (JSON/CSV) innen 30 dager. Etter ytterligere 60 dager slettes data permanent.\n\n## §5 Support og SLA\n5.1 Support per e-post hverdager 09–16. Responstid:\n- Kritisk (tjenesten nede): {{sla_kritisk_timer}} timer\n- Høy (kjernefunksjon nede): 1 virkedag\n- Normal: 3 virkedager\n\n5.2 Oppetid-mål: **{{sla_oppetid_pct}} %** per kalendermåned, eksklusive planlagt vedlikehold varslet 7 dager i forveien.\n\n5.3 Brudd på oppetid-mål gir kreditt: 5 % av månedslisens per påbegynt prosent under mål, maks 50 %.\n\n## §6 Begrensninger\n6.1 Kunde skal ikke (a) dele login mellom brukere, (b) reverse-engineere tjenesten, (c) bruke tjenesten til å bygge konkurrerende produkt, (d) automatisert utvinning av data utover egen normal bruk.\n6.2 Vesentlig brudd kan medføre suspensjon med 14 dagers varsel og rett til å rette. Manglende retting gir hevingsrett.\n\n## §7 Ansvar\n7.1 Leverandørens samlede erstatningsansvar er begrenset til siste 12 måneders fakturert beløp.\n7.2 Ingen part er ansvarlig for indirekte tap, tapt fortjeneste eller tap av data utover kostnad ved gjenoppretting fra siste backup.\n\n## §8 Lovvalg og verneting\nNorsk rett. Verneting: Oslo tingrett.\n\n---\n\nSted/dato: ___________________     Sted/dato: ___________________\n\nFor {{leverandor_navn}}                For {{kunde_navn}}\n\n___________________                    ___________________\n',
  TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM salg_contract_templates);

INSERT INTO salg_settings (key, value, data_type, category, label, description, sort_order)
VALUES
  ('currency',                    'NOK',           'string',  'pricing',  'Valuta',                          NULL,                                                              1),
  ('sweet_spot_users',            '30',            'number',  'pricing',  'Sweet spot — antall brukere',     'Brukerantall som markeres som "sweet spot" på pris-side',         2),
  ('sweet_spot_label',            'sweet spot',    'string',  'pricing',  'Sweet spot — etikett',            NULL,                                                              3),
  ('min_users_floor',             '5',             'number',  'pricing',  'Minimum brukere',                 'Gulvet — kunder kan ikke kjøpe under dette',                      4),
  ('max_users_slider',            '200',           'number',  'pricing',  'Slider maks (Enterprise over)',   'Slider på kontakt-skjema går opp til denne; over = Enterprise',  5),
  ('flex_user_price_ore',         '3000',          'number',  'pricing',  'Flex-bruker pris (øre/mnd)',      '30 kr/mnd for vikarer/sesongarbeidere',                          6),
  ('flex_user_max_active_days',   '90',            'number',  'pricing',  'Flex-bruker maks dager aktiv',    NULL,                                                              7),
  ('default_binding_months',      '12',            'number',  'contract', 'Standard bindingstid (mnd)',      NULL,                                                              1),
  ('cancellation_notice_months',  '3',             'number',  'contract', 'Oppsigelsesvarsel (mnd)',         'Tid før fornyelse for skriftlig oppsigelse',                      2),
  ('price_change_notice_days',    '90',            'number',  'contract', 'Varsel ved prisendring (dager)',  NULL,                                                              3),
  ('leverandor_navn',             'Creatorhub AS', 'string',  'brand',    'Leverandør — navn',               NULL,                                                              1),
  ('leverandor_org_nr',           '',              'string',  'brand',    'Leverandør — org.nr.',            NULL,                                                              2),
  ('leverandor_legal_email',      '',              'string',  'brand',    'Legal-epost',                     NULL,                                                              3),
  ('leverandor_support_email',    '',              'string',  'brand',    'Support-epost',                   NULL,                                                              4),
  ('leverandor_support_phone',    '',              'string',  'brand',    'Support-telefon',                 NULL,                                                              5),
  ('sla_uptime_target_pct',       '99.5',          'number',  'sla',      'Oppetid-mål (%)',                 NULL,                                                              1),
  ('sla_critical_response_hours', '4',             'number',  'sla',      'Kritisk responstid (timer)',      NULL,                                                              2)
ON CONFLICT (key) DO NOTHING;

-- Default tier↔inclusion mapping (idempotent — only seeds if M:M empty)
INSERT INTO pricing_tier_inclusions (tier_id, inclusion_id)
SELECT t.id, i.id
FROM pricing_tiers t
CROSS JOIN pricing_inclusions i
WHERE NOT EXISTS (SELECT 1 FROM pricing_tier_inclusions)
  AND (
    -- alle tiers får basisliste
    i.slug IN ('platform-access','updates','email-support','sla-uptime','gdpr','dpa','data-export','brreg-onboarding')
    -- mid+ får prioritert support
    OR (i.slug = 'priority-support' AND t.slug IN ('mid','growth','enterprise','custom'))
    -- growth+ får dedikert AM
    OR (i.slug = 'dedicated-am'     AND t.slug IN ('growth','enterprise','custom'))
    -- enterprise+ får tilpasset onboarding
    OR (i.slug = 'custom-onboarding' AND t.slug IN ('enterprise','custom'))
  );
