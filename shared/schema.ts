import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TEAMS / DASHBOARD DATA ===
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // Team Name (e.g., "서울지사")
  year: integer("year").notNull().default(2025),
  
  // Input fields
  vehicleCount: integer("vehicle_count").notNull().default(0),
  workAccident: integer("work_accident").notNull().default(0), // -40
  
  // Fines
  fineSpeed: integer("fine_speed").notNull().default(0), // -1
  fineSignal: integer("fine_signal").notNull().default(0), // -1
  fineLane: integer("fine_lane").notNull().default(0), // -1
  
  // Others
  inspectionMiss: integer("inspection_miss").notNull().default(0), // -3
  suggestion: integer("suggestion").notNull().default(0), // +3
  activity: integer("activity").notNull().default(0), // +3
  
  // Vehicle Accidents (JSON to store counts per band)
  // { p50_59: 0, p60_69: 0, ... }
  vehicleAccidents: jsonb("vehicle_accidents").$type<Record<string, number>>().notNull().default({}),
  
  // Calculated Score (Stored or calculated on fly? Stored is easier for sorting)
  totalScore: integer("total_score").notNull().default(100),
  rank: integer("rank").default(0),
});

// === NOTICES / RULES / EDUCATION ===
export const notices = pgTable("notices", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // 'rule', 'notice', 'edu'
  title: text("title").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === SETTINGS ===
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").unique().notNull(), // 'global_lock', 'admin_pin'
  value: text("value").notNull(),
});

// === VEHICLES ===
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  plateNumber: text("plate_number").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  model: text("model").notNull(),
  year: integer("year"),
  team: text("team").notNull(),
  driver: text("driver"),
  secondDriver: text("second_driver"),
  contact: text("contact"),
  status: text("status").notNull().default("운행중"),
  purchaseDate: text("purchase_date"),
  inspectionDate: text("inspection_date"),
  insuranceExpiry: text("insurance_expiry"),
  mileage: integer("mileage").default(0),
  notes: text("notes"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === SCHEMAS ===
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, totalScore: true, rank: true });
export const insertNoticeSchema = createInsertSchema(notices).omit({ id: true, createdAt: true });
export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true, createdAt: true });

// === TYPES ===
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Notice = typeof notices.$inferSelect;
export type InsertNotice = z.infer<typeof insertNoticeSchema>;
export type Setting = typeof settings.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;

// Request Types
export type CreateTeamRequest = InsertTeam;
export type UpdateTeamRequest = Partial<InsertTeam>;
export type CreateNoticeRequest = InsertNotice;
export type CreateVehicleRequest = InsertVehicle;
export type UpdateVehicleRequest = Partial<InsertVehicle>;

// === SAFETY EQUIPMENT ===
export const safetyEquipment = pgTable("safety_equipment", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // '보호구', '안전용품', '기타품목'
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSafetyEquipmentSchema = createInsertSchema(safetyEquipment).omit({ id: true, createdAt: true });
export type SafetyEquipment = typeof safetyEquipment.$inferSelect;
export type InsertSafetyEquipment = z.infer<typeof insertSafetyEquipmentSchema>;

// === CONVERSATIONS (AI Chatbot) ===
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// === SAFETY INSPECTIONS ===
export const safetyInspections = pgTable("safety_inspections", {
  id: serial("id").primaryKey(),
  inspectionType: text("inspection_type").notNull(), // '안전점검', '동행점검'
  title: text("title").notNull(),
  location: text("location"), // 점검국소
  inspector: text("inspector"), // 작업자
  inspectionDate: text("inspection_date").notNull(),
  checklist: jsonb("checklist").$type<Array<{ item: string; status: '양호' | '미흡' | '미점검' }>>().notNull().default([]),
  notes: text("notes"),
  images: text("images").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSafetyInspectionSchema = createInsertSchema(safetyInspections).omit({ id: true, createdAt: true });
export type SafetyInspection = typeof safetyInspections.$inferSelect;
export type InsertSafetyInspection = z.infer<typeof insertSafetyInspectionSchema>;

// === VEHICLE LOGS ===
export const vehicleLogs = pgTable("vehicle_logs", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull(),
  plateNumber: text("plate_number").notNull(),
  vehicleModel: text("vehicle_model").notNull(),
  team: text("team").notNull(),
  driver: text("driver").notNull(),
  logDate: text("log_date").notNull(),
  departureTime: text("departure_time"),
  arrivalTime: text("arrival_time"),
  departureLocation: text("departure_location"),
  arrivalLocation: text("arrival_location"),
  purpose: text("purpose"),
  beforeMileage: integer("before_mileage").default(0),
  afterMileage: integer("after_mileage").default(0),
  fuelAmount: text("fuel_amount"),
  fuelReceiptUrl: text("fuel_receipt_url"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVehicleLogSchema = createInsertSchema(vehicleLogs).omit({ id: true, createdAt: true });
export type VehicleLog = typeof vehicleLogs.$inferSelect;
export type InsertVehicleLog = z.infer<typeof insertVehicleLogSchema>;

// === EDUCATION SESSIONS (교육일지) ===
export const educationSessions = pgTable("education_sessions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  educationDate: text("education_date").notNull(),
  department: text("department").notNull(),
  educationType: text("education_type").notNull().default("정기교육"),
  instructor: text("instructor"),
  totalParticipants: integer("total_participants").notNull().default(0),
  description: text("description"),
  images: text("images").array().notNull().default([]),
  status: text("status").notNull().default("진행중"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const educationSignatures = pgTable("education_signatures", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  signerName: text("signer_name").notNull(),
  signerDepartment: text("signer_department"),
  signatureData: text("signature_data").notNull(),
  signedAt: timestamp("signed_at").defaultNow(),
});

export const insertEducationSessionSchema = createInsertSchema(educationSessions).omit({ id: true, createdAt: true });
export const insertEducationSignatureSchema = createInsertSchema(educationSignatures).omit({ id: true, signedAt: true });
export type EducationSession = typeof educationSessions.$inferSelect;
export type InsertEducationSession = z.infer<typeof insertEducationSessionSchema>;
export type EducationSignature = typeof educationSignatures.$inferSelect;
export type InsertEducationSignature = z.infer<typeof insertEducationSignatureSchema>;

// Export auth schema
export * from "./models/auth";
