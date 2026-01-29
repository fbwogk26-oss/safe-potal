import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // === TEAMS ===
  app.get(api.teams.list.path, async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : 2025;
    const teams = await storage.getTeams(year);
    res.json(teams);
  });

  app.post(api.teams.create.path, async (req, res) => {
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

  app.put(api.teams.update.path, async (req, res) => {
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

  app.delete(api.teams.delete.path, async (req, res) => {
    await storage.deleteTeam(Number(req.params.id));
    res.status(204).send();
  });

  // Reset single team scores
  app.post('/api/teams/:id/reset', async (req, res) => {
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
  app.post('/api/teams/reset-all', async (req, res) => {
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

  // === IMAGE UPLOAD ===
  app.use('/uploads', (await import('express')).default.static(uploadDir));
  
  app.post('/api/upload', upload.single('image'), (req, res) => {
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

  app.post('/api/upload/file', fileUpload.single('file'), (req, res) => {
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

  app.post(api.notices.create.path, async (req, res) => {
    const input = api.notices.create.input.parse(req.body);
    const notice = await storage.createNotice(input);
    res.status(201).json(notice);
  });

  app.put(api.notices.update.path, async (req, res) => {
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

  app.delete(api.notices.delete.path, async (req, res) => {
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

      worksheet.spliceColumns(8, 2);

      const templateRow = worksheet.getRow(5);
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

  // === SETTINGS (LOCK) ===
  app.get(api.settings.getLock.path, async (req, res) => {
    const setting = await storage.getSetting('global_lock');
    res.json({ isLocked: setting?.value === 'true' });
  });

  app.post(api.settings.setLock.path, async (req, res) => {
    const { isLocked, pin } = req.body;
    // Simple PIN check
    if (pin && pin !== '2026') {
      return res.status(401).json({ message: "Invalid PIN" });
    }
    await storage.setSetting('global_lock', String(isLocked));
    res.json({ success: true });
  });

  // === VEHICLES ===
  app.get(api.vehicles.list.path, async (req, res) => {
    const vehicles = await storage.getVehicles();
    res.json(vehicles);
  });

  app.post(api.vehicles.create.path, async (req, res) => {
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

  app.put(api.vehicles.update.path, async (req, res) => {
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

  app.delete(api.vehicles.delete.path, async (req, res) => {
    await storage.deleteVehicle(Number(req.params.id));
    res.status(204).send();
  });

  // Seed Data
  await seedDatabase();

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
