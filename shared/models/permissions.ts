import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const permissions = pgTable("tidum_permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  label: text("label").notNull(),
  module: varchar("module").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const roles = pgTable(
  "tidum_roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name").notNull(),
    scope: varchar("scope").notNull(),
    vendorId: integer("vendor_id"),
    isSystemDefault: boolean("is_system_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // NB: actual unique constraint in migrations/054_role_permission_system.sql uses
    // COALESCE(vendor_id, -1) for NULL-handling; this Drizzle index is a typed
    // descriptor for query-building only. migrations/*.sql is the source of truth for
    // actual schema (see also role backfill UPDATE statement that relies on this).
    uniqueIndex("tidum_roles_scope_vendor_name_key").on(table.scope, table.vendorId, table.name),
  ],
);

export const rolePermissions = pgTable(
  "tidum_role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("tidum_role_permissions_role_permission_key").on(table.roleId, table.permissionId),
  ],
);

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
