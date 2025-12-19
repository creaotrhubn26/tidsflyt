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

  console.log("Smart Timing API routes registered");
}
