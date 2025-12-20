import type { Express, Request, Response, NextFunction } from "express";
import { pool } from "./db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || 'smart-timing-secret';

interface AuthRequest extends Request {
  admin?: any;
  companyUser?: any;
}

function authenticateAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function registerSmartTimingRoutes(app: Express) {
  
  // Health check
  app.get("/api/health", async (req, res) => {
    try {
      const result = await pool.query('SELECT NOW()');
      res.json({ status: 'ok', timestamp: result.rows[0].now });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: err.message });
    }
  });

  // ========== LOGS (Time Entries) ==========
  app.get("/api/logs", async (req, res) => {
    try {
      const { user_id, month, year, start_date, end_date, project_id } = req.query;
      const userId = user_id || 'default';
      
      let query = `
        SELECT lr.*, pi.konsulent, pi.bedrift, pi.oppdragsgiver, pi.tiltak, pi.klient_id
        FROM log_row lr
        LEFT JOIN project_info pi ON lr.project_id = pi.id
        WHERE lr.user_id = $1
      `;
      const params: any[] = [userId];
      let paramIndex = 2;
      
      if (month && year) {
        query += ` AND EXTRACT(MONTH FROM lr.date) = $${paramIndex} AND EXTRACT(YEAR FROM lr.date) = $${paramIndex + 1}`;
        params.push(month, year);
        paramIndex += 2;
      }
      if (start_date) {
        query += ` AND lr.date >= $${paramIndex}`;
        params.push(start_date);
        paramIndex++;
      }
      if (end_date) {
        query += ` AND lr.date <= $${paramIndex}`;
        params.push(end_date);
        paramIndex++;
      }
      if (project_id) {
        query += ` AND lr.project_id = $${paramIndex}`;
        params.push(project_id);
        paramIndex++;
      }
      
      query += ` ORDER BY lr.date DESC, lr.start_time DESC`;
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/logs", async (req, res) => {
    try {
      const { date, start_time, end_time, break_hours, activity, title, project, place, notes, expense_coverage, user_id, project_id } = req.body;
      const result = await pool.query(
        `INSERT INTO log_row (date, start_time, end_time, break_hours, activity, title, project, place, notes, expense_coverage, user_id, project_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [date, start_time, end_time, break_hours || 0, activity || 'Work', title, project, place, notes, expense_coverage || 0, user_id || 'default', project_id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/logs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { date, start_time, end_time, break_hours, activity, title, project, place, notes, expense_coverage } = req.body;
      const result = await pool.query(
        `UPDATE log_row SET date=$1, start_time=$2, end_time=$3, break_hours=$4, activity=$5, title=$6, project=$7, place=$8, notes=$9, expense_coverage=$10, updated_at=NOW()
         WHERE id=$11 RETURNING *`,
        [date, start_time, end_time, break_hours, activity, title, project, place, notes, expense_coverage, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Log not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/logs/:id", async (req, res) => {
    try {
      await pool.query('DELETE FROM log_row WHERE id = $1', [req.params.id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/logs/bulk", async (req, res) => {
    try {
      const { rows, user_id, project_id } = req.body;
      const userId = user_id || 'default';
      let inserted = 0;
      
      for (const row of rows) {
        await pool.query(
          `INSERT INTO log_row (date, start_time, end_time, break_hours, activity, title, project, place, notes, expense_coverage, user_id, project_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [row.date, row.start_time, row.end_time, row.break_hours || 0, row.activity || 'Work', row.title, row.project, row.place, row.notes, row.expense_coverage || 0, userId, project_id]
        );
        inserted++;
      }
      res.json({ inserted });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ========== USER SETTINGS ==========
  app.get("/api/settings", async (req, res) => {
    try {
      const userId = (req.query.user_id as string) || 'default';
      const result = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
      if (result.rows.length === 0) {
        const newSettings = await pool.query(
          `INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *`,
          [userId]
        );
        return res.json(newSettings.rows[0]);
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { user_id, paid_break, tax_pct, hourly_rate, timesheet_sender, timesheet_recipient, timesheet_format, theme_mode, view_mode, language } = req.body;
      const userId = user_id || 'default';
      
      const result = await pool.query(
        `INSERT INTO user_settings (user_id, paid_break, tax_pct, hourly_rate, timesheet_sender, timesheet_recipient, timesheet_format, theme_mode, view_mode, language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id) DO UPDATE SET
           paid_break = EXCLUDED.paid_break,
           tax_pct = EXCLUDED.tax_pct,
           hourly_rate = EXCLUDED.hourly_rate,
           timesheet_sender = EXCLUDED.timesheet_sender,
           timesheet_recipient = EXCLUDED.timesheet_recipient,
           timesheet_format = EXCLUDED.timesheet_format,
           theme_mode = EXCLUDED.theme_mode,
           view_mode = EXCLUDED.view_mode,
           language = EXCLUDED.language,
           updated_at = NOW()
         RETURNING *`,
        [userId, paid_break, tax_pct, hourly_rate, timesheet_sender, timesheet_recipient, timesheet_format, theme_mode, view_mode, language]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== PROJECT INFO ==========
  app.get("/api/project-info", async (req, res) => {
    try {
      const userId = (req.query.user_id as string) || 'default';
      const result = await pool.query(
        'SELECT * FROM project_info WHERE user_id = $1 AND is_active = true ORDER BY id DESC',
        [userId]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/project-info", async (req, res) => {
    try {
      const { konsulent, bedrift, oppdragsgiver, tiltak, periode, klient_id, user_id } = req.body;
      const result = await pool.query(
        `INSERT INTO project_info (konsulent, bedrift, oppdragsgiver, tiltak, periode, klient_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [konsulent, bedrift, oppdragsgiver, tiltak, periode, klient_id, user_id || 'default']
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/project-info/:id", async (req, res) => {
    try {
      const { konsulent, bedrift, oppdragsgiver, tiltak, periode, klient_id } = req.body;
      const result = await pool.query(
        `UPDATE project_info SET konsulent=$1, bedrift=$2, oppdragsgiver=$3, tiltak=$4, periode=$5, klient_id=$6, updated_at=NOW()
         WHERE id=$7 RETURNING *`,
        [konsulent, bedrift, oppdragsgiver, tiltak, periode, klient_id, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== QUICK TEMPLATES ==========
  app.get("/api/quick-templates", async (req, res) => {
    try {
      const userId = (req.query.user_id as string) || 'default';
      const result = await pool.query(
        'SELECT * FROM quick_templates WHERE user_id = $1 ORDER BY display_order, id',
        [userId]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/quick-templates", async (req, res) => {
    try {
      const { label, activity, title, project, place, is_favorite, display_order, user_id } = req.body;
      const result = await pool.query(
        `INSERT INTO quick_templates (label, activity, title, project, place, is_favorite, display_order, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [label, activity || 'Work', title, project, place, is_favorite || false, display_order || 0, user_id || 'default']
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/quick-templates/:id", async (req, res) => {
    try {
      await pool.query('DELETE FROM quick_templates WHERE id = $1', [req.params.id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== COMPANIES ==========
  app.get("/api/companies", async (req, res) => {
    try {
      const result = await pool.query('SELECT id, name, display_order FROM companies ORDER BY display_order, name');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const { name } = req.body;
      const result = await pool.query(
        'INSERT INTO companies (name) VALUES ($1) RETURNING *',
        [name]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ========== ADMIN AUTH ==========
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const result = await pool.query(
        'SELECT * FROM admin_users WHERE (username = $1 OR email = $1) AND is_active = true',
        [username]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const admin = result.rows[0];
      const validPassword = await bcrypt.compare(password, admin.password_hash);
      
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      await pool.query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [admin.id]);
      
      const token = jwt.sign(
        { id: admin.id, username: admin.username, role: admin.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.json({
        token,
        admin: { id: admin.id, username: admin.username, email: admin.email, role: admin.role }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/profile", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        'SELECT id, username, email, role, last_login, created_at FROM admin_users WHERE id = $1',
        [req.admin.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Admin not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== COMPANY PORTAL ==========
  app.get("/api/company/users", async (req, res) => {
    try {
      const companyId = req.query.company_id || 1;
      const result = await pool.query(
        `SELECT cu.*, 
          (SELECT json_agg(uc.*) FROM user_cases uc WHERE uc.company_user_id = cu.id) as cases
         FROM company_users cu 
         WHERE cu.company_id = $1 
         ORDER BY cu.created_at DESC`,
        [companyId]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/company/users", async (req, res) => {
    try {
      const { company_id, user_email, role } = req.body;
      const result = await pool.query(
        `INSERT INTO company_users (company_id, user_email, role, approved)
         VALUES ($1, $2, $3, true) RETURNING *`,
        [company_id || 1, user_email, role || 'member']
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/company/users/:id", async (req, res) => {
    try {
      const { role, approved } = req.body;
      const result = await pool.query(
        `UPDATE company_users SET role = COALESCE($1, role), approved = COALESCE($2, approved), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [role, approved, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/company/users/:id", async (req, res) => {
    try {
      await pool.query('DELETE FROM company_users WHERE id = $1', [req.params.id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== COMPANY LOGS ==========
  app.get("/api/company/logs", async (req, res) => {
    try {
      const { company_id, user_email, month, year } = req.query;
      
      let query = `
        SELECT lr.*, cu.user_email, cu.role
        FROM log_row lr
        JOIN company_users cu ON lr.user_id = cu.user_email
        WHERE cu.company_id = $1
      `;
      const params: any[] = [company_id || 1];
      let paramIndex = 2;
      
      if (user_email) {
        query += ` AND cu.user_email = $${paramIndex}`;
        params.push(user_email);
        paramIndex++;
      }
      if (month && year) {
        query += ` AND EXTRACT(MONTH FROM lr.date) = $${paramIndex} AND EXTRACT(YEAR FROM lr.date) = $${paramIndex + 1}`;
        params.push(month, year);
      }
      
      query += ` ORDER BY lr.date DESC, lr.start_time DESC LIMIT 500`;
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== COMPANY AUDIT LOG ==========
  app.get("/api/company/audit", async (req, res) => {
    try {
      const companyId = req.query.company_id || 1;
      const result = await pool.query(
        `SELECT cal.*, cu.user_email as actor_email
         FROM company_audit_log cal
         LEFT JOIN company_users cu ON cal.actor_company_user_id = cu.id
         WHERE cal.company_id = $1
         ORDER BY cal.created_at DESC
         LIMIT 100`,
        [companyId]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: SETUP TABLES ==========
  app.post("/api/cms/setup", async (req, res) => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS site_settings (
          id SERIAL PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          value TEXT,
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS landing_hero (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          title_highlight TEXT,
          subtitle TEXT,
          cta_primary_text TEXT,
          cta_secondary_text TEXT,
          badge1 TEXT,
          badge2 TEXT,
          badge3 TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS landing_features (
          id SERIAL PRIMARY KEY,
          icon TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS landing_testimonials (
          id SERIAL PRIMARY KEY,
          quote TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS landing_cta (
          id SERIAL PRIMARY KEY,
          section_title TEXT,
          features_title TEXT,
          features_subtitle TEXT,
          testimonials_title TEXT,
          testimonials_subtitle TEXT,
          cta_title TEXT,
          cta_subtitle TEXT,
          cta_button_text TEXT,
          contact_title TEXT,
          contact_subtitle TEXT,
          contact_email TEXT,
          contact_phone TEXT,
          contact_address TEXT,
          footer_copyright TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      res.json({ success: true, message: 'CMS tables created successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: SEED DEFAULT CONTENT ==========
  app.post("/api/cms/seed", async (req, res) => {
    try {
      // Check if already seeded
      const heroCheck = await pool.query('SELECT COUNT(*) FROM landing_hero');
      if (parseInt(heroCheck.rows[0].count) > 0) {
        return res.json({ success: true, message: 'Content already seeded' });
      }

      // Seed Hero
      await pool.query(`
        INSERT INTO landing_hero (title, title_highlight, subtitle, cta_primary_text, cta_secondary_text, badge1, badge2, badge3)
        VALUES (
          'Smart Timeføring for',
          'Norske Bedrifter',
          'Effektiv og brukervennlig timeregistrering for konsulenter, prosjektteam og bedrifter. Spar tid på administrasjon og få full kontroll over timene dine.',
          'Start gratis prøveperiode',
          'Les mer',
          'Ingen kredittkort nødvendig',
          '14 dagers gratis prøveperiode',
          'Norsk kundesupport'
        )
      `);

      // Seed Features
      await pool.query(`
        INSERT INTO landing_features (icon, title, description, display_order) VALUES
        ('Clock', 'Enkel Timeføring', 'Registrer timer raskt og enkelt med vår intuitive grensesnitt. Start og stopp tidtaker eller legg inn manuelt.', 0),
        ('Users', 'Team Administrasjon', 'Administrer brukere, roller og tilganger. Inviter nye teammedlemmer og følg opp deres timer.', 1),
        ('FileText', 'Rapporter & Eksport', 'Generer detaljerte rapporter for prosjekter, ansatte eller perioder. Eksporter til Excel eller PDF.', 2),
        ('Shield', 'Godkjenningsflyt', 'Effektiv godkjenningsprosess for innsendte timer. Saksbehandlere kan godkjenne eller avvise med kommentarer.', 3),
        ('BarChart3', 'Analyse & Innsikt', 'Visualiser timeforbruk med grafer og statistikk. Se trender og optimaliser ressursbruk.', 4),
        ('Smartphone', 'Mobilvennlig', 'Responsivt design som fungerer perfekt på alle enheter. Registrer timer hvor som helst.', 5)
      `);

      // Seed Testimonials
      await pool.query(`
        INSERT INTO landing_testimonials (quote, name, role, display_order) VALUES
        ('Smart Timing har forenklet vår timeføring betydelig. Vi sparer mye tid hver måned.', 'Erik Hansen', 'Daglig leder, Konsulentselskap AS', 0),
        ('Rapporteringsfunksjonene er utmerkede. Vi får full oversikt over alle prosjekter.', 'Maria Olsen', 'Prosjektleder, IT Solutions', 1),
        ('Enkel å ta i bruk og god kundeservice. Anbefales på det sterkeste!', 'Anders Berg', 'Økonomisjef, Bygg & Anlegg', 2)
      `);

      // Seed CTA/Sections
      await pool.query(`
        INSERT INTO landing_cta (
          features_title, features_subtitle,
          testimonials_title, testimonials_subtitle,
          cta_title, cta_subtitle, cta_button_text,
          contact_title, contact_subtitle, contact_email, contact_phone, contact_address,
          footer_copyright
        ) VALUES (
          'Alt du trenger for effektiv timeføring',
          'Smart Timing gir deg verktøyene for å registrere, administrere og rapportere timer enkelt og effektivt.',
          'Hva kundene sier',
          'Hundrevis av norske bedrifter bruker Smart Timing for sin timeregistrering.',
          'Klar til å forenkle timeføringen?',
          'Start gratis i dag og opplev forskjellen. Ingen binding, ingen skjulte kostnader.',
          'Kom i gang gratis',
          'Kontakt oss',
          'Har du spørsmål om Smart Timing? Ta kontakt med oss, så hjelper vi deg gjerne.',
          'kontakt@smarttiming.no',
          '+47 22 33 44 55',
          'Oslo, Norge',
          '© 2025 Smart Timing. Alle rettigheter reservert.'
        )
      `);

      res.json({ success: true, message: 'Default content seeded successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: SITE SETTINGS ==========
  app.get("/api/cms/settings", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM site_settings ORDER BY key');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/settings/:key", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      const existing = await pool.query('SELECT * FROM site_settings WHERE key = $1', [key]);
      if (existing.rows.length > 0) {
        const result = await pool.query(
          'UPDATE site_settings SET value = $1, updated_at = NOW() WHERE key = $2 RETURNING *',
          [value, key]
        );
        res.json(result.rows[0]);
      } else {
        const result = await pool.query(
          'INSERT INTO site_settings (key, value) VALUES ($1, $2) RETURNING *',
          [key, value]
        );
        res.json(result.rows[0]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: LANDING HERO ==========
  app.get("/api/cms/hero", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM landing_hero WHERE is_active = true LIMIT 1');
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/hero", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { title, title_highlight, subtitle, cta_primary_text, cta_secondary_text, badge1, badge2, badge3 } = req.body;
      const existing = await pool.query('SELECT * FROM landing_hero WHERE is_active = true LIMIT 1');
      if (existing.rows.length > 0) {
        const result = await pool.query(
          `UPDATE landing_hero SET 
            title = $1, title_highlight = $2, subtitle = $3, 
            cta_primary_text = $4, cta_secondary_text = $5,
            badge1 = $6, badge2 = $7, badge3 = $8, updated_at = NOW()
           WHERE id = $9 RETURNING *`,
          [title, title_highlight, subtitle, cta_primary_text, cta_secondary_text, badge1, badge2, badge3, existing.rows[0].id]
        );
        res.json(result.rows[0]);
      } else {
        const result = await pool.query(
          `INSERT INTO landing_hero (title, title_highlight, subtitle, cta_primary_text, cta_secondary_text, badge1, badge2, badge3)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [title, title_highlight, subtitle, cta_primary_text, cta_secondary_text, badge1, badge2, badge3]
        );
        res.json(result.rows[0]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: LANDING FEATURES ==========
  app.get("/api/cms/features", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM landing_features WHERE is_active = true ORDER BY display_order');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/features", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { icon, title, description, display_order } = req.body;
      const result = await pool.query(
        `INSERT INTO landing_features (icon, title, description, display_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [icon, title, description, display_order || 0]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/cms/features/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { icon, title, description, display_order, is_active } = req.body;
      const result = await pool.query(
        `UPDATE landing_features SET icon = $1, title = $2, description = $3, display_order = $4, is_active = $5, updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [icon, title, description, display_order, is_active ?? true, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Feature not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/features/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query('DELETE FROM landing_features WHERE id = $1', [req.params.id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: LANDING TESTIMONIALS ==========
  app.get("/api/cms/testimonials", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM landing_testimonials WHERE is_active = true ORDER BY display_order');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/testimonials", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { quote, name, role, display_order } = req.body;
      const result = await pool.query(
        `INSERT INTO landing_testimonials (quote, name, role, display_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [quote, name, role, display_order || 0]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/cms/testimonials/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { quote, name, role, display_order, is_active } = req.body;
      const result = await pool.query(
        `UPDATE landing_testimonials SET quote = $1, name = $2, role = $3, display_order = $4, is_active = $5, updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [quote, name, role, display_order, is_active ?? true, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Testimonial not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/testimonials/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query('DELETE FROM landing_testimonials WHERE id = $1', [req.params.id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: LANDING CTA/SECTIONS ==========
  app.get("/api/cms/sections", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM landing_cta WHERE is_active = true LIMIT 1');
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/sections", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { 
        features_title, features_subtitle, 
        testimonials_title, testimonials_subtitle,
        cta_title, cta_subtitle, cta_button_text,
        contact_title, contact_subtitle, contact_email, contact_phone, contact_address,
        footer_copyright 
      } = req.body;
      
      const existing = await pool.query('SELECT * FROM landing_cta WHERE is_active = true LIMIT 1');
      if (existing.rows.length > 0) {
        const result = await pool.query(
          `UPDATE landing_cta SET 
            features_title = $1, features_subtitle = $2,
            testimonials_title = $3, testimonials_subtitle = $4,
            cta_title = $5, cta_subtitle = $6, cta_button_text = $7,
            contact_title = $8, contact_subtitle = $9, contact_email = $10, contact_phone = $11, contact_address = $12,
            footer_copyright = $13, updated_at = NOW()
           WHERE id = $14 RETURNING *`,
          [features_title, features_subtitle, testimonials_title, testimonials_subtitle,
           cta_title, cta_subtitle, cta_button_text,
           contact_title, contact_subtitle, contact_email, contact_phone, contact_address,
           footer_copyright, existing.rows[0].id]
        );
        res.json(result.rows[0]);
      } else {
        const result = await pool.query(
          `INSERT INTO landing_cta (features_title, features_subtitle, testimonials_title, testimonials_subtitle,
            cta_title, cta_subtitle, cta_button_text, contact_title, contact_subtitle, contact_email, contact_phone, contact_address, footer_copyright)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
          [features_title, features_subtitle, testimonials_title, testimonials_subtitle,
           cta_title, cta_subtitle, cta_button_text,
           contact_title, contact_subtitle, contact_email, contact_phone, contact_address, footer_copyright]
        );
        res.json(result.rows[0]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: GET ALL LANDING CONTENT ==========
  app.get("/api/cms/landing", async (req, res) => {
    try {
      const [heroResult, featuresResult, testimonialsResult, sectionsResult] = await Promise.all([
        pool.query('SELECT * FROM landing_hero WHERE is_active = true LIMIT 1'),
        pool.query('SELECT * FROM landing_features WHERE is_active = true ORDER BY display_order'),
        pool.query('SELECT * FROM landing_testimonials WHERE is_active = true ORDER BY display_order'),
        pool.query('SELECT * FROM landing_cta WHERE is_active = true LIMIT 1'),
      ]);
      
      res.json({
        hero: heroResult.rows[0] || null,
        features: featuresResult.rows,
        testimonials: testimonialsResult.rows,
        sections: sectionsResult.rows[0] || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CASE REPORTS ==========
  
  // Setup case_reports table
  app.post("/api/case-reports/setup", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS case_reports (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          user_cases_id INTEGER,
          case_id TEXT NOT NULL,
          month TEXT NOT NULL,
          background TEXT,
          actions TEXT,
          progress TEXT,
          challenges TEXT,
          factors TEXT,
          assessment TEXT,
          recommendations TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          rejection_reason TEXT,
          rejected_by TEXT,
          rejected_at TIMESTAMP,
          approved_by TEXT,
          approved_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      res.json({ success: true, message: 'Case reports table created' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get all case reports for a user
  app.get("/api/case-reports", async (req, res) => {
    try {
      const { user_id } = req.query;
      const userId = user_id || 'default';
      
      const result = await pool.query(
        `SELECT * FROM case_reports WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      res.json({ reports: result.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single case report
  app.get("/api/case-reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM case_reports WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create new case report
  app.post("/api/case-reports", async (req, res) => {
    try {
      const { 
        user_id, user_cases_id, case_id, month, background, actions, 
        progress, challenges, factors, assessment, recommendations, notes 
      } = req.body;
      
      const result = await pool.query(
        `INSERT INTO case_reports 
         (user_id, user_cases_id, case_id, month, background, actions, progress, challenges, factors, assessment, recommendations, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')
         RETURNING *`,
        [user_id || 'default', user_cases_id, case_id, month, background, actions, progress, challenges, factors, assessment, recommendations, notes]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Update case report
  app.put("/api/case-reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        background, actions, progress, challenges, factors, 
        assessment, recommendations, notes, status,
        rejection_reason, rejected_by
      } = req.body;
      
      let query = `UPDATE case_reports SET updated_at = NOW()`;
      const values: any[] = [];
      let paramIndex = 1;
      
      if (background !== undefined) { query += `, background = $${paramIndex++}`; values.push(background); }
      if (actions !== undefined) { query += `, actions = $${paramIndex++}`; values.push(actions); }
      if (progress !== undefined) { query += `, progress = $${paramIndex++}`; values.push(progress); }
      if (challenges !== undefined) { query += `, challenges = $${paramIndex++}`; values.push(challenges); }
      if (factors !== undefined) { query += `, factors = $${paramIndex++}`; values.push(factors); }
      if (assessment !== undefined) { query += `, assessment = $${paramIndex++}`; values.push(assessment); }
      if (recommendations !== undefined) { query += `, recommendations = $${paramIndex++}`; values.push(recommendations); }
      if (notes !== undefined) { query += `, notes = $${paramIndex++}`; values.push(notes); }
      if (status !== undefined) { 
        query += `, status = $${paramIndex++}`; 
        values.push(status);
        if (status === 'rejected') {
          query += `, rejection_reason = $${paramIndex++}, rejected_by = $${paramIndex++}, rejected_at = NOW()`;
          values.push(rejection_reason || '');
          values.push(rejected_by || 'admin');
        } else if (status === 'approved') {
          query += `, approved_at = NOW()`;
        }
      }
      
      query += ` WHERE id = $${paramIndex} RETURNING *`;
      values.push(id);
      
      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete case report
  app.delete("/api/case-reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM case_reports WHERE id = $1', [id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get all reports for review
  app.get("/api/admin/case-reports", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { status } = req.query;
      let query = 'SELECT * FROM case_reports';
      const params: any[] = [];
      
      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }
      query += ' ORDER BY created_at DESC';
      
      const result = await pool.query(query, params);
      res.json({ reports: result.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Approve report
  app.post("/api/admin/case-reports/:id/approve", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `UPDATE case_reports SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`,
        [req.admin?.username || 'admin', id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Reject report
  app.post("/api/admin/case-reports/:id/reject", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const result = await pool.query(
        `UPDATE case_reports SET status = 'rejected', rejection_reason = $1, rejected_by = $2, rejected_at = NOW(), updated_at = NOW() WHERE id = $3 RETURNING *`,
        [reason, req.admin?.username || 'admin', id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log("Smart Timing API routes registered");
}
