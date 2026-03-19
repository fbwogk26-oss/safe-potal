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
  workPlans,
  type WorkPlan, type InsertWorkPlan,
} from "@shared/schema";
import { eq, desc, asc, and, ilike, or } from "drizzle-orm";

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
  deleteSafetyInspection(id: number): Promise<void>;

  // Education Sessions
  getEducationSessions(department?: string): Promise<EducationSession[]>;
  getEducationSession(id: number): Promise<EducationSession | undefined>;
  createEducationSession(session: InsertEducationSession): Promise<EducationSession>;
  updateEducationSession(id: number, updates: Partial<InsertEducationSession>): Promise<EducationSession>;
  deleteEducationSession(id: number): Promise<void>;

  // Education Signatures
  getSignaturesBySession(sessionId: number): Promise<EducationSignature[]>;
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

  // New Equipment Requests
  getNewEquipmentRequests(): Promise<NewEquipmentRequest[]>;
  getNewEquipmentRequest(id: number): Promise<NewEquipmentRequest | undefined>;
  createNewEquipmentRequest(request: InsertNewEquipmentRequest): Promise<NewEquipmentRequest>;
  updateNewEquipmentRequest(id: number, updates: Partial<InsertNewEquipmentRequest>): Promise<NewEquipmentRequest>;
  deleteNewEquipmentRequest(id: number): Promise<void>;

  // Musculoskeletal Assessments
  getMusculoskeletalAssessments(): Promise<MusculoskeletalAssessment[]>;
  getMusculoskeletalAssessment(id: number): Promise<MusculoskeletalAssessment | undefined>;
  createMusculoskeletalAssessment(data: InsertMusculoskeletalAssessment): Promise<MusculoskeletalAssessment>;
  updateMusculoskeletalAssessment(id: number, data: Partial<InsertMusculoskeletalAssessment>): Promise<MusculoskeletalAssessment>;
  deleteMusculoskeletalAssessment(id: number): Promise<void>;

  // Vehicles
  getVehicles(): Promise<any[]>;

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
}

export const storage = new DatabaseStorage();
