import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, numeric, date, time, serial, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Companies table
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id"), // null = legacy, otherwise belongs to vendor
  name: text("name").notNull(),
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

// Vendors table - Leverandører som bruker Smart Timing
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-vennlig identifikator
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  logoUrl: text("logo_url"),
  status: text("status").default("active"), // active, suspended, inactive
  settings: jsonb("settings").default({}), // Custom settings per vendor
  maxUsers: integer("max_users").default(50), // Maks antall brukere
  subscriptionPlan: text("subscription_plan").default("standard"), // basic, standard, premium
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin users table - supports super_admin and vendor_admin roles
export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").default("vendor_admin"), // super_admin, vendor_admin
  vendorId: integer("vendor_id"), // null for super_admin, required for vendor_admin
  isActive: boolean("is_active").default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Vendor insert schema
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true, updatedAt: true });
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;

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
  ctaPrimaryUrl: text("cta_primary_url"),
  ctaPrimaryType: text("cta_primary_type").default("scroll"), // scroll, internal, external, modal
  ctaPrimaryIcon: text("cta_primary_icon"),
  ctaSecondaryText: text("cta_secondary_text"),
  ctaSecondaryUrl: text("cta_secondary_url"),
  ctaSecondaryType: text("cta_secondary_type").default("scroll"),
  ctaSecondaryIcon: text("cta_secondary_icon"),
  badge1: text("badge1"),
  badge1Icon: text("badge1_icon"),
  badge2: text("badge2"),
  badge2Icon: text("badge2_icon"),
  badge3: text("badge3"),
  badge3Icon: text("badge3_icon"),
  backgroundImage: text("background_image"),
  backgroundGradient: text("background_gradient"),
  backgroundOverlay: boolean("background_overlay").default(true),
  layout: text("layout").default("center"), // left, center, right
  stat1Value: text("stat1_value"),
  stat1Label: text("stat1_label"),
  stat2Value: text("stat2_value"),
  stat2Label: text("stat2_label"),
  stat3Value: text("stat3_value"),
  stat3Label: text("stat3_label"),
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

// Design Tokens - Global design system settings
export const designTokens = pgTable("design_tokens", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("default"),
  
  // Color Palette
  primaryColor: text("primary_color").default("#2563eb"),
  primaryColorLight: text("primary_color_light").default("#3b82f6"),
  primaryColorDark: text("primary_color_dark").default("#1d4ed8"),
  secondaryColor: text("secondary_color").default("#64748b"),
  accentColor: text("accent_color").default("#06b6d4"),
  backgroundColor: text("background_color").default("#ffffff"),
  backgroundColorDark: text("background_color_dark").default("#0f172a"),
  surfaceColor: text("surface_color").default("#f8fafc"),
  surfaceColorDark: text("surface_color_dark").default("#1e293b"),
  textColor: text("text_color").default("#0f172a"),
  textColorDark: text("text_color_dark").default("#f8fafc"),
  mutedColor: text("muted_color").default("#64748b"),
  borderColor: text("border_color").default("#e2e8f0"),
  
  // Typography
  fontFamily: text("font_family").default("Inter"),
  fontFamilyHeading: text("font_family_heading").default("Inter"),
  fontSizeBase: text("font_size_base").default("16px"),
  fontSizeScale: text("font_size_scale").default("1.25"), // modular scale ratio
  lineHeightBase: text("line_height_base").default("1.5"),
  lineHeightHeading: text("line_height_heading").default("1.2"),
  fontWeightNormal: text("font_weight_normal").default("400"),
  fontWeightMedium: text("font_weight_medium").default("500"),
  fontWeightBold: text("font_weight_bold").default("700"),
  letterSpacing: text("letter_spacing").default("0"),
  letterSpacingHeading: text("letter_spacing_heading").default("-0.02em"),
  
  // Spacing System
  spacingUnit: text("spacing_unit").default("4px"),
  spacingXs: text("spacing_xs").default("4px"),
  spacingSm: text("spacing_sm").default("8px"),
  spacingMd: text("spacing_md").default("16px"),
  spacingLg: text("spacing_lg").default("24px"),
  spacingXl: text("spacing_xl").default("32px"),
  spacing2xl: text("spacing_2xl").default("48px"),
  spacing3xl: text("spacing_3xl").default("64px"),
  
  // Border & Radius
  borderRadiusNone: text("border_radius_none").default("0"),
  borderRadiusSm: text("border_radius_sm").default("4px"),
  borderRadiusMd: text("border_radius_md").default("8px"),
  borderRadiusLg: text("border_radius_lg").default("12px"),
  borderRadiusXl: text("border_radius_xl").default("16px"),
  borderRadiusFull: text("border_radius_full").default("9999px"),
  borderWidth: text("border_width").default("1px"),
  
  // Shadows
  shadowNone: text("shadow_none").default("none"),
  shadowSm: text("shadow_sm").default("0 1px 2px 0 rgb(0 0 0 / 0.05)"),
  shadowMd: text("shadow_md").default("0 4px 6px -1px rgb(0 0 0 / 0.1)"),
  shadowLg: text("shadow_lg").default("0 10px 15px -3px rgb(0 0 0 / 0.1)"),
  shadowXl: text("shadow_xl").default("0 20px 25px -5px rgb(0 0 0 / 0.1)"),
  
  // Animations
  animationDuration: text("animation_duration").default("200ms"),
  animationDurationSlow: text("animation_duration_slow").default("400ms"),
  animationDurationFast: text("animation_duration_fast").default("100ms"),
  animationEasing: text("animation_easing").default("cubic-bezier(0.4, 0, 0.2, 1)"),
  enableAnimations: boolean("enable_animations").default(true),
  enableHoverEffects: boolean("enable_hover_effects").default(true),
  
  // Container
  containerMaxWidth: text("container_max_width").default("1280px"),
  containerPadding: text("container_padding").default("16px"),
  
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Section Design Settings - Per-section customization
export const sectionDesignSettings = pgTable("section_design_settings", {
  id: serial("id").primaryKey(),
  sectionName: text("section_name").notNull(), // hero, features, testimonials, cta, contact, footer
  
  // Layout
  layout: text("layout").default("center"), // left, center, right
  contentMaxWidth: text("content_max_width").default("1200px"),
  paddingTop: text("padding_top").default("80px"),
  paddingBottom: text("padding_bottom").default("80px"),
  paddingX: text("padding_x").default("16px"),
  gap: text("gap").default("24px"),
  
  // Background
  backgroundColor: text("background_color"), // null = use global
  backgroundGradient: text("background_gradient"),
  backgroundImage: text("background_image"),
  backgroundOverlayColor: text("background_overlay_color").default("rgba(0,0,0,0.6)"),
  backgroundOverlayOpacity: text("background_overlay_opacity").default("0.6"),
  backgroundBlur: text("background_blur").default("0"),
  backgroundParallax: boolean("background_parallax").default(false),
  
  // Typography overrides
  headingSize: text("heading_size"), // null = use scale
  headingWeight: text("heading_weight"),
  headingColor: text("heading_color"),
  textSize: text("text_size"),
  textColor: text("text_color"),
  
  // Grid (for features, testimonials)
  gridColumns: text("grid_columns").default("3"),
  gridColumnsTablet: text("grid_columns_tablet").default("2"),
  gridColumnsMobile: text("grid_columns_mobile").default("1"),
  gridGap: text("grid_gap").default("24px"),
  
  // Card Style (for features, testimonials)
  cardStyle: text("card_style").default("elevated"), // flat, elevated, outlined, glass
  cardPadding: text("card_padding").default("24px"),
  cardRadius: text("card_radius"),
  cardShadow: text("card_shadow"),
  cardBackground: text("card_background"),
  cardBorderColor: text("card_border_color"),
  cardHoverEffect: text("card_hover_effect").default("lift"), // none, lift, glow, scale
  
  // Icon Style
  iconStyle: text("icon_style").default("filled"), // filled, outlined, gradient
  iconSize: text("icon_size").default("24px"),
  iconColor: text("icon_color"),
  iconBackground: text("icon_background"),
  
  // Button Style
  buttonVariant: text("button_variant").default("default"), // default, outline, ghost, gradient
  buttonSize: text("button_size").default("default"), // sm, default, lg
  buttonRadius: text("button_radius"),
  
  // Animations
  animationType: text("animation_type").default("fade-up"), // none, fade, fade-up, slide, scale
  animationDelay: text("animation_delay").default("0"),
  animationStagger: text("animation_stagger").default("100ms"),
  
  // Special: Hero
  heroHeight: text("hero_height").default("auto"), // auto, full, 75vh, 50vh
  heroVideoUrl: text("hero_video_url"),
  heroVideoAutoplay: boolean("hero_video_autoplay").default(true),
  heroVideoLoop: boolean("hero_video_loop").default(true),
  heroVideoMuted: boolean("hero_video_muted").default(true),
  
  // Special: Testimonials
  testimonialLayout: text("testimonial_layout").default("grid"), // grid, carousel, masonry
  testimonialAvatarSize: text("testimonial_avatar_size").default("48px"),
  testimonialAvatarShape: text("testimonial_avatar_shape").default("circle"), // circle, rounded, square
  testimonialQuoteStyle: text("testimonial_quote_style").default("default"), // default, large, italic
  
  // Special: Footer
  footerColumns: text("footer_columns").default("4"),
  footerDivider: boolean("footer_divider").default(true),
  footerDividerColor: text("footer_divider_color"),
  
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Design Presets - Saved themes
export const designPresets = pgTable("design_presets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  thumbnail: text("thumbnail"),
  tokens: jsonb("tokens").notNull(), // Full design token config
  sectionSettings: jsonb("section_settings"), // Section-specific overrides
  isBuiltIn: boolean("is_built_in").default(false), // System presets
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
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

// CMS Content Versions (for version history and restore)
export const contentVersions = pgTable("content_versions", {
  id: serial("id").primaryKey(),
  contentType: text("content_type").notNull(), // hero, features, testimonials, cta, blog_post, navigation, form, seo, design_tokens
  contentId: integer("content_id"), // ID of the specific item (null for global settings)
  versionNumber: integer("version_number").notNull().default(1),
  data: jsonb("data").notNull(), // Snapshot of the content
  changeDescription: text("change_description"), // Optional description of what changed
  changedBy: text("changed_by"), // Username or email of who made the change
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

// Report Comments table - for feedback workflow
export const reportComments = pgTable("report_comments", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name"),
  authorRole: text("author_role").default("user"), // user, admin, reviewer
  content: text("content").notNull(),
  isInternal: boolean("is_internal").default(false), // internal notes not visible to user
  parentId: integer("parent_id"), // for threaded replies
  readAt: timestamp("read_at"), // when the recipient read the comment
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReportCommentSchema = createInsertSchema(reportComments).omit({ id: true, createdAt: true, updatedAt: true, readAt: true });
export type InsertReportComment = z.infer<typeof insertReportCommentSchema>;
export type ReportComment = typeof reportComments.$inferSelect;

// Design System Insert schemas
export const insertDesignTokensSchema = createInsertSchema(designTokens).omit({ id: true, updatedAt: true });
export const insertSectionDesignSettingsSchema = createInsertSchema(sectionDesignSettings).omit({ id: true, updatedAt: true });
export const insertDesignPresetSchema = createInsertSchema(designPresets).omit({ id: true, createdAt: true, updatedAt: true });

// Content Versions Insert schema
export const insertContentVersionSchema = createInsertSchema(contentVersions).omit({ id: true, createdAt: true });

// GA4 Analytics Settings
export const analyticsSettings = pgTable("analytics_settings", {
  id: serial("id").primaryKey(),
  ga4MeasurementId: text("ga4_measurement_id"),
  ga4StreamId: text("ga4_stream_id"),
  enableTracking: boolean("enable_tracking").default(false),
  enablePageViews: boolean("enable_page_views").default(true),
  enableEvents: boolean("enable_events").default(true),
  enableConsentMode: boolean("enable_consent_mode").default(true),
  cookieConsent: text("cookie_consent").default("required"),
  excludedPaths: text("excluded_paths").array(),
  customEvents: jsonb("custom_events"),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAnalyticsSettingsSchema = createInsertSchema(analyticsSettings).omit({ id: true, updatedAt: true });

// SEO Page Settings
export const seoPages = pgTable("seo_pages", {
  id: serial("id").primaryKey(),
  pagePath: text("page_path").notNull().unique(),
  title: text("title"),
  metaDescription: text("meta_description"),
  metaKeywords: text("meta_keywords"),
  canonicalUrl: text("canonical_url"),
  ogTitle: text("og_title"),
  ogDescription: text("og_description"),
  ogImage: text("og_image"),
  ogType: text("og_type").default("website"),
  twitterCard: text("twitter_card").default("summary_large_image"),
  twitterTitle: text("twitter_title"),
  twitterDescription: text("twitter_description"),
  twitterImage: text("twitter_image"),
  robotsIndex: boolean("robots_index").default(true),
  robotsFollow: boolean("robots_follow").default(true),
  structuredData: jsonb("structured_data"),
  priority: real("priority").default(0.5),
  changeFrequency: text("change_frequency").default("weekly"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSeoPageSchema = createInsertSchema(seoPages).omit({ id: true, createdAt: true, updatedAt: true });

// Global SEO Settings
export const seoGlobalSettings = pgTable("seo_global_settings", {
  id: serial("id").primaryKey(),
  siteName: text("site_name"),
  siteDescription: text("site_description"),
  defaultOgImage: text("default_og_image"),
  faviconUrl: text("favicon_url"),
  googleVerification: text("google_verification"),
  bingVerification: text("bing_verification"),
  robotsTxt: text("robots_txt"),
  sitemapEnabled: boolean("sitemap_enabled").default(true),
  sitemapAutoGenerate: boolean("sitemap_auto_generate").default(true),
  lastSitemapGenerated: timestamp("last_sitemap_generated"),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSeoGlobalSettingsSchema = createInsertSchema(seoGlobalSettings).omit({ id: true, updatedAt: true });

// Email Templates
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull(),
  textContent: text("text_content"),
  variables: text("variables").array(),
  category: text("category").default("general"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true, updatedAt: true });

// Email Send History
export const emailSendHistory = pgTable("email_send_history", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => emailTemplates.id),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  subject: text("subject").notNull(),
  status: text("status").default("pending"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmailSendHistorySchema = createInsertSchema(emailSendHistory).omit({ id: true, createdAt: true });

// Email Settings (SMTP config)
export const emailSettings = pgTable("email_settings", {
  id: serial("id").primaryKey(),
  provider: text("provider").default("smtp"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587),
  smtpSecure: boolean("smtp_secure").default(false),
  smtpUser: text("smtp_user"),
  fromEmail: text("from_email"),
  fromName: text("from_name"),
  replyToEmail: text("reply_to_email"),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmailSettingsSchema = createInsertSchema(emailSettings).omit({ id: true, updatedAt: true });

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

// Design System Types
export type DesignTokens = typeof designTokens.$inferSelect;
export type InsertDesignTokens = z.infer<typeof insertDesignTokensSchema>;
export type SectionDesignSettings = typeof sectionDesignSettings.$inferSelect;
export type InsertSectionDesignSettings = z.infer<typeof insertSectionDesignSettingsSchema>;
export type DesignPreset = typeof designPresets.$inferSelect;
export type InsertDesignPreset = z.infer<typeof insertDesignPresetSchema>;

// Content Versions Types
export type ContentVersion = typeof contentVersions.$inferSelect;
export type InsertContentVersion = z.infer<typeof insertContentVersionSchema>;

// Analytics Types
export type AnalyticsSettings = typeof analyticsSettings.$inferSelect;
export type InsertAnalyticsSettings = z.infer<typeof insertAnalyticsSettingsSchema>;

// SEO Types
export type SeoPage = typeof seoPages.$inferSelect;
export type InsertSeoPage = z.infer<typeof insertSeoPageSchema>;
export type SeoGlobalSettings = typeof seoGlobalSettings.$inferSelect;
export type InsertSeoGlobalSettings = z.infer<typeof insertSeoGlobalSettingsSchema>;

// Email Types
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailSendHistory = typeof emailSendHistory.$inferSelect;
export type InsertEmailSendHistory = z.infer<typeof insertEmailSendHistorySchema>;
export type EmailSettings = typeof emailSettings.$inferSelect;
export type InsertEmailSettings = z.infer<typeof insertEmailSettingsSchema>;

// Report Templates - For customizable case report designs
export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  vendorId: integer("vendor_id"), // null = global template, otherwise vendor-specific
  companyId: integer("company_id"), // null = global template
  
  // Template type for privacy rules
  templateType: text("template_type").default("standard"), // standard, miljoarbeider
  privacyNoticeEnabled: boolean("privacy_notice_enabled").default(false),
  privacyNoticeText: text("privacy_notice_text"),
  
  // Paper settings
  paperSize: text("paper_size").default("A4"), // A4, Letter, Legal
  orientation: text("orientation").default("portrait"), // portrait, landscape
  marginTop: text("margin_top").default("20mm"),
  marginBottom: text("margin_bottom").default("20mm"),
  marginLeft: text("margin_left").default("15mm"),
  marginRight: text("margin_right").default("15mm"),
  
  // Header settings
  headerEnabled: boolean("header_enabled").default(true),
  headerHeight: text("header_height").default("25mm"),
  headerLogoUrl: text("header_logo_url"),
  headerLogoPosition: text("header_logo_position").default("left"), // left, center, right
  headerTitle: text("header_title"),
  headerSubtitle: text("header_subtitle"),
  headerShowDate: boolean("header_show_date").default(true),
  headerShowPageNumbers: boolean("header_show_page_numbers").default(true),
  
  // Footer settings
  footerEnabled: boolean("footer_enabled").default(true),
  footerHeight: text("footer_height").default("15mm"),
  footerText: text("footer_text"),
  footerShowPageNumbers: boolean("footer_show_page_numbers").default(true),
  
  // Styling
  primaryColor: text("primary_color").default("#2563EB"),
  secondaryColor: text("secondary_color").default("#64748B"),
  fontFamily: text("font_family").default("Helvetica"),
  fontSize: text("font_size").default("11pt"),
  lineHeight: text("line_height").default("1.5"),
  
  // Content blocks (JSON array of block configurations)
  blocks: jsonb("blocks").default([]),
  
  // Metadata
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Report Block Types - Available block types for report designer
export const reportBlockTypes = pgTable("report_block_types", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().unique(), // header, text, section, table, signature, divider, image, spacer
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  defaultConfig: jsonb("default_config").default({}),
  availableFields: text("available_fields").array(), // Fields that can be bound to this block
  isActive: boolean("is_active").default(true),
});

// Report Generated - History of generated reports
export const reportGenerated = pgTable("report_generated", {
  id: serial("id").primaryKey(),
  caseReportId: integer("case_report_id").notNull(),
  templateId: integer("template_id").notNull(),
  generatedBy: text("generated_by"),
  pdfUrl: text("pdf_url"),
  metadata: jsonb("metadata"), // Snapshot of data used
  createdAt: timestamp("created_at").defaultNow(),
});

// Report Assets - Uploaded logos and images for reports
export const reportAssets = pgTable("report_assets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  name: text("name").notNull(),
  type: text("type").notNull(), // logo, signature, watermark, background
  url: text("url").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  width: integer("width"),
  height: integer("height"),
  isActive: boolean("is_active").default(true),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Report Template Insert Schemas
export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReportBlockTypeSchema = createInsertSchema(reportBlockTypes).omit({ id: true });
export const insertReportGeneratedSchema = createInsertSchema(reportGenerated).omit({ id: true, createdAt: true });
export const insertReportAssetSchema = createInsertSchema(reportAssets).omit({ id: true, createdAt: true });

// Report Template Types
export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;
export type ReportBlockType = typeof reportBlockTypes.$inferSelect;
export type InsertReportBlockType = z.infer<typeof insertReportBlockTypeSchema>;
export type ReportGenerated = typeof reportGenerated.$inferSelect;
export type InsertReportGenerated = z.infer<typeof insertReportGeneratedSchema>;
export type ReportAsset = typeof reportAssets.$inferSelect;
export type InsertReportAsset = z.infer<typeof insertReportAssetSchema>;

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
