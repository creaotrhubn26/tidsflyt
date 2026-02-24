UPDATE email_templates SET variables = '["mottaker","periode","avsender","melding"]'::jsonb WHERE slug = 'monthly-timesheet';
UPDATE email_templates SET variables = '["mottaker","saksnavn","periode","avsender","melding"]'::jsonb WHERE slug = 'case-report';
UPDATE email_templates SET variables = '["mottaker","periode","avsender","melding"]'::jsonb WHERE slug = 'overtime-report';
UPDATE email_templates SET variables = '["mottaker","emne","melding"]'::jsonb WHERE slug = 'general-message';
