import { db } from "./db";
import {
  teams, notices, settings,
  type Team, type InsertTeam, type UpdateTeamRequest,
  type Notice, type InsertNotice,
  type Setting
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
  createNotice(notice: InsertNotice): Promise<Notice>;
  deleteNotice(id: number): Promise<void>;

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string): Promise<Setting>;
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

  async createNotice(insertNotice: InsertNotice): Promise<Notice> {
    const [notice] = await db.insert(notices).values(insertNotice).returning();
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
}

export const storage = new DatabaseStorage();
