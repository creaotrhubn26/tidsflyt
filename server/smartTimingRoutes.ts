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

  // Serve attached assets (logos, images etc.)
  app.use('/assets', (req, res, next) => {
    const express = require('express');
    const path = require('path');
    express.static(path.join(process.cwd(), 'attached_assets'))(req, res, next);
  });

  // Serve Tidsflyt logo for emails (SVG format for best quality)
  app.get("/api/logo", (req, res) => {
    const logoSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50" width="200" height="50">
        <!-- Pocket Watch -->
        <g transform="translate(5, 2)">
          <!-- Watch loop/crown -->
          <ellipse cx="22" cy="4" rx="4" ry="3" fill="none" stroke="#9ca3af" stroke-width="2"/>
          <!-- Watch body -->
          <circle cx="22" cy="25" r="20" fill="url(#watchGradient)" stroke="#9ca3af" stroke-width="1.5"/>
          <!-- Hour markers -->
          <line x1="22" y1="8" x2="22" y2="12" stroke="rgba(255,255,255,0.8)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="22" y1="38" x2="22" y2="42" stroke="rgba(255,255,255,0.8)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="5" y1="25" x2="9" y2="25" stroke="rgba(255,255,255,0.8)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="35" y1="25" x2="39" y2="25" stroke="rgba(255,255,255,0.8)" stroke-width="1.5" stroke-linecap="round"/>
          <!-- Hour hand -->
          <line x1="22" y1="25" x2="22" y2="14" stroke="white" stroke-width="2" stroke-linecap="round"/>
          <!-- Minute hand -->
          <line x1="22" y1="25" x2="32" y2="20" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          <!-- Center dot -->
          <circle cx="22" cy="25" r="2.5" fill="white"/>
        </g>
        <!-- Text -->
        <text x="52" y="33" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="700" fill="#0f172a">Tidsflyt</text>
        <defs>
          <linearGradient id="watchGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1e3a5f"/>
            <stop offset="50%" style="stop-color:#0f2744"/>
            <stop offset="100%" style="stop-color:#1a3350"/>
          </linearGradient>
        </defs>
      </svg>
    `;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(logoSvg.trim());
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
        `SELECT a.*, v.name as vendor_name, v.slug as vendor_slug 
         FROM admin_users a 
         LEFT JOIN vendors v ON a.vendor_id = v.id 
         WHERE (a.username = $1 OR a.email = $1) AND a.is_active = true`,
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
        { 
          id: admin.id, 
          username: admin.username, 
          role: admin.role,
          vendorId: admin.vendor_id,
          vendorName: admin.vendor_name,
          vendorSlug: admin.vendor_slug
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.json({
        token,
        admin: { 
          id: admin.id, 
          username: admin.username, 
          email: admin.email, 
          role: admin.role,
          vendorId: admin.vendor_id,
          vendorName: admin.vendor_name,
          vendorSlug: admin.vendor_slug
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/profile", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT a.id, a.username, a.email, a.role, a.vendor_id, a.last_login, a.created_at,
                v.name as vendor_name, v.slug as vendor_slug
         FROM admin_users a
         LEFT JOIN vendors v ON a.vendor_id = v.id
         WHERE a.id = $1`,
        [req.admin.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Admin not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== VENDOR MANAGEMENT (Super Admin only) ==========
  app.get("/api/vendors", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      // Only super_admin can see all vendors
      if (req.admin.role !== 'super_admin') {
        // Vendor admins can only see their own vendor
        if (!req.admin.vendorId) {
          return res.status(403).json({ error: 'Access denied' });
        }
        const result = await pool.query('SELECT * FROM vendors WHERE id = $1', [req.admin.vendorId]);
        return res.json(result.rows);
      }
      
      const result = await pool.query('SELECT * FROM vendors ORDER BY name');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/vendors/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      
      // Vendor admins can only see their own vendor
      if (req.admin.role !== 'super_admin' && req.admin.vendorId !== vendorId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const result = await pool.query('SELECT * FROM vendors WHERE id = $1', [vendorId]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/vendors", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      // Only super_admin can create vendors
      if (req.admin.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admin can create vendors' });
      }
      
      const { name, slug, email, phone, address, status, maxUsers, subscriptionPlan } = req.body;
      const result = await pool.query(
        `INSERT INTO vendors (name, slug, email, phone, address, status, max_users, subscription_plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [name, slug, email, phone, address, status || 'active', maxUsers || 50, subscriptionPlan || 'standard']
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/vendors/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      
      // Only super_admin can update any vendor, vendor_admin can update their own
      if (req.admin.role !== 'super_admin' && req.admin.vendorId !== vendorId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { name, email, phone, address, logoUrl, status, maxUsers, subscriptionPlan, settings } = req.body;
      const result = await pool.query(
        `UPDATE vendors SET 
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          address = COALESCE($4, address),
          logo_url = COALESCE($5, logo_url),
          status = COALESCE($6, status),
          max_users = COALESCE($7, max_users),
          subscription_plan = COALESCE($8, subscription_plan),
          settings = COALESCE($9, settings),
          updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [name, email, phone, address, logoUrl, status, maxUsers, subscriptionPlan, settings, vendorId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/vendors/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      // Only super_admin can delete vendors
      if (req.admin.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admin can delete vendors' });
      }
      
      const vendorId = parseInt(req.params.id);
      await pool.query('DELETE FROM vendors WHERE id = $1', [vendorId]);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get vendor admins
  app.get("/api/vendors/:id/admins", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      
      if (req.admin.role !== 'super_admin' && req.admin.vendorId !== vendorId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const result = await pool.query(
        `SELECT id, username, email, role, is_active, last_login, created_at 
         FROM admin_users WHERE vendor_id = $1 ORDER BY username`,
        [vendorId]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create vendor admin
  app.post("/api/vendors/:id/admins", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      
      // Only super_admin or vendor_admin of this vendor can create admins
      if (req.admin.role !== 'super_admin' && req.admin.vendorId !== vendorId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { username, email, password } = req.body;
      const passwordHash = await bcrypt.hash(password, 10);
      
      const result = await pool.query(
        `INSERT INTO admin_users (username, email, password_hash, role, vendor_id)
         VALUES ($1, $2, $3, 'vendor_admin', $4) RETURNING id, username, email, role, vendor_id, created_at`,
        [username, email, passwordHash, vendorId]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Create super admin (only existing super_admin)
  app.post("/api/admin/create-super", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      if (req.admin.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admin can create super admins' });
      }
      
      const { username, email, password } = req.body;
      const passwordHash = await bcrypt.hash(password, 10);
      
      const result = await pool.query(
        `INSERT INTO admin_users (username, email, password_hash, role, vendor_id)
         VALUES ($1, $2, $3, 'super_admin', NULL) RETURNING id, username, email, role, created_at`,
        [username, email, passwordHash]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Bootstrap: Create first super admin (only works if no admins exist)
  app.post("/api/admin/bootstrap", async (req, res) => {
    try {
      const existingAdmins = await pool.query('SELECT COUNT(*) as count FROM admin_users');
      if (parseInt(existingAdmins.rows[0].count) > 0) {
        return res.status(403).json({ error: 'Bootstrap only allowed when no admins exist' });
      }
      
      const { username, email, password } = req.body;
      const passwordHash = await bcrypt.hash(password, 10);
      
      const result = await pool.query(
        `INSERT INTO admin_users (username, email, password_hash, role, vendor_id)
         VALUES ($1, $2, $3, 'super_admin', NULL) RETURNING id, username, email, role, created_at`,
        [username, email, passwordHash]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ========== PORTAL SETTINGS ==========
  // Get portal settings (public endpoint for loading portal design)
  app.get("/api/portal/settings", async (req, res) => {
    try {
      const vendorId = req.query.vendor_id || null;
      const result = await pool.query(
        `SELECT * FROM portal_settings WHERE vendor_id IS NOT DISTINCT FROM $1`,
        [vendorId]
      );
      if (result.rows.length === 0) {
        // Return default settings
        const defaultResult = await pool.query(
          `SELECT * FROM portal_settings WHERE vendor_id IS NULL`
        );
        res.json(defaultResult.rows[0] || {
          logo_text: 'Smart Timing',
          primary_color: '#3b82f6',
          accent_color: '#8b5cf6',
          show_branding: true,
          nav_items: []
        });
      } else {
        res.json(result.rows[0]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update portal settings (super_admin or vendor_admin)
  app.put("/api/portal/settings", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const vendorId = req.body.vendor_id || null;
      
      // Only super_admin can update global settings, vendor_admin can update their own
      if (vendorId === null && req.admin.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admin can update global settings' });
      }
      if (vendorId !== null && req.admin.role !== 'super_admin' && req.admin.vendorId !== vendorId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const {
        logo_url, logo_text, primary_color, accent_color,
        sidebar_bg, header_bg, content_bg, footer_bg,
        custom_css, nav_items, footer_text, show_branding,
        tokens, layout
      } = req.body;
      
      const result = await pool.query(
        `INSERT INTO portal_settings (vendor_id, logo_url, logo_text, primary_color, accent_color, sidebar_bg, header_bg, content_bg, footer_bg, custom_css, nav_items, footer_text, show_branding, tokens, layout, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
         ON CONFLICT (vendor_id) DO UPDATE SET
           logo_url = COALESCE($2, portal_settings.logo_url),
           logo_text = COALESCE($3, portal_settings.logo_text),
           primary_color = COALESCE($4, portal_settings.primary_color),
           accent_color = COALESCE($5, portal_settings.accent_color),
           sidebar_bg = COALESCE($6, portal_settings.sidebar_bg),
           header_bg = COALESCE($7, portal_settings.header_bg),
           content_bg = COALESCE($8, portal_settings.content_bg),
           footer_bg = COALESCE($9, portal_settings.footer_bg),
           custom_css = COALESCE($10, portal_settings.custom_css),
           nav_items = COALESCE($11, portal_settings.nav_items),
           footer_text = COALESCE($12, portal_settings.footer_text),
           show_branding = COALESCE($13, portal_settings.show_branding),
           tokens = COALESCE($14, portal_settings.tokens),
           layout = COALESCE($15, portal_settings.layout),
           updated_at = NOW()
         RETURNING *`,
        [vendorId, logo_url, logo_text, primary_color, accent_color, sidebar_bg, header_bg, content_bg, footer_bg, custom_css, JSON.stringify(nav_items || []), footer_text, show_branding, JSON.stringify(tokens || {}), JSON.stringify(layout || {})]
      );
      
      await createContentVersion('portal_settings', result.rows[0].id, result.rows[0], req.admin.username, 'Updated portal settings');
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
        
        CREATE TABLE IF NOT EXISTS cms_pages (
          id SERIAL PRIMARY KEY,
          page_type TEXT NOT NULL UNIQUE,
          content JSONB NOT NULL DEFAULT '{}',
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS why_page_hero (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          title_highlight TEXT,
          subtitle TEXT,
          cta_primary_text TEXT,
          cta_primary_url TEXT,
          cta_secondary_text TEXT,
          cta_secondary_url TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS why_page_stats (
          id SERIAL PRIMARY KEY,
          value TEXT NOT NULL,
          label TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS why_page_benefits (
          id SERIAL PRIMARY KEY,
          icon TEXT DEFAULT 'Clock',
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS why_page_features (
          id SERIAL PRIMARY KEY,
          icon TEXT DEFAULT 'Smartphone',
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS why_page_content (
          id SERIAL PRIMARY KEY,
          section_id TEXT NOT NULL UNIQUE,
          title TEXT,
          subtitle TEXT,
          bullet_points TEXT[] DEFAULT '{}',
          cta_title TEXT,
          cta_subtitle TEXT,
          cta_button_text TEXT,
          cta_button_url TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS feedback_requests (
          id SERIAL PRIMARY KEY,
          vendor_id INTEGER,
          user_id TEXT,
          request_type TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          triggered_at TIMESTAMP DEFAULT NOW(),
          responded_at TIMESTAMP,
          snoozed_until TIMESTAMP,
          metadata JSONB
        );
        
        CREATE TABLE IF NOT EXISTS feedback_responses (
          id SERIAL PRIMARY KEY,
          request_id INTEGER NOT NULL,
          vendor_id INTEGER,
          user_id TEXT,
          rating_score INTEGER,
          nps_score INTEGER,
          satisfaction_label TEXT,
          textual_feedback TEXT,
          submitted_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS vendors (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE,
          email TEXT,
          phone TEXT,
          address TEXT,
          logo_url TEXT,
          status TEXT DEFAULT 'active',
          settings JSONB DEFAULT '{}',
          max_users INTEGER DEFAULT 50,
          subscription_plan TEXT DEFAULT 'standard',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          api_access_enabled BOOLEAN DEFAULT FALSE,
          api_subscription_start TIMESTAMP,
          api_subscription_end TIMESTAMP,
          api_monthly_price DECIMAL(10,2) DEFAULT 99.00
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
          vendor_id INTEGER REFERENCES vendors(id),
          is_active BOOLEAN DEFAULT TRUE,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Add vendor_id column if it doesn't exist (for existing tables)
      await pool.query(`
        ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES vendors(id);
        ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
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

  // ========== CMS: PAGES (Contact, Privacy, Terms) ==========
  const getPageDefaults = (pageType: string) => {
    const defaults: Record<string, any> = {
      contact: {
        title: 'Kontakt oss',
        subtitle: 'Har du spørsmål? Vi hjelper deg gjerne.',
        content: 'Fyll ut skjemaet nedenfor, så tar vi kontakt med deg så snart som mulig.',
        email: 'kontakt@tidsflyt.no',
        phone: '+47 97 95 92 94',
        address: 'Oslo, Norge'
      },
      privacy: {
        title: 'Personvernerklæring',
        subtitle: 'Slik beskytter vi dine personopplysninger',
        content: '## 1. Innledning\nTidsflyt er opptatt av å beskytte personvernet til våre brukere.',
        last_updated: new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
      },
      terms: {
        title: 'Brukervilkår',
        subtitle: 'Vilkår for bruk av Tidsflyt',
        content: '## 1. Aksept av vilkår\nVed å bruke Tidsflyt aksepterer du disse brukervilkårene.',
        last_updated: new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
      }
    };
    return defaults[pageType];
  };

  app.get("/api/cms/pages/:pageType", async (req, res) => {
    try {
      const { pageType } = req.params;
      const validTypes = ['contact', 'privacy', 'terms'];
      if (!validTypes.includes(pageType)) {
        return res.status(400).json({ error: 'Invalid page type' });
      }
      
      try {
        const result = await pool.query(
          'SELECT * FROM cms_pages WHERE page_type = $1 AND is_active = true LIMIT 1',
          [pageType]
        );
        
        if (result.rows.length === 0) {
          return res.json(getPageDefaults(pageType));
        }
        
        res.json(result.rows[0].content);
      } catch (dbErr: any) {
        if (dbErr.message?.includes('does not exist')) {
          return res.json(getPageDefaults(pageType));
        }
        throw dbErr;
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/pages/:pageType", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { pageType } = req.params;
      const validTypes = ['contact', 'privacy', 'terms'];
      if (!validTypes.includes(pageType)) {
        return res.status(400).json({ error: 'Invalid page type' });
      }
      
      const content = req.body;
      
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS cms_pages (
            id SERIAL PRIMARY KEY,
            page_type TEXT NOT NULL UNIQUE,
            content JSONB NOT NULL DEFAULT '{}',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
      } catch (e) {}
      
      const existing = await pool.query(
        'SELECT * FROM cms_pages WHERE page_type = $1',
        [pageType]
      );
      
      if (existing.rows.length > 0) {
        await createContentVersion('cms_pages', existing.rows[0].id, existing.rows[0].content, req.admin?.username, `${pageType} page updated`);
        
        const result = await pool.query(
          'UPDATE cms_pages SET content = $1, updated_at = NOW() WHERE page_type = $2 RETURNING *',
          [JSON.stringify(content), pageType]
        );
        res.json(result.rows[0].content);
      } else {
        const result = await pool.query(
          'INSERT INTO cms_pages (page_type, content) VALUES ($1, $2) RETURNING *',
          [pageType, JSON.stringify(content)]
        );
        res.json(result.rows[0].content);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: GET ALL LANDING CONTENT ==========
  app.get("/api/cms/landing", async (req, res) => {
    try {
      const [heroResult, featuresResult, testimonialsResult, sectionsResult, partnersResult, vendorsResult] = await Promise.all([
        pool.query('SELECT * FROM landing_hero WHERE is_active = true LIMIT 1'),
        pool.query('SELECT * FROM landing_features WHERE is_active = true ORDER BY display_order'),
        pool.query('SELECT * FROM landing_testimonials WHERE is_active = true ORDER BY display_order'),
        pool.query('SELECT * FROM landing_cta WHERE is_active = true LIMIT 1'),
        pool.query('SELECT * FROM landing_partners WHERE is_active = true ORDER BY display_order').catch(() => ({ rows: [] })),
        pool.query("SELECT id, name, logo_url, website_url FROM vendors WHERE status = 'active' ORDER BY name").catch(() => ({ rows: [] })),
      ]);
      
      res.json({
        hero: heroResult.rows[0] || null,
        features: featuresResult.rows,
        testimonials: testimonialsResult.rows,
        sections: sectionsResult.rows[0] || null,
        partners: partnersResult.rows,
        clients: vendorsResult.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== CMS: WHY PAGE ==========
  
  // Get all Why page content
  app.get("/api/cms/why-page", async (req, res) => {
    try {
      const [heroResult, statsResult, benefitsResult, featuresResult, nordicResult, trustResult, ctaResult] = await Promise.all([
        pool.query('SELECT * FROM why_page_hero WHERE is_active = true LIMIT 1'),
        pool.query('SELECT * FROM why_page_stats WHERE is_active = true ORDER BY display_order'),
        pool.query('SELECT * FROM why_page_benefits WHERE is_active = true ORDER BY display_order'),
        pool.query('SELECT * FROM why_page_features WHERE is_active = true ORDER BY display_order'),
        pool.query("SELECT * FROM why_page_content WHERE section_id = 'nordic' LIMIT 1").catch(() => ({ rows: [] })),
        pool.query("SELECT * FROM why_page_content WHERE section_id = 'trust' LIMIT 1").catch(() => ({ rows: [] })),
        pool.query("SELECT * FROM why_page_content WHERE section_id = 'cta' LIMIT 1").catch(() => ({ rows: [] })),
      ]);
      
      res.json({
        hero: heroResult.rows[0] || null,
        stats: statsResult.rows,
        benefits: benefitsResult.rows,
        features: featuresResult.rows,
        nordic: nordicResult.rows[0] || null,
        trust: trustResult.rows[0] || null,
        cta: ctaResult.rows[0] || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Why Page Hero
  app.get("/api/cms/why-page/hero", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM why_page_hero WHERE is_active = true LIMIT 1');
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/why-page/hero", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { title, title_highlight, subtitle, cta_primary_text, cta_primary_url, cta_secondary_text, cta_secondary_url } = req.body;
      const existing = await pool.query('SELECT * FROM why_page_hero WHERE is_active = true LIMIT 1');
      
      if (existing.rows.length > 0) {
        const result = await pool.query(
          `UPDATE why_page_hero SET 
            title = $1, title_highlight = $2, subtitle = $3, 
            cta_primary_text = $4, cta_primary_url = $5,
            cta_secondary_text = $6, cta_secondary_url = $7, updated_at = NOW()
          WHERE id = $8 RETURNING *`,
          [title, title_highlight, subtitle, cta_primary_text, cta_primary_url, cta_secondary_text, cta_secondary_url, existing.rows[0].id]
        );
        res.json(result.rows[0]);
      } else {
        const result = await pool.query(
          `INSERT INTO why_page_hero (title, title_highlight, subtitle, cta_primary_text, cta_primary_url, cta_secondary_text, cta_secondary_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [title, title_highlight, subtitle, cta_primary_text, cta_primary_url, cta_secondary_text, cta_secondary_url]
        );
        res.json(result.rows[0]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Why Page Stats CRUD
  app.get("/api/cms/why-page/stats", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM why_page_stats WHERE is_active = true ORDER BY display_order');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/why-page/stats", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { value, label, display_order } = req.body;
      const result = await pool.query(
        'INSERT INTO why_page_stats (value, label, display_order) VALUES ($1, $2, $3) RETURNING *',
        [value, label, display_order || 0]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/why-page/stats/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { value, label, display_order } = req.body;
      const result = await pool.query(
        'UPDATE why_page_stats SET value = $1, label = $2, display_order = $3 WHERE id = $4 RETURNING *',
        [value, label, display_order, id]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/why-page/stats/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      await pool.query('UPDATE why_page_stats SET is_active = false WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Why Page Benefits CRUD
  app.get("/api/cms/why-page/benefits", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM why_page_benefits WHERE is_active = true ORDER BY display_order');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/why-page/benefits", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { icon, title, description, display_order } = req.body;
      const result = await pool.query(
        'INSERT INTO why_page_benefits (icon, title, description, display_order) VALUES ($1, $2, $3, $4) RETURNING *',
        [icon || 'Clock', title, description, display_order || 0]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/why-page/benefits/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { icon, title, description, display_order } = req.body;
      const result = await pool.query(
        'UPDATE why_page_benefits SET icon = $1, title = $2, description = $3, display_order = $4 WHERE id = $5 RETURNING *',
        [icon, title, description, display_order, id]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/why-page/benefits/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      await pool.query('UPDATE why_page_benefits SET is_active = false WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Why Page Features CRUD
  app.get("/api/cms/why-page/features", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM why_page_features WHERE is_active = true ORDER BY display_order');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cms/why-page/features", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { icon, title, description, display_order } = req.body;
      const result = await pool.query(
        'INSERT INTO why_page_features (icon, title, description, display_order) VALUES ($1, $2, $3, $4) RETURNING *',
        [icon || 'Smartphone', title, description, display_order || 0]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/why-page/features/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { icon, title, description, display_order } = req.body;
      const result = await pool.query(
        'UPDATE why_page_features SET icon = $1, title = $2, description = $3, display_order = $4 WHERE id = $5 RETURNING *',
        [icon, title, description, display_order, id]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cms/why-page/features/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      await pool.query('UPDATE why_page_features SET is_active = false WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Why Page Content Sections (Nordic, Trust, CTA)
  app.get("/api/cms/why-page/content/:sectionId", async (req, res) => {
    try {
      const { sectionId } = req.params;
      const result = await pool.query('SELECT * FROM why_page_content WHERE section_id = $1 LIMIT 1', [sectionId]);
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cms/why-page/content/:sectionId", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { sectionId } = req.params;
      const { title, subtitle, bullet_points, cta_title, cta_subtitle, cta_button_text, cta_button_url } = req.body;
      
      const existing = await pool.query('SELECT * FROM why_page_content WHERE section_id = $1 LIMIT 1', [sectionId]);
      
      if (existing.rows.length > 0) {
        const result = await pool.query(
          `UPDATE why_page_content SET 
            title = $1, subtitle = $2, bullet_points = $3, 
            cta_title = $4, cta_subtitle = $5, cta_button_text = $6, cta_button_url = $7, updated_at = NOW()
          WHERE section_id = $8 RETURNING *`,
          [title, subtitle, bullet_points, cta_title, cta_subtitle, cta_button_text, cta_button_url, sectionId]
        );
        res.json(result.rows[0]);
      } else {
        const result = await pool.query(
          `INSERT INTO why_page_content (section_id, title, subtitle, bullet_points, cta_title, cta_subtitle, cta_button_text, cta_button_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [sectionId, title, subtitle, bullet_points, cta_title, cta_subtitle, cta_button_text, cta_button_url]
        );
        res.json(result.rows[0]);
      }
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
          vendor_id INTEGER,
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

  // ========== REPORT COMMENTS (Feedback Workflow) ==========
  
  // Ensure report_comments table exists
  async function ensureReportCommentsTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_comments (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL,
        author_id TEXT NOT NULL,
        author_name TEXT,
        author_role TEXT DEFAULT 'user',
        content TEXT NOT NULL,
        is_internal BOOLEAN DEFAULT false,
        parent_id INTEGER,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  }
  ensureReportCommentsTable();

  // Get comments for a report (user must own the report or be admin)
  app.get("/api/case-reports/:id/comments", async (req, res) => {
    try {
      const { id } = req.params;
      const { include_internal, user_id } = req.query;
      
      // Verify user owns this report (basic auth check)
      if (user_id) {
        const reportCheck = await pool.query('SELECT user_id FROM case_reports WHERE id = $1', [id]);
        if (reportCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Report not found' });
        }
        if (reportCheck.rows[0].user_id !== user_id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
      
      let query = `SELECT * FROM report_comments WHERE report_id = $1`;
      if (!include_internal) {
        query += ` AND is_internal = false`;
      }
      query += ` ORDER BY created_at ASC`;
      
      const result = await pool.query(query, [id]);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add comment to a report (user must own the report)
  app.post("/api/case-reports/:id/comments", async (req, res) => {
    try {
      const { id } = req.params;
      const { author_id, author_name, author_role, content, is_internal, parent_id } = req.body;
      
      if (!content || !author_id) {
        return res.status(400).json({ error: 'Content and author_id are required' });
      }

      // Validate content length
      if (content.length > 5000) {
        return res.status(400).json({ error: 'Comment too long (max 5000 characters)' });
      }
      
      // Verify user owns this report
      const reportCheck = await pool.query('SELECT user_id FROM case_reports WHERE id = $1', [id]);
      if (reportCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }
      if (reportCheck.rows[0].user_id !== author_id) {
        return res.status(403).json({ error: 'Access denied - you can only comment on your own reports' });
      }

      // Users cannot add internal notes
      const finalIsInternal = author_role === 'admin' ? (is_internal || false) : false;
      
      const result = await pool.query(
        `INSERT INTO report_comments (report_id, author_id, author_name, author_role, content, is_internal, parent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [id, author_id, author_name, author_role || 'user', content, finalIsInternal, parent_id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Mark comments as read (user must own the report)
  app.post("/api/case-reports/:id/comments/mark-read", async (req, res) => {
    try {
      const { id } = req.params;
      const { reader_id } = req.body;

      if (!reader_id) {
        return res.status(400).json({ error: 'reader_id required' });
      }
      
      // Verify user owns this report
      const reportCheck = await pool.query('SELECT user_id FROM case_reports WHERE id = $1', [id]);
      if (reportCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }
      if (reportCheck.rows[0].user_id !== reader_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      await pool.query(
        `UPDATE report_comments SET read_at = NOW() WHERE report_id = $1 AND author_id != $2 AND read_at IS NULL`,
        [id, reader_id]
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get unread comment count for a user
  app.get("/api/case-reports/unread-count", async (req, res) => {
    try {
      const { user_id } = req.query;
      if (!user_id) {
        return res.status(400).json({ error: 'user_id required' });
      }
      
      // Get reports owned by user that have unread comments from others
      const result = await pool.query(`
        SELECT COUNT(DISTINCT rc.id) as unread_count
        FROM report_comments rc
        JOIN case_reports cr ON rc.report_id = cr.id
        WHERE cr.user_id = $1 AND rc.author_id != $1 AND rc.read_at IS NULL AND rc.is_internal = false
      `, [user_id]);
      
      res.json({ unread_count: parseInt(result.rows[0].unread_count) || 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Submit report for review (change status from draft to pending)
  app.post("/api/case-reports/:id/submit", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `UPDATE case_reports SET status = 'pending', updated_at = NOW() WHERE id = $1 AND status IN ('draft', 'rejected') RETURNING *`,
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Report not found or cannot be submitted' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Add feedback comment and optionally request revision
  app.post("/api/admin/case-reports/:id/feedback", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { content, request_revision, is_internal } = req.body;
      
      // Add comment
      if (content) {
        await pool.query(
          `INSERT INTO report_comments (report_id, author_id, author_name, author_role, content, is_internal)
           VALUES ($1, $2, $3, 'admin', $4, $5)`,
          [id, req.admin?.username || 'admin', req.admin?.username || 'Administrator', content, is_internal || false]
        );
      }
      
      // Optionally set status to needs_revision
      if (request_revision) {
        await pool.query(
          `UPDATE case_reports SET status = 'needs_revision', updated_at = NOW() WHERE id = $1`,
          [id]
        );
      }
      
      const report = await pool.query('SELECT * FROM case_reports WHERE id = $1', [id]);
      res.json(report.rows[0]);
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

  // ============================================
  // GA4 Analytics Settings API
  // ============================================

  // Get analytics settings
  app.get("/api/cms/analytics", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query('SELECT * FROM analytics_settings WHERE id = 1');
      if (result.rows.length === 0) {
        // Create default settings
        const insertResult = await pool.query(
          `INSERT INTO analytics_settings (id, enable_tracking, enable_page_views, enable_events, enable_consent_mode) 
           VALUES (1, false, true, true, true) RETURNING *`
        );
        return res.json(insertResult.rows[0]);
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update analytics settings
  app.put("/api/cms/analytics", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const {
        ga4_measurement_id, ga4_stream_id, enable_tracking, enable_page_views,
        enable_events, enable_consent_mode, cookie_consent, excluded_paths, custom_events
      } = req.body;

      const result = await pool.query(
        `INSERT INTO analytics_settings (id, ga4_measurement_id, ga4_stream_id, enable_tracking, 
         enable_page_views, enable_events, enable_consent_mode, cookie_consent, excluded_paths, 
         custom_events, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (id) DO UPDATE SET
         ga4_measurement_id = EXCLUDED.ga4_measurement_id,
         ga4_stream_id = EXCLUDED.ga4_stream_id,
         enable_tracking = EXCLUDED.enable_tracking,
         enable_page_views = EXCLUDED.enable_page_views,
         enable_events = EXCLUDED.enable_events,
         enable_consent_mode = EXCLUDED.enable_consent_mode,
         cookie_consent = EXCLUDED.cookie_consent,
         excluded_paths = EXCLUDED.excluded_paths,
         custom_events = EXCLUDED.custom_events,
         updated_at = NOW()
         RETURNING *`,
        [ga4_measurement_id, ga4_stream_id, enable_tracking, enable_page_views,
         enable_events, enable_consent_mode, cookie_consent, excluded_paths, 
         custom_events ? JSON.stringify(custom_events) : null]
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public endpoint to get GA4 tracking code
  app.get("/api/analytics/config", async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT ga4_measurement_id, enable_tracking, enable_page_views, enable_events, enable_consent_mode, cookie_consent FROM analytics_settings WHERE id = 1 AND is_active = true'
      );
      if (result.rows.length === 0 || !result.rows[0].enable_tracking) {
        return res.json({ enabled: false });
      }
      res.json({ enabled: true, ...result.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // SEO Global Settings API
  // ============================================

  // Get global SEO settings
  app.get("/api/cms/seo/global", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query('SELECT * FROM seo_global_settings WHERE id = 1');
      if (result.rows.length === 0) {
        const insertResult = await pool.query(
          `INSERT INTO seo_global_settings (id, site_name, sitemap_enabled, sitemap_auto_generate) 
           VALUES (1, 'Smart Timing', true, true) RETURNING *`
        );
        return res.json(insertResult.rows[0]);
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update global SEO settings
  app.put("/api/cms/seo/global", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const {
        site_name, site_description, default_og_image, favicon_url,
        google_verification, bing_verification, robots_txt, sitemap_enabled, sitemap_auto_generate
      } = req.body;

      const result = await pool.query(
        `INSERT INTO seo_global_settings (id, site_name, site_description, default_og_image, 
         favicon_url, google_verification, bing_verification, robots_txt, sitemap_enabled, 
         sitemap_auto_generate, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (id) DO UPDATE SET
         site_name = EXCLUDED.site_name,
         site_description = EXCLUDED.site_description,
         default_og_image = EXCLUDED.default_og_image,
         favicon_url = EXCLUDED.favicon_url,
         google_verification = EXCLUDED.google_verification,
         bing_verification = EXCLUDED.bing_verification,
         robots_txt = EXCLUDED.robots_txt,
         sitemap_enabled = EXCLUDED.sitemap_enabled,
         sitemap_auto_generate = EXCLUDED.sitemap_auto_generate,
         updated_at = NOW()
         RETURNING *`,
        [site_name, site_description, default_og_image, favicon_url,
         google_verification, bing_verification, robots_txt, sitemap_enabled, sitemap_auto_generate]
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // SEO Pages API
  // ============================================

  // Get all SEO pages
  app.get("/api/cms/seo/pages", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query('SELECT * FROM seo_pages ORDER BY page_path');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create SEO page
  app.post("/api/cms/seo/pages", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const {
        page_path, title, meta_description, meta_keywords, canonical_url,
        og_title, og_description, og_image, og_type, twitter_card, twitter_title,
        twitter_description, twitter_image, robots_index, robots_follow,
        structured_data, priority, change_frequency
      } = req.body;

      const result = await pool.query(
        `INSERT INTO seo_pages (page_path, title, meta_description, meta_keywords, canonical_url,
         og_title, og_description, og_image, og_type, twitter_card, twitter_title,
         twitter_description, twitter_image, robots_index, robots_follow, structured_data, 
         priority, change_frequency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [page_path, title, meta_description, meta_keywords, canonical_url,
         og_title, og_description, og_image, og_type || 'website', twitter_card || 'summary_large_image',
         twitter_title, twitter_description, twitter_image, robots_index ?? true, robots_follow ?? true,
         structured_data ? JSON.stringify(structured_data) : null, priority || 0.5, change_frequency || 'weekly']
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update SEO page
  app.put("/api/cms/seo/pages/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const {
        page_path, title, meta_description, meta_keywords, canonical_url,
        og_title, og_description, og_image, og_type, twitter_card, twitter_title,
        twitter_description, twitter_image, robots_index, robots_follow,
        structured_data, priority, change_frequency, is_active
      } = req.body;

      const result = await pool.query(
        `UPDATE seo_pages SET page_path = $1, title = $2, meta_description = $3, 
         meta_keywords = $4, canonical_url = $5, og_title = $6, og_description = $7,
         og_image = $8, og_type = $9, twitter_card = $10, twitter_title = $11,
         twitter_description = $12, twitter_image = $13, robots_index = $14, robots_follow = $15,
         structured_data = $16, priority = $17, change_frequency = $18, is_active = $19, updated_at = NOW()
         WHERE id = $20 RETURNING *`,
        [page_path, title, meta_description, meta_keywords, canonical_url,
         og_title, og_description, og_image, og_type, twitter_card, twitter_title,
         twitter_description, twitter_image, robots_index, robots_follow,
         structured_data ? JSON.stringify(structured_data) : null, priority, change_frequency,
         is_active, req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'SEO page not found' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete SEO page
  app.delete("/api/cms/seo/pages/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query('DELETE FROM seo_pages WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public endpoint to get SEO for a page
  app.get("/api/seo/page", async (req, res) => {
    try {
      const path = req.query.path as string || '/';
      const result = await pool.query(
        'SELECT * FROM seo_pages WHERE page_path = $1 AND is_active = true',
        [path]
      );
      if (result.rows.length === 0) {
        return res.json(null);
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // Sitemap Generation API
  // ============================================

  // Generate sitemap.xml
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const globalSettings = await pool.query(
        'SELECT sitemap_enabled FROM seo_global_settings WHERE id = 1'
      );
      
      if (globalSettings.rows.length === 0 || !globalSettings.rows[0].sitemap_enabled) {
        return res.status(404).send('Sitemap disabled');
      }

      const pages = await pool.query(
        'SELECT page_path, priority, change_frequency, updated_at FROM seo_pages WHERE is_active = true AND robots_index = true'
      );

      const baseUrl = `https://${req.get('host')}`;
      
      let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
      sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
      
      // Add static pages
      const staticPages = ['/', '/login', '/register'];
      for (const page of staticPages) {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}${page}</loc>\n`;
        sitemap += '    <changefreq>weekly</changefreq>\n';
        sitemap += '    <priority>0.8</priority>\n';
        sitemap += '  </url>\n';
      }

      // Add dynamic SEO pages
      for (const page of pages.rows) {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}${page.page_path}</loc>\n`;
        if (page.updated_at) {
          sitemap += `    <lastmod>${new Date(page.updated_at).toISOString().split('T')[0]}</lastmod>\n`;
        }
        sitemap += `    <changefreq>${page.change_frequency || 'weekly'}</changefreq>\n`;
        sitemap += `    <priority>${page.priority || 0.5}</priority>\n`;
        sitemap += '  </url>\n';
      }

      // Add blog posts if they exist
      try {
        const posts = await pool.query(
          "SELECT slug, updated_at FROM cms_posts WHERE status = 'published'"
        );
        for (const post of posts.rows) {
          sitemap += '  <url>\n';
          sitemap += `    <loc>${baseUrl}/blog/${post.slug}</loc>\n`;
          if (post.updated_at) {
            sitemap += `    <lastmod>${new Date(post.updated_at).toISOString().split('T')[0]}</lastmod>\n`;
          }
          sitemap += '    <changefreq>monthly</changefreq>\n';
          sitemap += '    <priority>0.6</priority>\n';
          sitemap += '  </url>\n';
        }
      } catch (e) {
        // cms_posts table might not exist
      }

      sitemap += '</urlset>';

      // Update last generated timestamp
      await pool.query(
        'UPDATE seo_global_settings SET last_sitemap_generated = NOW() WHERE id = 1'
      );

      res.set('Content-Type', 'application/xml');
      res.send(sitemap);
    } catch (err: any) {
      res.status(500).send('Error generating sitemap');
    }
  });

  // ============================================
  // Robots.txt API
  // ============================================

  app.get("/robots.txt", async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT robots_txt FROM seo_global_settings WHERE id = 1'
      );

      let robotsTxt = '';
      if (result.rows.length > 0 && result.rows[0].robots_txt) {
        robotsTxt = result.rows[0].robots_txt;
      } else {
        // Default robots.txt
        robotsTxt = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /cms/
Disallow: /dashboard/

Sitemap: https://${req.get('host')}/sitemap.xml`;
      }

      res.set('Content-Type', 'text/plain');
      res.send(robotsTxt);
    } catch (err: any) {
      res.status(500).send('Error generating robots.txt');
    }
  });

  // ============================================
  // Email Templates API
  // ============================================

  // Get all email templates
  app.get("/api/cms/email/templates", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query('SELECT * FROM email_templates ORDER BY category, name');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single email template
  app.get("/api/cms/email/templates/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create email template
  app.post("/api/cms/email/templates", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, slug, subject, html_content, text_content, variables, category } = req.body;

      const result = await pool.query(
        `INSERT INTO email_templates (name, slug, subject, html_content, text_content, variables, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [name, slug, subject, html_content, text_content, variables, category || 'general']
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update email template
  app.put("/api/cms/email/templates/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, slug, subject, html_content, text_content, variables, category, is_active } = req.body;

      const result = await pool.query(
        `UPDATE email_templates SET name = $1, slug = $2, subject = $3, html_content = $4,
         text_content = $5, variables = $6, category = $7, is_active = $8, updated_at = NOW()
         WHERE id = $9 RETURNING *`,
        [name, slug, subject, html_content, text_content, variables, category, is_active, req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete email template
  app.delete("/api/cms/email/templates/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      await pool.query('DELETE FROM email_templates WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // Email Settings API
  // ============================================

  // Get email settings
  app.get("/api/cms/email/settings", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query('SELECT * FROM email_settings WHERE id = 1');
      if (result.rows.length === 0) {
        const insertResult = await pool.query(
          `INSERT INTO email_settings (id, provider, smtp_host, smtp_port, smtp_secure) 
           VALUES (1, 'smtp', 'smtp.gmail.com', 587, false) RETURNING *`
        );
        return res.json(insertResult.rows[0]);
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update email settings
  app.put("/api/cms/email/settings", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { provider, smtp_host, smtp_port, smtp_secure, smtp_user, from_email, from_name, reply_to_email } = req.body;

      const result = await pool.query(
        `INSERT INTO email_settings (id, provider, smtp_host, smtp_port, smtp_secure, smtp_user, 
         from_email, from_name, reply_to_email, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO UPDATE SET
         provider = EXCLUDED.provider,
         smtp_host = EXCLUDED.smtp_host,
         smtp_port = EXCLUDED.smtp_port,
         smtp_secure = EXCLUDED.smtp_secure,
         smtp_user = EXCLUDED.smtp_user,
         from_email = EXCLUDED.from_email,
         from_name = EXCLUDED.from_name,
         reply_to_email = EXCLUDED.reply_to_email,
         updated_at = NOW()
         RETURNING *`,
        [provider, smtp_host, smtp_port, smtp_secure, smtp_user, from_email, from_name, reply_to_email]
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // Contact Form Submission (with spam protection)
  // ============================================

  // Rate limiting store for contact form
  const contactRateLimiter = new Map<string, { count: number; resetTime: number }>();

  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, company, orgNumber, website, phone, subject, message, _honeypot, _timestamp } = req.body;
      
      // SPAM PROTECTION 1: Honeypot check - bots fill hidden fields
      if (_honeypot && _honeypot.length > 0) {
        console.log('Bot detected: honeypot field filled');
        // Return success to fool the bot, but don't actually send
        return res.json({ success: true, message: 'Melding sendt' });
      }

      // SPAM PROTECTION 2: Time-based validation - forms submitted too fast are bots
      const now = Date.now();
      const submissionTime = parseInt(_timestamp) || 0;
      const timeDiff = now - submissionTime;
      const minTimeMs = 3000; // Minimum 3 seconds to fill form

      if (timeDiff < minTimeMs) {
        console.log(`Bot detected: form submitted too fast (${timeDiff}ms)`);
        return res.json({ success: true, message: 'Melding sendt' });
      }

      // SPAM PROTECTION 3: Rate limiting - max 3 submissions per IP per hour
      const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
      const rateLimitWindow = 60 * 60 * 1000; // 1 hour in ms
      const maxSubmissions = 3;

      const rateLimit = contactRateLimiter.get(clientIP);
      if (rateLimit) {
        if (now < rateLimit.resetTime) {
          if (rateLimit.count >= maxSubmissions) {
            console.log(`Rate limit exceeded for IP: ${clientIP}`);
            return res.status(429).json({ error: 'For mange forespørsler. Vennligst vent en time før du prøver igjen.' });
          }
          rateLimit.count++;
        } else {
          // Reset the window
          contactRateLimiter.set(clientIP, { count: 1, resetTime: now + rateLimitWindow });
        }
      } else {
        contactRateLimiter.set(clientIP, { count: 1, resetTime: now + rateLimitWindow });
      }

      // Clean up old rate limit entries periodically
      if (Math.random() < 0.1) { // 10% chance to clean up
        const cutoff = now;
        const entriesToDelete: string[] = [];
        contactRateLimiter.forEach((data, ip) => {
          if (data.resetTime < cutoff) {
            entriesToDelete.push(ip);
          }
        });
        entriesToDelete.forEach(ip => contactRateLimiter.delete(ip));
      }

      if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: 'Alle obligatoriske felt må fylles ut' });
      }

      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.GMAIL_USER || 'noreply@tidsflyt.no',
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });

      const recipientEmail = 'daniel@creatorhubn.com';
      
      // Build company info section
      const hasCompanyInfo = company || orgNumber || website || phone;
      const companySection = hasCompanyInfo ? `
        <div style="margin-bottom: 24px; padding: 20px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 12px; border-left: 4px solid #0ea5e9;">
          <h3 style="margin: 0 0 16px 0; color: #0f172a; font-size: 16px; font-weight: 600;">Bedriftsinformasjon</h3>
          ${website ? `
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <img src="https://www.google.com/s2/favicons?domain=${website.replace(/^https?:\/\//, '')}&sz=32" alt="Logo" style="width: 32px; height: 32px; border-radius: 6px; margin-right: 12px; background: #fff; padding: 2px;" onerror="this.style.display='none'" />
              <div>
                ${company ? `<div style="font-weight: 600; color: #0f172a; font-size: 15px;">${company}</div>` : ''}
                ${orgNumber ? `<div style="color: #64748b; font-size: 13px;">Org.nr: ${orgNumber}</div>` : ''}
              </div>
            </div>
          ` : `
            ${company ? `<div style="font-weight: 600; color: #0f172a; font-size: 15px; margin-bottom: 8px;">${company}</div>` : ''}
            ${orgNumber ? `<div style="color: #64748b; font-size: 13px; margin-bottom: 8px;">Org.nr: ${orgNumber}</div>` : ''}
          `}
          <table style="width: 100%; border-collapse: collapse;">
            ${website ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-size: 13px; width: 80px;">Nettside:</td>
                <td style="padding: 6px 0;"><a href="${website}" style="color: #0ea5e9; text-decoration: none; font-size: 13px;">${website}</a></td>
              </tr>
            ` : ''}
            ${phone ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-size: 13px; width: 80px;">Telefon:</td>
                <td style="padding: 6px 0;"><a href="tel:${phone}" style="color: #0ea5e9; text-decoration: none; font-size: 13px;">${phone}</a></td>
              </tr>
            ` : ''}
          </table>
        </div>
      ` : '';

      await transporter.sendMail({
        from: `"Tidsflyt Kontaktskjema" <${process.env.GMAIL_USER || 'noreply@tidsflyt.no'}>`,
        to: recipientEmail,
        replyTo: email,
        subject: `${company ? `[${company}] ` : ''}Henvendelse: ${subject}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
                <div style="display: inline-block; background: #fff; padding: 16px 28px; border-radius: 8px; margin-bottom: 16px;">
                  <img src="https://tidsflyt.no/api/logo" alt="Tidsflyt" width="180" height="50" style="display: block; max-width: 180px; height: auto;" />
                </div>
                <h1 style="color: #fff; margin: 0; font-size: 20px; font-weight: 500;">Ny henvendelse mottatt</h1>
              </div>

              <!-- Content -->
              <div style="background: #fff; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <!-- Contact Person -->
                <div style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
                  <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 16px; font-weight: 600;">Kontaktperson</h3>
                  <div style="display: flex; align-items: center;">
                    <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 16px;">
                      <span style="color: #fff; font-size: 20px; font-weight: 600;">${name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <div style="font-weight: 600; color: #0f172a; font-size: 16px;">${name}</div>
                      <a href="mailto:${email}" style="color: #0ea5e9; text-decoration: none; font-size: 14px;">${email}</a>
                    </div>
                  </div>
                </div>

                <!-- Company Info -->
                ${companySection}

                <!-- Subject -->
                <div style="margin-bottom: 24px;">
                  <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 16px; font-weight: 600;">Emne</h3>
                  <div style="color: #334155; font-size: 15px; font-weight: 500;">${subject}</div>
                </div>

                <!-- Message -->
                <div style="background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0;">
                  <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 16px; font-weight: 600;">Melding</h3>
                  <div style="color: #475569; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${message}</div>
                </div>

                <!-- Reply Button -->
                <div style="margin-top: 24px; text-align: center;">
                  <a href="mailto:${email}?subject=Svar: ${subject}" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Svar på henvendelsen</a>
                </div>
              </div>

              <!-- Footer -->
              <div style="text-align: center; padding: 24px; color: #64748b; font-size: 12px;">
                <p style="margin: 0 0 8px 0;">Denne meldingen ble sendt via kontaktskjemaet på <a href="https://tidsflyt.no" style="color: #0ea5e9; text-decoration: none;">tidsflyt.no</a></p>
                <p style="margin: 0;">Tidsflyt AS | Timeregistrering for norske bedrifter</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Ny henvendelse fra kontaktskjemaet\n\nKontaktperson: ${name}\nE-post: ${email}${company ? `\nBedrift: ${company}` : ''}${orgNumber ? `\nOrg.nr: ${orgNumber}` : ''}${website ? `\nNettside: ${website}` : ''}${phone ? `\nTelefon: ${phone}` : ''}\n\nEmne: ${subject}\n\nMelding:\n${message}`,
      });

      // Store in database for records
      try {
        await pool.query(
          `INSERT INTO cms_contact_submissions (name, email, subject, message, created_at) VALUES ($1, $2, $3, $4, NOW())`,
          [name, email, subject, message]
        );
      } catch (dbErr) {
        console.log('Contact submission saved to email but not database');
      }

      res.json({ success: true, message: 'Melding sendt' });
    } catch (err: any) {
      console.error('Contact form error:', err);
      res.status(500).json({ error: 'Kunne ikke sende melding. Prøv igjen senere.' });
    }
  });

  // ============================================
  // Email Sending API
  // ============================================

  // Send test email
  app.post("/api/cms/email/test", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { template_id, recipient_email, variables } = req.body;
      
      // Get template
      const templateResult = await pool.query('SELECT * FROM email_templates WHERE id = $1', [template_id]);
      if (templateResult.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      const template = templateResult.rows[0];

      // Get email settings
      const settingsResult = await pool.query('SELECT * FROM email_settings WHERE id = 1');
      if (settingsResult.rows.length === 0) {
        return res.status(400).json({ error: 'Email settings not configured' });
      }
      const settings = settingsResult.rows[0];

      // Replace variables in template
      let htmlContent = template.html_content;
      let subject = template.subject;
      if (variables) {
        for (const [key, value] of Object.entries(variables)) {
          const regex = new RegExp(`{{${key}}}`, 'g');
          htmlContent = htmlContent.replace(regex, value as string);
          subject = subject.replace(regex, value as string);
        }
      }

      // Send email using nodemailer
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: settings.smtp_host || 'smtp.gmail.com',
        port: settings.smtp_port || 587,
        secure: settings.smtp_secure || false,
        auth: {
          user: settings.smtp_user || process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });

      await transporter.sendMail({
        from: `"${settings.from_name || 'Smart Timing'}" <${settings.from_email || settings.smtp_user}>`,
        to: recipient_email,
        subject: subject,
        html: htmlContent,
        text: template.text_content,
      });

      // Log send history
      await pool.query(
        `INSERT INTO email_send_history (template_id, recipient_email, subject, status, sent_at, metadata)
         VALUES ($1, $2, $3, 'sent', NOW(), $4)`,
        [template_id, recipient_email, subject, JSON.stringify({ test: true, variables })]
      );

      res.json({ success: true, message: 'Test email sent successfully' });
    } catch (err: any) {
      console.error('Email send error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get email send history
  app.get("/api/cms/email/history", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await pool.query(
        `SELECT h.*, t.name as template_name FROM email_send_history h
         LEFT JOIN email_templates t ON h.template_id = t.id
         ORDER BY h.created_at DESC LIMIT $1`,
        [limit]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Seed default email templates
  app.post("/api/cms/email/seed-templates", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const defaultTemplates = [
        {
          name: 'Velkommen',
          slug: 'welcome',
          subject: 'Velkommen til {{company_name}}!',
          category: 'onboarding',
          variables: ['name', 'company_name', 'login_url'],
          html_content: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #0066cc;">Velkommen, {{name}}!</h1>
    <p>Vi er glade for å ha deg med i {{company_name}}.</p>
    <p>Du kan logge inn på kontoen din her:</p>
    <a href="{{login_url}}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Logg inn</a>
    <p style="margin-top: 20px;">Med vennlig hilsen,<br>{{company_name}}</p>
  </div>
</body>
</html>`,
          text_content: 'Velkommen, {{name}}! Vi er glade for å ha deg med i {{company_name}}. Logg inn her: {{login_url}}'
        },
        {
          name: 'Tilbakestill passord',
          slug: 'reset-password',
          subject: 'Tilbakestill passordet ditt',
          category: 'auth',
          variables: ['name', 'reset_url', 'expiry_hours'],
          html_content: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #0066cc;">Tilbakestill passord</h1>
    <p>Hei {{name}},</p>
    <p>Vi har mottatt en forespørsel om å tilbakestille passordet ditt.</p>
    <p>Klikk på knappen nedenfor for å sette et nytt passord:</p>
    <a href="{{reset_url}}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Tilbakestill passord</a>
    <p style="margin-top: 20px; font-size: 0.9em; color: #666;">Denne lenken utløper om {{expiry_hours}} timer.</p>
  </div>
</body>
</html>`,
          text_content: 'Hei {{name}}, Tilbakestill passordet ditt her: {{reset_url}}. Lenken utløper om {{expiry_hours}} timer.'
        },
        {
          name: 'Timeregistrering påminnelse',
          slug: 'time-reminder',
          subject: 'Påminnelse: Registrer timene dine',
          category: 'notification',
          variables: ['name', 'week_number', 'dashboard_url'],
          html_content: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #0066cc;">Timeregistrering</h1>
    <p>Hei {{name}},</p>
    <p>Dette er en påminnelse om å registrere timene dine for uke {{week_number}}.</p>
    <a href="{{dashboard_url}}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Registrer timer</a>
  </div>
</body>
</html>`,
          text_content: 'Hei {{name}}, Husk å registrere timene dine for uke {{week_number}}. Gå til: {{dashboard_url}}'
        },
        {
          name: 'Timer godkjent',
          slug: 'time-approved',
          subject: 'Timene dine er godkjent',
          category: 'notification',
          variables: ['name', 'hours', 'period', 'approver_name'],
          html_content: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #28a745;">Timer godkjent</h1>
    <p>Hei {{name}},</p>
    <p>Dine {{hours}} timer for {{period}} er nå godkjent av {{approver_name}}.</p>
    <p>Med vennlig hilsen,<br>Smart Timing</p>
  </div>
</body>
</html>`,
          text_content: 'Hei {{name}}, Dine {{hours}} timer for {{period}} er godkjent av {{approver_name}}.'
        }
      ];

      for (const template of defaultTemplates) {
        await pool.query(
          `INSERT INTO email_templates (name, slug, subject, html_content, text_content, variables, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (slug) DO NOTHING`,
          [template.name, template.slug, template.subject, template.html_content, template.text_content, template.variables, template.category]
        );
      }

      res.json({ success: true, message: 'Default templates seeded' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== REPORT DESIGNER ==========

  // Ensure report tables exist
  async function ensureReportTables() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_templates (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          company_id INTEGER,
          template_type TEXT DEFAULT 'standard',
          privacy_notice_enabled BOOLEAN DEFAULT false,
          privacy_notice_text TEXT,
          paper_size TEXT DEFAULT 'A4',
          orientation TEXT DEFAULT 'portrait',
          margin_top TEXT DEFAULT '20mm',
          margin_bottom TEXT DEFAULT '20mm',
          margin_left TEXT DEFAULT '15mm',
          margin_right TEXT DEFAULT '15mm',
          header_enabled BOOLEAN DEFAULT true,
          header_height TEXT DEFAULT '25mm',
          header_logo_url TEXT,
          header_logo_position TEXT DEFAULT 'left',
          header_title TEXT,
          header_subtitle TEXT,
          header_show_date BOOLEAN DEFAULT true,
          header_show_page_numbers BOOLEAN DEFAULT true,
          footer_enabled BOOLEAN DEFAULT true,
          footer_height TEXT DEFAULT '15mm',
          footer_text TEXT,
          footer_show_page_numbers BOOLEAN DEFAULT true,
          primary_color TEXT DEFAULT '#2563EB',
          secondary_color TEXT DEFAULT '#64748B',
          font_family TEXT DEFAULT 'Helvetica',
          font_size TEXT DEFAULT '11pt',
          line_height TEXT DEFAULT '1.5',
          blocks JSONB DEFAULT '[]',
          is_default BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          created_by TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_block_types (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT,
          default_config JSONB DEFAULT '{}',
          available_fields TEXT[],
          is_active BOOLEAN DEFAULT true
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_generated (
          id SERIAL PRIMARY KEY,
          case_report_id INTEGER NOT NULL,
          template_id INTEGER NOT NULL,
          generated_by TEXT,
          pdf_url TEXT,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_assets (
          id SERIAL PRIMARY KEY,
          company_id INTEGER,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          url TEXT NOT NULL,
          mime_type TEXT,
          size INTEGER,
          width INTEGER,
          height INTEGER,
          is_active BOOLEAN DEFAULT true,
          uploaded_by TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      console.log('Report designer tables created');
    } catch (err) {
      console.error('Error creating report tables:', err);
    }
  }

  ensureReportTables();

  // Get all report templates
  app.get("/api/report-templates", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM report_templates WHERE is_active = true ORDER BY is_default DESC, name ASC`
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single report template
  app.get("/api/report-templates/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM report_templates WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create report template
  app.post("/api/report-templates", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const {
        name, description, company_id, paper_size, orientation,
        margin_top, margin_bottom, margin_left, margin_right,
        header_enabled, header_height, header_logo_url, header_logo_position,
        header_title, header_subtitle, header_show_date, header_show_page_numbers,
        footer_enabled, footer_height, footer_text, footer_show_page_numbers,
        primary_color, secondary_color, font_family, font_size, line_height,
        blocks, is_default,
        template_type, privacy_notice_enabled, privacy_notice_text
      } = req.body;

      // GDPR enforcement: miljøarbeider templates MUST have privacy notice enabled
      let finalPrivacyEnabled = privacy_notice_enabled;
      let finalPrivacyText = privacy_notice_text;
      if (template_type === 'miljoarbeider') {
        finalPrivacyEnabled = true;
        if (!finalPrivacyText) {
          finalPrivacyText = 'PERSONVERN: Denne rapporten inneholder ingen personidentifiserbar informasjon i tråd med GDPR-krav. Klienter er omtalt med generelle betegnelser.';
        }
      }

      const result = await pool.query(
        `INSERT INTO report_templates (
          name, description, company_id, paper_size, orientation,
          margin_top, margin_bottom, margin_left, margin_right,
          header_enabled, header_height, header_logo_url, header_logo_position,
          header_title, header_subtitle, header_show_date, header_show_page_numbers,
          footer_enabled, footer_height, footer_text, footer_show_page_numbers,
          primary_color, secondary_color, font_family, font_size, line_height,
          blocks, is_default, created_by,
          template_type, privacy_notice_enabled, privacy_notice_text
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
        RETURNING *`,
        [
          name, description, company_id, paper_size || 'A4', orientation || 'portrait',
          margin_top || '20mm', margin_bottom || '20mm', margin_left || '15mm', margin_right || '15mm',
          header_enabled !== false, header_height || '25mm', header_logo_url, header_logo_position || 'left',
          header_title, header_subtitle, header_show_date !== false, header_show_page_numbers !== false,
          footer_enabled !== false, footer_height || '15mm', footer_text, footer_show_page_numbers !== false,
          primary_color || '#2563EB', secondary_color || '#64748B', font_family || 'Helvetica',
          font_size || '11pt', line_height || '1.5', JSON.stringify(blocks || []),
          is_default || false, req.admin?.username,
          template_type || 'standard', finalPrivacyEnabled || false, finalPrivacyText
        ]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update report template
  app.put("/api/report-templates/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const updates = { ...req.body };
      
      // GDPR enforcement: miljøarbeider templates MUST have privacy notice enabled
      if (updates.template_type === 'miljoarbeider') {
        updates.privacy_notice_enabled = true;
        if (!updates.privacy_notice_text) {
          updates.privacy_notice_text = 'PERSONVERN: Denne rapporten inneholder ingen personidentifiserbar informasjon i tråd med GDPR-krav. Klienter er omtalt med generelle betegnelser.';
        }
      }
      
      const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
      if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const values = fields.map(f => f === 'blocks' ? JSON.stringify(updates[f]) : updates[f]);

      const result = await pool.query(
        `UPDATE report_templates SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, ...values]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete report template
  app.delete("/api/report-templates/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      await pool.query('UPDATE report_templates SET is_active = false WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get available block types
  app.get("/api/report-templates/blocks/types", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query('SELECT * FROM report_block_types WHERE is_active = true ORDER BY name');
      if (result.rows.length === 0) {
        // Return default block types if none exist
        const defaultBlocks = [
          { type: 'header', name: 'Topptekst', description: 'Logo og tittel', icon: 'FileText', available_fields: ['logo', 'title', 'subtitle', 'date'] },
          { type: 'privacy_notice', name: 'Personvernmerknad', description: 'GDPR-merknad for miljøarbeider-rapporter', icon: 'Shield', available_fields: ['text'] },
          { type: 'project_info', name: 'Prosjektinformasjon', description: 'Konsulent, bedrift, oppdragsgiver, tiltak, klient-ID, periode', icon: 'Briefcase', available_fields: ['consultant', 'company', 'client', 'initiative', 'client_id', 'period'] },
          { type: 'statistics', name: 'Statistikk', description: 'Totale timer, arbeidsdager, aktiviteter', icon: 'BarChart3', available_fields: ['total_hours', 'work_days', 'activities'] },
          { type: 'section', name: 'Seksjon', description: 'Innholdseksjon med overskrift', icon: 'LayoutList', available_fields: ['title', 'content'] },
          { type: 'text', name: 'Tekst', description: 'Fritekst-blokk', icon: 'Type', available_fields: ['content'] },
          { type: 'field', name: 'Rapportfelt', description: 'Felt fra saksrapporten', icon: 'FormInput', available_fields: ['background', 'actions', 'progress', 'challenges', 'factors', 'assessment', 'recommendations', 'notes'] },
          { type: 'time_log', name: 'Detaljert logg', description: 'Tabell med alle registreringer (dato, aktivitet, varighet, notater)', icon: 'Clock', available_fields: ['date', 'activity', 'duration', 'notes'] },
          { type: 'table', name: 'Tabell', description: 'Data i tabellformat', icon: 'Table', available_fields: ['headers', 'rows'] },
          { type: 'signature', name: 'Signatur', description: 'Signaturfelt', icon: 'PenTool', available_fields: ['label', 'name', 'date'] },
          { type: 'divider', name: 'Skillelinje', description: 'Horisontal linje', icon: 'Minus', available_fields: ['style'] },
          { type: 'spacer', name: 'Mellomrom', description: 'Vertikal avstand', icon: 'MoveVertical', available_fields: ['height'] },
          { type: 'image', name: 'Bilde', description: 'Bilde fra ressurser', icon: 'Image', available_fields: ['url', 'alt', 'width'] },
          { type: 'footer', name: 'Bunntekst', description: 'Bunntekst med sidetall', icon: 'AlignBottom', available_fields: ['text', 'page_numbers'] },
        ];
        return res.json(defaultBlocks);
      }
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Seed default block types
  app.post("/api/report-templates/blocks/seed", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const defaultBlocks = [
        { type: 'header', name: 'Topptekst', description: 'Logo og tittel', icon: 'FileText', available_fields: ['logo', 'title', 'subtitle', 'date'], default_config: { showLogo: true, showDate: true } },
        { type: 'privacy_notice', name: 'Personvernmerknad', description: 'GDPR-merknad for miljøarbeider-rapporter', icon: 'Shield', available_fields: ['text'], default_config: { text: 'PERSONVERN: Denne rapporten inneholder ingen personidentifiserbar informasjon i tråd med GDPR-krav. Klienter er omtalt med generelle betegnelser.' } },
        { type: 'project_info', name: 'Prosjektinformasjon', description: 'Konsulent, bedrift, oppdragsgiver, tiltak, klient-ID, periode', icon: 'Briefcase', available_fields: ['consultant', 'company', 'client', 'initiative', 'client_id', 'period'], default_config: { showAllFields: true } },
        { type: 'statistics', name: 'Statistikk', description: 'Totale timer, arbeidsdager, aktiviteter', icon: 'BarChart3', available_fields: ['total_hours', 'work_days', 'activities'], default_config: { showAllStats: true } },
        { type: 'section', name: 'Seksjon', description: 'Innholdseksjon med overskrift', icon: 'LayoutList', available_fields: ['title', 'content'], default_config: { titleSize: 'h2' } },
        { type: 'text', name: 'Tekst', description: 'Fritekst-blokk', icon: 'Type', available_fields: ['content'], default_config: {} },
        { type: 'field', name: 'Rapportfelt', description: 'Felt fra saksrapporten', icon: 'FormInput', available_fields: ['background', 'actions', 'progress', 'challenges', 'factors', 'assessment', 'recommendations', 'notes'], default_config: { showLabel: true } },
        { type: 'time_log', name: 'Detaljert logg', description: 'Tabell med alle registreringer (dato, aktivitet, varighet, notater)', icon: 'Clock', available_fields: ['date', 'activity', 'duration', 'notes'], default_config: { showNotes: true, focusOnDuration: true } },
        { type: 'table', name: 'Tabell', description: 'Data i tabellformat', icon: 'Table', available_fields: ['headers', 'rows'], default_config: { striped: true, bordered: true } },
        { type: 'signature', name: 'Signatur', description: 'Signaturfelt', icon: 'PenTool', available_fields: ['label', 'name', 'date'], default_config: { showDate: true } },
        { type: 'divider', name: 'Skillelinje', description: 'Horisontal linje', icon: 'Minus', available_fields: ['style'], default_config: { style: 'solid' } },
        { type: 'spacer', name: 'Mellomrom', description: 'Vertikal avstand', icon: 'MoveVertical', available_fields: ['height'], default_config: { height: '10mm' } },
        { type: 'image', name: 'Bilde', description: 'Bilde fra ressurser', icon: 'Image', available_fields: ['url', 'alt', 'width'], default_config: { width: '100%' } },
        { type: 'footer', name: 'Bunntekst', description: 'Bunntekst med sidetall', icon: 'AlignBottom', available_fields: ['text', 'page_numbers'], default_config: { showPageNumbers: true } },
      ];

      for (const block of defaultBlocks) {
        await pool.query(
          `INSERT INTO report_block_types (type, name, description, icon, available_fields, default_config)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (type) DO UPDATE SET name = $2, description = $3, icon = $4, available_fields = $5, default_config = $6`,
          [block.type, block.name, block.description, block.icon, block.available_fields, block.default_config]
        );
      }

      res.json({ success: true, message: 'Block types seeded' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get report assets
  app.get("/api/report-assets", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { company_id, type } = req.query;
      let query = 'SELECT * FROM report_assets WHERE is_active = true';
      const params: any[] = [];
      
      if (company_id) {
        params.push(company_id);
        query += ` AND (company_id = $${params.length} OR company_id IS NULL)`;
      }
      if (type) {
        params.push(type);
        query += ` AND type = $${params.length}`;
      }
      
      query += ' ORDER BY created_at DESC';
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload report asset
  app.post("/api/report-assets", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, type, url, mime_type, size, width, height, company_id } = req.body;
      const result = await pool.query(
        `INSERT INTO report_assets (name, type, url, mime_type, size, width, height, company_id, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [name, type, url, mime_type, size, width, height, company_id, req.admin?.username]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete report asset
  app.delete("/api/report-assets/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      await pool.query('UPDATE report_assets SET is_active = false WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate PDF from template
  app.post("/api/report-templates/:templateId/generate/:caseReportId", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { templateId, caseReportId } = req.params;

      // Get template
      const templateResult = await pool.query('SELECT * FROM report_templates WHERE id = $1', [templateId]);
      if (templateResult.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      const template = templateResult.rows[0];

      // Get case report data
      const reportResult = await pool.query('SELECT * FROM case_reports WHERE id = $1', [caseReportId]);
      if (reportResult.rows.length === 0) {
        return res.status(404).json({ error: 'Case report not found' });
      }
      const caseReport = reportResult.rows[0];

      // Create PDF using pdfkit
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({
        size: template.paper_size || 'A4',
        layout: template.orientation || 'portrait',
        margins: {
          top: parseInt(template.margin_top) || 56,
          bottom: parseInt(template.margin_bottom) || 56,
          left: parseInt(template.margin_left) || 42,
          right: parseInt(template.margin_right) || 42
        }
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="rapport-${caseReportId}.pdf"`);
      doc.pipe(res);

      // Font settings
      const fontFamily = template.font_family || 'Helvetica';
      const fontSize = parseInt(template.font_size) || 11;
      const primaryColor = template.primary_color || '#2563EB';

      // Header
      if (template.header_enabled) {
        if (template.header_title) {
          doc.fontSize(18).fillColor(primaryColor).text(template.header_title, { align: 'center' });
        }
        if (template.header_subtitle) {
          doc.fontSize(12).fillColor('#666666').text(template.header_subtitle, { align: 'center' });
        }
        if (template.header_show_date) {
          doc.fontSize(10).fillColor('#888888').text(
            new Date().toLocaleDateString('nb-NO'),
            { align: 'right' }
          );
        }
        doc.moveDown(2);
      }

      // Process blocks
      const blocks = template.blocks || [];
      const fieldLabels: Record<string, string> = {
        background: 'Bakgrunn',
        actions: 'Tiltak',
        progress: 'Fremgang',
        challenges: 'Utfordringer',
        factors: 'Faktorer',
        assessment: 'Vurdering',
        recommendations: 'Anbefalinger',
        notes: 'Notater'
      };

      // Add privacy notice at top if enabled
      if (template.privacy_notice_enabled && template.privacy_notice_text) {
        doc.fontSize(9).fillColor('#666666')
          .rect(doc.x, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 30)
          .fill('#f0f9ff');
        doc.fillColor('#0369a1').text(template.privacy_notice_text, doc.x + 10, doc.y + 8, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 20
        });
        doc.moveDown(2);
      }

      for (const block of blocks) {
        switch (block.type) {
          case 'privacy_notice':
            const privacyText = block.config?.text || 'PERSONVERN: Denne rapporten inneholder ingen personidentifiserbar informasjon i tråd med GDPR-krav.';
            doc.fontSize(9).fillColor('#0369a1').text(privacyText, { oblique: true });
            doc.moveDown();
            break;

          case 'project_info':
            doc.fontSize(12).fillColor(primaryColor).text('Prosjektinformasjon', { underline: true });
            doc.moveDown(0.5);
            const projectFields = [
              { key: 'consultant', label: 'Konsulent' },
              { key: 'company', label: 'Bedrift' },
              { key: 'client', label: 'Oppdragsgiver' },
              { key: 'initiative', label: 'Tiltak' },
              { key: 'client_id', label: 'Klient-ID' },
              { key: 'period', label: 'Periode' }
            ];
            for (const pf of projectFields) {
              const value = block.config?.[pf.key] || caseReport?.[pf.key] || '-';
              doc.fontSize(fontSize).fillColor('#333333').text(`${pf.label}: ${value}`);
            }
            doc.moveDown();
            break;

          case 'statistics':
            doc.fontSize(12).fillColor(primaryColor).text('Statistikk', { underline: true });
            doc.moveDown(0.5);
            const stats = [
              { label: 'Totale timer', value: block.config?.total_hours || '-' },
              { label: 'Arbeidsdager', value: block.config?.work_days || '-' },
              { label: 'Aktiviteter', value: block.config?.activities || '-' }
            ];
            for (const stat of stats) {
              doc.fontSize(fontSize).fillColor('#333333').text(`${stat.label}: ${stat.value}`);
            }
            doc.moveDown();
            break;

          case 'time_log':
            doc.fontSize(12).fillColor(primaryColor).text('Detaljert logg', { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(9).fillColor('#666666')
              .text('Dato', doc.x, doc.y, { width: 80, continued: true })
              .text('Aktivitet', { width: 150, continued: true })
              .text('Varighet', { width: 60, continued: true })
              .text('Notater', { width: 200 });
            doc.moveDown(0.5);
            doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#dddddd').stroke();
            doc.moveDown(0.5);
            if (block.config?.entries && Array.isArray(block.config.entries)) {
              for (const entry of block.config.entries) {
                doc.fontSize(fontSize).fillColor('#333333')
                  .text(entry.date || '-', doc.x, doc.y, { width: 80, continued: true })
                  .text(entry.activity || '-', { width: 150, continued: true })
                  .text(entry.duration || '-', { width: 60, continued: true })
                  .text(entry.notes || '-', { width: 200 });
              }
            }
            doc.moveDown();
            break;

          case 'section':
            doc.fontSize(14).fillColor(primaryColor).text(block.config?.title || 'Seksjon', { underline: true });
            if (block.config?.content) {
              doc.fontSize(fontSize).fillColor('#333333').text(block.config.content);
            }
            doc.moveDown();
            break;

          case 'text':
            doc.fontSize(fontSize).fillColor('#333333').text(block.config?.content || '');
            doc.moveDown();
            break;

          case 'field':
            const fieldName = block.config?.field;
            if (fieldName && caseReport[fieldName]) {
              const label = block.config?.label || fieldLabels[fieldName] || fieldName;
              doc.fontSize(12).fillColor(primaryColor).text(label, { underline: true });
              doc.fontSize(fontSize).fillColor('#333333').text(caseReport[fieldName]);
              doc.moveDown();
            }
            break;

          case 'divider':
            doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
              .strokeColor('#dddddd').stroke();
            doc.moveDown();
            break;

          case 'spacer':
            doc.moveDown(parseInt(block.config?.height) || 2);
            break;

          case 'signature':
            doc.moveDown(2);
            doc.fontSize(10).fillColor('#666666').text(block.config?.label || 'Signatur:');
            doc.moveDown();
            doc.text('_________________________________');
            if (block.config?.showDate) {
              doc.text(`Dato: ${new Date().toLocaleDateString('nb-NO')}`);
            }
            break;
        }
      }

      // If no blocks defined, render all fields from case report
      if (blocks.length === 0) {
        for (const [field, label] of Object.entries(fieldLabels)) {
          if (caseReport[field]) {
            doc.fontSize(12).fillColor(primaryColor).text(label, { underline: true });
            doc.fontSize(fontSize).fillColor('#333333').text(caseReport[field]);
            doc.moveDown();
          }
        }
      }

      // Footer
      if (template.footer_enabled) {
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(9).fillColor('#888888');
          if (template.footer_text) {
            doc.text(template.footer_text, doc.page.margins.left, doc.page.height - 40, { align: 'left' });
          }
          if (template.footer_show_page_numbers) {
            doc.text(`Side ${i + 1} av ${pageCount}`, 0, doc.page.height - 40, { align: 'center', width: doc.page.width });
          }
        }
      }

      // Log generation
      await pool.query(
        `INSERT INTO report_generated (case_report_id, template_id, generated_by, metadata)
         VALUES ($1, $2, $3, $4)`,
        [caseReportId, templateId, req.admin?.username, JSON.stringify({ generated_at: new Date() })]
      );

      doc.end();
    } catch (err: any) {
      console.error('PDF generation error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get generation history
  app.get("/api/report-generated", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await pool.query(
        `SELECT g.*, t.name as template_name, r.case_id, r.month
         FROM report_generated g
         LEFT JOIN report_templates t ON g.template_id = t.id
         LEFT JOIN case_reports r ON g.case_report_id = r.id
         ORDER BY g.created_at DESC LIMIT $1`,
        [limit]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Seed a default template
  app.post("/api/report-templates/seed-default", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const defaultBlocks = [
        { id: '1', type: 'section', config: { title: 'Bakgrunn', field: 'background' } },
        { id: '2', type: 'field', config: { field: 'background', label: 'Bakgrunn', showLabel: true } },
        { id: '3', type: 'divider', config: {} },
        { id: '4', type: 'field', config: { field: 'actions', label: 'Tiltak', showLabel: true } },
        { id: '5', type: 'divider', config: {} },
        { id: '6', type: 'field', config: { field: 'progress', label: 'Fremgang', showLabel: true } },
        { id: '7', type: 'divider', config: {} },
        { id: '8', type: 'field', config: { field: 'challenges', label: 'Utfordringer', showLabel: true } },
        { id: '9', type: 'divider', config: {} },
        { id: '10', type: 'field', config: { field: 'assessment', label: 'Vurdering', showLabel: true } },
        { id: '11', type: 'divider', config: {} },
        { id: '12', type: 'field', config: { field: 'recommendations', label: 'Anbefalinger', showLabel: true } },
        { id: '13', type: 'spacer', config: { height: 20 } },
        { id: '14', type: 'signature', config: { label: 'Godkjent av:', showDate: true } },
      ];

      const result = await pool.query(
        `INSERT INTO report_templates (name, description, header_title, header_subtitle, blocks, is_default, created_by)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          'Standard Saksrapport',
          'Standard mal for saksrapporter med alle felter',
          'Saksrapport',
          'Smart Timing - Timeføringssystem',
          JSON.stringify(defaultBlocks),
          req.admin?.username
        ]
      );

      res.json({ success: true, template: result.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== FEEDBACK SYSTEM ROUTES ==========

  // Get pending feedback requests for current user
  app.get("/api/feedback/pending", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const vendorId = req.query.vendorId as string;
      
      if (!userId && !vendorId) {
        return res.status(400).json({ error: 'userId or vendorId required' });
      }

      let query = `SELECT * FROM feedback_requests WHERE status = 'pending'`;
      const params: any[] = [];
      
      if (userId) {
        query += ` AND user_id = $${params.length + 1}`;
        params.push(userId);
      }
      if (vendorId) {
        query += ` AND vendor_id = $${params.length + 1}`;
        params.push(parseInt(vendorId));
      }
      
      // Check if snoozed
      query += ` AND (snoozed_until IS NULL OR snoozed_until < NOW())`;
      query += ` ORDER BY triggered_at DESC LIMIT 1`;
      
      const result = await pool.query(query, params);
      res.json(result.rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Submit feedback response
  app.post("/api/feedback/respond", async (req, res) => {
    try {
      const { requestId, vendorId, userId, ratingScore, npsScore, satisfactionLabel, textualFeedback } = req.body;
      
      if (!requestId || !ratingScore) {
        return res.status(400).json({ error: 'requestId and ratingScore are required' });
      }

      // Insert feedback response
      const responseResult = await pool.query(
        `INSERT INTO feedback_responses (request_id, vendor_id, user_id, rating_score, nps_score, satisfaction_label, textual_feedback)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [requestId, vendorId || null, userId || null, ratingScore, npsScore || null, satisfactionLabel || null, textualFeedback || null]
      );

      // Mark request as completed
      await pool.query(
        `UPDATE feedback_requests SET status = 'completed', responded_at = NOW() WHERE id = $1`,
        [requestId]
      );

      res.json({ success: true, response: responseResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Snooze feedback request
  app.post("/api/feedback/snooze", async (req, res) => {
    try {
      const { requestId, snoozeHours = 24 } = req.body;
      
      if (!requestId) {
        return res.status(400).json({ error: 'requestId is required' });
      }

      const snoozedUntil = new Date(Date.now() + snoozeHours * 60 * 60 * 1000);
      
      await pool.query(
        `UPDATE feedback_requests SET status = 'snoozed', snoozed_until = $2 WHERE id = $1`,
        [requestId, snoozedUntil]
      );

      res.json({ success: true, snoozedUntil });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dismiss feedback request
  app.post("/api/feedback/dismiss", async (req, res) => {
    try {
      const { requestId } = req.body;
      
      if (!requestId) {
        return res.status(400).json({ error: 'requestId is required' });
      }

      await pool.query(
        `UPDATE feedback_requests SET status = 'dismissed' WHERE id = $1`,
        [requestId]
      );

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get aggregated feedback statistics (for public Why page)
  app.get("/api/feedback/stats", async (req, res) => {
    try {
      // Get average satisfaction rating
      const avgRating = await pool.query(
        `SELECT 
           COALESCE(AVG(rating_score), 0) as avg_rating,
           COUNT(*) as total_responses,
           COUNT(DISTINCT vendor_id) as vendor_count,
           COUNT(DISTINCT user_id) as user_count
         FROM feedback_responses
         WHERE rating_score IS NOT NULL`
      );

      // Count active vendors (gracefully handle if table doesn't exist)
      let vendorCountValue = 0;
      try {
        const vendorCount = await pool.query(
          `SELECT COUNT(*) as count FROM vendors WHERE status = 'active'`
        );
        vendorCountValue = parseInt(vendorCount.rows[0]?.count || 0);
      } catch {
        vendorCountValue = 0;
      }

      // Calculate satisfaction percentage (ratings 4-5 = satisfied)
      const satisfactionResult = await pool.query(
        `SELECT 
           COUNT(CASE WHEN rating_score >= 4 THEN 1 END) as satisfied,
           COUNT(*) as total
         FROM feedback_responses
         WHERE rating_score IS NOT NULL`
      );

      const stats = avgRating.rows[0];
      const satisfaction = satisfactionResult.rows[0];

      // Calculate satisfaction percentage
      const satisfactionPct = satisfaction.total > 0 
        ? Math.round((satisfaction.satisfied / satisfaction.total) * 100)
        : null;

      res.json({
        hasData: parseInt(stats.total_responses) > 0,
        satisfactionPercentage: satisfactionPct,
        avgRating: parseFloat(stats.avg_rating).toFixed(1),
        totalResponses: parseInt(stats.total_responses),
        vendorCount: vendorCountValue,
        uniqueRespondingVendors: parseInt(stats.vendor_count),
        uniqueRespondingUsers: parseInt(stats.user_count)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Check and trigger feedback request for user milestones
  app.post("/api/feedback/check-milestone", async (req, res) => {
    try {
      const { userId, vendorId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      // Check if user has completed 4+ time entries (stemplinger)
      let entryCount = 0;
      try {
        const entriesResult = await pool.query(
          `SELECT COUNT(*) as entry_count FROM log_row WHERE user_id = $1`,
          [userId]
        );
        entryCount = parseInt(entriesResult.rows[0].entry_count);
      } catch {
        entryCount = 0;
      }

      // Check vendor user count if vendorId is provided (vendor must have 5+ users)
      let vendorUserCount = 0;
      let vendorQualified = true;
      if (vendorId) {
        try {
          const vendorUsersResult = await pool.query(
            `SELECT COUNT(DISTINCT user_id) as user_count 
             FROM project_info 
             WHERE vendor_id = $1`,
            [vendorId]
          );
          vendorUserCount = parseInt(vendorUsersResult.rows[0].user_count);
          vendorQualified = vendorUserCount >= 5;
        } catch {
          vendorQualified = false;
        }
      }

      // User must have 4+ entries AND vendor must have 5+ users (if vendor context exists)
      const userQualified = entryCount >= 4;
      const qualifiesForFeedback = userQualified && vendorQualified;

      // Check if user already has a pending/completed feedback request
      const existingRequest = await pool.query(
        `SELECT id, status FROM feedback_requests 
         WHERE user_id = $1 AND request_type = 'user_milestone'
         ORDER BY triggered_at DESC LIMIT 1`,
        [userId]
      );

      if (qualifiesForFeedback && (!existingRequest.rows[0] || existingRequest.rows[0].status === 'dismissed')) {
        // Create a new feedback request
        const newRequest = await pool.query(
          `INSERT INTO feedback_requests (user_id, vendor_id, request_type, status, metadata)
           VALUES ($1, $2, 'user_milestone', 'pending', $3)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [userId, vendorId || null, JSON.stringify({ entryCount, vendorUserCount })]
        );

        if (newRequest.rows[0]) {
          return res.json({ shouldShowFeedback: true, request: newRequest.rows[0] });
        }
      }

      // Check for existing pending request (not snoozed)
      if (existingRequest.rows[0]?.status === 'pending') {
        // Check if snoozed
        const fullRequest = await pool.query(
          `SELECT * FROM feedback_requests WHERE id = $1`,
          [existingRequest.rows[0].id]
        );
        const req = fullRequest.rows[0];
        if (!req.snoozed_until || new Date(req.snoozed_until) < new Date()) {
          return res.json({ shouldShowFeedback: true, request: req });
        }
      }

      res.json({ 
        shouldShowFeedback: false, 
        entryCount, 
        vendorUserCount,
        userQualified,
        vendorQualified
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Check and trigger feedback request for vendor milestones
  app.post("/api/feedback/check-vendor-milestone", async (req, res) => {
    try {
      const { vendorId } = req.body;
      
      if (!vendorId) {
        return res.status(400).json({ error: 'vendorId is required' });
      }

      // Check if vendor has 5+ users (using project_info or session table)
      const usersResult = await pool.query(
        `SELECT COUNT(DISTINCT user_id) as user_count 
         FROM project_info 
         WHERE vendor_id = $1`,
        [vendorId]
      );
      const userCount = parseInt(usersResult.rows[0].user_count);

      // Check if vendor already has a pending/completed feedback request
      const existingRequest = await pool.query(
        `SELECT id, status FROM feedback_requests 
         WHERE vendor_id = $1 AND request_type = 'vendor_milestone' AND user_id IS NULL
         ORDER BY triggered_at DESC LIMIT 1`,
        [vendorId]
      );

      if (userCount >= 5 && (!existingRequest.rows[0] || existingRequest.rows[0].status === 'dismissed')) {
        // Create a new feedback request for vendor admin
        const newRequest = await pool.query(
          `INSERT INTO feedback_requests (vendor_id, request_type, status, metadata)
           VALUES ($1, 'vendor_milestone', 'pending', $2)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [vendorId, JSON.stringify({ userCount })]
        );

        if (newRequest.rows[0]) {
          return res.json({ shouldShowFeedback: true, request: newRequest.rows[0] });
        }
      }

      // Check for existing pending request
      if (existingRequest.rows[0]?.status === 'pending') {
        return res.json({ shouldShowFeedback: true, request: existingRequest.rows[0] });
      }

      res.json({ shouldShowFeedback: false, userCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Run database migrations on startup
  (async () => {
    try {
      // Add vendor_id column to admin_users if it doesn't exist
      await pool.query(`
        ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS vendor_id INTEGER;
        ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);
      
      // Create landing_partners table if it doesn't exist
      await pool.query(`
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
      `);
    } catch (err) {
      // Ignore errors - table might not exist yet
    }
  })();

  console.log("Smart Timing API routes registered");
}
