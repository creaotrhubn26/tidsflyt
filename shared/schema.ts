import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, numeric, date, time, serial, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Companies table
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  logoBase64: text("logo_base64"),
  displayOrder: integer("display_order").default(0),
  enforceHourlyRate: boolean("enforce_hourly_rate").default(false),
  enforcedHourlyRate: numeric("enforced_hourly_rate", { precision: 10, scale: 2 }),
  enforceTimesheetRecipient: boolean("enforce_timesheet_recipient").default(false),
  enforcedTimesheetTo: text("enforced_timesheet_to"),
  enforcedTimesheetCc: text("enforced_timesheet_cc"),
  enforcedTimesheetBcc: text("enforced_timesheet_bcc"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Company users table
export const companyUsers = pgTable("company_users", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  userEmail: text("user_email").notNull(),
  googleEmail: text("google_email"),
  role: text("role").default("member"),
  approved: boolean("approved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Project info table
export const projectInfo = pgTable("project_info", {
  id: serial("id").primaryKey(),
  konsulent: text("konsulent"),
  bedrift: text("bedrift"),
  oppdragsgiver: text("oppdragsgiver"),
  tiltak: text("tiltak"),
  periode: text("periode"),
  klientId: text("klient_id"),
  userId: text("user_id").default("default"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Log row table (time entries)
export const logRow = pgTable("log_row", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: integer("project_id"),
  date: date("date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  breakHours: numeric("break_hours", { precision: 4, scale: 2 }).default("0"),
  activity: text("activity"),
  title: text("title"),
  project: text("project"),
  place: text("place"),
  notes: text("notes"),
  expenseCoverage: numeric("expense_coverage", { precision: 10, scale: 2 }).default("0"),
  userId: text("user_id").default("default"),
  isStampedIn: boolean("is_stamped_in").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User settings table
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique().default("default"),
  paidBreak: boolean("paid_break").default(false),
  taxPct: numeric("tax_pct", { precision: 4, scale: 2 }).default("35.00"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).default("0"),
  timesheetSender: text("timesheet_sender"),
  timesheetRecipient: text("timesheet_recipient"),
  timesheetFormat: text("timesheet_format").default("xlsx"),
  smtpAppPassword: text("smtp_app_password"),
  webhookActive: boolean("webhook_active").default(false),
  webhookUrl: text("webhook_url"),
  sheetUrl: text("sheet_url"),
  monthNav: text("month_nav"),
  invoiceReminderActive: boolean("invoice_reminder_active").default(false),
  themeMode: text("theme_mode").default("dark"),
  viewMode: text("view_mode").default("month"),
  language: text("language").default("no"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Quick templates table
export const quickTemplates = pgTable("quick_templates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").default("default"),
  label: text("label").notNull(),
  activity: text("activity").default("Work"),
  title: text("title"),
  project: text("project"),
  place: text("place"),
  isFavorite: boolean("is_favorite").default(false),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin users table
export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").default("admin"),
  isActive: boolean("is_active").default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Company audit log
export const companyAuditLog = pgTable("company_audit_log", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  actorCompanyUserId: integer("actor_company_user_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: jsonb("details"),
  prevData: jsonb("prev_data"),
  newData: jsonb("new_data"),
  requestId: text("request_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  prevHash: text("prev_hash"),
  hash: text("hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCompanyUserSchema = createInsertSchema(companyUsers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectInfoSchema = createInsertSchema(projectInfo).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLogRowSchema = createInsertSchema(logRow).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuickTemplateSchema = createInsertSchema(quickTemplates).omit({ id: true, createdAt: true });

// Types
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type CompanyUser = typeof companyUsers.$inferSelect;
export type InsertCompanyUser = z.infer<typeof insertCompanyUserSchema>;
export type ProjectInfo = typeof projectInfo.$inferSelect;
export type InsertProjectInfo = z.infer<typeof insertProjectInfoSchema>;
export type LogRow = typeof logRow.$inferSelect;
export type InsertLogRow = z.infer<typeof insertLogRowSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type QuickTemplate = typeof quickTemplates.$inferSelect;
export type InsertQuickTemplate = z.infer<typeof insertQuickTemplateSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;
export type CompanyAuditLog = typeof companyAuditLog.$inferSelect;

// Legacy types for compatibility with current frontend
export type User = {
  id: string;
  username: string;
  password?: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  status: string;
  hoursThisWeek: number | null;
  pendingApprovals: number | null;
};

export type TimeEntry = {
  id: string;
  userId: string;
  caseNumber: string | null;
  description: string;
  hours: number;
  date: string;
  status: string;
  createdAt: string;
};

export type Activity = {
  id: string;
  userId: string;
  action: string;
  description: string;
  timestamp: string;
};

export type InsertUser = Omit<User, 'id' | 'hoursThisWeek' | 'pendingApprovals'>;
export type InsertTimeEntry = Omit<TimeEntry, 'id'>;
export type InsertActivity = Omit<Activity, 'id'>;
