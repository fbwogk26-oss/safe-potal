import { db } from "./db";
import {
  teams, notices, settings, vehicles, safetyEquipment, safetyInspections,
  type Team, type InsertTeam, type UpdateTeamRequest,
  type Notice, type InsertNotice,
  type Setting,
  type Vehicle, type InsertVehicle, type UpdateVehicleRequest,
  type SafetyEquipment, type InsertSafetyEquipment,
  type SafetyInspection, type InsertSafetyInspection
} from "@shared/schema";
import { eq, desc, asc } from "drizzle-orm";

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

  // Vehicles
  getVehicles(): Promise<Vehicle[]>;
  getVehicle(id: number): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: number, updates: UpdateVehicleRequest): Promise<Vehicle>;
  deleteVehicle(id: number): Promise<void>;

  // Safety Equipment
  getSafetyEquipment(): Promise<SafetyEquipment[]>;
  createSafetyEquipment(equipment: InsertSafetyEquipment): Promise<SafetyEquipment>;
  updateSafetyEquipment(id: number, updates: Partial<InsertSafetyEquipment>): Promise<SafetyEquipment>;
  deleteSafetyEquipment(id: number): Promise<void>;
  
  // Safety Inspections
  getSafetyInspections(): Promise<SafetyInspection[]>;
  createSafetyInspection(inspection: InsertSafetyInspection): Promise<SafetyInspection>;
  deleteSafetyInspection(id: number): Promise<void>;
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
    let query = db.select().from(notices);
    if (category) {
      query.where(eq(notices.category, category));
    }
    return await query.orderBy(desc(notices.createdAt));
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

  // === VEHICLES ===
  async getVehicles(): Promise<Vehicle[]> {
    return await db.select().from(vehicles).orderBy(desc(vehicles.createdAt));
  }

  async getVehicle(id: number): Promise<Vehicle | undefined> {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    return vehicle;
  }

  async createVehicle(insertVehicle: InsertVehicle): Promise<Vehicle> {
    const [vehicle] = await db.insert(vehicles).values(insertVehicle).returning();
    return vehicle;
  }

  async updateVehicle(id: number, updates: UpdateVehicleRequest): Promise<Vehicle> {
    const [vehicle] = await db.update(vehicles).set(updates).where(eq(vehicles.id, id)).returning();
    return vehicle;
  }

  async deleteVehicle(id: number): Promise<void> {
    await db.delete(vehicles).where(eq(vehicles.id, id));
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
  
  async createSafetyInspection(inspection: InsertSafetyInspection): Promise<SafetyInspection> {
    const [created] = await db.insert(safetyInspections).values(inspection).returning();
    return created;
  }
  
  async deleteSafetyInspection(id: number): Promise<void> {
    await db.delete(safetyInspections).where(eq(safetyInspections.id, id));
  }
}

export const storage = new DatabaseStorage();
