import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

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
  editAccidents: boolean;
  editRiskAssessment: boolean;
  editMsds: boolean;
  editMusculoskeletal: boolean;
  uploadDashboardData: boolean;
  uploadEducationPhotos: boolean;
  uploadInspectionPhotos: boolean;
  uploadAccidentPhotos: boolean;
  downloadEducationExcel: boolean;
  downloadInspectionExcel: boolean;
  downloadAccidentReport: boolean;
  downloadVehicleExcel: boolean;
  downloadVehicleLogExcel: boolean;
  downloadAccessExcel: boolean;
  downloadEquipmentExcel: boolean;
  downloadMsdsPdf: boolean;
  downloadRulesFiles: boolean;
  downloadEducationFiles: boolean;
  downloadRiskAssessmentExcel: boolean;
  viewDashboard: boolean;
  viewNotices: boolean;
  viewDigitalBoard: boolean;
  viewRules: boolean;
  viewAccidents: boolean;
  viewEquipmentStatus: boolean;
  viewEquipment: boolean;
  viewEducation: boolean;
  viewEducationLogs: boolean;
  viewInspections: boolean;
  viewRiskAssessment: boolean;
  viewMsds: boolean;
  viewMusculoskeletal: boolean;
  viewVehicle: boolean;
  viewVehicleLogs: boolean;
  viewAccess: boolean;
  viewSubcontract: boolean;
  editSubcontract: boolean;
  viewAttendance: boolean;
  editAttendance: boolean;
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
  editAccidents: false,
  editRiskAssessment: false,
  editMsds: false,
  editMusculoskeletal: false,
  uploadDashboardData: false,
  uploadEducationPhotos: false,
  uploadInspectionPhotos: false,
  uploadAccidentPhotos: false,
  downloadEducationExcel: false,
  downloadInspectionExcel: false,
  downloadAccidentReport: false,
  downloadVehicleExcel: false,
  downloadVehicleLogExcel: false,
  downloadAccessExcel: false,
  downloadEquipmentExcel: false,
  downloadMsdsPdf: false,
  downloadRulesFiles: false,
  downloadEducationFiles: false,
  downloadRiskAssessmentExcel: false,
  viewDashboard: true,
  viewNotices: true,
  viewDigitalBoard: true,
  viewRules: true,
  viewAccidents: true,
  viewEquipmentStatus: true,
  viewEquipment: true,
  viewEducation: true,
  viewEducationLogs: true,
  viewInspections: true,
  viewRiskAssessment: true,
  viewMsds: true,
  viewMusculoskeletal: true,
  viewVehicle: true,
  viewVehicleLogs: true,
  viewAccess: true,
  viewSubcontract: true,
  editSubcontract: false,
  viewAttendance: true,
  editAttendance: false,
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
  editAccidents: true,
  editRiskAssessment: true,
  editMsds: true,
  editMusculoskeletal: true,
  uploadDashboardData: true,
  uploadEducationPhotos: true,
  uploadInspectionPhotos: true,
  uploadAccidentPhotos: true,
  downloadEducationExcel: true,
  downloadInspectionExcel: true,
  downloadAccidentReport: true,
  downloadVehicleExcel: true,
  downloadVehicleLogExcel: true,
  downloadAccessExcel: true,
  downloadEquipmentExcel: true,
  downloadMsdsPdf: true,
  downloadRulesFiles: true,
  downloadEducationFiles: true,
  downloadRiskAssessmentExcel: true,
  viewDashboard: true,
  viewNotices: true,
  viewDigitalBoard: true,
  viewRules: true,
  viewAccidents: true,
  viewEquipmentStatus: true,
  viewEquipment: true,
  viewEducation: true,
  viewEducationLogs: true,
  viewInspections: true,
  viewRiskAssessment: true,
  viewMsds: true,
  viewMusculoskeletal: true,
  viewVehicle: true,
  viewVehicleLogs: true,
  viewAccess: true,
  viewSubcontract: true,
  editSubcontract: true,
  viewAttendance: true,
  editAttendance: true,
};

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
  isActive: boolean("is_active").notNull().default(true),
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
