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

// CMS: Site Settings
export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CMS: Landing Hero Section
export const landingHero = pgTable("landing_hero", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  titleHighlight: text("title_highlight"),
  subtitle: text("subtitle"),
  ctaPrimaryText: text("cta_primary_text"),
  ctaSecondaryText: text("cta_secondary_text"),
  badge1: text("badge1"),
  badge2: text("badge2"),
  badge3: text("badge3"),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CMS: Landing Features
export const landingFeatures = pgTable("landing_features", {
  id: serial("id").primaryKey(),
  icon: text("icon").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CMS: Landing Testimonials
export const landingTestimonials = pgTable("landing_testimonials", {
  id: serial("id").primaryKey(),
  quote: text("quote").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CMS: Landing CTA Section
export const landingCta = pgTable("landing_cta", {
  id: serial("id").primaryKey(),
  sectionTitle: text("section_title"),
  featuresTitle: text("features_title"),
  featuresSubtitle: text("features_subtitle"),
  testimonialsTitle: text("testimonials_title"),
  testimonialsSubtitle: text("testimonials_subtitle"),
  ctaTitle: text("cta_title"),
  ctaSubtitle: text("cta_subtitle"),
  ctaButtonText: text("cta_button_text"),
  contactTitle: text("contact_title"),
  contactSubtitle: text("contact_subtitle"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  contactAddress: text("contact_address"),
  footerCopyright: text("footer_copyright"),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Case Reports table
export const caseReports = pgTable("case_reports", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  userCasesId: integer("user_cases_id"),
  caseId: text("case_id").notNull(),
  month: text("month").notNull(),
  background: text("background"),
  actions: text("actions"),
  progress: text("progress"),
  challenges: text("challenges"),
  factors: text("factors"),
  assessment: text("assessment"),
  recommendations: text("recommendations"),
  notes: text("notes"),
  status: text("status").default("draft").notNull(),
  rejectionReason: text("rejection_reason"),
  rejectedBy: text("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
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

// CMS Insert schemas
export const insertSiteSettingSchema = createInsertSchema(siteSettings).omit({ id: true, updatedAt: true });
export const insertLandingHeroSchema = createInsertSchema(landingHero).omit({ id: true, updatedAt: true });
export const insertLandingFeatureSchema = createInsertSchema(landingFeatures).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLandingTestimonialSchema = createInsertSchema(landingTestimonials).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLandingCtaSchema = createInsertSchema(landingCta).omit({ id: true, updatedAt: true });

// Case Reports Insert schema
export const insertCaseReportSchema = createInsertSchema(caseReports).omit({ id: true, createdAt: true, updatedAt: true, rejectedAt: true, approvedAt: true });

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

// CMS Types
export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;
export type LandingHero = typeof landingHero.$inferSelect;
export type InsertLandingHero = z.infer<typeof insertLandingHeroSchema>;
export type LandingFeature = typeof landingFeatures.$inferSelect;
export type InsertLandingFeature = z.infer<typeof insertLandingFeatureSchema>;
export type LandingTestimonial = typeof landingTestimonials.$inferSelect;
export type InsertLandingTestimonial = z.infer<typeof insertLandingTestimonialSchema>;
export type LandingCta = typeof landingCta.$inferSelect;
export type InsertLandingCta = z.infer<typeof insertLandingCtaSchema>;

// Case Reports Types
export type CaseReport = typeof caseReports.$inferSelect;
export type InsertCaseReport = z.infer<typeof insertCaseReportSchema>;

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
