import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

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

  app.delete(api.notices.delete.path, async (req, res) => {
    await storage.deleteNotice(Number(req.params.id));
    res.status(204).send();
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

  // Seed Data
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const teams = await storage.getTeams(2025);
  if (teams.length === 0) {
    const seedTeams = [
      { name: "서울지사", vehicleCount: 50, suggestion: 2, activity: 1 },
      { name: "부산지사", vehicleCount: 45, suggestion: 5, activity: 5 },
      { name: "대구지사", vehicleCount: 30, workAccident: 1 },
      { name: "광주지사", vehicleCount: 25 },
      { name: "대전지사", vehicleCount: 40, inspectionMiss: 1 },
      { name: "경기본부", vehicleCount: 80, fineSpeed: 2, suggestion: 10 },
      { name: "인천지사", vehicleCount: 35 },
      { name: "강원지사", vehicleCount: 20 },
      { name: "제주지사", vehicleCount: 15 },
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
