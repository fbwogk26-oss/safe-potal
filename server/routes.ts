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

  // Team Excel Import
  app.post('/api/teams/import', async (req, res) => {
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

  // === SETTINGS (LOCK) ===
  app.get(api.settings.getLock.path, async (req, res) => {
    const setting = await storage.getSetting('global_lock');
    res.json({ isLocked: setting?.value === 'true' });
  });

  app.post(api.settings.setLock.path, async (req, res) => {
    const { isLocked, pin } = req.body;
    // Simple PIN check
    if (pin && pin !== '159753') {
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
  app.post("/api/vehicles/import", async (req, res) => {
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
  app.get("/api/safety-equipment", async (req, res) => {
    const equipment = await storage.getSafetyEquipment();
    res.json(equipment);
  });

  app.post("/api/safety-equipment", upload.single('image'), async (req, res) => {
    try {
      const { name, category } = req.body;
      if (!name || !category) {
        return res.status(400).json({ message: "Name and category are required" });
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

  app.put("/api/safety-equipment/:id", async (req, res) => {
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

  app.delete("/api/safety-equipment/:id", async (req, res) => {
    await storage.deleteSafetyEquipment(Number(req.params.id));
    res.status(204).send();
  });

  // Update team equipment (when new equipment is issued without disposal)
  app.post("/api/teams/update-equipment", async (req, res) => {
    try {
      const { team, items } = req.body;
      if (!team || !items) {
        return res.status(400).json({ message: "Team and items are required" });
      }
      
      // Create a notice to track the equipment update
      const equipmentSummary = items.map((item: { name: string; quantity: number }) => 
        `${item.name} x${item.quantity}`
      ).join(", ");
      
      await storage.createNotice({
        category: "equipment_update",
        title: `${team} 안전보호구 추가`,
        content: JSON.stringify({
          team,
          items,
          updatedAt: new Date().toISOString(),
          type: "equipment_addition"
        })
      });
      
      console.log(`Equipment updated for team ${team}: ${equipmentSummary}`);
      res.json({ success: true, message: "Equipment count updated" });
    } catch (err) {
      console.error("Update equipment error:", err);
      res.status(500).json({ message: "Failed to update equipment" });
    }
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
