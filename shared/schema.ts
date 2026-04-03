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
  fileName: text("file_name"),
  fileType: text("file_type"),
  attachments: jsonb("attachments").$type<Array<{ url: string; name: string; type: string }>>(),
  createdBy: text("created_by"),
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
  createdBy: text("created_by"),
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
  inspector: text("inspector"), // 점검자
  workerName: text("worker_name"), // 작업자
  inspectionDate: text("inspection_date").notNull(),
  checklist: jsonb("checklist").$type<Array<{ item: string; status: '양호' | '미흡' | '미점검' }>>().notNull().default([]),
  notes: text("notes"),
  images: text("images").array().notNull().default([]),
  createdBy: text("created_by"),
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
  materialAttachments: jsonb("material_attachments").$type<Array<{url: string; name: string; type: string}>>().default([]),
});

export const educationSignatures = pgTable("education_signatures", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  signerName: text("signer_name").notNull(),
  signerDepartment: text("signer_department"),
  signatureData: text("signature_data").notNull(),
  signedAt: timestamp("signed_at").defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  consentAgreed: boolean("consent_agreed").default(false),
  integrityHash: text("integrity_hash"),
});

export const insertEducationSessionSchema = createInsertSchema(educationSessions).omit({ id: true, createdAt: true });
export const insertEducationSignatureSchema = createInsertSchema(educationSignatures).omit({ id: true, signedAt: true });
export type EducationSession = typeof educationSessions.$inferSelect;
export type InsertEducationSession = z.infer<typeof insertEducationSessionSchema>;
export type EducationSignature = typeof educationSignatures.$inferSelect;
export type InsertEducationSignature = z.infer<typeof insertEducationSignatureSchema>;

// === MSDS (물질안전보건자료) ===
export const chemicals = pgTable("chemicals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  casNumber: text("cas_number"),
  category: text("category"),
  hazards: text("hazards"),
  emergencyProcedures: text("emergency_procedures"),
  handlingPrecautions: text("handling_precautions"),
  storageRequirements: text("storage_requirements"),
  ppe: text("ppe"),
  firstAid: text("first_aid"),
  notes: text("notes"),
  pdfUrl: text("pdf_url"),
  pdfFileName: text("pdf_file_name"),
  pdfFileType: text("pdf_file_type"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChemicalSchema = createInsertSchema(chemicals).omit({ id: true, createdAt: true });
export type Chemical = typeof chemicals.$inferSelect;
export type InsertChemical = z.infer<typeof insertChemicalSchema>;

// === 근골격계질환 (Musculoskeletal Disease) ===
export const musculoskeletalAssessments = pgTable("musculoskeletal_assessments", {
  id: serial("id").primaryKey(),
  department: text("department").notNull(),
  task: text("task").notNull(),
  hazardFactor: text("hazard_factor").notNull(),
  riskLevel: text("risk_level").notNull(),
  currentMeasures: text("current_measures"),
  improvementPlan: text("improvement_plan"),
  assessmentDate: text("assessment_date"),
  assessor: text("assessor"),
  status: text("status").notNull().default("진행중"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMusculoskeletalAssessmentSchema = createInsertSchema(musculoskeletalAssessments).omit({ id: true, createdAt: true });
export type MusculoskeletalAssessment = typeof musculoskeletalAssessments.$inferSelect;
export type InsertMusculoskeletalAssessment = z.infer<typeof insertMusculoskeletalAssessmentSchema>;

// === 위험성평가 (Risk Assessment - KRAS) ===
export const riskAssessments = pgTable("risk_assessments", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  assessmentType: text("assessment_type").notNull(),
  department: text("department").notNull(),
  process: text("process"),
  hazard: text("hazard").notNull(),
  hazardType: text("hazard_type"),
  currentControls: text("current_controls"),
  frequency: integer("frequency").notNull().default(1),
  severity: integer("severity").notNull().default(1),
  riskScore: integer("risk_score").notNull().default(1),
  riskLevel: text("risk_level").notNull().default("저"),
  controlMeasures: text("control_measures"),
  assessor: text("assessor"),
  assessmentDate: text("assessment_date").notNull(),
  status: text("status").notNull().default("진행중"),
  createdBy: text("created_by"),
  beforePhotoUrl: text("before_photo_url"),
  afterPhotoUrl: text("after_photo_url"),
  improvementMeasures: text("improvement_measures"),
  plannedDate: text("planned_date"),
  completionDate: text("completion_date"),
  afterFrequency: integer("after_frequency"),
  afterSeverity: integer("after_severity"),
  afterRiskScore: integer("after_risk_score"),
  afterRiskLevel: text("after_risk_level"),
  improvementStatus: text("improvement_status").default("미완료"),
  responsibleTask: text("responsible_task"),
  departmentHead: text("department_head"),
  approvalStatus: text("approval_status").default("승인대기"),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  currentIssue: text("current_issue"),
  relatedLaw: text("related_law"),
  equipmentId: text("equipment_id"),
  equipmentName: text("equipment_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRiskAssessmentSchema = createInsertSchema(riskAssessments).omit({ id: true, createdAt: true });
export type RiskAssessment = typeof riskAssessments.$inferSelect;
export type InsertRiskAssessment = z.infer<typeof insertRiskAssessmentSchema>;

// === 사고보고 (Accident Reports) ===
export const accidentReports = pgTable("accident_reports", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  occurredAt: text("occurred_at").notNull(),
  accidentType: text("accident_type").notNull(),
  cause: text("cause").notNull(),
  severity: text("severity").notNull(),
  department: text("department").notNull(),
  location: text("location"),
  description: text("description").notNull(),
  injuredPerson: text("injured_person"),
  correctiveActions: text("corrective_actions"),
  preventiveMeasures: text("preventive_measures"),
  status: text("status").notNull().default("접수"),
  images: text("images").array().notNull().default([]),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  reporterName: text("reporter_name"),
  reporterPosition: text("reporter_position"),
  companion: text("companion"),
  vehicleInfo: text("vehicle_info"),
  progressDetails: text("progress_details"),
  accidentOverview: text("accident_overview"),
  causeDetail: text("cause_detail"),
  preventionPlan: text("prevention_plan"),
  signature: text("signature"),
  imageCaptions: text("image_captions"),
  faultRate: integer("fault_rate"),
});

export const insertAccidentReportSchema = createInsertSchema(accidentReports).omit({ id: true, createdAt: true });
export type AccidentReport = typeof accidentReports.$inferSelect;
export type InsertAccidentReport = z.infer<typeof insertAccidentReportSchema>;

// === 신규 상품요청 (New Equipment Requests) ===
export const newEquipmentRequests = pgTable("new_equipment_requests", {
  id: serial("id").primaryKey(),
  itemName: text("item_name").notNull(),
  category: text("category").notNull(),
  reason: text("reason").notNull(),
  quantity: integer("quantity").notNull().default(1),
  urgency: text("urgency").notNull().default("보통"),
  department: text("department"),
  requestedBy: text("requested_by"),
  status: text("status").notNull().default("대기"),
  adminNote: text("admin_note"),
  imageUrl: text("image_url"),
  referenceUrl: text("reference_url"),
  isReadByAdmin: boolean("is_read_by_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNewEquipmentRequestSchema = createInsertSchema(newEquipmentRequests).omit({ id: true, createdAt: true });
export type NewEquipmentRequest = typeof newEquipmentRequests.$inferSelect;
export type InsertNewEquipmentRequest = z.infer<typeof insertNewEquipmentRequestSchema>;

// === TRAFFIC FINES (과태료 현황) ===
export const trafficFines = pgTable("traffic_fines", {
  id: serial("id").primaryKey(),
  violationDate: text("violation_date"),           // 위반일시
  licensePlate: text("license_plate"),             // 차량번호
  vehicleType: text("vehicle_type"),               // 차종
  department: text("department"),                  // 소속
  driver: text("driver"),                          // 운전자
  violationType: text("violation_type"),           // 위반내역
  violationLocation: text("violation_location"),   // 적발장소
  amount: integer("amount"),                       // 과태료금액(원)
  paymentDestination: text("payment_destination"), // 수납처
  note: text("note"),                              // 비고
  requestDate: text("request_date"),               // 납부요청일 (등록일 자동입력)
  paymentStatus: text("payment_status").notNull().default("미납"), // 미납/납부완료
  paidAt: text("paid_at"),                         // 납부일자
  pdfUrl: text("pdf_url"),                         // 업로드된 PDF 경로
  thumbnailUrl: text("thumbnail_url"),             // PDF 썸네일 이미지 경로
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTrafficFineSchema = createInsertSchema(trafficFines).omit({ id: true, createdAt: true });
export type TrafficFine = typeof trafficFines.$inferSelect;
export type InsertTrafficFine = z.infer<typeof insertTrafficFineSchema>;

export const workPlans = pgTable("work_plans", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  originalFileName: text("original_file_name"),
  originalFileUrl: text("original_file_url"),
  processedFileUrl: text("processed_file_url"),
  emailDraft: text("email_draft"),
  sheetSummary: text("sheet_summary"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkPlanSchema = createInsertSchema(workPlans).omit({ id: true, createdAt: true });
export type WorkPlan = typeof workPlans.$inferSelect;
export type InsertWorkPlan = z.infer<typeof insertWorkPlanSchema>;

// === MUSIC FILES (자동 재생 음악) ===
export const musicFiles = pgTable("music_files", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  url: text("url").notNull(),
  scheduleType: text("schedule_type").notNull().default("all"), // '출근' | '퇴근' | 'all'
  fileSize: integer("file_size"),
  uploadedBy: text("uploaded_by"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertMusicFileSchema = createInsertSchema(musicFiles).omit({ id: true, uploadedAt: true });
export type MusicFile = typeof musicFiles.$inferSelect;
export type InsertMusicFile = z.infer<typeof insertMusicFileSchema>;

// === FUEL RECORDS (유류비 현황) ===
export const fuelRecords = pgTable("fuel_records", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  team: text("team"),
  driver: text("driver"),
  acquisitionType: text("acquisition_type"),   // 렌트/자차/리스
  vehicleType: text("vehicle_type"),            // 경차/RV/SUV/기타/EV 등
  modelName: text("model_name"),
  licensePlate: text("license_plate"),
  fuelType: text("fuel_type"),                 // 경유/휘발유/EV
  avgOperatingDays: integer("avg_operating_days").default(0),
  totalDistance: integer("total_distance").default(0),
  businessDistance: integer("business_distance").default(0),
  // 법인카드
  cardFuelCost: integer("card_fuel_cost").default(0),
  cardHighpass: integer("card_highpass").default(0),
  cardParking: integer("card_parking").default(0),
  cardToll: integer("card_toll").default(0),
  cardCarWash: integer("card_car_wash").default(0),
  cardFerry: integer("card_ferry").default(0),
  cardRepair: integer("card_repair").default(0),
  cardMaintenance: integer("card_maintenance").default(0),
  cardEmergencyFuel: integer("card_emergency_fuel").default(0),
  cardGeneratorFuel: integer("card_generator_fuel").default(0),
  // 현금
  cashFuelCost: integer("cash_fuel_cost").default(0),
  cashHighpass: integer("cash_highpass").default(0),
  cashParking: integer("cash_parking").default(0),
  cashToll: integer("cash_toll").default(0),
  cashCarWash: integer("cash_car_wash").default(0),
  cashFerry: integer("cash_ferry").default(0),
  cashRepair: integer("cash_repair").default(0),
  cashMaintenance: integer("cash_maintenance").default(0),
  cashEmergencyFuel: integer("cash_emergency_fuel").default(0),
  cashGeneratorFuel: integer("cash_generator_fuel").default(0),
  // 합계
  totalCost: integer("total_cost").default(0),
  avgCostPerKm: integer("avg_cost_per_km").default(0),
  // 업로드 배치
  uploadBatch: text("upload_batch"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFuelRecordSchema = createInsertSchema(fuelRecords).omit({ id: true, createdAt: true });
export type FuelRecord = typeof fuelRecords.$inferSelect;
export type InsertFuelRecord = z.infer<typeof insertFuelRecordSchema>;

// Export auth schema
export * from "./models/auth";

// Export chat schema
export * from "./models/chat";
