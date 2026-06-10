import { db } from "./db";
import {
  teams, notices, settings, safetyEquipment, safetyInspections,
  educationSessions, educationSignatures,
  users, vehicles,
  chemicals, riskAssessments, accidentReports, newEquipmentRequests, musculoskeletalAssessments, trafficFines,
  type Team, type InsertTeam, type UpdateTeamRequest,
  type Notice, type InsertNotice,
  type Setting,
  type SafetyEquipment, type InsertSafetyEquipment,
  type SafetyInspection, type InsertSafetyInspection,
  type EducationSession, type InsertEducationSession,
  type EducationSignature, type InsertEducationSignature,
  type User,
  type Chemical, type InsertChemical,
  type RiskAssessment, type InsertRiskAssessment,
  type AccidentReport, type InsertAccidentReport,
  type NewEquipmentRequest, type InsertNewEquipmentRequest,
  type MusculoskeletalAssessment, type InsertMusculoskeletalAssessment,
  type TrafficFine, type InsertTrafficFine,
  drillSessions, drillAssignments,
  type DrillSession, type InsertDrillSession,
  type DrillAssignment, type InsertDrillAssignment,
  workPlans,
  type WorkPlan, type InsertWorkPlan,
  safetyCommittees,
  type SafetyCommittee, type InsertSafetyCommittee,
  jointInspections, jointInspectionSignatures,
  type JointInspection, type InsertJointInspection,
  type JointInspectionSignature, type InsertJointInspectionSignature,
  vehicleLogErrors,
  type VehicleLogError, type InsertVehicleLogError,
  musicFiles,
  type MusicFile, type InsertMusicFile,
  fuelRecords,
  type FuelRecord, type InsertFuelRecord,
  nearMissReports,
  type NearMissReport,
  safetyManagerReports,
  type SafetyManagerReport,
  healthManagerReports,
  type HealthManagerReport,
  educationTasks,
  type EducationTask, type InsertEducationTask,
  safetyCostRecords,
  type SafetyCostRecord, type InsertSafetyCostRecord,
  safetyCostTaxInvoices,
  type SafetyCostTaxInvoice, type InsertSafetyCostTaxInvoice,
  attendanceUploads,
  type AttendanceUpload, type InsertAttendanceUpload,
  attendanceRecords,
  type AttendanceRecord, type InsertAttendanceRecord,
  onlineEduUploads,
  type OnlineEduUpload, type InsertOnlineEduUpload,
  onlineEduRecords,
  type OnlineEduRecord, type InsertOnlineEduRecord,
  safetySupplySurveys,
  type SafetySupplySurvey, type InsertSafetySupplySurvey,
  safetySupplyItems,
  type SafetySupplyItem, type InsertSafetySupplyItem,
  riskAssessmentResultUploads,
  type RiskAssessmentResultUpload, type InsertRiskAssessmentResultUpload,
  riskAssessmentDownloadLogs,
  type RiskAssessmentDownloadLog, type InsertRiskAssessmentDownloadLog,
  safetySupplyDeptEntries,
  type SafetySupplyDeptEntry, type InsertSafetySupplyDeptEntry,
} from "@shared/schema";
import { eq, desc, asc, and, ilike, or, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Teams
  getTeams(year?: number): Promise<Team[]>;
  getTeam(id: number): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: number, updates: UpdateTeamRequest): Promise<Team>;
  deleteTeam(id: number): Promise<void>;

  // Notices
  getNotices(category?: string): Promise<Notice[]>;
  getNotice(id: number): Promise<Notice | undefined>;
  createNotice(notice: InsertNotice): Promise<Notice>;
  updateNotice(id: number, updates: Partial<InsertNotice>): Promise<Notice>;
  deleteNotice(id: number): Promise<void>;

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string): Promise<Setting>;

  // Safety Equipment
  getSafetyEquipment(): Promise<SafetyEquipment[]>;
  createSafetyEquipment(equipment: InsertSafetyEquipment): Promise<SafetyEquipment>;
  updateSafetyEquipment(id: number, updates: Partial<InsertSafetyEquipment>): Promise<SafetyEquipment>;
  deleteSafetyEquipment(id: number): Promise<void>;
  
  // Safety Inspections
  getSafetyInspections(): Promise<SafetyInspection[]>;
  getSafetyInspection(id: number): Promise<SafetyInspection | undefined>;
  createSafetyInspection(inspection: InsertSafetyInspection): Promise<SafetyInspection>;
  updateSafetyInspection(id: number, updates: Partial<InsertSafetyInspection>): Promise<SafetyInspection>;
  deleteSafetyInspection(id: number): Promise<void>;

  // Education Sessions
  getEducationSessions(department?: string): Promise<EducationSession[]>;
  getEducationSession(id: number): Promise<EducationSession | undefined>;
  getSessionsByTaskId(taskId: number): Promise<EducationSession[]>;
  createEducationSession(session: InsertEducationSession): Promise<EducationSession>;
  updateEducationSession(id: number, updates: Partial<InsertEducationSession>): Promise<EducationSession>;
  deleteEducationSession(id: number): Promise<void>;

  // Education Signatures
  getSignaturesBySession(sessionId: number): Promise<EducationSignature[]>;
  getAllSignaturesWithSession(): Promise<Array<EducationSignature & { sessionTitle: string; sessionDate: string; sessionDepartment: string }>>;
  getSignature(id: number): Promise<EducationSignature | undefined>;
  createSignature(signature: InsertEducationSignature): Promise<EducationSignature>;
  deleteSignature(id: number): Promise<void>;

  // Users
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User>;

  // Chemicals (MSDS)
  getChemicals(): Promise<Chemical[]>;
  searchChemicals(query: string): Promise<Chemical[]>;
  getChemical(id: number): Promise<Chemical | undefined>;
  createChemical(chemical: InsertChemical): Promise<Chemical>;
  updateChemical(id: number, updates: Partial<InsertChemical>): Promise<Chemical>;
  deleteChemical(id: number): Promise<void>;

  // Risk Assessments
  getRiskAssessments(assessmentType?: string): Promise<RiskAssessment[]>;
  getRiskAssessment(id: number): Promise<RiskAssessment | undefined>;
  createRiskAssessment(assessment: InsertRiskAssessment): Promise<RiskAssessment>;
  updateRiskAssessment(id: number, updates: Partial<InsertRiskAssessment>): Promise<RiskAssessment>;
  deleteRiskAssessment(id: number): Promise<void>;

  // Accident Reports
  getAccidentReports(): Promise<AccidentReport[]>;
  getAccidentReport(id: number): Promise<AccidentReport | undefined>;
  createAccidentReport(report: InsertAccidentReport): Promise<AccidentReport>;
  updateAccidentReport(id: number, updates: Partial<InsertAccidentReport>): Promise<AccidentReport>;
  deleteAccidentReport(id: number): Promise<void>;

  // Near Miss Reports
  getNearMissReports(): Promise<NearMissReport[]>;
  getNearMissReport(id: number): Promise<NearMissReport | undefined>;
  createNearMissReport(report: any): Promise<NearMissReport>;
  updateNearMissReport(id: number, updates: Partial<any>): Promise<NearMissReport>;
  deleteNearMissReport(id: number): Promise<void>;

  // New Equipment Requests
  getNewEquipmentRequests(): Promise<NewEquipmentRequest[]>;
  getNewEquipmentRequest(id: number): Promise<NewEquipmentRequest | undefined>;
  createNewEquipmentRequest(request: InsertNewEquipmentRequest): Promise<NewEquipmentRequest>;
  updateNewEquipmentRequest(id: number, updates: Partial<InsertNewEquipmentRequest>): Promise<NewEquipmentRequest>;
  deleteNewEquipmentRequest(id: number): Promise<void>;
  getUnreadNewEquipmentCount(): Promise<number>;
  markAllNewEquipmentRequestsRead(): Promise<void>;

  // Musculoskeletal Assessments
  getMusculoskeletalAssessments(): Promise<MusculoskeletalAssessment[]>;
  getMusculoskeletalAssessment(id: number): Promise<MusculoskeletalAssessment | undefined>;
  createMusculoskeletalAssessment(data: InsertMusculoskeletalAssessment): Promise<MusculoskeletalAssessment>;
  updateMusculoskeletalAssessment(id: number, data: Partial<InsertMusculoskeletalAssessment>): Promise<MusculoskeletalAssessment>;
  deleteMusculoskeletalAssessment(id: number): Promise<void>;

  // Vehicles
  getVehicles(): Promise<any[]>;
  insertVehicle(data: any): Promise<any>;
  updateVehicle(id: number, data: any): Promise<any>;
  deleteVehicle(id: number): Promise<void>;
  getFuelVehicleMeta(): Promise<any[]>;

  // Traffic Fines
  getTrafficFines(): Promise<TrafficFine[]>;
  getTrafficFine(id: number): Promise<TrafficFine | undefined>;
  createTrafficFine(data: InsertTrafficFine): Promise<TrafficFine>;
  updateTrafficFine(id: number, data: Partial<InsertTrafficFine>): Promise<TrafficFine>;
  deleteTrafficFine(id: number): Promise<void>;
  getWorkPlans(): Promise<WorkPlan[]>;
  getWorkPlan(id: number): Promise<WorkPlan | undefined>;
  createWorkPlan(data: InsertWorkPlan): Promise<WorkPlan>;
  deleteWorkPlan(id: number): Promise<void>;

  // Safety Committees (산업안전보건협의체)
  getSafetyCommittees(): Promise<SafetyCommittee[]>;
  getSafetyCommittee(id: number): Promise<SafetyCommittee | undefined>;
  createSafetyCommittee(data: InsertSafetyCommittee): Promise<SafetyCommittee>;
  updateSafetyCommittee(id: number, data: Partial<InsertSafetyCommittee>): Promise<SafetyCommittee | undefined>;
  deleteSafetyCommittee(id: number): Promise<void>;

  // Joint Inspections (합동안전보건점검)
  getJointInspections(): Promise<JointInspection[]>;
  getJointInspection(id: number): Promise<JointInspection | undefined>;
  createJointInspection(data: InsertJointInspection): Promise<JointInspection>;
  updateJointInspection(id: number, data: Partial<InsertJointInspection>): Promise<JointInspection | undefined>;
  deleteJointInspection(id: number): Promise<void>;
  // Joint Inspection Signatures
  getJointInspectionSignatures(inspectionId: number): Promise<JointInspectionSignature[]>;
  createJointInspectionSignature(data: InsertJointInspectionSignature): Promise<JointInspectionSignature>;
  deleteJointInspectionSignature(id: number): Promise<void>;

  // Attendance
  getAttendanceUploads(): Promise<AttendanceUpload[]>;
  createAttendanceUpload(data: InsertAttendanceUpload): Promise<AttendanceUpload>;
  deleteAttendanceUpload(id: number): Promise<void>;
  getAttendanceRecords(filters?: { year?: number; month?: number; weekNum?: number; uploadId?: number }): Promise<AttendanceRecord[]>;
  createAttendanceRecord(data: InsertAttendanceRecord): Promise<AttendanceRecord>;
  deleteAttendanceRecordsByUpload(uploadId: number): Promise<void>;
  updateAttendanceRecordReason(id: number, absenceReason: string): Promise<void>;

  // Online Education Progress
  getOnlineEduUploads(): Promise<OnlineEduUpload[]>;
  createOnlineEduUpload(data: InsertOnlineEduUpload): Promise<OnlineEduUpload>;
  deleteOnlineEduUpload(id: number): Promise<void>;
  getOnlineEduRecords(uploadId: number): Promise<OnlineEduRecord[]>;
  bulkCreateOnlineEduRecords(records: InsertOnlineEduRecord[]): Promise<void>;

  // Safety Supply Surveys
  getSafetySupplySurveys(): Promise<SafetySupplySurvey[]>;
  createSafetySupplySurvey(data: InsertSafetySupplySurvey): Promise<SafetySupplySurvey>;
  updateSafetySupplySurvey(id: number, data: Partial<InsertSafetySupplySurvey>): Promise<SafetySupplySurvey>;
  deleteSafetySupplySurvey(id: number): Promise<void>;
  getSafetySupplyItems(surveyId: number): Promise<SafetySupplyItem[]>;
  upsertSafetySupplyItems(surveyId: number, items: Omit<InsertSafetySupplyItem, 'surveyId'>[]): Promise<SafetySupplyItem[]>;
  getSafetySupplyDeptEntries(surveyId: number): Promise<SafetySupplyDeptEntry[]>;
  upsertSafetySupplyDeptEntries(surveyId: number, entries: Omit<InsertSafetySupplyDeptEntry, 'surveyId'>[]): Promise<SafetySupplyDeptEntry[]>;

  // Music Files
  getMusicFiles(): Promise<MusicFile[]>;
  getMusicFile(id: number): Promise<MusicFile | undefined>;
  createMusicFile(data: InsertMusicFile): Promise<MusicFile>;
  updateMusicFile(id: number, data: Partial<Pick<MusicFile, "name" | "scheduleType">>): Promise<MusicFile>;
  deleteMusicFile(id: number): Promise<void>;

  // Fuel Records
  getFuelRecords(filters?: { year?: number; month?: number; team?: string; fuelType?: string }): Promise<FuelRecord[]>;
  insertFuelRecords(records: InsertFuelRecord[]): Promise<number>;
  deleteFuelRecordsByBatch(batchId: string): Promise<void>;
  deleteFuelRecordsByYearMonth(year: number, month: number): Promise<void>;
  getFuelBatches(): Promise<{ batchId: string; uploadedAt: Date; recordCount: number; yearMonths: string[] }[]>;

  // Vehicle Log Errors
  getVehicleLogErrors(filters?: { year?: number; month?: number; status?: string }): Promise<VehicleLogError[]>;
  createVehicleLogErrors(records: InsertVehicleLogError[]): Promise<number>;
  updateVehicleLogError(id: number, data: Partial<VehicleLogError>): Promise<VehicleLogError | undefined>;
  deleteVehicleLogErrorsByBatch(batchId: string): Promise<void>;

  // Safety Manager Reports
  getSafetyManagerReports(yearMonth?: string, year?: string): Promise<SafetyManagerReport[]>;
  getSafetyManagerReport(id: number): Promise<SafetyManagerReport | undefined>;
  createSafetyManagerReport(data: any): Promise<SafetyManagerReport>;
  updateSafetyManagerReport(id: number, data: any): Promise<SafetyManagerReport>;
  deleteSafetyManagerReport(id: number): Promise<void>;

  // Health Manager Reports
  getHealthManagerReports(yearMonth?: string, year?: string): Promise<HealthManagerReport[]>;
  getHealthManagerReport(id: number): Promise<HealthManagerReport | undefined>;
  createHealthManagerReport(data: any): Promise<HealthManagerReport>;
  updateHealthManagerReport(id: number, data: any): Promise<HealthManagerReport>;
  deleteHealthManagerReport(id: number): Promise<void>;

  // Risk Assessment Result Uploads
  getRiskAssessmentResultUploads(): Promise<RiskAssessmentResultUpload[]>;
  getRiskAssessmentResultUpload(id: number): Promise<RiskAssessmentResultUpload | undefined>;
  createRiskAssessmentResultUpload(data: InsertRiskAssessmentResultUpload): Promise<RiskAssessmentResultUpload>;
  deleteRiskAssessmentResultUpload(id: number): Promise<void>;
  // Risk Assessment Download Logs
  getRiskAssessmentDownloadLogs(): Promise<RiskAssessmentDownloadLog[]>;
  addRiskAssessmentDownloadLog(data: InsertRiskAssessmentDownloadLog): Promise<RiskAssessmentDownloadLog>;

  // Education Tasks
  getEducationTasks(): Promise<EducationTask[]>;
  getEducationTask(id: number): Promise<EducationTask | undefined>;
  createEducationTask(data: InsertEducationTask): Promise<EducationTask>;
  updateEducationTask(id: number, data: Partial<InsertEducationTask>): Promise<EducationTask>;
  deleteEducationTask(id: number): Promise<void>;
  bulkDeleteEducationTasks(ids: number[]): Promise<void>;
  bulkConfirmEducationTasks(ids: number[]): Promise<void>;

  // Safety Cost Records (산업안전보건관리비)
  getSafetyCostRecords(year?: number): Promise<SafetyCostRecord[]>;
  getSafetyCostRecord(id: number): Promise<SafetyCostRecord | undefined>;
  createSafetyCostRecord(data: InsertSafetyCostRecord): Promise<SafetyCostRecord>;
  updateSafetyCostRecord(id: number, data: Partial<InsertSafetyCostRecord>): Promise<SafetyCostRecord>;
  deleteSafetyCostRecord(id: number): Promise<void>;

  // Safety Cost Tax Invoices (세금계산서)
  getSafetyCostTaxInvoices(year?: number): Promise<SafetyCostTaxInvoice[]>;
  createSafetyCostTaxInvoice(data: InsertSafetyCostTaxInvoice): Promise<SafetyCostTaxInvoice>;
  updateSafetyCostTaxInvoice(id: number, data: Partial<InsertSafetyCostTaxInvoice>): Promise<SafetyCostTaxInvoice>;
  deleteSafetyCostTaxInvoice(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // === TEAMS ===
  async getTeams(year: number = 2025): Promise<Team[]> {
    return await db.select().from(teams).where(eq(teams.year, year)).orderBy(desc(teams.totalScore));
  }

  async getTeam(id: number): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team;
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const [team] = await db.insert(teams).values(insertTeam).returning();
    return team;
  }

  async updateTeam(id: number, updates: UpdateTeamRequest): Promise<Team> {
    const [team] = await db.update(teams).set(updates).where(eq(teams.id, id)).returning();
    return team;
  }

  async deleteTeam(id: number): Promise<void> {
    await db.delete(teams).where(eq(teams.id, id));
  }

  // === NOTICES ===
  async getNotices(category?: string): Promise<Notice[]> {
    if (category) {
      return await db.select().from(notices)
        .where(eq(notices.category, category))
        .orderBy(desc(notices.createdAt));
    }
    return await db.select().from(notices).orderBy(desc(notices.createdAt));
  }

  async getNotice(id: number): Promise<Notice | undefined> {
    const [notice] = await db.select().from(notices).where(eq(notices.id, id));
    return notice;
  }

  async createNotice(insertNotice: InsertNotice): Promise<Notice> {
    const [notice] = await db.insert(notices).values(insertNotice).returning();
    return notice;
  }

  async updateNotice(id: number, updates: Partial<InsertNotice>): Promise<Notice> {
    const [notice] = await db.update(notices).set(updates).where(eq(notices.id, id)).returning();
    return notice;
  }

  async deleteNotice(id: number): Promise<void> {
    await db.delete(notices).where(eq(notices.id, id));
  }

  // === SETTINGS ===
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async setSetting(key: string, value: string): Promise<Setting> {
    const [existing] = await db.select().from(settings).where(eq(settings.key, key));
    if (existing) {
      const [updated] = await db.update(settings).set({ value }).where(eq(settings.key, key)).returning();
      return updated;
    } else {
      const [created] = await db.insert(settings).values({ key, value }).returning();
      return created;
    }
  }

  // === SAFETY EQUIPMENT ===
  async getSafetyEquipment(): Promise<SafetyEquipment[]> {
    return await db.select().from(safetyEquipment).where(eq(safetyEquipment.isActive, true)).orderBy(asc(safetyEquipment.category), asc(safetyEquipment.name));
  }

  async createSafetyEquipment(equipment: InsertSafetyEquipment): Promise<SafetyEquipment> {
    const [created] = await db.insert(safetyEquipment).values(equipment).returning();
    return created;
  }

  async updateSafetyEquipment(id: number, updates: Partial<InsertSafetyEquipment>): Promise<SafetyEquipment> {
    const [updated] = await db.update(safetyEquipment).set(updates).where(eq(safetyEquipment.id, id)).returning();
    return updated;
  }

  async deleteSafetyEquipment(id: number): Promise<void> {
    await db.update(safetyEquipment).set({ isActive: false }).where(eq(safetyEquipment.id, id));
  }
  
  // === SAFETY INSPECTIONS ===
  async getSafetyInspections(): Promise<SafetyInspection[]> {
    return await db.select().from(safetyInspections).orderBy(desc(safetyInspections.createdAt));
  }

  async getSafetyInspection(id: number): Promise<SafetyInspection | undefined> {
    const [item] = await db.select().from(safetyInspections).where(eq(safetyInspections.id, id));
    return item;
  }
  
  async createSafetyInspection(inspection: InsertSafetyInspection): Promise<SafetyInspection> {
    const [created] = await db.insert(safetyInspections).values(inspection).returning();
    return created;
  }
  
  async updateSafetyInspection(id: number, updates: Partial<InsertSafetyInspection>): Promise<SafetyInspection> {
    const [updated] = await db.update(safetyInspections).set(updates).where(eq(safetyInspections.id, id)).returning();
    return updated;
  }

  async deleteSafetyInspection(id: number): Promise<void> {
    await db.delete(safetyInspections).where(eq(safetyInspections.id, id));
  }

  // === EDUCATION SESSIONS ===
  async getEducationSessions(department?: string): Promise<EducationSession[]> {
    if (department) {
      return await db.select().from(educationSessions)
        .where(eq(educationSessions.department, department))
        .orderBy(desc(educationSessions.createdAt));
    }
    return await db.select().from(educationSessions).orderBy(desc(educationSessions.createdAt));
  }

  async getEducationSession(id: number): Promise<EducationSession | undefined> {
    const [session] = await db.select().from(educationSessions).where(eq(educationSessions.id, id));
    return session;
  }

  async getSessionsByTaskId(taskId: number): Promise<EducationSession[]> {
    return await db.select().from(educationSessions)
      .where(eq(educationSessions.taskId, taskId))
      .orderBy(desc(educationSessions.createdAt));
  }

  async createEducationSession(session: InsertEducationSession): Promise<EducationSession> {
    const [created] = await db.insert(educationSessions).values(session).returning();
    return created;
  }

  async updateEducationSession(id: number, updates: Partial<InsertEducationSession>): Promise<EducationSession> {
    const [updated] = await db.update(educationSessions).set(updates).where(eq(educationSessions.id, id)).returning();
    return updated;
  }

  async deleteEducationSession(id: number): Promise<void> {
    await db.delete(educationSignatures).where(eq(educationSignatures.sessionId, id));
    await db.delete(educationSessions).where(eq(educationSessions.id, id));
  }

  // === EDUCATION SIGNATURES ===
  async getSignaturesBySession(sessionId: number): Promise<EducationSignature[]> {
    return await db.select().from(educationSignatures)
      .where(eq(educationSignatures.sessionId, sessionId))
      .orderBy(asc(educationSignatures.signedAt));
  }

  async getAllSignaturesWithSession(): Promise<Array<EducationSignature & { sessionTitle: string; sessionDate: string; sessionDepartment: string }>> {
    const rows = await db
      .select({
        id: educationSignatures.id,
        sessionId: educationSignatures.sessionId,
        signerName: educationSignatures.signerName,
        signerDepartment: educationSignatures.signerDepartment,
        signatureData: educationSignatures.signatureData,
        signedAt: educationSignatures.signedAt,
        ipAddress: educationSignatures.ipAddress,
        userAgent: educationSignatures.userAgent,
        consentAgreed: educationSignatures.consentAgreed,
        integrityHash: educationSignatures.integrityHash,
        fieldValues: educationSignatures.fieldValues,
        sessionTitle: educationSessions.title,
        sessionDate: educationSessions.educationDate,
        sessionDepartment: educationSessions.department,
      })
      .from(educationSignatures)
      .leftJoin(educationSessions, eq(educationSignatures.sessionId, educationSessions.id))
      .orderBy(desc(educationSignatures.signedAt));
    return rows.map(r => ({
      ...r,
      sessionTitle: r.sessionTitle ?? "",
      sessionDate: r.sessionDate ?? "",
      sessionDepartment: r.sessionDepartment ?? "",
    }));
  }

  async getSignature(id: number): Promise<EducationSignature | undefined> {
    const [sig] = await db.select().from(educationSignatures).where(eq(educationSignatures.id, id));
    return sig;
  }

  async createSignature(signature: InsertEducationSignature): Promise<EducationSignature> {
    const [created] = await db.insert(educationSignatures).values(signature).returning();
    return created;
  }

  async deleteSignature(id: number): Promise<void> {
    await db.delete(educationSignatures).where(eq(educationSignatures.id, id));
  }

  // === USERS ===
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    const [user] = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  // === CHEMICALS (MSDS) ===
  async getChemicals(): Promise<Chemical[]> {
    return await db.select().from(chemicals).orderBy(asc(chemicals.name));
  }

  async searchChemicals(query: string): Promise<Chemical[]> {
    const pattern = `%${query}%`;
    return await db.select().from(chemicals).where(
      or(ilike(chemicals.name, pattern), ilike(chemicals.casNumber, pattern))
    ).orderBy(asc(chemicals.name));
  }

  async getChemical(id: number): Promise<Chemical | undefined> {
    const [c] = await db.select().from(chemicals).where(eq(chemicals.id, id));
    return c;
  }

  async createChemical(chemical: InsertChemical): Promise<Chemical> {
    const [created] = await db.insert(chemicals).values(chemical).returning();
    return created;
  }

  async updateChemical(id: number, updates: Partial<InsertChemical>): Promise<Chemical> {
    const [updated] = await db.update(chemicals).set(updates).where(eq(chemicals.id, id)).returning();
    return updated;
  }

  async deleteChemical(id: number): Promise<void> {
    await db.delete(chemicals).where(eq(chemicals.id, id));
  }

  // === RISK ASSESSMENTS ===
  async getRiskAssessments(assessmentType?: string): Promise<RiskAssessment[]> {
    if (assessmentType) {
      return await db.select().from(riskAssessments)
        .where(eq(riskAssessments.assessmentType, assessmentType))
        .orderBy(desc(riskAssessments.createdAt));
    }
    return await db.select().from(riskAssessments).orderBy(desc(riskAssessments.createdAt));
  }

  async getRiskAssessment(id: number): Promise<RiskAssessment | undefined> {
    const [r] = await db.select().from(riskAssessments).where(eq(riskAssessments.id, id));
    return r;
  }

  async createRiskAssessment(assessment: InsertRiskAssessment): Promise<RiskAssessment> {
    const [created] = await db.insert(riskAssessments).values(assessment).returning();
    return created;
  }

  async updateRiskAssessment(id: number, updates: Partial<InsertRiskAssessment>): Promise<RiskAssessment> {
    const [updated] = await db.update(riskAssessments).set(updates).where(eq(riskAssessments.id, id)).returning();
    return updated;
  }

  async deleteRiskAssessment(id: number): Promise<void> {
    await db.delete(riskAssessments).where(eq(riskAssessments.id, id));
  }

  // === ACCIDENT REPORTS ===
  async getAccidentReports(): Promise<AccidentReport[]> {
    return await db.select().from(accidentReports).orderBy(desc(accidentReports.createdAt));
  }

  async getAccidentReport(id: number): Promise<AccidentReport | undefined> {
    const [r] = await db.select().from(accidentReports).where(eq(accidentReports.id, id));
    return r;
  }

  async createAccidentReport(report: InsertAccidentReport): Promise<AccidentReport> {
    const [created] = await db.insert(accidentReports).values(report).returning();
    return created;
  }

  async updateAccidentReport(id: number, updates: Partial<InsertAccidentReport>): Promise<AccidentReport> {
    const [updated] = await db.update(accidentReports).set(updates).where(eq(accidentReports.id, id)).returning();
    return updated;
  }

  async deleteAccidentReport(id: number): Promise<void> {
    await db.delete(accidentReports).where(eq(accidentReports.id, id));
  }

  // === NEAR MISS REPORTS ===
  async getNearMissReports(): Promise<NearMissReport[]> {
    return await db.select().from(nearMissReports).orderBy(desc(nearMissReports.createdAt));
  }

  async getNearMissReport(id: number): Promise<NearMissReport | undefined> {
    const [r] = await db.select().from(nearMissReports).where(eq(nearMissReports.id, id));
    return r;
  }

  async createNearMissReport(report: any): Promise<NearMissReport> {
    const [created] = await db.insert(nearMissReports).values(report).returning();
    return created;
  }

  async updateNearMissReport(id: number, updates: Partial<any>): Promise<NearMissReport> {
    const [updated] = await db.update(nearMissReports).set({ ...updates, updatedAt: new Date() }).where(eq(nearMissReports.id, id)).returning();
    return updated;
  }

  async deleteNearMissReport(id: number): Promise<void> {
    await db.delete(nearMissReports).where(eq(nearMissReports.id, id));
  }

  // === NEW EQUIPMENT REQUESTS ===
  async getNewEquipmentRequests(): Promise<NewEquipmentRequest[]> {
    return await db.select().from(newEquipmentRequests).orderBy(desc(newEquipmentRequests.createdAt));
  }

  async getNewEquipmentRequest(id: number): Promise<NewEquipmentRequest | undefined> {
    const [r] = await db.select().from(newEquipmentRequests).where(eq(newEquipmentRequests.id, id));
    return r;
  }

  async createNewEquipmentRequest(request: InsertNewEquipmentRequest): Promise<NewEquipmentRequest> {
    const [created] = await db.insert(newEquipmentRequests).values(request).returning();
    return created;
  }

  async updateNewEquipmentRequest(id: number, updates: Partial<InsertNewEquipmentRequest>): Promise<NewEquipmentRequest> {
    const [updated] = await db.update(newEquipmentRequests).set(updates).where(eq(newEquipmentRequests.id, id)).returning();
    return updated;
  }

  async deleteNewEquipmentRequest(id: number): Promise<void> {
    await db.delete(newEquipmentRequests).where(eq(newEquipmentRequests.id, id));
  }

  async getUnreadNewEquipmentCount(): Promise<number> {
    const result = await db.select().from(newEquipmentRequests).where(eq(newEquipmentRequests.isReadByAdmin, false));
    return result.length;
  }

  async markAllNewEquipmentRequestsRead(): Promise<void> {
    await db.update(newEquipmentRequests).set({ isReadByAdmin: true }).where(eq(newEquipmentRequests.isReadByAdmin, false));
  }

  // === MUSCULOSKELETAL ASSESSMENTS ===
  async getMusculoskeletalAssessments(): Promise<MusculoskeletalAssessment[]> {
    return await db.select().from(musculoskeletalAssessments).orderBy(desc(musculoskeletalAssessments.createdAt));
  }

  async getMusculoskeletalAssessment(id: number): Promise<MusculoskeletalAssessment | undefined> {
    const [r] = await db.select().from(musculoskeletalAssessments).where(eq(musculoskeletalAssessments.id, id));
    return r;
  }

  async createMusculoskeletalAssessment(data: InsertMusculoskeletalAssessment): Promise<MusculoskeletalAssessment> {
    const [created] = await db.insert(musculoskeletalAssessments).values(data).returning();
    return created;
  }

  async updateMusculoskeletalAssessment(id: number, data: Partial<InsertMusculoskeletalAssessment>): Promise<MusculoskeletalAssessment> {
    const [updated] = await db.update(musculoskeletalAssessments).set(data).where(eq(musculoskeletalAssessments.id, id)).returning();
    return updated;
  }

  async deleteMusculoskeletalAssessment(id: number): Promise<void> {
    await db.delete(musculoskeletalAssessments).where(eq(musculoskeletalAssessments.id, id));
  }

  // === TRAFFIC FINES ===
  async getVehicles(): Promise<any[]> {
    return await db.select().from(vehicles).orderBy(vehicles.plateNumber);
  }

  async insertVehicle(data: any): Promise<any> {
    const [row] = await db.insert(vehicles).values(data).returning();
    return row;
  }

  async updateVehicle(id: number, data: any): Promise<any> {
    const [row] = await db.update(vehicles).set(data).where(eq(vehicles.id, id)).returning();
    return row;
  }

  async deleteVehicle(id: number): Promise<void> {
    await db.delete(vehicles).where(eq(vehicles.id, id));
  }

  async getFuelVehicleMeta(): Promise<any[]> {
    // vehicles 테이블 전체 (fuelType, acquisitionType 포함)
    return await db.select().from(vehicles).orderBy(vehicles.team, vehicles.plateNumber);
  }

  async getTrafficFines(): Promise<TrafficFine[]> {
    return await db.select().from(trafficFines).orderBy(desc(trafficFines.createdAt));
  }

  async getTrafficFine(id: number): Promise<TrafficFine | undefined> {
    const [row] = await db.select().from(trafficFines).where(eq(trafficFines.id, id));
    return row;
  }

  async createTrafficFine(data: InsertTrafficFine): Promise<TrafficFine> {
    const [created] = await db.insert(trafficFines).values(data).returning();
    return created;
  }

  async updateTrafficFine(id: number, data: Partial<InsertTrafficFine>): Promise<TrafficFine> {
    const [updated] = await db.update(trafficFines).set(data).where(eq(trafficFines.id, id)).returning();
    return updated;
  }

  async deleteTrafficFine(id: number): Promise<void> {
    await db.delete(trafficFines).where(eq(trafficFines.id, id));
  }

  async getWorkPlans(): Promise<WorkPlan[]> {
    return await db.select().from(workPlans).orderBy(desc(workPlans.createdAt));
  }

  async getWorkPlan(id: number): Promise<WorkPlan | undefined> {
    const [row] = await db.select().from(workPlans).where(eq(workPlans.id, id));
    return row;
  }

  async createWorkPlan(data: InsertWorkPlan): Promise<WorkPlan> {
    const [created] = await db.insert(workPlans).values(data).returning();
    return created;
  }

  async deleteWorkPlan(id: number): Promise<void> {
    await db.delete(workPlans).where(eq(workPlans.id, id));
  }

  // === SAFETY COMMITTEES ===
  async getSafetyCommittees(): Promise<SafetyCommittee[]> {
    return await db.select().from(safetyCommittees).orderBy(desc(safetyCommittees.createdAt));
  }
  async getSafetyCommittee(id: number): Promise<SafetyCommittee | undefined> {
    const [row] = await db.select().from(safetyCommittees).where(eq(safetyCommittees.id, id));
    return row;
  }
  async createSafetyCommittee(data: InsertSafetyCommittee): Promise<SafetyCommittee> {
    const [row] = await db.insert(safetyCommittees).values(data).returning();
    return row;
  }
  async updateSafetyCommittee(id: number, data: Partial<InsertSafetyCommittee>): Promise<SafetyCommittee | undefined> {
    const [row] = await db.update(safetyCommittees).set(data).where(eq(safetyCommittees.id, id)).returning();
    return row;
  }
  async deleteSafetyCommittee(id: number): Promise<void> {
    await db.delete(safetyCommittees).where(eq(safetyCommittees.id, id));
  }

  // === JOINT INSPECTIONS ===
  async getJointInspections(): Promise<JointInspection[]> {
    return await db.select().from(jointInspections).orderBy(desc(jointInspections.createdAt));
  }
  async getJointInspection(id: number): Promise<JointInspection | undefined> {
    const [row] = await db.select().from(jointInspections).where(eq(jointInspections.id, id));
    return row;
  }
  async createJointInspection(data: InsertJointInspection): Promise<JointInspection> {
    const [row] = await db.insert(jointInspections).values(data).returning();
    return row;
  }
  async updateJointInspection(id: number, data: Partial<InsertJointInspection>): Promise<JointInspection | undefined> {
    const [row] = await db.update(jointInspections).set(data).where(eq(jointInspections.id, id)).returning();
    return row;
  }
  async deleteJointInspection(id: number): Promise<void> {
    await db.delete(jointInspections).where(eq(jointInspections.id, id));
  }
  async getJointInspectionSignatures(inspectionId: number): Promise<JointInspectionSignature[]> {
    return await db.select().from(jointInspectionSignatures)
      .where(eq(jointInspectionSignatures.inspectionId, inspectionId))
      .orderBy(asc(jointInspectionSignatures.signedAt));
  }
  async createJointInspectionSignature(data: InsertJointInspectionSignature): Promise<JointInspectionSignature> {
    const [row] = await db.insert(jointInspectionSignatures).values(data).returning();
    return row;
  }
  async deleteJointInspectionSignature(id: number): Promise<void> {
    await db.delete(jointInspectionSignatures).where(eq(jointInspectionSignatures.id, id));
  }

  // === ATTENDANCE ===
  async getAttendanceUploads(): Promise<AttendanceUpload[]> {
    return await db.select().from(attendanceUploads).orderBy(desc(attendanceUploads.createdAt));
  }
  async createAttendanceUpload(data: InsertAttendanceUpload): Promise<AttendanceUpload> {
    const [row] = await db.insert(attendanceUploads).values(data).returning();
    return row;
  }
  async deleteAttendanceUpload(id: number): Promise<void> {
    await db.delete(attendanceUploads).where(eq(attendanceUploads.id, id));
  }
  async getAttendanceRecords(filters?: { year?: number; month?: number; weekNum?: number; uploadId?: number }): Promise<AttendanceRecord[]> {
    const conditions = [];
    if (filters?.year) conditions.push(eq(attendanceRecords.year, filters.year));
    if (filters?.month) conditions.push(eq(attendanceRecords.month, filters.month));
    if (filters?.weekNum) conditions.push(eq(attendanceRecords.weekNum, filters.weekNum));
    if (filters?.uploadId) conditions.push(eq(attendanceRecords.uploadId, filters.uploadId));
    const query = conditions.length > 0
      ? db.select().from(attendanceRecords).where(and(...conditions))
      : db.select().from(attendanceRecords);
    return await query.orderBy(desc(attendanceRecords.attendanceDate));
  }
  async createAttendanceRecord(data: InsertAttendanceRecord): Promise<AttendanceRecord> {
    const [row] = await db.insert(attendanceRecords).values(data).returning();
    return row;
  }
  async deleteAttendanceRecordsByUpload(uploadId: number): Promise<void> {
    await db.delete(attendanceRecords).where(eq(attendanceRecords.uploadId, uploadId));
  }
  async updateAttendanceRecordReason(id: number, absenceReason: string): Promise<void> {
    await db.update(attendanceRecords).set({ absenceReason }).where(eq(attendanceRecords.id, id));
  }

  // === MUSIC FILES ===
  async getMusicFiles(): Promise<MusicFile[]> {
    return await db.select().from(musicFiles).orderBy(asc(musicFiles.uploadedAt));
  }

  async getMusicFile(id: number): Promise<MusicFile | undefined> {
    const [row] = await db.select().from(musicFiles).where(eq(musicFiles.id, id));
    return row;
  }

  async createMusicFile(data: InsertMusicFile): Promise<MusicFile> {
    const [created] = await db.insert(musicFiles).values(data).returning();
    return created;
  }

  async updateMusicFile(id: number, data: Partial<Pick<MusicFile, "name" | "scheduleType">>): Promise<MusicFile> {
    const [updated] = await db.update(musicFiles).set(data).where(eq(musicFiles.id, id)).returning();
    return updated;
  }

  async deleteMusicFile(id: number): Promise<void> {
    await db.delete(musicFiles).where(eq(musicFiles.id, id));
  }

  // === FUEL RECORDS ===
  async getFuelRecords(filters?: { year?: number; month?: number; team?: string; fuelType?: string }): Promise<FuelRecord[]> {
    const conditions = [];
    if (filters?.year) conditions.push(eq(fuelRecords.year, filters.year));
    if (filters?.month) conditions.push(eq(fuelRecords.month, filters.month));
    if (filters?.team) conditions.push(eq(fuelRecords.team, filters.team));
    if (filters?.fuelType) conditions.push(eq(fuelRecords.fuelType, filters.fuelType));
    const query = conditions.length > 0
      ? db.select().from(fuelRecords).where(and(...conditions))
      : db.select().from(fuelRecords);
    return await query.orderBy(fuelRecords.year, fuelRecords.month, fuelRecords.team);
  }

  async insertFuelRecords(records: InsertFuelRecord[]): Promise<number> {
    if (records.length === 0) return 0;
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      await db.insert(fuelRecords).values(chunk);
      inserted += chunk.length;
    }
    return inserted;
  }

  async deleteFuelRecordsByBatch(batchId: string): Promise<void> {
    await db.delete(fuelRecords).where(eq(fuelRecords.uploadBatch, batchId));
  }

  async deleteFuelRecordsByYearMonth(year: number, month: number): Promise<void> {
    await db.delete(fuelRecords).where(and(eq(fuelRecords.year, year), eq(fuelRecords.month, month)));
  }

  async getFuelBatches(): Promise<{ batchId: string; uploadedAt: Date; recordCount: number; yearMonths: string[] }[]> {
    const rows = await db
      .select({
        batchId: fuelRecords.uploadBatch,
        uploadedAt: sql<Date>`min(${fuelRecords.createdAt})`,
        recordCount: sql<number>`count(*)::int`,
        yearMonths: sql<string[]>`array_agg(distinct concat(${fuelRecords.year}, '-', lpad(${fuelRecords.month}::text, 2, '0')) order by concat(${fuelRecords.year}, '-', lpad(${fuelRecords.month}::text, 2, '0')))`,
      })
      .from(fuelRecords)
      .groupBy(fuelRecords.uploadBatch)
      .orderBy(sql`min(${fuelRecords.createdAt}) desc`);
    return rows.map(r => ({
      batchId: r.batchId ?? "",
      uploadedAt: r.uploadedAt,
      recordCount: r.recordCount,
      yearMonths: r.yearMonths ?? [],
    }));
  }

  // === VEHICLE LOG ERRORS ===
  async getVehicleLogErrors(filters?: { year?: number; month?: number; status?: string }): Promise<VehicleLogError[]> {
    const conds: any[] = [];
    if (filters?.year) conds.push(eq(vehicleLogErrors.year, filters.year));
    if (filters?.month) conds.push(eq(vehicleLogErrors.month, filters.month));
    if (filters?.status) conds.push(eq(vehicleLogErrors.status, filters.status));
    const q = conds.length > 0
      ? db.select().from(vehicleLogErrors).where(and(...conds))
      : db.select().from(vehicleLogErrors);
    return await q.orderBy(asc(vehicleLogErrors.plateNumber), asc(vehicleLogErrors.rowIndex));
  }

  async createVehicleLogErrors(records: InsertVehicleLogError[]): Promise<number> {
    if (!records.length) return 0;
    await db.insert(vehicleLogErrors).values(records);
    return records.length;
  }

  async updateVehicleLogError(id: number, data: Partial<VehicleLogError>): Promise<VehicleLogError | undefined> {
    const [row] = await db.update(vehicleLogErrors).set(data).where(eq(vehicleLogErrors.id, id)).returning();
    return row;
  }

  async deleteVehicleLogErrorsByBatch(batchId: string): Promise<void> {
    await db.delete(vehicleLogErrors).where(eq(vehicleLogErrors.uploadBatch, batchId));
  }

  // === SAFETY MANAGER REPORTS ===
  async getSafetyManagerReports(yearMonth?: string, year?: string): Promise<SafetyManagerReport[]> {
    let cond: any = undefined;
    if (yearMonth) {
      cond = sql`LEFT(${safetyManagerReports.visitDate}, 7) = ${yearMonth}`;
    } else if (year) {
      cond = sql`LEFT(${safetyManagerReports.visitDate}, 4) = ${year}`;
    }
    return await db.select().from(safetyManagerReports)
      .where(cond)
      .orderBy(desc(safetyManagerReports.createdAt));
  }
  async getSafetyManagerReport(id: number): Promise<SafetyManagerReport | undefined> {
    const [row] = await db.select().from(safetyManagerReports).where(eq(safetyManagerReports.id, id));
    return row;
  }
  async createSafetyManagerReport(data: any): Promise<SafetyManagerReport> {
    const [row] = await db.insert(safetyManagerReports).values(data).returning();
    return row;
  }
  async updateSafetyManagerReport(id: number, data: any): Promise<SafetyManagerReport> {
    const [row] = await db.update(safetyManagerReports).set(data).where(eq(safetyManagerReports.id, id)).returning();
    return row;
  }
  async deleteSafetyManagerReport(id: number): Promise<void> {
    await db.delete(safetyManagerReports).where(eq(safetyManagerReports.id, id));
  }

  // === HEALTH MANAGER REPORTS ===
  async getHealthManagerReports(yearMonth?: string, year?: string): Promise<HealthManagerReport[]> {
    // visitDate 기준으로 조회 — 기존 yearMonth 필드 오염 데이터도 올바르게 처리
    let cond: any = undefined;
    if (yearMonth) {
      cond = sql`LEFT(${healthManagerReports.visitDate}, 7) = ${yearMonth}`;
    } else if (year) {
      cond = sql`LEFT(${healthManagerReports.visitDate}, 4) = ${year}`;
    }
    return await db.select().from(healthManagerReports)
      .where(cond)
      .orderBy(desc(healthManagerReports.visitDate));
  }
  async getHealthManagerReport(id: number): Promise<HealthManagerReport | undefined> {
    const [row] = await db.select().from(healthManagerReports).where(eq(healthManagerReports.id, id));
    return row;
  }
  async createHealthManagerReport(data: any): Promise<HealthManagerReport> {
    const [row] = await db.insert(healthManagerReports).values(data).returning();
    return row;
  }
  async updateHealthManagerReport(id: number, data: any): Promise<HealthManagerReport> {
    const [row] = await db.update(healthManagerReports).set(data).where(eq(healthManagerReports.id, id)).returning();
    return row;
  }
  async deleteHealthManagerReport(id: number): Promise<void> {
    await db.delete(healthManagerReports).where(eq(healthManagerReports.id, id));
  }

  // === EDUCATION TASKS ===
  async getEducationTasks(): Promise<EducationTask[]> {
    return await db.select().from(educationTasks).orderBy(desc(educationTasks.createdAt));
  }
  async getEducationTask(id: number): Promise<EducationTask | undefined> {
    const [row] = await db.select().from(educationTasks).where(eq(educationTasks.id, id));
    return row;
  }
  async createEducationTask(data: InsertEducationTask): Promise<EducationTask> {
    const [row] = await db.insert(educationTasks).values(data).returning();
    return row;
  }
  async updateEducationTask(id: number, data: Partial<InsertEducationTask>): Promise<EducationTask> {
    const [row] = await db.update(educationTasks).set(data).where(eq(educationTasks.id, id)).returning();
    return row;
  }
  async deleteEducationTask(id: number): Promise<void> {
    await db.delete(educationTasks).where(eq(educationTasks.id, id));
  }
  async bulkDeleteEducationTasks(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(educationTasks).where(inArray(educationTasks.id, ids));
  }
  async bulkConfirmEducationTasks(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.update(educationTasks).set({ confirmed: true, status: "완료", completionRate: 100 }).where(inArray(educationTasks.id, ids));
  }

  // === 산업안전보건관리비 사용내역 ===
  async getSafetyCostRecords(year?: number): Promise<SafetyCostRecord[]> {
    if (year) {
      return await db.select().from(safetyCostRecords)
        .where(eq(safetyCostRecords.year, year))
        .orderBy(desc(safetyCostRecords.month), desc(safetyCostRecords.createdAt));
    }
    return await db.select().from(safetyCostRecords)
      .orderBy(desc(safetyCostRecords.year), desc(safetyCostRecords.month), desc(safetyCostRecords.createdAt));
  }
  async getSafetyCostRecord(id: number): Promise<SafetyCostRecord | undefined> {
    const [row] = await db.select().from(safetyCostRecords).where(eq(safetyCostRecords.id, id));
    return row;
  }
  async createSafetyCostRecord(data: InsertSafetyCostRecord): Promise<SafetyCostRecord> {
    const [row] = await db.insert(safetyCostRecords).values(data).returning();
    return row;
  }
  async updateSafetyCostRecord(id: number, data: Partial<InsertSafetyCostRecord>): Promise<SafetyCostRecord> {
    const [row] = await db.update(safetyCostRecords).set(data).where(eq(safetyCostRecords.id, id)).returning();
    return row;
  }
  async deleteSafetyCostRecord(id: number): Promise<void> {
    await db.delete(safetyCostRecords).where(eq(safetyCostRecords.id, id));
  }

  // === 세금계산서 ===
  async getSafetyCostTaxInvoices(year?: number): Promise<SafetyCostTaxInvoice[]> {
    if (year) {
      return await db.select().from(safetyCostTaxInvoices)
        .where(eq(safetyCostTaxInvoices.year, year))
        .orderBy(desc(safetyCostTaxInvoices.month));
    }
    return await db.select().from(safetyCostTaxInvoices)
      .orderBy(desc(safetyCostTaxInvoices.year), desc(safetyCostTaxInvoices.month));
  }
  async createSafetyCostTaxInvoice(data: InsertSafetyCostTaxInvoice): Promise<SafetyCostTaxInvoice> {
    const [row] = await db.insert(safetyCostTaxInvoices).values(data).returning();
    return row;
  }
  async updateSafetyCostTaxInvoice(id: number, data: Partial<InsertSafetyCostTaxInvoice>): Promise<SafetyCostTaxInvoice> {
    const [row] = await db.update(safetyCostTaxInvoices).set(data).where(eq(safetyCostTaxInvoices.id, id)).returning();
    return row;
  }
  async deleteSafetyCostTaxInvoice(id: number): Promise<void> {
    await db.delete(safetyCostTaxInvoices).where(eq(safetyCostTaxInvoices.id, id));
  }

  // === 온라인 교육 진도율 ===
  async getOnlineEduUploads(): Promise<OnlineEduUpload[]> {
    return await db.select().from(onlineEduUploads).orderBy(desc(onlineEduUploads.createdAt));
  }
  async createOnlineEduUpload(data: InsertOnlineEduUpload): Promise<OnlineEduUpload> {
    const [row] = await db.insert(onlineEduUploads).values(data).returning();
    return row;
  }
  async deleteOnlineEduUpload(id: number): Promise<void> {
    await db.delete(onlineEduRecords).where(eq(onlineEduRecords.uploadId, id));
    await db.delete(onlineEduUploads).where(eq(onlineEduUploads.id, id));
  }
  async getOnlineEduRecords(uploadId: number): Promise<OnlineEduRecord[]> {
    return await db.select().from(onlineEduRecords)
      .where(eq(onlineEduRecords.uploadId, uploadId))
      .orderBy(asc(onlineEduRecords.name));
  }
  // === 상/하반기 필요용품 조사 ===
  async getSafetySupplySurveys(): Promise<SafetySupplySurvey[]> {
    return await db.select().from(safetySupplySurveys).orderBy(desc(safetySupplySurveys.year), desc(safetySupplySurveys.half));
  }
  async createSafetySupplySurvey(data: InsertSafetySupplySurvey): Promise<SafetySupplySurvey> {
    const [row] = await db.insert(safetySupplySurveys).values(data).returning();
    return row;
  }
  async updateSafetySupplySurvey(id: number, data: Partial<InsertSafetySupplySurvey>): Promise<SafetySupplySurvey> {
    const [row] = await db.update(safetySupplySurveys).set(data).where(eq(safetySupplySurveys.id, id)).returning();
    return row;
  }
  async deleteSafetySupplySurvey(id: number): Promise<void> {
    await db.delete(safetySupplyDeptEntries).where(eq(safetySupplyDeptEntries.surveyId, id));
    await db.delete(safetySupplyItems).where(eq(safetySupplyItems.surveyId, id));
    await db.delete(safetySupplySurveys).where(eq(safetySupplySurveys.id, id));
  }
  async getSafetySupplyItems(surveyId: number): Promise<SafetySupplyItem[]> {
    return await db.select().from(safetySupplyItems)
      .where(eq(safetySupplyItems.surveyId, surveyId))
      .orderBy(asc(safetySupplyItems.sortOrder));
  }
  async updateSafetySupplyItemDeliveryStatus(itemId: number, deliveryStatus: string): Promise<SafetySupplyItem | undefined> {
    const [row] = await db.update(safetySupplyItems)
      .set({ deliveryStatus })
      .where(eq(safetySupplyItems.id, itemId))
      .returning();
    return row;
  }
  async upsertSafetySupplyItems(surveyId: number, items: Omit<InsertSafetySupplyItem, 'surveyId'>[]): Promise<SafetySupplyItem[]> {
    // 기존 rows를 sortOrder 순으로 가져와서 index 매칭으로 UPDATE — ID를 유지해야 depts quantities 키가 살아남음
    const existing = await db.select().from(safetySupplyItems)
      .where(eq(safetySupplyItems.surveyId, surveyId))
      .orderBy(asc(safetySupplyItems.sortOrder));

    const result: SafetySupplyItem[] = [];

    for (let i = 0; i < items.length; i++) {
      if (i < existing.length) {
        const [updated] = await db.update(safetySupplyItems)
          .set({ ...items[i], surveyId, sortOrder: i })
          .where(eq(safetySupplyItems.id, existing[i].id))
          .returning();
        result.push(updated);
      } else {
        const [inserted] = await db.insert(safetySupplyItems)
          .values({ ...items[i], surveyId, sortOrder: i })
          .returning();
        result.push(inserted);
      }
    }

    if (existing.length > items.length) {
      const idsToDelete = existing.slice(items.length).map(e => e.id);
      await db.delete(safetySupplyItems).where(inArray(safetySupplyItems.id, idsToDelete));
    }

    return result;
  }
  async getSafetySupplyDeptEntries(surveyId: number): Promise<SafetySupplyDeptEntry[]> {
    return await db.select().from(safetySupplyDeptEntries)
      .where(eq(safetySupplyDeptEntries.surveyId, surveyId))
      .orderBy(asc(safetySupplyDeptEntries.sortOrder));
  }
  async upsertSafetySupplyDeptEntries(surveyId: number, entries: Omit<InsertSafetySupplyDeptEntry, 'surveyId'>[]): Promise<SafetySupplyDeptEntry[]> {
    await db.delete(safetySupplyDeptEntries).where(eq(safetySupplyDeptEntries.surveyId, surveyId));
    if (entries.length === 0) return [];
    const rows = await db.insert(safetySupplyDeptEntries)
      .values(entries.map((e, i) => ({ ...e, surveyId, sortOrder: i })))
      .returning();
    return rows;
  }
  async updateDeptEntryDeliveryStatus(deptEntryId: number, itemId: number, deliveryStatus: string): Promise<SafetySupplyDeptEntry | undefined> {
    const [current] = await db.select().from(safetySupplyDeptEntries).where(eq(safetySupplyDeptEntries.id, deptEntryId));
    if (!current) return undefined;
    const existing = (current.deliveryStatuses as Record<string, string>) || {};
    const updated = { ...existing, [String(itemId)]: deliveryStatus };
    const [row] = await db.update(safetySupplyDeptEntries)
      .set({ deliveryStatuses: updated })
      .where(eq(safetySupplyDeptEntries.id, deptEntryId))
      .returning();
    return row;
  }
  async bulkUpdateSelectedDeptsDeliveryStatusForItem(surveyId: number, itemId: number, deptEntryIds: number[], deliveryStatus: string): Promise<void> {
    for (const deptEntryId of deptEntryIds) {
      const [current] = await db.select().from(safetySupplyDeptEntries).where(
        and(eq(safetySupplyDeptEntries.id, deptEntryId), eq(safetySupplyDeptEntries.surveyId, surveyId))
      );
      if (!current) continue;
      const existing = (current.deliveryStatuses as Record<string, string>) || {};
      const updated = { ...existing, [String(itemId)]: deliveryStatus };
      await db.update(safetySupplyDeptEntries).set({ deliveryStatuses: updated }).where(eq(safetySupplyDeptEntries.id, deptEntryId));
    }
  }
  async bulkUpdateDeptEntryDeliveryStatusItems(deptEntryId: number, itemIds: number[], deliveryStatus: string): Promise<SafetySupplyDeptEntry | undefined> {
    const [current] = await db.select().from(safetySupplyDeptEntries).where(eq(safetySupplyDeptEntries.id, deptEntryId));
    if (!current) return undefined;
    const existing = (current.deliveryStatuses as Record<string, string>) || {};
    const updated = { ...existing };
    for (const id of itemIds) updated[String(id)] = deliveryStatus;
    const [row] = await db.update(safetySupplyDeptEntries)
      .set({ deliveryStatuses: updated })
      .where(eq(safetySupplyDeptEntries.id, deptEntryId))
      .returning();
    return row;
  }
  async bulkUpdateDeliveryStatusByItem(surveyId: number, itemId: number, deliveryStatus: string): Promise<void> {
    const entries = await db.select().from(safetySupplyDeptEntries).where(eq(safetySupplyDeptEntries.surveyId, surveyId));
    for (const entry of entries) {
      const existing = (entry.deliveryStatuses as Record<string, string>) || {};
      const updated = { ...existing, [String(itemId)]: deliveryStatus };
      await db.update(safetySupplyDeptEntries)
        .set({ deliveryStatuses: updated })
        .where(eq(safetySupplyDeptEntries.id, entry.id));
    }
  }

  async bulkCreateOnlineEduRecords(records: InsertOnlineEduRecord[]): Promise<void> {
    if (records.length === 0) return;
    const chunkSize = 200;
    for (let i = 0; i < records.length; i += chunkSize) {
      await db.insert(onlineEduRecords).values(records.slice(i, i + chunkSize));
    }
  }

  async getRiskAssessmentResultUploads(): Promise<RiskAssessmentResultUpload[]> {
    return await db.select().from(riskAssessmentResultUploads).orderBy(desc(riskAssessmentResultUploads.createdAt));
  }
  async getRiskAssessmentResultUpload(id: number): Promise<RiskAssessmentResultUpload | undefined> {
    const [row] = await db.select().from(riskAssessmentResultUploads).where(eq(riskAssessmentResultUploads.id, id));
    return row;
  }
  async createRiskAssessmentResultUpload(data: InsertRiskAssessmentResultUpload): Promise<RiskAssessmentResultUpload> {
    const [row] = await db.insert(riskAssessmentResultUploads).values(data).returning();
    return row;
  }
  async deleteRiskAssessmentResultUpload(id: number): Promise<void> {
    await db.delete(riskAssessmentResultUploads).where(eq(riskAssessmentResultUploads.id, id));
  }
  async getRiskAssessmentDownloadLogs(): Promise<RiskAssessmentDownloadLog[]> {
    return await db.select().from(riskAssessmentDownloadLogs).orderBy(desc(riskAssessmentDownloadLogs.downloadedAt));
  }
  async addRiskAssessmentDownloadLog(data: InsertRiskAssessmentDownloadLog): Promise<RiskAssessmentDownloadLog> {
    const [row] = await db.insert(riskAssessmentDownloadLogs).values(data).returning();
    return row;
  }

  // === 대응훈련 세션 ===
  async getDrillSessions(): Promise<DrillSession[]> {
    return await db.select().from(drillSessions).orderBy(desc(drillSessions.createdAt));
  }
  async getDrillSession(id: number): Promise<DrillSession | undefined> {
    const [row] = await db.select().from(drillSessions).where(eq(drillSessions.id, id));
    return row;
  }
  async createDrillSession(data: InsertDrillSession): Promise<DrillSession> {
    const [row] = await db.insert(drillSessions).values(data).returning();
    return row;
  }
  async updateDrillSession(id: number, data: Partial<InsertDrillSession>): Promise<DrillSession | undefined> {
    const [row] = await db.update(drillSessions).set(data).where(eq(drillSessions.id, id)).returning();
    return row;
  }
  async deleteDrillSession(id: number): Promise<void> {
    await db.delete(drillAssignments).where(eq(drillAssignments.sessionId, id));
    await db.delete(drillSessions).where(eq(drillSessions.id, id));
  }

  // === 대응훈련 부서 할당 ===
  async getDrillAssignments(sessionId: number): Promise<DrillAssignment[]> {
    return await db.select().from(drillAssignments)
      .where(eq(drillAssignments.sessionId, sessionId))
      .orderBy(asc(drillAssignments.department));
  }
  async getDrillAssignment(id: number): Promise<DrillAssignment | undefined> {
    const [row] = await db.select().from(drillAssignments).where(eq(drillAssignments.id, id));
    return row;
  }
  async getDrillAssignmentByDept(sessionId: number, department: string): Promise<DrillAssignment | undefined> {
    const [row] = await db.select().from(drillAssignments)
      .where(and(eq(drillAssignments.sessionId, sessionId), eq(drillAssignments.department, department)));
    return row;
  }
  async createDrillAssignment(data: InsertDrillAssignment): Promise<DrillAssignment> {
    const [row] = await db.insert(drillAssignments).values(data).returning();
    return row;
  }
  async updateDrillAssignment(id: number, data: Partial<InsertDrillAssignment>): Promise<DrillAssignment | undefined> {
    const [row] = await db.update(drillAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(drillAssignments.id, id))
      .returning();
    return row;
  }
  async deleteDrillAssignment(id: number): Promise<void> {
    await db.delete(drillAssignments).where(eq(drillAssignments.id, id));
  }
}

export const storage = new DatabaseStorage();
