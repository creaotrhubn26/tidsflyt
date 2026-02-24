-- Seed default Norwegian email templates
INSERT INTO email_templates (name, slug, subject, html_content, text_content, category, body)
VALUES
  (
    'Månedlig timeliste',
    'monthly-timesheet',
    'Timeliste for {{periode}} – {{avsender}}',
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#1a1a2e">Timeliste</h2><p>Hei {{mottaker}},</p><p>Vedlagt finner du timelisten for <strong>{{periode}}</strong>.</p><p>{{melding}}</p><p style="color:#666;font-size:13px;margin-top:30px">Se vedlagt Excel-fil for detaljert oversikt.</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0"/><p style="color:#999;font-size:11px">Sendt via Tidum</p></div>',
    'Timeliste for {{periode}} fra {{avsender}}. {{melding}} Se vedlagt Excel-fil. Sendt via Tidum',
    'timesheet',
    'Hei {{mottaker}}, vedlagt timelisten for {{periode}}.'
  ),
  (
    'Saksrapport',
    'case-report',
    'Saksrapport – {{saksnavn}} – {{periode}}',
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#1a1a2e">Saksrapport</h2><p>Hei {{mottaker}},</p><p>Her er saksrapporten for <strong>{{saksnavn}}</strong> i perioden <strong>{{periode}}</strong>.</p><p>{{melding}}</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0"/><p style="color:#999;font-size:11px">Sendt via Tidum</p></div>',
    'Saksrapport for {{saksnavn}} ({{periode}}) fra {{avsender}}. Sendt via Tidum',
    'case-report',
    'Hei {{mottaker}}, saksrapport for {{saksnavn}}.'
  ),
  (
    'Overtidsrapport',
    'overtime-report',
    'Overtidsrapport – {{periode}} – {{avsender}}',
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#1a1a2e">Overtidsrapport</h2><p>Hei {{mottaker}},</p><p>Vedlagt finner du overtidsrapporten for perioden <strong>{{periode}}</strong>.</p><p>{{melding}}</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0"/><p style="color:#999;font-size:11px">Sendt via Tidum</p></div>',
    'Overtidsrapport for {{periode}} fra {{avsender}}. Sendt via Tidum',
    'overtime',
    'Hei {{mottaker}}, overtidsrapport for {{periode}}.'
  ),
  (
    'Generell melding',
    'general-message',
    '{{emne}}',
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><p>Hei {{mottaker}},</p><p>{{melding}}</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0"/><p style="color:#999;font-size:11px">Sendt via Tidum</p></div>',
    'Hei {{mottaker}}, {{melding}} Sendt via Tidum',
    'general',
    'Hei {{mottaker}}, {{melding}}'
  )
ON CONFLICT (slug) DO NOTHING;
