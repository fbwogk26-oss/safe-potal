import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";
import { ALL_PERMISSIONS, type UserPermissions } from "@shared/models/auth";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

const excelUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = /xlsx|xls|csv/;
    const allowedMime = /spreadsheet|excel|csv|text\/csv/;
    const ext = allowedExt.test(path.extname(file.originalname).toLowerCase());
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
      })));
    } catch (error) {
      res.status(500).json({ message: "사용자 목록을 불러올 수 없습니다" });
    }
  });

  // === TEAMS ===
  app.get(api.teams.list.path, async (req, res) => {
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
  app.get('/api/teams/export', async (req, res) => {
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

  // === IMAGE UPLOAD ===
  app.use('/uploads', (await import('express')).default.static(uploadDir));
  
  // Register Object Storage routes for persistent file uploads
  registerObjectStorageRoutes(app);
  
  app.post('/api/upload', requireEditor, upload.single('image'), (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  });

  // === FILE UPLOAD (Excel, etc.) ===
  const fileUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `file-${uniqueSuffix}${ext}`);
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
  app.get(api.notices.list.path, async (req, res) => {
    const category = req.query.category as string;
    const notices = await storage.getNotices(category);
    res.json(notices);
  });

  app.post(api.notices.create.path, requireEditor, async (req: any, res) => {
    const input = api.notices.create.input.parse(req.body);
    const notice = await storage.createNotice(input);
    res.status(201).json(notice);
  });

  app.put(api.notices.update.path, requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getNotice(id);
      if (!existing) return res.status(404).json({ message: "Notice not found" });
      
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
    await storage.deleteNotice(Number(req.params.id));
    res.status(204).send();
  });

  // === ACCESS REQUEST EXCEL DOWNLOAD (Single Item) ===
  app.get('/api/access/excel/:id', async (req, res) => {
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
  app.get("/api/settings/pinned-notice", async (req, res) => {
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
  app.get("/api/settings/inspection-targets", async (req, res) => {
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
    res.json({
      user: userPreset?.value ? JSON.parse(userPreset.value) : null,
      manager: managerPreset?.value ? JSON.parse(managerPreset.value) : null,
    });
  });

  app.post("/api/settings/role-presets", requireAdmin, async (req: any, res) => {
    const { role, permissions } = req.body;
    if (!role || !permissions) {
      return res.status(400).json({ message: "역할과 권한 설정이 필요합니다" });
    }
    if (role !== "user" && role !== "manager") {
      return res.status(400).json({ message: "일반사용자 또는 담당자만 설정할 수 있습니다" });
    }
    await storage.setSetting(`role_preset_${role}`, JSON.stringify(permissions));
    res.json({ success: true });
  });

  // === VEHICLES ===
  app.get(api.vehicles.list.path, async (req, res) => {
    const vehicles = await storage.getVehicles();
    res.json(vehicles);
  });

  app.post(api.vehicles.create.path, requireEditor, async (req: any, res) => {
    try {
      const input = api.vehicles.create.input.parse(req.body);
      const vehicle = await storage.createVehicle(input);
      res.status(201).json(vehicle);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.vehicles.update.path, requireEditor, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getVehicle(id);
      if (!existing) return res.status(404).json({ message: "Vehicle not found" });

      const input = api.vehicles.update.input.parse(req.body);
      const vehicle = await storage.updateVehicle(id, input);
      res.json(vehicle);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.vehicles.delete.path, requireEditor, async (req: any, res) => {
    await storage.deleteVehicle(Number(req.params.id));
    res.status(204).send();
  });

  // Vehicle Excel Export
  app.get("/api/vehicles/export", async (req, res) => {
    const vehicles = await storage.getVehicles();
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('차량목록');
    
    worksheet.columns = [
      { header: '순번', key: 'no', width: 8 },
      { header: '차량번호', key: 'plateNumber', width: 15 },
      { header: '부서', key: 'team', width: 15 },
      { header: '차량명', key: 'model', width: 12 },
      { header: '차종', key: 'vehicleType', width: 10 },
      { header: '주운행자', key: 'driver', width: 12 },
      { header: '부운행자', key: 'secondDriver', width: 12 },
      { header: '상태', key: 'status', width: 10 },
      { header: '계약시작일', key: 'purchaseDate', width: 14 },
      { header: '계약종료일', key: 'insuranceExpiry', width: 14 },
      { header: '보험연령', key: 'inspectionDate', width: 12 },
      { header: '비고', key: 'notes', width: 25 },
    ];
    
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    vehicles.forEach((v, idx) => {
      worksheet.addRow({
        no: idx + 1,
        plateNumber: v.plateNumber,
        team: v.team,
        model: v.model,
        vehicleType: v.vehicleType,
        driver: v.driver || '',
        secondDriver: v.secondDriver || '',
        status: v.status,
        purchaseDate: v.purchaseDate || '',
        insuranceExpiry: v.insuranceExpiry || '',
        inspectionDate: v.inspectionDate || '',
        notes: v.notes || '',
      });
    });
    
    const buffer = await workbook.xlsx.writeBuffer();
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=vehicle_list_${today}.xlsx`);
    res.send(buffer);
  });

  // Vehicle Excel Import
  app.post("/api/vehicles/import", requireEditor, async (req: any, res) => {
    try {
      const { data } = req.body;
      if (!Array.isArray(data)) {
        return res.status(400).json({ message: "Invalid data format" });
      }
      
      const existingVehicles = await storage.getVehicles();
      let created = 0;
      let updated = 0;
      
      for (const row of data) {
        if (!row.plateNumber) continue;
        
        const existing = existingVehicles.find(v => v.plateNumber === row.plateNumber);
        
        if (existing) {
          await storage.updateVehicle(existing.id, {
            team: row.team ?? existing.team,
            model: row.model ?? existing.model,
            vehicleType: row.vehicleType ?? existing.vehicleType,
            driver: row.driver ?? existing.driver,
            secondDriver: row.secondDriver ?? existing.secondDriver,
            status: row.status ?? existing.status,
            purchaseDate: row.purchaseDate ?? existing.purchaseDate,
            insuranceExpiry: row.insuranceExpiry ?? existing.insuranceExpiry,
            inspectionDate: row.inspectionDate ?? existing.inspectionDate,
            notes: row.notes ?? existing.notes,
          });
          updated++;
        } else {
          await storage.createVehicle({
            plateNumber: row.plateNumber,
            team: row.team ?? "동대구운용팀",
            model: row.model ?? "",
            vehicleType: row.vehicleType ?? "승용차",
            driver: row.driver ?? "",
            secondDriver: row.secondDriver ?? "",
            status: row.status ?? "운행중",
            purchaseDate: row.purchaseDate ?? "",
            insuranceExpiry: row.insuranceExpiry ?? "",
            inspectionDate: row.inspectionDate ?? "",
            notes: row.notes ?? "",
            year: new Date().getFullYear(),
            contact: "",
            mileage: 0,
            imageUrl: "",
          });
          created++;
        }
      }
      
      res.json({ success: true, created, updated });
    } catch (err) {
      console.error('Vehicle import error:', err);
      res.status(500).json({ message: "Import failed" });
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

  app.get("/api/safety-equipment", async (req, res) => {
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
        imageUrl = `/uploads/${req.file.filename}`;
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
  app.get("/api/safety-inspections", async (req, res) => {
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
      });
      res.status(201).json(inspection);
    } catch (err) {
      console.error("Create inspection error:", err);
      res.status(500).json({ message: "Failed to create inspection" });
    }
  });

  app.delete("/api/safety-inspections/:id", requireEditor, async (req: any, res) => {
    await storage.deleteSafetyInspection(Number(req.params.id));
    res.status(204).send();
  });

  // Seed Data
  await seedDatabase();

  // === VEHICLE LOGS ===
  app.get("/api/vehicle-logs", isAuthenticated, async (req: any, res) => {
    const logs = await storage.getVehicleLogs();
    res.json(logs);
  });

  app.get("/api/vehicle-logs/by-vehicle/:vehicleId", isAuthenticated, async (req: any, res) => {
    const vehicleId = Number(req.params.vehicleId);
    const logs = await storage.getVehicleLogsByVehicle(vehicleId);
    res.json(logs);
  });

  app.get("/api/vehicle-logs/last/:vehicleId", isAuthenticated, async (req: any, res) => {
    const vehicleId = Number(req.params.vehicleId);
    const log = await storage.getLastVehicleLog(vehicleId);
    res.json(log || null);
  });

  const vehicleLogCreateSchema = z.object({
    vehicleId: z.number(),
    plateNumber: z.string().min(1),
    vehicleModel: z.string().default(""),
    team: z.string().default(""),
    driver: z.string().default(""),
    logDate: z.string().min(1),
    departureTime: z.string().nullable().optional(),
    arrivalTime: z.string().nullable().optional(),
    departureLocation: z.string().nullable().optional(),
    arrivalLocation: z.string().nullable().optional(),
    purpose: z.string().nullable().optional(),
    beforeMileage: z.number().default(0),
    afterMileage: z.number().default(0),
    fuelAmount: z.string().nullable().optional(),
    fuelReceiptUrl: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  });

  app.post("/api/vehicle-logs", requirePermission("editVehicleLogs"), async (req: any, res) => {
    try {
      const parsed = vehicleLogCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "필수 항목을 입력해주세요", errors: parsed.error.flatten() });
      }
      const data = parsed.data;
      const session = req.session as any;
      const user = await authStorage.getUser(session.userId);
      const log = await storage.createVehicleLog({
        ...data,
        departureTime: data.departureTime || null,
        arrivalTime: data.arrivalTime || null,
        departureLocation: data.departureLocation || null,
        arrivalLocation: data.arrivalLocation || null,
        purpose: data.purpose || null,
        fuelAmount: data.fuelAmount || null,
        fuelReceiptUrl: data.fuelReceiptUrl || null,
        notes: data.notes || null,
        createdBy: user?.name || user?.username || null,
      });
      res.status(201).json(log);
    } catch (error) {
      console.error("Error creating vehicle log:", error);
      res.status(500).json({ message: "운행일지 생성에 실패했습니다" });
    }
  });

  app.delete("/api/vehicle-logs/:id", requirePermission("editVehicleLogs"), async (req: any, res) => {
    await storage.deleteVehicleLog(Number(req.params.id));
    res.status(204).send();
  });

  // Excel export for vehicle logs
  app.get("/api/vehicle-logs/export/:vehicleId", requirePermission("editVehicleLogs"), async (req: any, res) => {
    try {
      const vehicleId = Number(req.params.vehicleId);
      const logs = await storage.getVehicleLogsByVehicle(vehicleId);
      if (logs.length === 0) {
        return res.status(404).json({ message: "운행 기록이 없습니다." });
      }

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("차량운행일지");

      const colWidths = [6, 14, 10, 10, 10, 16, 16, 14, 14, 14, 14, 10, 18];
      sheet.columns = colWidths.map(w => ({ width: w }));

      const firstLog = logs[0];
      sheet.mergeCells("A1:M1");
      sheet.getCell("A1").value = `차량운행일지 - ${firstLog.plateNumber} (${firstLog.vehicleModel})`;
      sheet.getCell("A1").font = { size: 16, bold: true };
      sheet.getCell("A1").alignment = { horizontal: "center" };

      sheet.getRow(2).values = ["팀", firstLog.team, "", "차량번호", firstLog.plateNumber, "", "모델", firstLog.vehicleModel];
      sheet.getRow(2).font = { bold: true };

      const headerRow = 4;
      const headers = [
        "No", "운행일", "운전자", "출발시간", "도착시간",
        "출발지", "도착지", "용도",
        "출발전(km)", "도착후(km)", "운행거리(km)",
        "주유량", "비고"
      ];
      sheet.getRow(headerRow).values = headers;
      const hRow = sheet.getRow(headerRow);
      hRow.font = { bold: true };
      hRow.alignment = { horizontal: "center" };
      for (let i = 1; i <= headers.length; i++) {
        const cell = hRow.getCell(i);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
        cell.border = {
          top: { style: "thin" }, bottom: { style: "thin" },
          left: { style: "thin" }, right: { style: "thin" }
        };
      }

      const sortedLogs = [...logs].reverse();
      let totalDistance = 0;
      sortedLogs.forEach((log, idx) => {
        const distance = Math.max(0, (log.afterMileage || 0) - (log.beforeMileage || 0));
        totalDistance += distance;
        const row = sheet.getRow(headerRow + 1 + idx);
        row.values = [
          idx + 1,
          log.logDate,
          log.driver,
          log.departureTime || "",
          log.arrivalTime || "",
          log.departureLocation || "",
          log.arrivalLocation || "",
          log.purpose || "",
          log.beforeMileage || 0,
          log.afterMileage || 0,
          distance,
          log.fuelAmount || "",
          log.notes || ""
        ];
        row.alignment = { horizontal: "center" };
        for (let i = 1; i <= headers.length; i++) {
          row.getCell(i).border = {
            top: { style: "thin" }, bottom: { style: "thin" },
            left: { style: "thin" }, right: { style: "thin" }
          };
        }
      });

      const totalRow = sheet.getRow(headerRow + 1 + sortedLogs.length);
      totalRow.values = ["", "", "", "", "", "", "", "합계", "", "", totalDistance, "", ""];
      totalRow.font = { bold: true };
      totalRow.alignment = { horizontal: "center" };
      for (let i = 1; i <= headers.length; i++) {
        const cell = totalRow.getCell(i);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
        cell.border = {
          top: { style: "thin" }, bottom: { style: "thin" },
          left: { style: "thin" }, right: { style: "thin" }
        };
      }

      const plateEncoded = encodeURIComponent(firstLog.plateNumber);
      const dateStr = new Date().toISOString().split("T")[0];
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''vehicle_log_${plateEncoded}_${dateStr}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Error exporting vehicle logs:", error);
      res.status(500).json({ message: "엑셀 내보내기에 실패했습니다" });
    }
  });

  // === EDUCATION SESSIONS (교육일지) ===
  app.get("/api/education-sessions", isAuthenticated, async (req: any, res) => {
    const department = req.query.department as string | undefined;
    const sessions = await storage.getEducationSessions(department);
    res.json(sessions);
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
      });
      const parsed = bodySchema.parse(req.body);
      const session = await storage.createEducationSession({
        ...parsed,
        createdBy: req.user?.username || req.user?.name || "unknown",
      });
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
          createdBy,
        });
        results.push(session);
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
    await storage.deleteEducationSession(Number(req.params.id));
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
        signerName: z.string().min(1),
        signerDepartment: z.string().optional(),
        signatureData: z.string().min(1),
      });
      const parsed = sigSchema.parse(req.body);
      const signature = await storage.createSignature({
        ...parsed,
        sessionId: Number(req.params.id),
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
