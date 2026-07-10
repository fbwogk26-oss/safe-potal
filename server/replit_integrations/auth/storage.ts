import { users, type User, type UpsertUser, type UserPermissions, ALL_PERMISSIONS, DEFAULT_PERMISSIONS } from "@shared/models/auth";
import { db } from "../../db";
import { eq, count, lt, and, isNull, or } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Interface for auth storage operations
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(username: string, password: string, name: string, role?: string, department?: string, permissions?: UserPermissions): Promise<User>;
  updateUser(id: string, data: Partial<{ name: string; role: string; password: string; department: string; permissions: UserPermissions; mustChangePassword: boolean; isActive: boolean; totpSecret: string | null; totpEnabled: boolean; resignedAt: Date | null; deactivationReason: string | null }>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  verifyPassword(password: string, hashedPassword: string): Promise<boolean>;
  getUserCount(): Promise<number>;
  getDormantUsers(days?: number): Promise<User[]>;
  resignUser(id: string, reason?: string): Promise<User | undefined>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(username: string, password: string, name: string, role: string = "user", department?: string, permissions?: UserPermissions): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const perms = role === "admin" ? ALL_PERMISSIONS : (permissions || DEFAULT_PERMISSIONS);
    const [user] = await db
      .insert(users)
      .values({
        username,
        password: hashedPassword,
        name,
        role,
        department: department || null,
        permissions: perms,
      })
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<{ name: string; role: string; password: string; department: string; permissions: UserPermissions; mustChangePassword: boolean; isActive: boolean; totpSecret: string | null; totpEnabled: boolean; resignedAt: Date | null; deactivationReason: string | null }>): Promise<User | undefined> {
    const updateData: any = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.role !== undefined) {
      updateData.role = data.role;
      if (data.role === "admin") {
        updateData.permissions = ALL_PERMISSIONS;
      }
    }
    if (data.department !== undefined) updateData.department = data.department;
    if (data.permissions !== undefined) updateData.permissions = data.permissions;
    if (data.mustChangePassword !== undefined) updateData.mustChangePassword = data.mustChangePassword;
    if (data.password !== undefined) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }
    if (data.totpSecret !== undefined) updateData.totpSecret = data.totpSecret;
    if (data.totpEnabled !== undefined) updateData.totpEnabled = data.totpEnabled;
    if (data.resignedAt !== undefined) updateData.resignedAt = data.resignedAt;
    if (data.deactivationReason !== undefined) updateData.deactivationReason = data.deactivationReason;
    
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async getUserCount(): Promise<number> {
    const [{ userCount }] = await db.select({ userCount: count() }).from(users);
    return userCount;
  }

  async getDormantUsers(days: number = 90): Promise<User[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return db.select().from(users).where(
      and(
        eq(users.isActive, true),
        isNull(users.resignedAt),
        or(
          isNull(users.lastLoginAt),
          lt(users.lastLoginAt, cutoff)
        )
      )
    );
  }

  async resignUser(id: string, reason?: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        isActive: false,
        resignedAt: new Date(),
        deactivationReason: reason || "퇴사 처리",
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateLoginAttempts(id: string, data: { failedLoginAttempts?: number; lockedUntil?: Date | null; lastLoginAt?: Date }): Promise<void> {
    const updateData: any = {};
    if (data.failedLoginAttempts !== undefined) updateData.failedLoginAttempts = data.failedLoginAttempts;
    if (data.lockedUntil !== undefined) updateData.lockedUntil = data.lockedUntil;
    if (data.lastLoginAt !== undefined) updateData.lastLoginAt = data.lastLoginAt;
    await db.update(users).set(updateData).where(eq(users.id, id));
  }

  async unlockUser(id: string): Promise<void> {
    await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, id));
  }

  async initializeDefaultAdmin(): Promise<void> {
    try {
      const adminExists = await this.getUserByUsername("admin");
      if (!adminExists) {
        console.log("Creating default admin user...");
        await this.createUser("admin", "admin123", "관리자", "admin");
        console.log("Default admin user created successfully");
      }
    } catch (error) {
      console.error("Failed to initialize default admin:", error);
    }
  }
}

export const authStorage = new AuthStorage();
