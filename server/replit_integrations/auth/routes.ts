import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { ALL_PERMISSIONS, type UserPermissions } from "@shared/models/auth";
import bcrypt from "bcryptjs";
import { getSecurityLogs, logSecurityEvent } from "../../security";

function validatePasswordStrength(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: "비밀번호는 8자 이상이어야 합니다" };
  }
  if (!/[A-Za-z]/.test(password)) {
    return { valid: false, message: "비밀번호에 영문자가 포함되어야 합니다" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "비밀번호에 숫자가 포함되어야 합니다" };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: "비밀번호에 특수문자가 포함되어야 합니다" };
  }
  return { valid: true, message: "" };
}

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
      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return res.status(400).json({ message: strength.message });
      }
      const user = await authStorage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ message: "사용자를 찾을 수 없습니다" });
      }
      const isValid = await authStorage.verifyPassword(currentPassword, user.password);
      if (!isValid) {
        await logSecurityEvent("PASSWORD_CHANGE_FAILED", req, "현재 비밀번호 불일치", false, user.id, user.username);
        return res.status(400).json({ message: "현재 비밀번호가 올바르지 않습니다" });
      }
      await authStorage.updateUser(user.id, { password: newPassword, mustChangePassword: false });
      await logSecurityEvent("PASSWORD_CHANGED", req, undefined, true, user.id, user.username);
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
      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return res.status(400).json({ message: strength.message });
      }
      const user = await authStorage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ message: "사용자를 찾을 수 없습니다" });
      }
      await authStorage.updateUser(user.id, { password: newPassword, mustChangePassword: false });
      await logSecurityEvent("PASSWORD_FORCE_CHANGED", req, "최초 로그인 비밀번호 변경", true, user.id, user.username);
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
      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return res.status(400).json({ message: strength.message });
      }
      await authStorage.updateUser(userId, { password: newPassword, mustChangePassword: true });
      const targetUser = await authStorage.getUser(userId);
      await logSecurityEvent("PASSWORD_ADMIN_RESET", req, `관리자가 ${targetUser?.username || userId}의 비밀번호 초기화`, true, adminUser.id, adminUser.username);
      res.json({ message: "비밀번호가 초기화되었습니다" });
    } catch (error) {
      console.error("Admin reset password error:", error);
      res.status(500).json({ message: "비밀번호 초기화에 실패했습니다" });
    }
  });

  app.get("/api/security-logs", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    try {
      const user = await authStorage.getUser(session.userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "관리자만 보안 로그를 조회할 수 있습니다" });
      }
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const logs = await getSecurityLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Security logs error:", error);
      res.status(500).json({ message: "보안 로그 조회에 실패했습니다" });
    }
  });

  app.post("/api/auth/unlock-user", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    try {
      const adminUser = await authStorage.getUser(session.userId);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "관리자만 계정 잠금을 해제할 수 있습니다" });
      }
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "사용자 ID를 입력해주세요" });
      }
      await authStorage.unlockUser(userId);
      const targetUser = await authStorage.getUser(userId);
      await logSecurityEvent("ACCOUNT_UNLOCKED", req, `관리자가 ${targetUser?.username || userId} 계정 잠금 해제`, true, adminUser.id, adminUser.username);
      res.json({ message: "계정 잠금이 해제되었습니다" });
    } catch (error) {
      console.error("Unlock user error:", error);
      res.status(500).json({ message: "계정 잠금 해제에 실패했습니다" });
    }
  });
}
