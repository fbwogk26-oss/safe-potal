import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { createHash } from "crypto";
import { db } from "./db";
import { teams, trafficFines, accidentReports, educationSignatures, safetyInspections, educationTasks } from "@shared/schema";
import { eq, and, count, sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "./replit_integrations/object_storage/objectAcl";
import { getKoshaMajorAccidents, clearKoshaCache } from "./kosha";
import { fetchWeather, generateSafetyMessage, clearWeatherCache } from "./weather";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";
import { ALL_PERMISSIONS, type UserPermissions } from "@shared/models/auth";

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
    const fileRef = objectStorageClient.bucket(bucketName).file(objectName);
    await fileRef.save(buffer, { contentType, resumable: false });
    // 이미지·문서 파일은 public으로 설정해서 <img> 태그가 인증 없이 접근 가능하게 함
    try {
      await setObjectAclPolicy(fileRef, { owner: "system", visibility: "public" });
    } catch (_) {}
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

const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const cleanName = file.originalname.replace(/\0/g, "");
    const ext = path.extname(cleanName).toLowerCase();
    const allowedExts = ['.pdf', '.doc', '.docx', '.hwp', '.hwpx', '.xlsx', '.xls', '.jpg', '.jpeg', '.png'];
    const allowedMimes = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/haansofthwp', 'application/x-hwp', 'image/jpeg', 'image/png',
      'application/octet-stream'];
    cb(null, allowedExts.includes(ext) || allowedMimes.includes(file.mimetype));
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

const vehicleExcelUpload = multer({
  storage: multer.memoryStorage(),
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

// PDF 바이너리에서 JPEG 이미지 스트림을 추출하는 함수 (라이브러리 없이)
function extractJpegsFromBuffer(buf: Buffer): Buffer[] {
  const results: Buffer[] = [];
  let i = 0;
  while (i < buf.length - 3) {
    // JPEG SOI 마커: FF D8 FF
    if (buf[i] === 0xFF && buf[i + 1] === 0xD8 && buf[i + 2] === 0xFF) {
      const start = i;
      let j = i + 2;
      let found = false;
      // EOI 마커 탐색: FF D9
      while (j < buf.length - 1) {
        if (buf[j] === 0xFF && buf[j + 1] === 0xD9) {
          const end = j + 2;
          const jpeg = buf.slice(start, end);
          // 최소 크기(5KB) 이상인 이미지만 수집 (썸네일/아이콘 제외)
          if (jpeg.length > 5000) {
            results.push(jpeg);
          }
          i = end;
          found = true;
          break;
        }
        j++;
      }
      if (!found) break;
    } else {
      i++;
    }
  }
  return results;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup authentication (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);

  // 소유권 체크: 관리자이거나, createdBy가 없거나, 본인이 작성한 경우
  const isOwnerOrAdmin = (req: any, createdBy: string | null | undefined): boolean => {
    return req.user?.role === "admin" || !createdBy || req.user?.username === createdBy;
  };

  // ─── Server-Sent Events (SSE) — 실시간 공지/알림 브로드캐스트 ────────
  const sseClients = new Set<any>();

  function broadcastSSE(event: string, data: object) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try { res.write(payload); } catch { sseClients.delete(res); }
    }
  }

  app.get('/api/sse', isAuthenticated, (req: any, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('event: connected\ndata: {}\n\n');
    sseClients.add(res);
    // 30초마다 heartbeat (연결 유지)
    const heartbeat = setInterval(() => {
      try { res.write(':heartbeat\n\n'); } catch { clearInterval(heartbeat); sseClients.delete(res); }
    }, 30000);
    req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });
  });

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

  // === PDF INSPECTION PARSE ===
  const inspectionPdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  app.post('/api/parse-inspection-pdf', isAuthenticated, inspectionPdfUpload.single('pdf'), async (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ message: "PDF 파일이 필요합니다" });
    try {
      const pdfBuffer: Buffer = req.file.buffer;

      // ── 1) 텍스트 추출 (pdfjs-dist, 서버 전용) ──
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pathMod = await import('path');
      const workerSrc = 'file://' + pathMod.default.resolve('./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;
      const uint8 = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjsLib.getDocument({ data: uint8 });
      const pdfDoc = await loadingTask.promise;
      let text = '';
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const tc = await page.getTextContent();
        text += tc.items.map((it: any) => it.str).join(' ') + '\n';
      }
      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);

      let inspectionDate = '';
      let team = '';
      let location = '';
      let workContent = '';

      const fullText = lines.join(' ');

      // 점검일자
      const dateMatch = fullText.match(/점검일자\s*[:\uff1a]\s*(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) inspectionDate = dateMatch[1];

      // 팀명: 점검대상 마지막 '>' 이후, 다음 ○ 또는 공백 다수 전까지
      const teamMatch = fullText.match(/점검대상\s*[:\uff1a]\s*(.+?)\s{2,}○/);
      if (teamMatch) {
        const parts = teamMatch[1].split('>');
        team = parts[parts.length - 1].trim();
      }

      // 작업장소: 작업일시/장소 : <비워있거나날짜> / <날짜T시간> <장소>  ○
      const locMatch = fullText.match(/작업일시[\/\/]장소\s*[:\uff1a]\s*[^\/]*\/\s*[^\s]+\s+(.+?)\s{2,}○/);
      if (locMatch) location = locMatch[1].trim();

      // 작업내용: 직영-무선기지국- 형태
      const workMatch = fullText.match(/직영[-–]([가-힣A-Za-z0-9]+)[-–]/);
      if (workMatch) workContent = workMatch[1];

      // ── 2) PDF 바이너리에서 JPEG 이미지 추출 ──
      const imageUrls: string[] = [];
      try {
        const jpegBuffers = extractJpegsFromBuffer(pdfBuffer);
        for (let i = 0; i < Math.min(jpegBuffers.length, 10); i++) {
          const jpegBuf = jpegBuffers[i];
          const filename = `pdf-img-${Date.now()}-${i}.jpg`;
          const objUrl = await uploadToObjectStorage(jpegBuf, filename, 'image/jpeg');
          if (objUrl) {
            imageUrls.push(objUrl);
          } else {
            const localPath = path.join(uploadDir, filename);
            fs.writeFileSync(localPath, jpegBuf);
            imageUrls.push(`/uploads/${filename}`);
          }
        }
      } catch (imgErr) {
        console.warn('PDF 이미지 추출 실패 (텍스트만 반환):', imgErr);
      }

      res.json({ inspectionDate, team, location, workContent, imageUrls });
    } catch (err: any) {
      console.error('PDF 파싱 오류:', err);
      res.status(500).json({ message: 'PDF 파싱에 실패했습니다: ' + (err?.message || '') });
    }
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
    if (input.category === 'notice' || input.category === 'rule') {
      broadcastSSE('notice', { action: 'created', id: notice.id, title: notice.title, category: notice.category });
    }
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

  // 보호구 현황 일괄 등록 (관리자 전용 seed 엔드포인트)
  app.post("/api/admin/seed-equipment-status", requireAdmin, async (req: any, res) => {
    try {
      const records: { title: string; content: string; category: string }[] = req.body.records;
      if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ message: "records 배열이 필요합니다" });
      let inserted = 0, updated = 0;
      for (const rec of records) {
        const existing = await storage.getNotices("equip_status");
        const found = existing.find(n => n.title === rec.title);
        if (found) {
          await storage.updateNotice(found.id, { content: rec.content });
          updated++;
        } else {
          await storage.createNotice({ title: rec.title, content: rec.content, category: "equip_status" });
          inserted++;
        }
      }
      res.json({ ok: true, inserted, updated });
    } catch (err) {
      res.status(500).json({ message: String(err) });
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

  // POST /api/notices/bulk-delete - 일괄 삭제 POST 버전 (프록시 환경에서 DELETE body 유실 방지)
  app.post("/api/notices/bulk-delete", requireEditor, async (req: any, res) => {
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
    broadcastSSE('pinned', { pinnedNoticeId: noticeId });
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
      return res.status(400).json({ message: "일반사용자, 담당자, 부서장만 설정할 수 있습니다" });
    }
    await storage.setSetting(`role_preset_${role}`, JSON.stringify(permissions));
    res.json({ success: true });
  });

  // 역할 프리셋을 해당 역할 전체 사용자에 일괄 적용
  app.post("/api/settings/role-presets/apply-all", requireAdmin, async (req: any, res) => {
    try {
      const { role } = req.body;
      if (!role || !["user", "manager", "deptHead"].includes(role)) {
        return res.status(400).json({ message: "유효한 역할이 필요합니다" });
      }
      const presetSetting = await storage.getSetting(`role_preset_${role}`);
      if (!presetSetting?.value) {
        return res.status(400).json({ message: "저장된 프리셋이 없습니다. 먼저 프리셋을 저장하세요." });
      }
      const permissions = JSON.parse(presetSetting.value);
      const allUsers = await authStorage.getAllUsers();
      const targetUsers = allUsers.filter((u: any) => u.role === role);
      for (const u of targetUsers) {
        await authStorage.updateUser(u.id, { permissions });
      }
      res.json({ success: true, appliedCount: targetUsers.length });
    } catch (error: any) {
      console.error("[apply-all presets error]", error);
      res.status(500).json({ message: error?.message || "일괄 적용에 실패했습니다" });
    }
  });

  // 역할별 사용자 수 조회
  app.get("/api/settings/role-user-counts", requireAdmin, async (req: any, res) => {
    try {
      const allUsers = await authStorage.getAllUsers();
      const counts: Record<string, number> = { user: 0, manager: 0, deptHead: 0, admin: 0 };
      for (const u of allUsers) {
        if (counts[u.role] !== undefined) counts[u.role]++;
        else counts[u.role] = 1;
      }
      res.json(counts);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "조회 실패" });
    }
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

  app.post("/api/safety-equipment/bulk-delete", requireEditor, async (req: any, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
    let deleted = 0;
    for (const id of ids) { try { await storage.deleteSafetyEquipment(Number(id)); deleted++; } catch {} }
    res.json({ deleted });
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

  app.put("/api/safety-inspections/:id", requireEditor, async (req: any, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getSafetyInspection(id);
    if (!existing) return res.status(404).json({ message: "Not found" });
    if (!isOwnerOrAdmin(req, existing.createdBy)) return res.status(403).json({ message: "본인이 작성한 점검만 수정할 수 있습니다" });
    const { inspectionType, title, location, inspector, workerName, inspectionDate, checklist, notes, images } = req.body;
    try {
      const updated = await storage.updateSafetyInspection(id, {
        inspectionType, title, location, inspector, workerName, inspectionDate,
        checklist: checklist || existing.checklist,
        notes, images: images || existing.images,
      });
      res.json(updated);
    } catch (err) {
      console.error("Update inspection error:", err);
      res.status(500).json({ message: "Failed to update inspection" });
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

  app.post("/api/safety-inspections/bulk-delete", requireEditor, async (req: any, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
    let deleted = 0;
    for (const id of ids) { try { await storage.deleteSafetyInspection(Number(id)); deleted++; } catch {} }
    res.json({ deleted });
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
        educationEndDate: z.string().optional(),
        department: z.string().min(1),
        educationType: z.string().optional(),
        instructor: z.string().optional(),
        totalParticipants: z.number().int().min(1),
        description: z.string().optional(),
        materialAttachments: z.array(z.object({ url: z.string(), name: z.string(), type: z.string() })).optional(),
        taskId: z.number().int().optional().nullable(),
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
      // 세션에 taskId가 있으면 업무 완료율 자동 업데이트
      if (session.taskId) {
        syncTaskCompletionFromSessions(session.taskId).catch(console.error);
      }
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
        educationEndDate: z.string().optional(),
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
          educationEndDate: parsed.educationEndDate,
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
      // 세션 상태 변경 시 연결된 업무 완료율 자동 동기화
      if (session.taskId) {
        syncTaskCompletionFromSessions(session.taskId).catch(console.error);
      }
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
    const taskId = existing.taskId;
    await storage.deleteEducationSession(id);
    res.status(204).send();
    // 세션 삭제 후 연결된 업무 완료율 재계산
    if (taskId) {
      syncTaskCompletionFromSessions(taskId).catch(console.error);
    }
  });

  app.post("/api/education-sessions/bulk-delete", requirePermission("registerEducation"), async (req: any, res) => {
    const ids: number[] = req.body.ids || [];
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids 필요" });
    try {
      // 삭제 전 연결된 taskId 수집 (완료율 재계산용)
      const affectedTaskIds = new Set<number>();
      for (const id of ids) {
        try {
          const sess = await storage.getEducationSession(id);
          if (sess?.taskId) affectedTaskIds.add(sess.taskId);
          await storage.deleteEducationSession(id);
        } catch (_) {}
      }
      res.json({ deleted: ids.length });
      // 영향받은 업무 완료율 재계산 (응답 후 비동기)
      for (const taskId of affectedTaskIds) {
        syncTaskCompletionFromSessions(taskId).catch(console.error);
      }
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // === EDUCATION SIGNATURES ===
  app.get("/api/education-sessions/:id/signatures", isAuthenticated, async (req: any, res) => {
    const signatures = await storage.getSignaturesBySession(Number(req.params.id));
    res.json(signatures);
  });

  // 관리자 전용: 모든 서명 기록 (교육 + 보호구 지급, 메타데이터 포함)
  app.get("/api/admin/signatures", isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "관리자만 접근 가능합니다." });
    try {
      // 1) 교육 이수 서명
      const eduSigs = await storage.getAllSignaturesWithSession();
      const eduResult = eduSigs.map(s => ({
        id: `edu_${s.id}`,
        rawId: s.id,
        type: "education" as const,
        sessionTitle: s.sessionTitle,
        sessionDate: s.sessionDate,
        sessionDepartment: s.sessionDepartment,
        signerName: s.signerName,
        signerDepartment: s.signerDepartment ?? "",
        signatureData: s.signatureData,
        signedAt: s.signedAt,
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        consentAgreed: s.consentAgreed ?? null,
        integrityHash: s.integrityHash ?? null,
      }));

      // 2) 보호구 지급 서명 (notices category=equip_request, status=수령완료, signature 존재)
      const allNotices = await storage.getNotices("equip_request");
      const equipResult = allNotices
        .filter(n => {
          try {
            const p = JSON.parse(n.content);
            return p.status === "수령완료" && p.signature;
          } catch { return false; }
        })
        .map(n => {
          const p = JSON.parse(n.content);
          return {
            id: `equip_${n.id}`,
            rawId: n.id,
            type: "equipment" as const,
            sessionTitle: `보호구 지급 — ${n.title}`,
            sessionDate: p.signedAt ? p.signedAt.slice(0, 10) : (n.createdAt ? String(n.createdAt).slice(0, 10) : ""),
            sessionDepartment: p.team ?? "",
            signerName: p.requester ?? "",
            signerDepartment: p.team ?? "",
            signatureData: p.signature,
            signedAt: p.signedAt ?? n.createdAt,
            ipAddress: null,
            userAgent: null,
            consentAgreed: null,
            integrityHash: null,
          };
        });

      // 최신순 정렬
      const combined = [...eduResult, ...equipResult].sort((a, b) => {
        const ta = a.signedAt ? new Date(a.signedAt).getTime() : 0;
        const tb = b.signedAt ? new Date(b.signedAt).getTime() : 0;
        return tb - ta;
      });
      res.json(combined);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "서명 데이터 조회 실패" });
    }
  });

  // 관리자 전용: 서명 삭제 (edu_ID 또는 equip_ID 형식)
  app.delete("/api/admin/signatures/:id", isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "관리자만 접근 가능합니다." });
    try {
      const rawId = req.params.id;
      if (rawId.startsWith("equip_")) {
        const noticeId = Number(rawId.replace("equip_", ""));
        await storage.deleteNotice(noticeId);
      } else {
        const sigId = Number(rawId.replace("edu_", ""));
        await storage.deleteSignature(sigId);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "서명 삭제 실패" });
    }
  });

  // ===== 관리자 데이터 백업 =====
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const BACKUP_ALL_TABLES = [
    "notices","safety_inspections","accident_reports","near_miss_reports",
    "safety_equipment","education_sessions","risk_assessments",
    "health_manager_reports","safety_manager_reports","vehicles",
    "fuel_records","traffic_fines","work_plans","new_equipment_requests",
    "musculoskeletal_assessments","chemicals","conversations","messages",
    "music_files","users","teams",
  ];

  async function getAllDbTextForCleanup(): Promise<string> {
    let combined = "";
    for (const t of BACKUP_ALL_TABLES) {
      try {
        const r = await db.execute(sql.raw(`SELECT string_agg(to_jsonb(${t})::text, ' ') FROM ${t}`));
        combined += (r.rows[0] as any)?.string_agg || "";
      } catch (_) {}
    }
    return combined;
  }

  app.get("/api/admin/backup/info", isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "관리자만 접근 가능합니다." });
    try {
      const sizeResult = await db.execute(sql`
        SELECT pg_database_size(current_database()) / 1024 AS size_kb
      `);
      const dbSizeKb = Number((sizeResult.rows[0] as any)?.size_kb ?? 0);
      const privateDir = process.env.PRIVATE_OBJECT_DIR;
      let fileCount = 0;
      let orphanCount = 0;
      let orphanSizeMb = 0;
      let totalSizeMb = 0;
      if (privateDir) {
        const parts = privateDir.replace(/^\//, "").split("/");
        const bucketName = parts[0];
        const prefix = parts.slice(1).join("/");
        try {
          const [files] = await objectStorageClient.bucket(bucketName).getFiles({ prefix });
          fileCount = files.length;
          totalSizeMb = files.reduce((acc, f) => acc + Number((f.metadata as any).size || 0), 0) / 1024 / 1024;
          const uuidFiles = files.filter(f => UUID_RE.test(f.name.replace(prefix + "/uploads/", "")));
          if (uuidFiles.length > 0) {
            const dbText = await getAllDbTextForCleanup();
            for (const f of uuidFiles) {
              const name = f.name.replace(prefix + "/uploads/", "");
              if (!dbText.includes(name)) {
                orphanCount++;
                orphanSizeMb += Number((f.metadata as any).size || 0) / 1024 / 1024;
              }
            }
          }
        } catch (_) {}
      }
      res.json({ dbSizeKb, fileCount, orphanCount, orphanSizeMb: Math.round(orphanSizeMb), totalSizeMb: Math.round(totalSizeMb), lastDbBackup: null, lastFilesBackup: null });
    } catch (err) {
      res.status(500).json({ message: "정보 조회 실패" });
    }
  });

  app.get("/api/admin/backup/orphans", isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "관리자만 접근 가능합니다." });
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) return res.status(400).json({ message: "클라우드 스토리지 미설정" });
    try {
      const parts = privateDir.replace(/^\//, "").split("/");
      const bucketName = parts[0];
      const prefix = parts.slice(1).join("/");
      const [files] = await objectStorageClient.bucket(bucketName).getFiles({ prefix });
      const uuidFiles = files.filter(f => UUID_RE.test(f.name.replace(prefix + "/uploads/", "")));
      const dbText = await getAllDbTextForCleanup();
      const orphans = uuidFiles
        .filter(f => {
          const name = f.name.replace(prefix + "/uploads/", "");
          return !dbText.includes(name);
        })
        .map(f => {
          const meta = f.metadata as any;
          return {
            name: f.name.replace(prefix + "/uploads/", ""),
            sizeMb: Math.round(Number(meta.size || 0) / 1024 / 10) / 100,
            sizeBytes: Number(meta.size || 0),
            contentType: meta.contentType || "unknown",
            createdAt: meta.timeCreated || null,
            url: "/objects/uploads/" + f.name.replace(prefix + "/uploads/", ""),
          };
        })
        .sort((a, b) => b.sizeBytes - a.sizeBytes);
      res.json(orphans);
    } catch (err: any) {
      res.status(500).json({ message: "조회 실패: " + err?.message });
    }
  });

  app.post("/api/admin/backup/cleanup-orphans", isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "관리자만 접근 가능합니다." });
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) return res.status(400).json({ message: "클라우드 스토리지 미설정" });
    try {
      const parts = privateDir.replace(/^\//, "").split("/");
      const bucketName = parts[0];
      const prefix = parts.slice(1).join("/");
      const [files] = await objectStorageClient.bucket(bucketName).getFiles({ prefix });
      const uuidFiles = files.filter(f => UUID_RE.test(f.name.replace(prefix + "/uploads/", "")));
      const dbText = await getAllDbTextForCleanup();
      let deleted = 0;
      let freedMb = 0;
      for (const f of uuidFiles) {
        const name = f.name.replace(prefix + "/uploads/", "");
        if (!dbText.includes(name)) {
          try {
            freedMb += Number((f.metadata as any).size || 0) / 1024 / 1024;
            await f.delete();
            deleted++;
          } catch (_) {}
        }
      }
      res.json({ deleted, freedMb: Math.round(freedMb) });
    } catch (err: any) {
      res.status(500).json({ message: "정리 실패: " + err?.message });
    }
  });

  // POST /api/admin/fix-broken-images - 로컬 /uploads/ 경로 사진 복구/정리
  app.post("/api/admin/fix-broken-images", requireAdmin, async (req: any, res) => {
    try {
      const uploadDir = path.join(process.cwd(), "uploads");
      const results = { recovered: 0, removed: 0, skipped: 0, slides_deleted: 0 };

      // ── 1. 사고보고 이미지 복구 ──────────────────────────────────
      const accidents = await db.select().from(accidentReports);
      for (const accident of accidents) {
        const hasBroken = accident.images.some(img => img.startsWith("/uploads/"));
        if (!hasBroken) continue;

        const fixedImages: string[] = [];
        for (const imgPath of accident.images) {
          if (!imgPath.startsWith("/uploads/")) {
            fixedImages.push(imgPath);
            continue;
          }
          const filename = imgPath.replace("/uploads/", "");
          const localPath = path.join(uploadDir, filename);
          if (fs.existsSync(localPath)) {
            // 로컬 파일 있음 → 오브젝트 스토리지로 이전
            const buf = fs.readFileSync(localPath);
            const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
            const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
            const objUrl = await uploadToObjectStorage(buf, filename, mime);
            if (objUrl) {
              fixedImages.push(objUrl);
              results.recovered++;
            } else {
              results.removed++;
            }
          } else {
            results.removed++; // 파일 없음 → 참조 제거
          }
        }
        await db.update(accidentReports)
          .set({ images: fixedImages })
          .where(eq(accidentReports.id, accident.id));
      }

      // ── 2. 안전점검 이미지 복구 ───────────────────────────────────
      const inspections = await db.select().from(safetyInspections);
      for (const insp of inspections) {
        const imgs: string[] = Array.isArray(insp.images) ? (insp.images as string[]) : [];
        const hasBroken = imgs.some(img => img.startsWith("/uploads/"));
        if (!hasBroken) continue;

        const fixedImages: string[] = [];
        for (const imgPath of imgs) {
          if (!imgPath.startsWith("/uploads/")) {
            fixedImages.push(imgPath);
            continue;
          }
          const filename = imgPath.replace("/uploads/", "");
          const localPath = path.join(uploadDir, filename);
          if (fs.existsSync(localPath)) {
            const buf = fs.readFileSync(localPath);
            const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
            const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
            const objUrl = await uploadToObjectStorage(buf, filename, mime);
            if (objUrl) { fixedImages.push(objUrl); results.recovered++; }
            else results.removed++;
          } else {
            results.removed++; // 파일 없음 → 참조 제거
          }
        }
        await db.update(safetyInspections)
          .set({ images: fixedImages })
          .where(eq(safetyInspections.id, insp.id));
      }

      // ── 3. 전자게시판 슬라이드 정리 ──────────────────────────────
      const slides = await storage.getNotices("digital_board");
      for (const slide of slides) {
        try {
          const parsed = JSON.parse(slide.content || "{}");
          if (parsed.imageUrl?.startsWith("/uploads/")) {
            const filename = parsed.imageUrl.replace("/uploads/", "");
            const localPath = path.join(uploadDir, filename);
            if (fs.existsSync(localPath)) {
              const buf = fs.readFileSync(localPath);
              const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
              const mime = ext === "png" ? "image/png" : "image/jpeg";
              const objUrl = await uploadToObjectStorage(buf, filename, mime);
              if (objUrl) {
                const newContent = JSON.stringify({ ...parsed, imageUrl: objUrl });
                await storage.updateNotice(slide.id, { content: newContent });
                results.recovered++;
                continue;
              }
            }
            // 파일 없음 → 슬라이드 삭제
            await storage.deleteNotice(slide.id);
            results.slides_deleted++;
          }
        } catch (_) {}
      }

      // ── 3. 공지/수칙 imageUrl/attachments 정리 ───────────────────
      const notices = await storage.getNotices();
      for (const notice of notices) {
        let changed = false;
        let imageUrl = notice.imageUrl;
        type Att = { url: string; name: string; type: string };
        let attachments = notice.attachments as Att[] | null;

        if (imageUrl?.startsWith("/uploads/")) {
          const filename = imageUrl.replace("/uploads/", "");
          const localPath = path.join(uploadDir, filename);
          if (fs.existsSync(localPath)) {
            const buf = fs.readFileSync(localPath);
            const objUrl = await uploadToObjectStorage(buf, filename, "image/jpeg");
            imageUrl = objUrl || null;
            if (objUrl) results.recovered++;
            else results.removed++;
          } else {
            imageUrl = null;
            results.removed++;
          }
          changed = true;
        }

        if (attachments && Array.isArray(attachments)) {
          const fixed: Att[] = [];
          for (const att of attachments) {
            if (att.url.startsWith("/uploads/")) {
              const filename = att.url.replace("/uploads/", "");
              const localPath = path.join(uploadDir, filename);
              if (fs.existsSync(localPath)) {
                const buf = fs.readFileSync(localPath);
                const mime = att.type === "pdf" ? "application/pdf" : "image/jpeg";
                const objUrl = await uploadToObjectStorage(buf, filename, mime);
                if (objUrl) { fixed.push({ ...att, url: objUrl }); results.recovered++; }
                else results.removed++;
              } else {
                results.removed++;
              }
              changed = true;
            } else {
              fixed.push(att);
            }
          }
          attachments = fixed;
        }

        if (changed) {
          await storage.updateNotice(notice.id, { imageUrl: imageUrl ?? undefined, attachments: attachments ?? undefined });
        }
      }

      res.json({ ...results, message: `복구: ${results.recovered}건, 참조제거: ${results.removed}건, 슬라이드삭제: ${results.slides_deleted}건` });
    } catch (e: any) {
      res.status(500).json({ message: "정리 실패: " + e.message });
    }
  });

  app.get("/api/admin/backup/database", isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "관리자만 접근 가능합니다." });
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const dbUrl = process.env.DATABASE_URL!;
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `backup_db_${stamp}.sql`;
      res.setHeader("Content-Type", "application/sql");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      const { stdout } = await execAsync(`pg_dump --no-owner --no-acl "${dbUrl}"`, {
        maxBuffer: 200 * 1024 * 1024,
      });
      res.send(stdout);
    } catch (err: any) {
      console.error("DB 백업 실패:", err?.message);
      if (!res.headersSent) res.status(500).json({ message: "DB 백업 실패" });
    }
  });

  app.get("/api/admin/backup/files", isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "관리자만 접근 가능합니다." });
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) return res.status(400).json({ message: "클라우드 스토리지 미설정" });
    try {
      const archiver = (await import("archiver")).default;
      const parts = privateDir.replace(/^\//, "").split("/");
      const bucketName = parts[0];
      const prefix = parts.slice(1).join("/");
      const [files] = await objectStorageClient.bucket(bucketName).getFiles({ prefix });
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="backup_files_${stamp}.zip"`);
      const archive = archiver("zip", { zlib: { level: 4 } });
      archive.on("error", (err: any) => { console.error("Archive error:", err); });
      archive.pipe(res);
      for (const file of files) {
        const name = file.name.replace(prefix + "/", "");
        if (!name || name.endsWith("/")) continue;
        try {
          const [contents] = await file.download();
          archive.append(contents, { name });
        } catch (_) {}
      }
      await archive.finalize();
    } catch (err: any) {
      console.error("파일 백업 실패:", err?.message);
      if (!res.headersSent) res.status(500).json({ message: "파일 백업 실패" });
    }
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
      // 세션에 taskId가 있으면 완료율 자동 업데이트
      const session = await storage.getEducationSession(sessionId);
      if (session?.taskId) {
        syncTaskCompletionFromSessions(session.taskId).catch(console.error);
      }
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "입력값이 올바르지 않습니다" });
      console.error("Error creating signature:", error);
      res.status(500).json({ message: "서명 등록에 실패했습니다" });
    }
  });

  app.delete("/api/education-signatures/:id", requirePermission("registerEducation"), async (req: any, res) => {
    try {
      // 서명 삭제 전 sessionId 조회 (taskId 역추적용)
      const sig = await storage.getSignature(Number(req.params.id));
      await storage.deleteSignature(Number(req.params.id));
      res.status(204).send();
      // 삭제 성공 후 연결된 업무 완료율 재계산
      if (sig?.sessionId) {
        const session = await storage.getEducationSession(sig.sessionId);
        if (session?.taskId) {
          syncTaskCompletionFromSessions(session.taskId).catch(console.error);
        }
      }
    } catch (e: any) {
      console.error("Error deleting signature:", e);
      res.status(500).json({ message: "서명 삭제에 실패했습니다" });
    }
  });

  // === 공개 서명 링크 (로그인 불필요) ===
  app.get("/api/public/education/:id", async (req: any, res) => {
    try {
      const session = await storage.getEducationSession(Number(req.params.id));
      if (!session) return res.status(404).json({ message: "교육 세션을 찾을 수 없습니다." });
      // taskId가 있으면 업무 제목 + 커스텀 양식 필드도 함께 반환
      let taskTitle: string | null = null;
      let taskFields: Array<{type: string; title: string}> = [];
      if (session.taskId) {
        const task = await storage.getEducationTask(session.taskId);
        if (task) {
          taskTitle = task.title;
          taskFields = (task.taskFields as Array<{type: string; title: string}>) || [];
        }
      }
      res.json({
        id: session.id,
        title: taskTitle || session.title,
        educationDate: session.educationDate,
        department: session.department,
        educationType: session.educationType,
        instructor: session.instructor,
        totalParticipants: session.totalParticipants,
        status: session.status,
        taskFields,
      });
    } catch (err) {
      res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
  });

  // 업무 기반 대표 서명 페이지용 공개 API
  app.get("/api/public/task/:taskId", async (req: any, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const task = await storage.getEducationTask(taskId);
      if (!task) return res.status(404).json({ message: "교육 업무를 찾을 수 없습니다." });
      const allSessions = await storage.getEducationSessions();
      const sessions = allSessions.filter(s => s.taskId === taskId);
      const sigs = await Promise.all(sessions.map(s => storage.getSignaturesBySession(s.id)));
      const sessionList = sessions.map((s, i) => ({
        id: s.id,
        department: s.department,
        educationType: s.educationType,
        totalParticipants: s.totalParticipants,
        signedCount: sigs[i].length,
        status: s.status,
      }));
      res.json({
        id: task.id,
        title: task.title,
        startDate: task.startDate,
        endDate: task.endDate,
        field: task.field,
        educationType: sessions[0]?.educationType || "정기교육",
        sessions: sessionList,
        taskFields: (task.taskFields as Array<{type: string; title: string}>) || [],
      });
    } catch (err) {
      res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
  });

  const publicSignLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: { message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post("/api/public/education/:id/sign", publicSignLimiter, async (req: any, res) => {
    try {
      const MAX_SIGNATURE_SIZE = 500 * 1024;
      const sigSchema = z.object({
        signerName: z.string().min(1, "이름을 입력해주세요").max(50, "이름은 50자 이내로 입력해주세요"),
        signerDepartment: z.string().max(100).optional().default(""),
        signatureData: z.string().min(1, "서명을 입력해주세요").max(MAX_SIGNATURE_SIZE, "서명 데이터가 너무 큽니다."),
        consentAgreed: z.boolean().refine(v => v === true, { message: "개인정보 수집 및 전자서명 동의가 필요합니다." }),
        fieldValues: z.record(z.string(), z.string()).optional().default({}),
      });
      const parsed = sigSchema.parse(req.body);
      const originalSessionId = Number(req.params.id);
      const originalSession = await storage.getEducationSession(originalSessionId);
      if (!originalSession) return res.status(404).json({ message: "교육 세션을 찾을 수 없습니다." });

      // 소속팀이 다르면 같은 교육명+날짜의 해당 팀 세션을 찾아서 거기에 등록
      let targetSessionId = originalSessionId;
      const signerDept = parsed.signerDepartment || "";
      if (signerDept && signerDept !== originalSession.department) {
        const allSessions = await storage.getEducationSessions();
        const matched = allSessions.find(s =>
          s.title === originalSession.title &&
          s.educationDate === originalSession.educationDate &&
          s.department === signerDept
        );
        if (matched) targetSessionId = matched.id;
      }

      const existing = await storage.getSignaturesBySession(targetSessionId);
      const alreadySigned = existing.some(
        s => s.signerName === parsed.signerName && s.signerDepartment === signerDept
      );
      if (alreadySigned) {
        return res.status(400).json({ message: "이미 서명을 등록하셨습니다. 한 사람당 한 번만 서명할 수 있습니다." });
      }

      // 법적 증빙 메타데이터 수집
      const signedAt = new Date().toISOString();
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
      const userAgent = (req.headers["user-agent"] as string) || "unknown";

      // 무결성 해시 생성 (SHA-256) — 위변조 검증용
      const hashSource = `${parsed.signerName}|${targetSessionId}|${signedAt}|${ipAddress}`;
      const integrityHash = createHash("sha256").update(hashSource).digest("hex");

      const signature = await storage.createSignature({
        sessionId: targetSessionId,
        signerName: parsed.signerName,
        signerDepartment: signerDept,
        signatureData: parsed.signatureData,
        consentAgreed: true,
        ipAddress,
        userAgent,
        integrityHash,
        fieldValues: parsed.fieldValues && Object.keys(parsed.fieldValues).length > 0 ? parsed.fieldValues : undefined,
      });
      res.status(201).json({ ...signature, resolvedSessionId: targetSessionId });
      // 서명 후 연결된 업무 완료율 자동 동기화
      const targetSession = await storage.getEducationSession(targetSessionId);
      if (targetSession?.taskId) {
        syncTaskCompletionFromSessions(targetSession.taskId).catch(console.error);
      }
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: err.errors?.[0]?.message || "입력값 오류" });
      res.status(500).json({ message: "서명 등록에 실패했습니다." });
    }
  });

  app.get("/api/public/education/:id/signatures", async (req: any, res) => {
    try {
      const signatures = await storage.getSignaturesBySession(Number(req.params.id));
      res.json(signatures);
    } catch {
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // === 보호구 지급 공개 서명 링크 (로그인 불필요) ===
  app.get("/api/public/equipment/:id", async (req: any, res) => {
    try {
      const notice = await storage.getNotice(Number(req.params.id));
      if (!notice || notice.category !== "equip_request") {
        return res.status(404).json({ message: "보호구 지급 신청을 찾을 수 없습니다." });
      }
      let parsed: any = {};
      try { parsed = JSON.parse(notice.content); } catch {}
      if (parsed.status === "수령완료") {
        return res.status(400).json({ message: "이미 서명이 완료된 지급 건입니다." });
      }
      res.json({
        id: notice.id,
        title: notice.title,
        team: parsed.team ?? "",
        requester: parsed.requester ?? "",
        items: parsed.items ?? [],
        status: parsed.status ?? "",
        createdAt: notice.createdAt,
      });
    } catch (err) {
      res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
  });

  app.post("/api/public/equipment/:id/sign", publicSignLimiter, async (req: any, res) => {
    try {
      const MAX_SIGNATURE_SIZE = 500 * 1024;
      const sigSchema = z.object({
        signerName: z.string().min(1, "이름을 입력해주세요").max(50, "이름은 50자 이내로 입력해주세요"),
        signatureData: z.string().min(1, "서명을 입력해주세요").max(MAX_SIGNATURE_SIZE, "서명 데이터가 너무 큽니다."),
        consentAgreed: z.boolean().refine(v => v === true, { message: "개인정보 수집 및 전자서명 동의가 필요합니다." }),
        disposed: z.boolean().optional().default(false),
      });
      const parsed = sigSchema.parse(req.body);
      const notice = await storage.getNotice(Number(req.params.id));
      if (!notice || notice.category !== "equip_request") {
        return res.status(404).json({ message: "보호구 지급 신청을 찾을 수 없습니다." });
      }
      let content: any = {};
      try { content = JSON.parse(notice.content); } catch {}
      if (content.status === "수령완료") {
        return res.status(400).json({ message: "이미 서명이 완료된 지급 건입니다." });
      }
      // 법적 증빙 메타데이터
      const signedAt = new Date().toISOString();
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
      const userAgent = (req.headers["user-agent"] as string) || "unknown";
      const hashSource = `${parsed.signerName}|${notice.id}|${signedAt}|${ipAddress}`;
      const integrityHash = createHash("sha256").update(hashSource).digest("hex");

      const updatedContent = JSON.stringify({
        ...content,
        status: "수령완료",
        signature: parsed.signatureData,
        signedAt,
        signerName: parsed.signerName,
        disposed: parsed.disposed,
        ipAddress,
        userAgent,
        consentAgreed: true,
        integrityHash,
      });
      await storage.updateNotice(notice.id, { content: updatedContent });
      res.status(201).json({ success: true, signedAt, integrityHash });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: err.errors?.[0]?.message || "입력값 오류" });
      res.status(500).json({ message: "서명 등록에 실패했습니다." });
    }
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
            educationEndDate: groupSessions[0].educationEndDate || null,
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

  app.post('/api/chemicals/bulk-delete', requireEditor, async (req: any, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
    let deleted = 0;
    for (const id of ids) { try { await storage.deleteChemical(Number(id)); deleted++; } catch {} }
    res.json({ deleted });
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

  app.post('/api/musculoskeletal-assessments/bulk-delete', requireEditor, async (req: any, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
    let deleted = 0;
    for (const id of ids) { try { await storage.deleteMusculoskeletalAssessment(Number(id)); deleted++; } catch {} }
    res.json({ deleted });
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

  app.post('/api/risk-assessments/bulk-delete', requireEditor, async (req: any, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
    let deleted = 0;
    for (const id of ids) { try { await storage.deleteRiskAssessment(Number(id)); deleted++; } catch {} }
    res.json({ deleted });
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

  // === 위험성평가 AI 기능 ===

  // 사진 분석 → 위험요인 자동 탐지 (GPT-4o Vision)
  app.post('/api/risk-assessments/ai/analyze-photo', requireEditor, upload.single('photo'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "사진이 없습니다" });

      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype || 'image/jpeg';

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `당신은 산업안전보건 전문가입니다. 현장 사진을 분석하여 잠재적인 위험 요인과 위험성 등급을 한국어로 파악합니다.
다음 JSON 형식으로만 응답하세요 (코드블록 없이):
{
  "hazard": "주요 위험요인 1~2문장으로 요약",
  "hazardType": "추락|전도|충돌|협착|감전|화재/폭발|기타 중 하나",
  "details": ["구체적 위험요인1", "구체적 위험요인2", "구체적 위험요인3"],
  "urgency": "높음|보통|낮음",
  "summary": "2~3문장의 종합 분석",
  "probability": 3,
  "criticality": 2
}
probability는 1~5 정수 (1=거의없음 2=가끔 3=보통 4=자주 5=매우자주), criticality는 1~4 정수 (1=경미 2=보통 3=중대 4=치명) 기준으로 사진 속 위험 수준에 맞게 추천하세요.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "high" },
              },
              { type: "text", text: "이 현장 사진에서 안전 위험 요인을 분석해주세요." },
            ] as any,
          },
        ],
        max_tokens: 800,
        temperature: 0.2,
      });

      const raw = response.choices[0].message.content?.trim() || "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch { parsed = { hazard: "AI 분석 실패 - 다시 시도해주세요", hazardType: "기타", details: [], urgency: "보통", summary: raw }; }
      res.json(parsed);
    } catch (e: any) {
      console.error("AI photo analysis error:", e);
      res.status(500).json({ message: "AI 사진 분석에 실패했습니다: " + (e.message || "") });
    }
  });

  // 감소대책 AI 자동 추천 (hazardType + 공정 + 위험요인 기반)
  app.post('/api/risk-assessments/ai/suggest-measures', requireEditor, async (req: any, res) => {
    try {
      const { hazardType, hazard, process: workProcess, currentControls } = req.body;
      if (!hazardType && !hazard) return res.status(400).json({ message: "위험요인 유형 또는 내용이 필요합니다" });

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `당신은 산업안전보건법 전문가이며 현장 안전관리 컨설턴트입니다.
주어진 위험 정보를 바탕으로 구체적이고 실행 가능한 안전 대책을 제안합니다.
다음 JSON 형식으로만 응답하세요 (코드블록 없이):
{
  "measures": ["대책1 (구체적, 실행 가능한 형태)", "대책2", "대책3", "대책4"],
  "relatedLaw": "산업안전보건법 관련 조항 (예: 산업안전보건기준에 관한 규칙 제42조)",
  "priority": "즉시조치|단기|중기",
  "summary": "주요 대책 요약 (1~2문장)"
}`,
          },
          {
            role: "user",
            content: `다음 위험 요인에 대한 안전 대책을 추천해주세요:
- 사고 유형: ${hazardType || "미지정"}
- 작업 공정: ${workProcess || "일반 현장 작업"}
- 유해위험요인: ${hazard || "미지정"}
- 현재 안전조치: ${currentControls || "없음"}

실제 현장에서 즉시 적용 가능한 구체적인 대책 4가지를 추천해주세요.`,
          },
        ],
        max_tokens: 800,
        temperature: 0.3,
      });

      const raw = response.choices[0].message.content?.trim() || "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch { parsed = { measures: [raw], relatedLaw: "", priority: "단기", summary: "" }; }
      res.json(parsed);
    } catch (e: any) {
      console.error("AI suggest measures error:", e);
      res.status(500).json({ message: "AI 대책 추천에 실패했습니다: " + (e.message || "") });
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

  app.post('/api/accidents/bulk-delete', requireEditor, async (req: any, res) => {
    const ids: number[] = req.body.ids || [];
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids 필요" });
    try {
      for (const id of ids) { try { await storage.deleteAccidentReport(id); } catch (_) {} }
      res.json({ deleted: ids.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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

  // === 사고보고 PDF 파싱 ===
  const accidentPdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  app.post('/api/accidents/parse-pdf', isAuthenticated, accidentPdfUpload.single('pdf'), async (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ message: "PDF 파일이 필요합니다" });
    try {
      const pdfBuffer: Buffer = req.file.buffer;
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pathMod = await import('path');
      const workerSrc = 'file://' + pathMod.default.resolve('./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;
      const uint8 = new Uint8Array(pdfBuffer);
      const pdfDoc = await pdfjsLib.getDocument({ data: uint8 }).promise;
      let text = '';
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const tc = await page.getTextContent();
        text += tc.items.map((it: any) => it.str).join(' ') + '\n';
      }
      const fullText = text.replace(/\s+/g, ' ');

      // 제목 (제 목 이후)
      let title = '';
      const titleMatch = fullText.match(/제\s*목\s+([^\n]+?)(?=\s+<사고|1\.\s*사고자|$)/);
      if (titleMatch) title = titleMatch[1].trim();

      // 소속팀
      let department = '';
      const deptMatch = fullText.match(/소속팀\s+([가-힣A-Za-z]+팀)/);
      if (deptMatch) department = deptMatch[1].trim();

      // 운전자 / 기안자
      let reporterName = '';
      const driverMatch = fullText.match(/운전자\s+([가-힣]{2,4})\s+소속팀/);
      if (driverMatch) reporterName = driverMatch[1].trim();
      else {
        const drafterMatch = fullText.match(/기\s*안\s*자\s+([가-힣]{2,4})/);
        if (drafterMatch) reporterName = drafterMatch[1].trim();
      }

      // 차종/차량번호
      let vehicleInfo = '';
      const vehicleMatch = fullText.match(/차종[\/\/]차량번호\s+([^\n]+?)(?=\s+2\.\s*사고|\s+동승자|$)/);
      if (vehicleMatch) vehicleInfo = vehicleMatch[1].trim();

      // 동승자
      let companion = '';
      const companionMatch = fullText.match(/동승자\s+([가-힣A-Za-z없음]+)\s+소속파트/);
      if (companionMatch) companion = companionMatch[1].trim();

      // 발생일시
      let occurredAt = '';
      const dtMatch = fullText.match(/발생일시\s+(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s+(\d{1,2})\s*시\s+(\d{1,2})\s*분/);
      if (dtMatch) {
        const [, yr, mo, day, hr, min] = dtMatch;
        occurredAt = `${yr}-${mo.padStart(2,'0')}-${day.padStart(2,'0')}T${hr.padStart(2,'0')}:${min.padStart(2,'0')}`;
      }

      // 발생장소
      let location = '';
      const locMatch = fullText.match(/발생장소\s+(.+?)(?=\s+다\.|$)/);
      if (locMatch) location = locMatch[1].trim();

      // 사고내용 (다. 사고내용 → 1) 사고당시업무 전까지)
      let accidentOverview = '';
      const overviewMatch = fullText.match(/다\.\s*사고내용\s+(.+?)(?=\s+1\)\s*사고당시업무|라\.|$)/);
      if (overviewMatch) accidentOverview = overviewMatch[1].replace(/ㅇ\s*/g, '\n• ').trim();

      // 사고전후상황 (원인)
      let causeDetail = '';
      const causeMatch = fullText.match(/2\)\s*사고전후상황\s+(.+?)(?=\s+라\s|마\.|$)/);
      if (causeMatch) causeDetail = causeMatch[1].trim();

      // 재발방지계획 (사고자 다짐)
      let preventionPlan = '';
      const preventionMatch = fullText.match(/사고자\s*다짐\s+(.+?)(?=●|첨부|$)/);
      if (preventionMatch) preventionPlan = preventionMatch[1].trim();

      // 사고유형 추정
      let accidentType = '교통사고';
      if (/추락/.test(fullText)) accidentType = '추락';
      else if (/전도/.test(fullText)) accidentType = '전도';
      else if (/협착/.test(fullText)) accidentType = '협착';
      else if (/감전/.test(fullText)) accidentType = '감전';
      else if (/화재|폭발/.test(fullText)) accidentType = '화재/폭발';
      else if (/충돌/.test(fullText)) accidentType = '충돌';
      else if (/차량|교통|추돌/.test(fullText)) accidentType = '교통사고';

      // 이미지 추출
      const imageUrls: string[] = [];
      try {
        const jpegBuffers = extractJpegsFromBuffer(pdfBuffer);
        for (let i = 0; i < Math.min(jpegBuffers.length, 10); i++) {
          const filename = `accident-pdf-img-${Date.now()}-${i}.jpg`;
          const objUrl = await uploadToObjectStorage(jpegBuffers[i], filename, 'image/jpeg');
          if (objUrl) imageUrls.push(objUrl);
        }
      } catch {}

      res.json({ title, department, reporterName, vehicleInfo, companion, occurredAt, location, accidentOverview, causeDetail, preventionPlan, accidentType, imageUrls });
    } catch (err: any) {
      console.error('사고보고 PDF 파싱 오류:', err);
      res.status(500).json({ message: 'PDF 파싱에 실패했습니다: ' + (err?.message || '') });
    }
  });

  // === 사고보고 Word(docx) 파싱 ===
  const accidentDocxUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  app.post('/api/accidents/parse-docx', isAuthenticated, accidentDocxUpload.single('docx'), async (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ message: "Word 파일이 필요합니다" });
    try {
      const mammoth = await import('mammoth');

      // ── 이미지 추출 (별첨 섹션 이후 사진만 추출) ──
      const imageBuffers: Buffer[] = [];
      const imageMimeTypes: string[] = [];
      const imageNames: string[] = [];
      try {
        const JSZip = await import('jszip');
        const zip = await (JSZip as any).default.loadAsync(req.file.buffer);

        // 1) 관계 파일에서 rId → 파일명 매핑
        const rIdToMedia: Record<string, string> = {};
        if (zip.files['word/_rels/document.xml.rels']) {
          const relsXml: string = await zip.files['word/_rels/document.xml.rels'].async('string');
          const relRe = /Id="([^"]+)"[^>]*Target="media\/([^"]+)"/g;
          let rm;
          while ((rm = relRe.exec(relsXml)) !== null) {
            rIdToMedia[rm[1]] = rm[2]; // e.g. rId6 → image1.jpeg
          }
        }

        // 2) document.xml 에서 "별첨" 텍스트 위치 기준으로 이후 이미지만 선택
        let annexImageFiles: string[] = [];
        if (zip.files['word/document.xml'] && Object.keys(rIdToMedia).length > 0) {
          const docXml: string = await zip.files['word/document.xml'].async('string');
          // "별첨" 또는 "별 첨" 텍스트가 처음 나타나는 위치
          const annexPos = docXml.search(/별\s*첨/);
          if (annexPos >= 0) {
            const afterAnnex = docXml.slice(annexPos);
            // embed 속성으로 이미지 참조 추출 (순서 유지)
            const embedRe = /r:embed="([^"]+)"/g;
            let em;
            while ((em = embedRe.exec(afterAnnex)) !== null) {
              const rId = em[1];
              if (rIdToMedia[rId]) {
                const filename = rIdToMedia[rId];
                const mediaPath = 'word/media/' + filename;
                if (!annexImageFiles.includes(mediaPath)) {
                  annexImageFiles.push(mediaPath);
                }
              }
            }
          }
        }

        // 3) 별첨 이미지가 없으면 전체 미디어 중 사진 파일만 사용 (fallback)
        if (annexImageFiles.length === 0) {
          annexImageFiles = Object.keys(zip.files)
            .filter((name: string) => name.startsWith('word/media/') && !zip.files[name].dir)
            .filter((name: string) => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(name))
            .sort();
        }

        // 4) 버퍼 읽기 (최대 10장)
        for (const mediaPath of annexImageFiles.slice(0, 10)) {
          if (!zip.files[mediaPath]) continue;
          try {
            const buf: Buffer = await zip.files[mediaPath].async('nodebuffer');
            const ext = mediaPath.split('.').pop()?.toLowerCase() || 'jpg';
            const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
            imageBuffers.push(buf);
            imageMimeTypes.push(mime);
            imageNames.push(mediaPath.split('/').pop() || `image${imageBuffers.length}`);
          } catch {}
        }
      } catch (zipErr) {
        console.error('JSZip 이미지 추출 오류:', zipErr);
      }

      // ── 텍스트 추출 ──
      const textResult = await (mammoth as any).extractRawText({ buffer: req.file.buffer });
      const raw = textResult.value.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
      const lines = raw.split('\n').map((l: string) => l.trim());
      const fullText = lines.join('\n');

      // ── 섹션 추출 헬퍼 ──
      const getSection = (keyword: string): string => {
        const re = new RegExp(`□\\s*${keyword}[^\\n]*\\n([\\s\\S]*?)(?=□|$)`);
        return (fullText.match(re)?.[1] || '').trim();
      };
      const sectionLines = (keyword: string): string[] =>
        getSection(keyword).split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

      // ── 발생일시 ──
      let occurredAt = '';
      const dtM = fullText.match(/발생\s*일\s*시[\s:：]*(\d{4})[.\s년]*(\d{1,2})[.\s월]*(\d{1,2}).*?(\d{1,2})\s*시\s*(\d{2})\s*분/);
      if (dtM) {
        const [, yr, mo, dy, hr, mi] = dtM;
        occurredAt = `${yr}-${mo.padStart(2,'0')}-${dy.padStart(2,'0')}T${hr.padStart(2,'0')}:${mi.padStart(2,'0')}`;
      }

      // ── 사고자 인적사항 테이블 파싱 ──
      // mammoth는 테이블을 셀별로 줄바꿈으로 추출 → 헤더 5개(성명/직위/소속부서/동행자/차종차량번호) 다음에 데이터 5개
      let reporterName = '', reporterPosition = '', department = '', companion = '', vehicleInfo = '';
      const infoSec = sectionLines('사고자 인적사항');
      // 마지막 헤더 "차종" 이후가 데이터
      const lastHeaderIdx = infoSec.findIndex((l: string) => l.includes('차종') || l.includes('차량번호'));
      if (lastHeaderIdx >= 0 && infoSec.length > lastHeaderIdx + 1) {
        const data = infoSec.slice(lastHeaderIdx + 1);
        reporterName     = data[0] || '';
        reporterPosition = data[1] || '';
        department       = data[2] || '';
        companion        = (data[3] === '-' || data[3] === '−') ? '' : (data[3] || '');
        vehicleInfo      = data[4] || '';
      }
      // fallback: 직접 패턴
      if (!reporterName)     { const m = fullText.match(/성\s*명[^\n]*\n([가-힣]{2,5})/); if (m) reporterName = m[1]; }
      if (!reporterPosition) { const m = fullText.match(/직\s*위[^\n]*\n([가-힣A-Za-z]+)/); if (m) reporterPosition = m[1]; }
      if (!department)       { const m = fullText.match(/소속\s*부서[^\n]*\n([가-힣A-Za-z]+팀)/); if (m) department = m[1]; }
      if (!department)       { const m = fullText.match(/([가-힣]+(?:운용|지원|계획|관제)팀)/); if (m) department = m[1]; }
      if (!vehicleInfo)      { const m = fullText.match(/차종\/차량번호[^\n]*\n([^\n]+)/); if (m) vehicleInfo = m[1].trim(); }

      // ── 경과 및 조치사항 테이블 파싱 ──
      // 테이블 셀 순서: NO, 시간, 내용 헤더(3개) → 이후 숫자, HH:MM, 내용 반복
      const progressItems: Array<{ no: number; time: string; content: string }> = [];
      const progressSec = sectionLines('경과 및 조치');
      // 헤더 행 제거(NO, 시간, 내용)
      const progDataLines = progressSec.filter((l: string) =>
        l !== 'NO' && l !== '시간' && l !== '내용' && l !== 'no'
      );
      let pi = 0;
      while (pi < progDataLines.length) {
        const numLine = progDataLines[pi];
        const isNum = /^\d+\.?$/.test(numLine);
        if (isNum) {
          const timeCandidate = progDataLines[pi + 1] || '';
          const timeMatch = timeCandidate.match(/^(\d{1,2}:\d{2})$/);
          if (timeMatch) {
            const content = progDataLines[pi + 2] || '';
            if (content.length > 1) {
              progressItems.push({ no: progressItems.length + 1, time: timeMatch[1], content });
              pi += 3;
              continue;
            }
          }
          // 시간이 숫자와 같은 줄에 붙어있는 경우 (예: "115:19")
          const combined = numLine;
          const combinedMatch = combined.match(/^\d+(\.?)\s*(\d{1,2}:\d{2})$/);
          if (combinedMatch) {
            const content = progDataLines[pi + 1] || '';
            if (content.length > 1) {
              progressItems.push({ no: progressItems.length + 1, time: combinedMatch[2], content });
              pi += 2;
              continue;
            }
          }
        }
        // 시간+내용이 같은 줄 패턴 (HH:MM 내용)
        const inlineMatch = numLine.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
        if (inlineMatch) {
          progressItems.push({ no: progressItems.length + 1, time: inlineMatch[1], content: inlineMatch[2] });
          pi++;
          continue;
        }
        pi++;
      }
      // fallback: 전체 텍스트에서 HH:MM 패턴으로 수집
      if (progressItems.length === 0) {
        const allLines = lines;
        for (let li = 0; li < allLines.length; li++) {
          const tm = allLines[li].match(/^(\d{1,2}:\d{2})$/);
          if (tm && li + 1 < allLines.length && allLines[li + 1].length > 3) {
            progressItems.push({ no: progressItems.length + 1, time: tm[1], content: allLines[li + 1] });
          }
        }
      }

      // ── 사고 개요 ──
      const overviewLines = sectionLines('사고 개요');
      const accidentOverview = overviewLines.join('\n');

      // ── 사고원인 상세 ──
      const causeLines = sectionLines('사고원인');
      const causeDetail = causeLines.join(' ').trim();

      // ── 사고방지대책 ──
      const preventionLines = sectionLines('사고방지대책');
      const preventionPlan = preventionLines.join('\n');

      // ── 제목 구성 ──
      const dateStr = occurredAt ? occurredAt.split('T')[0] : '';
      const title = [department, vehicleInfo ? `차량사고(${vehicleInfo.split('/')[1] || vehicleInfo})` : '사고경위서', dateStr].filter(Boolean).join(' ');

      // ── 사고유형 ──
      let accidentType = '교통사고';
      if (/추락/.test(fullText) && !/추락 사고/.test('')) accidentType = '추락';
      else if (/협착/.test(fullText)) accidentType = '협착';
      else if (/감전/.test(fullText)) accidentType = '감전';
      else if (/화재|폭발/.test(fullText)) accidentType = '화재/폭발';
      else if (/추돌|충돌|교통|차량사고|차량 사고/.test(fullText)) accidentType = '교통사고';

      // ── 사고원인분류 ──
      let cause = '';
      const causeText = fullText;
      if (/전방\s*주시\s*태만/.test(causeText) && /안전\s*거리\s*미확보/.test(causeText)) cause = '전방주시 태만';
      else if (/전방\s*주시\s*태만/.test(causeText)) cause = '전방주시 태만';
      else if (/안전\s*거리\s*미확보/.test(causeText)) cause = '안전거리 미확보';
      else if (/개인\s*부주의/.test(causeText)) cause = '개인 부주의';
      else if (/불안전한\s*행동/.test(causeText)) cause = '불안전한 행동';
      else if (accidentType === '교통사고') cause = '개인 부주의';

      // ── 과실율 ──
      let faultRate: number | undefined;
      if (accidentType === '교통사고') {
        const frM = fullText.match(/(?:과실율|과실률|과실\s*비율|본인\s*과실)[\s:：]*(\d{1,3})\s*%?/);
        faultRate = frM ? Number(frM[1]) : 100;
      }

      // ── 발생장소: 사고 개요에서 추출 ──
      let location = '';
      const locM = accidentOverview.match(/([가-힣]+구\s+[가-힣\s\d]+(?:교차로|네거리|앞|부근|도로|거리|길)[^\n,。.]*)/);
      if (locM) location = locM[1].trim();

      // ── 작성자 추출 ──
      let writer = '';
      const writerM = fullText.match(/작성자\s*:\s*([가-힣A-Za-z0-9\s]+팀\s+)?([가-힣]{2,5})/);
      if (writerM) {
        writer = (writerM[2] || '').trim();
        if (writerM[1]) writer = writerM[1].trim() + ' ' + writer;
      }

      // ── 이미지 캡션 추출 (별첨 섹션의 텍스트 라벨) ──
      const imageCaptionLabels: string[] = [];
      const annexIdx = fullText.indexOf('별첨');
      if (annexIdx >= 0) {
        const afterAnnex = fullText.slice(annexIdx);
        const captionCandidates = afterAnnex.split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 1 && l.length < 40 && !/별첨|작성자|년|월|일/.test(l) && /[가-힣]/.test(l));
        imageCaptionLabels.push(...captionCandidates.slice(0, 10));
      }
      // 캡션이 없으면 기본값
      const defaultCaptions = ['사고 현장', '피해사진_1', '피해사진_2', '상대차량', '피해사진_3', '피해사진_4', '피해사진_5'];

      // ── 이미지 업로드 ──
      const imageUrls: string[] = [];
      const imageCaptions: string[] = [];
      for (let i = 0; i < Math.min(imageBuffers.length, 10); i++) {
        const ext = imageMimeTypes[i]?.includes('png') ? '.png' : '.jpg';
        const filename = `accident-docx-img-${Date.now()}-${i}${ext}`;
        const objUrl = await uploadToObjectStorage(imageBuffers[i], filename, imageMimeTypes[i] || 'image/jpeg');
        if (objUrl) {
          imageUrls.push(objUrl);
          imageCaptions.push(imageCaptionLabels[i] || defaultCaptions[i] || `사진 ${i + 1}`);
        }
      }

      res.json({ title, department, reporterName, reporterPosition, vehicleInfo, companion, occurredAt, location, accidentOverview, causeDetail, preventionPlan, accidentType, cause, faultRate, progressItems, imageUrls, imageCaptions, writer });
    } catch (err: any) {
      console.error('사고보고 Word 파싱 오류:', err);
      res.status(500).json({ message: 'Word 파싱에 실패했습니다: ' + (err?.message || '') });
    }
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

  // === NEAR MISS REPORTS (아차사고) ===

  // AI 사진 분석 (로그인 불필요 — 공개 등록 폼에서도 사용)
  app.post('/api/near-miss/ai/analyze-photo', upload.single('photo'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "사진이 없습니다" });
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype || 'image/jpeg';

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `당신은 산업안전보건 전문가입니다. 현장 사진을 분석하여 아차사고(Near-Miss) 보고서에 필요한 내용을 한국어로 작성합니다.
다음 JSON 형식으로만 응답하세요 (코드블록 없이):
{
  "accidentType": "추락|전도(넘어짐)|감전|낙하·비래|협착(끼임)|충돌|화재|기타 중 가장 적합한 하나",
  "riskFactor": "불안전한 상태|불안전한 행동|환경적 요인|기타 중 하나",
  "riskDetail": "구체적인 위험요인 1~2문장",
  "description": "사진 속 상황에서 어떤 아차사고가 발생할 뻔했는지 2~3문장 설명",
  "immediateAction": "현장에서 즉시 취해야 할 조치 내용",
  "preventionIdea": "재발 방지를 위한 구체적인 아이디어 2~3가지"
}`,
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "high" } },
              { type: "text", text: "이 현장 사진에서 발생할 수 있는 아차사고를 분석하여 보고서를 작성해주세요." },
            ] as any,
          },
        ],
        max_tokens: 1000,
        temperature: 0.2,
      });

      const raw = response.choices[0].message.content?.trim() || "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch {
        parsed = { accidentType: "기타", riskFactor: "기타", riskDetail: "AI 분석 실패", description: raw, immediateAction: "", preventionIdea: "" };
      }
      res.json(parsed);
    } catch (e: any) {
      console.error("Near-miss AI analysis error:", e);
      res.status(500).json({ message: "AI 분석에 실패했습니다: " + (e.message || "") });
    }
  });

  // 공개 등록 (로그인 불필요)
  app.post('/api/near-miss/public', upload.array('images', 5), async (req: any, res) => {
    try {
      const { occurredAt, location, team, reporter, isAnonymous, accidentType, riskFactor, riskDetail, description, immediateAction, preventionIdea } = req.body;
      if (!occurredAt || !location || !accidentType || !riskFactor) return res.status(400).json({ message: "필수 항목을 입력해주세요" });
      const imageUrls: string[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          const filename = `near-miss-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname) || '.jpg'}`;
          const objUrl = await uploadToObjectStorage(file.buffer, filename, file.mimetype);
          if (objUrl) {
            imageUrls.push(objUrl);
          } else {
            fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
            imageUrls.push(`/uploads/${filename}`);
          }
        }
      }
      const report = await storage.createNearMissReport({
        occurredAt: new Date(occurredAt),
        location, team: team || null, reporter: isAnonymous === 'true' ? '익명' : (reporter || '익명'),
        isAnonymous: isAnonymous === 'true',
        accidentType, riskFactor, riskDetail: riskDetail || null,
        description: description || null, immediateAction: immediateAction || null,
        preventionIdea: preventionIdea || null,
        images: imageUrls, status: '접수',
      });
      res.json({ success: true, id: report.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/near-miss', isAuthenticated, async (req: any, res) => {
    try { res.json(await storage.getNearMissReports()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/near-miss/:id', isAuthenticated, async (req: any, res) => {
    try {
      const r = await storage.getNearMissReport(Number(req.params.id));
      if (!r) return res.status(404).json({ message: "찾을 수 없습니다" });
      res.json(r);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch('/api/near-miss/:id', requireEditor, async (req: any, res) => {
    try {
      const updated = await storage.updateNearMissReport(Number(req.params.id), req.body);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/near-miss/:id', requireEditor, async (req: any, res) => {
    try {
      await storage.deleteNearMissReport(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/near-miss/bulk-delete', requireEditor, async (req: any, res) => {
    const ids: number[] = req.body.ids || [];
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids 필요" });
    try {
      for (const id of ids) { try { await storage.deleteNearMissReport(id); } catch (_) {} }
      res.json({ deleted: ids.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 아차사고 엑셀 다운로드
  app.get('/api/near-miss/export/excel', isAuthenticated, async (req: any, res) => {
    try {
      const reports = await storage.getNearMissReports();
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('아차사고 목록');
      ws.columns = [
        { header: 'ID', key: 'id', width: 6 },
        { header: '발생일시', key: 'occurredAt', width: 20 },
        { header: '장소', key: 'location', width: 20 },
        { header: '소속팀', key: 'team', width: 15 },
        { header: '신고자', key: 'reporter', width: 12 },
        { header: '사고유형', key: 'accidentType', width: 12 },
        { header: '위험요인', key: 'riskFactor', width: 15 },
        { header: '위험요인 상세', key: 'riskDetail', width: 20 },
        { header: '상황설명', key: 'description', width: 30 },
        { header: '즉시조치', key: 'immediateAction', width: 25 },
        { header: '재발방지', key: 'preventionIdea', width: 25 },
        { header: '상태', key: 'status', width: 10 },
        { header: '담당자', key: 'assignedTo', width: 12 },
        { header: '등록일', key: 'createdAt', width: 20 },
      ];
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      for (const r of reports) {
        ws.addRow({
          id: r.id,
          occurredAt: r.occurredAt ? new Date(r.occurredAt).toLocaleString('ko-KR') : '',
          location: r.location, team: r.team || '', reporter: r.reporter || '',
          accidentType: r.accidentType, riskFactor: r.riskFactor, riskDetail: r.riskDetail || '',
          description: r.description || '', immediateAction: r.immediateAction || '',
          preventionIdea: r.preventionIdea || '', status: r.status || '접수',
          assignedTo: r.assignedTo || '', createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString('ko-KR') : '',
        });
      }
      const buf = await wb.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="near_miss_${new Date().toISOString().slice(0,10)}.xlsx"`);
      res.send(buf);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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

  app.get('/api/new-equipment-requests/unread-count', requireAdmin, async (req: any, res) => {
    try {
      const count = await storage.getUnreadNewEquipmentCount();
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "미확인 건수 조회에 실패했습니다" });
    }
  });

  app.post('/api/new-equipment-requests/mark-all-read', requireAdmin, async (req: any, res) => {
    try {
      await storage.markAllNewEquipmentRequestsRead();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "읽음 처리에 실패했습니다" });
    }
  });

  app.post('/api/new-equipment-requests', isAuthenticated, async (req: any, res) => {
    try {
      const request = await storage.createNewEquipmentRequest({ ...req.body, requestedBy: req.user?.username || req.body.requestedBy || null, isReadByAdmin: false });
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
      broadcastSSE('notice', { action: 'created', id: notice.id, title: notice.title, category: 'notice' });
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
            const pdfjsLib2 = await import('pdfjs-dist/legacy/build/pdf.mjs');
            const pathMod2 = await import('path');
            const workerSrc2 = 'file://' + pathMod2.default.resolve('./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
            (pdfjsLib2 as any).GlobalWorkerOptions.workerSrc = workerSrc2;
            const uint8b = new Uint8Array(pdfBuffer);
            const loadingTask2 = pdfjsLib2.getDocument({ data: uint8b });
            const pdfDoc2 = await loadingTask2.promise;
            let rawText = '';
            for (let p2 = 1; p2 <= pdfDoc2.numPages; p2++) {
              const page2 = await pdfDoc2.getPage(p2);
              const tc2 = await page2.getTextContent();
              rawText += tc2.items.map((it: any) => it.str).join(' ') + '\n';
            }
            pdfText = rawText.trim();
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

  // 차량DB 현황 통계 (대시보드용)
  app.get('/api/vehicles/stats', isAuthenticated, async (req: any, res) => {
    try {
      const list = await storage.getVehicles();
      const active = list.filter((v: any) => v.status === '사용중');
      const inactive = list.filter((v: any) => v.status === '미사용');

      const totalMileage = active.reduce((s: number, v: any) => s + (v.mileage ?? 0), 0);

      // 팀별 현황
      const byTeam: Record<string, { team: string; active: number; inactive: number; totalMileage: number }> = {};
      for (const v of list) {
        const t = (v.team as string) || '미배정';
        if (!byTeam[t]) byTeam[t] = { team: t, active: 0, inactive: 0, totalMileage: 0 };
        if (v.status === '사용중') {
          byTeam[t].active++;
          byTeam[t].totalMileage += v.mileage ?? 0;
        } else {
          byTeam[t].inactive++;
        }
      }

      // 연료 타입별 현황 (사용중만)
      const byFuelType: Record<string, number> = {};
      for (const v of active) {
        const ft = (v.fuelType as string) || '미지정';
        byFuelType[ft] = (byFuelType[ft] ?? 0) + 1;
      }

      // 구입형태별 현황 (사용중만)
      const byAcquisition: Record<string, number> = {};
      for (const v of active) {
        const at = (v.acquisitionType as string) || '미지정';
        byAcquisition[at] = (byAcquisition[at] ?? 0) + 1;
      }

      res.json({
        activeCount: active.length,
        inactiveCount: inactive.length,
        totalCount: list.length,
        totalMileage,
        byTeam: Object.values(byTeam).sort((a, b) => b.active - a.active),
        byFuelType: Object.entries(byFuelType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
        byAcquisition: Object.entries(byAcquisition).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ message: "차량 통계 조회에 실패했습니다" });
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

  app.post('/api/vehicles/bulk-delete', requireEditor, async (req: any, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
    let deleted = 0;
    for (const id of ids) { try { await storage.deleteVehicle(Number(id)); deleted++; } catch {} }
    res.json({ deleted });
  });

  // 차량DB: 엑셀 파일로 전체 교체 (기존 데이터 삭제 후 재등록)
  app.post('/api/vehicles/upload-excel', requireEditor, vehicleExcelUpload.single('file'), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const rows = raw.slice(1).filter((r: any[]) => String(r[0]).trim());

      const { db: dbInst } = await import('./db');
      const { vehicles: vTable } = await import('@shared/schema');

      // 기존 전체 삭제
      await dbInst.delete(vTable);

      let inserted = 0;
      for (const r of rows) {
        const plateNumber = String(r[0]).trim();
        if (!plateNumber) continue;
        await dbInst.insert(vTable).values({
          plateNumber,
          model: String(r[1]).trim() || plateNumber,
          vehicleType: String(r[2]).trim() || '기타',
          contractStart: String(r[4]).trim() || null,
          contractEnd: String(r[5]).trim() || null,
          fuelType: String(r[6]).trim() || null,
          garage: String(r[7]).trim() || null,
          insuranceAge: String(r[8]).trim() || null,
          headquarters: String(r[9]).trim() || null,
          operationsDept: String(r[10]).trim() || null,
          team: String(r[11]).trim() || '미배정',
          driver: String(r[12]).trim() || null,
          secondDriver: String(r[13]).trim() || null,
          workArea: String(r[14]).trim() || null,
          mileage: parseInt(r[16]) || 0,
          year: parseInt(r[17]) || null,
          status: r[20] == 1 ? '사용중' : '미사용',
          acquisitionType: String(r[21]).trim() || null,
        });
        inserted++;
      }
      res.json({ success: true, inserted });
    } catch (e: any) {
      console.error("차량 엑셀 업로드 오류:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // 차량DB: fuel_records에서 차량 메타 자동 임포트 (기존 vehicles 테이블에 없는 것만 추가)
  app.post('/api/vehicles/import-from-fuel', requireAdmin, async (req: any, res) => {
    try {
      const { db: dbInst } = await import('./db');
      const { vehicles: vTable, fuelRecords } = await import('@shared/schema');
      const { eq, sql: sqlExpr } = await import('drizzle-orm');

      // 기존 vehicles 테이블의 차량번호 목록
      const existing = await dbInst.select({ plate: vTable.plateNumber }).from(vTable);
      const existingPlates = new Set(existing.map(e => e.plate));

      // fuel_records에서 distinct 차량 메타 집계 (최신 데이터 기준)
      const allFuelRecs = await storage.getFuelRecords({});
      const metaMap: Record<string, any> = {};
      for (const r of allFuelRecs) {
        if (!r.licensePlate) continue;
        if (!metaMap[r.licensePlate]) {
          metaMap[r.licensePlate] = {
            plateNumber: r.licensePlate,
            vehicleType: r.vehicleType || "기타",
            model: r.modelName || r.licensePlate,
            team: r.team || "미확인팀",
            fuelType: r.fuelType || null,
            acquisitionType: r.acquisitionType || null,
            driver: r.driver || null,
            status: "운행중",
          };
        }
      }

      // 기존에 없는 차량만 삽입
      const toInsert = Object.values(metaMap).filter((v: any) => !existingPlates.has(v.plateNumber));
      let inserted = 0;
      for (const v of toInsert) {
        await dbInst.insert(vTable).values(v).onConflictDoNothing();
        inserted++;
      }

      res.json({ success: true, inserted, total: Object.keys(metaMap).length, skipped: existingPlates.size });
    } catch (e: any) {
      console.error("차량 임포트 오류:", e);
      res.status(500).json({ message: e.message });
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

  app.post('/api/traffic-fines/bulk-delete', isAuthenticated, async (req: any, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: "관리자만 사용할 수 있습니다" });
    const ids: number[] = req.body.ids || [];
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids 필요" });
    try {
      for (const id of ids) { try { await storage.deleteTrafficFine(id); } catch (_) {} }
      res.json({ deleted: ids.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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

  // .eml 파일 업로드 → 하도급 작업계획 이메일 HTML 생성
  const emlUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  function extractEmlText(emlBuffer: Buffer): string {
    const raw = emlBuffer.toString("latin1");
    const texts: string[] = [];
    const parts = raw.split(/\r?\n--[^\r\n]+\r?\n/);
    for (const part of parts) {
      const sepIdx = part.search(/\r?\n\r?\n/);
      if (sepIdx === -1) continue;
      const headerBlock = part.slice(0, sepIdx).toLowerCase();
      const body = part.slice(sepIdx).trim();
      if (!body) continue;
      if (headerBlock.includes("content-transfer-encoding: base64")) {
        const b64 = body.replace(/\s/g, "");
        if (!b64) continue;
        try {
          let decoded = Buffer.from(b64, "base64").toString("utf-8");
          if (headerBlock.includes("text/html") || decoded.trimStart().startsWith("<")) {
            decoded = decoded
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
              .replace(/\s{2,}/g, " ")
              .trim();
          }
          if (decoded.length > 30) texts.push(decoded);
        } catch {}
      } else if (
        headerBlock.includes("text/plain") ||
        headerBlock.includes("text/html")
      ) {
        let text = body;
        if (headerBlock.includes("text/html")) {
          text = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }
        if (text.length > 30) texts.push(text);
      }
    }
    if (texts.length === 0) {
      const fallback = raw
        .replace(/^[^\n]*\n/gm, l => l.includes(":") ? "" : l)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (fallback.length > 30) texts.push(fallback);
    }
    return texts.join("\n\n");
  }

  function stripPhoneNumbers(text: string): string {
    return text
      .replace(/\d{2,4}-\d{3,4}-\d{4}/g, "")
      .replace(/\d{10,11}/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function buildSubcontractHtml(displayDate: string, company: string, items: any[], guideB64: string): string {
    const thStyle = `border:1px solid #999;padding:7px 10px;background:#f0f0f0;white-space:nowrap;font-size:13px;text-align:center;font-weight:bold`;
    const tdStyle = `border:1px solid #999;padding:7px 10px;font-size:13px;white-space:nowrap`;
    const cols = ["부서", "작업자(협력사)", "공사내용", "작업시작", "작업종료", "국소명", "주소", "MOS감독자"];
    const theadHtml = `<tr>${cols.map(c => `<th style="${thStyle}">${c}</th>`).join("")}</tr>`;
    const tbodyHtml = items.map(item => {
      const [startTime = "", endTime = ""] = (item.time || "~").split("~");
      const region = (item.region || "").trim();
      const regionLabel = region ? (region.endsWith("운용팀") ? region : `${region}운용팀`) : "";
      const workersClean = (item.workers || [])
        .map((w: string) => stripPhoneNumbers(w))
        .filter(Boolean)
        .join("<br>");
      const supervisorClean = stripPhoneNumbers(item.supervisor || "");
      const cells = [
        regionLabel,
        workersClean,
        item.workType || "",
        startTime.trim(),
        endTime.trim(),
        item.locationName || "",
        item.address || "",
        supervisorClean,
      ];
      return `<tr>${cells.map(c => `<td style="${tdStyle}">${c}</td>`).join("")}</tr>`;
    }).join("");

    const imgHtml = guideB64
      ? `<br><br><div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><img src="data:image/jpeg;base64,${guideB64}" style="min-width:700px;max-width:900px;width:100%;border:1px solid #ddd;display:block" alt="TBM 활동 사진 등록 가이드" /></div>`
      : "";
    const p = (text: string, opts?: string) => `<p style="margin:3px 0;font-family:맑은고딕,sans-serif;font-size:12pt;line-height:1.6;${opts || ""}">${text}</p>`;
    return [
      `<div style="font-family:맑은고딕,sans-serif;font-size:12pt;line-height:1.6;color:#111">`,
      p("안녕하십니까 현장경영팀입니다."),
      `<p style="margin:8px 0"></p>`,
      p(`${displayDate} ${company} 하도급 작업 내 TBM 실시 및 순회점검 등록 요청드립니다.`),
      `<p style="margin:8px 0"></p>`,
      p("순회점검 등록방법 확인 필요 시 첨부파일 참조 부탁드리며, TBM 및 순회점검 등록사진 예시 참조하시어 등록 부탁드립니다."),
      `<p style="margin:8px 0"></p>`,
      p("★입회자 변경, 작업취소 등 변경사항 있으시면 연락 부탁드립니다.★", "color:#cc0000;font-weight:bold"),
      `<p style="margin:8px 0"></p>`,
      p("문의사항 있으시면 연락 부탁드립니다."),
      `<p style="margin:8px 0"></p>`,
      p("감사합니다"),
      `<p style="margin:16px 0"></p>`,
      `<p style="margin:8px 0 6px;font-family:맑은고딕,sans-serif;font-size:12pt;font-weight:bold">※ ${displayDate} ${company} 작업계획</p>`,
      `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">`,
      `<table style="border-collapse:collapse;border-spacing:0;font-family:맑은고딕,sans-serif;font-size:13px;background:#fff;table-layout:auto;overflow-wrap:break-word">`,
      `<thead>${theadHtml}</thead>`,
      `<tbody>${tbodyHtml}</tbody>`,
      `</table>`,
      `</div>`,
      imgHtml,
      `</div>`,
    ].join("\n");
  }

  app.post('/api/work-plans/parse-subcontract-email', isAuthenticated, emlUpload.single("emlFile"), async (req: any, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: ".eml 파일을 업로드해주세요." });
      }

      const emailText = extractEmlText(file.buffer);
      if (!emailText || emailText.trim().length < 20) {
        return res.status(400).json({ message: "이메일 내용을 추출할 수 없습니다. 파일 형식을 확인해주세요." });
      }

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const systemPrompt = `당신은 하도급 업체가 보낸 작업일정 이메일을 파싱하는 전문 AI입니다.

이메일에서 아래 정보를 추출하세요:
- 발신 업체명 (예: 스피드이엔지)
- 작업일자 (예: 26.04.06)
- 지역별 작업 목록

아래 형식의 JSON만 반환하세요 (마크다운 없이, 코드블록 없이):
{
  "company": "업체명",
  "workDate": "YY.MM.DD",
  "items": [
    {
      "region": "지역명(예: 포항)",
      "workType": "작업내용(공사내용)",
      "time": "HH:MM~HH:MM",
      "locationName": "국소명",
      "address": "주소",
      "workers": ["이름(직책/연락처)"],
      "supervisor": "MOS감독자 이름/연락처"
    }
  ]
}

workers 배열은 실제 작업자 명단이며, supervisor는 KT/KTMOS 측 감독자입니다.
지역명이 없으면 빈 문자열로 두세요.`;

      const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `다음 하도급 업체 작업일정 이메일을 파싱해주세요:\n\n${emailText.slice(0, 8000)}` }
        ],
        temperature: 0,
        max_tokens: 3000,
      });

      const rawJson = response.choices[0].message.content?.trim() || "{}";
      let parsed: any = {};
      try {
        const cleaned = rawJson.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(500).json({ message: "AI 파싱에 실패했습니다. .eml 파일 형식을 확인해주세요." });
      }

      const workDate = parsed.workDate || "";
      const fullDate = workDate.startsWith("20") ? workDate : workDate ? `20${workDate}` : "";
      const DAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];
      let displayDate = fullDate || workDate;
      if (fullDate && fullDate.match(/\d{4}\.\d{2}\.\d{2}/)) {
        const [y, m, d] = fullDate.split(".").map(Number);
        const dt = new Date(y, m - 1, d);
        displayDate = `${fullDate}(${DAYS_KR[dt.getDay()]})`;
      }

      const company = parsed.company || "하도급 업체";
      const items: any[] = parsed.items || [];
      const subject = `[요청] ${displayDate} 입회작업 TBM / 순회점검 등록요청`;

      // 가이드 이미지 base64
      let guideB64 = "";
      try {
        const { readFileSync } = await import("fs");
        const { join } = await import("path");
        const imgPath = join(process.cwd(), "attached_assets", "TBM,순회점검_사진등록_안내_1775540706148.jpg");
        guideB64 = readFileSync(imgPath).toString("base64");
      } catch {}

      const htmlDraft = buildSubcontractHtml(displayDate, company, items, guideB64);

      // DB에 초안 저장
      try {
        await storage.createWorkPlan({
          title: `${company} ${displayDate} 작업계획`,
          originalFileName: file.originalname || null,
          originalFileUrl: null,
          processedFileUrl: null,
          emailDraft: htmlDraft,
          sheetSummary: `총 ${items.length}건`,
          createdBy: (req as any).user?.username || null,
        });
      } catch (saveErr) {
        console.error("[parse-subcontract-email] DB 저장 실패:", saveErr);
      }

      res.json({ parsed, htmlDraft, subject, itemCount: items.length });
    } catch (error: any) {
      console.error("[parse-subcontract-email error]", error);
      res.status(500).json({ message: error?.message || "처리에 실패했습니다." });
    }
  });

  // Gmail IMAP - 받은편지함 최근 목록
  app.get('/api/work-plans/list-gmail', isAuthenticated, async (req: any, res) => {
    try {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        auth: { user: "fbwogk26@gmail.com", pass: process.env.GMAIL_APP_PASSWORD },
        logger: false,
      });
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      const emails: any[] = [];
      try {
        const total = (client.mailbox as any).exists as number;
        if (total > 0) {
          const start = Math.max(1, total - 29);
          for await (const msg of client.fetch(`${start}:${total}`, { envelope: true, uid: true })) {
            emails.push({
              uid: msg.uid,
              seq: msg.seq,
              subject: msg.envelope?.subject || "(제목 없음)",
              from: msg.envelope?.from?.[0]?.name || msg.envelope?.from?.[0]?.address || "",
              fromAddr: msg.envelope?.from?.[0]?.address || "",
              date: msg.envelope?.date,
            });
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
      res.json({ emails: emails.reverse().slice(0, 20) });
    } catch (error: any) {
      console.error("[list-gmail error]", error);
      res.status(500).json({ message: error?.message || "Gmail 연결에 실패했습니다." });
    }
  });

  // Gmail IMAP - 특정 이메일 처리 → 초안 생성
  app.post('/api/work-plans/process-gmail', isAuthenticated, async (req: any, res) => {
    try {
      const { uid } = req.body;
      if (!uid) return res.status(400).json({ message: "uid가 필요합니다." });

      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        auth: { user: "fbwogk26@gmail.com", pass: process.env.GMAIL_APP_PASSWORD },
        logger: false,
      });
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      let rawBuffer: Buffer | null = null;
      try {
        const msg = await client.fetchOne(`${uid}`, { source: true }, { uid: true });
        rawBuffer = msg.source as Buffer;
      } finally {
        lock.release();
      }
      await client.logout();

      if (!rawBuffer) return res.status(404).json({ message: "이메일을 찾을 수 없습니다." });

      const emailText = extractEmlText(rawBuffer);
      if (!emailText || emailText.trim().length < 20) {
        return res.status(400).json({ message: "이메일 내용을 추출할 수 없습니다." });
      }

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const systemPrompt = `당신은 하도급 업체가 보낸 작업일정 이메일을 파싱하는 전문 AI입니다.

이메일에서 아래 정보를 추출하세요:
- 발신 업체명 (예: 스피드이엔지)
- 작업일자 (예: 26.04.06)
- 지역별 작업 목록

아래 형식의 JSON만 반환하세요 (마크다운 없이, 코드블록 없이):
{
  "company": "업체명",
  "workDate": "YY.MM.DD",
  "items": [
    {
      "region": "지역명(예: 포항)",
      "workType": "작업내용(공사내용)",
      "time": "HH:MM~HH:MM",
      "locationName": "국소명",
      "address": "주소",
      "workers": ["이름(직책/연락처)"],
      "supervisor": "MOS감독자 이름/연락처"
    }
  ]
}

workers 배열은 실제 작업자 명단이며, supervisor는 KT/KTMOS 측 감독자입니다.
지역명이 없으면 빈 문자열로 두세요.`;

      const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `다음 하도급 업체 작업일정 이메일을 파싱해주세요:\n\n${emailText.slice(0, 8000)}` }
        ],
        temperature: 0,
        max_tokens: 3000,
      });

      const rawJson = response.choices[0].message.content?.trim() || "{}";
      let parsed: any = {};
      try {
        const cleaned = rawJson.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(500).json({ message: "AI 파싱에 실패했습니다." });
      }

      const workDate = parsed.workDate || "";
      const fullDate = workDate.startsWith("20") ? workDate : workDate ? `20${workDate}` : "";
      const DAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];
      let displayDate = fullDate || workDate;
      if (fullDate && fullDate.match(/\d{4}\.\d{2}\.\d{2}/)) {
        const [y, m, d] = fullDate.split(".").map(Number);
        const dt = new Date(y, m - 1, d);
        displayDate = `${fullDate}(${DAYS_KR[dt.getDay()]})`;
      }

      const company = parsed.company || "하도급 업체";
      const items: any[] = parsed.items || [];
      const subject = `[요청] ${displayDate} 입회작업 TBM / 순회점검 등록요청`;

      let guideB64 = "";
      try {
        const { readFileSync } = await import("fs");
        const { join } = await import("path");
        const imgPath = join(process.cwd(), "attached_assets", "TBM,순회점검_사진등록_안내_1775540706148.jpg");
        guideB64 = readFileSync(imgPath).toString("base64");
      } catch {}

      const htmlDraft = buildSubcontractHtml(displayDate, company, items, guideB64);

      // DB에 초안 저장
      try {
        await storage.createWorkPlan({
          title: `${company} ${displayDate} 작업계획`,
          originalFileName: null,
          originalFileUrl: null,
          processedFileUrl: null,
          emailDraft: htmlDraft,
          sheetSummary: `총 ${items.length}건`,
          createdBy: (req as any).user?.username || null,
        });
      } catch (saveErr) {
        console.error("[process-gmail] DB 저장 실패:", saveErr);
      }

      res.json({ parsed, htmlDraft, subject, itemCount: items.length });
    } catch (error: any) {
      console.error("[process-gmail error]", error);
      res.status(500).json({ message: error?.message || "처리에 실패했습니다." });
    }
  });

  // 이메일 직접 발송
  app.post('/api/work-plans/send-email', isAuthenticated, async (req: any, res) => {
    try {
      const { subject, htmlDraft, to } = req.body;
      if (!subject || !htmlDraft || !to) {
        return res.status(400).json({ message: "제목, 본문, 수신자가 필요합니다." });
      }
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        service: "gmail",
        auth: {
          user: "fbwogk26@gmail.com",
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });
      // 모바일 대응: viewport 메타태그가 포함된 완전한 HTML 문서로 래핑
      const mobileReadyHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin:16px 20px; padding:0; font-family:맑은고딕,Arial,sans-serif; }
  img { max-width:100% !important; width:100% !important; height:auto !important; display:block; }
</style>
</head>
<body>
${htmlDraft}
</body>
</html>`;
      await transporter.sendMail({
        from: '"현장경영팀" <fbwogk26@gmail.com>',
        to,
        subject,
        html: mobileReadyHtml,
      });
      res.json({ success: true, message: `${to}로 발송 완료` });
    } catch (error: any) {
      console.error("[send-email error]", error);
      res.status(500).json({ message: error?.message || "발송에 실패했습니다." });
    }
  });

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

  app.post('/api/work-plans/bulk-delete', isAuthenticated, async (req: any, res) => {
    const ids: number[] = req.body.ids || [];
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids 필요" });
    try {
      for (const id of ids) { try { await storage.deleteWorkPlan(id); } catch (_) {} }
      res.json({ deleted: ids.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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

      // Max 10 songs limit
      const existing = await storage.getMusicFiles();
      if (existing.length >= 10) {
        return res.status(400).json({ message: "음악은 최대 10개까지만 등록할 수 있습니다. 기존 파일을 삭제 후 업로드해주세요." });
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
      // 팀별 연도-월별
      const byTeamByYearMonth: Record<string, { team: string; year: number; month: number; fuelCost: number; distance: number }> = {};
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

        // 팀별 연도-월별
        const tymk = `${team}__${r.year}__${r.month}`;
        if (!byTeamByYearMonth[tymk]) byTeamByYearMonth[tymk] = { team, year: r.year, month: r.month, fuelCost: 0, distance: 0 };
        byTeamByYearMonth[tymk].fuelCost += fuelCost;
        byTeamByYearMonth[tymk].distance += r.totalDistance ?? 0;

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
        byTeamByYearMonth: Object.values(byTeamByYearMonth).sort((a, b) => a.year - b.year || a.month - b.month),
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

  // POST /api/fuel-records/upload-vehicle-log
  // 차량일지 형식 (행=개별 운행기록, 차량번호+출발시간+시작km+종료km+주유금액) 파싱
  // 파일명/시트명에서 "26년 3월" 형식 자동 인식. 연월 수동 지정도 가능.
  app.post("/api/fuel-records/upload-vehicle-log", requireAdmin, fuelUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다." });

      // 파일명 또는 시트명에서 연도/월 자동 파싱 ("차량일지_26년_3월", "26년 3월" 등)
      const parseYearMonth = (str: string): { year: number; month: number } | null => {
        const m = str.replace(/_/g, " ").match(/(\d{2,4})년\s*(\d{1,2})월/);
        if (!m) return null;
        const yr = parseInt(m[1]);
        return { year: yr < 100 ? 2000 + yr : yr, month: parseInt(m[2]) };
      };

      const manualYear  = req.body?.year  ? parseInt(req.body.year)  : null;
      const manualMonth = req.body?.month ? parseInt(req.body.month) : null;

      const XLSX = await import("xlsx");
      const wb   = XLSX.read(req.file.buffer, { type: "buffer" });
      const batchId = `batch_${Date.now()}`;

      // 1) vehicles 테이블 우선 조회 (차량DB 탭에서 관리하는 데이터)
      const allVehicles = await storage.getVehicles();
      const vehicleMeta: Record<string, { team: string | null; fuelType: string | null; acquisitionType: string | null; vehicleType: string | null; modelName: string | null; driver: string | null }> = {};
      for (const v of allVehicles) {
        if (v.plateNumber && !vehicleMeta[v.plateNumber]) {
          vehicleMeta[v.plateNumber] = {
            team: v.team,
            fuelType: v.fuelType,
            acquisitionType: v.acquisitionType,
            vehicleType: v.vehicleType,
            modelName: v.model,
            driver: v.driver,
          };
        }
      }

      // 2) fuel_records에서 vehicles 테이블에 없는 차량 보완
      const allRecords = await storage.getFuelRecords({});
      for (const r of allRecords) {
        if (r.licensePlate && !vehicleMeta[r.licensePlate]) {
          vehicleMeta[r.licensePlate] = {
            team: r.team,
            fuelType: r.fuelType,
            acquisitionType: r.acquisitionType,
            vehicleType: r.vehicleType,
            modelName: r.modelName,
            driver: r.driver,
          };
        }
      }

      // 3) 대차 역방향 매핑: "대차/xxx(차량번호)" 패턴에서 괄호 안 번호 → 팀 매핑
      const rentalReverse: Record<string, typeof vehicleMeta[string]> = {};
      for (const r of allRecords) {
        if (r.licensePlate) {
          const m = r.licensePlate.match(/\(([^)]+)\)/);
          if (m) {
            const rentalPlate = m[1].replace(/\s/g, "");
            if (!rentalReverse[rentalPlate]) {
              rentalReverse[rentalPlate] = {
                team: r.team,
                fuelType: r.fuelType,
                acquisitionType: r.acquisitionType,
                vehicleType: r.vehicleType,
                modelName: r.modelName,
                driver: r.driver,
              };
            }
          }
        }
      }

      // 차량일지 시트 1장 파싱 (행=운행기록): 차량별 집계 → year/month 기준 필터
      // 컬럼: key(0) 운행목적(1) 사용용도(2) 차량번호(3) 출발시간(4) 종료시간(5)
      //        운행일자(6) 시작km(7) 출발지(8) 종료km(9) 종료지(10) 경유지(11)
      //        주유량(12) 주유금액(13) 탑승자(14)
      const parseSheet = (rows: any[][], year: number, month: number) => {
        const targetYM = `${year}-${String(month).padStart(2, "0")}`;
        const agg: Record<string, { dist: number; fuelCost: number; driver: string }> = {};

        // 헤더 행 탐색
        let headerIdx = 0;
        for (let hi = 0; hi < Math.min(rows.length, 5); hi++) {
          const txt = rows[hi].map((c: any) => String(c ?? "")).join("|");
          if (txt.includes("차량번호") || txt.includes("출발시간")) { headerIdx = hi; break; }
        }
        const header = rows[headerIdx];
        // 컬럼 위치를 헤더에서 찾거나 고정값(첨부 파일 기준) 사용
        const findC = (names: string[]) => {
          for (let ci = 0; ci < header.length; ci++) {
            const cell = String(header[ci] ?? "").replace(/\s/g, "");
            if (names.some(n => cell.includes(n))) return ci;
          }
          return -1;
        };
        const colPlate  = findC(["차량번호"]);
        const colDeparture = findC(["출발시간"]);
        const colStartKm   = findC(["시작km", "시작Km", "출발km"]);
        const colEndKm     = findC(["종료km", "종료Km", "도착km"]);
        const colFuel      = findC(["주유금액", "주유비", "연료비"]);
        const colDriver    = findC(["탑승자", "운전자", "사용자"]);

        // 컬럼 인덱스 기본값 (첨부 파일 형식 기준)
        const cPlate   = colPlate >= 0     ? colPlate     : 3;
        const cDepart  = colDeparture >= 0 ? colDeparture : 4;
        const cStartKm = colStartKm >= 0   ? colStartKm   : 7;
        const cEndKm   = colEndKm >= 0     ? colEndKm     : 9;
        const cFuel    = colFuel >= 0      ? colFuel      : 13;
        const cDriver  = colDriver >= 0    ? colDriver     : 14;

        for (let ri = headerIdx + 1; ri < rows.length; ri++) {
          const row = rows[ri];
          const plate = String(row[cPlate] ?? "").replace(/\s/g, "");
          if (!plate || plate.length < 4) continue;

          // 출발시간 기반 월 필터 (Date 객체 또는 "YYYY-MM-..." 문자열 모두 처리)
          const depVal = row[cDepart];
          let depYear: number | null = null;
          let depMonth: number | null = null;
          if (depVal instanceof Date) {
            depYear  = depVal.getFullYear();
            depMonth = depVal.getMonth() + 1;
          } else {
            const depStr = String(depVal ?? "");
            const dm = depStr.match(/^(\d{4})-(\d{1,2})/);
            if (dm) { depYear = parseInt(dm[1]); depMonth = parseInt(dm[2]); }
          }
          if (depYear !== year || depMonth !== month) continue;

          const num = (v: any) => typeof v === "number" ? v : (parseFloat(String(v ?? "0").replace(/,/g, "")) || 0);
          const dist = Math.max(0, Math.round(num(row[cEndKm]) - num(row[cStartKm])));
          const fuel = Math.round(num(row[cFuel]));
          const driver = String(row[cDriver] ?? "").trim();

          if (!agg[plate]) agg[plate] = { dist: 0, fuelCost: 0, driver: "" };
          agg[plate].dist += dist;
          agg[plate].fuelCost += fuel;
          if (driver && !agg[plate].driver) agg[plate].driver = driver;
        }
        return agg;
      };

      const allRecordsToInsert: any[] = [];
      const processedYMs: Set<string> = new Set();
      const skippedVehicles: string[] = [];

      // ─── 다중시트: 시트명에 "26년 3월" 형식 포함 ───
      // ─── 단일시트: 파일명에 "26년 3월" 또는 수동 지정 ───
      for (const sheetName of wb.SheetNames) {
        // 연월 결정: 수동 → 시트명 → 파일명
        let ym: { year: number; month: number } | null = null;
        if (manualYear && manualMonth) {
          ym = { year: manualYear, month: manualMonth };
        } else {
          ym = parseYearMonth(sheetName) ?? parseYearMonth(req.file.originalname);
        }
        if (!ym) continue;

        const ws   = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", cellDates: true });
        if (rows.length < 2) continue;

        const agg = parseSheet(rows, ym.year, ym.month);
        const ymKey = `${ym.year}-${ym.month}`;
        processedYMs.add(ymKey);

        for (const [plate, v] of Object.entries(agg)) {
          if (v.dist === 0 && v.fuelCost === 0) continue;
          // 1순위: 직접 매핑, 2순위: 대차 역방향 매핑, 3순위: 미확인팀으로 포함
          const meta = vehicleMeta[plate] ?? rentalReverse[plate] ?? null;
          const team = meta?.team ?? "미확인팀";
          if (!meta) skippedVehicles.push(plate); // 팀 미확인 기록 (제외하지 않음)
          allRecordsToInsert.push({
            year: ym.year,
            month: ym.month,
            team,
            driver: v.driver || meta?.driver || null,
            licensePlate: plate,
            fuelType: meta?.fuelType ?? null,
            acquisitionType: meta?.acquisitionType ?? "렌트",
            vehicleType: meta?.vehicleType ?? null,
            modelName: meta?.modelName ?? null,
            totalDistance: v.dist,
            businessDistance: v.dist,
            cardFuelCost: 0,
            cardHighpass: 0, cardParking: 0, cardToll: 0, cardCarWash: 0, cardFerry: 0,
            cardRepair: 0, cardMaintenance: 0, cardEmergencyFuel: 0, cardGeneratorFuel: 0,
            cashFuelCost: v.fuelCost,
            cashHighpass: 0, cashParking: 0, cashToll: 0, cashCarWash: 0, cashFerry: 0,
            cashRepair: 0, cashMaintenance: 0, cashEmergencyFuel: 0, cashGeneratorFuel: 0,
            totalCost: v.fuelCost,
            avgCostPerKm: v.dist > 0 ? Math.round(v.fuelCost / v.dist) : 0,
            avgOperatingDays: 0,
            uploadBatch: batchId,
          });
        }
      }

      if (allRecordsToInsert.length === 0) {
        if (processedYMs.size === 0) {
          return res.status(400).json({
            message: "연월을 인식할 수 없습니다. 업로드 폼에서 연도와 월을 직접 선택 후 다시 업로드해주세요.",
          });
        }
        const ymLabel = [...processedYMs].map(k => { const [y,m] = k.split("-"); return `${y}년 ${m}월`; }).join(", ");
        return res.status(400).json({
          message: `${ymLabel} 데이터를 처리했으나 저장할 차량이 없습니다. 기존 DB에 등록된 차량이어야 팀 정보를 자동 매핑할 수 있습니다. (미인식 차량 ${skippedVehicles.length}대: ${skippedVehicles.slice(0, 5).join(", ")}${skippedVehicles.length > 5 ? " 외 " + (skippedVehicles.length - 5) + "대" : ""})`,
        });
      }

      // 해당 연월 기존 데이터 삭제 후 재삽입
      for (const ymKey of processedYMs) {
        const [yr, mo] = ymKey.split("-").map(Number);
        await storage.deleteFuelRecordsByYearMonth(yr, mo);
      }
      const inserted = await storage.insertFuelRecords(allRecordsToInsert);
      const ymLabels = [...processedYMs].map(k => { const [y,m]=k.split("-"); return `${y}년 ${m}월`; });
      res.json({
        success: true,
        batchId,
        inserted,
        unknownVehicles: skippedVehicles.length,
        unknownPlates: skippedVehicles,
        yearMonths: ymLabels,
        message: `${inserted}건 처리 완료 — ${ymLabels.join(", ")} 차량일지 반영${skippedVehicles.length ? ` (팀미확인 ${skippedVehicles.length}대 "미확인팀"으로 포함: ${skippedVehicles.join(", ")})` : ""}`,
      });
    } catch (e: any) {
      console.error("차량일지 업로드 오류:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ── 안전관리자 상태보고서 ────────────────────────────────────
  app.get('/api/safety-manager-reports', isAuthenticated, async (req: any, res) => {
    try {
      const yearMonth = req.query.yearMonth as string | undefined;
      const year = req.query.year as string | undefined;
      res.json(await storage.getSafetyManagerReports(yearMonth, year));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 보고서 파일 다운로드 프록시 (object storage → 브라우저)
  async function proxyReportFile(fileUrl: string | null, fileOriginalName: string | null, res: any, inline = false) {
    if (!fileUrl) return res.status(404).json({ message: "파일 없음" });
    try {
      if (fileUrl.startsWith('/objects/')) {
        const privateDir = process.env.PRIVATE_OBJECT_DIR;
        if (privateDir) {
          const filename = fileUrl.split('/').pop()!;
          const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${filename}`;
          const parts = fullPath.replace(/^\//, "").split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");
          const [buffer] = await objectStorageClient.bucket(bucketName).file(objectName).download();
          const ext = path.extname(filename).toLowerCase();
          const mimeMap: Record<string, string> = {
            '.pdf': 'application/pdf', '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.hwp': 'application/x-hwp', '.hwpx': 'application/x-hwp',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel',
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
          };
          const contentType = mimeMap[ext] || 'application/octet-stream';
          const safeFilename = encodeURIComponent(fileOriginalName || filename);
          res.setHeader('Content-Type', contentType);
          if (inline) {
            res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeFilename}`);
          } else {
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}`);
          }
          return res.send(buffer);
        }
      }
      // local uploads 폴백
      const localPath = path.join(uploadDir, fileUrl.split('/').pop()!);
      if (fs.existsSync(localPath)) return res.sendFile(localPath);
      res.status(404).json({ message: "파일을 찾을 수 없습니다" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  }

  app.post('/api/safety-manager-reports', requireEditor, reportUpload.single('file'), async (req: any, res) => {
    try {
      const { visitDate, team, visitSequence } = req.body;
      if (!visitDate || !team) return res.status(400).json({ message: "필수 항목 누락" });
      // visitDate 기준으로 yearMonth 자동 계산 (클라이언트 전송값 무시)
      const derivedYearMonth = visitDate.substring(0, 7);
      let fileUrl: string | null = null;
      let fileOriginalName: string | null = null;
      if (req.file) {
        const origName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(origName) || '.bin';
        const filename = `safety-mgr-${Date.now()}${ext}`;
        const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
        if (objUrl) { fileUrl = objUrl; } else {
          fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
          fileUrl = `/uploads/${filename}`;
        }
        fileOriginalName = origName;
      }
      const report = await storage.createSafetyManagerReport({
        yearMonth: derivedYearMonth, visitDate, team,
        visitSequence: parseInt(visitSequence) || 1,
        safetyManagerName: null, reportContent: null,
        fileUrl, fileOriginalName,
        notes: null,
        createdBy: req.user?.id?.toString() || null,
      });
      res.json(report);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch('/api/safety-manager-reports/:id', requireEditor, reportUpload.single('file'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { visitDate, team, visitSequence } = req.body;
      // visitDate 기준으로 yearMonth 자동 계산
      const derivedYearMonth = visitDate ? visitDate.substring(0, 7) : undefined;
      const updates: any = { visitDate, team, visitSequence: parseInt(visitSequence) || 1 };
      if (derivedYearMonth) updates.yearMonth = derivedYearMonth;
      if (req.file) {
        const origName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(origName) || '.bin';
        const filename = `safety-mgr-${Date.now()}${ext}`;
        const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
        updates.fileUrl = objUrl ?? `/uploads/${filename}`;
        updates.fileOriginalName = origName;
        if (!objUrl) fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      }
      res.json(await storage.updateSafetyManagerReport(id, updates));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/safety-manager-reports/:id/file', isAuthenticated, async (req: any, res) => {
    try {
      const reports = await storage.getSafetyManagerReports();
      const report = reports.find((r: any) => r.id === parseInt(req.params.id));
      if (!report) return res.status(404).json({ message: "보고서 없음" });
      await proxyReportFile(report.fileUrl, report.fileOriginalName, res, req.query.inline === 'true');
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/safety-manager-reports/:id', requireEditor, async (req: any, res) => {
    try {
      await storage.deleteSafetyManagerReport(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── 보건관리자 상태보고서 ────────────────────────────────────
  app.get('/api/health-manager-reports', isAuthenticated, async (req: any, res) => {
    try {
      const yearMonth = req.query.yearMonth as string | undefined;
      const year = req.query.year as string | undefined;
      res.json(await storage.getHealthManagerReports(yearMonth, year));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/health-manager-reports', requireEditor, reportUpload.single('file'), async (req: any, res) => {
    try {
      const { visitDate, staffType, team } = req.body;
      if (!visitDate || !staffType) return res.status(400).json({ message: "필수 항목 누락" });
      // visitDate 기준으로 yearMonth 자동 계산 (클라이언트 전송값 무시)
      const derivedYearMonth = visitDate.substring(0, 7);
      let fileUrl: string | null = null;
      let fileOriginalName: string | null = null;
      if (req.file) {
        const origName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(origName) || '.bin';
        const filename = `health-mgr-${Date.now()}${ext}`;
        const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
        if (objUrl) { fileUrl = objUrl; } else {
          fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
          fileUrl = `/uploads/${filename}`;
        }
        fileOriginalName = origName;
      }
      const report = await storage.createHealthManagerReport({
        yearMonth: derivedYearMonth, visitDate, staffType,
        team: team || null,
        staffName: null, reportContent: null,
        fileUrl, fileOriginalName,
        notes: null,
        createdBy: req.user?.id?.toString() || null,
      });
      res.json(report);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch('/api/health-manager-reports/:id', requireEditor, reportUpload.single('file'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { visitDate, staffType, team } = req.body;
      // visitDate 기준으로 yearMonth 자동 계산
      const derivedYearMonth = visitDate ? visitDate.substring(0, 7) : undefined;
      const updates: any = { visitDate, staffType, team: team || null };
      if (derivedYearMonth) updates.yearMonth = derivedYearMonth;
      if (req.file) {
        const origName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(origName) || '.bin';
        const filename = `health-mgr-${Date.now()}${ext}`;
        const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
        updates.fileUrl = objUrl ?? `/uploads/${filename}`;
        updates.fileOriginalName = origName;
        if (!objUrl) fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      }
      res.json(await storage.updateHealthManagerReport(id, updates));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/health-manager-reports/:id/file', isAuthenticated, async (req: any, res) => {
    try {
      const reports = await storage.getHealthManagerReports();
      const report = reports.find((r: any) => r.id === parseInt(req.params.id));
      if (!report) return res.status(404).json({ message: "보고서 없음" });
      await proxyReportFile(report.fileUrl, report.fileOriginalName, res, req.query.inline === 'true');
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/health-manager-reports/:id', requireEditor, async (req: any, res) => {
    try {
      await storage.deleteHealthManagerReport(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── PDF 텍스트 추출 공통 함수 (pdf-parse v2 사용 — 배포 환경 호환) ─
  async function extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const { PDFParse } = await import('pdf-parse');
      // pdf-parse v2: PDFParse는 클래스 — { data: buffer } 옵션으로 생성 후 getText() 호출
      const parser = new (PDFParse as any)({ data: buffer });
      const result = await parser.getText();
      const text: string = result?.text ?? result?.pages?.map((p: any) => p.text ?? "").join("\n") ?? "";
      if (!text || text.trim().length < 5) throw new Error("텍스트 없음");
      return text;
    } catch (e: any) {
      throw new Error(`PDF 텍스트 추출 실패: ${e.message}`);
    }
  }

  // ─── 안전관리자 상태보고서 PDF AI 분석 ────────────────────────────
  app.post('/api/safety-manager-reports/analyze-pdf', requireEditor, reportUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "PDF 파일이 없습니다" });
      const pdfText = await extractPdfText(req.file.buffer);
      if (!pdfText || pdfText.trim().length < 10) {
        return res.status(400).json({ message: "PDF에서 텍스트를 추출할 수 없습니다" });
      }

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const aiRes = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `당신은 산업안전관리 전문가입니다. 안전관리상태보고서 PDF 텍스트에서 핵심 정보를 추출합니다.
다음 JSON 형식으로만 응답하세요(코드블록 없이):
{
  "visitDate": "YYYY-MM-DD 형식의 점검일자, 없으면 null",
  "team": "팀명(예: 남대구운용팀), 괄호 안 팀명 추출, 없으면 null",
  "safetyManagerName": "수행요원 이름(서명란 위 이름), 없으면 null",
  "reportContent": "기술지도 내용 요약(①②③④ 항목들을 한국어로 200자 이내 요약)",
  "workerCount": "근로자수 숫자, 없으면 null",
  "notes": "기타 특이사항 또는 중점 위험요인 요약, 없으면 null"
}`
          },
          {
            role: "user",
            content: `다음 안전관리상태보고서 텍스트에서 정보를 추출해주세요:\n\n${pdfText.slice(0, 6000)}`
          }
        ],
        temperature: 0.1,
        max_tokens: 800,
      });

      const raw = aiRes.choices[0].message.content?.trim() || '{}';
      const data = JSON.parse(raw);
      res.json({ success: true, data });
    } catch (e: any) {
      console.error('안전관리자 PDF 분석 오류:', e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // ─── 보건관리자 상태보고서 PDF AI 분석 ────────────────────────────
  app.post('/api/health-manager-reports/analyze-pdf', requireEditor, reportUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "PDF 파일이 없습니다" });
      const pdfText = await extractPdfText(req.file.buffer);
      if (!pdfText || pdfText.trim().length < 10) {
        return res.status(400).json({ message: "PDF에서 텍스트를 추출할 수 없습니다" });
      }

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const aiRes = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `당신은 산업보건관리 전문가입니다. 보건관리상태보고서 PDF 텍스트에서 핵심 정보를 추출합니다.
다음 JSON 형식으로만 응답하세요(코드블록 없이):
{
  "visitDate": "YYYY-MM-DD 형식의 방문일자, 없으면 null",
  "nextVisitDate": "YYYY-MM-DD 형식의 차기방문 예정일, 없으면 null",
  "staffType": "직종(간호사/의사/위생기사 중 하나), 없으면 null",
  "staffName": "보건관리자 성명, 없으면 null",
  "workerCount": "근로자 계약인원 숫자, 없으면 null",
  "reportContent": "업무수행내용 요약(안전보건교육, 건강진단, 건강상담 등 주요 내용 200자 이내)",
  "healthConsultCount": "건강상담 실시 인원수, 없으면 null",
  "notes": "준비 및 특기사항, 없으면 null"
}`
          },
          {
            role: "user",
            content: `다음 보건관리상태보고서 텍스트에서 정보를 추출해주세요:\n\n${pdfText.slice(0, 6000)}`
          }
        ],
        temperature: 0.1,
        max_tokens: 800,
      });

      const raw = aiRes.choices[0].message.content?.trim() || '{}';
      const data = JSON.parse(raw);
      res.json({ success: true, data });
    } catch (e: any) {
      console.error('보건관리자 PDF 분석 오류:', e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // ─── 스피드이엔지 자동 이메일 잡 상태/트리거 ──────────────────────
  app.get('/api/auto-email/status', isAuthenticated, async (_req, res) => {
    const { getAutoJobStatus } = await import('./autoEmailJob');
    res.json(getAutoJobStatus());
  });

  app.post('/api/auto-email/run-now', requireEditor, async (_req, res) => {
    const { runSpeedEngAutoJob, getAutoJobStatus } = await import('./autoEmailJob');
    runSpeedEngAutoJob().catch(console.error);
    res.json({ message: "수동 실행 시작됨", status: getAutoJobStatus() });
  });

  // === EDUCATION TASKS (교육업무 관리) ===

  // 교육일지 서명률 → 업무 완료율 자동 동기화 헬퍼
  async function syncTaskCompletionFromSessions(taskId: number) {
    try {
      const sessions = await storage.getSessionsByTaskId(taskId);
      // 연결 세션이 없으면 완료율 0, 미완료로 초기화
      if (sessions.length === 0) {
        await storage.updateEducationTask(taskId, { completionRate: 0, status: "미완료" });
        return;
      }
      let totalRate = 0;
      let allDone = true;
      for (const s of sessions) {
        const sigs = await storage.getSignaturesBySession(s.id);
        const sessionRate = s.totalParticipants > 0
          ? Math.min(100, Math.round((sigs.length / s.totalParticipants) * 100))
          : 0;
        totalRate += sessionRate;
        if (s.status !== "완료" && sessionRate < 100) allDone = false;
      }
      const avgRate = Math.round(totalRate / sessions.length);
      const newStatus = allDone ? "완료" : "미완료";
      await storage.updateEducationTask(taskId, { completionRate: avgRate, status: newStatus });
    } catch (e) {
      console.error("[syncTask] 완료율 동기화 실패:", e);
    }
  }

  app.get('/api/education-tasks', isAuthenticated, async (_req, res) => {
    try {
      const tasks = await storage.getEducationTasks();
      // 연결된 세션 수(linkedSessionCount) 및 총 대상인원 포함하여 반환
      const enriched = await Promise.all(tasks.map(async (t) => {
        const sessions = await storage.getSessionsByTaskId(t.id);
        const totalParticipantsSum = sessions.reduce((sum, s) => sum + (s.totalParticipants || 0), 0);
        return { ...t, linkedSessionCount: sessions.length, totalParticipantsSum };
      }));
      res.json(enriched);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 업무 범위에 따른 부서 목록 계산 (교육 자동 생성용)
  const EDU_TEAMS_BY_HQ: Record<string, string[]> = {
    "대구본부": ["현장경영팀", "운용계획팀", "운용지원팀", "사업지원팀", "동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "공공망관제팀"],
    "부산본부": ["현장경영팀", "운용계획팀", "운용지원팀", "사업지원팀", "동부산운용팀", "중부산운용팀", "서부산운용팀", "울산운용팀", "지하철운용팀", "김해운용팀", "창원운용팀", "진주운용팀", "통영운용팀", "고객케어팀"],
    "충청본부": ["현장경영팀", "운용계획팀", "운용지원팀", "사업지원팀", "천안운용팀", "서대전운용팀", "서산운용팀", "홍성운용팀", "논산운용팀", "청주운용팀", "충주운용팀", "동대전운용팀", "세종운용팀"],
    "호남본부": ["현장경영팀", "운용계획팀", "운용지원팀", "사업지원팀", "서광주운용팀", "북광주운용팀", "목포운용팀", "해남운용팀", "제주운용팀", "전주운용팀", "익산운용팀", "남원운용팀", "정읍운용팀", "순천운용팀"],
    "경영총괄": ["현장경영팀", "운용계획팀", "운용지원팀", "사업지원팀"],
    "사업총괄": ["공공망관제팀"],
  };

  function getEduDeptsByTask(task: any): string[] {
    const scope = task.requestScope;
    const ALL_DEPTS: string[] = [];
    for (const teams of Object.values(EDU_TEAMS_BY_HQ)) {
      for (const t of teams as string[]) { if (!ALL_DEPTS.includes(t)) ALL_DEPTS.push(t); }
    }
    if (scope === "전사" || scope === "안전보건업무 부서") return ALL_DEPTS;
    if (scope === "본부") {
      const hqs = (task.headquarters || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      const depts: string[] = [];
      for (const hq of hqs) {
        for (const t of (EDU_TEAMS_BY_HQ[hq] ?? [])) { if (!depts.includes(t)) depts.push(t); }
      }
      return depts.length ? depts : ALL_DEPTS;
    }
    if (scope === "지정") {
      const teams = (task.department || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      return teams.length ? teams : ALL_DEPTS;
    }
    return ALL_DEPTS;
  }

  app.post('/api/education-tasks', requireEditor, async (req: any, res) => {
    try {
      const data = { ...req.body, createdBy: req.user?.username || req.user?.name };
      const task = await storage.createEducationTask(data);

      // 업무 범위 기반 세션 자동 생성
      const depts = getEduDeptsByTask(task);
      for (const dept of depts) {
        try {
          await storage.createEducationSession({
            title: task.title,
            educationDate: task.startDate,
            educationEndDate: task.endDate || task.startDate,
            department: dept,
            educationType: "정기교육",
            instructor: task.requestedBy || "",
            totalParticipants: 0,
            status: "진행중",
            taskId: task.id,
            createdBy: req.user?.username || req.user?.name,
          });
        } catch (_) { /* 개별 세션 생성 실패 무시 */ }
      }

      res.json(task);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 기존 업무에 누락된 세션 자동 생성
  app.post('/api/education-tasks/:id/auto-sessions', requireEditor, async (req: any, res) => {
    try {
      const taskId = Number(req.params.id);
      const task = await storage.getEducationTask(taskId);
      if (!task) return res.status(404).json({ message: "업무를 찾을 수 없습니다." });

      const depts = getEduDeptsByTask(task);
      const existing = await storage.getSessionsByTaskId(taskId);
      const existingDepts = new Set(existing.map((s: any) => s.department));
      const missing = depts.filter(d => !existingDepts.has(d));

      let created = 0;
      for (const dept of missing) {
        try {
          await storage.createEducationSession({
            title: task.title,
            educationDate: task.startDate,
            educationEndDate: task.endDate || task.startDate,
            department: dept,
            educationType: "정기교육",
            instructor: task.requestedBy || "",
            totalParticipants: 0,
            status: "진행중",
            taskId: task.id,
            createdBy: req.user?.username || req.user?.name,
          });
          created++;
        } catch (err) { console.error(`[auto-sessions] ${dept} 생성 실패:`, err); }
      }

      res.json({ created });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── 이미지 처리 헬퍼 ──────────────────────────────────────────────────────
  async function processPhotoBuffer(rawBuffer: Buffer): Promise<{ buffer: Buffer; ext: "jpeg" | "png" }> {
    try {
      const sharp = (await import("sharp")).default;
      const buf = await sharp(rawBuffer)
        .rotate()                                          // EXIF 방향 자동 보정
        .resize(900, 600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      return { buffer: buf, ext: "jpeg" };
    } catch {
      return { buffer: rawBuffer, ext: "jpeg" };
    }
  }

  async function processSignatureBuffer(dataUrl: string): Promise<{ base64: string; ext: "png" | "jpeg" } | null> {
    if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
    try {
      const sharp = (await import("sharp")).default;
      const base64Part = dataUrl.split(",")[1];
      const raw = Buffer.from(base64Part, "base64");
      const buf = await sharp(raw)
        .rotate()
        .resize(360, 90, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      return { base64: buf.toString("base64"), ext: "png" };
    } catch {
      const base64Part = dataUrl.split(",")[1];
      const ext = dataUrl.includes("image/png") ? "png" : "jpeg";
      return { base64: base64Part, ext: ext as "png" | "jpeg" };
    }
  }

  // ─── 세션 시트 생성 헬퍼 ─────────────────────────────────────────────────
  async function buildSessionSheets(
    workbook: ExcelJS.Workbook,
    taskTitle: string,
    session: any,
    signatures: any[],
    objService: any
  ) {
    const dept = session.department;
    const COL_W = [8, 14, 22, 8, 14, 22];   // 순번|이름|서명 × 2
    const SIG_ROW_H = 38;                     // 서명 행 높이(pt) — 통일
    const SIG_ROWS = 20;                      // 한 시트에 표시할 인원(좌20+우20=40)

    // ── 참석자 명단 시트 ─────────────────────────────────────────────────
    const sheetName = dept.length > 20 ? dept.slice(0, 20) : dept;
    const sigSheet = workbook.addWorksheet(`${sheetName}_참석자명단`);
    COL_W.forEach((w, i) => { sigSheet.getColumn(i + 1).width = w; });

    // 제목
    sigSheet.mergeCells("A1:F1");
    const tCell = sigSheet.getCell("A1");
    tCell.value = `"${taskTitle}" 참석자 명단`;
    tCell.font = { bold: true, size: 15 };
    tCell.alignment = { horizontal: "center", vertical: "middle" };
    tCell.border = { top:{style:"medium"}, bottom:{style:"medium"}, left:{style:"medium"}, right:{style:"medium"} };
    sigSheet.getRow(1).height = 38;

    // 구분선 행
    sigSheet.getRow(2).height = 6;

    // 정보행
    sigSheet.mergeCells("A3:C3");
    const dCell = sigSheet.getCell("A3");
    dCell.value = `□ 시행일시: ${session.educationDate}${session.educationEndDate && session.educationEndDate !== session.educationDate ? ` ~ ${session.educationEndDate}` : ""}`;
    dCell.font = { size: 10 };
    dCell.alignment = { vertical: "middle" };
    sigSheet.mergeCells("D3:F3");
    const bCell = sigSheet.getCell("D3");
    bCell.value = `□ 부서명: ${dept}`;
    bCell.font = { size: 10 };
    bCell.alignment = { vertical: "middle" };
    sigSheet.getRow(3).height = 22;

    sigSheet.mergeCells("A4:C4");
    const iCell = sigSheet.getCell("A4");
    iCell.value = `□ 강사: ${session.instructor || "-"}`;
    iCell.font = { size: 10 };
    iCell.alignment = { vertical: "middle" };
    sigSheet.mergeCells("D4:F4");
    const pCell = sigSheet.getCell("D4");
    pCell.value = `□ 대상인원: ${session.totalParticipants || 0}명`;
    pCell.font = { size: 10 };
    pCell.alignment = { vertical: "middle" };
    sigSheet.getRow(4).height = 22;

    let headerRow = 5;
    if (session.description) {
      sigSheet.mergeCells("A5:F5");
      const dcCell = sigSheet.getCell("A5");
      dcCell.value = `□ 교육내용: ${session.description}`;
      dcCell.font = { size: 10 };
      dcCell.alignment = { vertical: "middle", wrapText: true };
      dcCell.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
      sigSheet.getRow(5).height = 36;
      headerRow = 7;
      sigSheet.getRow(6).height = 6;
    } else {
      sigSheet.getRow(5).height = 6;
      headerRow = 6;
    }

    // 헤더
    ["순번","이름","서명","순번","이름","서명"].forEach((h, i) => {
      const c = sigSheet.getRow(headerRow).getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 10 };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6E4F0" } };
      c.border = { top:{style:"medium"}, bottom:{style:"medium"}, left:{style:"thin"}, right:{style:"thin"} };
    });
    sigSheet.getRow(headerRow).height = 22;

    // 서명 행 (좌 1~20, 우 21~40)
    for (let i = 0; i < SIG_ROWS; i++) {
      const row = sigSheet.getRow(headerRow + 1 + i);
      row.height = SIG_ROW_H;

      const setBorder = (cell: ExcelJS.Cell) => {
        cell.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
      };

      // 왼쪽 (1~20번)
      const lNum = row.getCell(1);
      lNum.value = i + 1;
      lNum.alignment = { horizontal: "center", vertical: "middle" };
      setBorder(lNum);
      const lName = row.getCell(2);
      lName.alignment = { horizontal: "center", vertical: "middle" };
      setBorder(lName);
      const lSig = row.getCell(3);
      setBorder(lSig);

      if (signatures[i]) {
        lName.value = signatures[i].signerName;
        try {
          const processed = await processSignatureBuffer(signatures[i].signatureData);
          if (processed) {
            const imgId = workbook.addImage({ base64: processed.base64, extension: processed.ext });
            (sigSheet as any).addImage(imgId, {
              tl: { col: 2, row: headerRow + i },
              br: { col: 3, row: headerRow + 1 + i },
              editAs: "oneCell",
            });
          }
        } catch { /* skip */ }
      }

      // 오른쪽 (21~40번)
      const rIdx = i + SIG_ROWS;
      const rNum = row.getCell(4);
      rNum.value = i + SIG_ROWS + 1;
      rNum.alignment = { horizontal: "center", vertical: "middle" };
      setBorder(rNum);
      const rName = row.getCell(5);
      rName.alignment = { horizontal: "center", vertical: "middle" };
      setBorder(rName);
      const rSig = row.getCell(6);
      setBorder(rSig);

      if (signatures[rIdx]) {
        rName.value = signatures[rIdx].signerName;
        try {
          const processed = await processSignatureBuffer(signatures[rIdx].signatureData);
          if (processed) {
            const imgId = workbook.addImage({ base64: processed.base64, extension: processed.ext });
            (sigSheet as any).addImage(imgId, {
              tl: { col: 5, row: headerRow + i },
              br: { col: 6, row: headerRow + 1 + i },
              editAs: "oneCell",
            });
          }
        } catch { /* skip */ }
      }
    }

    // ── 교육 사진 시트 ────────────────────────────────────────────────────
    const images = session.images || [];
    const photoSheet = workbook.addWorksheet(`${sheetName}_교육사진`);

    // 열 너비 통일 (각 사진 영역 4열, 열너비 14)
    for (let c = 1; c <= 8; c++) photoSheet.getColumn(c).width = 14;

    // 제목
    photoSheet.mergeCells("A1:H1");
    const ptCell = photoSheet.getCell("A1");
    ptCell.value = `"${taskTitle}" 교육 시행 사진 — ${dept}`;
    ptCell.font = { bold: true, size: 13 };
    ptCell.alignment = { horizontal: "center", vertical: "middle" };
    ptCell.border = { top:{style:"medium"}, bottom:{style:"medium"}, left:{style:"medium"}, right:{style:"medium"} };
    photoSheet.getRow(1).height = 34;

    // 정보
    photoSheet.mergeCells("A2:D2");
    const pi2 = photoSheet.getCell("A2");
    pi2.value = `□ 시행일시: ${session.educationDate}`;
    pi2.font = { size: 10 };
    pi2.alignment = { vertical: "middle" };
    photoSheet.mergeCells("E2:H2");
    const pd2 = photoSheet.getCell("E2");
    pd2.value = `□ 부서명: ${dept}`;
    pd2.font = { size: 10 };
    pd2.alignment = { vertical: "middle" };
    photoSheet.getRow(2).height = 20;

    photoSheet.getRow(3).height = 6;  // 구분선

    const PHOTO_ROW_H = 28;    // 행 높이(pt) — 18행 × 28pt ≈ 357pt ≈ 12.6cm
    const PHOTO_ROWS  = 18;    // 사진 1장당 행 수

    // 상단 2장(A~D, E~H)
    const topStart = 4;
    const topEnd   = topStart + PHOTO_ROWS - 1;
    // 하단 2장
    const botStart = topEnd + 1;
    const botEnd   = botStart + PHOTO_ROWS - 1;

    // 병합 + 테두리
    const photoRanges: { tl: {col:number,row:number}, br: {col:number,row:number}, mergeRange: string }[] = [
      { mergeRange: `A${topStart}:D${topEnd}`, tl:{col:0,row:topStart-1}, br:{col:4,row:topEnd} },
      { mergeRange: `E${topStart}:H${topEnd}`, tl:{col:4,row:topStart-1}, br:{col:8,row:topEnd} },
      { mergeRange: `A${botStart}:D${botEnd}`, tl:{col:0,row:botStart-1}, br:{col:4,row:botEnd} },
      { mergeRange: `E${botStart}:H${botEnd}`, tl:{col:4,row:botStart-1}, br:{col:8,row:botEnd} },
    ];

    for (let r = topStart; r <= botEnd; r++) {
      photoSheet.getRow(r).height = PHOTO_ROW_H;
    }

    photoRanges.forEach(({ mergeRange }) => {
      photoSheet.mergeCells(mergeRange);
      const cell = photoSheet.getCell(mergeRange.split(":")[0]);
      cell.border = { top:{style:"medium"}, bottom:{style:"medium"}, left:{style:"medium"}, right:{style:"medium"} };
    });

    // 캡션 행
    const captionRow = botEnd + 1;
    photoSheet.getRow(captionRow).height = 20;
    photoSheet.mergeCells(`A${captionRow}:D${captionRow}`);
    photoSheet.mergeCells(`E${captionRow}:H${captionRow}`);
    ["A","E"].forEach(col => {
      const c = photoSheet.getCell(`${col}${captionRow}`);
      c.value = "교육 실시 사진";
      c.font = { bold: true, size: 9 };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
    });

    // 사진 삽입 (최대 4장, EXIF 보정 + 리사이즈)
    for (let pi = 0; pi < Math.min(images.length, 4); pi++) {
      try {
        const objectFile = await objService.getObjectEntityFile(images[pi]);
        const [rawBuf] = await objectFile.download();
        const { buffer: procBuf } = await processPhotoBuffer(rawBuf);
        const imgId = workbook.addImage({ base64: procBuf.toString("base64"), extension: "jpeg" });
        (photoSheet as any).addImage(imgId, { ...photoRanges[pi], editAs: "oneCell" });
      } catch (e) {
        console.error(`사진 삽입 실패 ${dept} #${pi}:`, e);
      }
    }

    if (images.length === 0) {
      // 4개 영역은 이미 위에서 병합됨 → 첫 번째 셀에만 텍스트 삽입
      const noPhotoCell = photoSheet.getCell(`A${topStart}`);
      noPhotoCell.value = "등록된 사진이 없습니다.";
      noPhotoCell.font = { size: 11, color: { argb: "FF999999" } };
      noPhotoCell.alignment = { horizontal: "center", vertical: "middle" };
    }
  }

  // ─── 전체 다운로드 ────────────────────────────────────────────────────────
  app.get('/api/education-tasks/:id/excel', isAuthenticated, async (req: any, res) => {
    try {
      const taskId = Number(req.params.id);
      const task = await storage.getEducationTask(taskId);
      if (!task) return res.status(404).json({ message: "업무를 찾을 수 없습니다." });

      const sessions = await storage.getSessionsByTaskId(taskId);
      if (sessions.length === 0) return res.status(404).json({ message: "연결된 교육일지가 없습니다." });

      const workbook = new ExcelJS.Workbook();
      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const objService = new ObjectStorageService();

      for (const session of sessions) {
        const signatures = await storage.getSignaturesBySession(session.id);
        await buildSessionSheets(workbook, task.title, session, signatures, objService);
      }

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${task.title}_안전보건교육_${task.startDate}`)}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (e: any) {
      console.error("Task Excel error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ─── 부서별(세션별) 단독 다운로드 ────────────────────────────────────────
  app.get('/api/education-tasks/:taskId/sessions/:sessionId/excel', isAuthenticated, async (req: any, res) => {
    try {
      const taskId    = Number(req.params.taskId);
      const sessionId = Number(req.params.sessionId);
      const task = await storage.getEducationTask(taskId);
      if (!task) return res.status(404).json({ message: "업무를 찾을 수 없습니다." });

      const allSessions = await storage.getSessionsByTaskId(taskId);
      const session = allSessions.find(s => s.id === sessionId);
      if (!session) return res.status(404).json({ message: "세션을 찾을 수 없습니다." });

      const signatures = await storage.getSignaturesBySession(sessionId);
      const workbook = new ExcelJS.Workbook();
      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const objService = new ObjectStorageService();

      await buildSessionSheets(workbook, task.title, session, signatures, objService);

      const fname = `${task.title}_${session.department}_${session.educationDate}`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fname)}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (e: any) {
      console.error("Session Excel error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ─── 선택 부서 일괄 다운로드 ─────────────────────────────────────────────
  app.post('/api/education-tasks/:taskId/sessions/batch-excel', isAuthenticated, async (req: any, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const { sessionIds } = req.body as { sessionIds: number[] };
      if (!Array.isArray(sessionIds) || sessionIds.length === 0)
        return res.status(400).json({ message: "sessionIds가 필요합니다." });

      const task = await storage.getEducationTask(taskId);
      if (!task) return res.status(404).json({ message: "업무를 찾을 수 없습니다." });

      const allSessions = await storage.getSessionsByTaskId(taskId);
      const selected = allSessions.filter(s => sessionIds.includes(s.id));
      if (selected.length === 0) return res.status(404).json({ message: "세션을 찾을 수 없습니다." });

      const workbook = new ExcelJS.Workbook();
      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const objService = new ObjectStorageService();

      for (const session of selected) {
        const signatures = await storage.getSignaturesBySession(session.id);
        await buildSessionSheets(workbook, task.title, session, signatures, objService);
      }

      const fname = selected.length === 1
        ? `${task.title}_${selected[0].department}_${selected[0].educationDate}`
        : `${task.title}_선택부서_${selected.length}개`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fname)}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (e: any) {
      console.error("Batch Excel error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.put('/api/education-tasks/:id', requireEditor, async (req: any, res) => {
    try {
      const task = await storage.updateEducationTask(Number(req.params.id), req.body);
      res.json(task);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/education-tasks/:id', requireEditor, async (req, res) => {
    try {
      await storage.deleteEducationTask(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/education-tasks/bulk-delete', requireEditor, async (req, res) => {
    try {
      const { ids } = req.body as { ids: number[] };
      await storage.bulkDeleteEducationTasks(ids);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/education-tasks/bulk-confirm', requireEditor, async (req, res) => {
    try {
      const { ids } = req.body as { ids: number[] };
      await storage.bulkConfirmEducationTasks(ids);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/education-tasks/:id/copy', requireEditor, async (req: any, res) => {
    try {
      const sourceId = Number(req.params.id);
      const source = await storage.getEducationTask(sourceId);
      if (!source) return res.status(404).json({ message: "업무를 찾을 수 없습니다." });
      const data = {
        title: source.title + " (복사)",
        startDate: source.startDate,
        endDate: source.endDate,
        field: source.field,
        requestScope: source.requestScope,
        isRecurring: source.isRecurring,
        taskFields: source.taskFields,
        headquarters: source.headquarters,
        department: source.department,
        requestedBy: source.requestedBy,
        selectedHqs: (source as any).selectedHqs,
        selectedTeams: (source as any).selectedTeams,
        createdBy: req.user?.username || req.user?.name,
      };
      const task = await storage.createEducationTask(data);
      const depts = getEduDeptsByTask(task);
      // 원본 세션 목록 조회 (인원수 복사용)
      const sourceSessions = await storage.getSessionsByTaskId(sourceId);
      const sourceParticipantsMap = new Map(sourceSessions.map(s => [s.department, s.totalParticipants ?? 0]));
      for (const dept of depts) {
        try {
          await storage.createEducationSession({
            title: task.title,
            educationDate: task.startDate,
            educationEndDate: task.endDate || task.startDate,
            department: dept,
            educationType: "정기교육",
            instructor: task.requestedBy || "",
            totalParticipants: sourceParticipantsMap.get(dept) ?? 0,
            status: "진행중",
            taskId: task.id,
            createdBy: req.user?.username || req.user?.name,
          });
        } catch (_) {}
      }
      res.json(task);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 증빙자료 업로드
  const eduTaskAttachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.post('/api/education-tasks/:id/attachment', requireEditor, eduTaskAttachmentUpload.single('file'), async (req: any, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "파일이 없습니다" });
      const ext = safeExt(file.originalname, ["pdf", "jpg", "jpeg", "png", "doc", "docx", "xlsx", "xls", "hwp", "hwpx"]);
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const filename = `edu-task-${uniqueSuffix}${ext || path.extname(file.originalname)}`;
      let fileUrl = `/uploads/${filename}`;
      const objUrl = await uploadToObjectStorage(file.buffer, filename, file.mimetype);
      if (objUrl) {
        fileUrl = objUrl;
      } else {
        fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
      }
      const task = await storage.updateEducationTask(Number(req.params.id), {
        attachmentUrl: fileUrl,
        attachmentName: file.originalname,
        status: "완료",
        completionRate: 100,
      });
      res.json(task);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Excel 다운로드
  app.get('/api/education-tasks/export', isAuthenticated, async (_req, res) => {
    try {
      const tasks = await storage.getEducationTasks();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('교육업무 관리');
      ws.columns = [
        { header: 'ID', key: 'id', width: 8 },
        { header: '업무명', key: 'title', width: 40 },
        { header: '시작일', key: 'startDate', width: 14 },
        { header: '종료일', key: 'endDate', width: 14 },
        { header: '완료율', key: 'completionRate', width: 10 },
        { header: '업무 분야', key: 'field', width: 14 },
        { header: '요청 구분', key: 'requestScope', width: 18 },
        { header: '본부', key: 'headquarters', width: 14 },
        { header: '부서/팀', key: 'department', width: 14 },
        { header: '요청자', key: 'requestedBy', width: 12 },
        { header: '완료상태', key: 'status', width: 10 },
        { header: '반복', key: 'isRecurring', width: 8 },
        { header: 'Confirm', key: 'confirmed', width: 10 },
        { header: '등록일', key: 'createdAt', width: 18 },
      ];
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
      for (const t of tasks) {
        ws.addRow({
          id: t.id,
          title: t.title,
          startDate: t.startDate,
          endDate: t.endDate,
          completionRate: `${t.completionRate}%`,
          field: t.field,
          requestScope: t.requestScope,
          headquarters: t.headquarters || '',
          department: t.department || '',
          requestedBy: t.requestedBy || '',
          status: t.status,
          isRecurring: t.isRecurring ? 'Y' : 'N',
          confirmed: t.confirmed ? 'Y' : 'N',
          createdAt: t.createdAt ? new Date(t.createdAt).toLocaleString('ko-KR') : '',
        });
      }
      const buf = await wb.xlsx.writeBuffer();
      const today = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=education_tasks_${today}.xlsx`);
      res.send(buf);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 교육업무와 연결된 교육일지 세션 조회 (서명 수 포함)
  app.get('/api/education-tasks/:id/sessions', isAuthenticated, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const sessions = await storage.getSessionsByTaskId(taskId);
      // Fetch signature counts for each session
      const result = await Promise.all(sessions.map(async (s) => {
        const sigs = await storage.getSignaturesBySession(s.id);
        return {
          ...s,
          signedCount: sigs.length,
        };
      }));
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
