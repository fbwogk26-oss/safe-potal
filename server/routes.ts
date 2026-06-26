import type { Express } from "express";
import type { Server } from "http";
import fs from "fs";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { createHash } from "crypto";
import { db } from "./db";
import { teams, trafficFines, accidentReports, educationSignatures, safetyInspections, educationTasks, safetyCostRecords } from "@shared/schema";
import { eq, and, count, sql, inArray } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import mammoth from "mammoth";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
import ExcelJS from "exceljs";
import XLSX from "xlsx";
import archiver from "archiver";
import mammoth from "mammoth";
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
const publicUploadsDir = path.join(process.cwd(), "public-uploads");
if (!fs.existsSync(publicUploadsDir)) {
  fs.mkdirSync(publicUploadsDir, { recursive: true });
}

// ── API 요청 로그 링버퍼 (최근 1000건 메모리 보관) ──────────────────────
export interface ApiLogEntry {
  id: number;
  method: string;
  path: string;
  status: number;
  duration: number;
  username: string | null;
  ip: string | null;
  referer: string | null;
  timestamp: string;
}
const API_LOG_MAX = 1000;
const apiLogBuffer: ApiLogEntry[] = [];
let apiLogSeq = 0;
// 폴링 엔드포인트 등 잡음이 많은 경로 제외
const API_LOG_SKIP = [
  '/api/new-equipment-requests/unread-count',
  '/api/auth/user',
  '/api/lock-status',
  '/api/settings/lock',
];
function pushApiLog(entry: Omit<ApiLogEntry, 'id'>) {
  apiLogBuffer.push({ id: ++apiLogSeq, ...entry });
  if (apiLogBuffer.length > API_LOG_MAX) apiLogBuffer.shift();
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
  const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`타임아웃(${label})`)), ms))]);
  try {
    const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${filename}`;
    const parts = fullPath.replace(/^\//, "").split("/");
    const bucketName = parts[0];
    const objectName = parts.slice(1).join("/");
    const fileRef = objectStorageClient.bucket(bucketName).file(objectName);
    await withTimeout(fileRef.save(buffer, { contentType, resumable: false }), 20000, "save");
    // 이미지·문서 파일은 public으로 설정해서 <img> 태그가 인증 없이 접근 가능하게 함
    try {
      await withTimeout(setObjectAclPolicy(fileRef, { owner: "system", visibility: "public" }), 5000, "acl");
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
      'application/haansofthwp', 'application/x-hwp', 'application/hwp', 'application/x-hwpml',
      'application/vnd.hancom.hwp', 'application/vnd.hancom.hwpx',
      'image/jpeg', 'image/png', 'application/octet-stream'];
    cb(null, allowedExts.includes(ext) || allowedMimes.includes(file.mimetype));
  }
});

const excelUpload = multer({
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
    const yearAccidents = allAccidents.filter(a => a.occurredAt?.startsWith(String(year)) && (a as any).kpiTarget === true);
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

// poppler-utils(pdfimages/pdftoppm)를 사용해 PDF에서 이미지를 추출하는 함수
async function extractImagesWithPoppler(pdfBuffer: Buffer): Promise<Buffer[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-img-'));
  const pdfPath = path.join(tmpDir, 'input.pdf');
  const imgPrefix = path.join(tmpDir, 'page');
  console.log(`[PDF이미지] tmpDir=${tmpDir} pdfSize=${pdfBuffer.length}`);
  try {
    fs.writeFileSync(pdfPath, pdfBuffer);

    // 1단계: pdfimages -png 로 모든 임베딩 이미지를 PNG로 추출 (형식 호환성 최대화)
    try {
      const r1 = await execFileAsync('pdfimages', ['-png', pdfPath, imgPrefix], { timeout: 30000 });
      console.log('[PDF이미지] pdfimages -png 완료:', r1.stderr || 'ok');
    } catch (e1: any) {
      console.error('[PDF이미지] pdfimages 실패:', e1.message);
    }

    let imgFiles = fs.readdirSync(tmpDir)
      .filter(f => f !== 'input.pdf' && /\.(png|jpg|jpeg|ppm|pbm)$/i.test(f))
      .sort()
      .map(f => path.join(tmpDir, f));
    console.log(`[PDF이미지] pdfimages 결과 ${imgFiles.length}개:`, imgFiles.map(f => path.basename(f)));

    // 2단계: 임베딩 이미지가 없으면 pdftoppm으로 페이지 전체 렌더링 (스캔 PDF 대응)
    if (imgFiles.length === 0) {
      try {
        await execFileAsync('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '10', pdfPath, imgPrefix], { timeout: 30000 });
        imgFiles = fs.readdirSync(tmpDir)
          .filter(f => f !== 'input.pdf' && /\.(png|jpg|jpeg)$/i.test(f))
          .sort()
          .map(f => path.join(tmpDir, f));
        console.log(`[PDF이미지] pdftoppm 결과 ${imgFiles.length}개`);
      } catch (e2: any) {
        console.error('[PDF이미지] pdftoppm 실패:', e2.message);
      }
    }

    const { default: sharp } = await import('sharp');
    const results: Buffer[] = [];
    for (const f of imgFiles.slice(0, 10)) {
      try {
        const raw = fs.readFileSync(f);
        if (raw.length < 1000) {
          console.log(`[PDF이미지] 스킵(너무 작음): ${path.basename(f)} ${raw.length}bytes`);
          continue;
        }
        // sharp로 JPEG 변환 (PNG, PPM 등 모두 처리)
        const converted = await sharp(raw).jpeg({ quality: 85 }).toBuffer();
        results.push(converted);
        console.log(`[PDF이미지] 변환 성공: ${path.basename(f)} ${raw.length}→${converted.length}bytes`);
      } catch (e3: any) {
        console.error(`[PDF이미지] 처리 실패 ${path.basename(f)}:`, e3.message);
      }
    }
    console.log(`[PDF이미지] 최종 이미지 수: ${results.length}`);
    return results;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// PDF 바이너리에서 JPEG 이미지 스트림을 추출하는 함수 (라이브러리 없이, 폴백용)
function extractJpegsFromBuffer(buf: Buffer): Buffer[] {
  const results: Buffer[] = [];
  let i = 0;
  while (i < buf.length - 3) {
    // JPEG SOI 마커: FF D8 FF
    if (buf[i] === 0xFF && buf[i + 1] === 0xD8 && buf[i + 2] === 0xFF) {
      const start = i;
      let j = i + 4; // FF D8 FF XX 이후부터 스캔
      let found = false;
      // EOI 마커 탐색: FF D9 (최대 50MB 범위 내)
      while (j < Math.min(buf.length - 1, start + 50 * 1024 * 1024)) {
        if (buf[j] === 0xFF && buf[j + 1] === 0xD9) {
          const end = j + 2;
          const jpeg = buf.slice(start, end);
          // 최소 크기(1KB) 이상인 이미지만 수집 (썸네일/아이콘 제외)
          if (jpeg.length > 1000) {
            results.push(jpeg);
          }
          i = end;
          found = true;
          break;
        }
        j++;
      }
      // EOI를 못 찾아도 break하지 않고 다음 바이트부터 계속 스캔
      if (!found) i = start + 1;
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

  // ── API 요청 로그 수집 미들웨어 (인증 이후 등록 → req.user 사용 가능) ──
  app.use((req: any, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const p = req.path;
      if (!p.startsWith('/api')) return;
      if (API_LOG_SKIP.some(skip => p.startsWith(skip))) return;
      const rawRef = (req.headers['referer'] || req.headers['referrer'] || '') as string;
      let referer: string | null = null;
      if (rawRef) {
        try { referer = new URL(rawRef).pathname; } catch { referer = rawRef; }
      }
      pushApiLog({
        method: req.method,
        path: req.originalUrl || p,
        status: res.statusCode,
        duration: Date.now() - start,
        username: req.user?.username || null,
        ip: (req.headers['x-forwarded-for'] as string || req.ip || '').split(',')[0].trim() || null,
        referer,
        timestamp: new Date().toISOString(),
      });
    });
    next();
  });

  // ── GET /api/admin/api-logs ────────────────────────────────────────────
  app.get('/api/admin/api-logs', isAuthenticated, (req: any, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: '관리자 전용' });
    const limit = Math.min(parseInt(req.query.limit as string || '200', 10), 1000);
    res.json([...apiLogBuffer].reverse().slice(0, limit));
  });

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

      const ext = path.extname(req.file.originalname).toLowerCase();
      let users: Array<{ department: string; name: string; username: string; password: string }> = [];

      if (ext === ".csv") {
        const content = req.file.buffer.toString("utf-8");
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
        await workbook.xlsx.load(req.file.buffer);
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
    const headquarters = req.query.headquarters as string | undefined;
    const teams = await storage.getTeams(year, headquarters);
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

  // 공개 파일 업로드 (회의자료/회의록 미리보기용 - 인증 불필요, UUID 파일명으로 보안)
  app.use('/public-uploads', (await import('express')).default.static(publicUploadsDir));

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
  const inspectionPhotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  // 단건 점검 사진 업로드 + GPT-4o Vision 자동 분석
  app.post('/api/safety-inspections/analyze-photo', isAuthenticated, inspectionPhotoUpload.single('photo'), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ message: "사진이 없습니다" });

      // Object Storage 업로드
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `inspection-photo-${Date.now()}${ext}`;
      let imageUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype || 'image/jpeg');
      if (!imageUrl) {
        fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
        imageUrl = `/uploads/${filename}`;
      }

      // GPT-4o Vision 분석
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype || 'image/jpeg';

      try {
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
              content: `당신은 산업안전보건 전문가입니다. 현장 안전점검 사진을 보고 점검 기록 작성에 필요한 정보를 추출합니다.
다음 JSON 형식으로만 응답하세요 (코드블록 없이):
{
  "workContent": "사진에 보이는 작업 종류/내용 (10~30자, 없으면 null)",
  "location": "장소 특성 (예: 통신 기지국 내부, 도로변 맨홀, 전주 주변 등 10~20자, 없으면 null)",
  "notes": "사진에서 보이는 안전 위험요인이나 특이사항 (50자 이내, 없으면 null)"
}`,
            },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "low" } },
                { type: "text", text: "이 안전점검 사진에서 작업내용, 장소, 안전 특이사항을 추출해주세요." },
              ] as any,
            },
          ],
          max_tokens: 300,
          temperature: 0.1,
        });

        const raw = response.choices[0].message.content?.trim() || '{}';
        let parsed: any = {};
        try { parsed = JSON.parse(raw); } catch {}
        return res.json({ imageUrl, workContent: parsed.workContent || null, location: parsed.location || null, notes: parsed.notes || null });
      } catch (aiErr: any) {
        console.warn('[InspectionPhotoAnalyze] AI 분석 실패 (URL만 반환):', aiErr.message);
        return res.json({ imageUrl, workContent: null, location: null, notes: null });
      }
    } catch (e: any) {
      console.error('[InspectionPhotoAnalyze] 오류:', e);
      res.status(500).json({ message: e.message });
    }
  });

  app.post('/api/parse-inspection-pdf', isAuthenticated, inspectionPdfUpload.single('pdf'), async (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ message: "PDF 파일이 필요합니다" });
    try {
      const pdfBuffer: Buffer = req.file.buffer;

      // ── 1) 텍스트 추출 (pdf-parse) ──
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js' as any)).default;
      const pdfData = await pdfParse(pdfBuffer);
      const lines = pdfData.text.split('\n').map((l: string) => l.trim()).filter(Boolean);

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

      // 작업장소: "날짜T시간 / 주소" 패턴 — ○ 또는 줄바꿈 전까지 추출
      const locMatch = fullText.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\s*\/\s*([^○\n]+?)(?=\s*○|\s*$)/);
      if (locMatch) location = locMatch[1].trim();

      // 작업내용: 직영-무선기지국- 형태
      const workMatch = fullText.match(/직영[-–]([가-힣A-Za-z0-9]+)[-–]/);
      if (workMatch) workContent = workMatch[1];

      // ── 2) PDF에서 이미지 추출 (poppler pdfimages → pdftoppm → JPEG 바이너리 스캔 순서)
      const imageUrls: string[] = [];
      try {
        let imgBuffers = await extractImagesWithPoppler(pdfBuffer);
        if (imgBuffers.length === 0) imgBuffers = extractJpegsFromBuffer(pdfBuffer);
        for (let i = 0; i < Math.min(imgBuffers.length, 10); i++) {
          const filename = `pdf-img-${Date.now()}-${i}.jpg`;
          const objUrl = await uploadToObjectStorage(imgBuffers[i], filename, 'image/jpeg');
          if (objUrl) {
            imageUrls.push(objUrl);
          } else {
            fs.writeFileSync(path.join(uploadDir, filename), imgBuffers[i]);
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

  // ── 일괄 PDF+엑셀 파싱 ─────────────────────────────────
  const bulkInspUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 55 },
  });

  app.post('/api/safety-inspections/bulk-parse', isAuthenticated,
    bulkInspUpload.fields([{ name: 'pdfs', maxCount: 50 }, { name: 'excel', maxCount: 1 }]),
    async (req: any, res: any) => {
      try {
        const pdfFiles: any[] = req.files?.['pdfs'] || [];
        const excelFile: any = req.files?.['excel']?.[0];

        // 엑셀 파싱 (작업번호/내용 보완용)
        let excelData: Record<string, any>[] = [];
        if (excelFile) {
          try {
            const wb2 = new ExcelJS.Workbook();
            await wb2.xlsx.load(excelFile.buffer);
            const ws2 = wb2.worksheets[0];
            const hdrs: Record<number, string> = {};
            ws2.eachRow((row: any, ri: number) => {
              if (ri === 1) { row.eachCell((c: any, ci: number) => { hdrs[ci] = String(c.value ?? '').trim(); }); }
              else {
                const obj: Record<string, any> = {};
                row.eachCell((c: any, ci: number) => { if (hdrs[ci]) obj[hdrs[ci]] = String(c.value ?? '').trim(); });
                if (Object.values(obj).some(v => v)) excelData.push(obj);
              }
            });
          } catch (exErr: any) { console.warn('[bulk-parse] 엑셀 파싱 실패:', exErr.message); }
        }

        const pdfParseBulk = (await import('pdf-parse/lib/pdf-parse.js' as any)).default;

        const results: any[] = [];
        for (const f of pdfFiles) {
          try {
            const pdfBuffer: Buffer = f.buffer;
            const pdfDataBulk = await pdfParseBulk(pdfBuffer);
            // lines 배열과 합친 텍스트 모두 준비
            const lines = pdfDataBulk.text.split('\n').map((l: string) => l.trim()).filter(Boolean);
            const fullText = lines.join(' ');

            let inspectionDate = '';
            let team = '';
            let location = '';
            let workDateTime = '';
            let workNo = '';
            let inspectionMethod = '';
            let inspectionResult = '양호';
            let defectCount = 0;

            // 점검일자: "○ 점검일자 : 2026-05-26"
            const dateLine = lines.find(l => l.includes('점검일자'));
            if (dateLine) {
              const m = dateLine.match(/(\d{4}-\d{2}-\d{2})/);
              if (m) inspectionDate = m[1];
            }

            // 점검방법: "○ 점검방법 : 비대면" 또는 "코칭(대면)"
            const methodLine = lines.find(l => l.includes('점검방법'));
            if (methodLine) {
              const m = methodLine.match(/점검방법\s*:\s*(.+)/);
              if (m) inspectionMethod = m[1].trim();
            }

            // 점검대상: "○ 점검대상 : kt MOS 남부>대구본부>동대구운용부>동대구운용팀"
            const targetLine = lines.find(l => l.includes('점검대상'));
            if (targetLine) {
              const m = targetLine.match(/점검대상\s*:\s*(.+)/);
              if (m) {
                const parts = m[1].trim().split('>');
                team = parts[parts.length - 1].trim();
              }
            }

            // 작업일시/장소: "○ 작업일시/장소 : 2026-05-26T15:00 / 경상북도 경주시..."
            const dtLine = lines.find(l => l.includes('작업일시') && l.includes('장소'));
            if (dtLine) {
              const mDt = dtLine.match(/(\d{4}-\d{2}-\d{2}T[\d:]+)/);
              if (mDt) workDateTime = mDt[1];
              // 슬래시 이후가 장소
              const mLoc = dtLine.match(/\d{4}-\d{2}-\d{2}T[\d:]+\s*\/\s*(.+)/);
              if (mLoc) location = mLoc[1].trim();
            }

            // 작업번호: "○ 무선 (직영 / 무선기지국-20260527-0005)"
            const noLine = lines.find(l => l.includes('직영') && l.includes('/') && /[\w]+-\d{8}-\d+/.test(l));
            if (noLine) {
              const m = noLine.match(/((?:직영-)?(?:무선기지국|전원기지국|선로기지국)-[\w-]+)/);
              if (m) workNo = m[1].trim();
            }

            // 점검결과/미흡건수: 테이블 행에서 추출
            const resultIdx = lines.findIndex(l => /양호|미흡/.test(l) && /\d+/.test(l));
            if (resultIdx >= 0) {
              const rline = lines[resultIdx];
              const mr = rline.match(/양호|미흡/);
              if (mr) inspectionResult = mr[0];
              const md = rline.match(/(\d+)\s*$/);
              if (md) defectCount = parseInt(md[1]);
            } else {
              // 개별 라인에서 찾기
              const resLine = lines.find(l => l === '양호' || l === '미흡');
              if (resLine) inspectionResult = resLine;
              const defLine = lines.find(l => /^(미흡건수\s+)?\d+$/.test(l));
              if (defLine) defectCount = parseInt(defLine.replace(/\D/g, '')) || 0;
            }

            // 이미지 추출 (poppler pdfimages → pdftoppm → JPEG 바이너리 스캔 순서)
            const imageUrls: string[] = [];
            try {
              let imgBuffers = await extractImagesWithPoppler(pdfBuffer);
              if (imgBuffers.length === 0) imgBuffers = extractJpegsFromBuffer(pdfBuffer);
              for (let i = 0; i < Math.min(imgBuffers.length, 10); i++) {
                const filename = `pdf-bulk-${Date.now()}-${i}.jpg`;
                const objUrl = await uploadToObjectStorage(imgBuffers[i], filename, 'image/jpeg');
                if (objUrl) imageUrls.push(objUrl);
                else { fs.writeFileSync(path.join(uploadDir, filename), imgBuffers[i]); imageUrls.push(`/uploads/${filename}`); }
              }
            } catch (e) {
              console.error('[bulk-parse] 이미지 추출 오류:', e);
            }

            // 엑셀에서 다중 필드 매칭
            let workContent = '';
            let workType = '';
            let inspectorFromExcel = '';
            let workerFromExcel = '';
            let teamFromExcel = '';
            let locationFromExcel = '';
            let overallComment = '';
            let inspectionDateFromExcel = '';
            let workNoFromExcel = '';
            const pdfIndex = pdfFiles.indexOf(f);
            if (excelData.length > 0) {
              const cols = Object.keys(excelData[0]);
              const normalize = (s: string) => s.replace(/\s/g, '').toLowerCase();
              const findCol = (keys: string[]) => cols.find(c => keys.some(k => normalize(c) === normalize(k))) ||
                                                   cols.find(c => keys.some(k => normalize(c).includes(normalize(k))));

              // 컬럼 감지 — 정확한 이름 우선, 포함 매칭 폴백
              const teamDetailCol  = findCol(['점검대상조직(상세)', '점검수행시점조직', '점검대상조직상세']);
              const teamCol        = teamDetailCol || findCol(['운용팀','팀명','소속팀','점검대상조직','점검대상']);
              const inspectorCol   = findCol(['점검자']);
              const workerCol      = findCol(['작업자']);
              const workContentCol = findCol(['작업내용']);
              const workTypeCol    = findCol(['작업유형']);
              const workNoCol      = findCol(['작업허가서번호', '작업번호', '허가서번호']);
              const locationCol    = findCol(['작업주소', '작업국소', '작업장소', '현장주소', '주소']);
              const commentCol     = findCol(['점검총평', '총평', '종합의견', '비고']);
              const dateCol        = findCol(['점검일시', '점검일', '일시']);
              const resultCol      = findCol(['점검결과']);

              // 팀명 추출 헬퍼 (조직계층에서 마지막 팀명만)
              const extractTeam = (val: string) => val.includes('>') ? val.split('>').pop()!.trim() : val.trim();
              // 시간 추출 헬퍼 HH:MM → "HHMM"
              const extractTime = (val: string) => { const m = val.match(/(\d{2}):(\d{2})/); return m ? m[1] + m[2] : ''; };
              // 날짜 8자리 추출
              const extractDate8 = (val: string) => val.replace(/[^0-9]/g, '').slice(0, 8);

              let matchedRow: Record<string, any> | undefined;
              const pdfDate8 = extractDate8(inspectionDate);
              const pdfTime  = extractTime(workDateTime);
              const pdfTeam  = normalize(team);

              // 1순위: 팀명 + 날짜 + 시간 (가장 정확 — 같은 날 같은 팀 여러 건 구분)
              if (teamCol && pdfTeam && pdfDate8 && pdfTime && dateCol) {
                matchedRow = excelData.find(row => {
                  const rowTeam = normalize(extractTeam(String(row[teamCol] || '')));
                  if (!rowTeam) return false;
                  const teamOk = rowTeam === pdfTeam || rowTeam.includes(pdfTeam) || pdfTeam.includes(rowTeam);
                  if (!teamOk) return false;
                  const rowDateVal = String(row[dateCol] || '');
                  return extractDate8(rowDateVal) === pdfDate8 && extractTime(rowDateVal) === pdfTime;
                });
              }
              // 2순위: 팀명 + 날짜
              if (!matchedRow && teamCol && pdfTeam && pdfDate8 && dateCol) {
                matchedRow = excelData.find(row => {
                  const rowTeam = normalize(extractTeam(String(row[teamCol] || '')));
                  if (!rowTeam) return false;
                  const teamOk = rowTeam === pdfTeam || rowTeam.includes(pdfTeam) || pdfTeam.includes(rowTeam);
                  if (!teamOk) return false;
                  return extractDate8(String(row[dateCol] || '')) === pdfDate8;
                });
              }
              // 3순위: 날짜 + 시간
              if (!matchedRow && pdfDate8 && pdfTime && dateCol) {
                matchedRow = excelData.find(row => {
                  const rowDateVal = String(row[dateCol] || '');
                  return extractDate8(rowDateVal) === pdfDate8 && extractTime(rowDateVal) === pdfTime;
                });
              }
              // 4순위: 날짜만
              if (!matchedRow && pdfDate8 && dateCol) {
                matchedRow = excelData.find(row => extractDate8(String(row[dateCol] || '')) === pdfDate8);
              }
              // 5순위: 인덱스
              if (!matchedRow && pdfIndex < excelData.length) matchedRow = excelData[pdfIndex];

              if (matchedRow) {
                if (workContentCol) workContent        = String(matchedRow[workContentCol] || '');
                if (workTypeCol)    workType           = String(matchedRow[workTypeCol] || '');
                if (inspectorCol)   inspectorFromExcel = String(matchedRow[inspectorCol] || '');
                if (workerCol)      workerFromExcel    = String(matchedRow[workerCol] || '');
                if (teamCol)        teamFromExcel      = extractTeam(String(matchedRow[teamCol] || ''));
                if (locationCol)    locationFromExcel  = String(matchedRow[locationCol] || '');
                if (commentCol)     overallComment     = String(matchedRow[commentCol] || '');
                if (dateCol)        inspectionDateFromExcel = String(matchedRow[dateCol] || '');
                if (workNoCol)      workNoFromExcel    = String(matchedRow[workNoCol] || '');
                if (resultCol)      inspectionResult   = String(matchedRow[resultCol] || '') || inspectionResult;
              }
            }

            // 우선순위 병합
            if (teamFromExcel) team = teamFromExcel;                           // 팀명: 엑셀 > PDF
            if (!inspectionDate && inspectionDateFromExcel) {                  // 점검일시: PDF > 엑셀
              const m = inspectionDateFromExcel.match(/(\d{4}-\d{2}-\d{2})/);
              if (m) inspectionDate = m[1];
            }
            if (!location && locationFromExcel) location = locationFromExcel; // 작업장소: PDF > 엑셀
            if (!workNo && workNoFromExcel) workNo = workNoFromExcel;          // 작업번호: PDF > 엑셀

            results.push({ fileName: f.originalname, inspectionDate, team, location, workDateTime, workNo, workContent, workType, inspectionMethod, inspectionResult, defectCount, imageUrls, inspector: inspectorFromExcel, workerName: workerFromExcel, overallComment });
          } catch (e: any) {
            console.error('[bulk-parse] 파일 처리 오류:', f.originalname, e.message);
            results.push({ fileName: f.originalname, error: e.message, inspectionDate: '', team: '', location: '', workDateTime: '', workNo: '', workContent: '', workType: '', inspectionMethod: '', inspectionResult: '양호', defectCount: 0, imageUrls: [], inspector: '', workerName: '', overallComment: '' });
          }
        }

        results.sort((a, b) => (a.inspectionDate || '').localeCompare(b.inspectionDate || ''));
        res.json({ results, excelData, excelHeaders: excelData.length > 0 ? Object.keys(excelData[0]) : [] });
      } catch (e: any) {
        console.error('[bulk-parse] 오류:', e);
        res.status(500).json({ message: e.message });
      }
    }
  );

  // 일괄 등록
  app.post('/api/safety-inspections/bulk-create', requireEditor, async (req: any, res: any) => {
    try {
      const items: any[] = req.body;
      if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ message: "등록할 데이터가 없습니다" });
      let created = 0;
      for (const item of items) {
        console.log(`[bulk-create] title="${item.title}" images=${JSON.stringify(item.images?.length ?? 0)}개`);
        await storage.createSafetyInspection({ ...item, createdBy: req.user?.username || null });
        created++;
      }
      res.json({ created });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // === FILE UPLOAD (Excel, etc.) ===
  const fileUpload = multer({
    storage: multer.memoryStorage(),
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

  app.post('/api/upload/file', requireEditor, fileUpload.single('file'), async (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const cleanName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const ext = safeExt(cleanName, ALLOWED_EXCEL_EXTS) || ".xlsx";
    const filename = `file-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
    let fileUrl: string;
    if (objUrl) {
      fileUrl = objUrl;
    } else {
      fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      fileUrl = `/uploads/${filename}`;
    }
    res.json({ fileUrl, fileName: cleanName });
  });

  // === NOTICES ===
  app.get(api.notices.list.path, isAuthenticated, async (req: any, res) => {
    const category = req.query.category as string;
    const headquarters = req.query.headquarters as string | undefined;
    const notices = await storage.getNotices(category, headquarters);
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

  // === SAFETY COST PROJECT INFO SETTINGS ===
  app.get("/api/settings/safety-cost-project-info", isAuthenticated, async (_req, res) => {
    try {
      const [projectName, contractor, totalAmount, supervisor] = await Promise.all([
        storage.getSetting("safety_cost_project_name"),
        storage.getSetting("safety_cost_contractor"),
        storage.getSetting("safety_cost_total_amount"),
        storage.getSetting("safety_cost_supervisor"),
      ]);
      res.json({ projectName: projectName || "", contractor: contractor || "", totalAmount: totalAmount || "", supervisor: supervisor || "" });
    } catch (e: any) { res.status(500).json({ message: e?.message || "조회 실패" }); }
  });

  app.post("/api/settings/safety-cost-project-info", requireAdmin, async (req, res) => {
    try {
      const { projectName = "", contractor = "", totalAmount = "", supervisor = "" } = req.body;
      await Promise.all([
        storage.setSetting("safety_cost_project_name", projectName),
        storage.setSetting("safety_cost_contractor", contractor),
        storage.setSetting("safety_cost_total_amount", totalAmount),
        storage.setSetting("safety_cost_supervisor", supervisor),
      ]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e?.message || "저장 실패" }); }
  });

  // ── 결재 서명 설정 ──────────────────────────────────────────────
  app.get("/api/settings/approval-signatures", isAuthenticated, async (_req, res) => {
    try {
      const [manager, reviewer, approver] = await Promise.all([
        storage.getSetting("approval_sign_manager"),
        storage.getSetting("approval_sign_reviewer"),
        storage.getSetting("approval_sign_approver"),
      ]);
      res.json({
        manager: manager?.value || null,
        reviewer: reviewer?.value || null,
        approver: approver?.value || null,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/settings/approval-signatures", requireAdmin, async (req: any, res) => {
    try {
      const { manager, reviewer, approver } = req.body;
      const ops: Promise<any>[] = [];
      if (manager !== undefined) ops.push(storage.setSetting("approval_sign_manager", manager || ""));
      if (reviewer !== undefined) ops.push(storage.setSetting("approval_sign_reviewer", reviewer || ""));
      if (approver !== undefined) ops.push(storage.setSetting("approval_sign_approver", approver || ""));
      await Promise.all(ops);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    const headquarters = req.query.headquarters as string | undefined;
    const equipment = await storage.getSafetyEquipment(headquarters);
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
    const headquarters = req.query.headquarters as string | undefined;
    const inspections = await storage.getSafetyInspections(headquarters);
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

  // ─────────────────────────────────────────────────────────────────────────────
  //  공통 이메일 헬퍼 (현장경영팀 점검용)
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * 체크리스트 표 + 사진 행을 생성한다.
   * photoLabel : 사진 행 왼쪽 셀 텍스트 (줄바꿈은 <br> 사용)
   * cidCounter : CID 중복 방지용 mutable 배열 (cidCounter[0] 값 사용 후 증가)
   */
  async function buildInspectionTable(
    checklistArr: Array<{ item: string; status: string }>,
    imagesArr: string[],
    photoLabel: string,
    allAttachments: any[],
    cidCounter: { n: number },
  ): Promise<string> {
    const ITEM_LABEL: Record<string, string> = {
      "검전기 사용":                 "누전확인<br>(검전기)",
      "안전모 착용":                 "안전모<br>착용",
      "안전화 착용":                 "안전화<br>착용",
      "안전대 착용방법":             "안전대착용<br>(작업지침)",
      "이동식사다리 작업지침 준수":  "이동식사다리<br>안전작업",
      "고임목 사용":                 "경사로<br>주차방법",
      "2인1조 준수":                 "2인1조",
      "작업(절연)장갑 착용":         "작업장갑<br>또는<br>절연장갑",
      "라바콘설치":                  "도로주차<br>작업표시<br>(라바콘)",
      "유해위험요인 확인":           "유해&#8226;위험<br>요인제거",
      "관계수급인 고위험 작업 입회": "고위험작업<br>입회<br>(수급사)",
      "입회 임무 준수":              "위험작업<br>입회여부<br>(수급사)",
      "고위험 작업절차 준수":        "입회자<br>업무준수<br>(수급사)",
    };
    const CW = 58;  const GW = 88;
    const thH  = `border:1px solid #aaa;padding:5px 3px;background:#dce6f1;font-size:10px;font-weight:bold;text-align:center;vertical-align:middle;line-height:1.4;`;
    const thG  = `border:1px solid #aaa;padding:5px 6px;background:#e2efda;font-size:11px;font-weight:bold;text-align:center;vertical-align:middle;white-space:nowrap;`;
    const tdPh = `border:1px solid #aaa;padding:8px;vertical-align:top;`;
    const numCols = checklistArr.length;
    const tblW   = GW + CW * numCols;

    const headerCells = checklistArr.map(c =>
      `<th width="${CW}" style="${thH}">${ITEM_LABEL[c.item] ?? c.item}</th>`
    ).join("");

    const resultCells = checklistArr.map(c => {
      const display = c.status === "양호" ? "준수" : c.status === "미점검" ? "해당없음" : "미흡";
      const bold    = c.status === "미흡"
        ? `color:#c0392b;font-weight:bold;`
        : c.status === "양호" ? `color:#1a56db;font-weight:bold;` : `color:#555;`;
      return `<td width="${CW}" style="border:1px solid #aaa;padding:6px 2px;font-size:11px;text-align:center;vertical-align:middle;${bold}">${display}</td>`;
    }).join("");

    // 사진 로드
    let photoContent = `<span style="font-size:11px;color:#888;">(사진 없음)</span>`;
    if (imagesArr.length > 0) {
      try {
        const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
        const objSvc = new ObjectStorageService();
        const imgTags: string[] = [];
        for (const imgPath of imagesArr) {
          try {
            const gcsFile = await objSvc.getObjectEntityFile(imgPath);
            const [buf]   = await (gcsFile as any).download();
            const cid     = `photo_${cidCounter.n++}@insp`;
            const ext     = imgPath.toLowerCase().endsWith(".png") ? "png" : "jpeg";
            allAttachments.push({
              filename: `photo_${cidCounter.n}.${ext}`,
              content: buf as Buffer,
              cid,
              contentType: `image/${ext}`,
              contentDisposition: "inline",
            });
            imgTags.push(
              `<td style="padding:1px;"><img src="cid:${cid}" alt="점검사진" style="width:280px;height:210px;object-fit:cover;display:block;border:1px solid #ccc;" /></td>`
            );
          } catch { /* 개별 사진 실패 무시 */ }
        }
        if (imgTags.length > 0) {
          // 3장씩 가로로 배열
          const rows: string[] = [];
          for (let i = 0; i < imgTags.length; i += 3) {
            const rowCells = imgTags.slice(i, i + 3).join("");
            rows.push(`<tr>${rowCells}</tr>`);
          }
          photoContent = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.join("")}</table>`;
        }
      } catch { /* ObjectStorage 접근 실패 */ }
    }

    return `
<table width="${tblW}" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px;font-family:맑은고딕,Arial,sans-serif;">
  <tr>
    <th width="${GW}" style="${thG}">구분</th>${headerCells}
  </tr>
  <tr>
    <td width="${GW}" style="${thG}">점검결과</td>${resultCells}
  </tr>
  <tr>
    <td width="${GW}" style="${thG};padding:8px 4px;line-height:1.6;">${photoLabel}</td>
    <td colspan="${numCols}" style="${tdPh}">${photoContent}</td>
  </tr>
</table>`;
  }

  /** 페널티 표 HTML */
  function buildPenaltyTable(): string {
    const pTh  = `border:1px solid #aaa;padding:6px 10px;background:#1e3a5f;color:#fff;font-size:11px;font-weight:bold;text-align:center;vertical-align:middle;`;
    const pTdL = `border:1px solid #aaa;padding:6px 10px;font-size:11px;vertical-align:middle;background:#fafafa;`;
    const pTdC = `border:1px solid #aaa;padding:6px 10px;font-size:11px;text-align:left;vertical-align:middle;`;
    const r1  = `<b style="color:#c0392b;">『1회』</b> → 서면경고`;
    const r2  = `<b style="color:#c0392b;">『2회』</b> → 서면경고`;
    const r3a = `<b style="color:#c0392b;">『3회』</b> → <b style="color:#c0392b;">서면경고 및 인사위원회</b>`;
    const r3b = `<b style="color:#c0392b;">『3회』</b> → <b style="color:#c0392b;">KPI(안전점검) 최하점(1.2점) 부여</b>`;
    return `
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:맑은고딕,Arial,sans-serif;width:100%;max-width:700px;">
  <tr>
    <th style="${pTh}">세부내역</th>
    <th style="${pTh}">벌칙사항</th>
    <th style="${pTh}">벌칙대상</th>
  </tr>
  <tr>
    <td style="${pTdL}" rowspan="4">
      13개 체크리스트 항목 중 <b>미준수 사례 적용</b><br>
      &nbsp;- 안전관리팀 / 현장경영팀 점검 시 반영<br>
      &nbsp;- 점검 항목 <b>1개 이상 적발 시</b>
    </td>
    <td style="${pTdC}">${r1}</td>
    <td style="${pTdC}" rowspan="3">팀장<br>미준수자</td>
  </tr>
  <tr>
    <td style="${pTdC}">${r2}</td>
  </tr>
  <tr>
    <td style="${pTdC}">${r3a}</td>
  </tr>
  <tr>
    <td style="${pTdC}">${r3b}</td>
    <td style="${pTdC}">본부</td>
  </tr>
</table>`;
  }

  /** 공통 이메일 footer HTML */
  function buildEmailFooter(): string {
    const L = (t: string) => `<p style="margin:2px 0;font-family:맑은고딕,Arial,sans-serif;font-size:11pt;line-height:1.7;">${t}</p>`;
    return `
${L(`<b style="color:#c0392b;">■ 안전관리위반시 페널티 부여안내</b>`)}
${L(`&#8251; <b style="color:#c0392b;">'3진 아웃제'</b> 운영(발생 시)`)}
${buildPenaltyTable()}
${L(`&#8251; 미준수 사례 발생 시 <b style="color:#c0392b;">'시정조치요구서'</b> 발행 (본사 → 본부 또는 본부 → 운용팀)`)}
${L(`&#8251; 본부 내 <b style="color:#c0392b;">'3진 아웃'</b> 발생 시 <b>KPI(안전점검 항목) 2.2점</b> 부여, 2회 이상 발생 시에는 <b style="color:#c0392b;">0점</b> 부여`)}
${L(`&#8251; 팀장에 대한 <b style="color:#c0392b;">'3진 아웃'</b>은 소속팀 누적 3회 적발 시 해당(인원에 상관없이 팀 적발 횟수)`)}
<br>
${L("현장안전점검 목적은 안전한 직장에서 사고없이 업무를 하기 위함으로 <b>적발이 목적은 아닙니다.</b>")}
<br>
${L("다만 본사에서 기공지한 상벌제도에 의해 위와같이 페널티가 부여되면 <b>불이익이 생길 수 있음</b>을 인지하시고")}
<br>
${L(`<b style="color:#1a6d1a;">안전보호구 착용, 안전수칙 준수는 100% 준수 될수 있도록 습관적으로 실천해주십시요.</b>`)}
${L(`<b>오늘도 안전한 대구본부 함께 만들어갑시다.</b>`)}
<br>
${L("감사합니다.")}`;
  }

  /** Gmail SMTP transporter 생성 */
  async function createMailTransporter(appPassword: string): Promise<any> {
    const nodemailer = (await import("nodemailer")).default;
    const t = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 587, secure: false,
      auth: { user: "fbwogk26@gmail.com", pass: appPassword },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000,
    });
    await t.verify();
    return t;
  }

  // === 기타 안전점검 이메일 발송 (단건 — 등록 폼에서 직접 호출) ===
  app.post("/api/other-inspections/send-email", isAuthenticated, async (req: any, res) => {
    try {
      const {
        inspectionDate, department, inspector, workerName,
        location, workContent, checklist, notes, images, subType,
      } = req.body;

      if (!inspectionDate || !department) {
        return res.status(400).json({ message: "점검일자와 부서명은 필수입니다." });
      }

      const appPassword = process.env.GMAIL_APP_PASSWORD;
      if (!appPassword) {
        return res.status(500).json({ message: "이메일 설정이 되어 있지 않습니다." });
      }

      const GMAIL_USER  = "fbwogk26@gmail.com";
      const FORWARD_TO  = "jaeha.ryu@ktmos.co.kr";

      const [year, month, day] = (inspectionDate as string).split("-");
      const yy  = year.slice(2);
      const m   = parseInt(month, 10);
      const d   = parseInt(day, 10);
      const mm  = String(m).padStart(2, "0");
      const dd  = String(d).padStart(2, "0");
      const DAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];
      const dayKr   = DAYS_KR[new Date(+year, m - 1, d).getDay()];

      const checklistArr: Array<{ item: string; status: string }> =
        Array.isArray(checklist) ? checklist : [];
      const poorCount     = checklistArr.filter(c => c.status === "미흡").length;
      const overallResult = poorCount > 0 ? "미흡" : "양호";

      const allAttachments: any[] = [];
      const cidCounter = { n: 0 };
      const imagesArr: string[] = Array.isArray(images) ? images : [];

      // 사진이 표 안 3번째 행에 들어가는 표 생성
      const photoLabel = `${department}<br>점검결과`;
      const inspectionTable = await buildInspectionTable(
        checklistArr, imagesArr, photoLabel, allAttachments, cidCounter
      );

      const L = (t: string) =>
        `<p style="margin:1px 0;font-family:맑은고딕,Arial,sans-serif;font-size:11pt;line-height:1.7;">${t}</p>`;

      const workerPart = workerName ? ` / 작업인원 : ${workerName}` : "";
      const resultHtml = overallResult === "미흡"
        ? `<span style="color:#c0392b;font-weight:bold;">미흡</span>`
        : `<span style="color:#1a6d1a;font-weight:bold;">양호</span>`;

      const htmlBody = `
<div style="font-family:맑은고딕,Arial,sans-serif;font-size:11pt;line-height:1.7;color:#000;">
${L(`<b style="color:#154360;">안녕하십니까? 현장경영팀 입니다.</b>`)}
<br>
${L(`kt안전보건실 및 본사 안전관리팀에서 현장 안전점검이 <b>강화</b>되어 시행되고 있습니다.`)}
${L(`현장 안전점검 <b style="color:#1a6d1a;">100% 준수</b> 될수 있도록 실천해주세요.`)}
<br>
${L(`대구본부 전직원 모두 &ldquo;<b style="color:#c0392b;">안전분야 STAR</b>&rdquo;가 되어주세요.`)}
<br>
${L(`<span style="color:#888;">══════════════════════════════════════════</span>`)}
<br>
${L(`${m}월 ${d}일 현장경영팀에서 진행한 <b style="color:#c0392b;">현장 안전점검 결과</b>에 대해서`)}
${L(`아래와 같이 공유하여 드리오니 작업 시 <b>보호구 착용</b>과 <b>안전수칙 준수</b>를 생활화하여 주시기 바랍니다.`)}
<br>
${L(`<b>■ 점검일자 : ${mm}.${dd}(${dayKr}) / 점검지역 : ${department}${workerPart}</b>`)}
${L(`<b>■ 점검결과 : ${resultHtml}</b>`)}
${workContent ? L(`■ 작업내용 : ${workContent}`) : ""}
${notes       ? L(`■ 비고 : ${notes}`) : ""}
${L(`<b>■ 점검내역(현장점검 체크리스트 ${checklistArr.length}개 항목 점검)</b>`)}
${inspectionTable}
${buildEmailFooter()}
</div>`;

      const fullHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"></head><body style="margin:20px;padding:0;">${htmlBody}</body></html>`;
      const subject  = `[공유] 대구본부 현장 안전점검 결과(\`${yy}.${m}.${d})_현장경영팀`;

      const transporter = await createMailTransporter(appPassword);
      await transporter.sendMail({
        from: `"현장경영팀" <${GMAIL_USER}>`,
        to: `${GMAIL_USER}, ${FORWARD_TO}`,
        subject,
        html: fullHtml,
        attachments: allAttachments,
      });
      console.log(`[SingleEmail] 발송 완료 → ${GMAIL_USER}, ${FORWARD_TO} | 제목: ${subject}`);
      res.json({ success: true, message: "이메일이 발송되었습니다." });
    } catch (e: any) {
      console.error("[SingleEmail] 오류:", e.message, e.code || "");
      res.status(500).json({ message: `이메일 발송 실패: ${e.message}` });
    }
  });

  // === 기타 안전점검 복수 선택 이메일 발송 (2건 이상 → 팀별 표 분리) ===
  app.post("/api/other-inspections/send-email-bulk", isAuthenticated, async (req: any, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0)
        return res.status(400).json({ message: "ids 배열이 필요합니다." });

      const GMAIL_USER  = "fbwogk26@gmail.com";
      const FORWARD_TO  = "jaeha.ryu@ktmos.co.kr";
      const appPassword = process.env.GMAIL_APP_PASSWORD;
      if (!appPassword) return res.status(500).json({ message: "이메일 설정이 되어 있지 않습니다." });

      // 현장경영팀 점검만 로드
      const rows: any[] = [];
      for (const id of ids) {
        const insp = await storage.getSafetyInspection(Number(id));
        if (insp && insp.inspectionType === "현장경영팀 점검") rows.push(insp);
      }
      if (rows.length === 0)
        return res.status(400).json({ message: "현장경영팀 점검 항목이 없습니다." });

      rows.sort((a, b) => a.inspectionDate.localeCompare(b.inspectionDate));

      const DAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];
      const L = (t: string) =>
        `<p style="margin:1px 0;font-family:맑은고딕,Arial,sans-serif;font-size:11pt;line-height:1.7;">${t}</p>`;

      // ── 헤더 정보 (날짜/지역/결과를 / 로 구분) ───────────────────────
      const dateLabels: string[]   = [];
      const regionLabels: string[] = [];
      const resultLabels: string[] = [];
      const workerLabels: string[] = [];

      for (const insp of rows) {
        const [iy, im, id2] = insp.inspectionDate.split("-");
        const mn = parseInt(im, 10);
        const dn = parseInt(id2, 10);
        const dy = DAYS_KR[new Date(+iy, mn - 1, dn).getDay()];
        const mm = String(mn).padStart(2, "0");
        const dd = String(dn).padStart(2, "0");
        dateLabels.push(`${mm}.${dd}(${dy})`);

        const dept = insp.department || insp.title?.split(" - ")[0] || insp.title || "";
        regionLabels.push(dept);

        const clArr: any[] = Array.isArray(insp.checklist) ? insp.checklist : [];
        const poor = clArr.filter((c: any) => c.status === "미흡").length;
        resultLabels.push(poor > 0
          ? `<span style="color:#c0392b;font-weight:bold;">미흡</span>`
          : `<span style="color:#1a6d1a;font-weight:bold;">양호</span>`);

        if (insp.workerName) workerLabels.push(`${dept} ${insp.workerName}`);
      }

      const firstDate = rows[0].inspectionDate;
      const lastDate  = rows[rows.length - 1].inspectionDate;
      const [fy, fm, fd] = firstDate.split("-");
      const [ly, lm, ld] = lastDate.split("-");
      const yy2 = fy.slice(2);
      const m0  = parseInt(fm, 10);  const d0 = parseInt(fd, 10);
      const mE  = parseInt(lm, 10);  const dE = parseInt(ld, 10);

      // 인트로 날짜 문구
      const singleDay = firstDate === lastDate;
      const introDate = singleDay
        ? `${m0}월 ${d0}일`
        : `${m0}월 ${d0}일~${mE}월 ${dE}일`;
      const subject = singleDay
        ? `[공유] 대구본부 현장 안전점검 결과(\`${yy2}.${m0}.${d0})_현장경영팀`
        : `[공유] 대구본부 현장 안전점검 결과(\`${yy2}.${m0}.${d0}~${mE}.${dE})_현장경영팀`;

      // 각 점검별 표 (사진이 표 3행으로 들어감)
      const allAttachments: any[] = [];
      const cidCounter = { n: 0 };
      const tables: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const insp = rows[i];
        const dept = insp.department || insp.title?.split(" - ")[0] || insp.title || "";
        const clArr: Array<{ item: string; status: string }> =
          Array.isArray(insp.checklist) ? insp.checklist : [];
        const imgsArr: string[] = Array.isArray(insp.images) ? insp.images : [];
        const photoLabel = `${dept}<br>점검사진`;
        const tbl = await buildInspectionTable(clArr, imgsArr, photoLabel, allAttachments, cidCounter);
        tables.push(tbl);
      }

      const htmlBody = `
<div style="font-family:맑은고딕,Arial,sans-serif;font-size:11pt;line-height:1.7;color:#000;">
${L(`<b style="color:#154360;">안녕하십니까? 현장경영팀 입니다.</b>`)}
<br>
${L(`kt안전보건실 및 본사 안전관리팀에서 현장 안전점검이 <b>강화</b>되어 시행되고 있습니다.`)}
${L(`현장 안전점검 <b style="color:#1a6d1a;">100% 준수</b> 될수 있도록 실천해주세요.`)}
<br>
${L(`대구본부 전직원 모두 &ldquo;<b style="color:#c0392b;">안전분야 STAR</b>&rdquo;가 되어주세요.`)}
<br>
${L(`<span style="color:#888;">══════════════════════════════════════════</span>`)}
<br>
${L(`${introDate} 현장경영팀에서 진행한 <b style="color:#c0392b;">현장 안전점검 결과</b>에 대해서`)}
${L(`아래와 같이 공유하여 드리오니 작업 시 <b>보호구 착용</b>과 <b>안전수칙 준수</b>를 생활화하여 주시기 바랍니다.`)}
<br>
${L(`<b>■ 점검일자 : ${dateLabels.join(" / ")}</b>`)}
${L(`<b>■ 점검지역 : ${regionLabels.join(" / ")}</b>`)}
${L(`<b>■ 점검결과 : ${resultLabels.join(" / ")}</b>`)}
${workerLabels.length > 0 ? L(`&nbsp;&nbsp;• 작업인원 : ${workerLabels.join(" / ")}`) : ""}
${L(`<b>■ 점검내역(현장점검 체크리스트 13개 항목 점검)</b>`)}
${tables.join("")}
${buildEmailFooter()}
</div>`;

      const fullHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"></head><body style="margin:20px;padding:0;">${htmlBody}</body></html>`;

      const transporter = await createMailTransporter(appPassword);
      await transporter.sendMail({
        from: `"현장경영팀" <${GMAIL_USER}>`,
        to: `${GMAIL_USER}, ${FORWARD_TO}`,
        subject,
        html: fullHtml,
        attachments: allAttachments,
      });
      console.log(`[BulkEmail] 발송 ${rows.length}건 → ${GMAIL_USER}, ${FORWARD_TO}`);
      res.json({ success: true, message: `${rows.length}건 이메일 발송 완료` });
    } catch (e: any) {
      console.error("[BulkEmail] 오류:", e.message);
      res.status(500).json({ message: `이메일 발송 실패: ${e.message}` });
    }
  });

  // Seed Data
  await seedDatabase();

  // === EDUCATION SESSIONS (교육일지) ===
  app.get("/api/education-sessions", isAuthenticated, async (req: any, res) => {
    const department = req.query.department as string | undefined;
    const headquarters = req.query.headquarters as string | undefined;
    const sessions = await storage.getEducationSessions(department, headquarters);
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

        const sheetName = dept.length > 20 ? dept.slice(0, 20) : dept;
        const sigSheet = workbook.addWorksheet(`${sheetName}_참석자명단`);
        const COL_W_G = [8, 14, 22, 8, 14, 22];
        COL_W_G.forEach((w, ci) => { sigSheet.getColumn(ci + 1).width = w; });

        // ── Row 1: 제목
        sigSheet.mergeCells("A1:F1");
        const titleCell = sigSheet.getCell("A1");
        titleCell.value = `"${title}" 참석자 명단`;
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };
        titleCell.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
        sigSheet.getRow(1).height = 34;

        // ── Row 2: 시행일시 / 부서명 (서명 현황 다이얼로그와 동일)
        sigSheet.mergeCells("A2:C2");
        const dateCell = sigSheet.getCell("A2");
        dateCell.value = `□ 시행일시: ${session.educationDate || date}`;
        dateCell.font = { size: 10 }; dateCell.alignment = { vertical: "middle" };
        sigSheet.mergeCells("D2:F2");
        const deptCell = sigSheet.getCell("D2");
        deptCell.value = `□ 부서명: ${dept}`;
        deptCell.font = { size: 10 }; deptCell.alignment = { vertical: "middle" };
        sigSheet.getRow(2).height = 20;

        // ── Row 3: 헤더 (gray)
        const G_SIG_ROWS = 20;
        const G_HDR = 3;
        ["순번","이름","서명","순번","이름","서명"].forEach((h, ci) => {
          const c = sigSheet.getRow(G_HDR).getCell(ci + 1);
          c.value = h; c.font = { bold: true, size: 10 };
          c.alignment = { horizontal: "center", vertical: "middle" };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
          c.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
        });
        sigSheet.getRow(G_HDR).height = 20;

        // ── Rows 4~23: 서명 행 (좌 1~20, 우 21~40)
        const makeSigBuf = async (sigData: string) => {
          if (!sigData || !sigData.startsWith("data:image/")) return null;
          const sharp = (await import("sharp")).default;
          const raw = Buffer.from(sigData.split(",")[1], "base64");
          const { data: pd, info: pi } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          const px = new Uint8Array(pd.buffer);
          for (let p = 0; p < px.length; p += 4) { if (px[p]>230 && px[p+1]>230 && px[p+2]>230) px[p+3]=0; }
          return sharp(Buffer.from(px), { raw:{ width:pi.width, height:pi.height, channels:4 } }).resize(360,90,{fit:"inside",withoutEnlargement:true}).png().toBuffer();
        };

        for (let i = 0; i < G_SIG_ROWS; i++) {
          const row = sigSheet.getRow(G_HDR + 1 + i);
          row.height = 38;
          const b = (cell: ExcelJS.Cell) => {
            cell.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
          };

          const lNum = row.getCell(1); lNum.value = i+1;
          lNum.alignment = { horizontal:"center", vertical:"middle" }; b(lNum);
          const lName = row.getCell(2);
          lName.alignment = { horizontal:"center", vertical:"middle" }; b(lName);
          b(row.getCell(3));

          if (signatures[i]) {
            lName.value = signatures[i].signerName;
            try {
              const buf = await makeSigBuf(signatures[i].signatureData);
              if (buf) {
                const imgId = workbook.addImage({ base64: buf.toString("base64"), extension: "png" });
                (sigSheet as any).addImage(imgId, { tl:{col:2, row:G_HDR+i}, br:{col:3, row:G_HDR+1+i}, editAs:"oneCell" });
              }
            } catch { /* skip */ }
          }

          const rIdx = i + G_SIG_ROWS;
          const rNum = row.getCell(4); rNum.value = i+G_SIG_ROWS+1;
          rNum.alignment = { horizontal:"center", vertical:"middle" }; b(rNum);
          const rName = row.getCell(5);
          rName.alignment = { horizontal:"center", vertical:"middle" }; b(rName);
          b(row.getCell(6));

          if (signatures[rIdx]) {
            rName.value = signatures[rIdx].signerName;
            try {
              const buf = await makeSigBuf(signatures[rIdx].signatureData);
              if (buf) {
                const imgId = workbook.addImage({ base64: buf.toString("base64"), extension: "png" });
                (sigSheet as any).addImage(imgId, { tl:{col:5, row:G_HDR+i}, br:{col:6, row:G_HDR+1+i}, editAs:"oneCell" });
              }
            } catch { /* skip */ }
          }
        }

        // ── 하단 요약 (대상인원 / 서명완료)
        const summaryRow = G_HDR + G_SIG_ROWS + 1;
        sigSheet.mergeCells(`A${summaryRow}:C${summaryRow}`);
        const sumL = sigSheet.getCell(`A${summaryRow}`);
        sumL.value = `대상인원: ${session.totalParticipants || 0}명`;
        sumL.font = { size: 10 }; sumL.alignment = { horizontal: "right", vertical: "middle" };
        sigSheet.mergeCells(`D${summaryRow}:F${summaryRow}`);
        const sumR = sigSheet.getCell(`D${summaryRow}`);
        sumR.value = `서명완료: ${signatures.length}명`;
        sumR.font = { size: 10, bold: true }; sumR.alignment = { horizontal: "right", vertical: "middle" };
        sigSheet.getRow(summaryRow).height = 18;

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

        // Photo area: 8 rows
        const G_PHOTO_ROWS = 8;
        const G_PHOTO_ROW_H = 28;
        const photoStartRow = currentRow;
        const photoEndRow = currentRow + G_PHOTO_ROWS - 1;
        photoSheet.mergeCells(`A${photoStartRow}:D${photoEndRow}`);
        photoSheet.mergeCells(`E${photoStartRow}:H${photoEndRow}`);
        for (let r = photoStartRow; r <= photoEndRow; r++) {
          photoSheet.getRow(r).height = G_PHOTO_ROW_H;
          photoSheet.getRow(r).getCell(1).border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
          photoSheet.getRow(r).getCell(5).border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
        }

        // Embed photos (sharp로 리사이즈)
        const images = session.images || [];
        for (let pi = 0; pi < Math.min(images.length, 2); pi++) {
          try {
            const objectFile = await objService.getObjectEntityFile(images[pi]);
            const [rawBuf] = await objectFile.download();
            const sharp = (await import("sharp")).default;
            const procBuf = await sharp(rawBuf).rotate().resize(700, 460, { fit:"inside", withoutEnlargement:true }).jpeg({ quality:92, mozjpeg:true }).toBuffer();
            const imageId = workbook.addImage({ base64: procBuf.toString("base64"), extension: "jpeg" });
            if (pi === 0) {
              (photoSheet as any).addImage(imageId, { tl:{col:0, row:photoStartRow-1}, br:{col:4, row:photoEndRow}, editAs:"oneCell" });
            } else {
              (photoSheet as any).addImage(imageId, { tl:{col:4, row:photoStartRow-1}, br:{col:8, row:photoEndRow}, editAs:"oneCell" });
            }
          } catch (e) {
            console.error(`Failed to embed photo ${pi} for ${dept}:`, e);
          }
        }

        currentRow = photoEndRow + 1;

        // 캡션 행
        const labelRowNum = currentRow;
        photoSheet.mergeCells(`A${labelRowNum}:D${labelRowNum}`);
        photoSheet.mergeCells(`E${labelRowNum}:H${labelRowNum}`);
        const labelLeft = photoSheet.getCell(`A${labelRowNum}`);
        labelLeft.value = "교육 실시 사진";
        labelLeft.font = { bold: true, size: 9 };
        labelLeft.alignment = { horizontal: "center", vertical: "middle" };
        labelLeft.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
        const labelRight = photoSheet.getCell(`E${labelRowNum}`);
        labelRight.value = "교육 실시 사진";
        labelRight.font = { bold: true, size: 9 };
        labelRight.alignment = { horizontal: "center", vertical: "middle" };
        labelRight.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
        photoSheet.getRow(labelRowNum).height = 20;
        currentRow++;

        // 부서 간 여백
        photoSheet.getRow(currentRow).height = 8;
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

      // 3) 합동안전보건점검 서명
      const jointSigs = await storage.getAllJointInspectionSignaturesWithInspection();
      const inspectionResult = jointSigs.map(s => ({
        id: `insp_${s.id}`,
        rawId: s.id,
        type: "inspection" as const,
        sessionTitle: `합동점검 — ${s.siteName} (${s.subcontractor})`,
        sessionDate: s.inspectionDate,
        sessionDepartment: s.subcontractor,
        signerName: s.signerName,
        signerDepartment: s.signerDepartment ?? "",
        signatureData: s.signatureData,
        signedAt: s.signedAt ? s.signedAt.toISOString() : null,
        ipAddress: null,
        userAgent: null,
        consentAgreed: null,
        integrityHash: null,
        signerRole: s.signerRole ?? "",
      }));

      // 최신순 정렬
      const combined = [...eduResult, ...equipResult, ...inspectionResult].sort((a, b) => {
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
      } else if (rawId.startsWith("insp_")) {
        const sigId = Number(rawId.replace("insp_", ""));
        await storage.deleteJointInspectionSignature(sigId);
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
      const headquarters = req.query.headquarters as string | undefined;
      if (search) {
        const results = await storage.searchChemicals(search, headquarters);
        return res.json(results);
      }
      const all = await storage.getChemicals(headquarters);
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
      const headquarters = req.query.headquarters as string | undefined;
      const results = await storage.getMusculoskeletalAssessments(headquarters);
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
      const headquartersExcel = req.query.headquarters as string | undefined;

      let assessments = await storage.getRiskAssessments(assessmentType || undefined, headquartersExcel);
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
      const headquarters = req.query.headquarters as string | undefined;
      const results = await storage.getRiskAssessments(type || undefined, headquarters);
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

  // === 위험성평가 결과 업로드 ===
  app.post('/api/risk-assessment-results/upload', requireEditor, reportUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "엑셀 파일이 없습니다" });
      const label = req.body.label || "위험성평가 결과";

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);

      // 첫 번째 시트를 메인 데이터로 사용
      const sheet = wb.worksheets[0];
      if (!sheet) return res.status(400).json({ message: "시트를 찾을 수 없습니다" });

      function getCellText(cell: any): string {
        const v = cell?.value;
        if (v == null) return "";
        if (typeof v === 'object' && v.richText) return v.richText.map((r: any) => r.text || "").join('');
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === 'object' && v.result !== undefined) return String(v.result ?? "");
        if (typeof v === 'object' && v.formula) return String(v.result ?? "");
        return String(v);
      }
      function getCellNum(cell: any): number | null {
        const v = cell?.value;
        if (v == null) return null;
        if (typeof v === 'number') return v;
        if (typeof v === 'object' && v.result !== undefined) return Number(v.result) || null;
        return Number(v) || null;
      }

      // ── 원본 시트 전체 저장 (rawSheet) ──
      const rawHeaders: string[] = [];
      const rawRows: any[][] = [];
      sheet.eachRow((row, ri) => {
        const cells: any[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          cells.push(getCellText(cell));
        });
        if (ri === 1) {
          rawHeaders.push(...cells);
        } else {
          if (cells.some(c => c !== "")) rawRows.push(cells);
        }
      });

      // ── 분석용 rows 파싱 ──
      const rows: any[] = [];
      sheet.eachRow((row, ri) => {
        if (ri === 1) return;
        const c = (i: number) => row.getCell(i);
        const team = getCellText(c(4));
        const registrant = getCellText(c(5));
        if (!team && !registrant) return;
        rows.push({
          no: getCellNum(c(1)),
          category: getCellText(c(2)),
          division: getCellText(c(3)),
          team,
          registrant,
          registeredAt: getCellText(c(6)),
          supervisor: getCellText(c(7)),
          status: getCellText(c(8)),
          equipmentId: getCellText(c(9)),
          equipmentName: getCellText(c(10)),
          location: getCellText(c(14)),
          responsibleTask: getCellText(c(15)),
          process: getCellText(c(16)),
          hazardCondition: getCellText(c(17)),
          hazardType: getCellText(c(18)),
          relatedLaw: getCellText(c(19)),
          currentControls: getCellText(c(20)),
          frequency: getCellNum(c(21)),
          severity: getCellNum(c(22)),
          riskScore: getCellNum(c(23)),
          improvementMeasures: getCellText(c(24)),
          plannedDate: getCellText(c(25)),
          completionDate: getCellText(c(26)),
          afterFrequency: getCellNum(c(27)),
          afterSeverity: getCellNum(c(28)),
          afterRiskScore: getCellNum(c(29)),
        });
      });

      if (rows.length === 0) return res.status(400).json({ message: "데이터가 없습니다" });

      const upload = await storage.createRiskAssessmentResultUpload({
        label,
        totalRows: rows.length,
        rows: rows as any,
        rawSheet: { headers: rawHeaders, rows: rawRows } as any,
        uploadedBy: req.user?.username || null,
      });
      res.json(upload);
    } catch (e: any) {
      console.error('risk-assessment-results upload error:', e.message);
      res.status(500).json({ message: e.message });
    }
  });

  app.get('/api/risk-assessment-results', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const uploads = await storage.getRiskAssessmentResultUploads(headquarters);
      res.json(uploads);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/risk-assessment-results/:id', isAuthenticated, async (req: any, res) => {
    try {
      const upload = await storage.getRiskAssessmentResultUpload(parseInt(req.params.id));
      if (!upload) return res.status(404).json({ message: "없음" });
      res.json(upload);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/risk-assessment-results/:id', requireEditor, async (req: any, res) => {
    try {
      await storage.deleteRiskAssessmentResultUpload(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/risk-assessment-results/:id/export', isAuthenticated, async (req: any, res) => {
    try {
      const upload = await storage.getRiskAssessmentResultUpload(parseInt(req.params.id));
      if (!upload) return res.status(404).json({ message: "없음" });

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'SafeBoard';
      wb.lastModifiedBy = req.user?.name || req.user?.username || 'system';
      const rows: any[] = (upload.rows as any[]) || [];

      // ── 자동 제목 생성 (상/하반기) ──
      const now = new Date();
      const yy = now.getFullYear() - 2000;
      const mo = now.getMonth() + 1;
      const half = mo <= 6 ? '상반기' : '하반기';
      const autoTitle = `${yy}년 ${half} 정기 위험성평가 결과`;

      // ── 스타일 헬퍼 ──
      const FONT = '맑은 고딕';
      const C = {
        // 팀/고정 헤더: 진한 남색 계열
        hdrTeam:   'FF1F3864',  // 진한 남색 (텍스트 흰색)
        hdrTask:   'FF2E75B6',  // 파란색
        hdrStatus: 'FF375623',  // 진한 녹색
        hdrGray:   'FF404040',  // 진한 회색
        // 데이터 행 교대
        rowEven:   'FFFFFFFF',
        rowOdd:    'FFF0F4FA',
        // 소계/합계
        subtotal:  'FFDCE6F1',
        total:     'FFD6DCE4',
        // 다운로드 내역
        dlHeader:  'FF7030A0',
        dlEven:    'FFFFFFFF',
        dlOdd:     'FFF3EDF7',
        // 원본데이터
        rawHeader: 'FF833C00',
        rawOdd:    'FFFFF2CC',
        // 제목
        titleBg:   'FF1F3864',
      };

      function fill(argb: string) {
        return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } };
      }
      const borderThin  = { style: 'thin'   as const, color: { argb: 'FFB0B8C0' } };
      const borderMed   = { style: 'medium' as const, color: { argb: 'FF8090A0' } };
      const allBorders  = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };
      const medBorders  = { top: borderMed,  left: borderMed,  bottom: borderMed,  right: borderMed  };

      // 제목 행 추가 (merge, 진한 배경)
      function addTitleRow(ws: any, title: string, colCount: number, subtitle?: string) {
        ws.mergeCells(1, 1, 1, colCount);
        const tc = ws.getCell(1, 1);
        tc.value = title;
        tc.fill = fill(C.titleBg);
        tc.font = { name: FONT, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        tc.alignment = { horizontal: 'center', vertical: 'middle' };
        tc.border = medBorders;
        ws.getRow(1).height = 32;
        if (subtitle) {
          ws.mergeCells(2, 1, 2, colCount);
          const sc = ws.getCell(2, 1);
          sc.value = subtitle;
          sc.fill = fill('FF2E4057');
          sc.font = { name: FONT, size: 10, color: { argb: 'FFCDD8E3' } };
          sc.alignment = { horizontal: 'center', vertical: 'middle' };
          ws.getRow(2).height = 20;
          return 3; // 헤더 시작 행
        }
        return 2;
      }

      // 헤더 행 설정
      function setHeader(ws: any, rowNum: number, cols: string[], bgArgbs: string[]) {
        const row = ws.getRow(rowNum);
        cols.forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v;
          cell.fill = fill(bgArgbs[i] || C.hdrGray);
          cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = medBorders;
        });
        row.height = 22;
        row.commit();
      }

      // 데이터 행 설정
      function setDataRow(ws: any, rowNum: number, values: (string|number|null)[], isOdd: boolean, opts?: { bold?: boolean; bgArgb?: string; fontSize?: number }) {
        const row = ws.getRow(rowNum);
        const bgArgb = opts?.bgArgb ?? (isOdd ? C.rowOdd : C.rowEven);
        values.forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v ?? '';
          cell.fill = fill(bgArgb);
          cell.font = { name: FONT, size: opts?.fontSize ?? 10, bold: opts?.bold ?? false };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = allBorders;
          if (i === 0) cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
        });
        row.height = 18;
        row.commit();
      }

      // 상태값 정규화
      function normalizeStatus(s: string) {
        return s === '자동종결' ? '승인요청' : (s || '기타');
      }

      const statuses = ['승인완료', '승인요청'];
      const taskSet: string[] = [];
      for (const r of rows) {
        const t = r.responsibleTask || "미분류";
        if (!taskSet.includes(t)) taskSet.push(t);
      }

      // ═══════════════════════════════════════════════
      // 시트1: 등록현황 요약
      // ═══════════════════════════════════════════════
      const ws1 = wb.addWorksheet('📊 등록현황 요약');
      const s1Cols = ['팀', ...taskSet, ...statuses, '합계'];
      ws1.columns = s1Cols.map((_, i) => ({ width: i === 0 ? 20 : 13 }));

      const s1HdrColors = [
        C.hdrTeam,
        ...taskSet.map(() => C.hdrTask),
        ...statuses.map(() => C.hdrStatus),
        C.hdrGray,
      ];

      const hdrStart1 = addTitleRow(ws1, autoTitle, s1Cols.length, `등록현황 요약 · 팀별 × 담당업무 × 승인상태`);
      setHeader(ws1, hdrStart1, s1Cols, s1HdrColors);

      const teamMap: Record<string, { tasks: Record<string, number>; statusMap: Record<string, number>; total: number }> = {};
      for (const r of rows) {
        const team = r.team || "기타";
        const task = r.responsibleTask || "미분류";
        const status = normalizeStatus(r.status);
        if (!teamMap[team]) teamMap[team] = { tasks: {}, statusMap: {}, total: 0 };
        teamMap[team].tasks[task] = (teamMap[team].tasks[task] || 0) + 1;
        teamMap[team].statusMap[status] = (teamMap[team].statusMap[status] || 0) + 1;
        teamMap[team].total++;
      }
      const teams = Object.keys(teamMap);

      let r1 = hdrStart1 + 1;
      for (const [ti, team] of teams.entries()) {
        const t = teamMap[team];
        const vals: (string|number|null)[] = [
          team,
          ...taskSet.map(tk => t.tasks[tk] || 0),
          ...statuses.map(s => t.statusMap[s] || 0),
          t.total,
        ];
        setDataRow(ws1, r1++, vals, ti % 2 === 1);
      }
      // 합계 행
      const totalVals: (string|number|null)[] = [
        '합 계',
        ...taskSet.map(tk => teams.reduce((s, tm) => s + (teamMap[tm].tasks[tk] || 0), 0)),
        ...statuses.map(s => teams.reduce((s2, tm) => s2 + (teamMap[tm].statusMap[s] || 0), 0)),
        rows.length,
      ];
      setDataRow(ws1, r1, totalVals, false, { bold: true, bgArgb: C.total });

      // ═══════════════════════════════════════════════
      // 시트2: 부서별 등록건수
      // ═══════════════════════════════════════════════
      const ws2 = wb.addWorksheet('👥 부서별 등록건수');
      const s2Cols = ['팀', '성명', '합계', ...taskSet];
      ws2.columns = s2Cols.map((_, i) => ({ width: i === 0 ? 20 : i === 1 ? 14 : i === 2 ? 10 : 13 }));

      const s2HdrColors = [C.hdrTeam, C.hdrTeam, C.hdrGray, ...taskSet.map(() => C.hdrTask)];
      const hdrStart2 = addTitleRow(ws2, autoTitle, s2Cols.length, `부서별 등록건수 · 인원별 담당업무 분야`);
      setHeader(ws2, hdrStart2, s2Cols, s2HdrColors);

      const personMap: Record<string, { team: string; name: string; tasks: Record<string, number>; total: number }> = {};
      for (const r of rows) {
        const key = `${r.team}||${r.registrant}`;
        if (!personMap[key]) personMap[key] = { team: r.team || "", name: r.registrant || "", tasks: {}, total: 0 };
        const task = r.responsibleTask || "미분류";
        personMap[key].tasks[task] = (personMap[key].tasks[task] || 0) + 1;
        personMap[key].total++;
      }
      const personList = Object.values(personMap).sort((a, b) => {
        if (a.team !== b.team) return a.team.localeCompare(b.team, 'ko');
        return b.total - a.total;
      });

      const teamGroups2: { team: string; persons: typeof personList }[] = [];
      for (const p of personList) {
        const last = teamGroups2[teamGroups2.length - 1];
        if (!last || last.team !== p.team) teamGroups2.push({ team: p.team, persons: [p] });
        else last.persons.push(p);
      }

      let r2 = hdrStart2 + 1;
      let oddIdx2 = 0;
      for (const grp of teamGroups2) {
        for (const p of grp.persons) {
          const vals: (string|number|null)[] = [p.team, p.name, p.total, ...taskSet.map(t => p.tasks[t] || 0)];
          setDataRow(ws2, r2++, vals, oddIdx2 % 2 === 1);
          oddIdx2++;
        }
        const teamTotal = grp.persons.reduce((s, p) => s + p.total, 0);
        const subVals: (string|number|null)[] = [`${grp.team} 소계`, '', teamTotal, ...taskSet.map(t => grp.persons.reduce((s, p) => s + (p.tasks[t] || 0), 0))];
        setDataRow(ws2, r2++, subVals, false, { bold: true, bgArgb: C.subtotal });
      }
      const totalVals2: (string|number|null)[] = ['합 계', '', rows.length, ...taskSet.map(t => rows.filter((r: any) => (r.responsibleTask || '미분류') === t).length)];
      setDataRow(ws2, r2, totalVals2, false, { bold: true, bgArgb: C.total });

      // ═══════════════════════════════════════════════
      // ═══════════════════════════════════════════════
      // 시트3: 원본 데이터 (rawSheet 우선, 없으면 기존 rows)
      // ═══════════════════════════════════════════════
      const ws3 = wb.addWorksheet('📋 원본 데이터');
      const rawSheetData = upload.rawSheet as { headers: string[]; rows: any[][] } | null | undefined;

      if (rawSheetData?.headers?.length && rawSheetData?.rows?.length) {
        // ── rawSheet 있음: 원본 그대로 재현 ──
        const colCount = rawSheetData.headers.length;
        ws3.columns = rawSheetData.headers.map((h: string) => ({
          width: Math.min(Math.max((h || '').length * 1.8 + 4, 10), 50),
        }));

        const hdrStart3 = addTitleRow(ws3, autoTitle, colCount, `원본 데이터 · 업로드: ${upload.label}  (${rawSheetData.rows.length}건)`);
        // 헤더 행
        setHeader(ws3, hdrStart3, rawSheetData.headers, rawSheetData.headers.map(() => C.rawHeader));

        let r3 = hdrStart3 + 1;
        for (const [i, dataRow] of rawSheetData.rows.entries()) {
          const rowObj = ws3.getRow(r3);
          const bgArgb = i % 2 === 1 ? C.rawOdd : C.rowEven;
          for (let ci = 0; ci < colCount; ci++) {
            const cell = rowObj.getCell(ci + 1);
            const v = dataRow[ci] ?? '';
            cell.value = v;
            cell.fill = fill(bgArgb);
            cell.font = { name: FONT, size: 10 };
            cell.border = allBorders;
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
          }
          rowObj.height = 18;
          rowObj.commit();
          r3++;
        }
      } else {
        // ── rawSheet 없음(구형 업로드): 기존 방식으로 표시 ──
        const rawCols = ['팀', '성명', '담당업무', '위험요인', '가능성', '중대성', '위험점수', '위험등급', '승인상태'];
        ws3.columns = [
          { width: 18 }, { width: 12 }, { width: 16 }, { width: 36 },
          { width: 9 }, { width: 9 }, { width: 9 }, { width: 10 }, { width: 12 },
        ];
        const hdrStart3 = addTitleRow(ws3, autoTitle, rawCols.length, `원본 데이터 · 업로드: ${upload.label}  (${rows.length}건)`);
        setHeader(ws3, hdrStart3, rawCols, rawCols.map(() => C.rawHeader));
        let r3 = hdrStart3 + 1;
        for (const [i, r] of rows.entries()) {
          const vals: (string|number|null)[] = [
            r.team || '', r.registrant || '', r.responsibleTask || '',
            r.hazardCondition || r.hazardFactor || '', r.frequency ?? '', r.severity ?? '',
            r.riskScore ?? '', r.riskLevel || '', normalizeStatus(r.status),
          ];
          const rowObj = ws3.getRow(r3);
          const bgArgb = i % 2 === 1 ? C.rawOdd : C.rowEven;
          vals.forEach((v, ci) => {
            const cell = rowObj.getCell(ci + 1);
            cell.value = v ?? '';
            cell.fill = fill(bgArgb);
            cell.font = { name: FONT, size: 10 };
            cell.border = allBorders;
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          });
          rowObj.height = 18;
          rowObj.commit();
          r3++;
        }
      }

      // ═══════════════════════════════════════════════
      // 시트4: 다운로드 내역 (누적)
      // ═══════════════════════════════════════════════
      // 먼저 현재 내역 DB에 저장
      await storage.addRiskAssessmentDownloadLog({
        title: autoTitle,
        uploadId: upload.id,
        uploadLabel: upload.label,
        totalRows: rows.length,
        downloadedBy: req.user?.name || req.user?.username || '알 수 없음',
      });
      // 전체 내역 조회
      const dlLogs = await storage.getRiskAssessmentDownloadLogs();

      const ws4 = wb.addWorksheet('📥 다운로드 내역');
      const dlCols = ['번호', '다운로드 제목', '업로드 파일명', '건수', '다운로드 일시', '담당자'];
      ws4.columns = [
        { width: 8 }, { width: 32 }, { width: 28 }, { width: 8 }, { width: 22 }, { width: 16 },
      ];
      const s4HdrColors = dlCols.map(() => C.dlHeader);
      const hdrStart4 = addTitleRow(ws4, '위험성평가 결과 다운로드 내역', dlCols.length, '누적 다운로드 이력');
      setHeader(ws4, hdrStart4, dlCols, s4HdrColors);

      let r4 = hdrStart4 + 1;
      for (const [i, log] of dlLogs.entries()) {
        const dt = new Date(log.downloadedAt);
        const dtStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        const vals: (string|number|null)[] = [
          dlLogs.length - i,
          log.title,
          log.uploadLabel || '',
          log.totalRows ?? 0,
          dtStr,
          log.downloadedBy || '',
        ];
        setDataRow(ws4, r4++, vals, i % 2 === 1, { bgArgb: i % 2 === 1 ? C.dlOdd : C.dlEven });
      }

      const buf = await wb.xlsx.writeBuffer();
      const safeLabel = (upload.label || '위험성평가결과').replace(/[/\\?*[\]:]/g, '_');
      const fileName = `${autoTitle}_${safeLabel}.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(Buffer.from(buf));
    } catch (e: any) {
      console.error('risk-assessment-results export error:', e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // === ACCIDENT REPORTS ===
  app.get('/api/accidents', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const reports = await storage.getAccidentReports(headquarters);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ message: "사고보고 목록 조회에 실패했습니다" });
    }
  });

  app.get('/api/accidents/stats', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const reports = await storage.getAccidentReports(headquarters);
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

  const accidentPhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowedMimes = ['image/jpeg','image/jpg','image/png','image/gif','image/webp','image/heic','image/heif','image/bmp','image/tiff'];
      const cleanName = file.originalname.replace(/\0/g, "");
      const ext = path.extname(cleanName).toLowerCase();
      const allowedExts = ['.jpg','.jpeg','.png','.gif','.webp','.heic','.heif','.bmp','.tiff','.tif'];
      if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`지원하지 않는 이미지 형식입니다: ${ext || file.mimetype}`));
      }
    }
  });

  app.post('/api/accidents/upload-photos', requireEditor, (req: any, res: any, next: any) => {
    accidentPhotoUpload.array('photos', 10)(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: "파일 크기가 너무 큽니다 (최대 20MB)" });
        return res.status(400).json({ message: err.message || "업로드 실패" });
      }
      next();
    });
  }, async (req: any, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "업로드된 파일이 없습니다" });
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
      const pdfParseAcc = (await import('pdf-parse/lib/pdf-parse.js' as any)).default;
      const pdfDataAcc = await pdfParseAcc(pdfBuffer);
      const fullText = pdfDataAcc.text.replace(/\s+/g, ' ');

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
    try {
      const headquarters = req.query.headquarters as string | undefined;
      res.json(await storage.getNearMissReports(headquarters));
    }
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
      const headquarters = req.query.headquarters as string | undefined;
      const reports = await storage.getNearMissReports(headquarters);
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
      const headquarters = req.query.headquarters as string | undefined;
      const requests = await storage.getNewEquipmentRequests(headquarters);
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
      if (existing.deliveryStatus === "배송완료") return res.status(403).json({ message: "배송완료된 항목은 수정할 수 없습니다" });
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
      if (existing.deliveryStatus === "배송완료") return res.status(403).json({ message: "배송완료된 항목은 삭제할 수 없습니다" });
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
    storage: multer.memoryStorage(),
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

    const pdfBuffer = req.file.buffer;

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
            const pdfParse3 = (await import('pdf-parse/lib/pdf-parse.js' as any)).default;
            const pdfData3 = await pdfParse3(pdfBuffer);
            pdfText = pdfData3.text.trim();
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
      const headquarters = req.query.headquarters as string | undefined;
      const list = await storage.getVehicles(headquarters);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "차량 목록 조회에 실패했습니다" });
    }
  });

  // 차량DB 현황 통계 (대시보드용)
  app.get('/api/vehicles/stats', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const list = await storage.getVehicles(headquarters);
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
      const { eq: eqOp } = await import('drizzle-orm');
      const uploadHq = req.body?.headquarters || '대구본부';

      // 해당 본부 데이터만 삭제
      await dbInst.delete(vTable).where(eqOp(vTable.headquarters, uploadHq));

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
          headquarters: String(r[9]).trim() || uploadHq,
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
      const headquarters = req.query.headquarters as string | undefined;
      const fines = await storage.getTrafficFines(headquarters);
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
      const headquarters = req.query.headquarters as string | undefined;
      const fines = await storage.getTrafficFines(headquarters);
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
      const headquarters = req.query.headquarters as string | undefined;
      const fines = await storage.getTrafficFines(headquarters);
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
    storage: multer.memoryStorage(),
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
      const headquarters = req.query.headquarters as string | undefined;
      const plans = await storage.getWorkPlans(headquarters);
      res.json(plans);
    } catch (error) {
      res.status(500).json({ message: "조회에 실패했습니다" });
    }
  });

  app.post('/api/work-plans/upload', isAuthenticated, workPlanUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });

      const processedFilename = `workplan_processed_${Date.now()}.xlsx`;
      const isCsv = req.file.originalname.toLowerCase().endsWith(".csv");

      // ===== 데이터 파싱 =====
      let tableRows: string[][] = [];

      if (isCsv) {
        // CSV 파싱
        const rawText = req.file.buffer.toString("utf-8");
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
        await workbook.xlsx.load(req.file.buffer);
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

      const procBuffer = await wb.xlsx.writeBuffer() as Buffer;

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

      // 오브젝트 스토리지 업로드 (항상 buffer 사용)
      const origMime = req.file.mimetype || "application/octet-stream";
      const origFilename = `workplan_${Date.now()}_orig${isCsv ? ".csv" : ".xlsx"}`;
      let finalOriginalUrl = await uploadToObjectStorage(req.file.buffer, origFilename, origMime);
      if (!finalOriginalUrl) {
        fs.writeFileSync(path.join(uploadDir, origFilename), req.file.buffer);
        finalOriginalUrl = `/uploads/${origFilename}`;
      }
      let finalProcessedUrl = await uploadToObjectStorage(Buffer.from(procBuffer), processedFilename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      if (!finalProcessedUrl) {
        fs.writeFileSync(path.join(uploadDir, processedFilename), procBuffer);
        finalProcessedUrl = `/uploads/${processedFilename}`;
      }

      const plan = await storage.createWorkPlan({
        title,
        originalFileName: req.file.originalname,
        originalFileUrl: finalOriginalUrl,
        processedFileUrl: finalProcessedUrl,
        emailDraft,
        sheetSummary,
        createdBy: req.user?.username,
        headquarters: req.body.headquarters || '대구본부',
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
          headquarters: (req as any).body?.headquarters || '대구본부',
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
          headquarters: (req as any).body?.headquarters || '대구본부',
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
        headquarters: req.body.headquarters || '대구본부',
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

  // ===== 산업안전보건협의체 =====
  const committeePhotoUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `committee_${Date.now()}${ext}`);
      },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('이미지 파일만 가능합니다'));
    },
  });

  app.get('/api/safety-committees', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const rows = await storage.getSafetyCommittees(headquarters);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/safety-committees/:id', isAuthenticated, async (req: any, res) => {
    try {
      const row = await storage.getSafetyCommittee(Number(req.params.id));
      if (!row) return res.status(404).json({ message: "없음" });
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/safety-committees', isAuthenticated, async (req: any, res) => {
    try {
      const data = { ...req.body, createdBy: req.user?.username };
      if (typeof data.attendees === 'string') data.attendees = JSON.parse(data.attendees);
      if (typeof data.photos === 'string') data.photos = JSON.parse(data.photos);
      const row = await storage.createSafetyCommittee(data);
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put('/api/safety-committees/:id', isAuthenticated, async (req: any, res) => {
    try {
      const data = { ...req.body };
      if (typeof data.attendees === 'string') data.attendees = JSON.parse(data.attendees);
      if (typeof data.photos === 'string') data.photos = JSON.parse(data.photos);
      const row = await storage.updateSafetyCommittee(Number(req.params.id), data);
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/safety-committees/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteSafetyCommittee(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/safety-committees/upload-photo', isAuthenticated, committeePhotoUpload.single('photo'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일 없음" });
      const url = `/uploads/${req.file.filename}`;
      res.json({ url, name: req.file.originalname });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 회의자료(PPT/PDF) 업로드 - object storage 우선, fallback → public-uploads
  const committeeMaterialUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/\.(ppt|pptx|pdf)$/i.test(file.originalname)) cb(null, true);
      else cb(new Error('PPT/PPTX/PDF 파일만 가능합니다'));
    },
  });

  // 회의록(Word/PDF) 업로드 - object storage 우선, fallback → local
  const committeeMinutesUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/\.(doc|docx|pdf)$/i.test(file.originalname)) cb(null, true);
      else cb(new Error('DOC/DOCX/PDF 파일만 가능합니다'));
    },
  });

  app.post('/api/safety-committees/upload-material', isAuthenticated, committeeMaterialUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일 없음" });
      let name = req.file.originalname;
      try { name = Buffer.from(name, 'latin1').toString('utf8'); } catch {}
      const ext = path.extname(name) || path.extname(req.file.originalname);
      const filename = `committee_mat_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype || 'application/octet-stream');
      if (objUrl) return res.json({ url: objUrl, name });
      // fallback → local public-uploads
      fs.writeFileSync(path.join(publicUploadsDir, filename), req.file.buffer);
      res.json({ url: `/public-uploads/${filename}`, name });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/safety-committees/upload-minutes', isAuthenticated, committeeMinutesUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일 없음" });
      let name = req.file.originalname;
      try { name = Buffer.from(name, 'latin1').toString('utf8'); } catch {}
      const ext = path.extname(name) || path.extname(req.file.originalname);
      const filename = `committee_min_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype || 'application/octet-stream');
      if (objUrl) return res.json({ url: objUrl, name });
      // fallback → local
      const isPdf = /\.pdf$/i.test(name);
      const destDir = isPdf ? publicUploadsDir : uploadDir;
      fs.writeFileSync(path.join(destDir, filename), req.file.buffer);
      const url = isPdf ? `/public-uploads/${filename}` : `/uploads/${filename}`;
      res.json({ url, name });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/safety-committees/:id/preview-minutes', isAuthenticated, async (req: any, res) => {
    try {
      const row = await storage.getSafetyCommittee(Number(req.params.id));
      if (!row?.meetingMinutesUrl) return res.status(404).json({ message: "회의록 파일 없음" });
      const filename = path.basename(row.meetingMinutesUrl);
      const filePath = path.join(uploadDir, filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "파일을 찾을 수 없습니다" });
      const result = await mammoth.convertToHtml({ path: filePath });
      res.json({ html: result.value });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ===== 합동안전보건점검 =====
  const jointInspectionPhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('이미지 파일만 가능합니다'));
    },
  });

  app.get('/api/joint-inspections', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const rows = await storage.getJointInspections(headquarters);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/joint-inspections/:id', isAuthenticated, async (req: any, res) => {
    try {
      const row = await storage.getJointInspection(Number(req.params.id));
      if (!row) return res.status(404).json({ message: "없음" });
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/joint-inspections', isAuthenticated, async (req: any, res) => {
    try {
      const data = { ...req.body, createdBy: req.user?.username };
      if (typeof data.checkItems === 'string') data.checkItems = JSON.parse(data.checkItems);
      if (typeof data.photos === 'string') data.photos = JSON.parse(data.photos);
      const row = await storage.createJointInspection(data);
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put('/api/joint-inspections/:id', isAuthenticated, async (req: any, res) => {
    try {
      const data = { ...req.body };
      if (typeof data.checkItems === 'string') data.checkItems = JSON.parse(data.checkItems);
      if (typeof data.photos === 'string') data.photos = JSON.parse(data.photos);
      const row = await storage.updateJointInspection(Number(req.params.id), data);
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/joint-inspections/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteJointInspection(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/joint-inspections/upload-photo', isAuthenticated, jointInspectionPhotoUpload.single('photo'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일 없음" });
      const ext = safeExt(req.file.originalname, ALLOWED_IMG_EXTS);
      const filename = `joint_${Date.now()}${ext}`;
      const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
      if (objUrl) return res.json({ url: objUrl, name: req.file.originalname });
      // fallback → local disk
      fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      res.json({ url: `/uploads/${filename}`, name: req.file.originalname });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 합동점검 참석자 서명
  app.get('/api/joint-inspections/:id/signatures', isAuthenticated, async (req: any, res) => {
    try {
      const sigs = await storage.getJointInspectionSignatures(Number(req.params.id));
      res.json(sigs);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/joint-inspections/:id/signatures', isAuthenticated, async (req: any, res) => {
    try {
      const { signerName, signerDepartment, signerRole, signerPosition, signatureData } = req.body;
      if (!signerName || !signatureData) return res.status(400).json({ message: "이름과 서명이 필요합니다" });
      const sig = await storage.createJointInspectionSignature({
        inspectionId: Number(req.params.id),
        signerName, signerDepartment, signerRole, signerPosition, signatureData,
      });
      res.json(sig);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/joint-inspection-signatures/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteJointInspectionSignature(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ===== 입회 관리 =====
  const attendanceUploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  app.get('/api/attendance/records', isAuthenticated, async (req: any, res) => {
    try {
      const hqRaw = req.query.headquarters;
      const headquarters = (typeof hqRaw === 'string' && hqRaw.trim()) ? hqRaw.trim() : undefined;
      console.log('[attendance/records] headquarters param:', JSON.stringify(hqRaw), '→', headquarters);
      const records = await storage.getAttendanceRecords({ headquarters });
      console.log('[attendance/records] returned count:', records.length);
      res.json(records);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/attendance/uploads', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const uploads = await storage.getAttendanceUploads(headquarters);
      res.json(uploads);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/attendance/upload', isAuthenticated, attendanceUploadMiddleware.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });

      const isCsv = req.file.originalname.toLowerCase().endsWith(".csv");
      let tableRows: string[][] = [];

      if (isCsv) {
        // BOM 제거 + 멀티라인 quoted 필드 지원 CSV 파서
        const rawText = req.file.buffer.toString("utf-8").replace(/^\uFEFF/, "");
        const rows: string[][] = [];
        let row: string[] = [];
        let field = "";
        let inQuotes = false;
        for (let i = 0; i < rawText.length; i++) {
          const ch = rawText[i];
          const next = rawText[i + 1];
          if (ch === '"') {
            if (inQuotes && next === '"') { field += '"'; i++; }
            else inQuotes = !inQuotes;
          } else if (ch === ',' && !inQuotes) {
            row.push(field.trim()); field = "";
          } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
            if (ch === '\r' && next === '\n') i++;
            row.push(field.trim());
            if (row.some(c => c)) rows.push(row);
            row = []; field = "";
          } else if (inQuotes && (ch === '\r' || ch === '\n')) {
            if (ch === '\r' && next === '\n') i++;
            field += ' ';
          } else {
            field += ch;
          }
        }
        if (field || row.length > 0) { row.push(field.trim()); if (row.some(c => c)) rows.push(row); }
        tableRows = rows;
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) return res.status(400).json({ message: "시트를 찾을 수 없습니다" });
        sheet.eachRow((row) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            let val = "";
            if (cell.value instanceof Date) {
              val = cell.value.toISOString().split("T")[0];
            } else if (cell.value !== null && cell.value !== undefined) {
              val = String(cell.value);
            }
            cells.push(val);
          });
          tableRows.push(cells);
        });
      }

      if (tableRows.length < 2) return res.status(400).json({ message: "데이터가 없습니다" });

      // 헤더 컬럼 매핑
      const headerRowRaw = tableRows[0].map(h => h.trim());
      const headerRow = headerRowRaw.map(h => h.toLowerCase());
      const findCol = (keywords: string[]) => headerRow.findIndex(h => keywords.some(k => h.includes(k)));

      console.log("[AttendanceUpload] headerRowRaw:", JSON.stringify(headerRowRaw.slice(0, 5)));

      // 점검대상 관리 CSV 형식 감지 (공사작업번호 / 순회점검단계 컬럼 존재)
      // toLowerCase 비교도 병행 (BOM/인코딩 이슈 방지)
      const isInspectionFormat = headerRowRaw.some(h =>
        h.includes("공사작업번호") || h.includes("순회점검단계") ||
        h.replace(/[\uFEFF\u200B]/g, "").includes("공사작업번호")
      );

      let dateCol: number, nameCol: number, companyCol: number, deptCol: number, typeCol: number, stationCol: number;

      if (isInspectionFormat) {
        // 점검대상 관리 형식: 순회점검대상자=입회자, 작업자=소속, 공사내용=부서, 순회점검단계=유형
        dateCol     = headerRowRaw.findIndex(h => h.includes("공사/작업시작일"));
        nameCol     = headerRowRaw.findIndex(h => h.includes("순회점검대상자"));
        companyCol  = headerRowRaw.findIndex(h => h === "작업자");
        deptCol     = headerRowRaw.findIndex(h => h.includes("공사내용"));
        typeCol     = headerRowRaw.findIndex(h => h.includes("순회점검단계"));
        stationCol  = headerRowRaw.findIndex(h => h.includes("국사명") || h.includes("국사"));
        if (nameCol === -1) nameCol = headerRowRaw.findIndex(h => h.includes("합동점검담당자"));
        if (nameCol === -1) nameCol = headerRowRaw.findIndex(h => h.includes("공사작업번호"));
      } else {
        dateCol    = findCol(["날짜", "date", "일자", "입회일"]);
        nameCol    = findCol(["이름", "성명", "name", "입회자"]);
        companyCol = findCol(["소속", "업체", "회사", "company", "기업"]);
        deptCol    = findCol(["부서", "dept", "팀", "department"]);
        typeCol    = findCol(["유형", "종류", "type", "구분", "입회유형", "입회종류"]);
        stationCol = findCol(["국사명", "국사", "station"]);
        if (nameCol === -1) return res.status(400).json({ message: "이름/성명 컬럼을 찾을 수 없습니다. 헤더에 '이름', '성명', '입회자' 중 하나가 있어야 합니다." });
      }

      // ISO 주차 계산
      function getISOWeek(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      }

      // 날짜 파싱
      function parseDate(val: string): Date | null {
        if (!val) return null;
        // YYYY-MM-DD
        let m = val.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
        if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
        // 엑셀 숫자 날짜 (44000 형식)
        const num = parseInt(val);
        if (!isNaN(num) && num > 40000 && num < 60000) {
          const excelEpoch = new Date(1899, 11, 30);
          const d = new Date(excelEpoch.getTime() + num * 86400000);
          return d;
        }
        return null;
      }

      // 직영작업 제외 (점검대상 형식일 때만)
      const workTypeCol = isInspectionFormat
        ? headerRowRaw.findIndex(h => h.includes("공사구분"))
        : -1;

      const allDataRows = tableRows.slice(1).filter(r => r.some(c => c.trim()));
      const dataRows = allDataRows.filter(r => {
        if (workTypeCol >= 0) {
          const workType = (r[workTypeCol] || "").trim();
          if (workType.includes("직영")) return false;
        }
        return true;
      });
      const excludedCount = allDataRows.length - dataRows.length;

      // 업로드 배치 생성
      const upload = await storage.createAttendanceUpload({
        fileName: req.file.originalname,
        totalCount: dataRows.length,
        createdBy: req.user?.username,
      });

      // 기존 저장된 미입회 사유 맵 (이름::날짜 → 사유) — 재업로드 시 승계
      const existingReasonMap = await storage.getAbsenceReasonMap();

      let insertedCount = 0;
      for (const row of dataRows) {
        let name = nameCol >= 0 ? (row[nameCol] || "").trim() : "";
        // 점검 형식: 이름이 없으면 공사작업번호를 식별자로 사용
        if (!name && isInspectionFormat) {
          const jobNoCol = headerRowRaw.findIndex(h => h.includes("공사작업번호"));
          name = jobNoCol >= 0 ? (row[jobNoCol] || "").trim() : "";
        }
        if (!name) continue;

        const rawDate = dateCol >= 0 ? (row[dateCol] || "").trim() : "";
        const parsedDate = parseDate(rawDate);
        const dateStr = parsedDate
          ? `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`
          : rawDate || new Date().toISOString().split("T")[0];

        const d = parsedDate || new Date();
        const weekNum = getISOWeek(d);
        const month = d.getMonth() + 1;
        const year = d.getFullYear();

        // 기존에 저장된 미입회 사유 승계
        const inheritedReason = existingReasonMap.get(`${name}::${dateStr}`) ?? null;

        await storage.createAttendanceRecord({
          uploadId: upload.id,
          attendanceDate: dateStr,
          name,
          company: companyCol >= 0 ? (row[companyCol] || "").trim() || null : null,
          department: deptCol >= 0 ? (row[deptCol] || "").trim() || null : null,
          stationName: stationCol >= 0 ? (row[stationCol] || "").trim() || null : null,
          attendanceType: typeCol >= 0 ? (row[typeCol] || "").trim() || null : null,
          weekNum,
          month,
          year,
          absenceReason: inheritedReason,
          createdBy: req.user?.username,
        });
        insertedCount++;
      }

      // 실제 삽입된 건수로 업데이트
      res.json({ message: "업로드 완료", count: insertedCount, excludedCount, uploadId: upload.id, isInspectionFormat });
    } catch (e: any) {
      console.error("[AttendanceUpload error]", e);
      res.status(500).json({ message: e.message || "업로드에 실패했습니다" });
    }
  });

  app.delete('/api/attendance/uploads/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAttendanceRecordsByUpload(id);
      await storage.deleteAttendanceUpload(id);
      res.json({ message: "삭제되었습니다" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 입회 기록 미입회 사유 저장
  app.put('/api/attendance/records/:id/reason', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { absenceReason } = req.body;
      await storage.updateAttendanceRecordReason(id, absenceReason ?? "");
      res.json({ message: "저장되었습니다" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 입회 기록 단건 삭제
  app.delete('/api/attendance/records/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAttendanceRecord(id);
      res.json({ message: "삭제되었습니다" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 입회 기록 일괄 삭제
  app.delete('/api/attendance/records', isAuthenticated, async (req: any, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "삭제할 항목을 선택하세요" });
      await storage.deleteAttendanceRecordsBulk(ids.map(Number));
      res.json({ message: `${ids.length}건 삭제되었습니다` });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── 온라인 교육 진도율 ──────────────────────────────────────────
  const onlineEduUploadMw = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  app.get('/api/online-edu/uploads', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const uploads = await storage.getOnlineEduUploads(headquarters);
      res.json(uploads);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/online-edu/upload', isAuthenticated, (req: any, res: any, next: any) => {
    onlineEduUploadMw.single("file")(req, res, async (multerErr: any) => {
    if (multerErr) {
      console.error("[OnlineEduUpload] Multer 에러:", multerErr.message);
      return res.status(400).json({ message: "파일 수신 오류: " + multerErr.message });
    }
    const filePath = req.file?.path;
    try {
      const file = req.file;
      console.error("[OnlineEduUpload] req.file:", file ? `있음 (${file.originalname}, ${file.size}bytes)` : "없음");
      if (!file) return res.status(400).json({ message: "파일이 없습니다" });

      const wb = XLSX.read(file.buffer, { type: 'buffer', cellText: true, cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

      if (rows.length < 3) {
        return res.status(400).json({ message: "데이터가 없습니다. 엑셀 형식을 확인해주세요." });
      }

      // 헤더에서 컬럼 인덱스 자동 감지 (row 0, row 1 모두 검색)
      const findCol = (keywords: string[]): number => {
        for (const kw of keywords) {
          for (let r = 0; r <= 1; r++) {
            for (let c = 0; c < (rows[r]?.length || 0); c++) {
              const cell = String(rows[r]?.[c] || "").replace(/\n/g, "").trim();
              if (cell.includes(kw)) return c;
            }
          }
        }
        return -1;
      };

      const colName   = findCol(["성명"]);
      const colDept   = findCol(["소속"]);
      const colCourse = findCol(["과정명"]);
      const colPeriod = findCol(["학습기간"]);
      const colProg   = findCol(["총진도율"]);
      const colHours  = findCol(["총학습시간"]);
      const colScore  = findCol(["취득점수"]);
      const colPass   = findCol(["이수기준점수"]);
      const colStatus = findCol(["수료여부"]);
      const colCan    = findCol(["수료가능여부"]);
      const colReason = findCol(["미이수사유"]);
      const colComp   = findCol(["수료일자"]);

      console.log("[OnlineEduUpload] 컬럼 감지:", { colName, colDept, colCourse, colStatus, colProg });

      if (colName < 0) {
        return res.status(400).json({ message: "성명 컬럼을 찾을 수 없습니다. 엑셀 형식을 확인해주세요." });
      }

      // 데이터 row 2부터 (헤더 2줄 제외)
      const dataRows = rows.slice(2).filter((r: any[]) => r[colName] && String(r[colName]).trim());
      if (dataRows.length === 0) {
        return res.status(400).json({ message: "데이터가 없습니다. 엑셀 형식을 확인해주세요." });
      }

      const get = (r: any[], col: number) => col >= 0 ? String(r[col] || "").trim() : "";

      const courseName = get(dataRows[0], colCourse);
      const learningPeriod = get(dataRows[0], colPeriod);
      const completedCount = dataRows.filter((r) => get(r, colStatus) === "수료").length;

      // 파일명: multer originalname을 그대로 사용 (인코딩 변환 없이)
      let safeFileName = file.originalname;
      try { safeFileName = decodeURIComponent(escape(file.originalname)); } catch {}

      const upload = await storage.createOnlineEduUpload({
        fileName: safeFileName,
        courseName,
        learningPeriod,
        totalCount: dataRows.length,
        completedCount,
        createdBy: req.user?.username,
      });

      const records = dataRows.map((r: any[]) => ({
        uploadId: upload.id,
        name: get(r, colName),
        department: get(r, colDept),
        courseName: get(r, colCourse),
        learningPeriod: get(r, colPeriod),
        progressRate: get(r, colProg) || "0",
        learningHours: get(r, colHours),
        score: get(r, colScore),
        passScore: get(r, colPass),
        completionStatus: get(r, colStatus),
        canComplete: get(r, colCan),
        incompleteReason: get(r, colReason) || "-",
        completionDate: get(r, colComp),
      }));

      await storage.bulkCreateOnlineEduRecords(records);
      console.log(`[OnlineEduUpload] 완료: ${records.length}명, course="${courseName}"`);
      res.json({ upload, count: records.length });
    } catch (e: any) {
      console.error("[OnlineEduUpload] 에러:", e.message, e.stack?.split('\n')[1]);
      res.status(500).json({ message: "업로드 처리 중 오류가 발생했습니다: " + e.message });
    }
    }); // end multer callback
  }); // end route handler

  app.get('/api/online-edu/records/:uploadId', isAuthenticated, async (req: any, res) => {
    try {
      const uploadId = parseInt(req.params.uploadId);
      const records = await storage.getOnlineEduRecords(uploadId);
      res.json(records);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/online-edu/uploads/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteOnlineEduUpload(parseInt(req.params.id));
      res.json({ message: "삭제됨" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── 상/하반기 필요용품 조사 ──────────────────────────────────────
  app.get('/api/safety-supply/surveys', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      res.json(await storage.getSafetySupplySurveys(headquarters));
    }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/safety-supply/surveys', isAuthenticated, async (req: any, res) => {
    try {
      const { year, half, title } = req.body;
      const survey = await storage.createSafetySupplySurvey({ year: Number(year), half: Number(half), title, createdBy: req.user?.username });
      res.json(survey);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put('/api/safety-supply/surveys/:id', isAuthenticated, async (req: any, res) => {
    try {
      const survey = await storage.updateSafetySupplySurvey(parseInt(req.params.id), req.body);
      res.json(survey);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/safety-supply/surveys/:id', isAuthenticated, async (req: any, res) => {
    try { await storage.deleteSafetySupplySurvey(parseInt(req.params.id)); res.json({ message: "삭제됨" }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 필요용품 → 산업안전보건관리비 지출 자동 등록
  app.post('/api/safety-supply/surveys/:id/register-cost', isAuthenticated, async (req: any, res) => {
    try {
      const surveyId = parseInt(req.params.id);
      const { purchaseDate, category, vendorName, notes, itemIds } = req.body;
      const [year, month] = (purchaseDate as string).split('-').map(Number);
      const items = await storage.getSafetySupplyItems(surveyId);
      const depts = await storage.getSafetySupplyDeptEntries(surveyId);
      const selectedItems = itemIds ? items.filter((it: any) => (itemIds as number[]).includes(it.id)) : items;
      const created = [];
      for (const it of selectedItems) {
        const totalQty = depts.reduce((s: number, d: any) => {
          const q = (d.quantities as Record<string, number>) || {};
          return s + (Number(q[it.id]) || 0);
        }, 0);
        if (totalQty === 0) continue;
        const supplyAmt = totalQty * it.unitPrice;
        const vatAmt = Math.round(supplyAmt * 0.1);
        const totalAmt = supplyAmt + vatAmt;
        const record = await storage.createSafetyCostRecord({
          year, month,
          category: category || "3. 개인보호구 및 안전장구 구입비 등",
          itemName: it.itemName,
          specification: it.supplyStandard || '',
          unit: '개',
          quantity: String(totalQty),
          unitPrice: String(it.unitPrice),
          supplyAmount: String(supplyAmt),
          vatAmount: String(vatAmt),
          totalAmount: String(totalAmt),
          purchaseDate,
          vendorName: vendorName || null,
          notes: notes || null,
          quoteFileUrl: null,
          transactionFileUrl: null,
          certificateFileUrl: null,
          createdBy: req.user?.username,
        });
        created.push(record);
      }
      res.json({ created: created.length, records: created });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 조사 복사
  app.post('/api/safety-supply/surveys/:id/copy', isAuthenticated, async (req: any, res) => {
    try {
      const srcId = parseInt(req.params.id);
      const { year, half, title } = req.body;
      // 새 조사 생성
      const newSurvey = await storage.createSafetySupplySurvey({ year: Number(year), half: Number(half), title, createdBy: req.user?.username });
      // 물품 복사
      const srcItems = await storage.getSafetySupplyItems(srcId);
      const newItems = srcItems.length > 0
        ? await storage.upsertSafetySupplyItems(newSurvey.id, srcItems.map(it => ({ itemName: it.itemName, unitPrice: it.unitPrice, supplyStandard: it.supplyStandard, sortOrder: it.sortOrder })))
        : [];
      // 부서 복사 (수량은 새 item id로 매핑)
      const srcDepts = await storage.getSafetySupplyDeptEntries(srcId);
      const idMap: Record<number, number> = {};
      srcItems.forEach((src, i) => { if (newItems[i]) idMap[src.id] = newItems[i].id; });
      const newDepts = srcDepts.map(d => {
        const newQty: Record<string, number> = {};
        Object.entries(d.quantities as Record<string, number>).forEach(([k, v]) => {
          const newId = idMap[Number(k)];
          if (newId) newQty[newId] = v;
        });
        return { deptName: d.deptName, deptCount: d.deptCount, quantities: newQty, sortOrder: d.sortOrder };
      });
      if (newDepts.length > 0) await storage.upsertSafetySupplyDeptEntries(newSurvey.id, newDepts);
      res.json(newSurvey);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/safety-supply/surveys/:id/items', isAuthenticated, async (req: any, res) => {
    try { res.json(await storage.getSafetySupplyItems(parseInt(req.params.id))); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put('/api/safety-supply/surveys/:id/items', isAuthenticated, async (req: any, res) => {
    try {
      const items = req.body; // [{itemName, unitPrice, supplyStandard, deliveryStatus?}]
      res.json(await storage.upsertSafetySupplyItems(parseInt(req.params.id), items));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch('/api/safety-supply/surveys/:id/items/:itemId/selected-depts-delivery-status', isAuthenticated, async (req: any, res) => {
    try {
      const surveyId = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);
      const { deptEntryIds, deliveryStatus } = req.body;
      const valid = ["주문예정", "주문완료", "배송중", "배송완료"];
      if (!valid.includes(deliveryStatus) || !Array.isArray(deptEntryIds)) return res.status(400).json({ message: "잘못된 요청" });
      await storage.bulkUpdateSelectedDeptsDeliveryStatusForItem(surveyId, itemId, deptEntryIds.map(Number), deliveryStatus);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch('/api/safety-supply/dept-entries/:id/bulk-items-delivery-status', isAuthenticated, async (req: any, res) => {
    try {
      const deptEntryId = parseInt(req.params.id);
      const { itemIds, deliveryStatus } = req.body;
      const valid = ["주문예정", "주문완료", "배송중", "배송완료"];
      if (!valid.includes(deliveryStatus) || !Array.isArray(itemIds)) return res.status(400).json({ message: "잘못된 요청" });
      const updated = await storage.bulkUpdateDeptEntryDeliveryStatusItems(deptEntryId, itemIds.map(Number), deliveryStatus);
      if (!updated) return res.status(404).json({ message: "부서 항목을 찾을 수 없습니다" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch('/api/safety-supply/dept-entries/:id/delivery-status', isAuthenticated, async (req: any, res) => {
    try {
      const deptEntryId = parseInt(req.params.id);
      const { itemId, deliveryStatus } = req.body;
      const valid = ["주문예정", "주문완료", "배송중", "배송완료"];
      if (!valid.includes(deliveryStatus)) return res.status(400).json({ message: "유효하지 않은 배송 상태" });
      const updated = await storage.updateDeptEntryDeliveryStatus(deptEntryId, parseInt(itemId), deliveryStatus);
      if (!updated) return res.status(404).json({ message: "부서 항목을 찾을 수 없습니다" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch('/api/safety-supply/surveys/:id/items/:itemId/bulk-delivery-status', isAuthenticated, async (req: any, res) => {
    try {
      const surveyId = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);
      const { deliveryStatus } = req.body;
      const valid = ["주문예정", "주문완료", "배송중", "배송완료"];
      if (!valid.includes(deliveryStatus)) return res.status(400).json({ message: "유효하지 않은 배송 상태" });
      await storage.bulkUpdateDeliveryStatusByItem(surveyId, itemId, deliveryStatus);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/safety-supply/surveys/:id/dept-entries', isAuthenticated, async (req: any, res) => {
    try { res.json(await storage.getSafetySupplyDeptEntries(parseInt(req.params.id))); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put('/api/safety-supply/surveys/:id/dept-entries', isAuthenticated, async (req: any, res) => {
    try {
      const entries = req.body; // [{deptName, deptCount, quantities}]
      res.json(await storage.upsertSafetySupplyDeptEntries(parseInt(req.params.id), entries));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 엑셀 다운로드 (ExcelJS 스타일 버전)
  app.get('/api/safety-supply/surveys/:id/export', isAuthenticated, async (req: any, res) => {
    try {
      const surveyId = parseInt(req.params.id);
      const [surveys, items, depts] = await Promise.all([
        storage.getSafetySupplySurveys(),
        storage.getSafetySupplyItems(surveyId),
        storage.getSafetySupplyDeptEntries(surveyId),
      ]);
      const survey = surveys.find(s => s.id === surveyId);
      if (!survey) return res.status(404).json({ message: "조사를 찾을 수 없습니다" });

      const halfLabel = survey.half === 1 ? '상반기' : '하반기';
      const titleStr = `${survey.year}년 ${halfLabel} 필요용품 조사`;
      // 물품당 2열(수량+금액)로 구성 — 단가/지급기준은 헤더에 표기
      const totalCols = 3 + items.length * 2 + 2; // 구분/부서/인원 + N×2 + 총수량/총금액

      // ── 스타일 정의 ───────────────────────────────────
      const clr = {
        title:    'FF1E3A5F',
        itemHdr:  'FFB45309', // 진주황
        itemSub:  'FFFEF3C7', // 연주황
        hdrGray:  'FF374151',
        hdrGreen: 'FF065F46',
        sumRow:   'FF1B4332',
        altRow:   'FFF8FAFC',
        qtyCell:  'FFE0F2FE',
        amtCell:  'FFF0FDF4',
        white:    'FFFFFFFF',
        black:    'FF111827',
      };
      const thin   = { style: 'thin'   as const, color: { argb: 'FFDDDDDD' } };
      const medium = { style: 'medium' as const, color: { argb: 'FF888888' } };
      const allBorder = { top: thin, left: thin, bottom: thin, right: thin };
      const medBorder = { top: medium, left: medium, bottom: medium, right: medium };
      const center: Partial<ExcelJS.Alignment>      = { vertical: 'middle', horizontal: 'center', wrapText: true };
      const centerNW: Partial<ExcelJS.Alignment>    = { vertical: 'middle', horizontal: 'center' };
      const right: Partial<ExcelJS.Alignment>       = { vertical: 'middle', horizontal: 'right' };
      const leftMid: Partial<ExcelJS.Alignment>     = { vertical: 'middle', horizontal: 'left' };

      const fill = (argb: string): ExcelJS.Fill =>
        ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
      const font = (bold: boolean, sz: number, argb: string): Partial<ExcelJS.Font> =>
        ({ bold, size: sz, color: { argb }, name: '맑은 고딕' });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('필요용품조사');

      // ── 컬럼 너비 ─────────────────────────────────────
      ws.getColumn(1).width = 6;   // 구분
      ws.getColumn(2).width = 26;  // 부서
      ws.getColumn(3).width = 7;   // 인원
      let col = 4;
      items.forEach(() => {
        ws.getColumn(col).width = 9;      // 수량
        ws.getColumn(col + 1).width = 14; // 금액
        col += 2;
      });
      ws.getColumn(col).width = 9;      // 총수량
      ws.getColumn(col + 1).width = 15; // 총금액

      // ── Row 1: 대제목 ──────────────────────────────────
      ws.addRow([titleStr]);
      ws.mergeCells(1, 1, 1, totalCols);
      const r1 = ws.getRow(1);
      r1.height = 28;
      const titleCell = r1.getCell(1);
      titleCell.value = titleStr;
      titleCell.style = { fill: fill(clr.title), font: font(true, 14, clr.white), alignment: center, border: allBorder };

      // ── Row 2: 물품명 헤더 (물품당 2열 병합, 단가·기준 표기) ──────
      ws.addRow([]);
      const r2 = ws.getRow(2);
      r2.height = 32;
      ['구분', '부서', '인원'].forEach((lbl, i) => {
        const c = r2.getCell(i + 1);
        c.value = lbl;
        c.style = { fill: fill(clr.hdrGray), font: font(true, 10, clr.white), alignment: center, border: allBorder };
      });
      let hc = 4;
      items.forEach(it => {
        const c = r2.getCell(hc);
        // 물품명 + 단가 + 지급기준 한 셀에 표기
        c.value = `${it.itemName}\n${it.unitPrice.toLocaleString('ko-KR')}원  /  ${it.supplyStandard || '—'}`;
        c.style = { fill: fill(clr.itemHdr), font: font(true, 10, clr.white), alignment: center, border: allBorder };
        ws.mergeCells(2, hc, 2, hc + 1);
        hc += 2;
      });
      // 총수량/총금액 (Row2에 값 — 병합은 r3 생성 후)
      r2.getCell(hc).value = '총수량';
      r2.getCell(hc).style = { fill: fill(clr.hdrGreen), font: font(true, 10, clr.white), alignment: centerNW, border: allBorder };
      r2.getCell(hc + 1).value = '총금액';
      r2.getCell(hc + 1).style = { fill: fill(clr.hdrGreen), font: font(true, 10, clr.white), alignment: centerNW, border: allBorder };

      // ── Row 3: 서브헤더 (수량 / 금액) ────────────────────
      ws.addRow([]);
      const r3 = ws.getRow(3);
      r3.height = 18;
      // 구분/부서/인원 Row2~3 병합
      ws.mergeCells(2, 1, 3, 1);
      ws.mergeCells(2, 2, 3, 2);
      ws.mergeCells(2, 3, 3, 3);
      // 총수량/총금액 Row2~3 병합
      ws.mergeCells(2, hc, 3, hc);
      ws.mergeCells(2, hc + 1, 3, hc + 1);
      // 물품 서브헤더: 수량 | 금액
      let sc = 4;
      items.forEach(() => {
        const cQ = r3.getCell(sc);
        cQ.value = '수량';
        cQ.style = { fill: fill('FFDBEAFE'), font: font(true, 9, 'FF1E40AF'), alignment: centerNW, border: allBorder };
        const cA = r3.getCell(sc + 1);
        cA.value = '금액';
        cA.style = { fill: fill('FFD1FAE5'), font: font(true, 9, 'FF065F46'), alignment: centerNW, border: allBorder };
        sc += 2;
      });

      // ── 데이터 행 ─────────────────────────────────────
      const totals: Record<number, { qty: number; amt: number }> = {};
      items.forEach(it => { totals[it.id] = { qty: 0, amt: 0 }; });
      let totalQtyAll = 0, totalAmtAll = 0;
      const numFmt = '#,##0';

      depts.forEach((dept, di) => {
        const q = (dept.quantities as Record<string, number>) || {};
        let rowTotalQty = 0, rowTotalAmt = 0;
        ws.addRow([]);
        const dr = ws.getRow(4 + di);
        dr.height = 18;
        const rowBg = di % 2 === 1 ? clr.altRow : clr.white;

        dr.getCell(1).value = '';
        dr.getCell(1).style = { fill: fill(rowBg), font: font(false, 9, clr.black), alignment: centerNW, border: allBorder };
        dr.getCell(2).value = dept.deptName;
        dr.getCell(2).style = { fill: fill(rowBg), font: font(true, 9, clr.black), alignment: leftMid, border: allBorder };
        dr.getCell(3).value = dept.deptCount;
        dr.getCell(3).style = { fill: fill('FFE0E7FF'), font: font(true, 9, 'FF3730A3'), alignment: centerNW, border: allBorder, numFmt };

        let dc = 4;
        items.forEach(it => {
          const qty = Number(q[it.id]) || 0;
          const amt = qty * it.unitPrice;
          totals[it.id].qty += qty;
          totals[it.id].amt += amt;
          rowTotalQty += qty;
          rowTotalAmt += amt;

          const cQ = dr.getCell(dc);
          cQ.value = qty || null;
          cQ.style = { fill: fill(qty ? clr.qtyCell : rowBg), font: font(qty > 0, 9, qty ? 'FF1E40AF' : 'FFBBBBBB'), alignment: centerNW, border: allBorder, numFmt };

          const cA = dr.getCell(dc + 1);
          cA.value = amt || null;
          cA.style = { fill: fill(amt ? clr.amtCell : rowBg), font: font(amt > 0, 9, amt ? 'FF065F46' : 'FFBBBBBB'), alignment: right, border: allBorder, numFmt };

          dc += 2;
        });

        totalQtyAll += rowTotalQty;
        totalAmtAll += rowTotalAmt;

        dr.getCell(dc).value = rowTotalQty || null;
        dr.getCell(dc).style = { fill: fill(rowTotalQty ? 'FFD1FAE5' : rowBg), font: font(true, 9, rowTotalQty ? 'FF065F46' : 'FFBBBBBB'), alignment: centerNW, border: allBorder, numFmt };
        dr.getCell(dc + 1).value = rowTotalAmt || null;
        dr.getCell(dc + 1).style = { fill: fill(rowTotalAmt ? 'FFD1FAE5' : rowBg), font: font(true, 9, rowTotalAmt ? 'FF065F46' : 'FFBBBBBB'), alignment: right, border: allBorder, numFmt };
      });

      // ── 합계 행 ────────────────────────────────────────
      ws.addRow([]);
      const sumRowNum = 4 + depts.length;
      const sr = ws.getRow(sumRowNum);
      sr.height = 22;
      sr.getCell(1).value = '';
      sr.getCell(1).style = { fill: fill(clr.sumRow), font: font(true, 10, clr.white), alignment: centerNW, border: medBorder };
      sr.getCell(2).value = '합    계';
      sr.getCell(2).style = { fill: fill(clr.sumRow), font: font(true, 11, clr.white), alignment: center, border: medBorder };
      sr.getCell(3).value = depts.reduce((s, d) => s + d.deptCount, 0);
      sr.getCell(3).style = { fill: fill(clr.sumRow), font: font(true, 10, clr.white), alignment: centerNW, border: medBorder, numFmt };

      let sCol = 4;
      items.forEach(it => {
        sr.getCell(sCol).value = totals[it.id].qty || null;
        sr.getCell(sCol).style = { fill: fill('FF34D399'), font: font(true, 10, clr.white), alignment: centerNW, border: medBorder, numFmt };
        sr.getCell(sCol + 1).value = totals[it.id].amt || null;
        sr.getCell(sCol + 1).style = { fill: fill('FF34D399'), font: font(true, 10, clr.white), alignment: right, border: medBorder, numFmt };
        sCol += 2;
      });

      sr.getCell(sCol).value = totalQtyAll || null;
      sr.getCell(sCol).style = { fill: fill('FF10B981'), font: font(true, 11, clr.white), alignment: centerNW, border: medBorder, numFmt };
      sr.getCell(sCol + 1).value = totalAmtAll || null;
      sr.getCell(sCol + 1).style = { fill: fill('FF10B981'), font: font(true, 11, clr.white), alignment: right, border: medBorder, numFmt };

      // ── 출력 ─────────────────────────────────────────
      const buf = await wb.xlsx.writeBuffer();
      const fileName = encodeURIComponent(`${titleStr}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
      res.send(buf);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 엑셀 업로드 (템플릿 파싱)
  const supplyImportMw = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
  app.post('/api/safety-supply/surveys/:id/import', isAuthenticated, (req: any, res: any, _next: any) => {
    supplyImportMw.single('file')(req, res, async (err: any) => {
      if (err) return res.status(400).json({ message: '파일 업로드 오류: ' + err.message });
      const file = req.file;
      if (!file) return res.status(400).json({ message: '파일이 없습니다' });
      try {
        const surveyId = parseInt(req.params.id);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(file.buffer);
        const ws = wb.getWorksheet(1);
        if (!ws) throw new Error('워크시트를 찾을 수 없습니다. 올바른 Excel 파일인지 확인해주세요.');

        // row2 = 헤더: 구분/부서/인원 + [단가 지급기준 수량 금액]×N + 총수량 총금액
        // row1 = 타이틀 행 (물품명은 4열마다 merge된 마스터 셀에 있음)
        // row3+ = 데이터
        const row2 = ws.getRow(2);
        const headers: string[] = [];
        row2.eachCell({ includeEmpty: true }, (cell: any) => { headers.push(String(cell.value ?? '')); });
        const totalCols = headers.length;

        // row1에서 물품명 파싱 (4열 단위: 단가/지급기준/수량/금액)
        const itemNames: { name: string; col: number }[] = [];
        let c = 4;
        while (c <= totalCols) {
          // merged cell master value 읽기
          const cell = ws.getCell(1, c);
          const rawVal = cell.master ? cell.master.value : cell.value;
          const name = String(rawVal ?? '').trim();
          if (name && name !== '총합계' && name !== '총수량' && name !== '총금액' && name !== '합계') {
            itemNames.push({ name, col: c });
          }
          c += 4;
        }

        if (itemNames.length === 0) throw new Error('물품 헤더를 찾을 수 없습니다. 다운로드한 양식을 사용해주세요.');

        // 물품 저장 (단가/지급기준은 첫 번째 데이터 행에서 파싱)
        // row3 = 첫 번째 부서 행. col+0=단가, col+1=지급기준
        const getNum = (r: number, c: number) => parseInt(String(ws.getCell(r, c).value ?? '0').replace(/[^0-9]/g, '')) || 0;
        const getStr = (r: number, c: number) => String(ws.getCell(r, c).value ?? '').trim();

        const savedItems = await storage.upsertSafetySupplyItems(surveyId,
          itemNames.map((it, idx) => ({
            itemName: it.name,
            unitPrice: getNum(3, it.col),
            supplyStandard: getStr(3, it.col + 1),
            sortOrder: idx,
          }))
        );

        // 부서 데이터 파싱 (row3 이후, 합계 행 제외)
        const entries: any[] = [];
        let rowIdx = 3;
        while (rowIdx <= 1000) {
          const r = ws.getRow(rowIdx);
          const deptName = getStr(rowIdx, 2);
          if (!deptName || deptName === '합 계' || deptName === '합계') break;
          const deptCount = parseInt(String(r.getCell(3).value ?? '0')) || 0;
          const quantities: Record<number, number> = {};
          savedItems.forEach((it, idx) => {
            // 수량 컬럼: col + 2 (단가 col, 지급기준 col+1, 수량 col+2, 금액 col+3)
            const qtyVal = parseInt(String(r.getCell(itemNames[idx].col + 2).value ?? '0')) || 0;
            if (qtyVal) quantities[it.id] = qtyVal;
          });
          entries.push({ deptName, deptCount, quantities, sortOrder: entries.length });
          rowIdx++;
        }

        if (entries.length === 0) throw new Error('부서 데이터가 없습니다. 파일 형식을 확인해주세요.');

        await storage.upsertSafetySupplyDeptEntries(surveyId, entries);
        res.json({ items: savedItems.length, depts: entries.length });
      } catch (e: any) {
        res.status(500).json({ message: '파싱 오류: ' + e.message });
      }
    });
  });
  // ────────────────────────────────────────────────────────────────

  // 입회/점검 기록 엑셀 다운로드 (보고용)
  app.get('/api/attendance/export', isAuthenticated, async (req: any, res) => {
    try {
      const uploadId = req.query.uploadId ? parseInt(req.query.uploadId as string) : undefined;
      const records = await storage.getAttendanceRecords(uploadId ? { uploadId } : undefined);

      // ── 부서장 정의 (프론트와 동일) ──
      const DEPT_HEADS_SRV = [
        { team: "구미운용팀",   prefix: "홍성" },
        { team: "문경운용팀",   prefix: "곽영" },
        { team: "포항운용팀",   prefix: "윤수" },
        { team: "안동운용팀",   prefix: "편광" },
        { team: "동대구운용팀", prefix: "맹찬" },
        { team: "서대구운용팀", prefix: "김철" },
        { team: "남대구운용팀", prefix: "김홍" },
      ];
      const getDH = (name: string) => DEPT_HEADS_SRV.find(d => name.startsWith(d.prefix)) ?? null;

      // ── 데이터 집계 ──
      const gradeMap = new Map<string, number>();
      records.forEach(r => {
        const m = (r.department || "").match(/^(\d+등급)/);
        gradeMap.set(m ? m[1] : "미분류", (gradeMap.get(m ? m[1] : "미분류") || 0) + 1);
      });
      const stageMap = new Map<string, number>();
      records.forEach(r => { const k = r.attendanceType || "미확인"; stageMap.set(k, (stageMap.get(k) || 0) + 1); });
      const inspMap = new Map<string, number>();
      records.forEach(r => { inspMap.set(r.name, (inspMap.get(r.name) || 0) + 1); });

      const deptHeadRecords = records.filter(r => getDH(r.name) !== null);
      const grade1Records = records.filter(r => (r.department || "").startsWith("1등급"));
      const grade1DH = grade1Records.filter(r => getDH(r.name) !== null);
      const dhRatio = grade1Records.length > 0 ? grade1DH.length / grade1Records.length * 100 : 0;

      const deptHeadSummary = DEPT_HEADS_SRV.map(d => ({
        team: d.team, prefix: d.prefix,
        count: deptHeadRecords.filter(r => r.name.startsWith(d.prefix)).length
      }));

      const inspList = [...inspMap.entries()].sort(([, a], [, b]) => b - a).slice(0, 15);
      const gradeSorted = [...gradeMap.entries()].sort(([a], [b]) => a.localeCompare(b));
      const stageSorted = [...stageMap.entries()].sort(([, a], [, b]) => b - a);

      // ── QuickChart.io 차트 이미지 생성 ──
      const CHART_COLORS = ["#7C3AED","#2563EB","#059669","#D97706","#DC2626","#0891B2","#9333EA","#16A34A","#EA580C","#4F46E5"];
      const GRADE_C = ["#EF4444","#F59E0B","#10B981","#3B82F6","#9CA3AF"];

      const fetchChart = async (cfg: object, w = 520, h = 280): Promise<Buffer | null> => {
        try {
          const r = await fetch("https://quickchart.io/chart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ backgroundColor: "white", width: w, height: h, chart: cfg }),
            signal: AbortSignal.timeout(10000)
          });
          if (!r.ok) return null;
          return Buffer.from(await r.arrayBuffer());
        } catch { return null; }
      };

      const [gradeBuf, stageBuf, inspBuf, deptBuf] = await Promise.all([
        // 1) 안전등급 도넛
        fetchChart({
          type: "doughnut",
          data: {
            labels: gradeSorted.map(([g]) => g),
            datasets: [{ data: gradeSorted.map(([, c]) => c), backgroundColor: gradeSorted.map((_, i) => GRADE_C[i % GRADE_C.length]), borderWidth: 2, borderColor: "#fff" }]
          },
          options: {
            legend: { position: "right", labels: { fontSize: 13, fontStyle: "bold" } },
            plugins: { datalabels: { formatter: (val: number, ctx: any) => { const t = ctx.dataset.data.reduce((s: number, v: number) => s + v, 0); return val > 0 ? `${val}건\n(${(val/t*100).toFixed(1)}%)` : ""; }, color: "#fff", font: { weight: "bold", size: 11 } } }
          }
        }, 520, 260),
        // 2) 단계별 막대
        fetchChart({
          type: "bar",
          data: {
            labels: stageSorted.map(([s]) => s),
            datasets: [{ label: "건수", data: stageSorted.map(([, c]) => c), backgroundColor: stageSorted.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]) }]
          },
          options: {
            legend: { display: false },
            plugins: { datalabels: { anchor: "end", align: "top", font: { weight: "bold", size: 12 }, color: "#1F2937", formatter: (v: number) => `${v}건` } },
            scales: { yAxes: [{ ticks: { beginAtZero: true, stepSize: 1 } }], xAxes: [{ ticks: { fontSize: 12 } }] }
          }
        }, 520, 260),
        // 3) 담당자별 가로 막대 (상위 15)
        fetchChart({
          type: "horizontalBar",
          data: {
            labels: inspList.map(([n]) => n),
            datasets: [{ label: "건수", data: inspList.map(([, c]) => c), backgroundColor: inspList.map((_, i) => getDH(inspList[i][0]) ? "#2563EB" : CHART_COLORS[i % CHART_COLORS.length]) }]
          },
          options: {
            legend: { display: false },
            plugins: { datalabels: { anchor: "end", align: "right", font: { weight: "bold", size: 11 }, color: "#1F2937", formatter: (v: number) => `${v}건` } },
            scales: { xAxes: [{ ticks: { beginAtZero: true, stepSize: 1 } }], yAxes: [{ ticks: { fontSize: 12 } }] }
          }
        }, 520, Math.max(280, inspList.length * 26 + 60)),
        // 4) 부서장별 막대
        fetchChart({
          type: "bar",
          data: {
            labels: DEPT_HEADS_SRV.map(d => d.team.replace("운용팀", "")),
            datasets: [{ label: "입회건수", data: DEPT_HEADS_SRV.map(d => deptHeadSummary.find(x => x.team === d.team)?.count ?? 0), backgroundColor: ["#7C3AED","#2563EB","#059669","#D97706","#DC2626","#0891B2","#9333EA"] }]
          },
          options: {
            legend: { display: false },
            plugins: { datalabels: { anchor: "end", align: "top", font: { weight: "bold", size: 13 }, color: "#1E40AF", formatter: (v: number) => v > 0 ? `${v}건` : "" } },
            scales: { yAxes: [{ ticks: { beginAtZero: true, stepSize: 1 } }], xAxes: [{ ticks: { fontSize: 13, fontStyle: "bold" } }] }
          }
        }, 520, 260),
      ]);

      // ── 엑셀 생성 ──
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SafeBoard";

      const hStyle = (fgArgb: string): Partial<ExcelJS.Style> => ({
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: fgArgb } },
        alignment: { horizontal: "center", vertical: "middle" },
        border: { top: { style: "thin", color: { argb: "FFE5E7EB" } }, bottom: { style: "thin", color: { argb: "FFE5E7EB" } }, left: { style: "thin", color: { argb: "FFE5E7EB" } }, right: { style: "thin", color: { argb: "FFE5E7EB" } } }
      });
      const dStyle = (even: boolean): Partial<ExcelJS.Style> => ({
        fill: even ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFF" } } : undefined as any,
        border: { top: { style: "thin", color: { argb: "FFE5E7EB" } }, bottom: { style: "thin", color: { argb: "FFE5E7EB" } }, left: { style: "thin", color: { argb: "FFE5E7EB" } }, right: { style: "thin", color: { argb: "FFE5E7EB" } } },
        alignment: { vertical: "middle" }
      });

      // ═══════════════════════════════════════
      // Sheet 1: 보고서
      // ═══════════════════════════════════════
      const rpt = workbook.addWorksheet("보고서");
      rpt.columns = [
        { width: 16 }, { width: 11 }, { width: 11 }, { width: 11 },
        { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }
      ];

      // 제목
      rpt.mergeCells("A1:I2");
      const tc = rpt.getCell("A1");
      tc.value = "순회점검 입회 현황 보고서";
      tc.font = { bold: true, size: 22, color: { argb: "FFFFFFFF" } };
      tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      tc.alignment = { horizontal: "center", vertical: "middle" };
      rpt.getRow(1).height = 22; rpt.getRow(2).height = 22;

      // 부제
      const nowD = new Date();
      rpt.mergeCells("A3:I3");
      const sc = rpt.getCell("A3");
      sc.value = `작성일: ${nowD.getFullYear()}-${String(nowD.getMonth()+1).padStart(2,"0")}-${String(nowD.getDate()).padStart(2,"0")}   |   총 ${records.length}건   |   부서장 입회: ${deptHeadRecords.length}건   |   1등급 부서장입회율: ${dhRatio.toFixed(1)}%`;
      sc.font = { size: 11, color: { argb: "FF1E3A8A" } };
      sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
      sc.alignment = { horizontal: "center", vertical: "middle" };
      rpt.getRow(3).height = 20;
      rpt.getRow(4).height = 10;

      // KPI 박스 (행 5-7)
      const kpis = [
        { label: "총 점검 건수", val: `${records.length}건`, bg: "FFDBEAFE", fg: "FF1E40AF" },
        { label: "1등급 점검",   val: `${grade1Records.length}건`, bg: "FFFEE2E2", fg: "FFB91C1C" },
        { label: "부서장 입회",  val: `${deptHeadRecords.length}건`, bg: "FFD1FAE5", fg: "FF065F46" },
        { label: "1등급 입회율", val: `${dhRatio.toFixed(1)}%`, bg: "FFFEF3C7", fg: "FF92400E" },
      ];
      const kpiCols = [["A","B"],["C","D"],["E","F"],["G","H"]];
      kpis.forEach(({ label, val, bg, fg }, i) => {
        const [c1, c2] = kpiCols[i];
        rpt.mergeCells(`${c1}5:${c2}5`); rpt.mergeCells(`${c1}6:${c2}6`); rpt.mergeCells(`${c1}7:${c2}7`);
        const lc = rpt.getCell(`${c1}5`);
        lc.value = label; lc.font = { size: 10, color: { argb: fg } };
        lc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } }; lc.alignment = { horizontal: "center", vertical: "middle" };
        const vc = rpt.getCell(`${c1}6`);
        vc.value = val; vc.font = { size: 20, bold: true, color: { argb: fg } };
        vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } }; vc.alignment = { horizontal: "center", vertical: "middle" };
        const bc = rpt.getCell(`${c1}7`);
        bc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      });
      rpt.getRow(5).height = 16; rpt.getRow(6).height = 38; rpt.getRow(7).height = 10;
      rpt.getRow(8).height = 10;

      // ── 섹션 헬퍼 ──
      let cr = 9;
      const secHdr = (title: string) => {
        rpt.mergeCells(`A${cr}:E${cr}`);
        const c = rpt.getCell(`A${cr}`);
        c.value = title; c.font = { bold: true, size: 12, color: { argb: "FF1E3A8A" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
        c.alignment = { horizontal: "left", vertical: "middle" };
        c.border = { left: { style: "thick", color: { argb: "FF1E40AF" } }, bottom: { style: "thin", color: { argb: "FFE0E7FF" } } };
        rpt.getRow(cr).height = 22; cr++;
      };
      const tblHdr = (cols: string[]) => {
        const row = rpt.getRow(cr); row.height = 18;
        cols.forEach((h, i) => {
          const cell = row.getCell(i + 1);
          cell.value = h; cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B82F6" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = { top: { style: "thin", color: { argb: "FFE5E7EB" } }, bottom: { style: "thin", color: { argb: "FFE5E7EB" } }, left: { style: "thin", color: { argb: "FFE5E7EB" } }, right: { style: "thin", color: { argb: "FFE5E7EB" } } };
        }); cr++;
      };
      const tblRow = (vals: (string|number)[], even: boolean, boldBlue = false) => {
        const row = rpt.getRow(cr); row.height = 17;
        vals.forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v;
          cell.font = { size: 10, bold: boldBlue, color: boldBlue ? { argb: "FF1D4ED8" } : undefined };
          if (even) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFF" } };
          cell.border = { top: { style: "thin", color: { argb: "FFE5E7EB" } }, bottom: { style: "thin", color: { argb: "FFE5E7EB" } }, left: { style: "thin", color: { argb: "FFE5E7EB" } }, right: { style: "thin", color: { argb: "FFE5E7EB" } } };
          cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center" };
        }); cr++;
      };
      const embedChart = (buf: Buffer | null, startRow: number, endRow: number) => {
        if (!buf) return;
        const id = workbook.addImage({ buffer: buf, extension: "png" });
        rpt.addImage(id, { tl: { col: 5, row: startRow - 1 }, br: { col: 9, row: Math.max(endRow, startRow + 8) } });
      };

      // ── 1. 안전등급별 현황 ──
      const gs = cr;
      secHdr("▶ 안전등급별 현황");
      tblHdr(["안전등급", "건수", "비율"]);
      gradeSorted.forEach(([g, c], i) => tblRow([g, c, records.length ? ((c/records.length)*100).toFixed(1)+"%" : "0%"], i%2===1));
      embedChart(gradeBuf, gs, cr);
      rpt.getRow(cr).height = 10; cr++;

      // ── 2. 단계별 현황 ──
      const ss = cr;
      secHdr("▶ 점검 단계별 현황");
      tblHdr(["점검 단계", "건수", "비율"]);
      stageSorted.forEach(([s, c], i) => tblRow([s, c, records.length ? ((c/records.length)*100).toFixed(1)+"%" : "0%"], i%2===1));
      embedChart(stageBuf, ss, cr);
      rpt.getRow(cr).height = 10; cr++;

      // ── 3. 부서장별 입회 ──
      const ds = cr;
      secHdr("▶ 부서장별 입회 현황");
      tblHdr(["팀", "부서장", "입회 건수"]);
      deptHeadSummary.forEach(({ team, prefix, count: c }, i) => tblRow([team, `${prefix}*`, c], i%2===1));
      embedChart(deptBuf, ds, cr);
      rpt.getRow(cr).height = 10; cr++;

      // ── 4. 담당자별 건수 (상위 15) ──
      const is = cr;
      secHdr(`▶ 담당자별 건수 (상위 ${inspList.length}명, 파란색=부서장)`);
      tblHdr(["담당자", "건수", "비율"]);
      inspList.forEach(([name, c], i) => tblRow([name, c, records.length ? ((c/records.length)*100).toFixed(1)+"%" : "0%"], i%2===1, getDH(name) !== null));
      embedChart(inspBuf, is, cr);

      // ═══════════════════════════════════════
      // Sheet 2: 상세데이터
      // ═══════════════════════════════════════
      const detail = workbook.addWorksheet("상세데이터");
      const hSt: Partial<ExcelJS.Style> = {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } },
        font: { color: { argb: "FFFFFFFF" }, bold: true, size: 11 },
        alignment: { vertical: "middle", horizontal: "center", wrapText: true },
        border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
      };
      const dSt: Partial<ExcelJS.Style> = {
        border: { top: { style: "thin", color: { argb: "FFD1D5DB" } }, bottom: { style: "thin", color: { argb: "FFD1D5DB" } }, left: { style: "thin", color: { argb: "FFD1D5DB" } }, right: { style: "thin", color: { argb: "FFD1D5DB" } } },
        alignment: { vertical: "middle", wrapText: false }
      };
      detail.columns = [6, 14, 16, 40, 44, 16].map(w => ({ width: w }));
      detail.addRow(["No.", "작업일자", "순회점검대상자", "작업자(소속)", "공사내용(안전등급)", "순회점검단계"]);
      detail.getRow(1).height = 22;
      detail.getRow(1).eachCell(cell => Object.assign(cell, hSt));
      records.forEach((r, idx) => {
        const row = detail.addRow([idx + 1, r.attendanceDate, r.name, r.company || "", r.department || "", r.attendanceType || ""]);
        row.height = 18;
        row.eachCell(cell => {
          cell.border = dSt.border; cell.alignment = dSt.alignment;
          if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFF" } };
        });
      });

      // ── 전송 ──
      const now2 = new Date();
      const fname = `순회점검보고서_${now2.getFullYear()}${String(now2.getMonth()+1).padStart(2,"0")}${String(now2.getDate()).padStart(2,"0")}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
      await workbook.xlsx.write(res);
    } catch (e: any) {
      console.error("[AttendanceExport error]", e);
      res.status(500).json({ message: e.message });
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
      const headquarters = req.query.headquarters as string | undefined;
      const records = await storage.getFuelRecords({ year, month, team, fuelType, headquarters });
      res.json(records);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // GET /api/fuel-records/summary - 연도별/월별/팀별 집계
  app.get("/api/fuel-records/summary", isAuthenticated, async (req, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const records = await storage.getFuelRecords({ headquarters });
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
  app.get("/api/fuel-records/batches", requireAdmin, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const batches = await storage.getFuelBatches(headquarters);
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
      const uploadHqFuel = req.body?.headquarters || '대구본부';

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

        // 같은 연월·본부 기존 데이터 삭제 (재업로드)
        await storage.deleteFuelRecordsByYearMonth(year, month, uploadHqFuel);

        const ws = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 });

        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          // 순번이 양수인 실제 데이터 행만 처리
          const seq = row[0];
          if (typeof seq !== "number" || seq <= 0) continue;
          if (row[1] && String(row[1]).trim() !== uploadHqFuel) continue;
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
            headquarters: uploadHqFuel,
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
      const uploadHq    = req.body?.headquarters || '대구본부';

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

      // 날짜 값에서 "YYYY-MM-DD" 추출 헬퍼
      const extractDate = (val: any): string | null => {
        if (!val && val !== 0) return null;
        if (val instanceof Date) {
          return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, "0")}-${String(val.getDate()).padStart(2, "0")}`;
        }
        const s = String(val).trim();
        if (!s) return null;
        // "YYYY-MM-DD" 또는 "YYYY-MM-DD HH:MM" 형식
        const m1 = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (m1) return `${m1[1]}-${String(parseInt(m1[2])).padStart(2,"0")}-${String(parseInt(m1[3])).padStart(2,"0")}`;
        // "YYYY/MM/DD" 또는 "YYYY/M/D" 형식
        const m2 = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
        if (m2) return `${m2[1]}-${String(parseInt(m2[2])).padStart(2,"0")}-${String(parseInt(m2[3])).padStart(2,"0")}`;
        // "YYYY.MM.DD" 형식
        const m3 = s.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
        if (m3) return `${m3[1]}-${String(parseInt(m3[2])).padStart(2,"0")}-${String(parseInt(m3[3])).padStart(2,"0")}`;
        // "YYYYMMDD" 형식 (8자리 숫자)
        const m4 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (m4) return `${m4[1]}-${m4[2]}-${m4[3]}`;
        // "YY년M월D일" 또는 "YYYY년M월D일" 형식
        const m5 = s.match(/(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
        if (m5) {
          const yr = parseInt(m5[1]) < 100 ? 2000 + parseInt(m5[1]) : parseInt(m5[1]);
          return `${yr}-${String(parseInt(m5[2])).padStart(2, "0")}-${String(parseInt(m5[3])).padStart(2, "0")}`;
        }
        return null;
      };

      // 차량일지 시트 1장 파싱 (행=운행기록): 차량별 집계 → year/month 기준 필터
      // 컬럼: key(0) 운행목적(1) 사용용도(2) 차량번호(3) 출발시간(4) 종료시간(5)
      //        운행일자(6) 시작km(7) 출발지(8) 종료km(9) 종료지(10) 경유지(11)
      //        주유량(12) 주유금액(13) 탑승자(14)
      const parseSheet = (rows: any[][], year: number, month: number, batchId: string, meta: Record<string, any>) => {
        const agg: Record<string, { dist: number; fuelCost: number; driver: string }> = {};
        const errors: any[] = [];
        let _debugSample: any = null;

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
        const colPlate  = findC(["차량번호", "차량"]);
        const colDeparture = findC(["출발시간", "출발일시"]);
        const colArrival   = findC(["종료시간", "도착시간", "종료일시", "도착일시"]);
        const colLogDate   = findC(["운행일자", "일자", "날짜", "운행날짜", "날자", "운행일"]);
        const colStartKm   = findC(["시작km", "시작Km", "시작KM", "출발km", "출발Km", "출발KM", "전km", "전Km"]);
        const colEndKm     = findC(["종료km", "종료Km", "종료KM", "도착km", "도착Km", "도착KM", "후km", "후Km"]);
        const colFuelAmt   = findC(["주유량", "주유 량"]);
        const colFuel      = findC(["주유금액", "주유비", "연료비", "주유 금액"]);
        const colDriver    = findC(["탑승자", "운전자", "사용자", "운전원"]);
        const colPurpose   = findC(["운행목적", "목적", "용도"]);

        // 컬럼 인덱스 기본값 (첨부 파일 형식 기준)
        const cPlate   = colPlate >= 0     ? colPlate     : 3;
        const cDepart  = colDeparture >= 0 ? colDeparture : 4;
        const cArrive  = colArrival >= 0   ? colArrival   : 5;
        const cLogDate = colLogDate >= 0   ? colLogDate   : 6;
        const cStartKm = colStartKm >= 0   ? colStartKm   : 7;
        const cEndKm   = colEndKm >= 0     ? colEndKm     : 9;
        const cFuelAmt = colFuelAmt >= 0   ? colFuelAmt   : 12;
        const cFuel    = colFuel >= 0      ? colFuel      : 13;
        const cDriver  = colDriver >= 0    ? colDriver     : 14;
        const cPurpose = colPurpose >= 0   ? colPurpose   : 1;

        // 처음 3개 데이터 행 디버그 캡처 → 파일 기록
        {
          const debugRows: any[] = [];
          for (let di = headerIdx + 1; di < Math.min(headerIdx + 4, rows.length); di++) {
            const sr = rows[di];
            debugRows.push({
              rowIdx: di,
              plate: String(sr[cPlate] ?? ""),
              depart: sr[cDepart] instanceof Date ? sr[cDepart].toISOString() : String(sr[cDepart] ?? ""),
              arrive: sr[cArrive] instanceof Date ? sr[cArrive].toISOString() : String(sr[cArrive] ?? ""),
              logDate: sr[cLogDate] instanceof Date ? sr[cLogDate].toISOString() : String(sr[cLogDate] ?? ""),
              startKm: sr[cStartKm], endKm: sr[cEndKm],
              fuelAmt: sr[cFuelAmt], fuel: sr[cFuel],
              departExtracted: extractDate(sr[cDepart]),
              logDateExtracted: extractDate(sr[cLogDate]),
              arriveExtracted: extractDate(sr[cArrive]),
            });
          }
          _debugSample = {
            headerRow: rows[headerIdx].map((c: any) => String(c ?? "")).slice(0, 16),
            cols: { plate: cPlate, depart: cDepart, arrive: cArrive, logDate: cLogDate, startKm: cStartKm, endKm: cEndKm, fuelAmt: cFuelAmt, fuel: cFuel },
            rows: debugRows,
          };
          console.log("[VLOG_DEBUG]", JSON.stringify(_debugSample));
        }

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
          const vehicleMeta2 = meta[plate];
          const team = vehicleMeta2?.team ?? "미확인팀";

          if (!agg[plate]) agg[plate] = { dist: 0, fuelCost: 0, driver: "" };
          agg[plate].dist += dist;
          agg[plate].fuelCost += fuel;
          if (driver && !agg[plate].driver) agg[plate].driver = driver;

          // ── 오류 감지 ──
          const departDateStr = extractDate(depVal);
          const arrivalDateStr = extractDate(row[cArrive]);
          const logDateStr = extractDate(row[cLogDate]);
          const startKm = num(row[cStartKm]);
          const endKm = num(row[cEndKm]);
          const fuelAmount = num(row[cFuelAmt]);
          const fuelCost = fuel;

          const errorTypes: string[] = [];
          // 1. 출발시간 날짜 ≠ 운행일자
          if (departDateStr && logDateStr && departDateStr !== logDateStr) {
            errorTypes.push("date_departure");
          }
          // 2. 종료시간 날짜 ≠ 운행일자
          if (arrivalDateStr && logDateStr && arrivalDateStr !== logDateStr) {
            errorTypes.push("date_arrival");
          }
          // 3. 종료km < 시작km (역방향)
          if (startKm > 0 && endKm > 0 && endKm < startKm) {
            errorTypes.push("km_reverse");
          }
          // 4. 주유금액이 있는데 주유량이 0
          if (fuelCost > 0 && fuelAmount <= 0) {
            errorTypes.push("fuel_no_amount");
          }
          // 5. 주유량이 있는데 주유금액이 0
          if (fuelAmount > 0 && fuelCost <= 0) {
            errorTypes.push("fuel_no_cost");
          }
          // 6. 주유금액 과도 (300,000원 초과)
          if (fuelCost > 300000) {
            errorTypes.push("fuel_high_cost");
          }

          if (errorTypes.length > 0) {
            errors.push({
              year,
              month,
              rowIndex: ri,
              plateNumber: plate,
              team,
              driver: driver || vehicleMeta2?.driver || null,
              logDate: logDateStr || String(row[cLogDate] ?? ""),
              departureTime: departDateStr || String(depVal ?? ""),
              arrivalTime: arrivalDateStr || String(row[cArrive] ?? ""),
              beforeMileage: startKm > 0 ? Math.round(startKm) : null,
              afterMileage: endKm > 0 ? Math.round(endKm) : null,
              fuelAmount: fuelAmount > 0 ? String(fuelAmount) : null,
              fuelCost: fuelCost > 0 ? fuelCost : null,
              purpose: String(row[cPurpose] ?? "").trim() || null,
              errorTypes,
              status: "pending",
              uploadBatch: batchId,
            });
          }
        }
        return { agg, errors, _debugSample };
      };

      const allRecordsToInsert: any[] = [];
      const allErrors: any[] = [];
      let _debugSamples: any[] = [];
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

        const { agg, errors: sheetErrors, _debugSample } = parseSheet(rows, ym.year, ym.month, batchId, vehicleMeta);
        allErrors.push(...sheetErrors);
        if (_debugSample) _debugSamples.push({ sheet: sheetName, ...(_debugSample as any) });
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
            headquarters: uploadHq,
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

      // 해당 연월·본부 기존 데이터 삭제 후 재삽입 (오류 기록도 함께 삭제)
      for (const ymKey of processedYMs) {
        const [yr, mo] = ymKey.split("-").map(Number);
        await storage.deleteFuelRecordsByYearMonth(yr, mo, uploadHq);
      }
      await storage.deleteVehicleLogErrorsByBatch(batchId);
      const inserted = await storage.insertFuelRecords(allRecordsToInsert);
      const errorInserted = await storage.createVehicleLogErrors(allErrors);
      const ymLabels = [...processedYMs].map(k => { const [y,m]=k.split("-"); return `${y}년 ${m}월`; });
      res.json({
        success: true,
        batchId,
        inserted,
        errorCount: errorInserted,
        _debug: { errorCount: allErrors.length, samples: _debugSamples.slice(0, 1) },
        unknownVehicles: skippedVehicles.length,
        unknownPlates: skippedVehicles,
        yearMonths: ymLabels,
        message: `${inserted}건 처리 완료 — ${ymLabels.join(", ")} 차량일지 반영${errorInserted > 0 ? ` (오류 ${errorInserted}건 감지됨)` : ""}${skippedVehicles.length ? ` (팀미확인 ${skippedVehicles.length}대 "미확인팀"으로 포함: ${skippedVehicles.join(", ")})` : ""}`,
      });
    } catch (e: any) {
      console.error("차량일지 업로드 오류:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // GET /api/vehicle-log-errors
  app.get("/api/vehicle-log-errors", isAuthenticated, async (req: any, res) => {
    try {
      const year  = req.query.year  ? parseInt(req.query.year)  : undefined;
      const month = req.query.month ? parseInt(req.query.month) : undefined;
      const status = req.query.status as string | undefined;
      const errors = await storage.getVehicleLogErrors({ year, month, status });
      res.json(errors);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PUT /api/vehicle-log-errors/:id/respond  (소명 등록)
  app.put("/api/vehicle-log-errors/:id/respond", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { response } = req.body;
      if (!response?.trim()) return res.status(400).json({ message: "소명 내용을 입력해주세요." });
      const updated = await storage.updateVehicleLogError(id, {
        response: response.trim(),
        responseBy: req.user?.name || req.user?.username,
        responseAt: new Date(),
        status: "responded",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PUT /api/vehicle-log-errors/:id/resolve  (처리 완료)
  app.put("/api/vehicle-log-errors/:id/resolve", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateVehicleLogError(id, {
        resolvedBy: req.user?.name || req.user?.username,
        resolvedAt: new Date(),
        status: "resolved",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PUT /api/vehicle-log-errors/:id/reopen  (소명 재요청)
  app.put("/api/vehicle-log-errors/:id/reopen", requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateVehicleLogError(id, {
        status: "pending",
        response: null,
        responseBy: null,
        responseAt: null,
        resolvedBy: null,
        resolvedAt: null,
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── 안전관리자 상태보고서 ────────────────────────────────────
  app.get('/api/safety-manager-reports', isAuthenticated, async (req: any, res) => {
    try {
      const yearMonth = req.query.yearMonth as string | undefined;
      const year = req.query.year as string | undefined;
      const headquarters = req.query.headquarters as string | undefined;
      res.json(await storage.getSafetyManagerReports(yearMonth, year, headquarters));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── 보고서 파일 버퍼 로드 (object storage 또는 로컬) ──────────
  async function loadReportBuffer(fileUrl: string): Promise<{ buffer: Buffer; ext: string }> {
    const filename = fileUrl.split('/').pop()!;
    const ext = path.extname(filename).toLowerCase();
    if (fileUrl.startsWith('/objects/')) {
      const privateDir = process.env.PRIVATE_OBJECT_DIR;
      if (privateDir) {
        const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${filename}`;
        const parts = fullPath.replace(/^\//, "").split("/");
        const [buf] = await objectStorageClient.bucket(parts[0]).file(parts.slice(1).join("/")).download();
        return { buffer: buf as Buffer, ext };
      }
    }
    const localPath = path.join(uploadDir, filename);
    if (fs.existsSync(localPath)) return { buffer: fs.readFileSync(localPath), ext };
    throw new Error("파일을 찾을 수 없습니다");
  }

  // ── 서명 이미지를 PDF 또는 이미지 파일에 합성 ──────────────────
  // 결재 테이블 셀 위치 (페이지 크기 대비 비율):
  //   - 담당자: X [29%~52%], Y bottom [3%~11%]
  //   - 검토:   X [52%~75%], Y bottom [3%~11%]
  //   - 결재:   X [75%~98%], Y bottom [3%~11%]
  async function embedSignaturesIntoFile(
    buffer: Buffer, ext: string,
    sigs: { manager: string | null; reviewer: string | null; approver: string | null }
  ): Promise<Buffer> {
    function b64ToBuffer(dataUrl: string | null): Buffer | null {
      if (!dataUrl) return null;
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      return Buffer.from(base64, 'base64');
    }
    const sigBufs = [b64ToBuffer(sigs.manager), b64ToBuffer(sigs.reviewer), b64ToBuffer(sigs.approver)];
    if (sigBufs.every(b => !b)) return buffer;

    // ── 이미지 파일 (sharp 합성) ─────────────────────
    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buffer).metadata();
      const W = meta.width || 1000;
      const H = meta.height || 1400;

      // 서명 셀 위치 (상단 기준, top-left origin) — 결재란은 우측 상단
      // 1행: 헤더(담당/검토/승인 라벨) ~0-4%, 2행: 서명칸 ~4-10%
      const cells = [
        { left: Math.round(W * 0.64), top: Math.round(H * 0.040), w: Math.round(W * 0.115), h: Math.round(H * 0.060) },
        { left: Math.round(W * 0.755), top: Math.round(H * 0.040), w: Math.round(W * 0.115), h: Math.round(H * 0.060) },
        { left: Math.round(W * 0.87), top: Math.round(H * 0.040), w: Math.round(W * 0.115), h: Math.round(H * 0.060) },
      ];
      const composites: any[] = [];
      for (let i = 0; i < 3; i++) {
        if (!sigBufs[i]) continue;
        const resized = await sharp(sigBufs[i]!)
          .resize({ width: cells[i].w, height: cells[i].h, fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 0 } })
          .png().toBuffer();
        composites.push({ input: resized, left: cells[i].left, top: cells[i].top });
      }
      if (composites.length === 0) return buffer;
      const result = await sharp(buffer).composite(composites).toBuffer();
      return result;
    }

    // ── PDF 파일 (pdf-lib) ────────────────────────────
    if (ext === '.pdf') {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(buffer);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];  // 결재란은 첫 페이지 우측 상단
      const { width: W, height: H } = firstPage.getSize();

      // pdf-lib 좌표: 좌측 하단 기준 (y=0 이 아래)
      // 1행: 헤더 ~96-100%, 2행: 서명칸 ~90-96%  →  yBottom = H*0.90, h = H*0.06
      const cells = [
        { x: W * 0.64,  yBottom: H * 0.90, w: W * 0.115, h: H * 0.060 },  // 담당
        { x: W * 0.755, yBottom: H * 0.90, w: W * 0.115, h: H * 0.060 },  // 검토
        { x: W * 0.87,  yBottom: H * 0.90, w: W * 0.115, h: H * 0.060 },  // 승인
      ];
      for (let i = 0; i < 3; i++) {
        if (!sigBufs[i]) continue;
        try {
          const image = await pdfDoc.embedPng(sigBufs[i]!);
          const { width: iw, height: ih } = image.size();
          const scale = Math.min(cells[i].w / iw, cells[i].h / ih);
          const drawW = iw * scale;
          const drawH = ih * scale;
          const drawX = cells[i].x + (cells[i].w - drawW) / 2;
          const drawY = cells[i].yBottom + (cells[i].h - drawH) / 2;
          firstPage.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });
        } catch {
          // JPG로 fallback
          try {
            const image = await pdfDoc.embedJpg(sigBufs[i]!);
            const { width: iw, height: ih } = image.size();
            const scale = Math.min(cells[i].w / iw, cells[i].h / ih);
            const drawW = iw * scale;
            const drawH = ih * scale;
            const drawX = cells[i].x + (cells[i].w - drawW) / 2;
            const drawY = cells[i].yBottom + (cells[i].h - drawH) / 2;
            firstPage.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });
          } catch { /* skip this signature */ }
        }
      }
      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
    }

    return buffer; // 지원되지 않는 형식은 원본 반환
  }

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

  // 서명 포함 다운로드 (안전관리자)
  app.get('/api/safety-manager-reports/:id/download-signed', isAuthenticated, async (req: any, res) => {
    try {
      const reports = await storage.getSafetyManagerReports();
      const report = reports.find((r: any) => r.id === parseInt(req.params.id));
      if (!report) return res.status(404).json({ message: "보고서 없음" });
      if (!report.fileUrl) return res.status(404).json({ message: "파일 없음" });

      const [sigManager, sigReviewer, sigApprover] = await Promise.all([
        storage.getSetting("approval_sign_manager"),
        storage.getSetting("approval_sign_reviewer"),
        storage.getSetting("approval_sign_approver"),
      ]);
      const sigs = {
        manager: sigManager?.value || null,
        reviewer: sigReviewer?.value || null,
        approver: sigApprover?.value || null,
      };

      const { buffer, ext } = await loadReportBuffer(report.fileUrl);
      const processed = await embedSignaturesIntoFile(buffer, ext, sigs);

      const mimeMap: Record<string, string> = {
        '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.hwp': 'application/x-hwp', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      const baseName = (report.fileOriginalName || `report${ext}`).replace(/\.[^.]+$/, '');
      const outExt = ['.jpg', '.jpeg'].includes(ext) ? '.png' : ext; // sharp outputs png
      const outMime = mimeMap[outExt] || 'application/octet-stream';
      const safeFilename = encodeURIComponent(`${baseName}_결재서명${outExt}`);
      const isInline = req.query.inline === 'true';
      res.setHeader('Content-Type', outMime);
      res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename*=UTF-8''${safeFilename}`);
      res.send(processed);
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
      const headquarters = req.query.headquarters as string | undefined;
      res.json(await storage.getHealthManagerReports(yearMonth, year, headquarters));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 파일만 먼저 업로드 → URL 반환 (등록 시 파일 재전송 불필요)
  app.post('/api/health-manager-reports/upload-file', requireEditor, reportUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });
      const origName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      const ext = path.extname(origName) || '.bin';
      const filename = `health-mgr-${Date.now()}${ext}`;
      const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
      let fileUrl: string;
      if (objUrl) {
        fileUrl = objUrl;
      } else {
        fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
        fileUrl = `/uploads/${filename}`;
      }
      res.json({ fileUrl, fileOriginalName: origName });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/health-manager-reports',
    (req: any, _res: any, next: any) => {
      console.log('[HMR] POST /api/health-manager-reports 수신, sessionUserId:', (req.session as any)?.userId, 'ct:', (req.headers['content-type'] || '').substring(0, 80));
      next();
    },
    requireEditor, async (req: any, res) => {
    try {
      const { visitDate, staffType, team, fileUrl: bodyFileUrl, fileOriginalName: bodyFileOriginalName } = req.body;
      console.log('[HMR] POST body:', { visitDate, staffType, team, hasFileUrl: !!bodyFileUrl });
      if (!visitDate || !staffType) return res.status(400).json({ message: "필수 항목 누락" });
      const derivedYearMonth = visitDate.substring(0, 7);
      const report = await storage.createHealthManagerReport({
        yearMonth: derivedYearMonth, visitDate, staffType,
        team: team || null,
        staffName: null, reportContent: null,
        fileUrl: bodyFileUrl || null,
        fileOriginalName: bodyFileOriginalName || null,
        notes: null,
        createdBy: req.user?.id?.toString() || null,
      });
      res.json(report);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch('/api/health-manager-reports/:id', requireEditor, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { visitDate, staffType, team, fileUrl: bodyFileUrl, fileOriginalName: bodyFileOriginalName } = req.body;
      const derivedYearMonth = visitDate ? visitDate.substring(0, 7) : undefined;
      const updates: any = { visitDate, staffType, team: team || null };
      if (derivedYearMonth) updates.yearMonth = derivedYearMonth;
      if (bodyFileUrl) {
        updates.fileUrl = bodyFileUrl;
        updates.fileOriginalName = bodyFileOriginalName || null;
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

  // 서명 포함 다운로드 (보건관리자)
  app.get('/api/health-manager-reports/:id/download-signed', isAuthenticated, async (req: any, res) => {
    try {
      const reports = await storage.getHealthManagerReports();
      const report = reports.find((r: any) => r.id === parseInt(req.params.id));
      if (!report) return res.status(404).json({ message: "보고서 없음" });
      if (!report.fileUrl) return res.status(404).json({ message: "파일 없음" });

      const [sigManager, sigReviewer, sigApprover] = await Promise.all([
        storage.getSetting("approval_sign_manager"),
        storage.getSetting("approval_sign_reviewer"),
        storage.getSetting("approval_sign_approver"),
      ]);
      const sigs = {
        manager: sigManager?.value || null,
        reviewer: sigReviewer?.value || null,
        approver: sigApprover?.value || null,
      };

      const { buffer, ext } = await loadReportBuffer(report.fileUrl);
      const processed = await embedSignaturesIntoFile(buffer, ext, sigs);

      const mimeMap: Record<string, string> = {
        '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.hwp': 'application/x-hwp', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      const baseName = (report.fileOriginalName || `report${ext}`).replace(/\.[^.]+$/, '');
      const outExt = ['.jpg', '.jpeg'].includes(ext) ? '.png' : ext;
      const outMime = mimeMap[outExt] || 'application/octet-stream';
      const safeFilename = encodeURIComponent(`${baseName}_결재서명${outExt}`);
      const isInline = req.query.inline === 'true';
      res.setHeader('Content-Type', outMime);
      res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename*=UTF-8''${safeFilename}`);
      res.send(processed);
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
      // pdf-parse 기본 import는 test/data 파일을 읽으려 해서 ENOENT 오류 발생 → lib 직접 import
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js' as any)).default as (buf: Buffer, opts?: any) => Promise<{ text: string; numpages: number }>;
      const result = await pdfParse(buffer);
      const text: string = result?.text ?? "";
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

  app.get('/api/education-tasks', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const tasks = await storage.getEducationTasks(headquarters);
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
    "대구본부": ["현장경영팀", "운용계획팀", "사업지원팀", "동대구운용팀", "포항운용팀", "안동운용팀", "서대구운용팀", "남대구운용팀", "구미운용팀", "문경운용팀"],
    "부산본부": ["현장경영팀", "운용계획팀", "운용지원팀", "사업지원팀", "동부산운용팀", "중부산운용팀", "서부산운용팀", "울산운용팀", "지하철운용팀", "김해운용팀", "창원운용팀", "진주운용팀", "통영운용팀", "고객케어팀"],
    "충청본부": ["현장경영팀", "운용계획팀", "운용지원팀", "사업지원팀", "천안운용팀", "서대전운용팀", "서산운용팀", "홍성운용팀", "논산운용팀", "청주운용팀", "충주운용팀", "동대전운용팀", "세종운용팀"],
    "호남본부": ["현장경영팀", "운용계획팀", "운용지원팀", "사업지원팀", "서광주운용팀", "북광주운용팀", "목포운용팀", "해남운용팀", "제주운용팀", "전주운용팀", "익산운용팀", "남원운용팀", "정읍운용팀", "순천운용팀"],
    "경영총괄": ["현장경영팀", "운용계획팀", "사업지원팀"],
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
        .resize(700, 460, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 92, mozjpeg: true })
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

      // 흰색 배경 → 투명 처리
      const { data, info } = await sharp(raw)
        .rotate()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels = new Uint8Array(data.buffer);
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        if (r > 230 && g > 230 && b > 230) pixels[i + 3] = 0;
      }

      const buf = await sharp(Buffer.from(pixels), {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
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

    // ── Row 1: 제목
    sigSheet.mergeCells("A1:F1");
    const tCell = sigSheet.getCell("A1");
    tCell.value = `"${taskTitle}" 참석자 명단`;
    tCell.font = { bold: true, size: 14 };
    tCell.alignment = { horizontal: "center", vertical: "middle" };
    tCell.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
    sigSheet.getRow(1).height = 34;

    // ── Row 2: 시행일시 / 부서명
    sigSheet.mergeCells("A2:C2");
    const dCell = sigSheet.getCell("A2");
    dCell.value = `□ 시행일시: ${session.educationDate}`;
    dCell.font = { size: 10 }; dCell.alignment = { vertical: "middle" };
    sigSheet.mergeCells("D2:F2");
    const bCell = sigSheet.getCell("D2");
    bCell.value = `□ 부서명: ${dept}`;
    bCell.font = { size: 10 }; bCell.alignment = { vertical: "middle" };
    sigSheet.getRow(2).height = 20;

    // ── Row 3: 헤더 (gray)
    const headerRow = 3;
    ["순번","이름","서명","순번","이름","서명"].forEach((h, i) => {
      const c = sigSheet.getRow(headerRow).getCell(i + 1);
      c.value = h; c.font = { bold: true, size: 10 };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
      c.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
    });
    sigSheet.getRow(headerRow).height = 20;

    // ── Rows 4~23: 서명 행 (좌 1~20, 우 21~40)
    for (let i = 0; i < SIG_ROWS; i++) {
      const row = sigSheet.getRow(headerRow + 1 + i);
      row.height = SIG_ROW_H;

      const sb = (cell: ExcelJS.Cell) => {
        cell.border = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
      };

      const lNum = row.getCell(1); lNum.value = i + 1;
      lNum.alignment = { horizontal: "center", vertical: "middle" }; sb(lNum);
      const lName = row.getCell(2);
      lName.alignment = { horizontal: "center", vertical: "middle" }; sb(lName);
      sb(row.getCell(3));

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

      const rIdx = i + SIG_ROWS;
      const rNum = row.getCell(4); rNum.value = i + SIG_ROWS + 1;
      rNum.alignment = { horizontal: "center", vertical: "middle" }; sb(rNum);
      const rName = row.getCell(5);
      rName.alignment = { horizontal: "center", vertical: "middle" }; sb(rName);
      sb(row.getCell(6));

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

    // ── 하단 요약 (대상인원 / 서명완료)
    const tSummaryRow = headerRow + SIG_ROWS + 1;
    sigSheet.mergeCells(`A${tSummaryRow}:C${tSummaryRow}`);
    const tSumL = sigSheet.getCell(`A${tSummaryRow}`);
    tSumL.value = `대상인원: ${session.totalParticipants || 0}명`;
    tSumL.font = { size: 10 }; tSumL.alignment = { horizontal: "right", vertical: "middle" };
    sigSheet.mergeCells(`D${tSummaryRow}:F${tSummaryRow}`);
    const tSumR = sigSheet.getCell(`D${tSummaryRow}`);
    tSumR.value = `서명완료: ${signatures.length}명`;
    tSumR.font = { size: 10, bold: true }; tSumR.alignment = { horizontal: "right", vertical: "middle" };
    sigSheet.getRow(tSummaryRow).height = 18;

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

    const PHOTO_ROW_H = 28;    // 행 높이(pt)
    const PHOTO_ROWS  = 8;     // 사진 1장당 행 수

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

  // === 산업안전보건관리비 사용내역 ===
  app.get('/api/safety-cost-records', isAuthenticated, async (req, res) => {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const headquarters = req.query.headquarters as string | undefined;
      const records = await storage.getSafetyCostRecords({ year, headquarters });
      res.json(records);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/safety-cost-records/:id', isAuthenticated, async (req: any, res, next) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return next(); // export, export-template 등 문자열 경로는 다음 라우터로 넘김
    try {
      const record = await storage.getSafetyCostRecord(id);
      if (!record) return res.status(404).json({ message: "Not found" });
      res.json(record);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/safety-cost-records', requireEditor, async (req: any, res) => {
    try {
      const { insertSafetyCostRecordSchema } = await import("@shared/schema");
      const numericFields = ['quantity','unitPrice','supplyAmount','vatAmount','totalAmount'];
      const body = { ...req.body };
      for (const f of numericFields) {
        if (body[f] !== null && body[f] !== undefined && body[f] !== '') body[f] = String(body[f]);
      }
      const data = insertSafetyCostRecordSchema.parse({ ...body, createdBy: req.user?.username || null });
      const record = await storage.createSafetyCostRecord(data);
      res.json(record);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.put('/api/safety-cost-records/:id', requireEditor, async (req, res) => {
    try {
      const record = await storage.updateSafetyCostRecord(Number(req.params.id), req.body);
      res.json(record);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete('/api/safety-cost-records/:id', requireEditor, async (req, res) => {
    try {
      await storage.deleteSafetyCostRecord(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // === 법정경비 Excel 다운로드 (첨부파일 이미지 포함) ===
  app.get('/api/safety-cost-records/export', isAuthenticated, async (req: any, res) => {
    try {
      const headquarters = req.query.headquarters as string | undefined;
      const now = new Date();
      const curYear = now.getFullYear();

      const syRaw = Number(req.query.startYear);
      const smRaw = Number(req.query.startMonth);
      const eyRaw = Number(req.query.endYear);
      const emRaw = Number(req.query.endMonth);
      const yearRaw = Number(req.query.year);

      let startYM: number | undefined;
      let endYM: number | undefined;
      let rangeLabel: string;

      if (syRaw > 2000 && smRaw >= 1 && smRaw <= 12 && eyRaw > 2000 && emRaw >= 1 && emRaw <= 12) {
        startYM = syRaw * 100 + smRaw;
        endYM = eyRaw * 100 + emRaw;
        rangeLabel = `${String(syRaw).slice(2)}년 ${smRaw}월 ~ ${String(eyRaw).slice(2)}년 ${emRaw}월`;
      } else {
        const year = (!isNaN(yearRaw) && yearRaw > 2000) ? yearRaw : curYear;
        startYM = year * 100 + 1;
        endYM = year * 100 + 12;
        rangeLabel = `${year}년`;
      }

      console.log(`[export] 법정경비 요청: startYM=${startYM}, endYM=${endYM}, hq=${headquarters}`);
      const [records, taxInvoices, projName, projContractor, projTotalAmt, projSupervisor] = await Promise.all([
        storage.getSafetyCostRecords({ headquarters, startYM, endYM }),
        storage.getSafetyCostTaxInvoices({ headquarters, startYM, endYM }),
        storage.getSetting("safety_cost_project_name"),
        storage.getSetting("safety_cost_contractor"),
        storage.getSetting("safety_cost_total_amount"),
        storage.getSetting("safety_cost_supervisor"),
      ]);
      console.log(`[export] DB 완료: records=${records.length}, taxInvoices=${taxInvoices.length}`);

      // ─── 헬퍼: URL → Buffer ──────────────────────────────────────────
      async function fetchBuf(url: string): Promise<Buffer | null> {
        if (!url) return null;
        try {
          if (url.startsWith("/objects/")) {
            const privateDir = process.env.PRIVATE_OBJECT_DIR;
            if (privateDir) {
              const parts = privateDir.replace(/^\//, "").split("/");
              const bucketName = parts[0];
              const prefix = parts.slice(1).join("/");
              const objectName = url.replace("/objects/", prefix ? `${prefix}/` : "");
              const [buf] = await objectStorageClient.bucket(bucketName).file(objectName.replace(/^\//, "")).download();
              return buf as Buffer;
            }
          } else if (url.startsWith("/uploads/")) {
            const localPath = path.join(uploadDir, url.replace("/uploads/", ""));
            if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
          } else if (url.startsWith("http")) {
            const r = await fetch(url);
            if (r.ok) return Buffer.from(await r.arrayBuffer());
          }
        } catch { /* skip */ }
        return null;
      }

      // ─── 헬퍼: magic byte로 이미지 타입 확인 ────────────────────────
      function detectImgExt(buf: Buffer): 'jpeg' | 'png' | 'gif' | null {
        if (!buf || buf.length < 4) return null;
        if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpeg';
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
        if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
        return null;
      }

      // ─── 헬퍼: sharp로 이미지 압축 ─────────────────────────────────
      const sharpLib = require('sharp') as typeof import('sharp');
      async function compressImg(buf: Buffer): Promise<Buffer> {
        try {
          return await sharpLib(buf)
            .resize({ width: 1500, height: 2000, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 82, mozjpeg: false })
            .toBuffer();
        } catch {
          return buf;
        }
      }

      // ─── 헬퍼: 여백 제거 후 압축 (세금계산서용) ──────────────────
      async function trimAndCompressImg(buf: Buffer): Promise<Buffer> {
        try {
          const trimmed = await sharpLib(buf).trim().toBuffer();
          return await sharpLib(trimmed)
            .resize({ width: 1500, height: 2000, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85, mozjpeg: false })
            .toBuffer();
        } catch {
          return compressImg(buf);
        }
      }

      // ─── 헬퍼: PDF 전체 페이지 → JPEG Buffer[] (pdftoppm, 압축률↑) ──
      async function pdfToAllPages(pdfBuf: Buffer): Promise<Buffer[]> {
        const ts = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const tmpPdf = path.join(os.tmpdir(), `sc_${ts}.pdf`);
        const outPrefix = path.join(os.tmpdir(), `sc_${ts}_out`);
        try {
          fs.writeFileSync(tmpPdf, pdfBuf);
          // -jpeg: JPEG 출력 (PNG 대비 크기 90% 절감), -r 96: 화면 표시용 적정 해상도
          // -f/-l 없이 실행하면 모든 페이지 변환
          await execFileAsync('pdftoppm', ['-r', '110', '-jpeg', '-jpegopt', 'quality=80', tmpPdf, outPrefix]);
          const dir = os.tmpdir();
          const base = path.basename(outPrefix);
          const files = fs.readdirSync(dir)
            .filter(f => f.startsWith(base) && (f.endsWith('.jpg') || f.endsWith('.jpeg')))
            .sort(); // 페이지 순서 보장
          const rawBufs: Buffer[] = [];
          for (const f of files) {
            const fpath = path.join(dir, f);
            rawBufs.push(fs.readFileSync(fpath));
            try { fs.unlinkSync(fpath); } catch {}
          }
          // sharp로 추가 압축 (크기 통일)
          const bufs = await Promise.all(rawBufs.map(b => compressImg(b)));
          console.log(`[export] PDF→JPEG 변환 완료: ${bufs.length}페이지, sizes=${bufs.map(b=>Math.round(b.length/1024)+'KB').join(',')}`);
          return bufs;
        } catch (e: any) {
          console.warn('[export] pdfToAllPages 실패:', e.message);
          // JPEG 옵션 미지원 시 PNG 폴백
          try {
            await execFileAsync('pdftoppm', ['-r', '96', '-png', tmpPdf, outPrefix]);
            const dir = os.tmpdir();
            const base = path.basename(outPrefix);
            const files = fs.readdirSync(dir).filter(f => f.startsWith(base) && f.endsWith('.png')).sort();
            const rawBufs: Buffer[] = [];
            for (const f of files) {
              const fpath = path.join(dir, f);
              rawBufs.push(fs.readFileSync(fpath));
              try { fs.unlinkSync(fpath); } catch {}
            }
            const bufs = await Promise.all(rawBufs.map(b => compressImg(b)));
            console.log(`[export] PDF→PNG 폴백 변환 완료: ${bufs.length}페이지`);
            return bufs;
          } catch (e2: any) {
            console.warn('[export] pdfToAllPages PNG 폴백도 실패:', e2.message);
            return [];
          }
        } finally {
          try { fs.unlinkSync(tmpPdf); } catch {}
        }
      }

      // ─── 헬퍼: URL → 임베드용 이미지 Buffer[] (PDF 전체 페이지 포함) ─
      async function fetchImgPages(url: string): Promise<Buffer[]> {
        const raw = await fetchBuf(url);
        if (!raw) return [];
        const isPdf = url.toLowerCase().includes('.pdf') ||
                      (raw.length >= 4 && raw[0] === 0x25 && raw[1] === 0x50 && raw[2] === 0x44 && raw[3] === 0x46);
        if (isPdf) return pdfToAllPages(raw);
        if (detectImgExt(raw)) return [await compressImg(raw)]; // 이미지: sharp 압축 후 반환
        return [];
      }

      // ─── 헬퍼: ExcelJS 이미지 임베딩 ───────────────────────────────
      function embedImage(
        wb: ExcelJS.Workbook, sheet: ExcelJS.Worksheet,
        imgBuf: Buffer, col0: number, rowIdx: number
      ): boolean {
        try {
          const ext = detectImgExt(imgBuf);
          if (!ext) return false;
          const imgId = wb.addImage({ base64: imgBuf.toString('base64'), extension: ext });
          sheet.addImage(imgId, {
            tl: { col: col0, row: rowIdx - 1 } as any,
            br: { col: col0 + 1, row: rowIdx } as any,
            editAs: 'oneCell',
          });
          return true;
        } catch { return false; }
      }

      // ─── 모든 첨부파일 사전 로드 (병렬, 전체 페이지) ─────────────────
      const IMG_ROW_H = 100;
      // url → Buffer[] (페이지별 이미지 배열)
      const imgCache = new Map<string, Buffer[]>();

      const allUrls = new Set<string>();
      for (const r of records) {
        if (r.quoteFileUrl) allUrls.add(r.quoteFileUrl);
        if (r.transactionFileUrl) allUrls.add(r.transactionFileUrl);
        if (r.certificateFileUrl) allUrls.add(r.certificateFileUrl);
        if (r.taxInvoiceFileUrl) allUrls.add(r.taxInvoiceFileUrl);
      }
      for (const t of taxInvoices) {
        if (t.fileUrl) allUrls.add(t.fileUrl);
      }

      // 세금계산서 URL 별도 수집 (여백 제거 처리용)
      const taxInvoiceUrls = new Set<string>();
      for (const t of taxInvoices) { if (t.fileUrl) taxInvoiceUrls.add(t.fileUrl); }
      for (const r of records) { if ((r as any).taxInvoiceFileUrl) taxInvoiceUrls.add((r as any).taxInvoiceFileUrl); }

      console.log(`[export] 첨부파일 로드 시작: ${allUrls.size}개`);
      await Promise.all(Array.from(allUrls).map(async (url) => {
        const pages = await fetchImgPages(url);
        imgCache.set(url, pages);
      }));

      // 세금계산서 이미지: 여백 제거 후 재압축
      await Promise.all(Array.from(taxInvoiceUrls).map(async (url) => {
        const pages = imgCache.get(url);
        if (!pages || pages.length === 0) return;
        const trimmed = await Promise.all(pages.map(b => trimAndCompressImg(b)));
        imgCache.set(url, trimmed);
        console.log(`[export] 세금계산서 여백제거: ${url.split('/').pop()}`);
      }));
      console.log(`[export] 첨부파일 로드 완료`);

      // ─── 엑셀 workbook 생성 함수 (5-시트 증빙자료 형식) ──────────────
      function buildWorkbook(withImages: boolean): ExcelJS.Workbook {
        const wb = new ExcelJS.Workbook();
        wb.creator = "안전포털시스템";
        wb.created = new Date();

        const BOLD = { bold: true };
        const CENTER = { horizontal: "center" as const, vertical: "middle" as const, wrapText: true };
        const THIN_BORDER = {
          top: { style: "thin" as const }, bottom: { style: "thin" as const },
          left: { style: "thin" as const }, right: { style: "thin" as const },
        };

        // ─── 레이아웃 상수 ────────────────────────────────────────────
        const TOTAL_COLS = 20;    // 총 20열
        const MID_IDX = 10;       // 0-based: 0-9 = 좌, 10-19 = 우
        const LAST_LETTER = "T";  // 20번째 열
        const MID_LETTER_L = "J"; // 10번째 열 (좌 끝)
        const MID_LETTER_R = "K"; // 11번째 열 (우 시작)
        // 25cm × 25cm 이미지: 1cm = 28.35pt → 25cm ≈ 709pt
        // 열 너비: 25cm / 10열 / 0.2646cm per unit ≈ 9.45 → 9.5
        const COL_W = 9.5;        // 각 열 너비 (10열 = 약 25cm)
        const IMG_H = 709;        // 이미지 행 높이 ≈ 25cm
        const LABEL_H = 28;       // 레이블 행 높이
        const INFO_H = 50;        // 품명/업체/금액 정보 행 높이
        const HDR_H = 32;

        // ─── 헬퍼: 열 인덱스(1-based) → Excel 열 문자 ───────────────
        function colLetter(col: number): string {
          let s = '';
          while (col > 0) {
            const rem = (col - 1) % 26;
            s = String.fromCharCode(65 + rem) + s;
            col = Math.floor((col - 1) / 26);
          }
          return s;
        }

        // ─── 헬퍼: imgCache에서 페이지 배열 ─────────────────────────
        function getPages(url: string | null | undefined): Buffer[] {
          if (!url || !withImages) return [];
          return imgCache.get(url) ?? [];
        }

        // ─── 헬퍼: 시트 컬럼 폭 설정 (COL_W=9.5: 10열 ≈ 25cm) ──────
        function setupCols(ws: ExcelJS.Worksheet) {
          for (let i = 1; i <= TOTAL_COLS; i++) {
            ws.getColumn(i).width = COL_W;
          }
        }

        // ─── 헬퍼: 전체 너비 제목/헤더 행 ───────────────────────────
        function addTitle(ws: ExcelJS.Worksheet, ri: number, text: string, textArgb: string, bgArgb: string, sz = 13): number {
          const row = ws.getRow(ri);
          row.height = HDR_H + 4;
          const c = row.getCell(1);
          c.value = text;
          c.font = { bold: true, size: sz, color: { argb: textArgb } };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
          c.alignment = CENTER;
          c.border = THIN_BORDER;
          ws.mergeCells(`A${ri}:${LAST_LETTER}${ri}`);
          return ri + 1;
        }

        // ─── 헬퍼: 월별 구분 헤더 ───────────────────────────────────
        function addMonthHdr(ws: ExcelJS.Worksheet, ri: number, text: string, bgArgb: string): number {
          const row = ws.getRow(ri);
          row.height = HDR_H;
          const c = row.getCell(1);
          c.value = text;
          c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
          c.alignment = { horizontal: "left", vertical: "middle" };
          c.border = THIN_BORDER;
          ws.mergeCells(`A${ri}:${LAST_LETTER}${ri}`);
          return ri + 1;
        }

        // ─── 헬퍼: 전체 너비 설명/레이블 행 ────────────────────────
        function addFullLabel(ws: ExcelJS.Worksheet, ri: number, text: string, bgArgb: string): number {
          const row = ws.getRow(ri);
          row.height = LABEL_H;
          const c = row.getCell(1);
          c.value = text;
          c.font = { bold: true, size: 12 };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
          c.alignment = { horizontal: "left", vertical: "middle" };
          c.border = THIN_BORDER;
          ws.mergeCells(`A${ri}:${LAST_LETTER}${ri}`);
          return ri + 1;
        }

        // ─── 헬퍼: 품명/업체/금액 등 굵은 정보 행 (큰 글씨) ────────
        function addInfoLabel(ws: ExcelJS.Worksheet, ri: number, text: string, bgArgb: string): number {
          const row = ws.getRow(ri);
          row.height = INFO_H;
          const c = row.getCell(1);
          c.value = text;
          c.font = { bold: true, size: 13 };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
          c.alignment = { horizontal: "left", vertical: "middle", wrapText: false };
          c.border = THIN_BORDER;
          ws.mergeCells(`A${ri}:${LAST_LETTER}${ri}`);
          return ri + 1;
        }

        // ─── 헬퍼: 품명/업체/금액 테이블형 정보 행 ─────────────────
        // items: [{label, value}] — 3개(품명/업체/금액) 또는 4개(+구매일)
        // valBgArgb: 값 셀 배경색; 레이블 셀은 자동으로 진한 배경 사용
        function addInfoGrid(
          ws: ExcelJS.Worksheet,
          ri: number,
          items: { label: string; value: string }[],
          valBgArgb: string,
          labelBgArgb: string
        ): number {
          const row = ws.getRow(ri);
          row.height = INFO_H;
          const n = items.length;
          const colsPerItem = Math.floor(TOTAL_COLS / n); // 예: 3개→6열씩, 4개→5열씩
          const LABEL_SPAN = 2; // 레이블 열 수

          for (let fi = 0; fi < n; fi++) {
            const startCol = fi * colsPerItem + 1;
            const endCol = fi === n - 1 ? TOTAL_COLS : (fi + 1) * colsPerItem;
            const labelEnd = startCol + LABEL_SPAN - 1;
            const valueStart = labelEnd + 1;

            const { label, value } = items[fi];

            // 레이블 셀
            const lc = row.getCell(startCol);
            lc.value = label;
            lc.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
            lc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: labelBgArgb } };
            lc.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
            lc.border = THIN_BORDER;
            if (startCol < labelEnd) ws.mergeCells(`${colLetter(startCol)}${ri}:${colLetter(labelEnd)}${ri}`);

            // 값 셀
            const vc = row.getCell(valueStart);
            vc.value = value;
            vc.font = { bold: true, size: 12 };
            vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: valBgArgb } };
            vc.alignment = { horizontal: "left", vertical: "middle", wrapText: false };
            vc.border = THIN_BORDER;
            if (valueStart < endCol) ws.mergeCells(`${colLetter(valueStart)}${ri}:${colLetter(endCol)}${ri}`);
          }
          return ri + 1;
        }

        // ─── 헬퍼: 좌/우 분할 레이블 행 ────────────────────────────
        function addLRLabel(ws: ExcelJS.Worksheet, ri: number, lText: string, rText: string, lBg: string, rBg: string): number {
          const row = ws.getRow(ri);
          row.height = LABEL_H;
          const lc = row.getCell(1);
          lc.value = lText;
          lc.font = BOLD;
          lc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lBg } };
          lc.alignment = CENTER;
          lc.border = THIN_BORDER;
          ws.mergeCells(`A${ri}:${MID_LETTER_L}${ri}`);
          const rc = row.getCell(MID_IDX + 1);
          rc.value = rText;
          rc.font = BOLD;
          rc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rBg } };
          rc.alignment = CENTER;
          rc.border = THIN_BORDER;
          ws.mergeCells(`${MID_LETTER_R}${ri}:${LAST_LETTER}${ri}`);
          return ri + 1;
        }

        // ─── 헬퍼: 좌/우 반반 분할 정보 그리드 ─────────────────────
        // 좌측 절반(col 1-10)에 leftItems, 우측 절반(col 11-20)에 rightItems 표시
        function addSplitInfoGrid(
          ws: ExcelJS.Worksheet, ri: number,
          leftItems: { label: string; value: string }[],
          rightItems: { label: string; value: string }[],
          leftValBg: string, rightValBg: string,
          leftLabelBg: string, rightLabelBg: string
        ): number {
          const row = ws.getRow(ri);
          row.height = INFO_H;
          const HALF = Math.floor(TOTAL_COLS / 2); // 10
          const LABEL_SPAN = 2;

          const fillHalf = (
            items: { label: string; value: string }[],
            offset: number, valBg: string, labelBg: string
          ) => {
            const n = items.length;
            const colsPerItem = Math.floor(HALF / n);
            for (let fi = 0; fi < n; fi++) {
              const startCol = offset + fi * colsPerItem + 1;
              const endCol = fi === n - 1 ? offset + HALF : offset + (fi + 1) * colsPerItem;
              const labelEnd = startCol + LABEL_SPAN - 1;
              const valueStart = labelEnd + 1;
              const { label, value } = items[fi];
              const lc = row.getCell(startCol);
              lc.value = label;
              lc.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
              lc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: labelBg } };
              lc.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
              lc.border = THIN_BORDER;
              if (startCol < labelEnd) ws.mergeCells(`${colLetter(startCol)}${ri}:${colLetter(labelEnd)}${ri}`);
              const vc = row.getCell(valueStart);
              vc.value = value;
              vc.font = { bold: true, size: 12 };
              vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: valBg } };
              vc.alignment = { horizontal: "left", vertical: "middle", wrapText: false };
              vc.border = THIN_BORDER;
              if (valueStart < endCol) ws.mergeCells(`${colLetter(valueStart)}${ri}:${colLetter(endCol)}${ri}`);
            }
          };

          if (leftItems.length > 0) {
            fillHalf(leftItems, 0, leftValBg, leftLabelBg);
          } else {
            const c = row.getCell(1);
            c.value = "-"; c.alignment = { horizontal: "center", vertical: "middle" };
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
            c.border = THIN_BORDER;
            ws.mergeCells(`A${ri}:${MID_LETTER_L}${ri}`);
          }
          if (rightItems.length > 0) {
            fillHalf(rightItems, HALF, rightValBg, rightLabelBg);
          } else {
            const c = row.getCell(HALF + 1);
            c.value = "-"; c.alignment = { horizontal: "center", vertical: "middle" };
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
            c.border = THIN_BORDER;
            ws.mergeCells(`${MID_LETTER_R}${ri}:${LAST_LETTER}${ri}`);
          }
          return ri + 1;
        }

        // ─── 헬퍼: 좌/우 이미지 페어 행 삽입 ───────────────────────
        function addImgPair(
          ws: ExcelJS.Worksheet, ri: number,
          lBufs: Buffer[], rBufs: Buffer[],
          lHasFile: boolean, rHasFile: boolean
        ): number {
          const hasAny = lBufs.length > 0 || rBufs.length > 0;
          const pages = Math.max(lBufs.length, rBufs.length, (lHasFile || rHasFile) ? 1 : 0);
          if (pages === 0) return ri;

          for (let pg = 0; pg < pages; pg++) {
            const row = ws.getRow(ri);
            row.height = (withImages && hasAny) ? IMG_H : 40;

            if (!withImages || !hasAny) {
              // 텍스트 전용 모드
              if (lHasFile && pg === 0) {
                const c = row.getCell(1);
                c.value = "✓ 첨부"; c.alignment = CENTER;
                c.font = { color: { argb: "FF1F4E79" }, bold: true };
                c.border = THIN_BORDER;
                ws.mergeCells(`A${ri}:${MID_LETTER_L}${ri}`);
              }
              if (rHasFile && pg === 0) {
                const c = row.getCell(MID_IDX + 1);
                c.value = "✓ 첨부"; c.alignment = CENTER;
                c.font = { color: { argb: "FF1F4E79" }, bold: true };
                c.border = THIN_BORDER;
                ws.mergeCells(`${MID_LETTER_R}${ri}:${LAST_LETTER}${ri}`);
              }
            } else {
              // 이미지 모드: 좌측 이미지
              if (lBufs[pg]) {
                try {
                  const ext = detectImgExt(lBufs[pg]);
                  if (ext) {
                    const id = wb.addImage({ base64: lBufs[pg].toString("base64"), extension: ext });
                    ws.addImage(id, { tl: { col: 0, row: ri - 1 } as any, br: { col: MID_IDX, row: ri } as any, editAs: "oneCell" });
                  }
                } catch {}
              }
              // 우측 이미지
              if (rBufs[pg]) {
                try {
                  const ext = detectImgExt(rBufs[pg]);
                  if (ext) {
                    const id = wb.addImage({ base64: rBufs[pg].toString("base64"), extension: ext });
                    ws.addImage(id, { tl: { col: MID_IDX, row: ri - 1 } as any, br: { col: TOTAL_COLS, row: ri } as any, editAs: "oneCell" });
                  }
                } catch {}
              }
            }
            ri++;
          }
          return ri;
        }

        // ─── 헬퍼: 전체 너비 단일 이미지 행 삽입 ───────────────────
        function addFullImg(ws: ExcelJS.Worksheet, ri: number, bufs: Buffer[], hasFile: boolean): number {
          const hasAny = bufs.length > 0;
          const pages = Math.max(bufs.length, hasFile ? 1 : 0);
          if (pages === 0) return ri;

          for (let pg = 0; pg < pages; pg++) {
            const row = ws.getRow(ri);
            row.height = (withImages && hasAny) ? IMG_H : 40;

            if (!withImages || !hasAny) {
              if (hasFile && pg === 0) {
                const c = row.getCell(1);
                c.value = "✓ 첨부"; c.alignment = CENTER;
                c.font = { color: { argb: "FF1F4E79" }, bold: true };
                c.border = THIN_BORDER;
                ws.mergeCells(`A${ri}:${LAST_LETTER}${ri}`);
              }
            } else if (bufs[pg]) {
              try {
                const ext = detectImgExt(bufs[pg]);
                if (ext) {
                  const id = wb.addImage({ base64: bufs[pg].toString("base64"), extension: ext });
                  ws.addImage(id, { tl: { col: 0, row: ri - 1 } as any, br: { col: TOTAL_COLS, row: ri } as any, editAs: "oneCell" });
                }
              } catch {}
            }
            ri++;
          }
          return ri;
        }

        // ─── 헬퍼: 연도+월 복합 그룹핑 (ym = year*100+month) ─────────
        function groupByYM<T extends { year: number | null; month: number | null }>(recs: T[]): Map<number, T[]> {
          const map = new Map<number, T[]>();
          for (const r of recs) {
            const ym = (r.year ?? 0) * 100 + (r.month ?? 0);
            if (!map.has(ym)) map.set(ym, []);
            map.get(ym)!.push(r);
          }
          return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
        }
        // ─── 헬퍼: ym 키에서 "25년 10월" 형식 문자열 ────────────────
        function ymLabel(ym: number): string {
          const y = Math.floor(ym / 100);
          const m = ym % 100;
          return `${String(y).slice(2)}년 ${m}월`;
        }

        // ─── 헬퍼: 문서쌍(견적서+거래명세서)으로 레코드 그룹핑 ────────
        function groupByDocPair<T extends {
          quoteFileUrl?: string | null;
          transactionFileUrl?: string | null;
          taxInvoiceFileUrl?: string | null;
        }>(recs: T[]): Map<string, T[]> {
          const map = new Map<string, T[]>();
          for (const rec of recs) {
            const key = (rec.quoteFileUrl || '') + '\x00' + (rec.transactionFileUrl || '');
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(rec);
          }
          return map;
        }

        // ─── 카테고리 상수 ───────────────────────────────────────────
        const CAT1 = "1. 안전관리자 등 인건비 및 각종 업무수당 등";
        const CAT3 = "3. 개인보호구 및 안전장구 구입비 등";
        const CAT5 = "5. 안전보건교육비 및 행사비 등";
        const CAT9 = "9. 위험성평가 및 산보위 안건 비용";

        // ════════════════════════════════════════════════════════════
        // Sheet 1: 개인보호구 및 안전장구 구입비
        // 월별: 견적서(좌) | 거래명세서(우) + 세금계산서
        // ════════════════════════════════════════════════════════════
        const cat3Recs = records.filter(r => r.category === CAT3);
        const cat3ByYM = groupByYM(cat3Recs);

        const ws1 = wb.addWorksheet("3.개인보호구및안전장구구입비");
        setupCols(ws1);
        let r1 = 1;
        r1 = addTitle(ws1, r1, `개인보호구 및 안전장구 구입비 증빙자료 (${rangeLabel})`, "FFFFFFFF", "FF1F4E79");

        if (cat3Recs.length === 0) {
          addFullLabel(ws1, r1, "해당 기간에 개인보호구 및 안전장구 구입비 내역이 없습니다.", "FFFFF0F0");
        } else {
          for (const [ym, mRecs] of cat3ByYM) {
            r1 = addMonthHdr(ws1, r1, `  ${ymLabel(ym)} 개인보호구 및 안전장구 구입비`, "FF2E75B6");

            for (const groupRecs of groupByDocPair(mRecs).values()) {
              // ① 같은 문서를 공유하는 물품들을 2개씩 가로(좌/우)로 배치, 필드는 행별로 분리
              for (let gi = 0; gi < groupRecs.length; gi += 2) {
                const recL = groupRecs[gi];
                const recR = groupRecs[gi + 1];
                // 품명 행
                r1 = addSplitInfoGrid(ws1, r1,
                  [{ label: "품명", value: recL.itemName || "-" }],
                  recR ? [{ label: "품명", value: recR.itemName || "-" }] : [],
                  "FFE8F0FE", "FFE8F0FE", "FF2E75B6", "FF2E75B6"
                );
                // 업체 행
                r1 = addSplitInfoGrid(ws1, r1,
                  [{ label: "업체", value: recL.vendorName || "-" }],
                  recR ? [{ label: "업체", value: recR.vendorName || "-" }] : [],
                  "FFE8F0FE", "FFE8F0FE", "FF2E75B6", "FF2E75B6"
                );
                // 금액 행
                r1 = addSplitInfoGrid(ws1, r1,
                  [{ label: "금액", value: `${Number(recL.totalAmount || 0).toLocaleString()}원` }],
                  recR ? [{ label: "금액", value: `${Number(recR.totalAmount || 0).toLocaleString()}원` }] : [],
                  "FFFFFACD", "FFFFFACD", "FF2E75B6", "FF2E75B6"
                );
              }
              // ② 문서 이미지는 한 번만
              const rep1 = groupRecs[0];
              const hasQ1 = !!rep1.quoteFileUrl;
              const hasT1 = !!rep1.transactionFileUrl;
              if (hasQ1 || hasT1) {
                r1 = addLRLabel(ws1, r1, "  📄 견적서", "  📋 거래명세서", "FFD6E4F7", "FFD6F0E4");
                r1 = addImgPair(ws1, r1, hasQ1 ? getPages(rep1.quoteFileUrl) : [], hasT1 ? getPages(rep1.transactionFileUrl) : [], hasQ1, hasT1);
              }
            }

            // 월 구분 여백
            ws1.getRow(r1).height = 14;
            r1++;
          }
        }

        // ════════════════════════════════════════════════════════════
        // Sheet 2: 안전관리자 등 인건비
        // 월별 2열: 좌=안전관리자 수수료 / 우=보건관리자 수수료
        // ════════════════════════════════════════════════════════════
        const cat1Recs = records.filter(r => r.category === CAT1);
        const safetyMgr = cat1Recs.filter(r =>
          (r.itemName || "").includes("안전관리") || (r.subCategory || "").includes("안전관리")
        );
        const healthMgr = cat1Recs.filter(r =>
          (r.itemName || "").includes("보건관리") || (r.subCategory || "").includes("보건관리")
        );
        // 분류 안 된 나머지 → 안전관리로 포함
        const unclassified = cat1Recs.filter(r => !safetyMgr.includes(r) && !healthMgr.includes(r));
        const safetyAll = [...safetyMgr, ...unclassified];

        const ws2 = wb.addWorksheet("1.인건비및각종업무수당");
        setupCols(ws2);
        let r2 = 1;
        r2 = addTitle(ws2, r2, `안전관리자 등 인건비 및 수당 증빙자료 (${rangeLabel})`, "FFFFFFFF", "FF1F4E79");

        // 두 그룹을 월별로 통합 → 안전/보건 각각 좌/우 표시
        const safetyByYM2 = groupByYM(safetyAll);
        const healthByYM2 = groupByYM(healthMgr);
        const allYMs2 = [...new Set([...safetyByYM2.keys(), ...healthByYM2.keys()])].sort((a, b) => a - b);

        if (allYMs2.length === 0) {
          r2 = addFullLabel(ws2, r2, "해당 기간에 안전관리자 등 인건비 내역이 없습니다.", "FFFFF0F0");
        } else {
          for (const ym of allYMs2) {
            const sRecs = safetyByYM2.get(ym) ?? [];
            const hRecs = healthByYM2.get(ym) ?? [];
            const sRep = sRecs[0];
            const hRep = hRecs[0];
            const sTotal = sRecs.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
            const hTotal = hRecs.reduce((s, r) => s + Number(r.totalAmount || 0), 0);

            // 월 헤더 (전체 너비)
            r2 = addMonthHdr(ws2, r2, `  ${ymLabel(ym)}`, "FF1F4E79");

            // 구분 레이블: 안전관리자 수수료(좌) | 보건관리자 수수료(우)
            r2 = addLRLabel(ws2, r2,
              "  🔵 안전관리자 수수료",
              "  🟢 보건관리자 수수료",
              "FFD6E4F7", "FFD6F0E4"
            );

            // 항목/업체/금액 정보: 행별로 분리하여 값 칸 확보
            r2 = addSplitInfoGrid(ws2, r2,
              sRep ? [{ label: "항목", value: sRep.itemName || "-" }] : [],
              hRep ? [{ label: "항목", value: hRep.itemName || "-" }] : [],
              "FFE8F0FE", "FFE8F5EE", "FF2E75B6", "FF1F7055"
            );
            r2 = addSplitInfoGrid(ws2, r2,
              sRep ? [{ label: "업체", value: sRep.vendorName || "-" }] : [],
              hRep ? [{ label: "업체", value: hRep.vendorName || "-" }] : [],
              "FFE8F0FE", "FFE8F5EE", "FF2E75B6", "FF1F7055"
            );
            r2 = addSplitInfoGrid(ws2, r2,
              sRep ? [{ label: "금액", value: `${sTotal.toLocaleString()}원` }] : [],
              hRep ? [{ label: "금액", value: `${hTotal.toLocaleString()}원` }] : [],
              "FFFFFACD", "FFFFFACD", "FF2E75B6", "FF1F7055"
            );

            // 첨부 이미지: 문서 종류별로 좌/우 페어
            const docTypes = [
              { key: "quoteFileUrl",       icon: "📋 위탁계약서",    lBg: "FFD6E4F7", rBg: "FFD6F0E4" },
              { key: "transactionFileUrl", icon: "🧾 거래명세서",    lBg: "FFD6F0E4", rBg: "FFD6E4F7" },
              { key: "taxInvoiceFileUrl",  icon: "💰 세금계산서",    lBg: "FFFFF3D6", rBg: "FFFFF3D6" },
              { key: "certificateFileUrl", icon: "🎓 수료증/이수증", lBg: "FFEAD6F7", rBg: "FFEAD6F7" },
            ] as const;

            for (const { key, icon, lBg, rBg } of docTypes) {
              const lUrl = sRep?.[key] ?? null;
              const rUrl = hRep?.[key] ?? null;
              if (lUrl || rUrl) {
                r2 = addLRLabel(ws2, r2, `  ${icon} (안전)`, `  ${icon} (보건)`, lBg, rBg);
                r2 = addImgPair(ws2, r2,
                  lUrl ? getPages(lUrl) : [],
                  rUrl ? getPages(rUrl) : [],
                  !!lUrl, !!rUrl
                );
              }
            }

            // 월 구분 여백
            ws2.getRow(r2).height = 14;
            r2++;
          }
        }

        // ════════════════════════════════════════════════════════════
        // Sheet 3: 안전보건교육비 집행금액
        // 교육 시기별: 수료증(좌) | 세금계산서(우)
        // ════════════════════════════════════════════════════════════
        const cat5Recs = records.filter(r => r.category === CAT5);
        const cat5ByYM = groupByYM(cat5Recs);

        const ws3 = wb.addWorksheet("5.안전보건교육비및행사비");
        setupCols(ws3);
        let r3 = 1;
        r3 = addTitle(ws3, r3, `안전보건교육비 집행금액 증빙자료 (${rangeLabel})`, "FFFFFFFF", "FF7030A0");

        if (cat5Recs.length === 0) {
          addFullLabel(ws3, r3, "해당 기간에 안전보건교육비 내역이 없습니다.", "FFFFF0F0");
        } else {
          for (const [ym, mRecs] of cat5ByYM) {
            r3 = addMonthHdr(ws3, r3, `  ${ymLabel(ym)} 안전보건교육비 집행`, "FF7030A0");

            for (const groupRecs of groupByDocPair(mRecs).values()) {
              // ① 같은 문서를 공유하는 교육항목 정보 먼저 모두 표시 (2열씩 행 분리)
              for (const rec of groupRecs) {
                r3 = addInfoGrid(ws3, r3, [
                  { label: "교육명", value: rec.itemName || "-" },
                  { label: "업체",   value: rec.vendorName || "-" },
                ], "FFF3E8FD", "FF7030A0");
                r3 = addInfoGrid(ws3, r3, [
                  { label: "구매일", value: rec.purchaseDate || "-" },
                  { label: "금액",   value: `${Number(rec.totalAmount || 0).toLocaleString()}원` },
                ], "FFF3E8FD", "FF7030A0");
              }
              // ② 공유 문서 이미지는 한 번만 (대표 레코드 기준)
              const rep3 = groupRecs[0];
              if (rep3.taxInvoiceFileUrl) {
                r3 = addFullLabel(ws3, r3, "  💰 세금계산서", "FFFFF3D6");
                r3 = addFullImg(ws3, r3, getPages(rep3.taxInvoiceFileUrl), true);
              }
              if (rep3.transactionFileUrl) {
                r3 = addFullLabel(ws3, r3, "  🧾 거래명세서", "FFD6E4F7");
                r3 = addFullImg(ws3, r3, getPages(rep3.transactionFileUrl), true);
              }
              if (rep3.quoteFileUrl) {
                r3 = addFullLabel(ws3, r3, "  📄 견적서 / 관련서류", "FFE8D6F7");
                r3 = addFullImg(ws3, r3, getPages(rep3.quoteFileUrl), true);
              }
              // ③ 수료증은 레코드별 개별 표시 (각 교육생마다 다를 수 있음)
              for (const rec of groupRecs) {
                if (rec.certificateFileUrl) {
                  r3 = addFullLabel(ws3, r3, "  🎓 수료증 / 이수증", "FFEAD6F7");
                  r3 = addFullImg(ws3, r3, getPages(rec.certificateFileUrl), true);
                }
              }
            }

            ws3.getRow(r3).height = 14;
            r3++;
          }
        }

        // ════════════════════════════════════════════════════════════
        // Sheet 4: 위험성평가 및 산보위 안건 비용
        // 월별: 견적서 → 거래명세서 → 세금계산서 세로 배치
        // ════════════════════════════════════════════════════════════
        const cat9Recs = records.filter(r => r.category === CAT9);
        const cat9ByYM = groupByYM(cat9Recs);

        const ws4 = wb.addWorksheet("9.위험성평가및산보위비용");
        setupCols(ws4);
        let r4 = 1;
        r4 = addTitle(ws4, r4, `위험성평가 및 산보위 안건 비용 증빙자료 (${rangeLabel})`, "FFFFFFFF", "FF833C00");

        if (cat9Recs.length === 0) {
          addFullLabel(ws4, r4, "해당 기간에 위험성평가 및 산보위 안건 비용 내역이 없습니다.", "FFFFF0F0");
        } else {
          for (const [ym, mRecs] of cat9ByYM) {
            r4 = addMonthHdr(ws4, r4, `  ${ymLabel(ym)} 위험성평가/산보위 비용`, "FF833C00");

            for (const groupRecs of groupByDocPair(mRecs).values()) {
              // ① 같은 문서를 공유하는 물품들의 정보를 먼저 모두 표시 (2열씩 행 분리)
              for (const rec of groupRecs) {
                r4 = addInfoGrid(ws4, r4, [
                  { label: "품명", value: rec.itemName || "-" },
                  { label: "업체", value: rec.vendorName || "-" },
                ], "FFE8F0FE", "FF833C00");
                r4 = addInfoGrid(ws4, r4, [
                  { label: "금액", value: `${Number(rec.totalAmount || 0).toLocaleString()}원` },
                ], "FFFFFACD", "FF833C00");
              }
              // ② 문서 이미지는 한 번만
              const rep4 = groupRecs[0];
              const hasQ4 = !!rep4.quoteFileUrl;
              const hasT4 = !!rep4.transactionFileUrl;
              if (hasQ4 || hasT4) {
                r4 = addLRLabel(ws4, r4, "  📄 견적서", "  📋 거래명세서", "FFD6E4F7", "FFD6F0E4");
                r4 = addImgPair(ws4, r4, hasQ4 ? getPages(rep4.quoteFileUrl) : [], hasT4 ? getPages(rep4.transactionFileUrl) : [], hasQ4, hasT4);
              }
            }

            ws4.getRow(r4).height = 14;
            r4++;
          }
        }

        // ════════════════════════════════════════════════════════════
        // Sheet 5: 세금계산서 (월별)
        // 같은 월 복수 세금계산서 → 좌/우 가로 배치
        // ════════════════════════════════════════════════════════════
        const ws5 = wb.addWorksheet("세금계산서");
        setupCols(ws5);
        let r5 = 1;
        r5 = addTitle(ws5, r5, `세금계산서 현황 (${rangeLabel})`, "FFFFFFFF", "FF1F4E79");

        if (taxInvoices.length === 0) {
          addFullLabel(ws5, r5, "해당 기간에 등록된 세금계산서가 없습니다.", "FFFFF0F0");
        } else {
          // 월별 그룹핑
          const taxByYM = groupByYM(taxInvoices as any[]);

          for (const [ym, mTaxes] of taxByYM) {
            r5 = addMonthHdr(ws5, r5, `  ${ymLabel(ym)} 세금계산서`, "FF2E75B6");

            // 2개씩 짝지어 좌/우 가로 배치
            for (let i = 0; i < mTaxes.length; i += 2) {
              const left = mTaxes[i] as any;
              const right = mTaxes[i + 1] as any;

              if (right) {
                // 좌/우 info 행: 업체 | 금액
                const lRow = ws5.getRow(r5);
                lRow.height = INFO_H;
                // 좌측 정보
                const lLabel = ws5.getRow(r5).getCell(1);
                lLabel.value = `${left.vendorName || "업체명 없음"}  |  ${Number(left.totalAmount || 0).toLocaleString()}원`;
                lLabel.font = { bold: true, size: 12 };
                lLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
                lLabel.alignment = { horizontal: "center", vertical: "middle" };
                lLabel.border = THIN_BORDER;
                ws5.mergeCells(`A${r5}:${MID_LETTER_L}${r5}`);
                // 우측 정보
                const rLabel = ws5.getRow(r5).getCell(MID_IDX + 1);
                rLabel.value = `${right.vendorName || "업체명 없음"}  |  ${Number(right.totalAmount || 0).toLocaleString()}원`;
                rLabel.font = { bold: true, size: 12 };
                rLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5EE" } };
                rLabel.alignment = { horizontal: "center", vertical: "middle" };
                rLabel.border = THIN_BORDER;
                ws5.mergeCells(`${MID_LETTER_R}${r5}:${LAST_LETTER}${r5}`);
                r5++;

                const lBufs = getPages(left.fileUrl);
                const rBufs = getPages(right.fileUrl);
                r5 = addImgPair(ws5, r5, lBufs, rBufs, !!left.fileUrl, !!right.fileUrl);
              } else {
                // 홀수 마지막 → 전체 너비
                r5 = addInfoLabel(ws5, r5,
                  `  ${left.vendorName || "업체명 없음"}  |  ${Number(left.totalAmount || 0).toLocaleString()}원${left.notes ? "  |  " + left.notes : ""}`,
                  "FFE8F0FE");
                r5 = addFullImg(ws5, r5, getPages(left.fileUrl), !!left.fileUrl);
              }
            }

            ws5.getRow(r5).height = 14;
            r5++;
          }
        }

        // ════════════════════════════════════════════════════════════
        // Sheet 7: 안전관리비 사용내역서 (원본 양식 디자인 + 드롭다운 + 자동계산)
        // ════════════════════════════════════════════════════════════

        // 모든 카테고리 순서 (Sheet 7 전체에서 사용)
        const ALL_CATS = [
          "1. 안전관리자 등 인건비 및 각종 업무수당 등",
          "2. 안전시설비 등",
          "3. 개인보호구 및 안전장구 구입비 등",
          "4. 안전진단비 등",
          "5. 안전보건교육비 및 행사비 등",
          "6. 근로자 건강관리비 등",
          "7. 건설재해예방 기술지도비",
          "8. 본사사용비",
          "9. 위험성평가 및 산보위 안건 비용",
        ];

        // 숨김 시트: 드롭다운 목록 소스
        const wsCatList = wb.addWorksheet("분류항목목록");
        (wsCatList as any).state = "hidden";
        ALL_CATS.forEach((cat, i) => { wsCatList.getCell(`A${i + 1}`).value = cat; });

        const ws7 = wb.addWorksheet("안전관리비사용내역서");

        // 컬럼 폭 설정 (13개 컬럼)
        const T7_WIDTHS = [36, 5, 5, 26, 6, 13, 14, 16, 18, 13, 8, 12, 15];
        T7_WIDTHS.forEach((w, i) => { ws7.getColumn(i + 1).width = w; });

        const T7_LAST = "M";
        const T7_NCOLS = 13;

        // 색상 팔레트 (원본 양식에 맞춤)
        const C_TITLE_BG   = "FF17375E"; // 제목 진네이비
        const C_TITLE_FG   = "FFFFFFFF";
        const C_INFO_LBL   = "FFD6DCE4"; // 정보행 라벨 회색
        const C_INFO_VAL   = "FFFFFFFF";
        const C_SEC_BLU    = "FF4472C4"; // 협력사기재 파랑
        const C_SEC_GRN    = "FF375623"; // 계약팀기재 녹색
        const C_HDR_BG     = "FF4472C4"; // 컬럼 헤더
        const C_HDR_FG     = "FFFFFFFF";
        const C_ROW_ODD    = "FFFFFFFF"; // 홀수 데이터행
        const C_ROW_EVEN   = "FFDAE3F3"; // 짝수 데이터행 (연파랑)
        const C_TOT_BG     = "FF17375E"; // 합계
        const C_TOT_FG     = "FFFFFFFF";
        const C_SUM_HDR    = "FF375623"; // 항목합계 헤더 녹색
        const C_SUM_ROW    = "FFE2EFDA"; // 항목합계 행 연녹
        const C_SUM_TOT    = "FF375623"; // 항목합계 계

        const MED_BORDER: Partial<ExcelJS.Borders> = {
          top:    { style: "thin",   color: { argb: "FF000000" } },
          left:   { style: "thin",   color: { argb: "FF000000" } },
          bottom: { style: "thin",   color: { argb: "FF000000" } },
          right:  { style: "thin",   color: { argb: "FF000000" } },
        };

        function t7Fill(argb: string): ExcelJS.FillPattern {
          return { type: "pattern", pattern: "solid", fgColor: { argb } };
        }
        function t7Style(cell: ExcelJS.Cell, bg: string, fg: string, bold: boolean, sz: number, halign: ExcelJS.Alignment["horizontal"] = "center") {
          cell.fill   = t7Fill(bg);
          cell.font   = { bold, size: sz, color: { argb: fg } };
          cell.alignment = { horizontal: halign, vertical: "middle", wrapText: false };
          cell.border = MED_BORDER;
        }
        function t7MergeRow(row: number, c1: number, c2: number) {
          if (c1 < c2) ws7.mergeCells(`${colLetter(c1)}${row}:${colLetter(c2)}${row}`);
        }

        let r7 = 1;

        // ── 행 1: 제목 ─────────────────────────────────────────────
        {
          ws7.getRow(r7).height = 34;
          const c = ws7.getRow(r7).getCell(1);
          c.value = "안전관리비 사용내역서";
          t7Style(c, C_TITLE_BG, C_TITLE_FG, true, 15);
          t7MergeRow(r7, 1, T7_NCOLS);
          r7++;
        }

        // ── 행 2-6: 공사 정보 ─────────────────────────────────────
        const settlementPeriod = (() => {
          if (syRaw > 2000 && smRaw >= 1 && eyRaw > 2000 && emRaw >= 1) {
            return `${syRaw}년 ${smRaw}월 ~ ${eyRaw}년 ${emRaw}월`;
          }
          const y = (!isNaN(yearRaw) && yearRaw > 2000) ? yearRaw : new Date().getFullYear();
          return `${y}년 1월 ~ ${y}년 12월`;
        })();
        const t7InfoRows: { label: string; value: string }[] = [
          { label: "공   사   명", value: projName || "" },
          { label: "계 약 상 대 자", value: projContractor || "" },
          { label: "정  산  기  간", value: settlementPeriod },
          { label: "총 공 사 금 액", value: projTotalAmt ? `${Number(projTotalAmt).toLocaleString("ko-KR")}원` : "" },
          { label: "감  리  확  인  자", value: projSupervisor || "" },
        ];
        for (const { label, value } of t7InfoRows) {
          ws7.getRow(r7).height = 20;
          const lc = ws7.getRow(r7).getCell(1);
          lc.value = label;
          t7Style(lc, C_INFO_LBL, "FF000000", true, 9, "center");
          t7MergeRow(r7, 1, 3);
          const vc = ws7.getRow(r7).getCell(4);
          vc.value = value;
          t7Style(vc, C_INFO_VAL, "FF000000", false, 9, "left");
          t7MergeRow(r7, 4, T7_NCOLS);
          r7++;
        }

        // ── 협력사기재 / 계약팀기재 구분 행 ─────────────────────────
        {
          ws7.getRow(r7).height = 18;
          const lc = ws7.getRow(r7).getCell(1);
          lc.value = "협  력  사  기  재";
          t7Style(lc, C_SEC_BLU, C_TITLE_FG, true, 9);
          t7MergeRow(r7, 1, 10);
          const rc = ws7.getRow(r7).getCell(11);
          rc.value = "계  약  팀  기  재";
          t7Style(rc, C_SEC_GRN, C_TITLE_FG, true, 9);
          t7MergeRow(r7, 11, T7_NCOLS);
          r7++;
        }

        // ── 컬럼 헤더 ─────────────────────────────────────────────
        {
          ws7.getRow(r7).height = 22;
          const headers = ["분류항목","월","일","사용내역(품명)","수량","단가","금액","증빙유형","구매처 상호","구매처사업종목","정당여부","부당사유","비고"];
          headers.forEach((h, i) => {
            const c = ws7.getRow(r7).getCell(i + 1);
            c.value = h;
            t7Style(c, C_HDR_BG, C_HDR_FG, true, 9);
          });
          r7++;
        }

        // ── 데이터 행 시작 (SUMIF 범위용) ────────────────────────────
        const DATA_START_ROW = r7;

        // 증빙유형 도출 헬퍼
        function getDocType2(rec: any): string {
          const hasT = !!rec.taxInvoiceFileUrl;
          const hasTr = !!rec.transactionFileUrl;
          const hasQ = !!rec.quoteFileUrl;
          if (hasT) return "전자세금계산서";
          if (hasTr && hasQ) return "견적서+거래명세서";
          if (hasTr) return "거래명세서";
          if (hasQ) return "견적서";
          return "";
        }

        // records를 category → 날짜순 정렬
        const sortedRecs = [...records].sort((a, b) => {
          const ci = ALL_CATS.indexOf(a.category) - ALL_CATS.indexOf(b.category);
          if (ci !== 0) return ci;
          const da = `${a.year}${String(a.month).padStart(2,'0')}${(a.purchaseDate||'').replace(/-/g,'')}`;
          const db = `${b.year}${String(b.month).padStart(2,'0')}${(b.purchaseDate||'').replace(/-/g,'')}`;
          return da.localeCompare(db);
        });

        // ── 데이터 행 출력 ────────────────────────────────────────
        let dataRowIdx = 0; // 교번 색상용
        for (const rec of sortedRecs) {
          const day = rec.purchaseDate ? (rec.purchaseDate.split('-')[2] || '') : '';
          const qty = rec.quantity ? Number(rec.quantity) : null;
          const unit = rec.unitPrice ? Number(rec.unitPrice) : null;
          const amt = rec.totalAmount ? Number(rec.totalAmount) : 0;
          const rowBg = dataRowIdx % 2 === 0 ? C_ROW_ODD : C_ROW_EVEN;
          dataRowIdx++;

          ws7.getRow(r7).height = 18;

          // A: 분류항목 (드롭다운 적용)
          {
            const c = ws7.getRow(r7).getCell(1);
            c.value = rec.category;
            t7Style(c, rowBg, "FF000000", false, 9, "left");
            c.dataValidation = {
              type: "list", allowBlank: true,
              formulae: ["분류항목목록!$A$1:$A$9"],
              showErrorMessage: false,
            };
          }
          // B: 월
          { const c = ws7.getRow(r7).getCell(2); c.value = rec.month || null; t7Style(c, rowBg, "FF000000", false, 9, "center"); }
          // C: 일
          { const c = ws7.getRow(r7).getCell(3); c.value = day || null; t7Style(c, rowBg, "FF000000", false, 9, "center"); }
          // D: 사용내역
          { const c = ws7.getRow(r7).getCell(4); c.value = rec.itemName || ""; t7Style(c, rowBg, "FF000000", false, 9, "left"); }
          // E: 수량
          { const c = ws7.getRow(r7).getCell(5); c.value = qty; t7Style(c, rowBg, "FF000000", false, 9, "center"); }
          // F: 단가
          { const c = ws7.getRow(r7).getCell(6); c.value = unit; c.numFmt = '#,##0'; t7Style(c, rowBg, "FF000000", false, 9, "right"); }
          // G: 금액 = 수량×단가 수식 (cached result로 기존 값 보존)
          {
            const c = ws7.getRow(r7).getCell(7);
            c.value = { formula: `IFERROR(E${r7}*F${r7},0)`, result: amt };
            c.numFmt = '#,##0';
            t7Style(c, rowBg, "FF000000", false, 9, "right");
          }
          // H: 증빙유형
          { const c = ws7.getRow(r7).getCell(8); c.value = getDocType2(rec); t7Style(c, rowBg, "FF000000", false, 9, "center"); }
          // I: 구매처 상호
          { const c = ws7.getRow(r7).getCell(9); c.value = rec.vendorName || ""; t7Style(c, rowBg, "FF000000", false, 9, "left"); }
          // J: 구매처 사업종목
          { const c = ws7.getRow(r7).getCell(10); c.value = (rec as any).vendorBusinessType || ""; t7Style(c, rowBg, "FF000000", false, 9, "center"); }
          // K: 정당여부
          { const c = ws7.getRow(r7).getCell(11); c.value = "정당"; t7Style(c, rowBg, "FF000000", false, 9, "center"); }
          // L: 부당사유
          { const c = ws7.getRow(r7).getCell(12); c.value = ""; t7Style(c, rowBg, "FF000000", false, 9, "center"); }
          // M: 비고
          { const c = ws7.getRow(r7).getCell(13); c.value = rec.notes || ""; t7Style(c, rowBg, "FF000000", false, 9, "left"); }

          r7++;
        }

        // ── 빈 행 10개 (수동 추가 입력용 — 드롭다운 + 금액수식 포함) ──
        for (let bi = 0; bi < 10; bi++) {
          ws7.getRow(r7).height = 18;
          for (let col = 1; col <= T7_NCOLS; col++) {
            const c = ws7.getRow(r7).getCell(col);
            t7Style(c, C_ROW_ODD, "FF000000", false, 9, col <= 1 || col === 4 || col >= 8 ? "left" : "center");
          }
          // 분류항목 드롭다운
          ws7.getRow(r7).getCell(1).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ["분류항목목록!$A$1:$A$9"],
            showErrorMessage: false,
          };
          // 금액 = 수량×단가 수식
          const gc = ws7.getRow(r7).getCell(7);
          gc.value = { formula: `IFERROR(E${r7}*F${r7},0)`, result: 0 };
          gc.numFmt = '#,##0';
          t7Style(gc, C_ROW_ODD, "FF000000", false, 9, "right");
          // 단가 포맷
          const fc = ws7.getRow(r7).getCell(6);
          fc.numFmt = '#,##0';
          r7++;
        }

        const DATA_LAST_ROW = r7 - 1;

        // ── 합계 행 ───────────────────────────────────────────────
        {
          const grandTotal = records.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
          ws7.getRow(r7).height = 24;
          const lc = ws7.getRow(r7).getCell(1);
          lc.value = "합   계";
          t7Style(lc, C_TOT_BG, C_TOT_FG, true, 11);
          t7MergeRow(r7, 1, 6);
          const gc = ws7.getRow(r7).getCell(7);
          gc.value = { formula: `SUMPRODUCT((LEN(A${DATA_START_ROW}:A${DATA_LAST_ROW})>0)*G${DATA_START_ROW}:G${DATA_LAST_ROW})`, result: grandTotal };
          gc.numFmt = '#,##0';
          t7Style(gc, C_TOT_BG, C_TOT_FG, true, 11, "right");
          for (let c = 8; c <= T7_NCOLS; c++) {
            t7Style(ws7.getRow(r7).getCell(c), C_TOT_BG, C_TOT_FG, false, 9);
          }
          t7MergeRow(r7, 8, T7_NCOLS);
          r7++;
        }

        // ── 빈 구분줄 ─────────────────────────────────────────────
        ws7.getRow(r7).height = 8;
        r7++;

        // ── 항목합계 섹션 ─────────────────────────────────────────
        // 헤더
        {
          ws7.getRow(r7).height = 22;
          const lc = ws7.getRow(r7).getCell(1);
          lc.value = "항  목  합  계";
          t7Style(lc, C_SUM_HDR, C_TITLE_FG, true, 11);
          t7MergeRow(r7, 1, 6);
          const gc = ws7.getRow(r7).getCell(7);
          gc.value = "금  액";
          t7Style(gc, C_SUM_HDR, C_TITLE_FG, true, 10);
          for (let c = 8; c <= T7_NCOLS; c++) {
            t7Style(ws7.getRow(r7).getCell(c), C_SUM_HDR, C_TITLE_FG, false, 9);
          }
          t7MergeRow(r7, 8, T7_NCOLS);
          r7++;
        }

        // 카테고리별 합계 — SUMIF로 분류항목 열 기준 합산 (수동 추가행도 반영)
        const grandSumCells7: string[] = [];
        for (const cat of ALL_CATS) {
          const catTotal = records
            .filter(r => r.category === cat)
            .reduce((s, r) => s + Number(r.totalAmount || 0), 0);

          ws7.getRow(r7).height = 20;
          const lc = ws7.getRow(r7).getCell(1);
          lc.value = cat;
          t7Style(lc, C_SUM_ROW, "FF000000", false, 9, "left");
          t7MergeRow(r7, 1, 6);

          const gc = ws7.getRow(r7).getCell(7);
          // SUMIF: 분류항목 열에서 해당 카테고리와 일치하는 행의 금액 합산
          gc.value = {
            formula: `SUMIF(A${DATA_START_ROW}:A${DATA_LAST_ROW},"${cat}",G${DATA_START_ROW}:G${DATA_LAST_ROW})`,
            result: catTotal,
          };
          gc.numFmt = '#,##0';
          t7Style(gc, C_SUM_ROW, "FF000000", false, 9, "right");
          grandSumCells7.push(`G${r7}`);

          for (let c = 8; c <= T7_NCOLS; c++) {
            t7Style(ws7.getRow(r7).getCell(c), C_SUM_ROW, "FF000000", false, 9);
          }
          t7MergeRow(r7, 8, T7_NCOLS);
          r7++;
        }

        // 계 (총합계) 행
        {
          const grandTotal2 = records.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
          ws7.getRow(r7).height = 24;
          const lc = ws7.getRow(r7).getCell(1);
          lc.value = "계";
          t7Style(lc, C_SUM_TOT, C_TITLE_FG, true, 11);
          t7MergeRow(r7, 1, 6);
          const gc = ws7.getRow(r7).getCell(7);
          gc.value = { formula: grandSumCells7.join("+"), result: grandTotal2 };
          gc.numFmt = '#,##0';
          t7Style(gc, C_SUM_TOT, C_TITLE_FG, true, 11, "right");
          for (let c = 8; c <= T7_NCOLS; c++) {
            t7Style(ws7.getRow(r7).getCell(c), C_SUM_TOT, C_TITLE_FG, false, 9);
          }
          t7MergeRow(r7, 8, T7_NCOLS);
        }

        return wb;
      }


      // ─── workbook 생성 → 스트리밍 전송 (버퍼 메모리 절약) ──────────────
      const fileLabel = rangeLabel.replace(/ /g, "_");

      let wbFinal: ExcelJS.Workbook;
      try {
        wbFinal = buildWorkbook(true);
        console.log(`[export] 이미지포함 workbook 빌드 완료`);
      } catch (imgErr: any) {
        console.warn(`[export] 이미지 빌드 실패(${imgErr.message}), 텍스트 전용으로 재시도`);
        wbFinal = buildWorkbook(false);
        console.log(`[export] 텍스트 전용 workbook 빌드 완료`);
      }

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`산업안전보건관리비_법정경비_${fileLabel}.xlsx`)}`);
      console.log(`[export] 스트리밍 전송 시작`);
      await wbFinal.xlsx.write(res);
      res.end();
      console.log(`[export] 스트리밍 전송 완료`);
    } catch (e: any) {
      console.error("[export] 법정경비 export 오류:", e.message, e.stack?.split('\n').slice(0,3).join(' | '));
      res.status(500).json({ message: "내보내기 실패: " + e.message });
    }
  });

  // ─── 세금계산서 (월별) CRUD ────────────────────────────────────────────
  app.get('/api/safety-cost-tax-invoices', isAuthenticated, async (req: any, res) => {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const headquarters = (req.query.headquarters as string) || undefined;
      const startYM = req.query.startYM ? Number(req.query.startYM) : undefined;
      const endYM = req.query.endYM ? Number(req.query.endYM) : undefined;
      const rows = await storage.getSafetyCostTaxInvoices({ year, headquarters, startYM, endYM });
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post('/api/safety-cost-tax-invoices', requireEditor, async (req: any, res) => {
    try {
      const data = { ...req.body, createdBy: req.user?.username };
      const row = await storage.createSafetyCostTaxInvoice(data);
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put('/api/safety-cost-tax-invoices/:id', requireEditor, async (req: any, res) => {
    try {
      const row = await storage.updateSafetyCostTaxInvoice(Number(req.params.id), req.body);
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete('/api/safety-cost-tax-invoices/:id', requireEditor, async (req: any, res) => {
    try {
      await storage.deleteSafetyCostTaxInvoice(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── 사용내역 양식 다운로드 (템플릿 기반) ─────────────────────────────
  // ─── 산업안전보건관리비 예산 GET/PUT ──────────────────────────────────
  app.get('/api/safety-cost-budget', isAuthenticated, async (req: any, res) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const h1S = await storage.getSetting(`safety_cost_budgets_h1_${year}`);
      const h2S = await storage.getSetting(`safety_cost_budgets_h2_${year}`);
      if (h1S || h2S) {
        const h1: Record<string, number> = h1S ? JSON.parse(h1S.value) : {};
        const h2: Record<string, number> = h2S ? JSON.parse(h2S.value) : {};
        const total: Record<string, number> = {};
        [...new Set([...Object.keys(h1), ...Object.keys(h2)])].forEach(k => {
          total[k] = (Number(h1[k]) || 0) + (Number(h2[k]) || 0);
        });
        res.json(total);
      } else {
        const setting = await storage.getSetting(`safety_cost_budgets_${year}`);
        res.json(setting ? JSON.parse(setting.value) : {});
      }
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 상반기/하반기 상세 조회
  app.get('/api/safety-cost-budget-detail', isAuthenticated, async (req: any, res) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const h1S = await storage.getSetting(`safety_cost_budgets_h1_${year}`);
      const h2S = await storage.getSetting(`safety_cost_budgets_h2_${year}`);
      if (h1S || h2S) {
        res.json({
          h1: h1S ? JSON.parse(h1S.value) : {},
          h2: h2S ? JSON.parse(h2S.value) : {},
        });
      } else {
        const legacyS = await storage.getSetting(`safety_cost_budgets_${year}`);
        res.json({ h1: legacyS ? JSON.parse(legacyS.value) : {}, h2: {} });
      }
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put('/api/safety-cost-budget', requireEditor, async (req: any, res) => {
    try {
      const { year, h1, h2, budgets } = req.body;
      if (!year) return res.status(400).json({ message: '연도가 필요합니다' });
      if (h1 !== undefined || h2 !== undefined) {
        await storage.setSetting(`safety_cost_budgets_h1_${year}`, JSON.stringify(h1 || {}));
        await storage.setSetting(`safety_cost_budgets_h2_${year}`, JSON.stringify(h2 || {}));
      } else if (budgets) {
        await storage.setSetting(`safety_cost_budgets_${year}`, JSON.stringify(budgets));
      } else {
        return res.status(400).json({ message: '예산 데이터가 필요합니다' });
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get('/api/safety-cost-records/export-template', isAuthenticated, async (req: any, res) => {
    try {
      const yearRaw = Number(req.query.year);
      const year = (!isNaN(yearRaw) && yearRaw > 2000) ? yearRaw : new Date().getFullYear();
      const records = await storage.getSafetyCostRecords({ year });

      const templatePath = [
        path.join(process.cwd(), 'server/assets/safety_cost_template.xlsx'),
        path.join(process.cwd(), 'dist/server/assets/safety_cost_template.xlsx'),
        path.resolve('server/assets/safety_cost_template.xlsx'),
        path.resolve('dist/server/assets/safety_cost_template.xlsx'),
      ].find(p => fs.existsSync(p));
      if (!templatePath) throw new Error("양식 파일(safety_cost_template.xlsx)을 찾을 수 없습니다");
      console.log(`[export-template] templatePath=${templatePath}`);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(templatePath);
      (wb as any).calcProperties = { fullCalcOnLoad: true };

      // ── DB 카테고리 → 템플릿 항목명 매핑 ───────────────────────────
      const CAT_MAP: Record<string, string> = {
        '1': '안전관리자 등 인건비',
        '2': '안전시설비',
        '3': '보호구·안전용품',
        '4': '안전진단비',
        '5': '안전보건교육비·행사비 등',
        '6': '근로자 건강관리비 등',
        '7': '건설재해예방 기술지도비',
        '8': '기타',
        '9': '산보위·위험성평가 안건',
      };

      // ── "사용내역" 시트에 데이터 입력 ───────────────────────────────
      // 시트 1~3은 이 시트를 SUMIFS로 참조하여 자동 갱신됨
      const ws = wb.getWorksheet('사용내역');
      if (!ws) throw new Error("'사용내역' 시트를 찾을 수 없습니다");

      // 3행(첫 번째 데이터 행) 서식 저장 — 이후 모든 데이터 행에 복사
      const tmplRow = ws.getRow(3);
      const tmplStyles: Record<number, any> = {};
      const tmplRowHeight = tmplRow.height;
      for (let c = 2; c <= 13; c++) {
        const s = tmplRow.getCell(c).style;
        tmplStyles[c] = s ? JSON.parse(JSON.stringify(s)) : {};
      }

      // 기존 데이터 행(3행~) 초기화
      for (let r = 3; r <= Math.max(ws.rowCount, 50); r++) {
        const row = ws.getRow(r);
        for (let c = 2; c <= 13; c++) { row.getCell(c).value = null; }
      }

      // 열 너비는 데이터 입력 후 자동 계산 (아래 autoFitCols 함수 호출)

      // 정렬: 항목 순 → 지급일자 순
      const sorted = [...records].sort((a, b) => {
        const catA = parseInt((a.category || '1').split('.')[0]) || 99;
        const catB = parseInt((b.category || '1').split('.')[0]) || 99;
        if (catA !== catB) return catA - catB;
        const dA = (a as any).paymentRequestDate || a.purchaseDate || '';
        const dB = (b as any).paymentRequestDate || b.purchaseDate || '';
        return dA.localeCompare(dB);
      });

      sorted.forEach((rec, idx) => {
        const rowNum = 3 + idx;
        const catNum = (rec.category || '').split('.')[0].trim();
        const catName = CAT_MAP[catNum] || (rec.category || '');
        const payDateStr = (rec as any).paymentRequestDate || rec.purchaseDate || '';
        const qty = rec.quantity ? Number(rec.quantity) : 0;
        const unit = rec.unit || '';
        // 세부항목/품목명: subCategory 우선, 없으면 itemName + 수량
        const itemDesc = rec.subCategory
          ? rec.subCategory
          : (rec.itemName || '') + (qty > 0 ? ` ${qty}${unit}` : '');
        const amount = Number(rec.totalAmount) || 0;

        const row = ws.getRow(rowNum);
        // 행 높이 및 셀 서식 적용 (3행 템플릿 서식 복사)
        if (tmplRowHeight) row.height = tmplRowHeight;
        for (let c = 2; c <= 13; c++) {
          if (tmplStyles[c] && Object.keys(tmplStyles[c]).length > 0) {
            row.getCell(c).style = JSON.parse(JSON.stringify(tmplStyles[c]));
          }
        }

        row.getCell(2).value = { formula: `ROW()-2`, result: idx + 1 };   // B: 순번
        row.getCell(3).value = '대구';                                      // C: 본부

        if (payDateStr) {
          const d = new Date(payDateStr.replace(/\./g, '-'));
          if (!isNaN(d.getTime())) {
            row.getCell(4).value = d;                                       // D: 지급일자
            row.getCell(4).numFmt = 'yyyy-mm-dd';
            row.getCell(5).value = { formula: `MONTH(D${rowNum})`, result: d.getMonth() + 1 }; // E: 월
          } else {
            row.getCell(4).value = payDateStr;
          }
        }

        row.getCell(6).value = catName;                                     // F: 항목명
        row.getCell(7).value = itemDesc || null;                            // G: 세부항목/품목명
        if (amount > 0) {
          row.getCell(8).value = amount;                                    // H: 금액(원)
          row.getCell(8).numFmt = '#,##0';
        }
        // I(적정여부), J(위험성평가 반영여부), K(의결내용): 빈칸
        row.getCell(12).value = rec.notes || null;                          // L: 비고
        row.getCell(13).value = (rec as any).documentNumber || null;        // M: 관련 문서번호(증빙)
      });

      // ── 사용내역 시트 열 너비 자동 조정 ─────────────────────────────────
      {
        // 한글은 2자 폭, 영문/숫자는 1자 폭으로 계산
        const strWidth = (v: any): number => {
          const s = v === null || v === undefined ? '' :
            (typeof v === 'object' && 'result' in v) ? String(v.result) :
            (typeof v === 'object' && v instanceof Date) ? 'YYYY-MM-DD' :
            String(v);
          let w = 0;
          for (const ch of s) { w += /[\u1100-\u11FF\u2E80-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60]/.test(ch) ? 2 : 1; }
          return w;
        };
        // 열별 최소 너비 (헤더 기준)
        const MIN_WIDTHS: Record<number, number> = {
          2: 6, 3: 7, 4: 18, 5: 5, 6: 22, 7: 28, 8: 14, 9: 10, 10: 14, 11: 16, 12: 16, 13: 18,
        };
        const MAX_WIDTH = 50;
        const colMaxW: Record<number, number> = {};
        // 헤더(2행) + 데이터(3행~) 모두 스캔
        ws.eachRow((row, rn) => {
          if (rn < 2) return;
          for (let c = 2; c <= 13; c++) {
            const w = strWidth(row.getCell(c).value) + 2;
            if (!colMaxW[c] || w > colMaxW[c]) colMaxW[c] = w;
          }
        });
        for (let c = 2; c <= 13; c++) {
          ws.getColumn(c).width = Math.min(Math.max(colMaxW[c] || 8, MIN_WIDTHS[c] || 8), MAX_WIDTH);
        }
      }

      // ── 예산 데이터를 나머지 시트(1~3번)에 주입 ─────────────────────────
      try {
        // 상반기+하반기 합산 (없으면 legacy 키로 fallback)
        const h1S = await storage.getSetting(`safety_cost_budgets_h1_${year}`);
        const h2S = await storage.getSetting(`safety_cost_budgets_h2_${year}`);
        let budgets: Record<string, number> = {};
        if (h1S || h2S) {
          const h1: Record<string, number> = h1S ? JSON.parse(h1S.value) : {};
          const h2: Record<string, number> = h2S ? JSON.parse(h2S.value) : {};
          [...new Set([...Object.keys(h1), ...Object.keys(h2)])].forEach(k => {
            budgets[k] = (Number(h1[k]) || 0) + (Number(h2[k]) || 0);
          });
          console.log(`[export-template] 예산 h1+h2 합산:`, JSON.stringify(budgets));
        } else {
          const legacyS = await storage.getSetting(`safety_cost_budgets_${year}`);
          budgets = legacyS ? JSON.parse(legacyS.value) : {};
          console.log(`[export-template] 예산 legacy:`, JSON.stringify(budgets));
        }
        // ── 수식/sharedFormula 구조 유지하며 cachedValue(result)만 업데이트 ──────
        // 셀에 숫자를 직접 주입하면 shared formula master가 손상되어 writeBuffer 오류 발생
        const setCached = (cell: any, val: number | string, fmt?: string) => {
          const v = cell.value;
          if (v && typeof v === 'object') {
            if ('formula' in v)            cell.value = { formula: v.formula, result: val };
            else if ('sharedFormula' in v) cell.value = { sharedFormula: v.sharedFormula, result: val };
          }
          if (fmt) cell.numFmt = fmt;
          else if (val && typeof val === 'number') cell.numFmt = '#,##0';
        };

        // 2.예산입력 시트 대구본부 행에 주입
        // 대구본부: 행44~52, D열=상반기(직접숫자), E열=하반기(직접숫자), C열=SUM(D:E)(setCached)
        // C45가 master, C46~C52는 SF:C45 → C열은 setCached로 처리해야 오류 없음
        const budgetSheet = wb.getWorksheet('2.예산입력');
        if (budgetSheet) {
          const DAEGU_ROWS: Record<string, number> = {
            '1': 44, '2': 45, '3': 46, '4': 47, '5': 48,
            '6': 49, '7': 50, '8': 51, '9': 52,
          };
          // h1S/h2S가 없는 legacy 케이스: budgets 전체를 상반기로 사용
          const h1: Record<string, number> = h1S ? JSON.parse(h1S.value) : (!h2S ? budgets : {});
          const h2: Record<string, number> = h2S ? JSON.parse(h2S.value) : {};
          let h1Total = 0, h2Total = 0;
          for (const [catNum, rowNum] of Object.entries(DAEGU_ROWS)) {
            const row = budgetSheet.getRow(rowNum);
            const h1val = Number(h1[catNum]) || 0;
            const h2val = Number(h2[catNum]) || 0;
            row.getCell(4).value = h1val;  // D: 상반기 예산 (직접 숫자, shared formula 아님)
            row.getCell(4).numFmt = '#,##0';
            row.getCell(5).value = h2val;  // E: 하반기 예산 (직접 숫자)
            row.getCell(5).numFmt = '#,##0';
            setCached(row.getCell(3), h1val + h2val);  // C: SUM(D:E) → setCached로 master 보호
            h1Total += h1val;
            h2Total += h2val;
          }
          // 소계 R53: C53=SUM(C44:C52), D53=SUM(D44:D52), E53=SUM(E44:E52)
          const bSub = budgetSheet.getRow(53);
          setCached(bSub.getCell(3), h1Total + h2Total);
          setCached(bSub.getCell(4), h1Total);
          setCached(bSub.getCell(5), h2Total);
          console.log(`[export-template] 대구본부 예산 주입 완료`);

          // ── 항목별 월별 지출 집계 ───────────────────────────────────────────
          const CAT_NUMS = ['1','2','3','4','5','6','7','8','9'];
          const monthlyByCat: Record<string, Record<number, number>> = {};
          for (const cn of CAT_NUMS) {
            monthlyByCat[cn] = {};
            for (let m = 1; m <= 12; m++) monthlyByCat[cn][m] = 0;
          }
          for (const rec of records) {
            const cn = (rec.category || '').split('.')[0].trim();
            if (!monthlyByCat[cn]) continue;
            const ds = (rec as any).paymentRequestDate || rec.purchaseDate || '';
            if (!ds) continue;
            const d = new Date(ds.replace(/\./g, '-'));
            if (isNaN(d.getTime())) continue;
            monthlyByCat[cn][d.getMonth() + 1] += Number(rec.totalAmount) || 0;
          }

          // ── 1.지출통계 시트 대구본부 행(R44~R52) cachedValue 업데이트 ──────
          const statSheet = wb.getWorksheet('1.지출통계');
          if (statSheet) {
            const DAEGU_STAT: Record<string, number> = {
              '1': 44, '2': 45, '3': 46, '4': 47, '5': 48,
              '6': 49, '7': 50, '8': 51, '9': 52,
            };
            for (const [cn, rn] of Object.entries(DAEGU_STAT)) {
              const row = statSheet.getRow(rn);
              let catTotal = 0;
              for (let m = 1; m <= 12; m++) {
                const val = monthlyByCat[cn]?.[m] || 0;
                setCached(row.getCell(m + 2), val);  // C(3)~N(14): 1~12월
                catTotal += val;
              }
              setCached(row.getCell(15), catTotal);   // O(15): SUM(C:N) 합계
            }
            // 소계 R53: C53=SUM(C44:C52), D53~O53=SF:C53
            const stRow = statSheet.getRow(53);
            let grandStat = 0;
            for (let m = 1; m <= 12; m++) {
              const colTotal = CAT_NUMS.reduce((s, cn) => s + (monthlyByCat[cn]?.[m] || 0), 0);
              setCached(stRow.getCell(m + 2), colTotal);
              grandStat += colTotal;
            }
            setCached(stRow.getCell(15), grandStat);
            console.log('[export-template] 1.지출통계 대구본부 주입 완료');
          }

          // ── 3.예산대비_지출통계 대구본부 행(R45~R53) cachedValue 업데이트 ──
          // C(col3)=연간예산, D(col4)=누계지출, E(col5)=잔액(SF:E37=C-D), F(col6)=집행률(SF:F37)
          const cmpSheet = wb.getWorksheet('3.예산대비_지출통계');
          if (cmpSheet) {
            const DAEGU_CMP: Record<string, number> = {
              '1': 45, '2': 46, '3': 47, '4': 48, '5': 49,
              '6': 50, '7': 51, '8': 52, '9': 53,
            };
            let totalBudgetCmp = 0, totalSpentCmp = 0;
            for (const [cn, rn] of Object.entries(DAEGU_CMP)) {
              const row = cmpSheet.getRow(rn);
              const annual = (Number(h1[cn]) || 0) + (Number(h2[cn]) || 0);
              const spent = Object.values(monthlyByCat[cn] || {}).reduce((s, v) => s + v, 0);
              setCached(row.getCell(3), annual);           // C: 연간예산
              setCached(row.getCell(4), spent);            // D: 누계지출
              setCached(row.getCell(5), annual - spent);   // E: 잔액 (C-D)
              const rateStr = annual > 0 ? (spent / annual * 100).toFixed(1) + '%' : '-';
              setCached(row.getCell(6), rateStr);          // F: 집행률 TEXT(D/C,"0.0%")
              totalBudgetCmp += annual;
              totalSpentCmp  += spent;
            }
            // 소계 R54: C54=2.예산입력!C53, D54=1.지출통계!O53, E54=SF:E37, F54=SF:F37
            const cmpSub = cmpSheet.getRow(54);
            setCached(cmpSub.getCell(3), totalBudgetCmp);
            setCached(cmpSub.getCell(4), totalSpentCmp);
            setCached(cmpSub.getCell(5), totalBudgetCmp - totalSpentCmp);
            const totalRateStr = totalBudgetCmp > 0 ? (totalSpentCmp / totalBudgetCmp * 100).toFixed(1) + '%' : '-';
            setCached(cmpSub.getCell(6), totalRateStr);
            console.log('[export-template] 3.예산대비_지출통계 대구본부 주입 완료');
          }
        }
      } catch (budgetErr: any) {
        console.warn('[export-template] 예산 주입 실패(무시):', budgetErr.message);
      }

      // ─── 응답 ───────────────────────────────────────────────────────
      // ── 전체 시트 열 너비 자동 조정 (사용내역 제외 — 위에서 이미 처리) ──
      {
        const strW = (v: any): number => {
          const s = v === null || v === undefined ? '' :
            (typeof v === 'object' && 'result' in v) ? String((v as any).result ?? '') :
            (v instanceof Date) ? 'YYYY-MM-DD' : String(v);
          let w = 0;
          for (const ch of s) {
            w += /[\u1100-\u11FF\u2E80-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60]/.test(ch) ? 2 : 1;
          }
          return w;
        };
        wb.worksheets.forEach(sheet => {
          if (sheet.name === '사용내역') return; // 위에서 이미 처리
          const maxW: Record<number, number> = {};
          sheet.eachRow((row, rn) => {
            if (rn < 3) return; // 제목/설명 행 스킵
            row.eachCell({ includeEmpty: false }, (cell, ci) => {
              const w = strW(cell.value) + 2;
              if (!maxW[ci] || w > maxW[ci]) maxW[ci] = w;
            });
          });
          // 헤더행(3행)도 반영
          const hdrRow = sheet.getRow(3);
          hdrRow.eachCell({ includeEmpty: false }, (cell, ci) => {
            const w = strW(cell.value) + 2;
            if (!maxW[ci] || w > maxW[ci]) maxW[ci] = w;
          });
          Object.entries(maxW).forEach(([ci, w]) => {
            sheet.getColumn(Number(ci)).width = Math.min(Math.max(w, 8), 45);
          });
        });
      }

      console.log(`[export-template] writeBuffer 시작 (records=${records.length})`);
      const buffer = await wb.xlsx.writeBuffer();
      console.log(`[export-template] writeBuffer 완료, size=${Buffer.isBuffer(buffer) ? buffer.length : (buffer as any).byteLength}`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${year}년_산업안전보건관리비_사용내역.xlsx`)}`);
      res.send(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer));
    } catch (e: any) {
      console.error("[export-template] 사용내역 export 오류:", e.message, e.stack?.split('\n').slice(0,3).join(' | '));
      res.status(500).json({ message: "내보내기 실패: " + e.message });
    }
  });

  // AI 자동 추출 — 견적서/거래명세서 이미지 업로드 → GPT-4o Vision
  const safetyCostUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
  app.post('/api/safety-cost-records/extract', requireEditor, safetyCostUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const mimeType = req.file.mimetype || 'image/jpeg';
      const docType = req.query.docType || 'quote';
      const isPdf = mimeType === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');

      const systemPrompt = `당신은 한국 기업의 구매 서류(견적서, 거래명세서)를 분석하는 전문가입니다.
문서에서 다음 정보를 추출하여 JSON 형식으로만 반환하세요 (코드블록 없이).
여러 품목이 있는 경우 items 배열에 모두 포함하세요.

【중요】 거래명세서에서 배송지(납품처)가 달라 동일 품목이 여러 행으로 분리된 경우,
같은 품명·규격·단가의 항목은 수량을 합산하여 하나의 항목으로 통합하세요.
예) "안전모 / 1개 / 5,000원" 2행 → "안전모 / 2개 / 5,000원" 1행

{
  "vendorName": "공급업체명",
  "vendorBusinessType": "공급업체의 업종/사업종목(예: 도매업, 소매업, 제조업, 서비스업, 기타 등. 문서에서 업태·종목 란을 참조)",
  "documentDate": "YYYY-MM-DD 형식의 날짜",
  "totalAmount": 합계금액(VAT포함, 숫자),
  "items": [
    {
      "itemName": "품명",
      "specification": "규격",
      "unit": "단위(EA/개/식 등)",
      "quantity": 수량(숫자),
      "unitPrice": 단가(숫자),
      "supplyAmount": 공급가액(숫자),
      "vatAmount": 세액(숫자),
      "totalAmount": 합계(숫자)
    }
  ]
}
숫자는 쉼표 없이 순수 숫자로 반환하세요. 찾을 수 없는 값은 null로 반환하세요.`;

      let messages: any[];

      if (isPdf) {
        // PDF → 공통 extractPdfText 함수로 텍스트 추출 후 GPT-4o에 텍스트로 전달
        let pdfText = "";
        try {
          pdfText = await extractPdfText(req.file.buffer);
        } catch (pdfErr: any) {
          console.warn("pdf-parse 실패, 텍스트 없이 진행:", pdfErr.message);
        }
        const docLabel = docType === 'quote' ? '견적서' : '거래명세서';
        messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: pdfText.trim()
              ? `다음은 ${docLabel} PDF에서 추출한 텍스트입니다. 내용을 분석하여 JSON으로 추출해주세요.\n\n---\n${pdfText.slice(0, 8000)}\n---`
              : `${docLabel} PDF 파일이 업로드되었으나 텍스트 추출에 실패했습니다. 빈 JSON {}을 반환하세요.`,
          },
        ];
      } else {
        // 이미지 → Vision API 사용
        const base64Data = req.file.buffer.toString('base64');
        const docLabel = docType === 'quote' ? '견적서' : '거래명세서';
        messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `다음은 ${docLabel} 이미지입니다. 내용을 분석하여 JSON으로 추출해주세요.` },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: "high" } },
            ],
          },
        ];
      }

      const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_tokens: 2000,
        temperature: 0.1,
      });

      const raw = response.choices[0].message.content?.trim() || "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = {}; }
        }
      }

      // 동일 품명·규격·단가 항목 수량 합산 (GPT가 분리하는 경우 서버에서 통합)
      if (Array.isArray(parsed.items) && parsed.items.length > 1) {
        const mergedMap = new Map<string, any>();
        for (const item of parsed.items) {
          const key = `${(item.itemName || '').trim()}||${(item.specification || '').trim()}||${item.unitPrice ?? ''}`;
          if (mergedMap.has(key)) {
            const existing = mergedMap.get(key);
            const addQty = Number(item.quantity) || 0;
            existing.quantity = (Number(existing.quantity) || 0) + addQty;
            // 단가 기반 재계산
            if (existing.unitPrice) {
              const supplyAmt = Math.round(existing.quantity * Number(existing.unitPrice));
              const vatAmt = Math.round(supplyAmt * 0.1);
              existing.supplyAmount = supplyAmt;
              existing.vatAmount = vatAmt;
              existing.totalAmount = supplyAmt + vatAmt;
            } else {
              existing.supplyAmount = (Number(existing.supplyAmount) || 0) + (Number(item.supplyAmount) || 0);
              existing.vatAmount = (Number(existing.vatAmount) || 0) + (Number(item.vatAmount) || 0);
              existing.totalAmount = (Number(existing.totalAmount) || 0) + (Number(item.totalAmount) || 0);
            }
          } else {
            mergedMap.set(key, { ...item });
          }
        }
        parsed.items = Array.from(mergedMap.values());
      }

      // 파일을 스토리지에 업로드하고 URL도 함께 반환 (프론트 2차 업로드 불필요)
      try {
        const ext = req.file.originalname.split('.').pop() || (isPdf ? 'pdf' : 'jpg');
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
        if (objUrl) {
          parsed._fileUrl = objUrl;
        } else {
          const localP = path.join(uploadDir, filename);
          fs.writeFileSync(localP, req.file.buffer);
          parsed._fileUrl = `/uploads/${filename}`;
        }
      } catch { /* 파일 저장 실패는 무시 */ }

      res.json(parsed);
    } catch (e: any) {
      console.error("Safety cost extract error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // ─── 세금계산서 AI 자동 추출 ─────────────────────────────────────────
  app.post('/api/safety-cost-tax-invoices/extract', requireEditor, safetyCostUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const mimeType = req.file.mimetype || 'image/jpeg';
      const isPdf = mimeType === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');

      const systemPrompt = `당신은 한국 세금계산서(전자세금계산서 포함)를 분석하는 전문가입니다.
문서에서 다음 정보를 추출하여 JSON 형식으로만 반환하세요 (코드블록 없이).

{
  "vendorName": "공급자(업체)명",
  "supplyAmount": 공급가액(숫자, 쉼표 없이),
  "vatAmount": 세액(숫자, 쉼표 없이),
  "totalAmount": 합계금액(숫자, 쉼표 없이),
  "issueDate": "발행일 YYYY-MM-DD 형식"
}

- 공급자는 세금계산서를 발행한 회사(공급하는 자)입니다.
- 숫자는 쉼표 없이 순수 숫자로 반환하세요.
- 찾을 수 없는 값은 null로 반환하세요.`;

      let messages: any[];

      if (isPdf) {
        let pdfText = "";
        try {
          pdfText = await extractPdfText(req.file.buffer);
        } catch (e: any) {
          console.warn("pdf-parse 실패:", e.message);
        }
        messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: pdfText.trim()
              ? `다음은 세금계산서 PDF에서 추출한 텍스트입니다. 분석하여 JSON으로 반환하세요.\n\n---\n${pdfText.slice(0, 8000)}\n---`
              : `세금계산서 PDF가 업로드되었으나 텍스트 추출에 실패했습니다. 빈 JSON {}을 반환하세요.`,
          },
        ];
      } else {
        const base64Data = req.file.buffer.toString('base64');
        messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "다음 세금계산서 이미지를 분석하여 JSON으로 반환하세요." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: "high" } },
            ],
          },
        ];
      }

      const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_tokens: 500,
        temperature: 0.1,
      });

      const raw = response.choices[0].message.content?.trim() || "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = {}; } }
      }

      // 파일 저장 후 URL 반환
      try {
        const ext = req.file.originalname.split('.').pop() || (isPdf ? 'pdf' : 'jpg');
        const filename = `tax-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
        parsed._fileUrl = objUrl || (() => {
          const localP = path.join(uploadDir, filename);
          fs.writeFileSync(localP, req.file.buffer);
          return `/uploads/${filename}`;
        })();
      } catch { /* 저장 실패 무시 */ }

      res.json(parsed);
    } catch (e: any) {
      console.error("Tax invoice extract error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // ─── 결의서(구매/지출) PDF 파싱 → 품의번호, 지급요청일자 추출 ──────────────
  app.post('/api/safety-cost-records/extract-resolution', requireEditor, safetyCostUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const mimeType = req.file.mimetype || 'image/jpeg';
      const isPdf = mimeType === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');

      const systemPrompt = `당신은 한국 기업의 구매결의서·지출결의서·기안서를 분석하는 전문가입니다.
문서에서 다음 정보를 추출하여 JSON 형식으로만 반환하세요 (코드블록 없이).

{
  "documentType": "문서 유형 — 반드시 지출결의서/구매결의서/기안서 중 하나로만 반환",
  "documentNumber": "품의번호 (예: 구매결의서-대구현장경영팀-26-0022)",
  "paymentRequestDate": "지급요청일자 YYYY-MM-DD (지출결의서에만 있음, 없으면 null)",
  "documentDate": "문서 작성일자 YYYY-MM-DD",
  "vendorName": "공급업체/거래처명",
  "supplyAmount": 공급가액(숫자, 없으면 null),
  "vatAmount": 세액(숫자, 없으면 null),
  "totalAmount": 합계금액(숫자, 없으면 null),
  "items": [
    {
      "itemName": "품명",
      "specification": "규격",
      "unit": "단위",
      "quantity": 수량(숫자),
      "unitPrice": 단가(숫자),
      "supplyAmount": 공급가액(숫자),
      "vatAmount": 세액(숫자),
      "totalAmount": 합계(숫자)
    }
  ]
}

【중요 규칙】
- 숫자는 쉼표 없이 순수 숫자로 반환하세요. 찾을 수 없는 값은 null로 반환하세요.
- unitPrice(단가)는 반드시 부가세(VAT) 제외 공급가 기준입니다. VAT 포함 가격을 단가로 넣지 마세요.
- 금액 관계: supplyAmount = unitPrice × quantity, vatAmount = supplyAmount × 0.1, totalAmount = supplyAmount + vatAmount

【수량(quantity) 추출 주의사항 — 매우 중요】
- 수량은 문서 표에서 "수량" 또는 "QTY" 열의 값만 읽으세요. 절대로 단가·금액·규격 열의 숫자를 수량으로 읽지 마세요.
- 수량 열이 명확히 구분되지 않는 경우: quantity × unitPrice = supplyAmount 관계가 성립하는지 반드시 검증하세요.
- 수량이 의심스러운 경우: supplyAmount ÷ unitPrice 로 역산한 값과 비교하여, 역산값이 더 합리적이면 역산값을 사용하세요.
- 수량 자릿수 오류 주의: 예를 들어 수량 "2"를 "20"이나 "200"으로 읽는 오류가 발생하지 않도록 문서 표를 픽셀 단위로 정확히 읽으세요.
- quantity는 일반적으로 1~999 범위의 정수입니다. 이 범위를 크게 벗어나는 값은 오독일 가능성이 높으니 다시 확인하세요.

- 문서에 단가가 명시되지 않은 경우: unitPrice = supplyAmount ÷ quantity (소수점 반올림)
- 품의번호는 문서 상단에 표기된 문서번호/결의번호입니다.
- 지급요청일자는 지출결의서의 지급요청일 또는 지급일자입니다.
- documentType 판별: 문서 제목·양식명에 "지출결의서"가 있으면 지출결의서, "구매결의서"가 있으면 구매결의서, "기안서"가 있으면 기안서.`;

      let messages: any[];
      if (isPdf) {
        let pdfText = "";
        try { pdfText = await extractPdfText(req.file.buffer); } catch { }
        messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: pdfText.trim()
              ? `다음은 결의서 PDF에서 추출한 텍스트입니다. 분석하여 JSON으로 반환해주세요.\n\n---\n${pdfText.slice(0, 8000)}\n---`
              : `결의서 PDF 파일이 업로드되었으나 텍스트 추출에 실패했습니다. 빈 JSON {}을 반환하세요.`,
          },
        ];
      } else {
        const base64Data = req.file.buffer.toString('base64');
        messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "다음은 결의서 이미지입니다. 분석하여 JSON으로 반환해주세요." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: "high" } },
            ],
          },
        ];
      }

      const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_tokens: 2000,
        temperature: 0.1,
      });

      const raw = response.choices[0].message.content?.trim() || "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = {}; } }
      }

      // ── 수량·단가 보정 ──────────────────────────────────────────────────
      // AI가 수량 자릿수를 잘못 읽거나 VAT 포함 단가를 반환하는 경우를 수정한다.
      // 판단 기준: "더 round한(깔끔한) 숫자" 쪽이 문서 원본에 가깝다고 가정.
      function roundness(n: number): number {
        if (n <= 0 || !isFinite(n)) return 0;
        let score = 0;
        if (Number.isInteger(n)) score += 10;
        if (n % 10 === 0) score += 5;
        if (n % 100 === 0) score += 4;
        if (n % 500 === 0) score += 3;
        if (n % 1000 === 0) score += 3;
        if (n % 5000 === 0) score += 2;
        if (n % 10000 === 0) score += 2;
        return score;
      }

      if (Array.isArray(parsed.items)) {
        for (const item of parsed.items) {
          const qty = Number(item.quantity) || 1;
          const supply = Number(item.supplyAmount) || 0;
          const total = Number(item.totalAmount) || 0;
          const extractedUp = Number(item.unitPrice) || 0;

          if (supply > 0 && qty > 0 && extractedUp > 0) {
            const calcSupply = extractedUp * qty;
            const diffRatio = Math.abs(calcSupply - supply) / supply;

            if (diffRatio > 0.02) {
              // 불일치 → 수량 오독 vs 단가 오독 중 어느 쪽을 고칠지 결정
              const correctedUp = supply / qty;       // 수량이 맞다고 가정 → 단가 역산
              const correctedQty = supply / extractedUp; // 단가가 맞다고 가정 → 수량 역산

              const qtyIsInteger = Number.isInteger(Math.round(correctedQty * 10) / 10);
              const correctedQtyRound = Math.round(correctedQty);
              const qtyCloseToInt = Math.abs(correctedQty - correctedQtyRound) < 0.05;

              if (qtyIsInteger || qtyCloseToInt) {
                // correctedQty가 정수에 가까움 → 단가가 맞고 수량이 잘못 읽힌 것
                const fixedQty = correctedQtyRound;
                const fixedUp = Math.round(supply / fixedQty);
                // 두 보정 중 단가 roundness가 더 높은 쪽 선택
                const scoreFixQty = roundness(fixedUp) + roundness(fixedQty);
                const scoreFixUp = roundness(Math.round(correctedUp)) + roundness(qty);
                if (scoreFixQty >= scoreFixUp) {
                  item.quantity = fixedQty;
                  item.unitPrice = fixedUp;
                } else {
                  item.unitPrice = Math.round(correctedUp);
                }
              } else {
                // 수량이 정수가 안 됨 → 단가를 보정
                item.unitPrice = Math.round(correctedUp);
              }
            }
          } else if (supply > 0 && qty > 0 && !extractedUp) {
            // 단가 없으면 공급가액 ÷ 수량으로 역산
            item.unitPrice = Math.round(supply / qty);
          } else if (!extractedUp && total > 0 && qty > 0) {
            // supplyAmount 없지만 totalAmount와 수량으로 역산
            const supplyFromTotal = Math.round(total / 1.1);
            item.unitPrice = Math.round(supplyFromTotal / qty);
            if (!supply) item.supplyAmount = supplyFromTotal;
            if (!item.vatAmount) item.vatAmount = total - supplyFromTotal;
          }
        }
      }
      // 최상위 supplyAmount/vatAmount가 없으면 items 합산으로 채움
      if (!parsed.supplyAmount && Array.isArray(parsed.items) && parsed.items.length > 0) {
        parsed.supplyAmount = parsed.items.reduce((s: number, it: any) => s + (Number(it.supplyAmount) || 0), 0) || null;
        parsed.vatAmount = parsed.items.reduce((s: number, it: any) => s + (Number(it.vatAmount) || 0), 0) || null;
        if (!parsed.totalAmount) {
          parsed.totalAmount = (Number(parsed.supplyAmount) || 0) + (Number(parsed.vatAmount) || 0) || null;
        }
      }

      // 파일을 스토리지에 업로드
      try {
        const ext = req.file.originalname.split('.').pop() || (isPdf ? 'pdf' : 'jpg');
        const filename = `resolution-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
        if (objUrl) {
          parsed._fileUrl = objUrl;
        } else {
          const localP = path.join(uploadDir, filename);
          fs.writeFileSync(localP, req.file.buffer);
          parsed._fileUrl = `/uploads/${filename}`;
        }
      } catch { /* 파일 저장 실패는 무시 */ }

      res.json(parsed);
    } catch (e: any) {
      console.error("Resolution extract error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // ─── 결의서 일괄: 견적서/거래명세서 단순 파일 업로드 ─────────────────
  app.post('/api/safety-cost-records/upload-file', requireEditor, safetyCostUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });
      const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');
      const ext = req.file.originalname.split('.').pop() || (isPdf ? 'pdf' : 'jpg');
      const t = (req.body.type === 'quote' ? 'quote' : req.body.type === 'transaction' ? 'trans' : 'attach');
      const filename = `${t}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const objUrl = await uploadToObjectStorage(req.file.buffer, filename, req.file.mimetype);
      let fileUrl = '';
      if (objUrl) {
        fileUrl = objUrl;
      } else {
        const localP = path.join(uploadDir, filename);
        fs.writeFileSync(localP, req.file.buffer);
        fileUrl = `/uploads/${filename}`;
      }
      res.json({ url: fileUrl });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── 사용내역 일괄 삭제 ───────────────────────────────────────────────
  app.post('/api/safety-cost-records/bulk-delete', requireEditor, async (req: any, res) => {
    try {
      const schema = z.object({ ids: z.array(z.number()).min(1) });
      const { ids } = schema.parse(req.body);
      await db.delete(safetyCostRecords).where(inArray(safetyCostRecords.id, ids));
      res.json({ deleted: ids.length });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ─── 거래명세서 일괄 업데이트 ─────────────────────────────────────────
  app.patch('/api/safety-cost-records/bulk-transaction', requireEditor, async (req: any, res) => {
    try {
      const schema = z.object({
        ids: z.array(z.number()).min(1),
        transactionFileUrl: z.string().min(1),
      });
      const { ids, transactionFileUrl } = schema.parse(req.body);
      await db.update(safetyCostRecords)
        .set({ transactionFileUrl })
        .where(inArray(safetyCostRecords.id, ids));
      res.json({ updated: ids.length });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ─── 안전사고 발생 대응훈련 API ─────────────────────────────────────
  const drillPhotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  const drillDocxUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  // 워드 파일 파싱 (시나리오 HTML 추출)
  app.post('/api/drill-docx/parse', requireEditor, drillDocxUpload.array('files', 20), async (req: any, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      console.log('[drill-docx/parse] 요청 수신 - 파일 수:', files?.length ?? 0);
      if (!files || files.length === 0) return res.status(400).json({ message: '파일 없음' });
      const results = await Promise.all(files.map(async (f) => {
        // HTML로 변환해 서식(단락, 굵기 등) 보존
        const htmlResult = await (mammoth as any).convertToHtml({ buffer: f.buffer }, {
          styleMap: [
            "p[style-name='Heading 1'] => h3:fresh",
            "p[style-name='Heading 2'] => h4:fresh",
            "p[style-name='제목 1'] => h3:fresh",
            "p[style-name='제목 2'] => h4:fresh",
          ]
        });
        const decodedName = Buffer.from(f.originalname, 'latin1').toString('utf8');
        return {
          fileName: decodedName.replace(/\.docx?$/i, ''),
          text: (htmlResult.value ?? '').trim(),
        };
      }));
      res.json(results);
    } catch (e: any) {
      console.error('[drill-docx/parse error]', e);
      res.status(500).json({ message: e.message });
    }
  });

  // 훈련 계획 문서에서 시나리오 표 자동 파싱
  app.post('/api/drill-docx/parse-plan', requireEditor, drillDocxUpload.single('file'), async (req: any, res) => {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ message: '파일 없음' });

      const TEAM_MAP: Record<string, string> = {
        '스탭': '스탭', '스태프': '스탭',
        '남대구t': '남대구운용팀', '남대구': '남대구운용팀',
        '공공망': '공공망관제팀', '공공망관제': '공공망관제팀',
        '포항t': '포항운용팀', '포항': '포항운용팀',
        '동대구t': '동대구운용팀', '동대구': '동대구운용팀',
        '안동t': '안동운용팀', '안동': '안동운용팀',
        '문경t': '문경운용팀', '문경': '문경운용팀',
        '구미t': '구미운용팀', '구미': '구미운용팀',
        '서대구t': '서대구운용팀', '서대구': '서대구운용팀',
        '현장경영': '현장경영팀', '현장경영팀': '현장경영팀',
      };

      const result = await mammoth.extractRawText({ buffer: file.buffer });
      const text = result.value ?? '';

      // "훈련 시나리오" 섹션 찾기
      const sectionIdx = text.indexOf('훈련 시나리오');
      if (sectionIdx < 0) return res.status(422).json({ message: '"훈련 시나리오" 섹션을 찾을 수 없습니다.' });

      const afterSection = text.slice(sectionIdx + '훈련 시나리오'.length);
      const lines = afterSection.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      const assignments: { team: string; department: string; scenario: string; accidentType: string }[] = [];
      let currentTeam = '';
      let currentDept = '';

      for (const line of lines) {
        // 다른 섹션 시작 시 종료
        if (/^(작업사고|차량사고|별첨|훈련 진행)/.test(line)) break;
        // 헤더 행 건너뜀
        if (line === '팀' || line === '부서별 시나리오') continue;

        const normalized = line.toLowerCase().replace(/\s/g, '');
        const matched = Object.entries(TEAM_MAP).find(([k]) => normalized === k.toLowerCase());

        if (matched) {
          currentTeam = line;
          currentDept = matched[1];
        } else if (currentDept && line.length > 5) {
          // 괄호 안 사고유형 추출 (마지막 괄호)
          const parenMatches = [...line.matchAll(/[（(]([^)）]+)[)）]/g)];
          const accidentType = parenMatches.length > 0
            ? parenMatches[parenMatches.length - 1][1].trim()
            : '기타';
          assignments.push({ team: currentTeam, department: currentDept, scenario: line, accidentType });
          currentTeam = '';
          currentDept = '';
        }
      }

      if (assignments.length === 0) return res.status(422).json({ message: '시나리오 표를 파싱할 수 없습니다. 문서 형식을 확인해주세요.' });
      res.json(assignments);
    } catch (e: any) {
      console.error('[parse-plan error]', e);
      res.status(500).json({ message: e.message });
    }
  });

  // 부서별 시나리오 일괄 배정
  app.post('/api/drill-sessions/:id/bulk-assign', requireEditor, async (req: any, res) => {
    try {
      const sessionId = Number(req.params.id);
      const { assignments } = req.body as { assignments: { department: string; scenario: string; accidentType: string; scenarioFile?: string }[] };
      if (!Array.isArray(assignments) || assignments.length === 0) return res.status(400).json({ message: '배정 목록 없음' });
      // 기존 배정 조회 → 부서별 upsert (단계 제출 데이터 보존)
      const existing = await storage.getDrillAssignments(sessionId);
      const existingMap = new Map(existing.map(a => [a.department, a.id]));
      const results = await Promise.all(assignments.map(a => {
        const existId = existingMap.get(a.department);
        if (existId) {
          return storage.updateDrillAssignment(existId, { scenario: a.scenario, accidentType: a.accidentType });
        }
        return storage.createDrillAssignment({ sessionId, ...a });
      }));
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 세션 CRUD
  app.get('/api/drill-sessions', isAuthenticated, async (_req, res) => {
    try { res.json(await storage.getDrillSessions()); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get('/api/drill-sessions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const session = await storage.getDrillSession(Number(req.params.id));
      if (!session) return res.status(404).json({ message: '없음' });
      res.json(session);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post('/api/drill-sessions', requireEditor, async (req: any, res) => {
    try {
      const data = { ...req.body, createdBy: req.user?.username };
      const session = await storage.createDrillSession(data);
      res.json(session);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.put('/api/drill-sessions/:id', requireEditor, async (req: any, res) => {
    try {
      const updated = await storage.updateDrillSession(Number(req.params.id), req.body);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete('/api/drill-sessions/:id', requireEditor, async (req: any, res) => {
    try {
      await storage.deleteDrillSession(Number(req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 부서 할당 CRUD
  app.get('/api/drill-sessions/:id/assignments', isAuthenticated, async (req: any, res) => {
    try { res.json(await storage.getDrillAssignments(Number(req.params.id))); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post('/api/drill-sessions/:id/assignments', requireEditor, async (req: any, res) => {
    try {
      const data = { ...req.body, sessionId: Number(req.params.id) };
      res.json(await storage.createDrillAssignment(data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.put('/api/drill-assignments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const updated = await storage.updateDrillAssignment(Number(req.params.id), req.body);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete('/api/drill-assignments/:id', requireEditor, async (req: any, res) => {
    try {
      await storage.deleteDrillAssignment(Number(req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // 사전교육 참석자 명단 + 사진 저장 (DB 영구 저장)
  app.put('/api/drill-assignments/:id/pre-edu', isAuthenticated, drillPhotoUpload.array('photos', 20), async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const assignment = await storage.getDrillAssignment(id);
      if (!assignment) return res.status(404).json({ message: '없음' });

      const bodyData = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : (req.body.data || {});

      const newPhotoUrls: string[] = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files as Express.Multer.File[]) {
          const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
          const filename = `drill_preedu_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const url = await uploadToObjectStorage(file.buffer, filename, file.mimetype);
          if (url) newPhotoUrls.push(url);
        }
      }

      const existing = (assignment.preEduData as any) || {};
      const allPhotos = [...(existing.photos || []), ...newPhotoUrls];
      const updated = await storage.updateDrillAssignment(id, {
        preEduData: { ...bodyData, photos: allPhotos },
      });
      res.json(updated);
    } catch (e: any) {
      console.error('pre-edu save error:', e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // 시나리오 파일 업로드 (PDF/JPG)
  app.put('/api/drill-assignments/:id/scenario-file', isAuthenticated, drillPhotoUpload.single('file'), async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const assignment = await storage.getDrillAssignment(id);
      if (!assignment) return res.status(404).json({ message: '없음' });
      if (!req.file) return res.status(400).json({ message: '파일 없음' });
      const file = req.file as Express.Multer.File;
      const ext = (file.originalname.split('.').pop() || 'pdf').toLowerCase();

      let uploadBuffer = file.buffer;
      let uploadMime = file.mimetype;
      let uploadExt = ext;
      // 한글 파일명 latin1→utf8 디코딩
      let displayName = (() => {
        try { return Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch { return file.originalname; }
      })();

      // DOCX → HTML 자동 변환
      if (ext === 'docx' || ext === 'doc') {
        try {
          const mammoth = require('mammoth');
          const result = await mammoth.convertToHtml({ buffer: file.buffer }, {
            styleMap: [
              "p[style-name='Heading 1'] => h2:fresh",
              "p[style-name='Heading 2'] => h3:fresh",
              "b => strong",
            ]
          });
          const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 14px; line-height: 1.8; padding: 24px 32px; color: #222; max-width: 860px; margin: 0 auto; }
  h1, h2, h3 { color: #1a1a2e; margin-top: 1.5em; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td, th { border: 1px solid #ccc; padding: 6px 10px; }
  th { background: #f0f4ff; font-weight: bold; }
  p { margin: 0.4em 0; }
  strong { font-weight: 700; }
</style>
</head>
<body>
${result.value}
</body>
</html>`;
          uploadBuffer = Buffer.from(htmlContent, 'utf-8');
          uploadMime = 'text/html';
          uploadExt = 'html';
          displayName = file.originalname.replace(/\.(docx?)/i, '.html');
        } catch (convErr: any) {
          console.error('mammoth conversion error:', convErr.message);
          // 변환 실패 시 원본 업로드
        }
      }

      const filename = `drill_scenario_${Date.now()}.${uploadExt}`;
      const url = await uploadToObjectStorage(uploadBuffer, filename, uploadMime);
      if (!url) return res.status(500).json({ message: '파일 저장 실패' });
      const updated = await storage.updateDrillAssignment(id, {
        scenarioFileUrl: url,
        scenarioFileName: displayName,
      });
      res.json(updated);
    } catch (e: any) {
      console.error('scenario-file error:', e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // 훈련 사진 전용 업로드 (제출과 분리)
  app.post('/api/drill-assignments/:id/upload-photos', isAuthenticated, drillPhotoUpload.any(), async (req: any, res) => {
    const assignmentId = Number(req.params.id);
    console.log(`[drill-upload] 사진 업로드 시작 id=${assignmentId} files=${(req.files as any[])?.length ?? 0}`);
    try {
      const files = (req.files || []) as Express.Multer.File[];
      const results = await Promise.all(
        files.map(async (file) => {
          const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
          const filename = `drill_photo_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const url = await uploadToObjectStorage(file.buffer, filename, file.mimetype);
          return { fieldname: file.fieldname, url };
        })
      );
      console.log(`[drill-upload] 완료 id=${assignmentId} 성공=${results.filter(r => r.url).length}/${files.length}`);
      res.json({ results });
    } catch (e: any) {
      console.error(`[drill-upload] 오류 id=${assignmentId}:`, e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // 단계별 보고 제출 (JSON 전용 — 사진은 upload-photos로 먼저 업로드)
  app.post('/api/drill-assignments/:id/step/:step', isAuthenticated, async (req: any, res) => {
    const assignmentId = Number(req.params.id);
    const step = Number(req.params.step);
    console.log(`[drill-step] 진입 id=${assignmentId} step=${step}`);
    try {
      if (![1, 2, 3].includes(step)) return res.status(400).json({ message: '잘못된 단계' });

      const assignment = await storage.getDrillAssignment(assignmentId);
      if (!assignment) return res.status(404).json({ message: '없음' });

      // body는 JSON — photos/slottedPhotos는 이미 업로드된 URL 배열
      const dataWithPhotos = req.body || {};

      const updatePayload: any = {
        [`step${step}Status`]: '제출완료',
        [`step${step}Data`]: dataWithPhotos,
        [`step${step}SubmittedAt`]: new Date(),
        [`step${step}SubmittedBy`]: req.user?.username,
      };
      const updated = await storage.updateDrillAssignment(assignmentId, updatePayload);
      console.log(`[drill-step] 제출 완료 id=${assignmentId} step=${step}`);
      res.json(updated);
    } catch (e: any) {
      console.error(`[drill-step] 오류 id=${assignmentId} step=${step}:`, e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // 단계 초기화 (관리자용)
  app.delete('/api/drill-assignments/:id/step/:step', requireEditor, async (req: any, res) => {
    try {
      const step = Number(req.params.step);
      const updatePayload: any = {
        [`step${step}Status`]: '미제출',
        [`step${step}Data`]: null,
        [`step${step}SubmittedAt`]: null,
        [`step${step}SubmittedBy`]: null,
      };
      const updated = await storage.updateDrillAssignment(Number(req.params.id), updatePayload);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── 음주운전 카드뉴스 API ────────────────────────────────────────────
  app.get('/api/card-news/fetch', requireAdmin, async (_req, res) => {
    try {
      const articles = await fetchDrunkDrivingNews();
      res.json({ articles, fetchedAt: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ message: '뉴스 수집에 실패했습니다', error: e.message });
    }
  });

  app.get('/api/card-news/config', requireAdmin, async (_req, res) => {
    try {
      const setting = await storage.getSetting('card_news_config');
      const config = setting?.value ? JSON.parse(setting.value) : {
        enabled: false,
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        time: '09:00',
        recipients: ['fbwogk26@gmail.com'],
      };
      const lastSentSetting = await storage.getSetting('card_news_last_sent').catch(() => null);
      res.json({ ...config, lastSent: lastSentSetting?.value ?? null });
    } catch (e) {
      res.status(500).json({ message: '설정 조회 실패' });
    }
  });

  app.put('/api/card-news/config', requireAdmin, async (req, res) => {
    try {
      const config = req.body;
      await storage.setSetting('card_news_config', JSON.stringify(config));
      await setupCardNewsScheduler();
      const lastSentSetting = await storage.getSetting('card_news_last_sent').catch(() => null);
      res.json({ ...config, lastSent: lastSentSetting?.value ?? null });
    } catch (e) {
      res.status(500).json({ message: '설정 저장 실패' });
    }
  });

  app.post('/api/card-news/send-email', requireAdmin, async (req, res) => {
    try {
      console.log('[카드뉴스] send-email body keys:', Object.keys(req.body || {}), 'articles count:', req.body?.articles?.length ?? 'none');
      const clientArticles = Array.isArray(req.body?.articles) && req.body.articles.length > 0
        ? req.body.articles : null;
      const results = await sendCardNewsEmail(clientArticles);
      const sentAt = new Date().toISOString();
      const failed = results.filter((r: any) => !r.ok);
      if (failed.length > 0) {
        res.json({
          message: `발송 완료 (${results.length - failed.length}/${results.length}건 성공)`,
          sentAt,
          results,
          warning: `실패: ${failed.map((f: any) => f.email).join(', ')}`,
        });
      } else {
        res.json({ message: `카드뉴스 이메일이 발송되었습니다 (${results.length}건)`, sentAt, results });
      }
    } catch (e: any) {
      res.status(500).json({ message: '이메일 발송 실패: ' + e.message });
    }
  });

  return httpServer;
}

// ═══════════════════════════════════════════════════════════════════════════
// 음주운전 카드뉴스 기능
// ═══════════════════════════════════════════════════════════════════════════

let cardNewsTimer: ReturnType<typeof setInterval> | null = null;

function parseRssItems(xml: string, keywords: string | string[], maxItems = 20, sinceMs?: number): any[] {
  const kwList: string[] = Array.isArray(keywords) ? keywords : (keywords ? [keywords] : []);
  const items: any[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const getTag = (tag: string) => {
      const m = item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 's'));
      return m ? m[1].replace(/<[^>]*>/g, '').trim() : '';
    };
    const title = getTag('title');
    const link = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim();
    const pubDate = getTag('pubDate');
    const source = getTag('source');
    const description = getTag('description');
    if (!title) continue;
    // 키워드 중 하나라도 제목 또는 설명에 포함되면 통과
    if (kwList.length > 0 && !kwList.some(k => title.includes(k) || description.includes(k))) continue;
    if (sinceMs && pubDate) {
      const articleMs = new Date(pubDate).getTime();
      if (!isNaN(articleMs) && articleMs < sinceMs) continue;
    }
    items.push({ title, link, pubDate, source, description });
    if (items.length >= maxItems) break;
  }
  return items;
}

// 음주운전 뉴스에서 거의 모든 기사에 공통으로 등장하는 단어 → 중복 판단에서 제외
// 이를 제거해야 실제 사건을 구분하는 토큰(나이/장소/피해규모 등)만 남음
const DEDUP_STOPWORDS = new Set([
  '음주운전','음주','운전','경찰','단속','조사','혐의','뉴스','기자',
  '사고','차량','운전자','혈중','알코올','농도','측정','위반','법규',
  '검거','적발','입건','구속','불구속','기소','송치','수사','경찰청',
  '사망','부상','중상','경상','피해자','가해자','피의자','처벌','징역','벌금',
  '만취','상태','사건','사고자','교통','보행자','신호','중앙선',
]);
const MEDIA_NAME_RE = /[\s\-\|:·\[（(]\s*(조선|중앙|동아|한겨레|한국|연합|뉴시스|뉴스1|경향|국민|세계|문화|서울|부산|매일|영남|오마이|프레시안|머니|한경|서울경제|아시아|헤럴드|파이낸셜|이데일리|데일리|스포츠|jtbc|kbs|mbc|sbs|ytn|cbs|tbs)(뉴스|일보|신문|경제|tv|방송|미디어)?[\s\]\）)]*$/gi;

// 한국어 조사/어미 제거 — "커플의"→"커플", "부산에서"→"부산"
function stripJosa(word: string): string {
  if (word.length <= 2) return word;
  const josa2 = ['에서','으로','에게','한테','이나','라도','까지','부터','이라','라고','이고','하고'];
  for (const j of josa2) {
    if (word.length > j.length + 1 && word.endsWith(j)) return word.slice(0, -j.length);
  }
  const josa1 = new Set(['의','도','만','은','는','이','가','을','를','과','와','에','로','서']);
  const last = word[word.length - 1];
  if (josa1.has(last)) return word.slice(0, -1);
  return word;
}

function extractTitleTokens(title: string): Set<string> {
  const cleaned = title
    .replace(MEDIA_NAME_RE, '')          // 언론사명 제거
    .replace(/[^\uAC00-\uD7A3\d\s]/g, ' ');  // 특수문자 → 공백
  // 한글 2글자 이상 OR 숫자 2자리 이상, 조사 제거 후 불용어 제외
  const raw = (cleaned.match(/[\uAC00-\uD7A3]{2,}|\d{2,}/g) || []);
  return new Set(raw.map(stripJosa).filter(w => w.length >= 2 && !DEDUP_STOPWORDS.has(w)));
}

// 불용어 제거 후 연속 2단어 조합(bigram) 추출 — 둘 다 비불용어인 경우만
function extractBigrams(title: string): Set<string> {
  const cleaned = title.replace(MEDIA_NAME_RE, '').replace(/[^\uAC00-\uD7A3\d\s]/g, ' ');
  const raw = (cleaned.match(/[\uAC00-\uD7A3]{2,}|\d{2,}/g) || []);
  const tokens = raw.map(stripJosa).filter(w => w.length >= 2);
  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    if (!DEDUP_STOPWORDS.has(tokens[i]) && !DEDUP_STOPWORDS.has(tokens[i + 1])) {
      bigrams.add(`${tokens[i]}|${tokens[i + 1]}`);
    }
  }
  return bigrams;
}

function titlesAreSimilar(a: string, b: string): boolean {
  // 1) 한글 앞 10자 일치 → 확실한 동일 기사
  const hanA = (a.match(/[\uAC00-\uD7A3]/g) || []).slice(0, 10).join('');
  const hanB = (b.match(/[\uAC00-\uD7A3]/g) || []).slice(0, 10).join('');
  if (hanA.length >= 7 && hanA === hanB) return true;

  const wa = extractTitleTokens(a);
  const wb = extractTitleTokens(b);
  if (wa.size === 0 || wb.size === 0) return false;

  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  const union = new Set([...wa, ...wb]).size;

  // 2) Jaccard 0.65 — stopwords 제거 후 남은 구분 토큰 65% 이상 겹쳐야 중복
  if (overlap / union >= 0.65) return true;

  // 3) 짧은 쪽 토큰의 75% 이상이 긴 쪽에 포함 → 제목 줄임 케이스
  const minSize = Math.min(wa.size, wb.size);
  if (minSize >= 3 && overlap / minSize >= 0.75) return true;

  // 4) Bigram 공유 — "부산 커플", "광주 고교" 등 특정 장소·인물 조합이 동일하면 같은 사건
  const bigramsA = extractBigrams(a);
  const bigramsB = extractBigrams(b);
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) return true;
  }

  return false;
}

// URL에서 도메인+경로 핵심 부분 추출 (파라미터 제거)
// Bing 래핑 URL은 실제 기사 URL을 추출해서 사용
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Bing news apiclick.aspx 래핑 URL → 실제 URL 추출
    if (u.hostname.includes('bing.com') && u.searchParams.get('url')) {
      const real = u.searchParams.get('url')!;
      try {
        const ru = new URL(decodeURIComponent(real));
        return ru.hostname + ru.pathname.replace(/\/$/, '');
      } catch { return real; }
    }
    return u.hostname + u.pathname.replace(/\/$/, '');
  } catch { return url; }
}

// 중복 제거: URL 동일 + 제목 유사 모두 체크
function deduplicateArticles(articles: any[]): any[] {
  const unique: any[] = [];
  const seenUrls = new Set<string>();
  for (const article of articles) {
    const urlKey = article.link ? normalizeUrl(article.link) : '';
    if (urlKey && seenUrls.has(urlKey)) continue;
    const isDup = unique.some(u => titlesAreSimilar(u.title, article.title));
    if (!isDup) {
      unique.push(article);
      if (urlKey) seenUrls.add(urlKey);
    }
  }
  return unique;
}

// 네이버 뉴스 검색 API (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수 필요)
async function fetchNaverNews(query: string, display = 20): Promise<any[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  try {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: AbortSignal.timeout(10_000),
    }) as any;
    if (!res.ok) { console.warn(`[카드뉴스] 네이버 API HTTP ${res.status}`); return []; }
    const data = await res.json();
    return (data.items || []).map((it: any) => {
      // news.naver.com URL을 우선 사용 (항상 접근 가능)
      // originallink는 Bizbox·사내망 등 외부 접근 불가한 경우가 있어 폴백으로만 사용
      const naverLink = (it.link || '').includes('news.naver.com') ? it.link : null;
      const link = naverLink || it.link || it.originallink || '';
      return {
        title: it.title.replace(/<[^>]*>/g, ''),
        link,
        pubDate: it.pubDate,
        source: '네이버뉴스',
        description: it.description.replace(/<[^>]*>/g, ''),
      };
    });
  } catch (e: any) {
    console.warn(`[카드뉴스] 네이버 API 오류: ${e.message}`);
    return [];
  }
}

async function fetchDrunkDrivingNews(): Promise<any[]> {
  const RSS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "ko-KR,ko;q=0.9",
  };
  const TIMEOUT_MS = 12_000;
  const MAX_RESULTS = 6;

  const DUI_KEYWORDS = ['음주운전', '음주 운전', '만취운전', '만취 운전', '음주운전자', '음주사고', '음주단속', '음주 사고'];
  // 키워드가 없으면 모든 기사 허용 (연합뉴스 등 사전 필터된 피드용)
  const DUI_LOOSE = ['음주', '만취', '혈중알코올'];

  console.log(`[카드뉴스] 수집 시작 (네이버API: ${process.env.NAVER_CLIENT_ID ? '사용' : '미설정'})`);

  const fetchRss = async (src: { name: string; url: string; keywords: string[] }, timeoutMs = TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(src.url, { headers: RSS_HEADERS, signal: controller.signal as any }) as any;
      clearTimeout(timer);
      if (!res.ok) { console.warn(`[카드뉴스] ${src.name} HTTP ${res.status}`); return []; }
      const xml = await res.text();
      // 날짜 필터 제거 — RSS 피드가 실시간 최신 기사만 제공하므로 날짜 필터 불필요
      const items = parseRssItems(xml, src.keywords, 100);
      console.log(`[카드뉴스] ${src.name} — ${items.length}건`);
      return items.map((it: any) => ({ ...it, source: it.source || src.name }));
    } catch (e: any) {
      clearTimeout(timer);
      console.warn(`[카드뉴스] ${src.name} 오류: ${e.message?.slice(0, 80)}`);
      return [];
    }
  };

  // ── 1순위: 네이버 뉴스 검색 API (키 있을 때만) ──────────────────────────
  const naverResults = await Promise.all([
    fetchNaverNews('음주운전', 20),
    fetchNaverNews('만취운전 OR 음주사고', 20),
  ]);
  const naverArticles = naverResults.flat();
  if (naverArticles.length > 0) {
    const unique = deduplicateArticles(naverArticles).slice(0, MAX_RESULTS);
    console.log(`[카드뉴스] 네이버 API → ${naverArticles.length}건 → 중복제거 ${unique.length}건`);
    return unique;
  }

  // ── 2순위: 구글 뉴스 RSS (검색어 자체가 필터, 가장 안정적) + 연합뉴스 ───
  const ynaSources = [
    { name: "구글뉴스(음주운전)", url: "https://news.google.com/rss/search?q=%EC%9D%8C%EC%A3%BC%EC%9A%B4%EC%A0%84&hl=ko&gl=KR&ceid=KR:ko", keywords: [] as string[] },
    { name: "구글뉴스(음주사고)", url: "https://news.google.com/rss/search?q=%EC%9D%8C%EC%A3%BC%EC%82%AC%EA%B3%A0+%EB%8B%A8%EC%86%8D&hl=ko&gl=KR&ceid=KR:ko", keywords: [] as string[] },
    { name: "연합뉴스(사회)", url: "https://www.yna.co.kr/rss/society.xml", keywords: DUI_LOOSE },
    { name: "연합뉴스(전체)", url: "https://www.yna.co.kr/rss/news.xml", keywords: DUI_LOOSE },
  ];
  const ynaResults = await Promise.allSettled(ynaSources.map(src => fetchRss(src, 12_000)));
  const ynaArticles: any[] = [];
  for (const r of ynaResults) {
    if (r.status === 'fulfilled') ynaArticles.push(...r.value);
  }
  // ── 3순위: Bing News RSS + 기타 언론사 RSS (병렬 수집) ──────────────────
  // 연합뉴스 결과와 합쳐서 중복 제거 후 반환
  const bingQueries = [
    { name: `Bing News(음주운전)`, url: `https://www.bing.com/news/search?q=${encodeURIComponent('음주운전')}&format=RSS&setlang=ko-KR&cc=KR&freshness=Month`, keywords: DUI_KEYWORDS },
    { name: `Bing News(음주사고)`, url: `https://www.bing.com/news/search?q=${encodeURIComponent('음주사고 OR 만취운전')}&format=RSS&setlang=ko-KR&cc=KR&freshness=Month`, keywords: DUI_KEYWORDS },
  ];
  const rssSources = [
    { name: "SBS뉴스(사회)", url: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionType=02&plink=RSSREADER", keywords: DUI_KEYWORDS },
    { name: "JTBC뉴스", url: "https://fs.jtbc.co.kr/RSS/newsflash.xml", keywords: DUI_KEYWORDS },
    { name: "동아일보(사회)", url: "https://rss.donga.com/national.xml", keywords: DUI_KEYWORDS },
  ];

  const [bingResults, rssResults] = await Promise.all([
    Promise.allSettled(bingQueries.map(src => fetchRss(src, 20_000))),
    Promise.allSettled(rssSources.map(src => fetchRss(src, TIMEOUT_MS))),
  ]);

  const allArticles: any[] = [...ynaArticles];
  for (const r of [...bingResults, ...rssResults]) {
    if (r.status === 'fulfilled') allArticles.push(...r.value);
  }

  const unique = deduplicateArticles(allArticles).slice(0, MAX_RESULTS);
  console.log(`[카드뉴스] 전체 ${allArticles.length}건 → 중복제거 ${unique.length}건`);
  unique.forEach((a, i) => console.log(`[카드뉴스] 선택[${i+1}] ${a.title}`));
  return unique;
}

async function buildCardNewsCards(articles: any[]): Promise<any[]> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  return Promise.all(articles.map(async (article) => {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: '음주운전 뉴스를 직원 경각심 카드뉴스로 요약하세요. JSON: {"제목":"(20자 이내)","핵심내용":"(60자 이내, 2줄)","경각심문구":"(25자 이내 강렬한 한 문장)"}'
        }, {
          role: "user",
          content: `제목: ${article.title}\n내용: ${article.description.slice(0, 300)}`
        }],
        response_format: { type: "json_object" },
        max_tokens: 300,
      });
      const data = JSON.parse(completion.choices[0].message.content || '{}');
      return { ...article, ...data };
    } catch {
      return { ...article, 제목: article.title.slice(0, 40), 핵심내용: article.description.slice(0, 100), 경각심문구: '음주운전은 살인입니다' };
    }
  }));
}

function buildCardNewsEmailHtml(cards: any[]): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const icons = ['🚗','⚠️','🚨','📋','🔔'];

  // 2열 그리드 — Gmail 호환 bgcolor + solid color
  const paired: any[][] = [];
  for (let i = 0; i < cards.length; i += 2) paired.push(cards.slice(i, i + 2));

  const gridRows = paired.map(pair => {
    const cells = pair.map((card, j) => {
      const idx = cards.indexOf(card);
      const icon = icons[idx % icons.length];
      const content = card.핵심내용 || (card.description || '').slice(0, 100);
      const bullets = content.split(/(?<=\.) /).slice(0, 2).join('<br>&#8226; ');
      return `<td width="47%" valign="top" bgcolor="#ffffff" style="background:#ffffff;border-radius:14px;padding:20px 18px;${j === 0 ? 'margin-right:12px;' : ''}">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td bgcolor="#ede9fe" style="background:#ede9fe;border-radius:12px;width:54px;height:54px;text-align:center;vertical-align:middle;font-size:30px;" width="54" height="54">${icon}</td>
      <td align="right" valign="top" style="padding-left:8px;">
        <span style="font-size:13px;font-weight:800;color:#8b5cf6;">${String(idx + 1).padStart(2, '0')}</span>
      </td>
    </tr>
    <tr><td colspan="2" style="padding-top:14px;">
      <p style="margin:0 0 10px;font-size:15px;font-weight:800;color:#1e1b4b;line-height:1.45;">${card.제목 || card.title}</p>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.8;">&#8226; ${bullets}</p>
    </td></tr>
    ${card.link ? `<tr><td colspan="2" style="padding-top:12px;"><a href="${card.link}" style="font-size:12px;color:#8b5cf6;text-decoration:none;font-weight:600;">원문 보기 →</a></td></tr>` : ''}
  </table>
</td>`;
    });
    // 홀수(마지막 1개)일 때 — 전체 너비로 가운데 표시
    if (cells.length === 1) {
      const fullWidthCell = cells[0].replace('width="47%"', 'width="100%"').replace('colspan="2"', 'colspan="2"');
      return `<tr><td colspan="3">${fullWidthCell.replace(/^<td[^>]*>/, '<td width="100%" valign="top" bgcolor="#ffffff" style="background:#ffffff;border-radius:14px;padding:20px 18px;">').slice(0, -5)}</td></tr><tr><td colspan="3" height="12"></td></tr>`;
    }
    return `<tr>${cells[0]}<td width="6%"></td>${cells[1]}</tr><tr><td colspan="3" height="12"></td></tr>`;
  }).join('');

  const summaryMsgs = cards.map(c => c.경각심문구).filter(Boolean).slice(0, 2);
  const summaryMsg = summaryMsgs.length > 0
    ? summaryMsgs.map(m => `• ${m}`).join('<br>')
    : '• 음주운전은 범죄입니다. 단 한 잔도 안 됩니다.';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>음주운전 경각심 카드뉴스</title>
</head>
<body style="margin:0;padding:0;background-color:#7c3aed;" bgcolor="#7c3aed">

<!-- 외부 배경 -->
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#7c3aed" style="background-color:#7c3aed;">
<tr><td align="center" style="padding:32px 16px 40px;">
<table width="520" cellpadding="0" cellspacing="0">

  <!-- ① 메인 컨테이너 -->
  <tr>
    <td>
      <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f3ff" style="background-color:#f5f3ff;border-radius:14px;">

        <!-- 헤더 타이틀 (다크 퍼플 배경으로 강조) -->
        <tr>
          <td bgcolor="#1e1b4b" style="background-color:#1e1b4b;border-radius:14px 14px 0 0;padding:28px 28px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle">
                  <p style="margin:0;font-size:36px;font-weight:900;color:#ffffff;letter-spacing:-0.02em;line-height:1.1;white-space:nowrap;">음주운전 경각심 뉴스</p>
                  <p style="margin:8px 0 0;font-size:14px;color:#c4b5fd;">오늘의 음주운전 관련 주요 뉴스를 전달드립니다</p>
                </td>
                <td align="right" valign="top" style="white-space:nowrap;padding-left:12px;">
                  <span style="font-size:12px;color:#a78bfa;">${today}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ② 핵심 메시지 박스 (카드 그리드 위) -->
        <tr>
          <td style="padding:20px 20px 4px;">
            <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#6d28d9" style="background-color:#6d28d9;border-radius:12px;">
              <tr>
                <td style="padding:14px 22px 8px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td bgcolor="#a78bfa" style="background-color:#a78bfa;border-radius:20px;padding:4px 14px;">
                        <span style="font-size:11px;font-weight:800;color:#ffffff;letter-spacing:0.07em;">📌 오늘의 핵심 메시지</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 22px 18px;">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#ffffff;line-height:1.9;">${summaryMsg}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ③ 2열 카드 그리드 -->
        <tr>
          <td style="padding:16px 20px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${gridRows}
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>

  <!-- 푸터 -->
  <tr>
    <td style="padding:20px 0 4px;" align="center">
      <p style="margin:0 0 4px;font-size:12px;color:#ddd6fe;font-weight:600;">KT MOS 남부 대구본부 · 종합안전포털시스템</p>
      <p style="margin:0;font-size:11px;color:#c4b5fd;">음주운전 예방 경각심 제고를 위해 자동 발송됩니다.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`;
}

async function sendCardNewsEmail(preloadedArticles?: any[] | null) {
  const articles = preloadedArticles && preloadedArticles.length > 0
    ? preloadedArticles
    : await fetchDrunkDrivingNews();
  if (articles.length === 0) throw new Error('뉴스를 수집할 수 없습니다');
  const cards = await buildCardNewsCards(articles.slice(0, 6));
  const html = buildCardNewsEmailHtml(cards);
  const setting = await storage.getSetting('card_news_config').catch(() => null);
  const config = setting?.value ? JSON.parse(setting.value) : {};
  const FIXED_RECIPIENT = 'jaeha.ryu@ktmos.co.kr';
  const configRecipients: string[] = config.recipients?.filter((r: string) => r.trim()) || ['fbwogk26@gmail.com'];
  // 고정 수신자를 항상 포함하되 중복 제거
  const allRecipients = Array.from(new Set([...configRecipients, FIXED_RECIPIENT]));
  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 587, secure: false,
    auth: { user: "fbwogk26@gmail.com", pass: process.env.GMAIL_APP_PASSWORD },
    tls: { rejectUnauthorized: false },
  });
  // SMTP 연결 확인
  await transporter.verify();
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  const subject = `🚨 [음주운전 경각심] ${today} 카드뉴스`;
  // 수신자별 개별 발송 (기업 메일 서버 거절 감지)
  const results: { email: string; ok: boolean; detail: string }[] = [];
  for (const recipient of allRecipients) {
    try {
      const info: any = await transporter.sendMail({
        from: '"KT MOS 대구현장경영팀" <fbwogk26@gmail.com>',
        to: recipient,
        subject,
        html,
      });
      const rejected: string[] = info.rejected || [];
      if (rejected.includes(recipient)) {
        results.push({ email: recipient, ok: false, detail: `SMTP 거절: ${info.response}` });
        console.error(`[카드뉴스] 발송 거절 - ${recipient} | ${info.response}`);
      } else {
        results.push({ email: recipient, ok: true, detail: info.response });
        console.log(`[카드뉴스] 발송 성공 - ${recipient} | ${info.response}`);
      }
    } catch (err: any) {
      results.push({ email: recipient, ok: false, detail: err.message });
      console.error(`[카드뉴스] 발송 오류 - ${recipient} |`, err.message);
    }
  }
  await storage.setSetting('card_news_last_sent', new Date().toISOString());
  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    console.error('[카드뉴스] 일부 실패:', JSON.stringify(failed));
  }
  return results;
}

async function setupCardNewsScheduler() {
  if (cardNewsTimer) { clearInterval(cardNewsTimer); cardNewsTimer = null; }
  try {
    const setting = await storage.getSetting('card_news_config');
    if (!setting?.value) return;
    const config = JSON.parse(setting.value);
    if (!config.enabled) return;
    const [hour, minute] = (config.time || '09:00').split(':').map(Number);
    const days: string[] = config.days || [];
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    cardNewsTimer = setInterval(async () => {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const dayName = dayNames[now.getDay()];
      if (days.includes(dayName) && now.getHours() === hour && now.getMinutes() === minute) {
        console.log('[카드뉴스] 자동 발송 시작');
        sendCardNewsEmail().catch(e => console.error('[카드뉴스] 자동 발송 오류', e));
      }
    }, 60 * 1000);
    console.log(`[카드뉴스] 스케줄러 시작 — ${days.join(',')} ${config.time}`);
  } catch (e) {
    console.error('[카드뉴스] 스케줄러 설정 오류', e);
  }
}

// 서버 시작 시 카드뉴스 스케줄러 초기화
setTimeout(() => setupCardNewsScheduler(), 5000);

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
