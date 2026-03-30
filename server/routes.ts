import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "./db";
import { teams, trafficFines, accidentReports, educationSignatures } from "@shared/schema";
import { eq, and, count } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { getKoshaMajorAccidents, clearKoshaCache } from "./kosha";
import { fetchWeather, generateSafetyMessage, clearWeatherCache } from "./weather";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";
import { ALL_PERMISSIONS, type UserPermissions } from "@shared/models/auth";
import { registerChatbotRoutes } from "./chatbot";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 파일 확장자 안전 추출 (경로 주입·이중 확장자 방지)
function safeExt(originalname: string, allowed: string[]): string {
  // null byte 제거
  const cleaned = originalname.replace(/\0/g, "");
  // 마지막 .이후 소문자 추출
  const ext = path.extname(cleaned).toLowerCase().replace(/[^a-z0-9]/g, "");
  return allowed.includes(ext) ? `.${ext}` : "";
}

// 오브젝트 스토리지에 Buffer를 업로드하고 /objects/ 경로 반환
// PRIVATE_OBJECT_DIR이 없으면 null 반환 (로컬 fallback)
async function uploadToObjectStorage(buffer: Buffer, filename: string, contentType: string): Promise<string | null> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) return null;
  try {
    const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${filename}`;
    const parts = fullPath.replace(/^\//, "").split("/");
    const bucketName = parts[0];
    const objectName = parts.slice(1).join("/");
    await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, { contentType, resumable: false });
    return `/objects/uploads/${filename}`;
  } catch (e: any) {
    console.error("Object storage 업로드 실패:", e?.message);
    return null;
  }
}

const ALLOWED_IMG_EXTS = ["jpeg", "jpg", "png", "gif", "webp"];
const ALLOWED_EXCEL_EXTS = ["xlsx", "xls", "csv"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const cleanName = file.originalname.replace(/\0/g, "");
    const ext = allowed.test(path.extname(cleanName).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

const excelUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = safeExt(file.originalname, ALLOWED_EXCEL_EXTS);
      cb(null, uniqueSuffix + (ext || ".xlsx"));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = /xlsx|xls|csv/;
    const allowedMime = /spreadsheet|excel|csv|text\/csv/;
    const cleanName = file.originalname.replace(/\0/g, "");
    const ext = allowedExt.test(path.extname(cleanName).toLowerCase());
    const mime = allowedMime.test(file.mimetype);
    cb(null, ext || mime);
  }
});

function calculateScore(team: any) {
  let score = 100;
  
  // Work Accident (-40)
  score -= (team.workAccident || 0) * 40;
  
  // Fines (-1 each)
  score -= (team.fineSpeed || 0);
  score -= (team.fineSignal || 0);
  score -= (team.fineLane || 0);
  
  // Inspection Miss (-3)
  score -= (team.inspectionMiss || 0) * 3;
  
  // Bonuses (+3)
  score += (team.suggestion || 0) * 3;
  score += (team.activity || 0) * 3;
  
  // Vehicle Accidents
  const accidents = team.vehicleAccidents || {};
  score += (accidents.p50_59 || 0) * -5;
  score += (accidents.p60_69 || 0) * -6;
  score += (accidents.p70_79 || 0) * -7;
  score += (accidents.p80_89 || 0) * -8;
  score += (accidents.p90_99 || 0) * -9;
  score += (accidents.p100 || 0) * -10;
  
  return score;
}

async function syncTrafficFineToTeamScore(department: string | null | undefined, violationDate: string | null | undefined) {
  try {
    if (!department) return;
    const year = violationDate ? parseInt(violationDate.substring(0, 4)) : new Date().getFullYear();
    if (isNaN(year)) return;
    const [team] = await db.select().from(teams).where(and(eq(teams.name, department), eq(teams.year, year)));
    if (!team) return;
    const allFines = await db.select().from(trafficFines).where(eq(trafficFines.department, department));
    const yearFines = allFines.filter(f => f.violationDate?.startsWith(String(year)));
    const fineSpeed = yearFines.filter(f => f.violationType === "속도위반").length;
    const fineSignal = yearFines.filter(f => f.violationType === "신호위반").length;
    const fineLane = yearFines.filter(f => f.violationType === "법규위반").length;
    const merged = { ...team, fineSpeed, fineSignal, fineLane };
    const totalScore = calculateScore(merged);
    await db.update(teams).set({ fineSpeed, fineSignal, fineLane, totalScore }).where(eq(teams.id, team.id));
  } catch (e) {
    console.error("[과태료 점수 동기화 오류]", e);
  }
}

async function syncWorkAccidentToTeamScore(department: string | null | undefined, occurredAt: string | null | undefined) {
  try {
    if (!department) return;
    const year = occurredAt ? parseInt(occurredAt.substring(0, 4)) : new Date().getFullYear();
    if (isNaN(year)) return;
    const [team] = await db.select().from(teams).where(and(eq(teams.name, department), eq(teams.year, year)));
    if (!team) return;
    const allAccidents = await db.select().from(accidentReports).where(eq(accidentReports.department, department));
    const workAccident = allAccidents.filter(a =>
      a.occurredAt?.startsWith(String(year)) && a.accidentType !== "교통사고"
    ).length;
    const merged = { ...team, workAccident };
    const totalScore = calculateScore(merged);
    await db.update(teams).set({ workAccident, totalScore }).where(eq(teams.id, team.id));
  } catch (e) {
    console.error("[산재 점수 동기화 오류]", e);
  }
}

async function syncAccidentToTeamScore(department: string | null | undefined, occurredAt: string | null | undefined) {
  try {
    if (!department) return;
    const year = occurredAt ? parseInt(occurredAt.substring(0, 4)) : new Date().getFullYear();
    if (isNaN(year)) return;
    const [team] = await db.select().from(teams).where(and(eq(teams.name, department), eq(teams.year, year)));
    if (!team) return;
    const allAccidents = await db.select().from(accidentReports).where(
      and(eq(accidentReports.department, department), eq(accidentReports.accidentType, "교통사고"))
    );
    const yearAccidents = allAccidents.filter(a => a.occurredAt?.startsWith(String(year)));
    const vehicleAccidents: Record<string, number> = { p50_59: 0, p60_69: 0, p70_79: 0, p80_89: 0, p90_99: 0, p100: 0 };
    for (const acc of yearAccidents) {
      const rate = (acc as any).faultRate;
      if (!rate) continue;
      if (rate >= 50 && rate <= 59) vehicleAccidents.p50_59++;
      else if (rate >= 60 && rate <= 69) vehicleAccidents.p60_69++;
      else if (rate >= 70 && rate <= 79) vehicleAccidents.p70_79++;
      else if (rate >= 80 && rate <= 89) vehicleAccidents.p80_89++;
      else if (rate >= 90 && rate <= 99) vehicleAccidents.p90_99++;
      else if (rate >= 100) vehicleAccidents.p100++;
    }
    const merged = { ...team, vehicleAccidents };
    const totalScore = calculateScore(merged);
    await db.update(teams).set({ vehicleAccidents, totalScore }).where(eq(teams.id, team.id));
  } catch (e) {
    console.error("[사고 점수 동기화 오류]", e);
  }
}

// Admin-only middleware (session-based)
const requireAdmin: any = async (req: any, res: any, next: any) => {
  try {
    const session = req.session as any;
    if (!session.userId) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    const user = await authStorage.getUser(session.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "관리자 권한이 필요합니다" });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "권한 확인에 실패했습니다" });
  }
};

// Permission-based middleware: checks specific permission key
const requirePermission = (permKey: keyof UserPermissions): any => {
  return async (req: any, res: any, next: any) => {
    try {
      const session = req.session as any;
      if (!session.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const user = await authStorage.getUser(session.userId);
      if (!user) {
        return res.status(403).json({ message: "편집 권한이 필요합니다" });
      }
      if (user.role === "admin") {
        req.user = user;
        return next();
      }
      const perms = user.permissions || {};
      if (!(perms as any)[permKey]) {
        return res.status(403).json({ message: "해당 기능에 대한 권한이 없습니다" });
      }
      req.user = user;
      next();
    } catch (error) {
      res.status(500).json({ message: "권한 확인에 실패했습니다" });
    }
  };
};

// General editor middleware (any editing permission)
const requireEditor: any = async (req: any, res: any, next: any) => {
  try {
    const session = req.session as any;
    if (!session.userId) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    const user = await authStorage.getUser(session.userId);
    if (!user) {
      return res.status(403).json({ message: "편집 권한이 필요합니다" });
    }
    if (user.role === "admin") {
      req.user = user;
      return next();
    }
    const perms = user.permissions || {};
    const hasAnyPerm = Object.values(perms).some(v => v === true);
    if (!hasAnyPerm) {
      return res.status(403).json({ message: "편집 권한이 필요합니다" });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "권한 확인에 실패했습니다" });
  }
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup authentication (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);
  registerChatbotRoutes(app);

  // 소유권 체크: 관리자이거나, createdBy가 없거나, 본인이 작성한 경우
  const isOwnerOrAdmin = (req: any, createdBy: string | null | undefined): boolean => {
    return req.user?.role === "admin" || !createdBy || req.user?.username === createdBy;
  };

  // Add routes to get/update user role
  app.get("/api/auth/user-role", isAuthenticated, async (req: any, res) => {
    try {
      const session = req.session as any;
      const user = await authStorage.getUser(session.userId);
      res.json({ role: user?.role || "user" });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user role" });
    }
  });

  // Admin: Create new user
  app.post("/api/users", requireAdmin, async (req: any, res) => {
    try {
      const { username, password, name, department, role } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "아이디와 비밀번호는 필수입니다" });
      }
      const existingUser = await authStorage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "이미 존재하는 아이디입니다" });
      }
      const userRole = role || "user";
      let presetPerms = undefined;
      if (userRole !== "admin") {
        const preset = await storage.getSetting(`role_preset_${userRole}`);
        if (preset?.value) {
          presetPerms = JSON.parse(preset.value);
        }
      }
      const user = await authStorage.createUser(username, password, name || username, userRole, department, presetPerms);
      res.status(201).json({
        id: user.id,
        username: user.username,
        name: user.name,
        department: user.department,
        role: user.role,
      });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "사용자 생성에 실패했습니다" });
    }
  });

  // Admin: Bulk upload users via Excel/CSV
  app.post("/api/users/bulk-upload", requireAdmin, excelUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "파일이 필요합니다" });
      }

      const filePath = req.file.path;
      const ext = path.extname(req.file.originalname).toLowerCase();
      let users: Array<{ department: string; name: string; username: string; password: string }> = [];

      if (ext === ".csv") {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split(/\r?\n/).filter(line => line.trim());
        
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map(s => s.trim());
          if (cols.length >= 4 && cols[2] && cols[3]) {
            users.push({
              department: cols[0] || "",
              name: cols[1] || cols[2],
              username: cols[2],
              password: cols[3],
            });
          }
        }
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];
        
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) {
            const department = String(row.getCell(1).value || "").trim();
            const name = String(row.getCell(2).value || "").trim();
            const username = String(row.getCell(3).value || "").trim();
            const password = String(row.getCell(4).value || "").trim();
            
            if (username && password) {
              users.push({ department, name: name || username, username, password });
            }
          }
        });
      }

      fs.unlinkSync(filePath);

      let successCount = 0;
      let skipCount = 0;

      for (const userData of users) {
        try {
          const existing = await authStorage.getUserByUsername(userData.username);
          if (existing) {
            skipCount++;
            continue;
          }
          const userPreset = await storage.getSetting('role_preset_user');
          const presetPerms = userPreset?.value ? JSON.parse(userPreset.value) : undefined;
          await authStorage.createUser(userData.username, userData.password, userData.name, "user", userData.department, presetPerms);
          successCount++;
        } catch (err) {
          skipCount++;
        }
      }

      res.json({ successCount, skipCount });
    } catch (error) {
      console.error("Bulk upload error:", error);
      res.status(500).json({ message: "일괄 등록에 실패했습니다" });
    }
  });

  // Admin: Update user
  app.put("/api/users/:id", requireAdmin, async (req: any, res) => {
    try {
      const { name, department, role, password, permissions } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (department !== undefined) updateData.department = department;
      if (role !== undefined) {
        if (!["admin", "manager", "user"].includes(role)) {
          return res.status(400).json({ message: "유효하지 않은 역할입니다" });
        }
        updateData.role = role;
        if (role !== "admin" && permissions === undefined) {
          const preset = await storage.getSetting(`role_preset_${role}`);
          if (preset?.value) {
            updateData.permissions = JSON.parse(preset.value);
          }
        }
      }
      if (permissions !== undefined) updateData.permissions = permissions;
      if (password) updateData.password = password;
      
      const user = await authStorage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }
      res.json({
        id: user.id,
        username: user.username,
        name: user.name,
        department: user.department,
        role: user.role,
      });
    } catch (error) {
      res.status(500).json({ message: "사용자 정보 변경에 실패했습니다" });
    }
  });

  // Admin: Delete user
  app.delete("/api/users/:id", requireAdmin, async (req: any, res) => {
    try {
      const session = req.session as any;
      if (session.userId === req.params.id) {
        return res.status(400).json({ message: "자기 자신은 삭제할 수 없습니다" });
      }
      await authStorage.deleteUser(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "사용자 삭제에 실패했습니다" });
    }
  });

  // Admin: Get all users
  // 인증된 모든 사용자가 조회 가능한 사용자 이름 목록 (부서장 선택용)
  app.get("/api/users/names", isAuthenticated, async (req: any, res) => {
    try {
      const users = await authStorage.getAllUsers();
      const names = users.map((u: any) => ({ id: u.id, name: u.name || u.username, username: u.username, department: u.department || "" }));
      res.json(names);
    } catch (error) {
      res.status(500).json({ message: "사용자 목록 조회 실패" });
    }
  });

  app.get("/api/users", requireAdmin, async (req: any, res) => {
    try {
      const users = await authStorage.getAllUsers();
      res.json(users.map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        department: u.department,
        role: u.role,
        permissions: u.permissions,
        createdAt: u.createdAt,
        failedLoginAttempts: u.failedLoginAttempts || 0,
        lockedUntil: u.lockedUntil,
      })));
    } catch (error) {
      res.status(500).json({ message: "사용자 목록을 불러올 수 없습니다" });
    }
  });

  // === TEAMS ===
  app.get(api.teams.list.path, isAuthenticated, async (req: any, res) => {
    const year = req.query.year ? Number(req.query.year) : 2025;
    const teams = await storage.getTeams(year);
    res.json(teams);
  });

  app.post(api.teams.create.path, requireEditor, async (req: any, res) => {
    try {
      const input = api.teams.create.input.parse(req.body);
      // Calculate score
      const totalScore = calculateScore(input);
      const team = await storage.createTeam({ ...input, totalScore });
      res.status(201).json(team);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.teams.update.path, requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getTeam(id);
      if (!existing) return res.status(404).json({ message: "Team not found" });

      const input = api.teams.update.input.parse(req.body);
      // Merge for calculation
      const merged = { ...existing, ...input };
      const totalScore = calculateScore(merged);
      
      const team = await storage.updateTeam(id, { ...input, totalScore });
      res.json(team);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.teams.delete.path, requireEditor, async (req: any, res) => {
    await storage.deleteTeam(Number(req.params.id));
    res.status(204).send();
  });

  // Reset single team scores
  app.post('/api/teams/:id/reset', requireEditor, async (req: any, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getTeam(id);
    if (!existing) return res.status(404).json({ message: "Team not found" });

    const resetData = {
      workAccident: 0,
      fineSpeed: 0,
      fineSignal: 0,
      fineLane: 0,
      inspectionMiss: 0,
      suggestion: 0,
      activity: 0,
      vehicleAccidents: {},
      totalScore: 100,
    };
    const team = await storage.updateTeam(id, resetData);
    res.json(team);
  });

  // Reset all teams for a year
  app.post('/api/teams/reset-all', requireEditor, async (req: any, res) => {
    const { year } = req.body;
    const teams = await storage.getTeams(year);
    
    const resetData = {
      workAccident: 0,
      fineSpeed: 0,
      fineSignal: 0,
      fineLane: 0,
      inspectionMiss: 0,
      suggestion: 0,
      activity: 0,
      vehicleAccidents: {},
      totalScore: 100,
    };

    for (const team of teams) {
      await storage.updateTeam(team.id, resetData);
    }
    
    res.json({ success: true, count: teams.length });
  });

  // Team Excel Import
  app.post('/api/teams/import', requireEditor, async (req: any, res) => {
    try {
      const { data, year } = req.body;
      if (!Array.isArray(data)) {
        return res.status(400).json({ message: "Invalid data format" });
      }
      
      const targetYear = year ?? 2026;
      const existingTeams = await storage.getTeams(targetYear);
      let updated = 0;
      
      for (const row of data) {
        if (!row.name) continue;
        
        const team = existingTeams.find(t => t.name === row.name);
        
        if (team) {
          const merged = {
            ...team,
            vehicleCount: row.vehicleCount ?? team.vehicleCount,
            workAccident: row.workAccident ?? team.workAccident,
            fineSpeed: row.fineSpeed ?? team.fineSpeed,
            fineSignal: row.fineSignal ?? team.fineSignal,
            fineLane: row.fineLane ?? team.fineLane,
            inspectionMiss: row.inspectionMiss ?? team.inspectionMiss,
            suggestion: row.suggestion ?? team.suggestion,
            activity: row.activity ?? team.activity,
            vehicleAccidents: team.vehicleAccidents ?? {},
          };
          const totalScore = calculateScore(merged);
          await storage.updateTeam(team.id, { 
            vehicleCount: merged.vehicleCount,
            workAccident: merged.workAccident,
            fineSpeed: merged.fineSpeed,
            fineSignal: merged.fineSignal,
            fineLane: merged.fineLane,
            inspectionMiss: merged.inspectionMiss,
            suggestion: merged.suggestion,
            activity: merged.activity,
            totalScore 
          });
          updated++;
        } else {
          const newTeam = {
            name: row.name,
            year: targetYear,
            vehicleCount: row.vehicleCount ?? 0,
            workAccident: row.workAccident ?? 0,
            fineSpeed: row.fineSpeed ?? 0,
            fineSignal: row.fineSignal ?? 0,
            fineLane: row.fineLane ?? 0,
            inspectionMiss: row.inspectionMiss ?? 0,
            suggestion: row.suggestion ?? 0,
            activity: row.activity ?? 0,
            vehicleAccidents: {},
          };
          const totalScore = calculateScore(newTeam);
          await storage.createTeam({ ...newTeam, totalScore });
          updated++;
        }
      }
      
      res.json({ success: true, count: updated });
    } catch (err) {
      console.error('Team import error:', err);
      res.status(500).json({ message: "Import failed" });
    }
  });

  // Team Excel Export
  app.get('/api/teams/export', isAuthenticated, async (req: any, res) => {
    const year = req.query.year ? Number(req.query.year) : 2026;
    const teams = await storage.getTeams(year);
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('팀안전점수');
    
    worksheet.columns = [
      { header: '순번', key: 'no', width: 8 },
      { header: '팀명', key: 'name', width: 15 },
      { header: '차량대수', key: 'vehicleCount', width: 12 },
      { header: '산업재해', key: 'workAccident', width: 12 },
      { header: '과속', key: 'fineSpeed', width: 10 },
      { header: '신호위반', key: 'fineSignal', width: 10 },
      { header: '차선위반', key: 'fineLane', width: 10 },
      { header: '점검미실시', key: 'inspectionMiss', width: 12 },
      { header: '제안', key: 'suggestion', width: 10 },
      { header: '활동', key: 'activity', width: 10 },
      { header: '점수', key: 'totalScore', width: 10 },
    ];
    
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    teams.forEach((t, idx) => {
      worksheet.addRow({
        no: idx + 1,
        name: t.name,
        vehicleCount: t.vehicleCount,
        workAccident: t.workAccident,
        fineSpeed: t.fineSpeed,
        fineSignal: t.fineSignal,
        fineLane: t.fineLane,
        inspectionMiss: t.inspectionMiss,
        suggestion: t.suggestion,
        activity: t.activity,
        totalScore: t.totalScore,
      });
    });
    
    const buffer = await workbook.xlsx.writeBuffer();
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=team_scores_${today}.xlsx`);
    res.send(buffer);
  });

  // 공개 정적 에셋 (이메일 삽입 이미지 등 - 인증 불필요)
  app.use('/public-assets', (await import('express')).default.static(path.join(process.cwd(), 'server', 'assets')));

  // === IMAGE UPLOAD ===
  app.use('/uploads', isAuthenticated, (await import('express')).default.static(uploadDir));
  
  // Register Object Storage routes for persistent file uploads
  registerObjectStorageRoutes(app);
  
  app.post('/api/upload', requireEditor, upload.single('image'), async (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = safeExt(req.file.originalname, ALLOWED_IMG_EXTS);
    const filename = uniqueSuffix + ext;
    const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
    if (objUrl) {
      return res.json({ imageUrl: objUrl });
    }
    // 로컬 개발 환경 fallback: 디스크 저장
    const localPath = path.join(uploadDir, filename);
    fs.writeFileSync(localPath, req.file.buffer);
    res.json({ imageUrl: `/uploads/${filename}` });
  });

  // === GENERAL FILE UPLOAD (PDF, PPT, Word, Excel, Video, Images up to 100MB) ===
  // 허용 확장자 명시적 화이트리스트 (HTML/SVG/스크립트 등 XSS 위험 형식 차단)
  const ALLOWED_GENERAL_EXTENSIONS = new Set([
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt",
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp",
    ".mp4", ".mov", ".avi", ".mkv", ".webm",
    ".zip", ".hwp", ".hwpx",
  ]);
  const ALLOWED_GENERAL_EXTS_ARR = Array.from(ALLOWED_GENERAL_EXTENSIONS).map(e => e.replace(".", ""));
  const generalUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname.replace(/\0/g, "")).toLowerCase();
      if (ALLOWED_GENERAL_EXTENSIONS.has(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`허용되지 않는 파일 형식입니다: ${ext}`));
      }
    },
  });

  app.post('/api/upload/general', isAuthenticated, (req: any, res: any, next: any) => {
    generalUpload.single('file')(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({ message: err.message || "파일 업로드에 실패했습니다" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(req.file.originalname.replace(/\0/g, "")).toLowerCase();
      const filename = `file-${uniqueSuffix}${ext}`;
      const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
      if (objUrl) {
        return res.json({ url: objUrl, name: req.file.originalname });
      }
      // 로컬 개발 환경 fallback: 디스크 저장
      const localPath = path.join(uploadDir, filename);
      fs.writeFileSync(localPath, req.file.buffer);
      res.json({ url: `/uploads/${filename}`, name: req.file.originalname });
    });
  });

  // === FILE UPLOAD (Excel, etc.) ===
  const fileUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = safeExt(file.originalname, ALLOWED_EXCEL_EXTS);
        cb(null, `file-${uniqueSuffix}${ext || ".xlsx"}`);
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream'
      ];
      if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('Only Excel files are allowed'));
      }
    }
  });

  app.post('/api/upload/file', requireEditor, fileUpload.single('file'), (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ fileUrl, fileName: req.file.originalname });
  });

  // === NOTICES ===
  app.get(api.notices.list.path, isAuthenticated, async (req: any, res) => {
    const category = req.query.category as string;
    const notices = await storage.getNotices(category);
    res.json(notices);
  });

  app.post(api.notices.create.path, requireEditor, async (req: any, res) => {
    const input = api.notices.create.input.parse(req.body);
    const notice = await storage.createNotice({ ...input, createdBy: req.user?.username || null });
    res.status(201).json(notice);
  });

  app.put(api.notices.update.path, requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getNotice(id);
      if (!existing) return res.status(404).json({ message: "Notice not found" });
      if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 작성한 글만 수정할 수 있습니다" });
      const input = api.notices.update.input.parse(req.body);
      const updated = await storage.updateNotice(id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.notices.delete.path, requireEditor, async (req: any, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getNotice(id);
    if (!existing) return res.status(404).json({ message: "Notice not found" });
    if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 작성한 글만 삭제할 수 있습니다" });
    await storage.deleteNotice(id);
    res.status(204).send();
  });

  // DELETE /api/notices/bulk - 일괄 삭제 (관리자 또는 본인 글만)
  app.delete("/api/notices/bulk", requireEditor, async (req: any, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids 필드가 필요합니다" });
      const isAdmin = req.session?.user?.role === "admin";
      let deleted = 0;
      for (const id of ids) {
        const existing = await storage.getNotice(Number(id));
        if (!existing) continue;
        if (!isAdmin && existing.createdBy && existing.createdBy !== req.session?.user?.username) continue;
        await storage.deleteNotice(Number(id));
        deleted++;
      }
      res.json({ deleted });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // === ACCESS REQUEST EXCEL DOWNLOAD (Single Item) ===
  app.get('/api/access/excel/:id', isAuthenticated, async (req: any, res) => {
    try {
      const notice = await storage.getNotice(Number(req.params.id));
      if (!notice) {
        return res.status(404).json({ message: "Not found" });
      }

      const templatePath = path.join(process.cwd(), "server/templates/access_template.xlsx");
      
      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ message: "Template not found" });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templatePath);
      const worksheet = workbook.getWorksheet(1);
      
      if (!worksheet) {
        return res.status(500).json({ message: "Worksheet not found" });
      }

      const data = JSON.parse(notice.content);

      const row1Cell = worksheet.getCell('A1');
      const entranceLocation = data.entranceLocation || '';
      const visitPurpose = data.visitPurpose || '';
      row1Cell.value = `kt MOS남부 대구본부 "${visitPurpose}" 을/를 위한 출입신청(출입장소: "${entranceLocation}")`;

      const supervisorDept = data.supervisorDepartment || '';
      const supervisorName = data.supervisorName || '';
      const supervisorPhone = data.supervisorPhone || '';
      worksheet.getCell('A2').value = `인솔자 : ${supervisorDept} / ${supervisorName} (${supervisorPhone})`;

      const startDate = data.visitPeriodStartDate || '';
      const startTime = data.visitPeriodStartTime || '';
      const endDate = data.visitPeriodEndDate || '';
      const endTime = data.visitPeriodEndTime || '';
      
      const formatDateWithDay = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dayName = days[date.getDay()];
        return `${year}.${month}.${day}(${dayName})`;
      };

      const formattedStart = formatDateWithDay(startDate);
      const formattedEnd = formatDateWithDay(endDate);
      
      if (startDate === endDate || !endDate) {
        worksheet.getCell('A3').value = `방문기간 : ${formattedStart} ${startTime} ~ ${endTime}`;
      } else {
        worksheet.getCell('A3').value = `방문기간 : ${formattedStart} ${startTime} ~ ${formattedEnd} ${endTime}`;
      }

      for (let r = 4; r <= 100; r++) {
        const row = worksheet.getRow(r);
        row.getCell(8).value = null;
        row.getCell(9).value = null;
      }
      worksheet.getColumn(8).width = 0.1;
      worksheet.getColumn(9).width = 0.1;

      const templateRow = worksheet.getRow(5);
      const templateRowHeight = templateRow.height;
      const templateStyle: any = {};
      for (let col = 1; col <= 7; col++) {
        const cell = templateRow.getCell(col);
        templateStyle[col] = {
          font: cell.font ? { ...cell.font } : undefined,
          alignment: cell.alignment ? { ...cell.alignment } : undefined,
          border: cell.border ? { ...cell.border } : undefined,
          fill: cell.fill ? { ...cell.fill } : undefined,
        };
      }

      const people = data.people || [];
      let rowIndex = 5;
      
      for (let i = 0; i < people.length; i++) {
        const person = people[i];
        const row = worksheet.getRow(rowIndex);
        
        if (templateRowHeight) {
          row.height = templateRowHeight;
        }
        
        row.getCell(1).value = i + 1;
        row.getCell(2).value = person.department || '';
        row.getCell(3).value = person.applicantName || '';
        row.getCell(4).value = person.idNumber || '';
        row.getCell(5).value = person.phone || '';
        row.getCell(6).value = '';
        row.getCell(7).value = person.hasVehicle === '있음' ? person.vehicleNumber : '';

        for (let col = 1; col <= 7; col++) {
          const cell = row.getCell(col);
          if (templateStyle[col]?.font) cell.font = templateStyle[col].font;
          if (templateStyle[col]?.alignment) cell.alignment = templateStyle[col].alignment;
          if (templateStyle[col]?.border) cell.border = templateStyle[col].border;
          if (templateStyle[col]?.fill) cell.fill = templateStyle[col].fill;
        }
        
        row.commit();
        rowIndex++;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
      const filename = encodeURIComponent(`kt MOS남부 대구본부 ${visitPurpose} 을를 위한 출입신청(출입장소 ${entranceLocation})_${today}.xlsx`);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error('Excel generation error:', err);
      res.status(500).json({ message: "Failed to generate Excel" });
    }
  });

  // === PINNED NOTICE ===
  app.get("/api/settings/pinned-notice", isAuthenticated, async (req: any, res) => {
    const setting = await storage.getSetting('pinned_notice_id');
    res.json({ pinnedNoticeId: setting?.value ? Number(setting.value) : null });
  });

  app.post("/api/settings/pinned-notice", requireEditor, async (req: any, res) => {
    const { noticeId } = req.body;
    if (noticeId === null) {
      await storage.setSetting('pinned_notice_id', '');
    } else {
      await storage.setSetting('pinned_notice_id', String(noticeId));
    }
    res.json({ success: true, pinnedNoticeId: noticeId });
  });

  // === INSPECTION TARGETS ===
  app.get("/api/settings/inspection-targets", isAuthenticated, async (req: any, res) => {
    const safetyBujang = await storage.getSetting('inspection_target_safety_bujang');
    const safetyTeamjang = await storage.getSetting('inspection_target_safety_teamjang');
    const accompanyBujang = await storage.getSetting('inspection_target_accompany_bujang');
    const accompanyTeamjang = await storage.getSetting('inspection_target_accompany_teamjang');
    const legacySafety = await storage.getSetting('inspection_target_safety');
    const legacyAccompany = await storage.getSetting('inspection_target_accompany');
    res.json({
      safetyBujang: safetyBujang?.value ? Number(safetyBujang.value) : 0,
      safetyTeamjang: safetyTeamjang?.value ? Number(safetyTeamjang.value) : 0,
      accompanyBujang: accompanyBujang?.value ? Number(accompanyBujang.value) : 0,
      accompanyTeamjang: accompanyTeamjang?.value ? Number(accompanyTeamjang.value) : 0,
      safetyTarget: legacySafety?.value ? Number(legacySafety.value) : 0,
      accompanyTarget: legacyAccompany?.value ? Number(legacyAccompany.value) : 0,
    });
  });

  app.post("/api/settings/inspection-targets", requireAdmin, async (req: any, res) => {
    const { safetyBujang, safetyTeamjang, accompanyBujang, accompanyTeamjang } = req.body;
    if (safetyBujang !== undefined) {
      await storage.setSetting('inspection_target_safety_bujang', String(safetyBujang));
    }
    if (safetyTeamjang !== undefined) {
      await storage.setSetting('inspection_target_safety_teamjang', String(safetyTeamjang));
    }
    if (accompanyBujang !== undefined) {
      await storage.setSetting('inspection_target_accompany_bujang', String(accompanyBujang));
    }
    if (accompanyTeamjang !== undefined) {
      await storage.setSetting('inspection_target_accompany_teamjang', String(accompanyTeamjang));
    }
    res.json({ success: true });
  });

  // === ROLE PERMISSION PRESETS ===
  app.get("/api/settings/role-presets", isAuthenticated, async (req: any, res) => {
    const userPreset = await storage.getSetting('role_preset_user');
    const managerPreset = await storage.getSetting('role_preset_manager');
    const deptHeadPreset = await storage.getSetting('role_preset_deptHead');
    res.json({
      user: userPreset?.value ? JSON.parse(userPreset.value) : null,
      manager: managerPreset?.value ? JSON.parse(managerPreset.value) : null,
      deptHead: deptHeadPreset?.value ? JSON.parse(deptHeadPreset.value) : null,
    });
  });

  app.post("/api/settings/role-presets", requireAdmin, async (req: any, res) => {
    const { role, permissions } = req.body;
    if (!role || !permissions) {
      return res.status(400).json({ message: "역할과 권한 설정이 필요합니다" });
    }
    if (role !== "user" && role !== "manager" && role !== "deptHead") {
      return res.status(400).json({ message: "일반사용자 또는 담당자만 설정할 수 있습니다" });
    }
    await storage.setSetting(`role_preset_${role}`, JSON.stringify(permissions));
    res.json({ success: true });
  });

  // === SAFETY EQUIPMENT ===
  const DEFAULT_EQUIPMENT_LIST = [
    { name: "안전모(일반)", category: "보호구" },
    { name: "일반안전화", category: "보호구" },
    { name: "하계안전화", category: "보호구" },
    { name: "실내안전화", category: "보호구" },
    { name: "안전장화", category: "보호구" },
    { name: "안전대(복합식)", category: "보호구" },
    { name: "절연장갑", category: "보호구" },
    { name: "안전모(임업)", category: "보호구" },
    { name: "안전모(신호수)", category: "보호구" },
    { name: "추락방지대(로프식)", category: "보호구" },
    { name: "추락방지대(와이어식)", category: "보호구" },
    { name: "휴대용소화기", category: "안전용품" },
    { name: "반사조끼(주황색조끼)", category: "안전용품" },
    { name: "수평구명줄SET", category: "안전용품" },
    { name: "비상용삼각대", category: "안전용품" },
    { name: "접이식 라바콘", category: "안전용품" },
    { name: "차량 고임목", category: "안전용품" },
    { name: "A형사다리", category: "기타품목" },
    { name: "아웃트리거", category: "기타품목" },
    { name: "블랙박스", category: "기타품목" },
    { name: "후방센서", category: "기타품목" },
    { name: "후방카메라", category: "기타품목" },
  ];

  app.get("/api/safety-equipment", isAuthenticated, async (req: any, res) => {
    const equipment = await storage.getSafetyEquipment();
    res.json(equipment);
  });

  // Seed default equipment (idempotent - only adds missing defaults)
  app.post("/api/safety-equipment/seed-defaults", requireEditor, async (req: any, res) => {
    try {
      const existing = await storage.getSafetyEquipment();
      const existingNames = new Set(existing.map(e => e.name));
      
      let count = 0;
      for (const item of DEFAULT_EQUIPMENT_LIST) {
        if (!existingNames.has(item.name)) {
          await storage.createSafetyEquipment({ name: item.name, category: item.category, isActive: true });
          count++;
        }
      }
      res.json({ message: count > 0 ? "Defaults seeded" : "All defaults already exist", count });
    } catch (err) {
      console.error('Seed defaults error:', err);
      res.status(500).json({ message: "Failed to seed defaults" });
    }
  });

  app.post("/api/safety-equipment", requireEditor, upload.single('image'), async (req: any, res) => {
    try {
      const { name, category } = req.body;
      if (!name || !category) {
        return res.status(400).json({ message: "Name and category are required" });
      }
      
      // If defaults are missing, seed them first (idempotent)
      const existing = await storage.getSafetyEquipment();
      const existingNames = new Set(existing.map(e => e.name));
      for (const item of DEFAULT_EQUIPMENT_LIST) {
        if (!existingNames.has(item.name)) {
          await storage.createSafetyEquipment({ name: item.name, category: item.category, isActive: true });
        }
      }
      
      let imageUrl: string | undefined;
      if (req.file) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = safeExt(req.file.originalname, ALLOWED_IMG_EXTS);
        const filename = uniqueSuffix + ext;
        const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
        if (objUrl) {
          imageUrl = objUrl;
        } else {
          fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
          imageUrl = `/uploads/${filename}`;
        }
      }
      const equipment = await storage.createSafetyEquipment({ name, category, imageUrl, isActive: true });
      res.status(201).json(equipment);
    } catch (err) {
      console.error('Create equipment error:', err);
      res.status(500).json({ message: "Failed to create equipment" });
    }
  });

  app.put("/api/safety-equipment/:id", requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { name, category, imageUrl } = req.body;
      const equipment = await storage.updateSafetyEquipment(id, { name, category, imageUrl });
      res.json(equipment);
    } catch (err) {
      console.error('Update equipment error:', err);
      res.status(500).json({ message: "Failed to update equipment" });
    }
  });

  app.delete("/api/safety-equipment/:id", requireEditor, async (req: any, res) => {
    await storage.deleteSafetyEquipment(Number(req.params.id));
    res.status(204).send();
  });

  // Update team equipment (when new equipment is issued without disposal)
  app.post("/api/teams/update-equipment", requireEditor, async (req: any, res) => {
    try {
      const { team, items } = req.body;
      if (!team || !items || !Array.isArray(items)) {
        return res.status(400).json({ message: "Team and items are required" });
      }
      
      // Get existing equip_status notices
      const existingRecords = await storage.getNotices("equip_status");
      
      // Find the team's equipment record
      let teamRecord = existingRecords.find(r => {
        try {
          const parsed = JSON.parse(r.content);
          return parsed.team === team;
        } catch {
          return false;
        }
      });
      
      if (teamRecord) {
        // Update existing record
        const parsed = JSON.parse(teamRecord.content);
        const existingItems = parsed.items || [];
        
        // Add quantities for matching items
        for (const newItem of items) {
          const existingItem = existingItems.find((i: { name: string }) => i.name === newItem.name);
          if (existingItem) {
            existingItem.quantity = (existingItem.quantity || 0) + (newItem.quantity || 1);
          } else {
            existingItems.push({
              name: newItem.name,
              quantity: newItem.quantity || 1,
              category: newItem.category || "보호구",
              status: "등록"
            });
          }
        }
        
        await storage.updateNotice(teamRecord.id, {
          title: `${team} 보호구 현황`,
          content: JSON.stringify({
            team,
            items: existingItems,
            lastUpdated: new Date().toISOString()
          })
        });
      } else {
        // Create new record for team
        const newItems = items.map((item: { name: string; quantity?: number; category?: string }) => ({
          name: item.name,
          quantity: item.quantity || 1,
          category: item.category || "보호구",
          status: "등록"
        }));
        
        await storage.createNotice({
          category: "equip_status",
          title: `${team} 보호구 현황`,
          content: JSON.stringify({
            team,
            items: newItems,
            lastUpdated: new Date().toISOString()
          })
        });
      }
      
      const equipmentSummary = items.map((item: { name: string; quantity: number }) => 
        `${item.name} x${item.quantity || 1}`
      ).join(", ");
      
      console.log(`Equipment updated for team ${team}: ${equipmentSummary}`);
      res.json({ success: true, message: "Equipment count updated" });
    } catch (err) {
      console.error("Update equipment error:", err);
      res.status(500).json({ message: "Failed to update equipment" });
    }
  });

  // === SAFETY INSPECTIONS ===
  app.get("/api/safety-inspections", isAuthenticated, async (req: any, res) => {
    const inspections = await storage.getSafetyInspections();
    res.json(inspections);
  });

  app.post("/api/safety-inspections", requireEditor, async (req: any, res) => {
    try {
      const { inspectionType, title, location, inspector, workerName, inspectionDate, checklist, notes, images } = req.body;
      if (!inspectionType || !title || !inspectionDate) {
        return res.status(400).json({ message: "Required fields missing" });
      }
      const inspection = await storage.createSafetyInspection({
        inspectionType,
        title,
        location,
        inspector,
        workerName,
        inspectionDate,
        checklist: checklist || [],
        notes,
        images: images || [],
        createdBy: req.user?.username || null,
      });
      res.status(201).json(inspection);
    } catch (err) {
      console.error("Create inspection error:", err);
      res.status(500).json({ message: "Failed to create inspection" });
    }
  });

  app.delete("/api/safety-inspections/:id", requireEditor, async (req: any, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getSafetyInspection(id);
    if (!existing) return res.status(404).json({ message: "Not found" });
    if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 작성한 점검만 삭제할 수 있습니다" });
    await storage.deleteSafetyInspection(id);
    res.status(204).send();
  });

  // Seed Data
  await seedDatabase();

  // === EDUCATION SESSIONS (교육일지) ===
  app.get("/api/education-sessions", isAuthenticated, async (req: any, res) => {
    const department = req.query.department as string | undefined;
    const sessions = await storage.getEducationSessions(department);
    const sigCounts = await db
      .select({ sessionId: educationSignatures.sessionId, cnt: count() })
      .from(educationSignatures)
      .groupBy(educationSignatures.sessionId);
    const sigMap: Record<number, number> = {};
    for (const row of sigCounts) sigMap[row.sessionId] = Number(row.cnt);
    const result = sessions.map(s => ({
      ...s,
      signatureCount: sigMap[s.id] ?? 0,
    }));
    res.json(result);
  });

  // === EDUCATION GROUP EXCEL DOWNLOAD (must be before /:id route) ===
  app.get("/api/education-sessions/group-excel", isAuthenticated, async (req: any, res) => {
    try {
      const { title, date } = req.query;
      if (!title || !date) {
        return res.status(400).json({ message: "title과 date 파라미터가 필요합니다" });
      }

      const allSessions = await storage.getEducationSessions();
      const groupSessions = allSessions.filter(
        (s) => s.title === title && s.educationDate === date
      );

      if (groupSessions.length === 0) {
        return res.status(404).json({ message: "해당 교육을 찾을 수 없습니다" });
      }

      const workbook = new ExcelJS.Workbook();
      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const objService = new ObjectStorageService();

      for (const session of groupSessions) {
        const dept = session.department;
        const signatures = await storage.getSignaturesBySession(session.id);

        const sigSheet = workbook.addWorksheet(`${dept}_참석자명단`);
        sigSheet.properties.defaultColWidth = 14;
        sigSheet.getColumn(1).width = 8;
        sigSheet.getColumn(2).width = 14;
        sigSheet.getColumn(3).width = 22;
        sigSheet.getColumn(4).width = 8;
        sigSheet.getColumn(5).width = 14;
        sigSheet.getColumn(6).width = 22;

        sigSheet.mergeCells("A1:F1");
        const titleCell = sigSheet.getCell("A1");
        titleCell.value = `"${title}" 참석자 명단`;
        titleCell.font = { bold: true, size: 16 };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };
        titleCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
        sigSheet.getRow(1).height = 36;

        sigSheet.getRow(2).height = 8;

        sigSheet.mergeCells("A3:C3");
        const dateCell = sigSheet.getCell("A3");
        dateCell.value = `□ 시행일시: ${date}`;
        dateCell.font = { size: 11 };
        dateCell.alignment = { vertical: "middle" };
        sigSheet.mergeCells("D3:F3");
        const deptCell = sigSheet.getCell("D3");
        deptCell.value = `□ 부서명: ${dept}`;
        deptCell.font = { size: 11 };
        deptCell.alignment = { vertical: "middle" };
        sigSheet.getRow(3).height = 24;

        const headers = ["순번", "이름", "서명", "순번", "이름", "서명"];
        const headerRow = sigSheet.getRow(4);
        headers.forEach((h, i) => {
          const cell = headerRow.getCell(i + 1);
          cell.value = h;
          cell.font = { bold: true, size: 10 };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
          cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
        });
        headerRow.height = 22;

        for (let i = 0; i < 25; i++) {
          const row = sigSheet.getRow(5 + i);
          row.height = 32;

          const leftNumCell = row.getCell(1);
          leftNumCell.value = i + 1;
          leftNumCell.alignment = { horizontal: "center", vertical: "middle" };
          leftNumCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
          const leftNameCell = row.getCell(2);
          leftNameCell.alignment = { horizontal: "center", vertical: "middle" };
          leftNameCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
          const leftSigCell = row.getCell(3);
          leftSigCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };

          if (signatures[i]) {
            leftNameCell.value = signatures[i].signerName;
            try {
              const sigData = signatures[i].signatureData;
              if (sigData && sigData.startsWith("data:image/")) {
                const base64Part = sigData.split(",")[1];
                const ext = sigData.includes("image/png") ? "png" : "jpeg";
                const imageId = workbook.addImage({ base64: base64Part, extension: ext as "png" | "jpeg" });
                (sigSheet as any).addImage(imageId, { tl: { col: 2, row: 4 + i }, br: { col: 3, row: 5 + i }, editAs: "oneCell" });
              }
            } catch (e) { /* skip */ }
          }

          const rightIdx = i + 25;
          const rightNumCell = row.getCell(4);
          rightNumCell.value = i + 26;
          rightNumCell.alignment = { horizontal: "center", vertical: "middle" };
          rightNumCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
          const rightNameCell = row.getCell(5);
          rightNameCell.alignment = { horizontal: "center", vertical: "middle" };
          rightNameCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
          const rightSigCell = row.getCell(6);
          rightSigCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };

          if (signatures[rightIdx]) {
            rightNameCell.value = signatures[rightIdx].signerName;
            try {
              const sigData = signatures[rightIdx].signatureData;
              if (sigData && sigData.startsWith("data:image/")) {
                const base64Part = sigData.split(",")[1];
                const ext = sigData.includes("image/png") ? "png" : "jpeg";
                const imageId = workbook.addImage({ base64: base64Part, extension: ext as "png" | "jpeg" });
                (sigSheet as any).addImage(imageId, { tl: { col: 5, row: 4 + i }, br: { col: 6, row: 5 + i }, editAs: "oneCell" });
              }
            } catch (e) { /* skip */ }
          }
        }

      }

      // === Single photo sheet with all departments stacked vertically ===
      const photoSheet = workbook.addWorksheet("교육 진행 사진");
      photoSheet.properties.defaultColWidth = 12;
      for (let c = 1; c <= 8; c++) { photoSheet.getColumn(c).width = 12; }

      // Row 1: Title
      photoSheet.mergeCells("A1:H1");
      const photoTitleCell = photoSheet.getCell("A1");
      photoTitleCell.value = `"${title}" 교육 시행 사진`;
      photoTitleCell.font = { bold: true, size: 16 };
      photoTitleCell.alignment = { horizontal: "center", vertical: "middle" };
      photoTitleCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      photoSheet.getRow(1).height = 36;

      let currentRow = 2;

      for (const session of groupSessions) {
        const dept = session.department;

        // Department label row
        const deptRowNum = currentRow;
        photoSheet.mergeCells(`A${deptRowNum}:D${deptRowNum}`);
        const photoDeptCell = photoSheet.getCell(`A${deptRowNum}`);
        photoDeptCell.value = `■ ${dept}`;
        photoDeptCell.font = { bold: true, size: 12 };
        photoDeptCell.alignment = { vertical: "middle" };
        photoDeptCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
        photoSheet.getRow(deptRowNum).height = 28;
        currentRow++;

        // Photo area: 11 rows (currentRow to currentRow+10)
        const photoStartRow = currentRow;
        const photoEndRow = currentRow + 10;
        photoSheet.mergeCells(`A${photoStartRow}:D${photoEndRow}`);
        photoSheet.mergeCells(`E${photoStartRow}:H${photoEndRow}`);
        for (let r = photoStartRow; r <= photoEndRow; r++) {
          photoSheet.getRow(r).height = 30;
          for (let c = 1; c <= 8; c++) {
            photoSheet.getRow(r).getCell(c).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
          }
        }

        // Embed photos
        const images = session.images || [];
        for (let pi = 0; pi < Math.min(images.length, 2); pi++) {
          try {
            const objectFile = await objService.getObjectEntityFile(images[pi]);
            const [imgBuffer] = await objectFile.download();
            const base64 = imgBuffer.toString("base64");
            const contentType = images[pi].toLowerCase().endsWith(".png") ? "png" : "jpeg";
            const imageId = workbook.addImage({ base64, extension: contentType as "png" | "jpeg" });
            if (pi === 0) {
              (photoSheet as any).addImage(imageId, { tl: { col: 0, row: photoStartRow - 1 }, br: { col: 4, row: photoEndRow }, editAs: "oneCell" });
            } else {
              (photoSheet as any).addImage(imageId, { tl: { col: 4, row: photoStartRow - 1 }, br: { col: 8, row: photoEndRow }, editAs: "oneCell" });
            }
          } catch (e) {
            console.error(`Failed to embed photo ${pi} for ${dept}:`, e);
          }
        }

        currentRow = photoEndRow + 1;

        // Labels row
        const labelRowNum = currentRow;
        photoSheet.mergeCells(`A${labelRowNum}:D${labelRowNum}`);
        photoSheet.mergeCells(`E${labelRowNum}:H${labelRowNum}`);
        const labelLeft = photoSheet.getCell(`A${labelRowNum}`);
        labelLeft.value = "교육사진";
        labelLeft.font = { bold: true, size: 10 };
        labelLeft.alignment = { horizontal: "center", vertical: "middle" };
        labelLeft.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
        const labelRight = photoSheet.getCell(`E${labelRowNum}`);
        labelRight.value = "교육사진";
        labelRight.font = { bold: true, size: 10 };
        labelRight.alignment = { horizontal: "center", vertical: "middle" };
        labelRight.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
        photoSheet.getRow(labelRowNum).height = 24;
        currentRow++;

        // Spacing row between departments
        photoSheet.getRow(currentRow).height = 10;
        currentRow++;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const fileName = encodeURIComponent(`${title}_안전보건교육_참석자_서명_${date}.xlsx`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${fileName}`);
      res.send(buffer);
    } catch (error) {
      console.error("Error generating group Excel:", error);
      res.status(500).json({ message: "엑셀 파일 생성에 실패했습니다" });
    }
  });

  app.get("/api/education-sessions/:id", isAuthenticated, async (req: any, res) => {
    const session = await storage.getEducationSession(Number(req.params.id));
    if (!session) return res.status(404).json({ message: "교육일지를 찾을 수 없습니다" });
    res.json(session);
  });

  app.post("/api/education-sessions", requirePermission("registerEducation"), async (req: any, res) => {
    try {
      const bodySchema = z.object({
        title: z.string().min(1),
        educationDate: z.string().min(1),
        department: z.string().min(1),
        educationType: z.string().optional(),
        instructor: z.string().optional(),
        totalParticipants: z.number().int().min(1),
        description: z.string().optional(),
        materialAttachments: z.array(z.object({ url: z.string(), name: z.string(), type: z.string() })).optional(),
      });
      const parsed = bodySchema.parse(req.body);
      const createdBy = req.user?.username || req.user?.name || "unknown";
      const session = await storage.createEducationSession({
        ...parsed,
        createdBy,
      });
      if (parsed.materialAttachments && parsed.materialAttachments.length > 0) {
        const contentParts = [];
        if (parsed.educationDate) contentParts.push(`교육일: ${parsed.educationDate}`);
        if (parsed.department) contentParts.push(`부서: ${parsed.department}`);
        if (parsed.instructor) contentParts.push(`강사: ${parsed.instructor}`);
        if (parsed.description) contentParts.push(parsed.description);
        await storage.createNotice({
          category: "edu",
          title: parsed.title,
          content: contentParts.join(" | "),
          attachments: parsed.materialAttachments,
          createdBy,
        });
      }
      res.status(201).json(session);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "입력값이 올바르지 않습니다" });
      console.error("Error creating education session:", error);
      res.status(500).json({ message: "교육일지 생성에 실패했습니다" });
    }
  });

  app.post("/api/education-sessions/batch", requirePermission("registerEducation"), async (req: any, res) => {
    try {
      const batchSchema = z.object({
        title: z.string().min(1),
        educationDate: z.string().min(1),
        departments: z.array(z.object({
          name: z.string().min(1),
          participants: z.number().int().min(1),
        })).min(1),
        educationType: z.string().optional(),
        instructor: z.string().optional(),
        description: z.string().optional(),
        materialAttachments: z.array(z.object({ url: z.string(), name: z.string(), type: z.string() })).optional(),
      });
      const parsed = batchSchema.parse(req.body);
      const createdBy = req.user?.username || req.user?.name || "unknown";
      const results = [];
      for (const dept of parsed.departments) {
        const session = await storage.createEducationSession({
          title: parsed.title,
          educationDate: parsed.educationDate,
          department: dept.name,
          educationType: parsed.educationType,
          instructor: parsed.instructor,
          totalParticipants: dept.participants,
          description: parsed.description,
          materialAttachments: parsed.materialAttachments,
          createdBy,
        });
        results.push(session);
      }
      if (parsed.materialAttachments && parsed.materialAttachments.length > 0) {
        const contentParts = [];
        if (parsed.educationDate) contentParts.push(`교육일: ${parsed.educationDate}`);
        if (parsed.instructor) contentParts.push(`강사: ${parsed.instructor}`);
        if (parsed.description) contentParts.push(parsed.description);
        await storage.createNotice({
          category: "edu",
          title: parsed.title,
          content: contentParts.join(" | "),
          attachments: parsed.materialAttachments,
          createdBy,
        });
      }
      res.status(201).json(results);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "입력값이 올바르지 않습니다" });
      console.error("Error batch creating education sessions:", error);
      res.status(500).json({ message: "일괄 교육일지 생성에 실패했습니다" });
    }
  });

  const requireAnyPermission = (...permKeys: (keyof UserPermissions)[]): any => {
    return async (req: any, res: any, next: any) => {
      try {
        const session = req.session as any;
        if (!session.userId) return res.status(401).json({ message: "로그인이 필요합니다" });
        const user = await authStorage.getUser(session.userId);
        if (!user) return res.status(403).json({ message: "편집 권한이 필요합니다" });
        if (user.role === "admin") { req.user = user; return next(); }
        const perms = user.permissions || {};
        const hasAny = permKeys.some(k => (perms as any)[k]);
        if (!hasAny) return res.status(403).json({ message: "해당 기능에 대한 권한이 없습니다" });
        req.user = user;
        next();
      } catch (error) {
        res.status(500).json({ message: "권한 확인에 실패했습니다" });
      }
    };
  };

  app.patch("/api/education-sessions/:id", requireAnyPermission("registerEducation", "editEducationLogs"), async (req: any, res) => {
    try {
      const session = await storage.updateEducationSession(Number(req.params.id), req.body);
      res.json(session);
    } catch (error) {
      console.error("Error updating education session:", error);
      res.status(500).json({ message: "교육일지 수정에 실패했습니다" });
    }
  });

  app.delete("/api/education-sessions/:id", requirePermission("registerEducation"), async (req: any, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getEducationSession(id);
    if (!existing) return res.status(404).json({ message: "Not found" });
    if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 작성한 교육일지만 삭제할 수 있습니다" });
    await storage.deleteEducationSession(id);
    res.status(204).send();
  });

  // === EDUCATION SIGNATURES ===
  app.get("/api/education-sessions/:id/signatures", isAuthenticated, async (req: any, res) => {
    const signatures = await storage.getSignaturesBySession(Number(req.params.id));
    res.json(signatures);
  });

  app.post("/api/education-sessions/:id/signatures", isAuthenticated, async (req: any, res) => {
    try {
      const sigSchema = z.object({
        signatureData: z.string().min(1),
      });
      const parsed = sigSchema.parse(req.body);
      const sessionId = Number(req.params.id);
      const signerName = req.user?.name || req.user?.username || "";
      const signerDepartment = req.user?.department || "";
      if (!signerName) {
        return res.status(400).json({ message: "사용자 정보를 확인할 수 없습니다." });
      }
      const existingSignatures = await storage.getSignaturesBySession(sessionId);
      const alreadySigned = existingSignatures.some(
        (s) => s.signerName === signerName && s.signerDepartment === signerDepartment
      );
      if (alreadySigned) {
        return res.status(400).json({ message: "이미 서명을 등록하셨습니다. 한 사람당 한 번만 서명할 수 있습니다." });
      }
      const signature = await storage.createSignature({
        signerName,
        signerDepartment,
        signatureData: parsed.signatureData,
        sessionId,
      });
      res.status(201).json(signature);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "입력값이 올바르지 않습니다" });
      console.error("Error creating signature:", error);
      res.status(500).json({ message: "서명 등록에 실패했습니다" });
    }
  });

  app.delete("/api/education-signatures/:id", requirePermission("registerEducation"), async (req: any, res) => {
    await storage.deleteSignature(Number(req.params.id));
    res.status(204).send();
  });

  // === EDUCATION PROGRESS (교육별 진행율) ===
  app.get("/api/education-progress", isAuthenticated, async (req: any, res) => {
    try {
      const sessions = await storage.getEducationSessions();
      const educationGroups = new Map<string, typeof sessions>();
      for (const s of sessions) {
        const key = `${s.title}||${s.educationDate}`;
        if (!educationGroups.has(key)) educationGroups.set(key, []);
        educationGroups.get(key)!.push(s);
      }

      const progress = await Promise.all(
        Array.from(educationGroups.entries()).map(async ([key, groupSessions]) => {
          const [title, educationDate] = key.split("||");
          let totalParticipants = 0;
          let totalSigned = 0;
          let completedSessions = 0;

          const departments = await Promise.all(
            groupSessions.map(async (session) => {
              const signatures = await storage.getSignaturesBySession(session.id);
              totalParticipants += session.totalParticipants;
              totalSigned += signatures.length;
              if (session.status === "완료") completedSessions++;
              const rate = session.totalParticipants > 0
                ? Math.round((signatures.length / session.totalParticipants) * 100) : 0;
              return {
                department: session.department,
                sessionId: session.id,
                status: session.status,
                totalParticipants: session.totalParticipants,
                signed: signatures.length,
                progressRate: rate,
                educationType: session.educationType,
              };
            })
          );

          return {
            title,
            educationDate,
            educationType: groupSessions[0].educationType,
            totalDepartments: groupSessions.length,
            completedSessions,
            totalParticipants,
            totalSigned,
            progressRate: totalParticipants > 0 ? Math.round((totalSigned / totalParticipants) * 100) : 0,
            departments,
          };
        })
      );

      progress.sort((a, b) => b.educationDate.localeCompare(a.educationDate));
      res.json(progress);
    } catch (error) {
      console.error("Error fetching education progress:", error);
      res.status(500).json({ message: "진행율 조회에 실패했습니다" });
    }
  });

  // === CHEMICALS (MSDS) ===
  app.get('/api/chemicals', isAuthenticated, async (req: any, res) => {
    try {
      const search = req.query.search as string;
      if (search) {
        const results = await storage.searchChemicals(search);
        return res.json(results);
      }
      const all = await storage.getChemicals();
      res.json(all);
    } catch (error) {
      res.status(500).json({ message: "화학물질 목록 조회에 실패했습니다" });
    }
  });

  app.get('/api/chemicals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const chemical = await storage.getChemical(Number(req.params.id));
      if (!chemical) return res.status(404).json({ message: "화학물질을 찾을 수 없습니다" });
      res.json(chemical);
    } catch (error) {
      res.status(500).json({ message: "화학물질 조회에 실패했습니다" });
    }
  });

  app.post('/api/chemicals', requireEditor, async (req: any, res) => {
    try {
      const chemical = await storage.createChemical({ ...req.body, createdBy: req.user?.username || null });
      res.status(201).json(chemical);
    } catch (error) {
      res.status(500).json({ message: "화학물질 등록에 실패했습니다" });
    }
  });

  app.put('/api/chemicals/:id', requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getChemical(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 등록한 화학물질만 수정할 수 있습니다" });
      const chemical = await storage.updateChemical(id, req.body);
      res.json(chemical);
    } catch (error) {
      res.status(500).json({ message: "화학물질 수정에 실패했습니다" });
    }
  });

  app.delete('/api/chemicals/:id', requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getChemical(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 등록한 화학물질만 삭제할 수 있습니다" });
      await storage.deleteChemical(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "화학물질 삭제에 실패했습니다" });
    }
  });

  // === MUSCULOSKELETAL ASSESSMENTS ===
  app.get('/api/musculoskeletal-assessments', isAuthenticated, async (req: any, res) => {
    try {
      const results = await storage.getMusculoskeletalAssessments();
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "근골격계 유해요인조사 목록 조회에 실패했습니다" });
    }
  });

  app.post('/api/musculoskeletal-assessments', requireEditor, async (req: any, res) => {
    try {
      const created = await storage.createMusculoskeletalAssessment({ ...req.body, createdBy: req.user?.username || null });
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "근골격계 유해요인조사 등록에 실패했습니다" });
    }
  });

  app.put('/api/musculoskeletal-assessments/:id', requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getMusculoskeletalAssessment(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 등록한 항목만 수정할 수 있습니다" });
      const updated = await storage.updateMusculoskeletalAssessment(id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "근골격계 유해요인조사 수정에 실패했습니다" });
    }
  });

  app.delete('/api/musculoskeletal-assessments/:id', requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getMusculoskeletalAssessment(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 등록한 항목만 삭제할 수 있습니다" });
      await storage.deleteMusculoskeletalAssessment(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "근골격계 유해요인조사 삭제에 실패했습니다" });
    }
  });

  // === RISK ASSESSMENTS ===

  // 위험성평가 엑셀 다운로드 (사진 포함)
  app.get('/api/risk-assessments/excel', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const isAdmin = user?.role === 'admin';
      const perms = user?.permissions || {};
      if (!isAdmin && !perms.downloadRiskAssessmentExcel) {
        return res.status(403).json({ message: "엑셀 다운로드 권한이 없습니다" });
      }

      const department = (req.query.department as string) || '전체';
      const assessmentType = req.query.type as string | undefined;

      let assessments = await storage.getRiskAssessments(assessmentType || undefined);
      if (department && department !== '전체') {
        assessments = assessments.filter((a: any) => a.department === department);
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'SafeBoard';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('위험성평가');

      // 등급 계산 헬퍼
      const getGrade = (score: number) => {
        if (score >= 8) return { label: 'A등급', category: '중점관리' };
        if (score >= 3) return { label: 'B등급', category: '일상관리' };
        return { label: 'C등급', category: '허용가능' };
      };

      const PHOTO_COL_WIDTH = 20;
      const PHOTO_ROW_HEIGHT = 100;

      // 열 정의
      sheet.columns = [
        { header: 'No', key: 'no', width: 6 },
        { header: '부서', key: 'department', width: 14 },
        { header: '담당업무', key: 'responsibleTask', width: 14 },
        { header: '부서장', key: 'departmentHead', width: 12 },
        { header: '평가유형', key: 'assessmentType', width: 10 },
        { header: '공정명', key: 'process', width: 16 },
        { header: '유해위험요인', key: 'hazard', width: 25 },
        { header: '위험유형', key: 'hazardType', width: 12 },
        { header: '현재 안전보건조치', key: 'currentControls', width: 22 },
        { header: '가능성(1-5)', key: 'frequency', width: 11 },
        { header: '중대성(1-4)', key: 'severity', width: 11 },
        { header: '위험점수', key: 'riskScore', width: 10 },
        { header: '등급', key: 'grade', width: 10 },
        { header: '분류', key: 'gradeCategory', width: 10 },
        { header: '평가자', key: 'assessor', width: 10 },
        { header: '평가일', key: 'assessmentDate', width: 12 },
        { header: '개선전 사진', key: 'beforePhoto', width: PHOTO_COL_WIDTH },
        { header: '개선대책', key: 'improvementMeasures', width: 24 },
        { header: '개선 계획일', key: 'plannedDate', width: 13 },
        { header: '완료일', key: 'completionDate', width: 12 },
        { header: '개선후 가능성', key: 'afterFrequency', width: 13 },
        { header: '개선후 중대성', key: 'afterSeverity', width: 13 },
        { header: '개선후 점수', key: 'afterRiskScore', width: 12 },
        { header: '개선후 등급', key: 'afterGrade', width: 11 },
        { header: '개선현황', key: 'improvementStatus', width: 11 },
        { header: '개선후 사진', key: 'afterPhoto', width: PHOTO_COL_WIDTH },
        { header: '승인상태', key: 'approvalStatus', width: 11 },
        { header: '승인자', key: 'approvedBy', width: 12 },
        { header: '승인일', key: 'approvedAt', width: 12 },
      ];

      // 헤더 스타일
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, size: 10 };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D5090' } };
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      headerRow.height = 28;

      // 사진 열 번호 (1-indexed)
      const BEFORE_PHOTO_COL = 15; // O열
      const AFTER_PHOTO_COL = 24;  // X열

      // 사진 이미지 추가 헬퍼
      const addPhotoToCell = async (photoUrl: string, rowNum: number, colNum: number) => {
        try {
          if (!photoUrl) return;
          const filename = photoUrl.replace(/^\/uploads\//, '');
          const filePath = path.join(process.cwd(), 'uploads', filename);
          if (!fs.existsSync(filePath)) return;
          const ext = path.extname(filename).toLowerCase().replace('.', '');
          const validExts = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
          if (!validExts.includes(ext)) return;
          const imgData = fs.readFileSync(filePath);
          const imageId = workbook.addImage({
            buffer: imgData,
            extension: (ext === 'jpg' ? 'jpeg' : ext) as any,
          });
          sheet.addImage(imageId, {
            tl: { col: colNum - 1, row: rowNum - 1 },
            br: { col: colNum, row: rowNum },
            editAs: 'oneCell',
          });
        } catch (_) { /* 사진 오류 무시 */ }
      };

      // 데이터 행 추가
      for (let i = 0; i < assessments.length; i++) {
        const a = assessments[i] as any;
        const grade = getGrade(a.riskScore);
        const afterGrade = a.afterRiskScore ? getGrade(a.afterRiskScore) : null;
        const rowNum = i + 2;

        const row = sheet.addRow({
          no: i + 1,
          department: a.department,
          responsibleTask: a.responsibleTask || '',
          departmentHead: (a as any).departmentHead || '',
          assessmentType: a.assessmentType,
          process: a.process || '',
          hazard: a.hazard,
          hazardType: a.hazardType || '',
          currentControls: a.currentControls || '',
          frequency: a.frequency,
          severity: a.severity,
          riskScore: a.riskScore,
          grade: grade.label,
          gradeCategory: grade.category,
          assessor: a.assessor || '',
          assessmentDate: a.assessmentDate,
          beforePhoto: a.beforePhotoUrl ? '(사진)' : '',
          improvementMeasures: a.improvementMeasures || '',
          plannedDate: a.plannedDate || '',
          completionDate: a.completionDate || '',
          afterFrequency: a.afterFrequency || '',
          afterSeverity: a.afterSeverity || '',
          afterRiskScore: a.afterRiskScore || '',
          afterGrade: afterGrade ? afterGrade.label : '',
          improvementStatus: a.improvementStatus || '',
          afterPhoto: a.afterPhotoUrl ? '(사진)' : '',
          approvalStatus: a.approvalStatus || '',
          approvedBy: a.approvedBy || '',
          approvedAt: a.approvedAt || '',
        });

        row.height = a.beforePhotoUrl || a.afterPhotoUrl ? PHOTO_ROW_HEIGHT : 18;
        row.alignment = { vertical: 'middle', wrapText: true };
        row.font = { size: 9 };

        // 등급 셀 색상
        const gradeCell = row.getCell('grade');
        if (grade.label === 'A등급') {
          gradeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD7CC' } };
          gradeCell.font = { bold: true, color: { argb: 'FFD95030' }, size: 9 };
        } else if (grade.label === 'B등급') {
          gradeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } };
          gradeCell.font = { bold: true, color: { argb: 'FF8B7000' }, size: 9 };
        } else {
          gradeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
          gradeCell.font = { bold: true, color: { argb: 'FF1A6B2E' }, size: 9 };
        }
        gradeCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // 점수 셀 스타일
        const scoreCell = row.getCell('riskScore');
        scoreCell.alignment = { horizontal: 'center', vertical: 'middle' };
        scoreCell.font = { bold: true, size: 9 };

        // 사진 셀 텍스트 비우기 (이미지로 채움)
        row.getCell('beforePhoto').value = '';
        row.getCell('afterPhoto').value = '';

        // 사진 삽입
        if (a.beforePhotoUrl) await addPhotoToCell(a.beforePhotoUrl, rowNum, BEFORE_PHOTO_COL);
        if (a.afterPhotoUrl) await addPhotoToCell(a.afterPhotoUrl, rowNum, AFTER_PHOTO_COL);
      }

      // 테두리 전체 적용
      for (let r = 1; r <= assessments.length + 1; r++) {
        const row = sheet.getRow(r);
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          };
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const deptLabel = department === '전체' ? '전체부서' : department;
      const filename = encodeURIComponent(`위험성평가_${deptLabel}_${today}.xlsx`);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      res.send(buffer);
    } catch (error) {
      console.error('위험성평가 엑셀 다운로드 오류:', error);
      res.status(500).json({ message: "엑셀 다운로드에 실패했습니다" });
    }
  });

  app.get('/api/risk-assessments', isAuthenticated, async (req: any, res) => {
    try {
      const type = req.query.type as string;
      const results = await storage.getRiskAssessments(type || undefined);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "위험성평가 목록 조회에 실패했습니다" });
    }
  });

  app.get('/api/risk-assessments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const assessment = await storage.getRiskAssessment(Number(req.params.id));
      if (!assessment) return res.status(404).json({ message: "위험성평가를 찾을 수 없습니다" });
      res.json(assessment);
    } catch (error) {
      res.status(500).json({ message: "위험성평가 조회에 실패했습니다" });
    }
  });

  app.post('/api/risk-assessments', requireEditor, async (req: any, res) => {
    try {
      const score = (req.body.frequency || 1) * (req.body.severity || 1);
      let riskLevel = "C등급";
      if (score >= 8) riskLevel = "A등급";
      else if (score >= 3) riskLevel = "B등급";
      const approvalStatus = score >= 8 ? "승인대기" : "자동종결";
      const assessment = await storage.createRiskAssessment({
        ...req.body,
        riskScore: score,
        riskLevel,
        approvalStatus,
        createdBy: req.user?.username || null,
      });
      res.status(201).json(assessment);
    } catch (error) {
      res.status(500).json({ message: "위험성평가 등록에 실패했습니다" });
    }
  });

  app.put('/api/risk-assessments/:id', requireEditor, async (req: any, res) => {
    try {
      const score = (req.body.frequency || 1) * (req.body.severity || 1);
      let riskLevel = "C등급";
      if (score >= 8) riskLevel = "A등급";
      else if (score >= 3) riskLevel = "B등급";
      // 이미 승인완료된 경우 승인상태 유지
      const existing = await storage.getRiskAssessment(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 등록한 항목만 수정할 수 있습니다" });
      const approvalStatus = existing?.approvalStatus === "승인완료"
        ? "승인완료"
        : (score >= 8 ? "승인대기" : "자동종결");
      const assessment = await storage.updateRiskAssessment(Number(req.params.id), {
        ...req.body,
        riskScore: score,
        riskLevel,
        approvalStatus,
      });
      res.json(assessment);
    } catch (error) {
      res.status(500).json({ message: "위험성평가 수정에 실패했습니다" });
    }
  });

  // 부서장 승인
  app.put('/api/risk-assessments/:id/approve', requireEditor, async (req: any, res) => {
    try {
      const { approvedBy } = req.body;
      const today = new Date().toISOString().slice(0, 10);
      const assessment = await storage.updateRiskAssessment(Number(req.params.id), {
        approvalStatus: "승인완료",
        approvedBy: approvedBy || req.user?.name || req.user?.username || "부서장",
        approvedAt: today,
      } as any);
      res.json(assessment);
    } catch (error) {
      res.status(500).json({ message: "승인에 실패했습니다" });
    }
  });

  app.put('/api/risk-assessments/:id/improvement', requireEditor, async (req: any, res) => {
    try {
      const { afterFrequency, afterSeverity, improvementMeasures, plannedDate, completionDate, afterPhotoUrl } = req.body;
      const afterScore = (afterFrequency || 1) * (afterSeverity || 1);
      let afterRiskLevel = "C등급";
      if (afterScore >= 8) afterRiskLevel = "A등급";
      else if (afterScore >= 3) afterRiskLevel = "B등급";
      const improvementStatus = completionDate ? "완료" : (plannedDate ? "진행중" : "미완료");
      const assessment = await storage.updateRiskAssessment(Number(req.params.id), {
        improvementMeasures,
        plannedDate,
        completionDate,
        afterFrequency,
        afterSeverity,
        afterRiskScore: afterScore,
        afterRiskLevel,
        afterPhotoUrl,
        improvementStatus,
      } as any);
      res.json(assessment);
    } catch (error) {
      res.status(500).json({ message: "개선 등록에 실패했습니다" });
    }
  });

  app.delete('/api/risk-assessments/:id', requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getRiskAssessment(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 등록한 항목만 삭제할 수 있습니다" });
      await storage.deleteRiskAssessment(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "위험성평가 삭제에 실패했습니다" });
    }
  });

  app.post('/api/risk-assessments/batch', requireEditor, async (req: any, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items 배열이 필요합니다" });
      }
      const results = [];
      for (const item of items) {
        const score = (item.frequency || 1) * (item.severity || 1);
        let riskLevel = "C등급";
        if (score >= 8) riskLevel = "A등급";
        else if (score >= 3) riskLevel = "B등급";
        const approvalStatus = item.approvalStatus === "임시저장" ? "임시저장" : (score >= 8 ? "승인대기" : "자동종결");
        const assessment = await storage.createRiskAssessment({ ...item, riskScore: score, riskLevel, approvalStatus, createdBy: req.user?.username || null });
        results.push(assessment);
      }
      res.status(201).json(results);
    } catch (error) {
      res.status(500).json({ message: "위험성평가 일괄 등록에 실패했습니다" });
    }
  });

  app.post('/api/risk-assessments/upload-photo', requireEditor, upload.single('photo'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = safeExt(req.file.originalname, ALLOWED_IMG_EXTS);
      const filename = uniqueSuffix + ext;
      const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
      if (objUrl) return res.json({ photoUrl: objUrl });
      fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      res.json({ photoUrl: `/uploads/${filename}` });
    } catch (error) {
      res.status(500).json({ message: "사진 업로드에 실패했습니다" });
    }
  });

  // === ACCIDENT REPORTS ===
  app.get('/api/accidents', isAuthenticated, async (req: any, res) => {
    try {
      const reports = await storage.getAccidentReports();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ message: "사고보고 목록 조회에 실패했습니다" });
    }
  });

  app.get('/api/accidents/stats', isAuthenticated, async (req: any, res) => {
    try {
      const reports = await storage.getAccidentReports();
      const byType: Record<string, number> = {};
      const byCause: Record<string, number> = {};
      const byDepartment: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      const byMonth: Record<string, number> = {};
      const byYear: Record<string, number> = {};
      const byYearMonth: Record<string, Record<string, number>> = {};
      const bySeverityByYear: Record<string, Record<string, number>> = {};

      for (const r of reports) {
        byType[r.accidentType] = (byType[r.accidentType] || 0) + 1;
        byCause[r.cause] = (byCause[r.cause] || 0) + 1;
        byDepartment[r.department] = (byDepartment[r.department] || 0) + 1;
        bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
        const yearMonth = r.occurredAt?.substring(0, 7) || "unknown";
        byMonth[yearMonth] = (byMonth[yearMonth] || 0) + 1;
        const year = r.occurredAt?.substring(0, 4) || "unknown";
        byYear[year] = (byYear[year] || 0) + 1;
        const mon = r.occurredAt?.substring(5, 7) || "00";
        if (!byYearMonth[mon]) byYearMonth[mon] = {};
        byYearMonth[mon][year] = (byYearMonth[mon][year] || 0) + 1;
        if (!bySeverityByYear[year]) bySeverityByYear[year] = {};
        bySeverityByYear[year][r.severity] = (bySeverityByYear[year][r.severity] || 0) + 1;
      }

      res.json({ total: reports.length, byType, byCause, byDepartment, bySeverity, byMonth, byYear, byYearMonth, bySeverityByYear });
    } catch (error) {
      res.status(500).json({ message: "사고 통계 조회에 실패했습니다" });
    }
  });

  app.get('/api/accidents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const report = await storage.getAccidentReport(Number(req.params.id));
      if (!report) return res.status(404).json({ message: "사고보고를 찾을 수 없습니다" });
      res.json(report);
    } catch (error) {
      res.status(500).json({ message: "사고보고 조회에 실패했습니다" });
    }
  });

  app.post('/api/accidents', requireEditor, async (req: any, res) => {
    try {
      const perms = req.user?.permissions || {};
      if (req.user?.role !== 'admin' && !perms.editAccidents) {
        return res.status(403).json({ message: "사고보고 등록 권한이 없습니다" });
      }
      const body = { ...req.body };
      if (!body.description) body.description = body.accidentOverview || "";
      const report = await storage.createAccidentReport({ ...body, createdBy: req.user?.username || null });
      if (report.accidentType === "교통사고") {
        await syncAccidentToTeamScore(report.department, report.occurredAt);
      } else {
        await syncWorkAccidentToTeamScore(report.department, report.occurredAt);
      }
      res.status(201).json(report);
    } catch (error: any) {
      console.error("[사고보고 등록 오류]", error);
      const msg = process.env.NODE_ENV !== 'production' && error?.message ? error.message : "사고보고 등록에 실패했습니다";
      res.status(500).json({ message: msg });
    }
  });

  app.put('/api/accidents/:id', requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getAccidentReport(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 작성한 사고보고만 수정할 수 있습니다" });
      const body = { ...req.body };
      if (!body.description) body.description = body.accidentOverview || existing.description || "";
      const report = await storage.updateAccidentReport(id, body);
      const newDept = report?.department || existing.department;
      const newDate = report?.occurredAt || existing.occurredAt;
      const newType = report?.accidentType || existing.accidentType;
      // sync vehicleAccidents for 교통사고
      if (existing.accidentType === "교통사고" || newType === "교통사고") {
        await syncAccidentToTeamScore(newDept, newDate);
        if (existing.department !== newDept) {
          await syncAccidentToTeamScore(existing.department, existing.occurredAt);
        }
      }
      // sync workAccident for non-교통사고
      if (existing.accidentType !== "교통사고" || newType !== "교통사고") {
        await syncWorkAccidentToTeamScore(newDept, newDate);
        if (existing.department !== newDept) {
          await syncWorkAccidentToTeamScore(existing.department, existing.occurredAt);
        }
      }
      res.json(report);
    } catch (error: any) {
      console.error("[사고보고 수정 오류]", error);
      res.status(500).json({ message: "사고보고 수정에 실패했습니다" });
    }
  });

  app.delete('/api/accidents/:id', requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getAccidentReport(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 작성한 사고보고만 삭제할 수 있습니다" });
      const { department: delDept, occurredAt: delDate, accidentType: delType } = existing;
      await storage.deleteAccidentReport(id);
      if (delType === "교통사고") {
        await syncAccidentToTeamScore(delDept, delDate);
      } else {
        await syncWorkAccidentToTeamScore(delDept, delDate);
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "사고보고 삭제에 실패했습니다" });
    }
  });

  app.post('/api/accidents/upload-photos', requireEditor, upload.array('photos', 10), async (req: any, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }
    const urls: string[] = [];
    for (const f of req.files as Express.Multer.File[]) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = safeExt(f.originalname, ALLOWED_IMG_EXTS);
      const filename = uniqueSuffix + ext;
      const objUrl = await uploadToObjectStorage(f.buffer, filename, f.mimetype);
      if (objUrl) {
        urls.push(objUrl);
      } else {
        fs.writeFileSync(path.join(uploadDir, filename), f.buffer);
        urls.push(`/uploads/${filename}`);
      }
    }
    res.json({ imageUrls: urls });
  });

  app.get('/api/accidents/:id/download-docx', requireEditor, async (req: any, res) => {
    try {
      const report = await storage.getAccidentReport(Number(req.params.id));
      if (!report) return res.status(404).json({ message: "사고보고를 찾을 수 없습니다" });

      const { generateAccidentDocx } = await import('./accidentDocx');
      const buffer = await generateAccidentDocx(report);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="accident_report_${report.id}.docx"`);
      res.send(buffer);
    } catch (error) {
      console.error("DOCX generation error:", error);
      res.status(500).json({ message: "사고경위서 생성에 실패했습니다" });
    }
  });

  // === NEW EQUIPMENT REQUESTS ===
  app.get('/api/new-equipment-requests', isAuthenticated, async (req: any, res) => {
    try {
      const requests = await storage.getNewEquipmentRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "신규 상품요청 목록 조회에 실패했습니다" });
    }
  });

  app.post('/api/new-equipment-requests', isAuthenticated, async (req: any, res) => {
    try {
      const request = await storage.createNewEquipmentRequest({ ...req.body, requestedBy: req.user?.username || req.body.requestedBy || null });
      res.status(201).json(request);
    } catch (error) {
      res.status(500).json({ message: "신규 상품요청 등록에 실패했습니다" });
    }
  });

  app.put('/api/new-equipment-requests/:id', requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getNewEquipmentRequest(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!isOwnerOrAdmin(req, existing.requestedBy)) return res.status(403).json({ message: "본인이 요청한 항목만 수정할 수 있습니다" });
      const request = await storage.updateNewEquipmentRequest(id, req.body);
      res.json(request);
    } catch (error) {
      res.status(500).json({ message: "신규 상품요청 수정에 실패했습니다" });
    }
  });

  app.delete('/api/new-equipment-requests/:id', requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getNewEquipmentRequest(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!isOwnerOrAdmin(req, existing.requestedBy)) return res.status(403).json({ message: "본인이 요청한 항목만 삭제할 수 있습니다" });
      await storage.deleteNewEquipmentRequest(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "신규 상품요청 삭제에 실패했습니다" });
    }
  });

  // ── WEATHER SAFETY MESSAGE ──
  app.get("/api/weather/current", isAuthenticated, async (req: any, res) => {
    try {
      const city = String(req.query.city || "대구");
      const weather = await fetchWeather(city);
      res.json(weather);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "날씨 조회에 실패했습니다" });
    }
  });

  app.post("/api/weather/generate-message", isAuthenticated, async (req: any, res) => {
    try {
      const city = String(req.body.city || "대구");
      const weather = await fetchWeather(city);
      const message = await generateSafetyMessage(weather);
      res.json({ weather, message });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "안전메시지 생성에 실패했습니다" });
    }
  });

  app.post("/api/weather/post-notice", isAuthenticated, async (req: any, res) => {
    try {
      const { city, title, content, imageUrl } = req.body;
      if (!title || !content) {
        return res.status(400).json({ message: "제목과 내용을 입력해주세요" });
      }
      const notice = await storage.createNotice({
        category: "notice",
        title: title.trim(),
        content: content.trim(),
        imageUrl: imageUrl && typeof imageUrl === "string" ? imageUrl : undefined,
        fileName: undefined,
        fileType: undefined,
        attachments: undefined,
        createdBy: req.user?.username ?? null,
      });
      res.json(notice);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "공지 게시에 실패했습니다" });
    }
  });

  app.post("/api/weather/clear-cache", isAuthenticated, async (req: any, res) => {
    const city = req.body.city ? String(req.body.city) : undefined;
    clearWeatherCache(city);
    res.json({ ok: true });
  });

  app.get("/api/kosha/major-accidents", isAuthenticated, async (req, res) => {
    try {
      const result = await getKoshaMajorAccidents();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "KOSHA API 조회에 실패했습니다" });
    }
  });

  app.post("/api/kosha/refresh", isAuthenticated, async (req, res) => {
    try {
      clearKoshaCache();
      const result = await getKoshaMajorAccidents();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "KOSHA API 새로고침에 실패했습니다" });
    }
  });

  // === TRAFFIC FINES (과태료 현황) ===

  const pdfUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const ext = safeExt(file.originalname, ["pdf"]);
        cb(null, `fine_${Date.now()}${ext || ".pdf"}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("PDF 파일만 업로드 가능합니다"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  // PDF 업로드 + AI 파싱 (pdf-parse 텍스트 추출 + GPT-4o 직접 분석)
  app.post('/api/traffic-fines/parse-pdf', isAuthenticated, pdfUpload.single('pdf'), async (req: any, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: "관리자만 사용할 수 있습니다" });
    if (!req.file) return res.status(400).json({ message: "PDF 파일이 필요합니다" });

    const pdfPath = req.file.path;
    const pdfBuffer = fs.readFileSync(pdfPath);

    try {
      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const INSTRUCTION = `당신은 한국 교통 과태료·범칙금 고지서(납부통보서, 범칙금통고서, 과태료부과통보서, 통행료납부통보서) 전문 파싱 AI입니다.
문서에서 정보를 정확히 추출해 JSON 객체 **하나만** 응답하세요.
- 없는 정보는 null로 반환. 절대 추측 금지.
- 마크다운·코드블록 없이 JSON만.
- 차량번호는 차량 사진의 번호판 또는 문서의 차량번호 항목에서 읽되, 두 곳에 있으면 문서 기재 값 우선.`;

      const USER_MSG = `아래 교통 과태료 고지서에서 정보를 추출해 JSON으로 반환하세요.

반환 형식 (필드명 변경 금지):
{
  "violationDate": "위반일시. YYYY-MM-DD HH:MM 형식 필수. 시간 없으면 00:00 사용",
  "licensePlate": "차량번호. 숫자+한글 조합. 공백·특수문자 모두 제거. 예) 177허8226",
  "driver": "운전자 또는 소유자 실명(한글). 법인명이면 null",
  "violationType": "다음 6개 중 정확히 하나만: 속도위반 / 신호위반 / 법규위반 / 주정차위반 / 통행료미납 / 기타",
  "violationLocation": "위반 장소(도로명·지점명). 없으면 null",
  "amount": 실제납부금액_정수 (원 단위 숫자만. 예: 70000),
  "paymentDestination": "부과기관명. 예) 달서구청장 / 한국도로공사 / 대구경찰청장"
}

[위반 유형 판단]
- 속도위반: 과속, 제한속도 초과
- 신호위반: 신호 무시·위반
- 주정차위반: 불법주정차·주차금지
- 통행료미납: 하이패스·고속도로통행료 미납, 한국도로공사 관련
- 법규위반: 차로위반·안전거리·끼어들기 등 기타 도로교통법 위반
- 기타: 위에 해당 없음

[날짜 변환 예시]
"2026년 02월 13일 11시 14분" → "2026-02-13 11:14"
"26.02.13 11:14" → "2026-02-13 11:14"
"2026.02.20 14:33" → "2026-02-20 14:33"
"2026-01-20" → "2026-01-20 00:00"

[금액 변환 예시]
"70,000원" → 70000 / "32,000" → 32000 / "3만원" → 30000
여러 금액이 있으면 "납부할 금액" 또는 "과태료액"으로 표시된 값 사용

[차량번호 변환 예시]
"177허 8226" → "177허8226" / "231 허 3946" → "231허3946"`;

      // PDF를 base64로 인코딩
      const pdfBase64 = pdfBuffer.toString("base64");
      const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;

      let raw = "{}";

      // ── 방법 1: OpenAI Responses API (PDF 네이티브 지원, 스캔 이미지 포함) ──
      try {
        const response = await (aiClient as any).responses.create({
          model: "gpt-4o",
          instructions: INSTRUCTION,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: USER_MSG },
                {
                  type: "input_file",
                  filename: req.file.originalname || "fine.pdf",
                  file_data: pdfDataUrl,
                },
              ],
            },
          ],
        });
        raw = response.output_text?.trim() || "{}";
      } catch (_responsesErr: any) {
        console.warn("Responses API 실패, pdftoppm Vision fallback 시도:", _responsesErr?.message);

        // ── 방법 2: pdftoppm으로 이미지 변환 후 GPT-4o Vision ──
        try {
          const os = await import("os");
          const { spawn } = await import("child_process");
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfparse-"));
          const tmpPrefix = path.join(tmpDir, "page");

          try {
            await new Promise<void>((resolve, reject) => {
              const proc = spawn("pdftoppm", ["-r", "200", "-png", pdfPath, tmpPrefix]);
              let errOut = "";
              proc.stderr.on("data", (d: Buffer) => { errOut += d.toString(); });
              proc.on("close", (code: number) => {
                if (code === 0) resolve();
                else reject(new Error(`pdftoppm 오류 (code ${code}): ${errOut}`));
              });
              proc.on("error", reject);
            });

            const pngFiles = fs.readdirSync(tmpDir)
              .filter((f: string) => f.endsWith(".png"))
              .sort()
              .map((f: string) => path.join(tmpDir, f));

            if (pngFiles.length === 0) throw new Error("PDF 페이지 변환 결과 없음");

            const pageImgs = pngFiles.slice(0, 2).map((pngPath: string) => ({
              type: "image_url" as const,
              image_url: {
                url: `data:image/png;base64,${fs.readFileSync(pngPath).toString("base64")}`,
                detail: "high" as const,
              },
            }));

            const chatRes2 = await aiClient.chat.completions.create({
              model: "gpt-4o",
              max_completion_tokens: 1200,
              messages: [
                { role: "system", content: INSTRUCTION },
                { role: "user", content: [{ type: "text", text: USER_MSG }, ...pageImgs] },
              ],
            });
            raw = chatRes2.choices[0]?.message?.content?.trim() || "{}";
          } finally {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
          }
        } catch (_pdfErr: any) {
          console.warn("pdftoppm fallback 실패, 텍스트 추출 시도:", _pdfErr?.message);

          // ── 방법 3: 텍스트 추출만으로 분석 (최후 수단) ──
          let pdfText = "";
          try {
            const pdfParse = (await import("pdf-parse")).default;
            const pdResult = await pdfParse(pdfBuffer);
            pdfText = (pdResult.text || "").trim();
          } catch (_) {}

          if (!pdfText || pdfText.length < 10) {
            throw new Error("PDF 분석에 실패했습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.");
          }

          const textContent = `${USER_MSG}\n\n[추출된 PDF 텍스트]\n${pdfText.substring(0, 4000)}`;
          const chatRes3 = await aiClient.chat.completions.create({
            model: "gpt-4o",
            max_completion_tokens: 1200,
            messages: [
              { role: "system", content: INSTRUCTION },
              { role: "user", content: textContent },
            ],
          });
          raw = chatRes3.choices[0]?.message?.content?.trim() || "{}";
        }
      }

      let parsed: any = {};
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch (_) {}

      // ── 5. 후처리: 날짜·금액·번호판·위반유형 정규화 ────────────────
      if (parsed.violationDate && typeof parsed.violationDate === "string") {
        let d = parsed.violationDate.trim();
        d = d.replace(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2})시\s*(\d{1,2})분/, (_: string, y: string, mo: string, day: string, h: string, mi: string) =>
          `${y}-${mo.padStart(2,"0")}-${day.padStart(2,"0")} ${h.padStart(2,"0")}:${mi.padStart(2,"0")}`);
        d = d.replace(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/, (_: string, y: string, mo: string, day: string) =>
          `${y}-${mo.padStart(2,"0")}-${day.padStart(2,"0")}`);
        d = d.replace(/^(\d{2,4})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}:\d{2})$/, (_: string, y: string, mo: string, day: string, t: string) =>
          `${y.length === 2 ? "20" + y : y}-${mo.padStart(2,"0")}-${day.padStart(2,"0")} ${t}`);
        d = d.replace(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/, (_: string, y: string, mo: string, day: string) =>
          `${y}-${mo.padStart(2,"0")}-${day.padStart(2,"0")}`);
        d = d.replace(/^(\d{2,4})\/(\d{1,2})\/(\d{1,2})$/, (_: string, y: string, mo: string, day: string) =>
          `${y.length === 2 ? "20" + y : y}-${mo.padStart(2,"0")}-${day.padStart(2,"0")}`);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) d += " 00:00";
        parsed.violationDate = d;
      }
      if (parsed.amount !== null && parsed.amount !== undefined) {
        const amtStr = String(parsed.amount).replace(/[,원\s]/g, "");
        const amtNum = parseInt(amtStr, 10);
        parsed.amount = isNaN(amtNum) ? null : amtNum;
      }
      if (parsed.licensePlate && typeof parsed.licensePlate === "string") {
        parsed.licensePlate = parsed.licensePlate.replace(/\s/g, "");
      }
      if (parsed.violationType && typeof parsed.violationType === "string") {
        const rawType = parsed.violationType.replace(/\s/g, "").toLowerCase();
        const typeMap: Record<string, string> = {
          "속도위반": "속도위반", "과속": "속도위반",
          "신호위반": "신호위반", "신호무시": "신호위반",
          "주정차위반": "주정차위반", "불법주정차": "주정차위반", "주차위반": "주정차위반",
          "통행료미납": "통행료미납", "통행료": "통행료미납", "하이패스미납": "통행료미납",
          "법규위반": "법규위반", "기타": "기타",
        };
        const mt = Object.entries(typeMap).find(([k]) => rawType.includes(k.toLowerCase()));
        parsed.violationType = mt ? mt[1] : "기타";
      }

      // ── 6. 차량 DB 자동 매칭 ─────────────────────────────────────
      let vehicleType: string | null = null;
      let department: string | null = null;
      if (parsed.licensePlate) {
        const normalizedPlate = parsed.licensePlate.replace(/\s/g, "");
        const vehicles = await storage.getVehicles();
        const mv = vehicles.find((v: any) => v.plateNumber.replace(/\s/g, "") === normalizedPlate);
        if (mv) { vehicleType = mv.vehicleType; department = mv.team; }
      }

      // ── 7. PDF 저장 ────────────────────────────────────────────────
      let pdfUrl = `/uploads/${req.file.filename}`;
      try {
        const objPdfUrl = await uploadToObjectStorage(pdfBuffer, req.file.filename, "application/pdf");
        if (objPdfUrl) pdfUrl = objPdfUrl;
      } catch (_) {}

      // ── 8. 썸네일 생성 (pdftoppm 첫 페이지 → PNG) ─────────────────
      let thumbnailUrl: string | null = null;
      try {
        const os = await import("os");
        const { spawn } = await import("child_process");
        const thumbTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfthumb-"));
        const thumbPrefix = path.join(thumbTmpDir, "thumb");
        try {
          await new Promise<void>((resolve, reject) => {
            const proc = spawn("pdftoppm", ["-r", "150", "-png", "-l", "1", pdfPath, thumbPrefix]);
            proc.on("close", (code: number) => code === 0 ? resolve() : reject(new Error(`code ${code}`)));
            proc.on("error", reject);
          });
          const thumbFiles = fs.readdirSync(thumbTmpDir)
            .filter((f: string) => f.endsWith(".png"))
            .sort();
          if (thumbFiles.length > 0) {
            const thumbBuffer = fs.readFileSync(path.join(thumbTmpDir, thumbFiles[0]));
            const thumbFilename = `thumb_${path.basename(req.file.filename, ".pdf")}.png`;
            const objThumbUrl = await uploadToObjectStorage(thumbBuffer, thumbFilename, "image/png");
            if (objThumbUrl) {
              thumbnailUrl = objThumbUrl;
            } else {
              const thumbPath = path.join(uploadDir, thumbFilename);
              fs.writeFileSync(thumbPath, thumbBuffer);
              thumbnailUrl = `/uploads/${thumbFilename}`;
            }
          }
        } finally {
          try { fs.rmSync(thumbTmpDir, { recursive: true, force: true }); } catch (_) {}
        }
      } catch (_thumbErr: any) {
        console.warn("썸네일 생성 실패 (무시):", _thumbErr?.message);
      }

      res.json({ ...parsed, vehicleType, department, pdfUrl, thumbnailUrl });
    } catch (error: any) {
      console.error("과태료 PDF 파싱 오류:", error?.message || error);
      res.status(500).json({ message: `PDF 파싱에 실패했습니다: ${error?.message || "알 수 없는 오류"}` });
    }
  });

  // === VEHICLES API ===
  app.get('/api/vehicles', isAuthenticated, async (req: any, res) => {
    try {
      const list = await storage.getVehicles();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "차량 목록 조회에 실패했습니다" });
    }
  });

  app.post('/api/vehicles', requireEditor, async (req: any, res) => {
    try {
      const input = api.vehicles.create.input.parse(req.body);
      const [created] = await (await import('./db')).db.insert((await import('@shared/schema')).vehicles).values({ ...input, createdBy: req.user?.username }).returning();
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "차량 등록에 실패했습니다" });
    }
  });

  app.put('/api/vehicles/:id', requireEditor, async (req: any, res) => {
    try {
      const { db } = await import('./db');
      const { vehicles, eq } = await import('@shared/schema').then(async m => ({ vehicles: m.vehicles, eq: (await import('drizzle-orm')).eq }));
      const [updated] = await db.update(vehicles).set(req.body).where(eq(vehicles.id, Number(req.params.id))).returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "차량 수정에 실패했습니다" });
    }
  });

  app.delete('/api/vehicles/:id', requireEditor, async (req: any, res) => {
    try {
      const { db } = await import('./db');
      const { vehicles, eq } = await import('@shared/schema').then(async m => ({ vehicles: m.vehicles, eq: (await import('drizzle-orm')).eq }));
      await db.delete(vehicles).where(eq(vehicles.id, Number(req.params.id)));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "차량 삭제에 실패했습니다" });
    }
  });

  // 과태료 엑셀 다운로드
  app.get('/api/traffic-fines/excel', isAuthenticated, async (req: any, res) => {
    try {
      const fines = await storage.getTrafficFines();
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('교통 과태료 현황');

      ws.columns = [
        { header: 'No', key: 'no', width: 5 },
        { header: '납부요청일', key: 'requestDate', width: 13 },
        { header: '위반일시', key: 'violationDate', width: 18 },
        { header: '차량번호', key: 'licensePlate', width: 13 },
        { header: '차종', key: 'vehicleType', width: 10 },
        { header: '소속', key: 'department', width: 14 },
        { header: '운전자', key: 'driver', width: 10 },
        { header: '위반내역', key: 'violationType', width: 16 },
        { header: '적발장소', key: 'violationLocation', width: 30 },
        { header: '과태료금액(원)', key: 'amount', width: 14 },
        { header: '수납처', key: 'paymentDestination', width: 14 },
        { header: '납부상태', key: 'paymentStatus', width: 10 },
        { header: '납부일자', key: 'paidAt', width: 13 },
      ];

      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      fines.forEach((f, i) => {
        ws.addRow({
          no: i + 1,
          requestDate: f.requestDate || '',
          violationDate: f.violationDate || '',
          licensePlate: f.licensePlate || '',
          vehicleType: f.vehicleType || '',
          department: f.department || '',
          driver: f.driver || '',
          violationType: f.violationType || '',
          violationLocation: f.violationLocation || '',
          amount: f.amount || 0,
          paymentDestination: f.paymentDestination || '',
          paymentStatus: f.paymentStatus || '미납',
          paidAt: f.paidAt || '',
        });
      });

      ws.eachRow((row, rowNum) => {
        if (rowNum > 1) row.alignment = { vertical: 'middle' };
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' }
          };
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('교통과태료현황')}_${new Date().toISOString().slice(0,10)}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("과태료 엑셀 오류:", error);
      res.status(500).json({ message: "엑셀 다운로드에 실패했습니다" });
    }
  });

  // 납부상태 전용 PATCH (관리자만)
  app.patch('/api/traffic-fines/:id/payment-status', isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: "관리자만 사용할 수 있습니다" });
    try {
      const id = Number(req.params.id);
      const { paymentStatus, paidAt } = req.body;
      const existing = await storage.getTrafficFine(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const updated = await storage.updateTrafficFine(id, { paymentStatus, paidAt: paidAt || null });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "납부상태 변경에 실패했습니다" });
    }
  });

  app.get('/api/traffic-fines', isAuthenticated, async (req: any, res) => {
    try {
      const fines = await storage.getTrafficFines();
      res.json(fines);
    } catch (error) {
      res.status(500).json({ message: "과태료 목록 조회에 실패했습니다" });
    }
  });

  app.post('/api/traffic-fines', isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: "관리자만 사용할 수 있습니다" });
    try {
      const { id: _id, createdAt: _ca, createdBy: _cb, ...rest } = req.body;
      const sanitize = (v: any) => (v === "" || v === undefined) ? null : v;
      const data = {
        violationDate: sanitize(rest.violationDate),
        licensePlate: sanitize(rest.licensePlate),
        vehicleType: sanitize(rest.vehicleType),
        department: sanitize(rest.department),
        driver: sanitize(rest.driver),
        violationType: sanitize(rest.violationType),
        violationLocation: sanitize(rest.violationLocation),
        amount: rest.amount !== undefined && rest.amount !== "" && rest.amount !== null ? Number(rest.amount) : null,
        paymentDestination: sanitize(rest.paymentDestination),
        note: sanitize(rest.note),
        requestDate: sanitize(rest.requestDate),
        paymentStatus: rest.paymentStatus || "미납",
        paidAt: sanitize(rest.paidAt),
        pdfUrl: sanitize(rest.pdfUrl),
        thumbnailUrl: sanitize(rest.thumbnailUrl),
        createdBy: req.user?.username || null,
      };
      const created = await storage.createTrafficFine(data);
      await syncTrafficFineToTeamScore(created.department, created.violationDate);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('[TrafficFine POST error]', error?.message || error);
      res.status(500).json({ message: error?.message || "과태료 등록에 실패했습니다" });
    }
  });

  app.put('/api/traffic-fines/:id', isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: "관리자만 사용할 수 있습니다" });
    try {
      const id = Number(req.params.id);
      const existing = await storage.getTrafficFine(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const { id: _id, createdAt: _ca, createdBy: _cb, ...rest } = req.body;
      const sanitize = (v: any) => (v === "" || v === undefined) ? null : v;
      const data = {
        violationDate: sanitize(rest.violationDate),
        licensePlate: sanitize(rest.licensePlate),
        vehicleType: sanitize(rest.vehicleType),
        department: sanitize(rest.department),
        driver: sanitize(rest.driver),
        violationType: sanitize(rest.violationType),
        violationLocation: sanitize(rest.violationLocation),
        amount: rest.amount !== undefined && rest.amount !== "" && rest.amount !== null ? Number(rest.amount) : null,
        paymentDestination: sanitize(rest.paymentDestination),
        note: sanitize(rest.note),
        requestDate: sanitize(rest.requestDate),
        paymentStatus: rest.paymentStatus || "미납",
        paidAt: sanitize(rest.paidAt),
        pdfUrl: sanitize(rest.pdfUrl),
        thumbnailUrl: sanitize(rest.thumbnailUrl),
      };
      const updated = await storage.updateTrafficFine(id, data);
      await syncTrafficFineToTeamScore(existing.department, existing.violationDate);
      if (data.department !== existing.department || data.violationDate !== existing.violationDate) {
        await syncTrafficFineToTeamScore(updated.department, updated.violationDate);
      }
      res.json(updated);
    } catch (error: any) {
      console.error('[TrafficFine PUT error]', error?.message || error);
      res.status(500).json({ message: error?.message || "과태료 수정에 실패했습니다" });
    }
  });

  app.delete('/api/traffic-fines/:id', isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: "관리자만 사용할 수 있습니다" });
    try {
      const id = Number(req.params.id);
      const existing = await storage.getTrafficFine(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const { department: delDept, violationDate: delDate } = existing;
      await storage.deleteTrafficFine(id);
      await syncTrafficFineToTeamScore(delDept, delDate);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "과태료 삭제에 실패했습니다" });
    }
  });

  // 과태료 통계
  app.get('/api/traffic-fines/stats', isAuthenticated, async (req: any, res) => {
    try {
      const fines = await storage.getTrafficFines();
      const totalAmount = fines.reduce((s, f) => s + (f.amount || 0), 0);
      const unpaidAmount = fines.filter(f => f.paymentStatus === "미납").reduce((s, f) => s + (f.amount || 0), 0);
      const paidAmount = fines.filter(f => f.paymentStatus === "납부완료").reduce((s, f) => s + (f.amount || 0), 0);
      const byViolationType = fines.reduce((acc: Record<string, number>, f) => {
        const t = f.violationType || "기타";
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});
      res.json({ total: fines.length, totalAmount, unpaidAmount, paidAmount, unpaidCount: fines.filter(f => f.paymentStatus === "미납").length, paidCount: fines.filter(f => f.paymentStatus === "납부완료").length, byViolationType });
    } catch (error) {
      res.status(500).json({ message: "통계 조회에 실패했습니다" });
    }
  });

  // ===== 하도급관리 - 작업계획 =====
  const workPlanUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, path.join(process.cwd(), "uploads")),
      filename: (req, file, cb) => {
        const ext = safeExt(file.originalname, ALLOWED_EXCEL_EXTS);
        cb(null, `workplan_${Date.now()}${ext || ".xlsx"}`);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (
        file.mimetype.includes("spreadsheet") ||
        file.mimetype.includes("csv") ||
        file.mimetype === "text/csv" ||
        file.mimetype === "text/plain" ||
        file.originalname.match(/\.(xlsx|xls|csv)$/i)
      ) cb(null, true);
      else cb(new Error("엑셀(.xlsx/.xls) 또는 CSV 파일만 업로드 가능합니다") as any, false);
    },
  });

  app.get('/api/work-plans', isAuthenticated, async (req: any, res) => {
    try {
      const plans = await storage.getWorkPlans();
      res.json(plans);
    } catch (error) {
      res.status(500).json({ message: "조회에 실패했습니다" });
    }
  });

  app.post('/api/work-plans/upload', isAuthenticated, workPlanUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });

      const originalUrl = `/uploads/${req.file.filename}`;
      const processedFilename = `workplan_processed_${Date.now()}.xlsx`;
      const processedPath = path.join(process.cwd(), "uploads", processedFilename);
      const isCsv = req.file.originalname.toLowerCase().endsWith(".csv");

      // ===== 데이터 파싱 =====
      let tableRows: string[][] = [];

      if (isCsv) {
        // CSV 파싱
        const rawText = fs.readFileSync(req.file.path, "utf-8");
        const lines = rawText.split(/\r?\n/).filter(l => l.trim());
        tableRows = lines.map(line => {
          // CSV 셀 파싱 (따옴표 처리)
          const cells: string[] = [];
          let cur = "", inQ = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ""; continue; }
            cur += ch;
          }
          cells.push(cur.trim());
          return cells;
        });
      } else {
        // Excel 파싱
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        const sheet = workbook.worksheets[0];
        if (!sheet) return res.status(400).json({ message: "시트를 찾을 수 없습니다" });
        sheet.eachRow((row) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            cells.push(cell.value != null ? String(cell.value) : "");
          });
          tableRows.push(cells);
        });
      }

      const headerRow = tableRows[0] || [];
      const dataRows = tableRows.slice(1).filter(r => r.some(c => c.trim()));

      // ===== 포맷된 Excel 생성 =====
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("작업계획");

      const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      const evenFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FB" } };
      const oddFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      const thinBorder: ExcelJS.Border = { style: "thin", color: { argb: "FFB0BEC5" } };
      const borderAll = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

      // 헤더 행
      const headerExcelRow = ws.addRow(headerRow);
      headerExcelRow.height = 22;
      headerExcelRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = headerFill;
        (cell as any).border = borderAll;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "맑은 고딕" };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });

      // 데이터 행
      dataRows.forEach((row, idx) => {
        const excelRow = ws.addRow(row);
        excelRow.height = 18;
        excelRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = idx % 2 === 0 ? evenFill : oddFill;
          (cell as any).border = borderAll;
          cell.font = { size: 10, name: "맑은 고딕" };
          cell.alignment = { vertical: "middle", wrapText: true };
        });
      });

      // 열 너비 자동 조정
      headerRow.forEach((_, ci) => {
        const col = ws.getColumn(ci + 1);
        let maxLen = Math.max(10, (headerRow[ci] || "").length);
        dataRows.forEach(row => {
          const len = (row[ci] || "").length;
          if (len > maxLen) maxLen = Math.min(len, 40);
        });
        col.width = maxLen + 2;
      });

      await wb.xlsx.writeFile(processedPath);

      // ===== 이메일 초안 생성 (입회작업 요청 포맷) =====
      // 다음 영업일 날짜 사용 (금요일이면 다음주 월요일)
      const now = new Date();
      const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
      const nextBizDay = new Date(now);
      const todayDay = now.getDay();
      const daysToAdd = todayDay === 5 ? 3 : todayDay === 6 ? 2 : 1;
      nextBizDay.setDate(nextBizDay.getDate() + daysToAdd);
      const dateStr = `${String(nextBizDay.getFullYear()).slice(2)}.${String(nextBizDay.getMonth() + 1).padStart(2, "0")}.${String(nextBizDay.getDate()).padStart(2, "0")}(${DAYS[nextBizDay.getDay()]})`;
      const title = req.body.title || `작업계획_${nextBizDay.toISOString().slice(0, 10)}`;
      const totalRows = dataRows.length;

      // 탭 구분 텍스트 표 (선 없음, 붙여넣기 친화적)
      const tableText = [
        headerRow.join("\t"),
        ...dataRows.map(row => row.join("\t")),
      ].join("\n");

      const emailDraft = [
        `안녕하십니까 현장경영팀입니다.`,
        ``,
        `${dateStr} 입회 작업에 대한 MOSS 내 순회점검 등록 요청드립니다.`,
        ``,
        `순회점검 등록방법 확인 필요 시 첨부파일 참조 부탁드리며, TBM 및 순회점검 등록사진 예시 참조하시어 등록 부탁드립니다.`,
        ``,
        `★입회자 변경, 작업 취소 등 변경사항 있으시면 연락 부탁드립니다.★`,
        ``,
        `문의사항 있으시면 연락 부탁드립니다.`,
        ``,
        `감사합니다`,
        ``,
        ``,
        `※ ${dateStr} 작업 계획`,
        tableText,
      ].join("\n");

      const sheetSummary = `총 ${totalRows}건 | 항목: ${headerRow.slice(0, 5).join(", ")}${headerRow.length > 5 ? " 외" : ""}`;

      // 오브젝트 스토리지 업로드 (production) 또는 로컬 디스크 유지 (dev)
      let finalOriginalUrl = originalUrl;
      let finalProcessedUrl = `/uploads/${processedFilename}`;
      try {
        const origBuffer = fs.readFileSync(req.file.path);
        const objOrig = await uploadToObjectStorage(origBuffer, req.file.filename, req.file.mimetype || "application/octet-stream");
        if (objOrig) finalOriginalUrl = objOrig;
        const procBuffer = fs.readFileSync(processedPath);
        const objProc = await uploadToObjectStorage(procBuffer, processedFilename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        if (objProc) finalProcessedUrl = objProc;
      } catch (_e: any) {
        console.warn("작업계획 오브젝트 스토리지 업로드 실패 (로컬 fallback):", _e?.message);
      }

      const plan = await storage.createWorkPlan({
        title,
        originalFileName: req.file.originalname,
        originalFileUrl: finalOriginalUrl,
        processedFileUrl: finalProcessedUrl,
        emailDraft,
        sheetSummary,
        createdBy: req.user?.username,
      });

      res.json({ plan, emailDraft, processedFileUrl: finalProcessedUrl });
    } catch (error: any) {
      console.error("[WorkPlan upload error]", error);
      res.status(500).json({ message: error?.message || "업로드에 실패했습니다" });
    }
  });

  // 붙여넣기 데이터로 작업계획 저장
  app.post('/api/work-plans/from-paste', isAuthenticated, async (req: any, res) => {
    try {
      const { rows, title, emailDraft } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "작업 데이터가 없습니다" });
      }
      const totalRows = rows.length;
      const firstRow = rows[0] as Record<string, string>;
      const sampleCols = Object.keys(firstRow).slice(0, 5).join(", ");
      const sheetSummary = `총 ${totalRows}건 | 항목: ${sampleCols}`;
      const plan = await storage.createWorkPlan({
        title: title || `작업계획_${new Date().toISOString().slice(0, 10)}`,
        originalFileName: null,
        originalFileUrl: null,
        processedFileUrl: null,
        emailDraft,
        sheetSummary,
        createdBy: req.user?.username,
      });
      res.json({ plan, emailDraft });
    } catch (error: any) {
      console.error("[WorkPlan from-paste error]", error);
      res.status(500).json({ message: error?.message || "저장에 실패했습니다" });
    }
  });

  app.post('/api/work-plans/send-email', isAuthenticated, async (req: any, res) => {
    try {
      const { to, subject, htmlContent, textContent } = req.body;
      if (!to || !subject || !htmlContent) {
        return res.status(400).json({ message: "수신자, 제목, 내용이 필요합니다" });
      }
      const recipients: string[] = Array.isArray(to) ? to : [to];
      if (recipients.length === 0) {
        return res.status(400).json({ message: "수신자 이메일을 입력해주세요" });
      }

      // 가이드 이미지를 공개 URL로 이메일 맨 아래에 추가
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
      const baseUrl = `${proto}://${req.get('host')}`;
      const guideImgHtml = `<div style="margin-top:24px"><img src="${baseUrl}/public-assets/work-plan-guide.png" style="max-width:100%;border:1px solid #ddd;border-radius:4px" alt="안전활동 사진 등록 가이드" /></div>`;
      const finalHtml = htmlContent + guideImgHtml;

      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      const { data, error } = await resend.emails.send({
        from: "SafeBoard <onboarding@resend.dev>",
        to: recipients,
        subject,
        html: finalHtml,
        text: textContent || "",
      });

      if (error) {
        console.error("[SendEmail] Resend error:", error);
        return res.status(500).json({ message: error.message || "이메일 발송에 실패했습니다" });
      }

      console.log("[SendEmail] Sent to", recipients, "id:", data?.id);
      res.json({ message: "이메일이 발송되었습니다", id: data?.id });
    } catch (error: any) {
      console.error("[SendEmail error]", error);
      res.status(500).json({ message: error?.message || "이메일 발송에 실패했습니다" });
    }
  });

  app.delete('/api/work-plans/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteWorkPlan(id);
      res.json({ message: "삭제되었습니다" });
    } catch (error) {
      res.status(500).json({ message: "삭제에 실패했습니다" });
    }
  });

  // 서버 시작 시 PM10 API 연결 테스트 (비동기, 블로킹 없음)
  setTimeout(() => {
    fetchWeather("대구").then(w => {
      console.log(`[Weather/startup] 대구 pm10=${w.pm10} grade=${w.pm10Grade}`);
    }).catch(e => {
      console.warn(`[Weather/startup] 날씨 초기화 실패: ${e}`);
    });
  }, 3000);

  // === MUSIC FILES API ===
  const musicUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (_req: any, file: any, cb: any) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowed = [".mp3", ".mp4", ".wav", ".ogg", ".m4a", ".aac"];
      if (allowed.includes(ext)) cb(null, true);
      else cb(new Error("MP3, MP4, WAV, OGG, M4A, AAC 파일만 업로드 가능합니다"));
    },
  });

  // GET /api/music - 음악 파일 목록
  app.get("/api/music", isAuthenticated, async (_req, res) => {
    try {
      const files = await storage.getMusicFiles();
      res.json(files);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // POST /api/music/upload-url - GCS 직접 업로드용 서명 URL 발급 (관리자만)
  app.post("/api/music/upload-url", requireAdmin, async (req: any, res) => {
    try {
      const { originalName, size } = req.body;
      if (!originalName) return res.status(400).json({ message: "파일명이 없습니다" });

      // Max 5 songs limit
      const existing = await storage.getMusicFiles();
      if (existing.length >= 5) {
        return res.status(400).json({ message: "음악은 최대 5개까지만 등록할 수 있습니다. 기존 파일을 삭제 후 업로드해주세요." });
      }

      const ext = path.extname(originalName).toLowerCase();
      const allowed = [".mp3", ".mp4", ".wav", ".ogg", ".m4a", ".aac"];
      if (!allowed.includes(ext)) {
        return res.status(400).json({ message: "MP3, MP4, WAV, OGG, M4A, AAC 파일만 업로드 가능합니다" });
      }
      if (size && size > 50 * 1024 * 1024) {
        return res.status(400).json({ message: "파일 크기는 50MB 이하여야 합니다" });
      }

      const privateDir = process.env.PRIVATE_OBJECT_DIR;
      if (!privateDir) return res.status(500).json({ message: "스토리지 설정이 없습니다" });

      const filename = `music_${Date.now()}${ext}`;
      const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${filename}`;
      const parts = fullPath.replace(/^\//, "").split("/");
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");

      const sigRes = await fetch("http://127.0.0.1:1106/object-storage/signed-object-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket_name: bucketName,
          object_name: objectName,
          method: "PUT",
          expires_at: new Date(Date.now() + 900_000).toISOString(),
        }),
      });
      if (!sigRes.ok) throw new Error("서명 URL 생성 실패");
      const { signed_url: uploadURL } = await sigRes.json();
      const objectPath = `/objects/uploads/${filename}`;
      res.json({ uploadURL, objectPath });
    } catch (e: any) {
      console.error("[Music upload-url error]", e);
      res.status(500).json({ message: e.message || "업로드 URL 생성 실패" });
    }
  });

  // POST /api/music/register - 업로드 완료 후 DB 등록 (관리자만)
  app.post("/api/music/register", requireAdmin, async (req: any, res) => {
    try {
      const { name, originalName, url, scheduleType, fileSize } = req.body;
      if (!url || !url.startsWith("/objects/")) {
        return res.status(400).json({ message: "잘못된 파일 경로입니다" });
      }
      const musicFile = await storage.createMusicFile({
        name: name?.trim() || originalName || "음악",
        originalName: originalName || "music",
        url,
        scheduleType: scheduleType || "all",
        fileSize: fileSize || 0,
        uploadedBy: req.session?.userId || null,
      });
      res.json(musicFile);
    } catch (e: any) {
      console.error("[Music register error]", e);
      res.status(500).json({ message: e.message });
    }
  });

  // PATCH /api/music/:id - 음악 파일 정보 수정 (이름, 분류)
  app.patch("/api/music/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, scheduleType } = req.body;
      const allowed = ["출근", "퇴근", "all"];
      if (scheduleType && !allowed.includes(scheduleType)) return res.status(400).json({ message: "Invalid scheduleType" });
      const updated = await storage.updateMusicFile(id, { ...(name ? { name } : {}), ...(scheduleType ? { scheduleType } : {}) });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // DELETE /api/music/:id - 음악 파일 삭제 (관리자만)
  app.delete("/api/music/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteMusicFile(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // GET /api/music/schedule - 음악 스케줄 설정 조회 (요일별)
  app.get("/api/music/schedule", isAuthenticated, async (_req, res) => {
    try {
      const weekdayOn  = { checkin: { enabled: true,  start: "08:30", end: "08:50" }, checkout: { enabled: true,  start: "18:00", end: "18:20" } };
      const weekendOff = { checkin: { enabled: false, start: "08:30", end: "08:50" }, checkout: { enabled: false, start: "18:00", end: "18:20" } };
      const defaultWeekly = { mon: weekdayOn, tue: weekdayOn, wed: weekdayOn, thu: weekdayOn, fri: weekdayOn, sat: weekendOff, sun: weekendOff };

      const setting = await storage.getSetting("music_schedule");
      if (!setting) return res.json(defaultWeekly);

      let parsed: any;
      try { parsed = JSON.parse(setting.value); } catch { return res.json(defaultWeekly); }

      // Migrate old format {checkin:{...}, checkout:{...}} → weekly
      if (parsed && parsed.checkin && !parsed.mon) {
        const migrated = { mon: parsed, tue: parsed, wed: parsed, thu: parsed, fri: parsed, sat: weekendOff, sun: weekendOff };
        await storage.setSetting("music_schedule", JSON.stringify(migrated));
        return res.json(migrated);
      }

      res.json(parsed);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // PUT /api/music/schedule - 음악 스케줄 설정 저장 (관리자만)
  app.put("/api/music/schedule", requireAdmin, async (req, res) => {
    try {
      const schedule = req.body;
      await storage.setSetting("music_schedule", JSON.stringify(schedule));
      res.json(schedule);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ===================== 유류비 현황 API =====================

  // GET /api/fuel-records - 유류비 기록 조회 (필터: year, month, team, fuelType)
  app.get("/api/fuel-records", isAuthenticated, async (req, res) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      const team = req.query.team as string | undefined;
      const fuelType = req.query.fuelType as string | undefined;
      const records = await storage.getFuelRecords({ year, month, team, fuelType });
      res.json(records);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // GET /api/fuel-records/summary - 연도별/월별/팀별 집계
  app.get("/api/fuel-records/summary", isAuthenticated, async (req, res) => {
    try {
      const records = await storage.getFuelRecords();
      // 연도-월별 합계
      const byYearMonth: Record<string, { year: number; month: number; totalCost: number; totalDistance: number; fuelCost: number; cardFuelCost: number; cashFuelCost: number; cardOther: number; cashOther: number }> = {};
      // 팀별 (전체)
      const byTeam: Record<string, { team: string; totalCost: number; fuelCost: number; distance: number }> = {};
      // 팀별 연도별
      const byTeamByYear: Record<string, { team: string; year: number; totalCost: number; fuelCost: number; distance: number }> = {};
      // 연료 종류별
      const byFuelType: Record<string, { fuelType: string; totalCost: number; fuelCost: number; count: number }> = {};
      // 연도별 합계 (동적)
      const byYear: Record<number, { year: number; totalCost: number; fuelCost: number; cardFuelCost: number; cashFuelCost: number; cardOther: number; totalDistance: number; vehicleCount: Set<string> }> = {};
      // 구입형태별
      const byAcquisition: Record<string, { type: string; totalCost: number; fuelCost: number; count: number }> = {};
      // 차종별
      const byVehicleType: Record<string, { type: string; fuelCost: number; count: number }> = {};

      for (const r of records) {
        const fuelCost = (r.cardFuelCost ?? 0) + (r.cashFuelCost ?? 0);
        const cardOther = (r.cardHighpass ?? 0) + (r.cardParking ?? 0) + (r.cardToll ?? 0) + (r.cardCarWash ?? 0) + (r.cardFerry ?? 0) + (r.cardRepair ?? 0) + (r.cardMaintenance ?? 0) + (r.cardEmergencyFuel ?? 0) + (r.cardGeneratorFuel ?? 0);
        const cashOther = (r.cashHighpass ?? 0) + (r.cashParking ?? 0) + (r.cashToll ?? 0) + (r.cashCarWash ?? 0) + (r.cashFerry ?? 0) + (r.cashRepair ?? 0) + (r.cashMaintenance ?? 0) + (r.cashEmergencyFuel ?? 0) + (r.cashGeneratorFuel ?? 0);

        // 연도-월별
        const ym = `${r.year}-${String(r.month).padStart(2, "0")}`;
        if (!byYearMonth[ym]) byYearMonth[ym] = { year: r.year, month: r.month, totalCost: 0, totalDistance: 0, fuelCost: 0, cardFuelCost: 0, cashFuelCost: 0, cardOther: 0, cashOther: 0 };
        byYearMonth[ym].totalCost += r.totalCost ?? 0;
        byYearMonth[ym].totalDistance += r.totalDistance ?? 0;
        byYearMonth[ym].fuelCost += fuelCost;
        byYearMonth[ym].cardFuelCost += r.cardFuelCost ?? 0;
        byYearMonth[ym].cashFuelCost += r.cashFuelCost ?? 0;
        byYearMonth[ym].cardOther += cardOther;
        byYearMonth[ym].cashOther += cashOther;

        // 팀별
        const team = r.team ?? "기타";
        if (!byTeam[team]) byTeam[team] = { team, totalCost: 0, fuelCost: 0, distance: 0 };
        byTeam[team].totalCost += r.totalCost ?? 0;
        byTeam[team].fuelCost += fuelCost;
        byTeam[team].distance += r.totalDistance ?? 0;

        // 팀별 연도별
        const tyk = `${team}__${r.year}`;
        if (!byTeamByYear[tyk]) byTeamByYear[tyk] = { team, year: r.year, totalCost: 0, fuelCost: 0, distance: 0 };
        byTeamByYear[tyk].totalCost += r.totalCost ?? 0;
        byTeamByYear[tyk].fuelCost += fuelCost;
        byTeamByYear[tyk].distance += r.totalDistance ?? 0;

        // 연료 종류별
        const ft = r.fuelType ?? "기타";
        if (!byFuelType[ft]) byFuelType[ft] = { fuelType: ft, totalCost: 0, fuelCost: 0, count: 0 };
        byFuelType[ft].totalCost += r.totalCost ?? 0;
        byFuelType[ft].fuelCost += fuelCost;
        byFuelType[ft].count += 1;

        // 연도별
        if (!byYear[r.year]) byYear[r.year] = { year: r.year, totalCost: 0, fuelCost: 0, cardFuelCost: 0, cashFuelCost: 0, cardOther: 0, totalDistance: 0, vehicleCount: new Set() };
        byYear[r.year].totalCost += r.totalCost ?? 0;
        byYear[r.year].fuelCost += fuelCost;
        byYear[r.year].cardFuelCost += r.cardFuelCost ?? 0;
        byYear[r.year].cashFuelCost += r.cashFuelCost ?? 0;
        byYear[r.year].cardOther += cardOther;
        byYear[r.year].totalDistance += r.totalDistance ?? 0;
        if (r.licensePlate) byYear[r.year].vehicleCount.add(r.licensePlate);

        // 구입형태별
        const acq = r.acquisitionType ?? "기타";
        if (!byAcquisition[acq]) byAcquisition[acq] = { type: acq, totalCost: 0, fuelCost: 0, count: 0 };
        byAcquisition[acq].totalCost += r.totalCost ?? 0;
        byAcquisition[acq].fuelCost += fuelCost;
        byAcquisition[acq].count += 1;

        // 차종별
        const vt = r.vehicleType ?? "기타";
        if (!byVehicleType[vt]) byVehicleType[vt] = { type: vt, fuelCost: 0, count: 0 };
        byVehicleType[vt].fuelCost += fuelCost;
        byVehicleType[vt].count += 1;
      }

      const years = Object.values(byYear).map(y => ({
        ...y,
        vehicleCount: y.vehicleCount.size,
        avgFuelPerKm: y.totalDistance > 0 ? Math.round(y.fuelCost / y.totalDistance) : 0,
      })).sort((a, b) => a.year - b.year);

      res.json({
        byYearMonth: Object.values(byYearMonth).sort((a, b) => a.year - b.year || a.month - b.month),
        byTeam: Object.values(byTeam).sort((a, b) => b.totalCost - a.totalCost),
        byTeamByYear: Object.values(byTeamByYear).sort((a, b) => a.year - b.year || b.totalCost - a.totalCost),
        byFuelType: Object.values(byFuelType).sort((a, b) => b.fuelCost - a.fuelCost),
        byAcquisition: Object.values(byAcquisition).sort((a, b) => b.fuelCost - a.fuelCost),
        byVehicleType: Object.values(byVehicleType).sort((a, b) => b.fuelCost - a.fuelCost),
        years,
        totals: { totalRecords: records.length },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // GET /api/fuel-records/batches - 업로드 배치 목록
  app.get("/api/fuel-records/batches", requireAdmin, async (_req, res) => {
    try {
      const batches = await storage.getFuelBatches();
      res.json(batches);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // DELETE /api/fuel-records/batches/:batchId - 배치 삭제
  app.delete("/api/fuel-records/batches/:batchId", requireAdmin, async (req, res) => {
    try {
      const batchId = decodeURIComponent(req.params.batchId);
      await storage.deleteFuelRecordsByBatch(batchId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // POST /api/fuel-records/upload - Excel 파일 업로드 및 파싱
  const fuelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
  app.post("/api/fuel-records/upload", requireAdmin, fuelUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다." });
      const XLSX = await import("xlsx");
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const batchId = `batch_${Date.now()}`;
      const records: any[] = [];
      let skippedSheets: string[] = [];

      // 폼에서 넘어온 연도/월 오버라이드 (단일 시트 파일용)
      const overrideYear = req.body?.year ? parseInt(req.body.year) : null;
      const overrideMonth = req.body?.month ? parseInt(req.body.month) : null;

      // 파일명에서 YYYYMMDD 추출 fallback
      const filenameDate = req.file.originalname.match(/(\d{4})(\d{2})\d{2}/);
      const filenameYear = filenameDate ? parseInt(filenameDate[1]) : null;
      const filenameMonth = filenameDate ? parseInt(filenameDate[2]) : null;

      for (const sheetName of wb.SheetNames) {
        let year: number, month: number;

        // 시트 이름 파싱: "24년 1월", "25년 12월", "26년 3월" 등
        const m = sheetName.match(/^(\d{2})년\s+(\d{1,2})월$/);
        if (m) {
          year = 2000 + parseInt(m[1]);
          month = parseInt(m[2]);
        } else if (overrideYear && overrideMonth) {
          // 사용자가 직접 지정한 연도/월 사용
          year = overrideYear;
          month = overrideMonth;
        } else if (filenameYear && filenameMonth) {
          // 파일명에서 자동 추출
          year = filenameYear;
          month = filenameMonth;
        } else {
          skippedSheets.push(sheetName);
          continue;
        }

        // 같은 연월 기존 데이터 삭제 (재업로드)
        await storage.deleteFuelRecordsByYearMonth(year, month);

        const ws = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 });

        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          // 순번이 양수이고 본부가 '대구본부'인 실제 데이터 행만 처리
          const seq = row[0];
          if (typeof seq !== "number" || seq <= 0) continue;
          if (row[1] !== "대구본부") continue;
          const teamVal = typeof row[2] === "string" ? row[2].trim() : "";
          if (!teamVal || teamVal === "0") continue;

          const num = (v: any) => (typeof v === "number" ? Math.round(v) : 0);
          const strVal = (v: any) => (typeof v === "string" ? v.trim() : "") || null;
          if (num(row[10]) === 0) continue; // 총주행거리 0인 차량 제외
          records.push({
            year, month,
            team: teamVal || null,
            driver: strVal(row[3]),
            acquisitionType: strVal(row[4]),
            vehicleType: strVal(row[5]),
            modelName: strVal(row[6]),
            licensePlate: strVal(row[7]),
            fuelType: strVal(row[8]),
            avgOperatingDays: num(row[9]),
            totalDistance: num(row[10]),
            businessDistance: num(row[11]),
            cardFuelCost: num(row[12]),
            cardHighpass: num(row[13]),
            cardParking: num(row[14]),
            cardToll: num(row[15]),
            cardCarWash: num(row[16]),
            cardFerry: num(row[17]),
            cardRepair: num(row[18]),
            cardMaintenance: num(row[19]),
            cardEmergencyFuel: num(row[20]),
            cardGeneratorFuel: num(row[21]),
            cashFuelCost: num(row[23]),
            cashHighpass: num(row[24]),
            cashParking: num(row[25]),
            cashToll: num(row[26]),
            cashCarWash: num(row[27]),
            cashFerry: num(row[28]),
            cashRepair: num(row[29]),
            cashMaintenance: num(row[30]),
            cashEmergencyFuel: num(row[31]),
            cashGeneratorFuel: num(row[32]),
            totalCost: num(row[34]),
            avgCostPerKm: num(row[35]),
            uploadBatch: batchId,
          });
        }
      }

      const inserted = await storage.insertFuelRecords(records);
      const yearMonths = [...new Set(records.map(r => `${r.year}년 ${r.month}월`))].sort();
      res.json({
        success: true,
        batchId,
        inserted,
        skippedSheets,
        yearMonths,
        message: `${inserted}건 처리 완료 — ${yearMonths.join(", ")} 데이터 반영`,
      });
    } catch (e: any) {
      console.error("유류비 업로드 오류:", e);
      res.status(500).json({ message: e.message });
    }
  });

  return httpServer;
}

async function seedDatabase() {
  const teams = await storage.getTeams(2025);
  if (teams.length === 0) {
    const seedTeams = [
      { name: "동대구운용팀", vehicleCount: 15, suggestion: 2, activity: 1 },
      { name: "서대구운용팀", vehicleCount: 14, suggestion: 5, activity: 5 },
      { name: "남대구운용팀", vehicleCount: 12, workAccident: 1 },
      { name: "포항운용팀", vehicleCount: 18, fineSpeed: 2, suggestion: 3 },
      { name: "안동운용팀", vehicleCount: 10 },
      { name: "구미운용팀", vehicleCount: 13 },
      { name: "문경운용팀", vehicleCount: 9 },
    ];
    
    for (const t of seedTeams) {
      const score = calculateScore(t);
      await storage.createTeam({ 
        ...t, 
        year: 2025, 
        totalScore: score,
        // Fill defaults
        workAccident: t.workAccident || 0,
        fineSpeed: t.fineSpeed || 0,
        fineSignal: 0,
        fineLane: 0,
        inspectionMiss: t.inspectionMiss || 0,
        suggestion: t.suggestion || 0,
        activity: t.activity || 0,
        vehicleAccidents: {}
      });
    }

    // Seed Notices
    await storage.createNotice({ category: "notice", title: "1월 안전점검 계획 안내", content: "1월 25일부터 28일까지 정기 안전점검이 실시됩니다. 각 팀은 차량 정비 상태를 확인해주세요." });
    await storage.createNotice({ category: "rule", title: "작업 전 TBM 실시", content: "작업 전 위험요인 3가지를 확인하고 공유한다." });
    await storage.createNotice({ category: "edu", title: "추락/낙하 예방 교육", content: "고소작업 시 안전대 착용 필수. 안전모 착용 철저." });
  }
}
