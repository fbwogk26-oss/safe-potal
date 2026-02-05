import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, count } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if this user already exists
    const existingUser = await this.getUser(userData.id!);
    
    if (existingUser) {
      // User exists, just update their info (but keep their role)
      const [user] = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id!))
        .returning();
      return user;
    }
    
    // New user - check if they should be the first admin
    const [{ userCount }] = await db.select({ userCount: count() }).from(users);
    const isFirstUser = userCount === 0;
    
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        role: isFirstUser ? "admin" : "user", // First user becomes admin
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
