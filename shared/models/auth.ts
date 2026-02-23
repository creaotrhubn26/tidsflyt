import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

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
