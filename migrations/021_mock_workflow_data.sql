-- Migration 021: Seed mock data for full workflow demo
-- This seeds the complete workflow: access request → approval → onboarding → time tracking → timesheet → case reports → forward

-- ====== 1. MOCK ACCESS REQUESTS (demo/forespørsler) ======
INSERT INTO access_requests (full_name, email, org_number, company, phone, message, brreg_verified, institution_type, status, created_at)
VALUES
  ('Kari Nordseth', 'kari@norskbarnehjelp.no', '987654321', 'Norsk Barnehjelp AS', '47912345678', 'Vi ønsker å bruke Tidum for oppfølging av miljøarbeidere i Oslo-regionen.', true, 'privat', 'pending', NOW() - INTERVAL '2 days'),
  ('Erik Bakken', 'erik@bergenkommune.no', '123456789', 'Bergen Kommune', '47987654321', 'Barnevernstjenesten i Bergen trenger et tidsregistreringssystem.', true, 'offentlig', 'pending', NOW() - INTERVAL '1 day'),
  ('Lise Haugen', 'lise@tryggoppvekst.no', '456789012', 'Trygg Oppvekst AS', '47923456789', 'Privat tiltak med 12 miljøarbeidere som trenger timeregistrering.', true, 'privat', 'approved', NOW() - INTERVAL '14 days'),
  ('Anders Berg', 'anders@navoslo.no', '789012345', 'NAV Oslo', '47934567890', 'NAV-tiltak for ungdom. Trenger rapportering og timeføring.', false, 'offentlig', 'approved', NOW() - INTERVAL '30 days')
ON CONFLICT DO NOTHING;

-- ====== 2. MOCK VENDOR (tiltaksfirma) ======
INSERT INTO vendors (id, email, password, business_name, organization_number, phone, location, status, created_at)
VALUES ('99', 'post@tryggoppvekst.no', 'placeholder_not_used', 'Trygg Oppvekst AS', '456789012', '47923456789', 'Storgata 15, 0182 Oslo', 'approved', NOW() - INTERVAL '14 days')
ON CONFLICT (id) DO NOTHING;

-- ====== 3. MOCK COMPANIES ======
INSERT INTO companies (id, vendor_id, name, created_at)
VALUES (99, '99', 'Trygg Oppvekst AS', NOW() - INTERVAL '14 days')
ON CONFLICT (id) DO NOTHING;

-- ====== 4. MOCK COMPANY USERS (tiltaksleder + miljøarbeidere) ======
ALTER TABLE company_users ADD COLUMN IF NOT EXISTS institution TEXT;

INSERT INTO company_users (id, vendor_id, company_id, user_email, role, approved, institution, created_at)
VALUES
  (901, '99', 99, 'lise@tryggoppvekst.no', 'tiltaksleder', true, NULL, NOW() - INTERVAL '14 days'),
  (902, '99', 99, 'martin.olsen@gmail.com', 'miljoarbeider', true, 'Fagerborg skole, Oslo', NOW() - INTERVAL '10 days'),
  (903, '99', 99, 'sofia.hansen@gmail.com', 'miljoarbeider', true, 'Sagene ungdomsskole, Oslo', NOW() - INTERVAL '8 days'),
  (904, '99', 99, 'thomas.berg@gmail.com', 'miljoarbeider', false, 'Tøyen skole, Oslo', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ====== 5. MOCK USER CASES (saker tilordnet miljøarbeidere) ======
INSERT INTO user_cases (id, company_user_id, case_title, status, created_at)
VALUES
  (901, 902, 'Oppfølging elev A – Fagerborg skole', 'active', NOW() - INTERVAL '10 days'),
  (902, 902, 'Miljøarbeid gruppe B – Fagerborg skole', 'active', NOW() - INTERVAL '9 days'),
  (903, 903, 'Oppfølging elev C – Sagene ungdomsskole', 'active', NOW() - INTERVAL '8 days')
ON CONFLICT (id) DO NOTHING;

-- ====== 6. MOCK PROJECT INFO (saksinformasjon) ======
INSERT INTO project_info (id, konsulent, bedrift, oppdragsgiver, tiltak, periode, user_id, klient_id, is_active, created_at)
VALUES
  (901, 'Martin Olsen', 'Trygg Oppvekst AS', 'Fagerborg skole', 'Miljøarbeid', 'Januar 2026 - Juni 2026', 'mock-martin', 'ELEV-A', true, NOW() - INTERVAL '10 days'),
  (902, 'Martin Olsen', 'Trygg Oppvekst AS', 'Fagerborg skole', 'Miljøarbeid', 'Januar 2026 - Juni 2026', 'mock-martin', 'GRUPPE-B', true, NOW() - INTERVAL '9 days'),
  (903, 'Sofia Hansen', 'Trygg Oppvekst AS', 'Sagene ungdomsskole', 'Oppfølging', 'Februar 2026 - Juni 2026', 'mock-sofia', 'ELEV-C', true, NOW() - INTERVAL '8 days')
ON CONFLICT (id) DO NOTHING;

-- ====== 7. MOCK TIME ENTRIES (timeføringer for februar 2026) ======
-- Martin's time entries (past 3 weeks)
INSERT INTO log_row (user_id, date, start_time, end_time, break_hours, activity, place, project, notes, created_at)
SELECT 'mock-martin', d::date, '08:00', '15:30', 0.5,
  CASE (EXTRACT(DOW FROM d)::int % 3)
    WHEN 0 THEN 'Miljøarbeid'
    WHEN 1 THEN 'Oppfølging'
    ELSE 'Rapportering'
  END,
  'Fagerborg skole',
  'Oppfølging elev A',
  CASE (EXTRACT(DOW FROM d)::int % 3)
    WHEN 0 THEN 'Miljøarbeid med elev A, sosial trening i friminutt'
    WHEN 1 THEN 'Oppfølgingssamtale med elev A og kontaktlærer'
    ELSE 'Skriving av rapport og loggføring'
  END,
  d
FROM generate_series('2026-02-02'::date, '2026-02-20'::date, '1 day') d
WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5;

-- Sofia's time entries (past 2 weeks)
INSERT INTO log_row (user_id, date, start_time, end_time, break_hours, activity, place, project, notes, created_at)
SELECT 'mock-sofia', d::date, '09:00', '16:00', 0.5,
  CASE (EXTRACT(DOW FROM d)::int % 2)
    WHEN 0 THEN 'Oppfølging'
    ELSE 'Samtale'
  END,
  'Sagene ungdomsskole',
  'Oppfølging elev C',
  CASE (EXTRACT(DOW FROM d)::int % 2)
    WHEN 0 THEN 'Oppfølging av elev C i undervisningssituasjon'
    ELSE 'Samtale med elev C om trivsel og sosiale utfordringer'
  END,
  d
FROM generate_series('2026-02-09'::date, '2026-02-20'::date, '1 day') d
WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5;

-- ====== 8. MOCK TIMESHEET SUBMISSIONS ======
INSERT INTO timesheet_submissions (id, user_id, vendor_id, month, total_hours, entry_count, status, submitted_at, notes, created_at)
VALUES
  (901, 'mock-martin', '99', '2026-01', 147.0, 21, 'approved', NOW() - INTERVAL '25 days', 'Timeliste for januar 2026. Alle timer godkjent av kontaktlærer.', NOW() - INTERVAL '25 days'),
  (902, 'mock-martin', '99', '2026-02', 98.0, 14, 'submitted', NOW() - INTERVAL '1 day', 'Timeliste for februar hittil. Fortsetter å registrere.', NOW() - INTERVAL '1 day'),
  (903, 'mock-sofia', '99', '2026-02', 65.0, 10, 'submitted', NOW() - INTERVAL '2 days', 'Februar timeliste – alle dager registrert.', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- ====== 9. MOCK CASE REPORTS (saksrapporter) ======
INSERT INTO case_reports (id, user_id, vendor_id, case_id, month, status, created_at,
  background, actions, progress, challenges, factors, assessment, recommendations)
VALUES
  (901, 'mock-martin', 99, 'ELEV-A', '2026-01', 'approved',
   NOW() - INTERVAL '24 days',
   'Elev A er en 14-årig gutt med utfordringer knyttet til sosial interaksjon og konsentrasjon i klasserommet. Tiltaket ble iverksatt etter bekymringsmelding fra kontaktlærer i september 2025.',
   'Gjennomført daglige samtaler i friminutt. Deltatt i gruppeaktiviteter med medelever. Samarbeidet med kontaktlærer om tilpassede oppgaver. Etablert fast struktur for skoledagen.',
   'Elev A viser positiv utvikling i sosial deltakelse. Antall konfliktsituasjoner er redusert fra 3-4 per uke til 1-2. Eleven tar selv initiativ til samtale med medelever.',
   'Fortsatt utfordringer med konsentrasjon i strukturerte undervisningssituasjoner. Eleven har vansker med overganger mellom aktiviteter.',
   'Stabil hjemmesituasjon bidrar positivt. God relasjon til kontaktlærer. Motivert av positive tilbakemeldinger.',
   'Tiltaket fungerer godt og bør videreføres. Positiv utvikling i sosial kompetanse. Konsentrasjonsutfordringer krever fortsatt oppfølging.',
   'Videreføre daglige samtaler. Introdusere konsentrasjonstrening. Evaluere behov for PPT-vurdering. Planlegge foreldremøte.'),

  (902, 'mock-martin', 99, 'ELEV-A', '2026-02', 'submitted',
   NOW() - INTERVAL '2 days',
   'Fortsettelse av oppfølging av Elev A. Status fra forrige måned: positiv utvikling i sosial deltakelse.',
   'Videreført daglige samtaler. Startet med konsentrasjonstrening 2x per uke. Gjennomført foreldremøte 12. februar. Samarbeid med PPT initiert.',
   'Eleven viser videre fremgang. Konsentrasjonen er noe bedret etter innføring av strukturerte pauser. Foreldresamarbeidet er styrket.',
   'Eleven har hatt noen tilbakefall i uke 7. Mulig sammenheng med sykdom i familien.',
   'Foreldresamarbeid fungerer godt. PPT-samarbeid er igangsatt. Stabil relasjon til miljøarbeider.',
   'Tiltaket viser fortsatt positiv effekt. Anbefaler videreføring med justeringer basert på PPT-tilbakemelding.',
   'Vente på PPT-vurdering. Øke konsentrasjonstrening til 3x per uke. Følge opp familieutfordringer.'),

  (903, 'mock-sofia', 99, 'ELEV-C', '2026-02', 'needs_revision',
   NOW() - INTERVAL '4 days',
   'Elev C er en 12-årig jente med angst- og trivselsproblematikk. Startet oppfølging i februar 2026.',
   'Ukentlige samtaler. Deltatt i to gruppeaktiviteter. Samarbeid med helsesykepleier. Observasjon i klasserom.',
   'Eleven viser noe bedring i trivsel. Mindre fravær de siste to ukene.',
   'Eleven vegrer seg fortsatt for muntlig deltakelse. Unngår gruppearbeid i noen fag.',
   'God støtte fra foreldre. Helsesykepleier følger opp parallelt.',
   'For tidlig å konkludere. Behov for mer tid og systematisk kartlegging.',
   'Fortsette ukentlige samtaler. Innføre gradvis eksponering for muntlig aktivitet. Samkjøre med helsesykepleier.')
ON CONFLICT (id) DO NOTHING;

-- ====== 10. MOCK REPORT COMMENTS (tilbakemelding fra tiltaksleder) ======
INSERT INTO report_comments (report_id, author_id, author_name, author_role, content, is_internal, created_at)
VALUES
  (901, 'mock-lise', 'Lise Haugen', 'admin', 'Veldig grundig rapport, Martin. Godkjent!', false, NOW() - INTERVAL '22 days'),
  (903, 'mock-lise', 'Lise Haugen', 'admin', 'Hei Sofia, rapporten mangler noe detaljer om kartleggingsmetoder brukt. Kan du utdype avsnittet om faglig vurdering? Også ønskelig med mer konkrete mål for neste periode.', false, NOW() - INTERVAL '2 days'),
  (903, 'mock-sofia', 'Sofia Hansen', 'user', 'Takk for tilbakemeldingen Lise, jeg oppdaterer rapporten med mer detaljer.', false, NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- ====== 11. MOCK ACTIVITIES — skipped (no standalone activities table) ======

-- ====== 12. MOCK NOTIFICATIONS ======
-- For the dev user (super_admin) — pending access requests
INSERT INTO notifications (id, recipient_type, recipient_id, type, title, body, payload, actor_id, created_at)
VALUES
  (gen_random_uuid(), 'user', '1', 'access_request', 'Ny tilgangsforespørsel', 'Kari Nordseth fra Norsk Barnehjelp AS har bedt om tilgang til Tidum.', '{"link":"/access-requests","company":"Norsk Barnehjelp AS"}', NULL, NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), 'user', '1', 'access_request', 'Ny tilgangsforespørsel', 'Erik Bakken fra Bergen Kommune har bedt om tilgang til Tidum.', '{"link":"/access-requests","company":"Bergen Kommune"}', NULL, NOW() - INTERVAL '1 day');

-- For tiltaksleder (mock-lise) — timesheet submitted, case reports
INSERT INTO notifications (id, recipient_type, recipient_id, type, title, body, payload, actor_id, created_at)
VALUES
  (gen_random_uuid(), 'user', 'mock-lise', 'timesheet_submitted', 'Ny timeliste sendt inn', 'Martin Olsen har sendt inn timeliste for 2026-02 (98.0 timer).', '{"link":"/timesheets","month":"2026-02","userId":"mock-martin"}', 'mock-martin', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'user', 'mock-lise', 'timesheet_submitted', 'Ny timeliste sendt inn', 'Sofia Hansen har sendt inn timeliste for 2026-02 (65.0 timer).', '{"link":"/timesheets","month":"2026-02","userId":"mock-sofia"}', 'mock-sofia', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), 'user', 'mock-lise', 'report_submitted', 'Ny saksrapport mottatt', 'Martin Olsen har sendt inn saksrapport «Månedlig saksrapport – Elev A, februar 2026».', '{"link":"/admin-case-reviews","reportId":902}', 'mock-martin', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'user', 'mock-lise', 'report_submitted', 'Saksrapport revidert', 'Sofia Hansen har revidert saksrapport «Månedlig saksrapport – Elev C, februar 2026».', '{"link":"/admin-case-reviews","reportId":903}', 'mock-sofia', NOW() - INTERVAL '12 hours');

-- For miljøarbeider (mock-martin) — timesheet approved for jan
INSERT INTO notifications (id, recipient_type, recipient_id, type, title, body, payload, actor_id, read_at, created_at)
VALUES
  (gen_random_uuid(), 'user', 'mock-martin', 'timesheet_approved', 'Timeliste godkjent', 'Din timeliste for 2026-01 er godkjent av Lise Haugen.', '{"link":"/timesheets","month":"2026-01"}', 'mock-lise', NOW() - INTERVAL '23 days', NOW() - INTERVAL '24 days'),
  (gen_random_uuid(), 'user', 'mock-martin', 'invite_received', 'Velkommen til Tidum', 'Du er invitert som miljøarbeider av Trygg Oppvekst AS.', '{"link":"/dashboard"}', NULL, NOW() - INTERVAL '9 days', NOW() - INTERVAL '10 days');

-- For miljøarbeider (mock-sofia) — report sent back for revision
INSERT INTO notifications (id, recipient_type, recipient_id, type, title, body, payload, actor_id, created_at)
VALUES
  (gen_random_uuid(), 'user', 'mock-sofia', 'report_revision', 'Saksrapport returnert for revidering', 'Din saksrapport «Månedlig saksrapport – Elev C, februar 2026» er sendt tilbake for revidering. Kommentar: Mangler detaljer om kartleggingsmetoder.', '{"link":"/case-reports","reportId":903}', 'mock-lise', NOW() - INTERVAL '2 days');

INSERT INTO notifications (id, recipient_type, recipient_id, type, title, body, payload, actor_id, read_at, created_at)
VALUES
  (gen_random_uuid(), 'user', 'mock-sofia', 'invite_received', 'Velkommen til Tidum', 'Du er invitert som miljøarbeider av Trygg Oppvekst AS.', '{"link":"/dashboard"}', NULL, NOW() - INTERVAL '7 days', NOW() - INTERVAL '8 days');

-- For the dev user — general workflow notifications (so the logged-in dev user sees them)
INSERT INTO notifications (id, recipient_type, recipient_id, type, title, body, payload, actor_id, created_at)
VALUES
  (gen_random_uuid(), 'user', '1', 'timesheet_submitted', 'Ny timeliste sendt inn', 'Martin Olsen har sendt inn timeliste for 2026-02 (98.0 timer).', '{"link":"/timesheets","month":"2026-02"}', 'mock-martin', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'user', '1', 'timesheet_submitted', 'Ny timeliste sendt inn', 'Sofia Hansen har sendt inn timeliste for 2026-02 (65.0 timer).', '{"link":"/timesheets","month":"2026-02"}', 'mock-sofia', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), 'user', '1', 'report_submitted', 'Ny saksrapport mottatt', 'Martin Olsen har sendt inn saksrapport «Elev A, februar 2026».', '{"link":"/admin-case-reviews","reportId":902}', 'mock-martin', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'user', '1', 'report_revision', 'Saksrapport returnert', 'Saksrapport fra Sofia Hansen er sendt tilbake for revidering.', '{"link":"/admin-case-reviews","reportId":903}', 'mock-sofia', NOW() - INTERVAL '2 days');

-- Read/old notifications for dev user
INSERT INTO notifications (id, recipient_type, recipient_id, type, title, body, payload, actor_id, read_at, created_at)
VALUES
  (gen_random_uuid(), 'user', '1', 'timesheet_approved', 'Timeliste godkjent', 'Timelisten for Martin Olsen, januar 2026 er godkjent.', '{"link":"/timesheets","month":"2026-01"}', 'mock-lise', NOW() - INTERVAL '23 days', NOW() - INTERVAL '24 days'),
  (gen_random_uuid(), 'user', '1', 'report_approved', 'Saksrapport godkjent', 'Saksrapport «Elev A, januar 2026» fra Martin Olsen er godkjent.', '{"link":"/admin-case-reviews","reportId":901}', 'mock-lise', NOW() - INTERVAL '21 days', NOW() - INTERVAL '22 days'),
  (gen_random_uuid(), 'user', '1', 'forward_sent', 'Rapport sendt til institusjon', 'Saksrapport for Elev A, januar 2026 ble sendt til Fagerborg skole.', '{"link":"/forward"}', 'mock-lise', NOW() - INTERVAL '20 days', NOW() - INTERVAL '21 days');

-- ====== 13. MOCK FORWARD LOG ======
INSERT INTO forward_log (id, user_id, report_type, recipient_email, institution_name, period_start, period_end, status, created_at)
VALUES
  (901, 'mock-lise', 'case-report', 'rektor@fagerborg.osloskolen.no', 'Fagerborg skole', '2026-01-01', '2026-01-31', 'sent', NOW() - INTERVAL '21 days')
ON CONFLICT (id) DO NOTHING;

-- Done!
SELECT 'Mock data seeded successfully! Workflow demo ready.' AS result;
