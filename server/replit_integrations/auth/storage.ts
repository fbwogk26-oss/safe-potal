import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, count } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Interface for auth storage operations
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(username: string, password: string, name: string, role?: string): Promise<User>;
  updateUser(id: string, data: Partial<{ name: string; role: string; password: string }>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  verifyPassword(password: string, hashedPassword: string): Promise<boolean>;
  getUserCount(): Promise<number>;
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

  async createUser(username: string, password: string, name: string, role: string = "user"): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({
        username,
        password: hashedPassword,
        name,
        role,
      })
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<{ name: string; role: string; password: string }>): Promise<User | undefined> {
    const updateData: any = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.password !== undefined) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }
    
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
}

export const authStorage = new AuthStorage();
