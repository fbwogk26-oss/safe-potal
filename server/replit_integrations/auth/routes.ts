import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { ALL_PERMISSIONS, type UserPermissions } from "@shared/models/auth";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const user = await authStorage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      res.json({
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        department: user.department || "",
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/auth/permissions", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const user = await authStorage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const permissions = user.role === "admin" ? ALL_PERMISSIONS : (user.permissions || {});
      res.json({ role: user.role, permissions });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch permissions" });
    }
  });
}
