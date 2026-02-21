import type { Express } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { storage } from "./storage";
import { isAuthenticated, authStorage } from "./replit_integrations/auth";
import type { UserPermissions } from "@shared/models/auth";
import multer from "multer";
import path from "path";
import fs from "fs";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, "chat_" + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext || mime);
  },
});

function hasPermission(user: any, permKey: keyof UserPermissions): boolean {
  if (user.role === "admin") return true;
  const perms = user.permissions || {};
  return !!(perms as any)[permKey];
}

const educationDataSchema = z.object({
  title: z.string().min(1).default("교육"),
  educationDate: z.string().min(1),
  department: z.string().min(1),
  educationType: z.string().default("정기교육"),
  instructor: z.string().optional(),
  totalParticipants: z.number().int().min(1).default(1),
  description: z.string().optional().default(""),
});

const inspectionDataSchema = z.object({
  inspectionType: z.string().min(1).default("안전점검"),
  title: z.string().min(1).default("안전점검"),
  inspectionDate: z.string().min(1),
  inspector: z.string().optional(),
  workerName: z.string().optional().default(""),
  location: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

const DEPARTMENTS = [
  "동대구운용팀", "포항운용팀", "안동운용팀", "서대구운용팀",
  "남대구운용팀", "구미운용팀", "문경운용팀", "현장경영팀", "운용부"
];

const SYSTEM_PROMPT = `당신은 kt MOS남부 종합안전포털시스템의 AI 어시스턴트입니다.
사용자의 자연어 요청을 분석하여 적절한 액션을 수행합니다.

지원하는 액션:
1. CREATE_EDUCATION - 교육일지 등록
2. QUERY_EDUCATION - 교육 현황 조회
3. CREATE_INSPECTION - 안전점검 등록
4. QUERY_INSPECTION - 안전점검 현황 조회
5. GENERAL_QUERY - 일반 질의응답/요약/안내

부서 목록: ${DEPARTMENTS.join(", ")}

응답 형식 (반드시 JSON):
{
  "action": "ACTION_TYPE",
  "message": "사용자에게 표시할 메시지",
  "data": {
    // 액션별 필요 데이터
  },
  "needsConfirmation": true/false,
  "followUp": "추가 질문이 필요한 경우"
}

CREATE_EDUCATION 필요 데이터:
{
  "title": "교육 제목",
  "educationDate": "YYYY-MM-DD",
  "department": "부서명",
  "educationType": "정기교육/수시교육/특별교육 등",
  "totalParticipants": 숫자,
  "instructor": "교육자 이름",
  "description": "교육 내용 설명"
}

CREATE_INSPECTION 필요 데이터:
{
  "inspectionType": "안전점검/동행점검",
  "title": "점검 제목",
  "inspectionDate": "YYYY-MM-DD",
  "inspector": "점검자 이름",
  "workerName": "작업자 이름 (선택)",
  "location": "위치 (선택)",
  "notes": "비고 (선택)"
}

규칙:
- 오늘 날짜를 모르면 현재 날짜를 사용하세요.
- 필수 정보가 부족하면 needsConfirmation을 true로 설정하고 followUp으로 물어보세요.
- 사용자의 부서와 이름 정보가 주어지면 활용하세요.
- 교육 인원이 지정되지 않으면 부서 기본 인원(1)을 사용하세요.
- 항상 한국어로 응답하세요.
- 사진이 첨부되었다는 정보가 있으면 사진 업로드 처리를 안내하세요.
- "안전보건점검의날"은 교육 제목으로 자주 사용됩니다.
- 데이터 생성(CREATE_*) 시 필수 항목(제목, 날짜, 부서)이 확인되면 needsConfirmation을 false로 설정하여 즉시 등록하세요.`;

async function executeEducationCreate(data: any, user: any, today: string, uploadedImages: string[]) {
  const validated = educationDataSchema.parse({
    title: data.title || "교육",
    educationDate: data.educationDate || today,
    department: data.department || user.department || "미지정",
    educationType: data.educationType || "정기교육",
    instructor: data.instructor || user.name || user.username,
    totalParticipants: typeof data.totalParticipants === "number" ? data.totalParticipants : 1,
    description: data.description || "",
  });

  const sessionData = {
    ...validated,
    images: uploadedImages,
    createdBy: user.username || user.name || "chatbot",
  };

  const created = await storage.createEducationSession(sessionData);
  return {
    actionResult: {
      success: true,
      type: "education_created",
      sessionId: created.id,
      data: sessionData,
    },
    message: `교육일지가 등록되었습니다!\n\n📋 제목: ${sessionData.title}\n📅 날짜: ${sessionData.educationDate}\n🏢 부서: ${sessionData.department}\n👨‍🏫 교육자: ${sessionData.instructor}\n👥 인원: ${sessionData.totalParticipants}명${uploadedImages.length > 0 ? `\n📸 사진: ${uploadedImages.length}장 업로드됨` : ""}`,
  };
}

async function executeInspectionCreate(data: any, user: any, today: string, uploadedImages: string[]) {
  const validated = inspectionDataSchema.parse({
    inspectionType: data.inspectionType || "안전점검",
    title: data.title || "안전점검",
    inspectionDate: data.inspectionDate || today,
    inspector: data.inspector || user.name || user.username,
    workerName: data.workerName || "",
    location: data.location || "",
    notes: data.notes || "",
  });

  const inspectionData = {
    ...validated,
    checklist: data.checklist || [],
    images: uploadedImages,
  };

  const created = await storage.createSafetyInspection(inspectionData);
  return {
    actionResult: {
      success: true,
      type: "inspection_created",
      inspectionId: created.id,
      data: inspectionData,
    },
    message: `안전점검이 등록되었습니다!\n\n📋 유형: ${inspectionData.inspectionType}\n📅 날짜: ${inspectionData.inspectionDate}\n👷 점검자: ${validated.inspector}${uploadedImages.length > 0 ? `\n📸 사진: ${uploadedImages.length}장 업로드됨` : ""}`,
  };
}

export function registerChatbotRoutes(app: Express): void {
  app.post(
    "/api/chatbot/message",
    isAuthenticated,
    chatUpload.array("photos", 10),
    async (req: any, res) => {
      try {
        const { message, conversationHistory } = req.body;
        const session = req.session as any;
        const user = await authStorage.getUser(session.userId);

        if (!user) {
          return res.status(401).json({ error: "사용자 정보를 찾을 수 없습니다" });
        }

        const uploadedImages: string[] = [];
        if (req.files && Array.isArray(req.files)) {
          for (const file of req.files as Express.Multer.File[]) {
            uploadedImages.push(`/uploads/${file.filename}`);
          }
        }

        const today = new Date().toISOString().split("T")[0];
        const userContext = `현재 사용자: ${user.name || user.username}, 부서: ${user.department || "미지정"}, 역할: ${user.role}, 오늘 날짜: ${today}`;
        const photoContext = uploadedImages.length > 0
          ? `\n첨부된 사진 ${uploadedImages.length}장이 있습니다.`
          : "";

        let history: { role: string; content: string }[] = [];
        try {
          if (conversationHistory) {
            history = JSON.parse(conversationHistory);
          }
        } catch {}

        const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.map((h) => ({
            role: h.role as "user" | "assistant",
            content: h.content,
          })),
          {
            role: "user",
            content: `${userContext}${photoContext}\n\n사용자 요청: ${message}`,
          },
        ];

        const response = await openai.chat.completions.create({
          model: "gpt-5-nano",
          messages: chatMessages,
          max_completion_tokens: 1024,
          response_format: { type: "json_object" },
        });

        const aiContent = response.choices[0]?.message?.content || "{}";
        let parsed: any;
        try {
          parsed = JSON.parse(aiContent);
        } catch {
          parsed = {
            action: "GENERAL_QUERY",
            message: aiContent,
            data: {},
          };
        }

        let actionResult: any = null;

        if (parsed.action === "CREATE_EDUCATION" && !parsed.needsConfirmation) {
          if (!hasPermission(user, "registerEducation")) {
            parsed.message = "교육일지 등록 권한이 없습니다. 관리자에게 문의해주세요.";
            parsed.action = "PERMISSION_DENIED";
          } else {
            try {
              const result = await executeEducationCreate(parsed.data, user, today, uploadedImages);
              actionResult = result.actionResult;
              parsed.message = result.message;
            } catch (error: any) {
              actionResult = { success: false, error: error.message };
              parsed.message = `교육일지 등록 중 오류가 발생했습니다: ${error.message}`;
            }
          }
        }

        if (parsed.action === "CREATE_INSPECTION" && !parsed.needsConfirmation) {
          if (!hasPermission(user, "editInspections")) {
            parsed.message = "안전점검 등록 권한이 없습니다. 관리자에게 문의해주세요.";
            parsed.action = "PERMISSION_DENIED";
          } else {
            try {
              const result = await executeInspectionCreate(parsed.data, user, today, uploadedImages);
              actionResult = result.actionResult;
              parsed.message = result.message;
            } catch (error: any) {
              actionResult = { success: false, error: error.message };
              parsed.message = `안전점검 등록 중 오류가 발생했습니다: ${error.message}`;
            }
          }
        }

        if (parsed.action === "QUERY_EDUCATION") {
          try {
            const sessions = await storage.getEducationSessions(parsed.data?.department);
            const recentSessions = sessions.slice(0, 10);
            const summary = recentSessions.map((s) =>
              `• ${s.title} (${s.educationDate}) - ${s.department} [${s.status}]`
            ).join("\n");
            parsed.message = `최근 교육 현황:\n\n${summary || "등록된 교육이 없습니다."}`;
            actionResult = { success: true, type: "education_query", count: sessions.length };
          } catch {
            parsed.message = "교육 현황 조회 중 오류가 발생했습니다.";
          }
        }

        if (parsed.action === "QUERY_INSPECTION") {
          try {
            const inspections = await storage.getSafetyInspections();
            const recent = inspections.slice(0, 10);
            const summary = recent.map((i: any) =>
              `• ${i.title} (${i.inspectionDate}) - ${i.inspectionType} [${i.inspector}]`
            ).join("\n");
            parsed.message = `최근 안전점검 현황:\n\n${summary || "등록된 점검이 없습니다."}`;
            actionResult = { success: true, type: "inspection_query", count: inspections.length };
          } catch {
            parsed.message = "점검 현황 조회 중 오류가 발생했습니다.";
          }
        }

        res.json({
          message: parsed.message,
          action: parsed.action,
          actionResult,
          needsConfirmation: parsed.needsConfirmation || false,
          confirmData: parsed.needsConfirmation ? parsed.data : null,
          followUp: parsed.followUp || null,
          uploadedImages,
        });
      } catch (error: any) {
        console.error("Chatbot error:", error);
        res.status(500).json({
          message: "죄송합니다, 요청 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
          error: error.message,
        });
      }
    }
  );

  app.post("/api/chatbot/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const { action, data, uploadedImages } = req.body;
      const session = req.session as any;
      const user = await authStorage.getUser(session.userId);
      const today = new Date().toISOString().split("T")[0];

      if (!user) {
        return res.status(401).json({ error: "사용자 정보를 찾을 수 없습니다" });
      }

      if (action === "CREATE_EDUCATION") {
        if (!hasPermission(user, "registerEducation")) {
          return res.status(403).json({ error: "교육일지 등록 권한이 없습니다" });
        }
        const result = await executeEducationCreate(data, user, today, uploadedImages || []);
        return res.json({ success: true, message: result.message, sessionId: result.actionResult.sessionId });
      }

      if (action === "CREATE_INSPECTION") {
        if (!hasPermission(user, "editInspections")) {
          return res.status(403).json({ error: "안전점검 등록 권한이 없습니다" });
        }
        const result = await executeInspectionCreate(data, user, today, uploadedImages || []);
        return res.json({ success: true, message: result.message, inspectionId: result.actionResult.inspectionId });
      }

      res.status(400).json({ error: "지원하지 않는 액션입니다" });
    } catch (error: any) {
      console.error("Chatbot confirm error:", error);
      res.status(500).json({ error: error.message });
    }
  });
}
