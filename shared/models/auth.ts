import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table with vendor and role support.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // Role: 'super_admin', 'vendor_admin', 'user' (default)
  role: varchar("role").default("user"),
  // Vendor ID - null for super_admin, required for vendor_admin and user
  vendorId: integer("vendor_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Profile / settings fields
  phone: varchar("phone", { length: 32 }),
  language: varchar("language", { length: 8 }).notNull().default("no"),
  notificationEmail: boolean("notification_email").notNull().default(true),
  notificationPush: boolean("notification_push").notNull().default(false),
  notificationWeekly: boolean("notification_weekly").notNull().default(true),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const eidIdentities = pgTable(
  "eid_identities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider").notNull(),
    sub: text("sub").notNull(),
    ssnHash: text("ssn_hash").notNull(),
    givenName: text("given_name"),
    familyName: text("family_name"),
    fullName: text("full_name"),
    rawClaims: jsonb("raw_claims"),
    verifiedAt: timestamp("verified_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("eid_identities_user_provider_key").on(table.userId, table.provider),
    uniqueIndex("eid_identities_ssn_provider_key").on(table.ssnHash, table.provider),
    index("eid_identities_ssn_idx").on(table.ssnHash),
  ],
);

export type EidIdentity = typeof eidIdentities.$inferSelect;
export type NewEidIdentity = typeof eidIdentities.$inferInsert;

export const mobileRefreshTokens = pgTable("mobile_refresh_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MobileRefreshToken = typeof mobileRefreshTokens.$inferSelect;

export const authLoginEvents = pgTable(
  "auth_login_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    provider: varchar("provider").notNull(),
    userId: varchar("user_id").references(() => users.id),
    sessionId: text("session_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("auth_login_events_user_idx").on(table.userId, table.createdAt)],
);

export type AuthLoginEvent = typeof authLoginEvents.$inferSelect;
export type NewAuthLoginEvent = typeof authLoginEvents.$inferInsert;
