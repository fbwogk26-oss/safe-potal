import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table for custom auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export interface UserPermissions {
  editDashboard: boolean;
  editSafetyScores: boolean;
  editVehicles: boolean;
  editEquipmentStatus: boolean;
  registerRules: boolean;
  registerNotices: boolean;
  registerEducation: boolean;
  editEducationLogs: boolean;
  editInspections: boolean;
  manageEquipmentRequests: boolean;
  addEquipmentMaterials: boolean;
  editDigitalBoard: boolean;
  editVehicleLogs: boolean;
  manageAccessRequests: boolean;
}

export const DEFAULT_PERMISSIONS: UserPermissions = {
  editDashboard: false,
  editSafetyScores: false,
  editVehicles: false,
  editEquipmentStatus: false,
  registerRules: false,
  registerNotices: false,
  registerEducation: false,
  editEducationLogs: false,
  editInspections: false,
  manageEquipmentRequests: false,
  addEquipmentMaterials: false,
  editDigitalBoard: false,
  editVehicleLogs: false,
  manageAccessRequests: false,
};

export const ALL_PERMISSIONS: UserPermissions = {
  editDashboard: true,
  editSafetyScores: true,
  editVehicles: true,
  editEquipmentStatus: true,
  registerRules: true,
  registerNotices: true,
  registerEducation: true,
  editEducationLogs: true,
  editInspections: true,
  manageEquipmentRequests: true,
  addEquipmentMaterials: true,
  editDigitalBoard: true,
  editVehicleLogs: true,
  manageAccessRequests: true,
};

// User storage table with username/password for custom auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  password: varchar("password").notNull(),
  name: varchar("name"),
  department: varchar("department"),
  role: varchar("role").notNull().default("user"),
  permissions: jsonb("permissions").$type<UserPermissions>().notNull().default(DEFAULT_PERMISSIONS),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const securityLogs = pgTable("security_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type").notNull(),
  userId: varchar("user_id"),
  username: varchar("username"),
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  details: varchar("details"),
  success: boolean("success").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SecurityLog = typeof securityLogs.$inferSelect;
