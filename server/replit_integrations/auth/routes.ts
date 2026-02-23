import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { ALL_PERMISSIONS, type UserPermissions } from "@shared/models/auth";
import bcrypt from "bcryptjs";

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
        mustChangePassword: user.mustChangePassword ?? false,
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

  app.post("/api/auth/change-password", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "현재 비밀번호와 새 비밀번호를 입력해주세요" });
      }
      if (newPassword.length < 4) {
        return res.status(400).json({ message: "새 비밀번호는 4자 이상이어야 합니다" });
      }
      const user = await authStorage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ message: "사용자를 찾을 수 없습니다" });
      }
      const isValid = await authStorage.verifyPassword(currentPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ message: "현재 비밀번호가 올바르지 않습니다" });
      }
      await authStorage.updateUser(user.id, { password: newPassword, mustChangePassword: false });
      res.json({ message: "비밀번호가 변경되었습니다" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "비밀번호 변경에 실패했습니다" });
    }
  });

  app.post("/api/auth/force-change-password", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    try {
      const { newPassword } = req.body;
      if (!newPassword) {
        return res.status(400).json({ message: "새 비밀번호를 입력해주세요" });
      }
      if (newPassword.length < 4) {
        return res.status(400).json({ message: "새 비밀번호는 4자 이상이어야 합니다" });
      }
      const user = await authStorage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ message: "사용자를 찾을 수 없습니다" });
      }
      await authStorage.updateUser(user.id, { password: newPassword, mustChangePassword: false });
      res.json({ message: "비밀번호가 변경되었습니다" });
    } catch (error) {
      console.error("Force password change error:", error);
      res.status(500).json({ message: "비밀번호 변경에 실패했습니다" });
    }
  });

  app.post("/api/auth/admin-reset-password", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    try {
      const adminUser = await authStorage.getUser(session.userId);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "관리자만 비밀번호를 초기화할 수 있습니다" });
      }
      const { userId, newPassword } = req.body;
      if (!userId || !newPassword) {
        return res.status(400).json({ message: "사용자 ID와 새 비밀번호를 입력해주세요" });
      }
      await authStorage.updateUser(userId, { password: newPassword, mustChangePassword: true });
      res.json({ message: "비밀번호가 초기화되었습니다" });
    } catch (error) {
      console.error("Admin reset password error:", error);
      res.status(500).json({ message: "비밀번호 초기화에 실패했습니다" });
    }
  });
}
