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
5. GENERAL_QUERY - 일반 질의응답

부서 목록: ${DEPARTMENTS.join(", ")}

중요: 반드시 아래 JSON 형식으로만 응답하세요.

등록 요청(CREATE_EDUCATION, CREATE_INSPECTION)일 때:
- 사용자가 말한 정보를 data에 넣으세요.
- 사용자가 명시하지 않은 정보는 사용자 컨텍스트에서 기본값으로 채우세요.
- message에는 등록할 내용을 요약해주세요.

JSON 형식:
{
  "action": "CREATE_EDUCATION",
  "message": "한국어 메시지",
  "data": {
    "title": "교육 제목",
    "educationDate": "YYYY-MM-DD",
    "department": "부서명",
    "educationType": "정기교육",
    "totalParticipants": 1,
    "instructor": "교육자",
    "description": "설명"
  }
}

CREATE_INSPECTION JSON:
{
  "action": "CREATE_INSPECTION",
  "message": "한국어 메시지",
  "data": {
    "inspectionType": "안전점검",
    "title": "점검 제목",
    "inspectionDate": "YYYY-MM-DD",
    "inspector": "점검자"
  }
}

규칙:
- "안전보건점검의날"은 교육 제목으로 자주 사용됩니다.
- 부서가 명시되지 않으면 사용자의 부서를 기본값으로 사용하세요.
- message 필드에는 반드시 의미있는 한국어 메시지를 넣으세요.
- 항상 한국어로 응답하세요.
- "교육했어", "교육 등록" → CREATE_EDUCATION
- "점검했어", "점검 등록" → CREATE_INSPECTION
- "현황", "조회", "목록" → QUERY_EDUCATION 또는 QUERY_INSPECTION`;

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

function detectIntentFromKeywords(message: string): string | null {
  const msg = message.toLowerCase();
  if (msg.includes("교육") && (msg.includes("현황") || msg.includes("조회") || msg.includes("목록") || msg.includes("몇"))) {
    return "QUERY_EDUCATION";
  }
  if (msg.includes("점검") && (msg.includes("현황") || msg.includes("조회") || msg.includes("목록") || msg.includes("몇"))) {
    return "QUERY_INSPECTION";
  }
  if (msg.includes("교육") && (msg.includes("했") || msg.includes("등록") || msg.includes("작성") || msg.includes("올려") || msg.includes("해줘"))) {
    return "CREATE_EDUCATION";
  }
  if (msg.includes("점검") && (msg.includes("했") || msg.includes("등록") || msg.includes("작성") || msg.includes("올려") || msg.includes("해줘"))) {
    return "CREATE_INSPECTION";
  }
  return null;
}

function extractTitleFromMessage(message: string): string {
  const patterns = [
    /안전보건점검의날/,
    /안전보건교육/,
    /정기안전교육/,
    /특별안전교육/,
    /수시교육/,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[0];
  }
  if (message.includes("교육")) return "안전교육";
  if (message.includes("점검")) return "안전점검";
  return "교육";
}

function buildConfirmationMessage(action: string, data: any): string {
  if (action === "CREATE_EDUCATION") {
    return `다음 내용으로 교육일지를 등록할까요?\n\n📋 제목: ${data.title || "미정"}\n📅 날짜: ${data.educationDate || "미정"}\n🏢 부서: ${data.department || "미정"}\n📝 유형: ${data.educationType || "정기교육"}\n👨‍🏫 교육자: ${data.instructor || "미정"}\n👥 인원: ${data.totalParticipants || 1}명\n\n수정이 필요하면 말씀해주세요! (예: "부서 포항운용팀으로", "인원 5명")`;
  }
  if (action === "CREATE_INSPECTION") {
    return `다음 내용으로 안전점검을 등록할까요?\n\n📋 유형: ${data.inspectionType || "안전점검"}\n📝 제목: ${data.title || "미정"}\n📅 날짜: ${data.inspectionDate || "미정"}\n👷 점검자: ${data.inspector || "미정"}\n\n수정이 필요하면 말씀해주세요!`;
  }
  return "";
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

        let parsed: any = null;

        try {
          const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: "system", content: SYSTEM_PROMPT },
            ...history.slice(-6).map((h) => ({
              role: h.role as "user" | "assistant",
              content: h.content,
            })),
            {
              role: "user",
              content: `${userContext}${photoContext}\n\n사용자 요청: ${message}`,
            },
          ];

          console.log("[Chatbot] Calling AI with message:", message);

          const response = await openai.chat.completions.create({
            model: "gpt-5-nano",
            messages: chatMessages,
            max_tokens: 1024,
            response_format: { type: "json_object" },
          });

          const aiContent = response.choices[0]?.message?.content || "";
          console.log("[Chatbot] AI response:", aiContent.substring(0, 500));

          if (aiContent) {
            try {
              parsed = JSON.parse(aiContent);
            } catch {
              console.log("[Chatbot] JSON parse failed, using keyword fallback");
            }
          }
        } catch (err: any) {
          console.error("[Chatbot] AI API error:", err.message);
        }

        if (!parsed || !parsed.action) {
          console.log("[Chatbot] Using keyword-based fallback for:", message);
          const detectedIntent = detectIntentFromKeywords(message);
          const title = extractTitleFromMessage(message);
          
          if (detectedIntent === "CREATE_EDUCATION") {
            parsed = {
              action: "CREATE_EDUCATION",
              data: {
                title,
                educationDate: today,
                department: user.department || "미지정",
                educationType: "정기교육",
                totalParticipants: 1,
                instructor: user.name || user.username,
                description: `${title} 교육 실시`,
              },
            };
          } else if (detectedIntent === "CREATE_INSPECTION") {
            parsed = {
              action: "CREATE_INSPECTION",
              data: {
                inspectionType: "안전점검",
                title,
                inspectionDate: today,
                inspector: user.name || user.username,
              },
            };
          } else if (detectedIntent === "QUERY_EDUCATION") {
            parsed = { action: "QUERY_EDUCATION", data: {} };
          } else if (detectedIntent === "QUERY_INSPECTION") {
            parsed = { action: "QUERY_INSPECTION", data: {} };
          } else {
            return res.json({
              message: "요청을 이해하지 못했습니다. 다음과 같은 요청을 해보세요:\n• \"오늘 안전보건점검의날 교육했어\"\n• \"교육 현황 알려줘\"\n• \"안전점검 등록해줘\"",
              action: "GENERAL_QUERY",
              actionResult: null,
              needsConfirmation: false,
              confirmData: null,
              uploadedImages,
            });
          }
        }

        if (parsed.action === "CREATE_EDUCATION") {
          if (!hasPermission(user, "registerEducation")) {
            return res.json({
              message: "교육일지 등록 권한이 없습니다. 관리자에게 문의해주세요.",
              action: "PERMISSION_DENIED",
              actionResult: null,
              needsConfirmation: false,
              confirmData: null,
              uploadedImages,
            });
          }
          const data = parsed.data || {};
          data.title = data.title || "교육";
          data.educationDate = data.educationDate || today;
          data.department = data.department || user.department || "미지정";
          data.educationType = data.educationType || "정기교육";
          data.instructor = data.instructor || user.name || user.username;
          data.totalParticipants = typeof data.totalParticipants === "number" ? data.totalParticipants : 1;

          console.log("[Chatbot] Asking confirmation for CREATE_EDUCATION:", JSON.stringify(data));
          return res.json({
            message: buildConfirmationMessage("CREATE_EDUCATION", data),
            action: "CREATE_EDUCATION",
            actionResult: null,
            needsConfirmation: true,
            confirmData: data,
            uploadedImages,
          });
        }

        if (parsed.action === "CREATE_INSPECTION") {
          if (!hasPermission(user, "editInspections")) {
            return res.json({
              message: "안전점검 등록 권한이 없습니다. 관리자에게 문의해주세요.",
              action: "PERMISSION_DENIED",
              actionResult: null,
              needsConfirmation: false,
              confirmData: null,
              uploadedImages,
            });
          }
          const data = parsed.data || {};
          data.inspectionType = data.inspectionType || "안전점검";
          data.title = data.title || "안전점검";
          data.inspectionDate = data.inspectionDate || today;
          data.inspector = data.inspector || user.name || user.username;

          console.log("[Chatbot] Asking confirmation for CREATE_INSPECTION:", JSON.stringify(data));
          return res.json({
            message: buildConfirmationMessage("CREATE_INSPECTION", data),
            action: "CREATE_INSPECTION",
            actionResult: null,
            needsConfirmation: true,
            confirmData: data,
            uploadedImages,
          });
        }

        if (parsed.action === "QUERY_EDUCATION") {
          try {
            const sessions = await storage.getEducationSessions(parsed.data?.department);
            const recentSessions = sessions.slice(0, 10);
            const summary = recentSessions.map((s) =>
              `• ${s.title} (${s.educationDate}) - ${s.department} [${s.status}]`
            ).join("\n");
            return res.json({
              message: recentSessions.length > 0
                ? `최근 교육 현황 (총 ${sessions.length}건):\n\n${summary}`
                : "등록된 교육이 없습니다.",
              action: "QUERY_EDUCATION",
              actionResult: { success: true, type: "education_query", count: sessions.length },
              needsConfirmation: false,
              confirmData: null,
              uploadedImages,
            });
          } catch {
            return res.json({
              message: "교육 현황 조회 중 오류가 발생했습니다.",
              action: "QUERY_EDUCATION",
              actionResult: null,
              needsConfirmation: false,
              confirmData: null,
              uploadedImages,
            });
          }
        }

        if (parsed.action === "QUERY_INSPECTION") {
          try {
            const inspections = await storage.getSafetyInspections();
            const recent = inspections.slice(0, 10);
            const summary = recent.map((i: any) =>
              `• ${i.title} (${i.inspectionDate}) - ${i.inspectionType} [${i.inspector}]`
            ).join("\n");
            return res.json({
              message: recent.length > 0
                ? `최근 안전점검 현황 (총 ${inspections.length}건):\n\n${summary}`
                : "등록된 점검이 없습니다.",
              action: "QUERY_INSPECTION",
              actionResult: { success: true, type: "inspection_query", count: inspections.length },
              needsConfirmation: false,
              confirmData: null,
              uploadedImages,
            });
          } catch {
            return res.json({
              message: "점검 현황 조회 중 오류가 발생했습니다.",
              action: "QUERY_INSPECTION",
              actionResult: null,
              needsConfirmation: false,
              confirmData: null,
              uploadedImages,
            });
          }
        }

        return res.json({
          message: parsed.message || "요청을 처리했습니다.",
          action: parsed.action || "GENERAL_QUERY",
          actionResult: null,
          needsConfirmation: false,
          confirmData: null,
          uploadedImages,
        });
      } catch (error: any) {
        console.error("[Chatbot] Unhandled error:", error);
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
        console.log("[Chatbot] Education confirmed and created, id:", result.actionResult.sessionId);
        return res.json({ success: true, message: result.message, sessionId: result.actionResult.sessionId });
      }

      if (action === "CREATE_INSPECTION") {
        if (!hasPermission(user, "editInspections")) {
          return res.status(403).json({ error: "안전점검 등록 권한이 없습니다" });
        }
        const result = await executeInspectionCreate(data, user, today, uploadedImages || []);
        console.log("[Chatbot] Inspection confirmed and created, id:", result.actionResult.inspectionId);
        return res.json({ success: true, message: result.message, inspectionId: result.actionResult.inspectionId });
      }

      res.status(400).json({ error: "지원하지 않는 액션입니다" });
    } catch (error: any) {
      console.error("[Chatbot] Confirm error:", error);
      res.status(500).json({ error: error.message });
    }
  });
}
