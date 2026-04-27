-- Migration 038: Stripe-integrasjon + Creatorhub AS brand-defaults
--
-- 1. Setter leverandør-info (org.nr 937 518 684) med UPDATE som overstyrer
--    tomme salg_settings — kjøres idempotent ved hver oppstart.
-- 2. Oppdaterer kontraktsmal §1.1 til å nevne "Creatorhub AS som leverer
--    og drifter SaaS-tjenesten Tidum" eksplisitt.
-- 3. Legger Stripe-relaterte kolonner på pricing_tiers + nye salg_settings
--    for Stripe-nøkler. Admin syncher tiers til Stripe via /admin/salg/stripe.

-- ============= 1. BRAND DEFAULTS =============

-- Sett org.nr hvis fremdeles tomt (overstyrer ikke admin-redigering)
UPDATE salg_settings
   SET value = '937518684', updated_at = NOW()
 WHERE key = 'leverandor_org_nr'
   AND (value IS NULL OR value = '');

-- Bekreft Creatorhub AS som default leverandør (kun hvis tom)
UPDATE salg_settings
   SET value = 'Creatorhub AS', updated_at = NOW()
 WHERE key = 'leverandor_navn'
   AND (value IS NULL OR value = '');

-- Nye drift-relaterte settings
INSERT INTO salg_settings (key, value, data_type, category, label, description, sort_order)
VALUES
  ('leverandor_drifter_tjeneste', 'Tidum',          'string', 'brand', 'Tjeneste som driftes',    'Navn på SaaS-tjenesten leverandøren drifter', 6),
  ('leverandor_adresse',          '',               'string', 'brand', 'Forretningsadresse',      'Vises i kontraktens hode', 7),
  ('leverandor_lovvalg_by',       'Oslo',           'string', 'brand', 'Verneting (by)',          'Bruk i kontraktens §8 lovvalg', 8)
ON CONFLICT (key) DO NOTHING;

-- ============= 2. KONTRAKTSMAL — re-seed med Creatorhub-formulering =============
-- Vi sjekker om standard-malen fortsatt har den gamle teksten (admin har
-- IKKE redigert) og oppdaterer i så fall. Hvis admin har endret, lar vi
-- den være.

UPDATE salg_contract_templates
SET body_md = E'# ABONNEMENTSAVTALE — {{leverandor_navn}}\n\nMellom **{{leverandor_navn}}** (org.nr. {{leverandor_org_nr}}), heretter "Leverandør" — som leverer og drifter SaaS-tjenesten **{{leverandor_drifter_tjeneste}}**\nog **{{kunde_navn}}**, org.nr. {{kunde_org_nr}}, heretter "Kunde".\n\n## §1 Omfang\n1.1 Leverandør gir Kunde rett til å benytte SaaS-tjenesten {{leverandor_drifter_tjeneste}}, levert og driftet av {{leverandor_navn}} (org.nr. {{leverandor_org_nr}}), i avtaleperioden.\n1.2 Tjenesten leveres "as a service" via internett. Kunde har ikke rett til kildekode eller installasjon on-premise.\n\n## §2 Brukere og pris\n2.1 Avtalt baseline brukerantall: **{{bruker_antall}} brukere** ({{tier_navn}}).\n2.2 Pris per lisensiert bruker: **{{pris_per_bruker_kr}} kr/mnd**, fakturert årlig forskuddsvis.\n2.3 Lisensiert bruker = konto med innloggingsrett som har vært aktiv siste 30 dager. Vikarer og sesongarbeidere kan dekkes av Flex-bruker ({{flex_pris_kr}} kr/mnd, max {{flex_max_dager}} dagers sammenhengende aktivitet per bruker).\n2.4 Krysser faktisk bruk over avtalt tier-bånd, varsles Kunde 30 dager før neste fakturasyklus om automatisk oppgradering til riktig tier. Nedjustering kan kun skje ved fornyelse.\n2.5 Onboarding-honorar år 1: **{{onboarding_kr}} kr**, faktureres ved signering.\n2.6 Total år 1 (lisens + onboarding): **{{total_aar_1_kr}} kr**.\n\n## §3 Avtaleperiode og oppsigelse\n3.1 Bindingstid: **{{binding_mnd}} måneder** fra oppstartsdato.\n3.2 Avtalen fornyes automatisk for 12 nye måneder, med mindre skriftlig oppsigelse mottas senest **{{oppsigelse_mnd}} måneder** før utløp.\n3.3 Leverandør kan justere pris ved fornyelse med skriftlig varsel minimum **{{prisendring_dager}} dager** før fornyelse. Justering inntil KPI + 3 % krever ikke samtykke; større endringer gir Kunde rett til oppsigelse innen 30 dager etter varsel.\n\n## §4 Data og GDPR\n4.1 Kunde eier alle data som lastes opp/genereres i tjenesten {{leverandor_drifter_tjeneste}}.\n4.2 {{leverandor_navn}} er databehandler iht. GDPR art. 28. Egen databehandleravtale (DPA) er vedlegg 1.\n4.3 Data oppbevares i EU/EØS. Underleverandører listet i DPA.\n4.4 Ved opphør får Kunde sine data eksportert i strukturert format (JSON/CSV) innen 30 dager. Etter ytterligere 60 dager slettes data permanent.\n\n## §5 Support og SLA\n5.1 Support per e-post hverdager 09–16. Responstid:\n- Kritisk (tjenesten nede): {{sla_kritisk_timer}} timer\n- Høy (kjernefunksjon nede): 1 virkedag\n- Normal: 3 virkedager\n\n5.2 Oppetid-mål: **{{sla_oppetid_pct}} %** per kalendermåned, eksklusive planlagt vedlikehold varslet 7 dager i forveien.\n\n5.3 Brudd på oppetid-mål gir kreditt: 5 % av månedslisens per påbegynt prosent under mål, maks 50 %.\n\n## §6 Begrensninger\n6.1 Kunde skal ikke (a) dele login mellom brukere, (b) reverse-engineere tjenesten, (c) bruke tjenesten til å bygge konkurrerende produkt, (d) automatisert utvinning av data utover egen normal bruk.\n6.2 Vesentlig brudd kan medføre suspensjon med 14 dagers varsel og rett til å rette. Manglende retting gir hevingsrett.\n\n## §7 Ansvar\n7.1 {{leverandor_navn}} sitt samlede erstatningsansvar er begrenset til siste 12 måneders fakturert beløp.\n7.2 Ingen part er ansvarlig for indirekte tap, tapt fortjeneste eller tap av data utover kostnad ved gjenoppretting fra siste backup.\n\n## §8 Lovvalg og verneting\nNorsk rett. Verneting: {{leverandor_lovvalg_by}} tingrett.\n\n---\n\nSted/dato: ___________________     Sted/dato: ___________________\n\nFor {{leverandor_navn}}                For {{kunde_navn}}\n\n___________________                    ___________________\n',
    updated_at = NOW(),
    version = version + 1
WHERE name = 'Standard SaaS-avtale'
  AND body_md NOT LIKE '%leverer og drifter SaaS-tjenesten%';

-- ============= 3. STRIPE-FELTER PÅ pricing_tiers =============

ALTER TABLE pricing_tiers
  ADD COLUMN IF NOT EXISTS stripe_product_id           TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id_monthly     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id_annual      TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_price_id  TEXT,
  ADD COLUMN IF NOT EXISTS stripe_synced_at            TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_pricing_tiers_stripe_product
  ON pricing_tiers(stripe_product_id);

-- ============= 4. STRIPE-INNSTILLINGER =============

INSERT INTO salg_settings (key, value, data_type, category, label, description, sort_order, is_secret)
VALUES
  ('stripe_mode',           'test',  'string',  'stripe', 'Stripe-modus',          'test eller live', 1, false),
  ('stripe_secret_key',     '',      'string',  'stripe', 'Stripe Secret Key',     'Hentes fra Stripe Dashboard → Developers → API keys', 2, true),
  ('stripe_publishable_key','',      'string',  'stripe', 'Stripe Publishable Key', 'Brukes i frontend for Checkout', 3, false),
  ('stripe_webhook_secret', '',      'string',  'stripe', 'Stripe Webhook Secret',  'whsec_… fra webhook-endpoint i Stripe Dashboard', 4, true),
  ('stripe_currency',       'nok',   'string',  'stripe', 'Stripe valuta-kode',    'ISO 4217, små bokstaver. Må matche app pricing-currency.', 5, false),
  ('stripe_tax_behavior',   'inclusive', 'string', 'stripe', 'Tax behavior',       'inclusive eller exclusive — for norske priser, inclusive', 6, false),
  ('stripe_checkout_success_url', '/kontakt?stripe=success',  'string', 'stripe', 'Success-URL etter Checkout', NULL, 7, false),
  ('stripe_checkout_cancel_url',  '/priser?stripe=cancelled', 'string', 'stripe', 'Cancel-URL etter Checkout',  NULL, 8, false)
ON CONFLICT (key) DO NOTHING;

-- ============= 5. STRIPE-EVENT-LOGG (for debugging + audit) =============

CREATE TABLE IF NOT EXISTS stripe_events (
  id SERIAL PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  customer_id TEXT,
  subscription_id TEXT,
  invoice_id TEXT,
  payload JSONB,
  processed_at TIMESTAMP DEFAULT NOW(),
  revenue_event_id INTEGER REFERENCES revenue_events(id)
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_customer ON stripe_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_subscription ON stripe_events(subscription_id);

-- ============= 6. STRIPE-KOBLING PÅ access_requests / leads =============

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_url    TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_access_req_stripe_customer
  ON access_requests(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_access_req_stripe_sub
  ON access_requests(stripe_subscription_id);
