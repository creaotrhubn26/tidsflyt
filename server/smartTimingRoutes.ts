import type { Express, Request, Response, NextFunction } from "express";
import { pool } from "./db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";

const JWT_SECRET = process.env.JWT_SECRET || 'smart-timing-secret';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'));
    }
  }
});

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
  
  // Helper function to create a content version (for versioning system)
  async function createContentVersion(contentType: string, contentId: number | null, data: any, changedBy?: string, changeDescription?: string) {
    try {
      const versionResult = await pool.query(
        `SELECT COALESCE(MAX(version_number), 0) as max_version FROM content_versions 
         WHERE content_type = $1 AND (content_id = $2 OR ($2 IS NULL AND content_id IS NULL))`,
        [contentType, contentId]
      );
      const nextVersion = (versionResult.rows[0]?.max_version || 0) + 1;
      
      await pool.query(
        `INSERT INTO content_versions (content_type, content_id, version_number, data, changed_by, change_description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [contentType, contentId, nextVersion, JSON.stringify(data), changedBy, changeDescription]
      );
    } catch (err) {
      console.error('Failed to create content version:', err);
    }
  }
  
  // Serve uploaded files statically
  app.use('/uploads', (req, res, next) => {
    const express = require('express');
    express.static(uploadDir)(req, res, next);
  });

  // Health check
  app.get("/api/health", async (req, res) => {
    try {
      const result = await pool.query('SELECT NOW()');
      res.json({ status: 'ok', timestamp: result.rows[0].now });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: err.message });
    }
  });

  // ========== IMAGE UPLOAD ==========
  app.post("/api/upload", authenticateAdmin, upload.single('image'), (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({ 
        success: true, 
        url: fileUrl,
        filename: req.file.filename
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
          avatar_url TEXT,
          company_logo TEXT,
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
          partners_title TEXT,
          partners_subtitle TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS landing_partners (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          logo_url TEXT NOT NULL,
          website_url TEXT,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS cms_activity_log (
          id SERIAL PRIMARY KEY,
          admin_id INTEGER REFERENCES admin_users(id),
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id INTEGER,
          details TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      
      // Also create admin_users table if not exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT DEFAULT 'admin',
          is_active BOOLEAN DEFAULT TRUE,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Create default admin if none exists, or reset password if exists
      const adminCheck = await pool.query('SELECT COUNT(*) FROM admin_users WHERE username = $1', ['admin']);
      const passwordHash = await bcrypt.hash('admin123', 10);
      if (parseInt(adminCheck.rows[0].count) === 0) {
        await pool.query(
          `INSERT INTO admin_users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
          ['admin', 'admin@smarttiming.no', passwordHash, 'super_admin']
        );
      } else {
        await pool.query(
          `UPDATE admin_users SET password_hash = $1 WHERE username = $2`,
          [passwordHash, 'admin']
        );
      }
      
      res.json({ success: true, message: 'CMS tables created successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: CLEAR TESTIMONIALS ==========
  app.post("/api/cms/clear-testimonials", async (req, res) => {
    try {
      await pool.query('DELETE FROM landing_testimonials WHERE 1=1');
      res.json({ success: true, message: 'All testimonials deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add missing columns to testimonials table
  async function updateTestimonialsTable() {
    try {
      await pool.query(`ALTER TABLE landing_testimonials ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
      await pool.query(`ALTER TABLE landing_testimonials ADD COLUMN IF NOT EXISTS company_logo TEXT`);
    } catch (err) {
      console.error('Error updating testimonials table:', err);
    }
  }
  updateTestimonialsTable();

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

      // Note: Testimonials are NOT seeded - admin must add them via CMS for them to appear

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
      
      // Save version before update
      if (existing.rows.length > 0) {
        await createContentVersion('hero', existing.rows[0].id, existing.rows[0], req.admin?.username, 'Hero updated');
      }
      
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

  app.post("/api/cms/features/reorder", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: 'orderedIds must be an array' });
      }
      for (let i = 0; i < orderedIds.length; i++) {
        await pool.query('UPDATE landing_features SET display_order = $1 WHERE id = $2', [i, orderedIds[i]]);
      }
      res.json({ success: true });
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
      const { quote, name, role, avatar_url, company_logo, display_order } = req.body;
      const result = await pool.query(
        `INSERT INTO landing_testimonials (quote, name, role, avatar_url, company_logo, display_order)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [quote, name, role, avatar_url || null, company_logo || null, display_order || 0]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/cms/testimonials/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { quote, name, role, avatar_url, company_logo, display_order, is_active } = req.body;
      const result = await pool.query(
        `UPDATE landing_testimonials SET quote = $1, name = $2, role = $3, avatar_url = $4, company_logo = $5, display_order = $6, is_active = $7, updated_at = NOW()
         WHERE id = $8 RETURNING *`,
        [quote, name, role, avatar_url || null, company_logo || null, display_order, is_active ?? true, id]
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

  app.post("/api/cms/testimonials/reorder", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: 'orderedIds must be an array' });
      }
      for (let i = 0; i < orderedIds.length; i++) {
        await pool.query('UPDATE landing_testimonials SET display_order = $1 WHERE id = $2', [i, orderedIds[i]]);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: PARTNERS ==========
  app.get("/api/cms/partners", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM landing_partners WHERE is_active = true ORDER BY display_order');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/partners", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, logo_url, website_url, display_order } = req.body;
      const result = await pool.query(
        `INSERT INTO landing_partners (name, logo_url, website_url, display_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, logo_url, website_url || null, display_order || 0]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/cms/partners/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { name, logo_url, website_url, display_order, is_active } = req.body;
      const result = await pool.query(
        `UPDATE landing_partners SET name = $1, logo_url = $2, website_url = $3, display_order = $4, is_active = $5, updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [name, logo_url, website_url || null, display_order, is_active ?? true, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Partner not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/partners/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query('DELETE FROM landing_partners WHERE id = $1', [req.params.id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: ACTIVITY LOG ==========
  app.get("/api/cms/activity-log", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(`
        SELECT cal.*, au.username as admin_username 
        FROM cms_activity_log cal
        LEFT JOIN admin_users au ON cal.admin_id = au.id
        ORDER BY cal.created_at DESC
        LIMIT 100
      `);
      res.json(result.rows);
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
      
      // Save version before update
      if (existing.rows.length > 0) {
        await createContentVersion('sections', existing.rows[0].id, existing.rows[0], req.admin?.username, 'Sections updated');
      }
      
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
      const [heroResult, featuresResult, testimonialsResult, sectionsResult, partnersResult] = await Promise.all([
        pool.query('SELECT * FROM landing_hero WHERE is_active = true LIMIT 1'),
        pool.query('SELECT * FROM landing_features WHERE is_active = true ORDER BY display_order'),
        pool.query('SELECT * FROM landing_testimonials WHERE is_active = true ORDER BY display_order'),
        pool.query('SELECT * FROM landing_cta WHERE is_active = true LIMIT 1'),
        pool.query('SELECT * FROM landing_partners WHERE is_active = true ORDER BY display_order').catch(() => ({ rows: [] })),
      ]);
      
      res.json({
        hero: heroResult.rows[0] || null,
        features: featuresResult.rows,
        testimonials: testimonialsResult.rows,
        sections: sectionsResult.rows[0] || null,
        partners: partnersResult.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: DESIGN TOKENS ==========
  app.get("/api/cms/design-tokens", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM design_tokens WHERE is_active = true LIMIT 1');
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/design-tokens", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const data = req.body;
      const existing = await pool.query('SELECT * FROM design_tokens WHERE is_active = true LIMIT 1');
      
      // Save version before update
      if (existing.rows.length > 0) {
        await createContentVersion('design_tokens', existing.rows[0].id, existing.rows[0], req.admin?.username, 'Design tokens updated');
      }
      
      const columns = [
        'primary_color', 'primary_color_light', 'primary_color_dark', 'secondary_color', 'accent_color',
        'background_color', 'background_color_dark', 'surface_color', 'surface_color_dark',
        'text_color', 'text_color_dark', 'muted_color', 'border_color',
        'font_family', 'font_family_heading', 'font_size_base', 'font_size_scale',
        'line_height_base', 'line_height_heading', 'font_weight_normal', 'font_weight_medium', 'font_weight_bold',
        'letter_spacing', 'letter_spacing_heading',
        'spacing_unit', 'spacing_xs', 'spacing_sm', 'spacing_md', 'spacing_lg', 'spacing_xl', 'spacing_2xl', 'spacing_3xl',
        'border_radius_none', 'border_radius_sm', 'border_radius_md', 'border_radius_lg', 'border_radius_xl', 'border_radius_full', 'border_width',
        'shadow_none', 'shadow_sm', 'shadow_md', 'shadow_lg', 'shadow_xl',
        'animation_duration', 'animation_duration_slow', 'animation_duration_fast', 'animation_easing',
        'enable_animations', 'enable_hover_effects', 'container_max_width', 'container_padding'
      ];
      
      if (existing.rows.length > 0) {
        const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
        const values = columns.map(col => data[col] ?? existing.rows[0][col]);
        values.push(existing.rows[0].id);
        
        const result = await pool.query(
          `UPDATE design_tokens SET ${setClause}, updated_at = NOW() WHERE id = $${columns.length + 1} RETURNING *`,
          values
        );
        res.json(result.rows[0]);
      } else {
        const insertCols = columns.join(', ');
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const values = columns.map(col => data[col] ?? null);
        
        const result = await pool.query(
          `INSERT INTO design_tokens (${insertCols}) VALUES (${placeholders}) RETURNING *`,
          values
        );
        res.json(result.rows[0]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: SECTION DESIGN SETTINGS ==========
  app.get("/api/cms/section-design", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM section_design_settings WHERE is_active = true ORDER BY section_name');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cms/section-design/:section", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM section_design_settings WHERE section_name = $1 AND is_active = true LIMIT 1', [req.params.section]);
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/section-design/:section", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { section } = req.params;
      const data = req.body;
      
      const columns = [
        'layout', 'content_max_width', 'padding_top', 'padding_bottom', 'padding_x', 'gap',
        'background_color', 'background_gradient', 'background_image', 'background_overlay_color',
        'background_overlay_opacity', 'background_blur', 'background_parallax',
        'heading_size', 'heading_weight', 'heading_color', 'text_size', 'text_color',
        'grid_columns', 'grid_columns_tablet', 'grid_columns_mobile', 'grid_gap',
        'card_style', 'card_padding', 'card_radius', 'card_shadow', 'card_background', 'card_border_color', 'card_hover_effect',
        'icon_style', 'icon_size', 'icon_color', 'icon_background',
        'button_variant', 'button_size', 'button_radius',
        'animation_type', 'animation_delay', 'animation_stagger',
        'hero_height', 'hero_video_url', 'hero_video_autoplay', 'hero_video_loop', 'hero_video_muted',
        'testimonial_layout', 'testimonial_avatar_size', 'testimonial_avatar_shape', 'testimonial_quote_style',
        'footer_columns', 'footer_divider', 'footer_divider_color'
      ];
      
      const existing = await pool.query('SELECT * FROM section_design_settings WHERE section_name = $1 LIMIT 1', [section]);
      
      if (existing.rows.length > 0) {
        const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
        const values = columns.map(col => data[col] ?? existing.rows[0][col]);
        values.push(section);
        
        const result = await pool.query(
          `UPDATE section_design_settings SET ${setClause}, updated_at = NOW() WHERE section_name = $${columns.length + 1} RETURNING *`,
          values
        );
        res.json(result.rows[0]);
      } else {
        const insertCols = ['section_name', ...columns].join(', ');
        const placeholders = ['section_name', ...columns].map((_, i) => `$${i + 1}`).join(', ');
        const values = [section, ...columns.map(col => data[col] ?? null)];
        
        const result = await pool.query(
          `INSERT INTO section_design_settings (${insertCols}) VALUES (${placeholders}) RETURNING *`,
          values
        );
        res.json(result.rows[0]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: DESIGN PRESETS ==========
  app.get("/api/cms/design-presets", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM design_presets WHERE is_active = true ORDER BY is_built_in DESC, name');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/design-presets", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, description, tokens, section_settings, thumbnail } = req.body;
      const result = await pool.query(
        `INSERT INTO design_presets (name, description, tokens, section_settings, thumbnail) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, description, JSON.stringify(tokens), section_settings ? JSON.stringify(section_settings) : null, thumbnail]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/design-presets/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, description, tokens, section_settings, thumbnail } = req.body;
      const result = await pool.query(
        `UPDATE design_presets SET name = $1, description = $2, tokens = $3, section_settings = $4, thumbnail = $5, updated_at = NOW() WHERE id = $6 RETURNING *`,
        [name, description, JSON.stringify(tokens), section_settings ? JSON.stringify(section_settings) : null, thumbnail, req.params.id]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/design-presets/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query('DELETE FROM design_presets WHERE id = $1 AND is_built_in = false', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/design-presets/:id/apply", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const preset = await pool.query('SELECT * FROM design_presets WHERE id = $1', [req.params.id]);
      if (preset.rows.length === 0) {
        return res.status(404).json({ error: 'Preset not found' });
      }
      
      const { tokens, section_settings } = preset.rows[0];
      
      // Apply tokens
      if (tokens) {
        const existing = await pool.query('SELECT id FROM design_tokens WHERE is_active = true LIMIT 1');
        if (existing.rows.length > 0) {
          const columns = Object.keys(tokens).filter(k => k !== 'id' && k !== 'updated_at' && k !== 'is_active' && k !== 'name');
          const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
          const values = columns.map(col => tokens[col]);
          values.push(existing.rows[0].id);
          await pool.query(`UPDATE design_tokens SET ${setClause}, updated_at = NOW() WHERE id = $${columns.length + 1}`, values);
        }
      }
      
      // Apply section settings
      if (section_settings) {
        for (const [sectionName, settings] of Object.entries(section_settings as Record<string, any>)) {
          const columns = Object.keys(settings).filter(k => k !== 'id' && k !== 'section_name' && k !== 'updated_at' && k !== 'is_active');
          const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
          const values = columns.map(col => settings[col]);
          values.push(sectionName);
          await pool.query(`UPDATE section_design_settings SET ${setClause}, updated_at = NOW() WHERE section_name = $${columns.length + 1}`, values);
        }
      }
      
      res.json({ success: true, message: 'Preset applied successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== ACCESS REQUESTS ==========
  
  // Create access_requests table if not exists
  async function ensureAccessRequestsTable() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS access_requests (
          id SERIAL PRIMARY KEY,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL,
          org_number TEXT,
          company TEXT,
          phone TEXT,
          message TEXT,
          brreg_verified BOOLEAN DEFAULT FALSE,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      // Add columns if they don't exist (for existing tables)
      await pool.query(`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS org_number TEXT`);
      await pool.query(`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS brreg_verified BOOLEAN DEFAULT FALSE`);
    } catch (err) {
      console.error('Error creating access_requests table:', err);
    }
  }
  ensureAccessRequestsTable();

  // Submit access request (public endpoint)
  app.post("/api/access-requests", async (req, res) => {
    try {
      const { full_name, email, org_number, company, phone, message, brreg_verified } = req.body;
      
      if (!full_name || !email) {
        return res.status(400).json({ error: 'Navn og e-post er påkrevd' });
      }
      
      const result = await pool.query(
        `INSERT INTO access_requests (full_name, email, org_number, company, phone, message, brreg_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [full_name, email, org_number || null, company || null, phone || null, message || null, brreg_verified || false]
      );
      
      res.status(201).json({ success: true, request: result.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get all access requests (admin only)
  app.get("/api/admin/access-requests", authenticateAdmin, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM access_requests ORDER BY created_at DESC');
      res.json({ requests: result.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update access request status (admin only)
  app.patch("/api/admin/access-requests/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const result = await pool.query(
        `UPDATE access_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }
      
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CASE REPORTS ==========
  
  // Helper function to ensure case_reports table exists with correct schema
  async function ensureCaseReportsTable() {
    try {
      // Check if table exists and has correct columns
      const tableCheck = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'case_reports' LIMIT 1
      `);
      
      if (tableCheck.rows.length > 0) {
        // Check if it has user_id column (snake_case)
        const columnCheck = await pool.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'case_reports' AND column_name = 'user_id'
        `);
        
        if (columnCheck.rows.length === 0) {
          // Table exists but with wrong column names (camelCase), drop and recreate
          console.log('Dropping case_reports table with incorrect schema...');
          await pool.query('DROP TABLE IF EXISTS case_reports');
        } else {
          console.log('Case reports table already exists with correct schema');
          return;
        }
      }
      
      // Create table with snake_case columns
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
      console.log('Case reports table created with correct schema');
    } catch (err) {
      console.error('Error ensuring case_reports table:', err);
    }
  }
  
  // Ensure table exists on startup
  ensureCaseReportsTable();

  // Setup case_reports table (admin endpoint)
  app.post("/api/case-reports/setup", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await ensureCaseReportsTable();
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

  // ========== CMS: MEDIA LIBRARY ==========
  app.get("/api/cms/media", async (req, res) => {
    try {
      const { folder_id } = req.query;
      let query = 'SELECT * FROM cms_media';
      const params: any[] = [];
      
      if (folder_id) {
        query += ' WHERE folder_id = $1';
        params.push(folder_id);
      } else {
        query += ' WHERE folder_id IS NULL';
      }
      query += ' ORDER BY created_at DESC';
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cms/media/folders", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM cms_media_folders ORDER BY name');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/media/folders", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, parent_id } = req.body;
      const result = await pool.query(
        'INSERT INTO cms_media_folders (name, parent_id) VALUES ($1, $2) RETURNING *',
        [name, parent_id || null]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/media", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { filename, original_name, mime_type, file_size, url, alt_text, title, folder_id, width, height } = req.body;
      const result = await pool.query(
        `INSERT INTO cms_media (filename, original_name, mime_type, file_size, url, alt_text, title, folder_id, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [filename, original_name, mime_type, file_size, url, alt_text, title, folder_id || null, width, height]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/media/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { alt_text, title, description, folder_id, tags } = req.body;
      const result = await pool.query(
        `UPDATE cms_media SET alt_text = $1, title = $2, description = $3, folder_id = $4, tags = $5, updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [alt_text, title, description, folder_id, tags, id]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/media/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query('DELETE FROM cms_media WHERE id = $1', [req.params.id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: SEO SETTINGS ==========
  app.get("/api/cms/seo/global", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM cms_global_seo LIMIT 1');
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/seo/global", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { site_name, site_description, default_og_image, google_site_verification, bing_site_verification, favicon_url } = req.body;
      const existing = await pool.query('SELECT * FROM cms_global_seo LIMIT 1');
      
      if (existing.rows.length > 0) {
        const result = await pool.query(
          `UPDATE cms_global_seo SET site_name = $1, site_description = $2, default_og_image = $3, 
           google_site_verification = $4, bing_site_verification = $5, favicon_url = $6, updated_at = NOW()
           WHERE id = $7 RETURNING *`,
          [site_name, site_description, default_og_image, google_site_verification, bing_site_verification, favicon_url, existing.rows[0].id]
        );
        res.json(result.rows[0]);
      } else {
        const result = await pool.query(
          `INSERT INTO cms_global_seo (site_name, site_description, default_og_image, google_site_verification, bing_site_verification, favicon_url)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [site_name, site_description, default_og_image, google_site_verification, bing_site_verification, favicon_url]
        );
        res.json(result.rows[0]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cms/seo/:pageType/:pageId?", async (req, res) => {
    try {
      const { pageType, pageId } = req.params;
      const result = await pool.query(
        'SELECT * FROM cms_seo_settings WHERE page_type = $1 AND (page_id = $2 OR ($2 IS NULL AND page_id IS NULL)) LIMIT 1',
        [pageType, pageId || null]
      );
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/seo/:pageType/:pageId?", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { pageType, pageId } = req.params;
      const data = req.body;
      
      const result = await pool.query(
        `INSERT INTO cms_seo_settings (page_type, page_id, meta_title, meta_description, og_title, og_description, og_image, 
         twitter_card, canonical_url, robots, schema_type, schema_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (page_type, page_id) DO UPDATE SET
         meta_title = $3, meta_description = $4, og_title = $5, og_description = $6, og_image = $7,
         twitter_card = $8, canonical_url = $9, robots = $10, schema_type = $11, schema_data = $12, updated_at = NOW()
         RETURNING *`,
        [pageType, pageId || null, data.meta_title, data.meta_description, data.og_title, data.og_description, 
         data.og_image, data.twitter_card, data.canonical_url, data.robots, data.schema_type, data.schema_data]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: FORMS ==========
  app.get("/api/cms/forms", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM cms_forms ORDER BY created_at DESC');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cms/forms/:id", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM cms_forms WHERE id = $1', [req.params.id]);
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/forms", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, description, fields, submit_button_text, success_message, notification_email } = req.body;
      const result = await pool.query(
        `INSERT INTO cms_forms (name, description, fields, submit_button_text, success_message, notification_email)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [name, description, JSON.stringify(fields || []), submit_button_text, success_message, notification_email]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/forms/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, description, fields, submit_button_text, success_message, notification_email, is_active } = req.body;
      const result = await pool.query(
        `UPDATE cms_forms SET name = $1, description = $2, fields = $3, submit_button_text = $4, 
         success_message = $5, notification_email = $6, is_active = $7, updated_at = NOW()
         WHERE id = $8 RETURNING *`,
        [name, description, JSON.stringify(fields || []), submit_button_text, success_message, notification_email, is_active, req.params.id]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/forms/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query('DELETE FROM cms_forms WHERE id = $1', [req.params.id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Form submissions (public endpoint for submitting)
  app.post("/api/forms/:id/submit", async (req, res) => {
    try {
      const formResult = await pool.query('SELECT * FROM cms_forms WHERE id = $1 AND is_active = true', [req.params.id]);
      if (formResult.rows.length === 0) {
        return res.status(404).json({ error: 'Form not found' });
      }
      
      const result = await pool.query(
        `INSERT INTO cms_form_submissions (form_id, data, ip_address, user_agent)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.params.id, JSON.stringify(req.body), req.ip, req.headers['user-agent']]
      );
      res.json({ success: true, message: formResult.rows[0].success_message });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cms/forms/:id/submissions", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM cms_form_submissions WHERE form_id = $1 ORDER BY created_at DESC',
        [req.params.id]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: NAVIGATION ==========
  app.get("/api/cms/navigation", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM cms_navigation WHERE is_active = true ORDER BY location');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cms/navigation/:location", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM cms_navigation WHERE location = $1 AND is_active = true LIMIT 1', [req.params.location]);
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/navigation/:location", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { location } = req.params;
      const { name, items } = req.body;
      
      const existing = await pool.query('SELECT * FROM cms_navigation WHERE location = $1', [location]);
      
      if (existing.rows.length > 0) {
        const result = await pool.query(
          `UPDATE cms_navigation SET name = $1, items = $2, updated_at = NOW() WHERE location = $3 RETURNING *`,
          [name, JSON.stringify(items || []), location]
        );
        res.json(result.rows[0]);
      } else {
        const result = await pool.query(
          `INSERT INTO cms_navigation (name, location, items) VALUES ($1, $2, $3) RETURNING *`,
          [name, location, JSON.stringify(items || [])]
        );
        res.json(result.rows[0]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: BLOG/POSTS ==========
  app.get("/api/cms/posts", async (req, res) => {
    try {
      const { status, category_id } = req.query;
      let query = 'SELECT p.*, c.name as category_name FROM cms_posts p LEFT JOIN cms_categories c ON p.category_id = c.id';
      const conditions: string[] = [];
      const params: any[] = [];
      
      if (status) {
        params.push(status);
        conditions.push(`p.status = $${params.length}`);
      }
      if (category_id) {
        params.push(category_id);
        conditions.push(`p.category_id = $${params.length}`);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY p.created_at DESC';
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cms/posts/:id", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM cms_posts WHERE id = $1', [req.params.id]);
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/posts", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { title, slug, excerpt, content, featured_image, author, category_id, tags, status } = req.body;
      const published_at = status === 'published' ? new Date() : null;
      
      const result = await pool.query(
        `INSERT INTO cms_posts (title, slug, excerpt, content, featured_image, author, category_id, tags, status, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [title, slug, excerpt, content, featured_image, author, category_id, tags, status || 'draft', published_at]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/posts/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { title, slug, excerpt, content, featured_image, author, category_id, tags, status } = req.body;
      const existingPost = await pool.query('SELECT status, published_at FROM cms_posts WHERE id = $1', [req.params.id]);
      let published_at = existingPost.rows[0]?.published_at;
      
      if (status === 'published' && existingPost.rows[0]?.status !== 'published') {
        published_at = new Date();
      }
      
      const result = await pool.query(
        `UPDATE cms_posts SET title = $1, slug = $2, excerpt = $3, content = $4, featured_image = $5, 
         author = $6, category_id = $7, tags = $8, status = $9, published_at = $10, updated_at = NOW()
         WHERE id = $11 RETURNING *`,
        [title, slug, excerpt, content, featured_image, author, category_id, tags, status, published_at, req.params.id]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/posts/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query('DELETE FROM cms_posts WHERE id = $1', [req.params.id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Categories
  app.get("/api/cms/categories", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM cms_categories ORDER BY name');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/categories", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, slug, description, parent_id } = req.body;
      const result = await pool.query(
        'INSERT INTO cms_categories (name, slug, description, parent_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, slug, description, parent_id]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/categories/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query('DELETE FROM cms_categories WHERE id = $1', [req.params.id]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CONTENT VERSIONING ==========

  // Get all content versions (with optional filtering)
  app.get("/api/cms/versions", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { content_type, content_id, limit = 50 } = req.query;
      
      let query = `
        SELECT id, content_type, content_id, version_number, change_description, changed_by, created_at
        FROM content_versions
      `;
      const conditions: string[] = [];
      const params: any[] = [];
      
      if (content_type) {
        params.push(content_type);
        conditions.push(`content_type = $${params.length}`);
      }
      if (content_id) {
        params.push(content_id);
        conditions.push(`content_id = $${params.length}`);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY created_at DESC';
      params.push(limit);
      query += ` LIMIT $${params.length}`;
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get a specific version with full data
  app.get("/api/cms/versions/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM content_versions WHERE id = $1',
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Version not found' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Restore a version
  app.post("/api/cms/versions/:id/restore", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      // Get the version to restore
      const versionResult = await pool.query(
        'SELECT * FROM content_versions WHERE id = $1',
        [req.params.id]
      );
      
      if (versionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Version not found' });
      }
      
      const version = versionResult.rows[0];
      const { content_type, content_id, data } = version;
      const versionData = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Restore based on content type
      let restored = false;
      
      switch (content_type) {
        case 'hero':
          await pool.query(
            `UPDATE landing_hero SET title = $1, title_highlight = $2, subtitle = $3, 
             cta_primary_text = $4, cta_secondary_text = $5, badge1 = $6, badge2 = $7, badge3 = $8, 
             updated_at = NOW() WHERE id = $9`,
            [versionData.title, versionData.title_highlight, versionData.subtitle,
             versionData.cta_primary_text, versionData.cta_secondary_text, 
             versionData.badge1, versionData.badge2, versionData.badge3, content_id || 1]
          );
          restored = true;
          break;
          
        case 'sections':
          await pool.query(
            `UPDATE landing_cta SET features_title = $1, features_subtitle = $2, 
             testimonials_title = $3, testimonials_subtitle = $4, cta_title = $5, 
             cta_subtitle = $6, cta_button_text = $7, contact_title = $8, 
             contact_subtitle = $9, contact_email = $10, contact_phone = $11, 
             contact_address = $12, footer_copyright = $13, updated_at = NOW() WHERE id = $14`,
            [versionData.features_title, versionData.features_subtitle,
             versionData.testimonials_title, versionData.testimonials_subtitle,
             versionData.cta_title, versionData.cta_subtitle, versionData.cta_button_text,
             versionData.contact_title, versionData.contact_subtitle, versionData.contact_email,
             versionData.contact_phone, versionData.contact_address, versionData.footer_copyright,
             content_id || 1]
          );
          restored = true;
          break;
          
        case 'feature':
          await pool.query(
            `UPDATE landing_features SET icon = $1, title = $2, description = $3, 
             display_order = $4, is_active = $5, updated_at = NOW() WHERE id = $6`,
            [versionData.icon, versionData.title, versionData.description,
             versionData.display_order, versionData.is_active, content_id]
          );
          restored = true;
          break;
          
        case 'testimonial':
          await pool.query(
            `UPDATE landing_testimonials SET name = $1, role = $2, company = $3, 
             content = $4, avatar = $5, rating = $6, is_active = $7, updated_at = NOW() WHERE id = $8`,
            [versionData.name, versionData.role, versionData.company,
             versionData.content, versionData.avatar, versionData.rating, versionData.is_active, content_id]
          );
          restored = true;
          break;
          
        case 'design_tokens':
          // Restore design tokens - update all fields
          const tokenFields = Object.keys(versionData).filter(k => k !== 'id' && k !== 'updated_at');
          if (tokenFields.length > 0) {
            const setClause = tokenFields.map((f, i) => `${f.replace(/([A-Z])/g, '_$1').toLowerCase()} = $${i + 1}`).join(', ');
            const values = tokenFields.map(f => versionData[f]);
            values.push(content_id || 1);
            await pool.query(
              `UPDATE design_tokens SET ${setClause}, updated_at = NOW() WHERE id = $${values.length}`,
              values
            );
          }
          restored = true;
          break;
          
        case 'seo':
          await pool.query(
            `UPDATE cms_seo SET meta_title = $1, meta_description = $2, meta_keywords = $3,
             og_title = $4, og_description = $5, og_image = $6, robots = $7,
             canonical_url = $8, structured_data = $9, updated_at = NOW() WHERE id = $10`,
            [versionData.meta_title, versionData.meta_description, versionData.meta_keywords,
             versionData.og_title, versionData.og_description, versionData.og_image,
             versionData.robots, versionData.canonical_url, versionData.structured_data, content_id]
          );
          restored = true;
          break;
          
        case 'blog_post':
          await pool.query(
            `UPDATE cms_posts SET title = $1, slug = $2, excerpt = $3, content = $4,
             featured_image = $5, author = $6, category_id = $7, tags = $8, 
             status = $9, updated_at = NOW() WHERE id = $10`,
            [versionData.title, versionData.slug, versionData.excerpt, versionData.content,
             versionData.featured_image, versionData.author, versionData.category_id,
             versionData.tags, versionData.status, content_id]
          );
          restored = true;
          break;
          
        case 'navigation':
          await pool.query(
            `UPDATE cms_navigation SET name = $1, location = $2, items = $3, 
             updated_at = NOW() WHERE id = $4`,
            [versionData.name, versionData.location, JSON.stringify(versionData.items), content_id]
          );
          restored = true;
          break;
          
        case 'form':
          await pool.query(
            `UPDATE cms_forms SET name = $1, fields = $2, submit_button_text = $3,
             success_message = $4, notification_email = $5, updated_at = NOW() WHERE id = $6`,
            [versionData.name, JSON.stringify(versionData.fields), versionData.submit_button_text,
             versionData.success_message, versionData.notification_email, content_id]
          );
          restored = true;
          break;
      }
      
      if (restored) {
        // Create a new version entry for the restore action
        await createContentVersion(
          content_type, 
          content_id, 
          versionData, 
          req.admin?.username || 'admin',
          `Restored from version ${version.version_number}`
        );
        
        res.json({ success: true, message: `Restored ${content_type} to version ${version.version_number}` });
      } else {
        res.status(400).json({ error: `Cannot restore content type: ${content_type}` });
      }
    } catch (err: any) {
      console.error('Restore error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get version comparison (two versions side by side)
  app.get("/api/cms/versions/compare/:id1/:id2", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM content_versions WHERE id IN ($1, $2) ORDER BY version_number',
        [req.params.id1, req.params.id2]
      );
      
      if (result.rows.length !== 2) {
        return res.status(404).json({ error: 'One or both versions not found' });
      }
      
      res.json({
        older: result.rows[0],
        newer: result.rows[1]
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export the createContentVersion function for use in other routes
  (app as any).createContentVersion = createContentVersion;

  console.log("Smart Timing API routes registered");
}
