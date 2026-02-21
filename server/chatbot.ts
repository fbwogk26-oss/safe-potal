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
5. CREATE_VEHICLE_LOG - 운행일지 등록
6. QUERY_VEHICLE_LOG - 운행일지 조회
7. QUERY_VEHICLE - 차량 정보 조회
8. CREATE_VEHICLE - 차량 등록
9. QUERY_EQUIPMENT - 안전용품/보호구 조회
10. CREATE_NOTICE - 공지사항/규정 등록
11. QUERY_NOTICE - 공지사항/규정 조회
12. QUERY_TEAM - 팀 안전점수 조회
13. MODIFY_PENDING - 확인 대기 중인 등록 내용 수정
14. GENERAL_QUERY - 일반 질의응답

중요 규칙:
- 반드시 JSON 형식으로만 응답하세요.
- 사용자가 이전에 등록 확인을 요청받은 상태(pendingConfirmation)에서 세부 정보를 수정하려는 경우, action을 "MODIFY_PENDING"으로 설정하고, data에 수정할 필드만 넣으세요.
  예: "부서 포항운용팀으로" → { "action": "MODIFY_PENDING", "data": { "department": "포항운용팀" } }
  예: "인원 5명으로" → { "action": "MODIFY_PENDING", "data": { "totalParticipants": 5 } }
  예: "날짜 2025-03-15로" → { "action": "MODIFY_PENDING", "data": { "educationDate": "2025-03-15" } }
  예: "출발지 대구로" → { "action": "MODIFY_PENDING", "data": { "departureLocation": "대구" } }
- 사용자의 대화 흐름을 이해하세요. "~로 바꿔줘", "~으로 변경", "~명으로", "~팀으로" 등의 수정 표현을 인식하세요.

부서 목록: ${DEPARTMENTS.join(", ")}

JSON 형식:
{
  "action": "액션명",
  "message": "한국어 메시지",
  "data": { ... }
}

CREATE_EDUCATION data: { "title", "educationDate", "department", "educationType", "totalParticipants", "instructor", "description" }
CREATE_INSPECTION data: { "inspectionType", "title", "inspectionDate", "inspector", "location", "workerName" }
CREATE_VEHICLE_LOG data: { "plateNumber", "driver", "logDate", "departureTime", "arrivalTime", "departureLocation", "arrivalLocation", "purpose" }
CREATE_VEHICLE data: { "plateNumber", "vehicleType", "model", "team", "driver", "status" }
CREATE_NOTICE data: { "category"("notice"|"rule"), "title", "content" }
QUERY 액션: data에 검색 조건 포함 가능 (department, team 등)

- 부서가 명시되지 않으면 사용자의 부서를 기본값으로 사용하세요.
- 항상 한국어로 응답하세요.`;

function detectModifyIntent(message: string): Record<string, any> | null {
  const msg = message.trim();
  const modifications: Record<string, any> = {};

  const deptMatch = msg.match(/(?:부서|팀)\s*(?:을|를)?\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|수정|해줘)?/);
  if (deptMatch) {
    const dept = deptMatch[1].trim();
    const found = DEPARTMENTS.find((d) => d.includes(dept));
    modifications.department = found || dept;
    modifications.team = found || dept;
  }

  const participantMatch = msg.match(/(?:인원|참석자|참가자)\s*(?:을|를)?\s*(\d+)\s*명/);
  if (participantMatch) {
    modifications.totalParticipants = parseInt(participantMatch[1]);
  }
  const numOnlyMatch = msg.match(/^(\d+)\s*명\s*(?:으로|로)?/);
  if (numOnlyMatch) {
    modifications.totalParticipants = parseInt(numOnlyMatch[1]);
  }

  const dateMatch = msg.match(/(?:날짜|일자)\s*(?:을|를)?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/);
  if (dateMatch) {
    modifications.educationDate = dateMatch[1].replace(/[./]/g, "-");
    modifications.inspectionDate = dateMatch[1].replace(/[./]/g, "-");
    modifications.logDate = dateMatch[1].replace(/[./]/g, "-");
  }

  const titleMatch = msg.match(/(?:제목|이름)\s*(?:을|를)?\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|수정|해줘)?/);
  if (titleMatch) {
    modifications.title = titleMatch[1].trim();
  }

  const instructorMatch = msg.match(/(?:교육자|강사|교관)\s*(?:을|를)?\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|수정)?/);
  if (instructorMatch) {
    modifications.instructor = instructorMatch[1].trim();
  }

  const inspectorMatch = msg.match(/(?:점검자)\s*(?:을|를)?\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|수정)?/);
  if (inspectorMatch) {
    modifications.inspector = inspectorMatch[1].trim();
  }

  const driverMatch = msg.match(/(?:운전자)\s*(?:을|를)?\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|수정)?/);
  if (driverMatch) {
    modifications.driver = driverMatch[1].trim();
  }

  const locationMatch = msg.match(/(?:출발지|출발)\s*(?:을|를)?\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|수정)?/);
  if (locationMatch) {
    modifications.departureLocation = locationMatch[1].trim();
  }

  const destMatch = msg.match(/(?:도착지|도착)\s*(?:을|를)?\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|수정)?/);
  if (destMatch) {
    modifications.arrivalLocation = destMatch[1].trim();
  }

  const purposeMatch = msg.match(/(?:목적|용도)\s*(?:을|를)?\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|수정)?/);
  if (purposeMatch) {
    modifications.purpose = purposeMatch[1].trim();
  }

  const typeMatch = msg.match(/(?:유형|종류|타입)\s*(?:을|를)?\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|수정)?/);
  if (typeMatch) {
    const val = typeMatch[1].trim();
    modifications.educationType = val;
    modifications.inspectionType = val;
  }

  const locationMatch2 = msg.match(/(?:장소|국소|위치)\s*(?:을|를)?\s*(.+?)(?:으로|로)\s*(?:변경|바꿔|수정)?/);
  if (locationMatch2) {
    modifications.location = locationMatch2[1].trim();
  }

  return Object.keys(modifications).length > 0 ? modifications : null;
}

function detectIntentFromKeywords(message: string): string | null {
  const msg = message.toLowerCase();

  if (msg.includes("교육") && (msg.includes("현황") || msg.includes("조회") || msg.includes("목록") || msg.includes("몇"))) return "QUERY_EDUCATION";
  if (msg.includes("점검") && (msg.includes("현황") || msg.includes("조회") || msg.includes("목록") || msg.includes("몇"))) return "QUERY_INSPECTION";
  if ((msg.includes("운행") || msg.includes("주행")) && (msg.includes("현황") || msg.includes("조회") || msg.includes("목록") || msg.includes("기록"))) return "QUERY_VEHICLE_LOG";
  if (msg.includes("차량") && (msg.includes("정보") || msg.includes("현황") || msg.includes("조회") || msg.includes("목록") || msg.includes("내 차"))) return "QUERY_VEHICLE";
  if ((msg.includes("안전용품") || msg.includes("보호구") || msg.includes("장비")) && (msg.includes("현황") || msg.includes("조회") || msg.includes("목록"))) return "QUERY_EQUIPMENT";
  if ((msg.includes("공지") || msg.includes("규정") || msg.includes("안전규정") || msg.includes("안전수칙")) && (msg.includes("조회") || msg.includes("알려") || msg.includes("뭐") || msg.includes("확인") || msg.includes("목록") || msg.includes("현황"))) return "QUERY_NOTICE";
  if ((msg.includes("팀") || msg.includes("점수") || msg.includes("순위") || msg.includes("안전점수")) && (msg.includes("현황") || msg.includes("조회") || msg.includes("알려") || msg.includes("몇"))) return "QUERY_TEAM";

  if (msg.includes("교육") && (msg.includes("했") || msg.includes("등록") || msg.includes("작성") || msg.includes("올려") || msg.includes("해줘"))) return "CREATE_EDUCATION";
  if (msg.includes("점검") && (msg.includes("했") || msg.includes("등록") || msg.includes("작성") || msg.includes("올려") || msg.includes("해줘"))) return "CREATE_INSPECTION";
  if ((msg.includes("운행") || msg.includes("주행") || msg.includes("출발")) && (msg.includes("등록") || msg.includes("작성") || msg.includes("올려") || msg.includes("했") || msg.includes("해줘") || msg.includes("기록"))) return "CREATE_VEHICLE_LOG";
  if ((msg.includes("공지") || msg.includes("규정")) && (msg.includes("등록") || msg.includes("작성") || msg.includes("올려") || msg.includes("해줘"))) return "CREATE_NOTICE";
  if (msg.includes("차량") && (msg.includes("등록") || msg.includes("추가"))) return "CREATE_VEHICLE";
  if ((msg.includes("안전용품") || msg.includes("보호구")) && (msg.includes("신청") || msg.includes("요청"))) return "QUERY_EQUIPMENT";
  if (msg.includes("공지") || msg.includes("규정") || msg.includes("안전수칙")) return "QUERY_NOTICE";
  return null;
}

function extractTitleFromMessage(message: string): string {
  const patterns = [/안전보건점검의날/, /안전보건교육/, /정기안전교육/, /특별안전교육/, /수시교육/];
  for (const p of patterns) { const m = message.match(p); if (m) return m[0]; }
  if (message.includes("교육")) return "안전교육";
  if (message.includes("점검")) return "안전점검";
  return "교육";
}

function buildConfirmationMessage(action: string, data: any): string {
  if (action === "CREATE_EDUCATION") {
    return `다음 내용으로 교육일지를 등록할까요?\n\n📋 제목: ${data.title || "미정"}\n📅 날짜: ${data.educationDate || "미정"}\n🏢 부서: ${data.department || "미정"}\n📝 유형: ${data.educationType || "정기교육"}\n👨‍🏫 교육자: ${data.instructor || "미정"}\n👥 인원: ${data.totalParticipants || 1}명\n\n수정이 필요하면 말씀해주세요! (예: "부서 포항운용팀으로", "인원 5명")`;
  }
  if (action === "CREATE_INSPECTION") {
    return `다음 내용으로 안전점검을 등록할까요?\n\n📋 유형: ${data.inspectionType || "안전점검"}\n📝 제목: ${data.title || "미정"}\n📅 날짜: ${data.inspectionDate || "미정"}\n👷 점검자: ${data.inspector || "미정"}${data.location ? `\n📍 장소: ${data.location}` : ""}\n\n수정이 필요하면 말씀해주세요!`;
  }
  if (action === "CREATE_VEHICLE_LOG") {
    return `다음 내용으로 운행일지를 등록할까요?\n\n🚗 차량번호: ${data.plateNumber || "자동 검색"}\n👤 운전자: ${data.driver || "미정"}\n📅 날짜: ${data.logDate || "미정"}\n🏢 팀: ${data.team || "자동"}${data.departureLocation ? `\n📍 출발지: ${data.departureLocation}` : ""}${data.arrivalLocation ? `\n📍 도착지: ${data.arrivalLocation}` : ""}${data.departureTime ? `\n🕐 출발시간: ${data.departureTime}` : ""}${data.arrivalTime ? `\n🕐 도착시간: ${data.arrivalTime}` : ""}${data.purpose ? `\n📝 목적: ${data.purpose}` : ""}\n\n수정이 필요하면 말씀해주세요!`;
  }
  if (action === "CREATE_NOTICE") {
    const catLabel = data.category === "rule" ? "규정" : "공지사항";
    return `다음 내용으로 ${catLabel}을 등록할까요?\n\n📢 유형: ${catLabel}\n📋 제목: ${data.title || "미정"}\n📝 내용: ${(data.content || "").substring(0, 100)}${(data.content || "").length > 100 ? "..." : ""}\n\n수정이 필요하면 말씀해주세요!`;
  }
  if (action === "CREATE_VEHICLE") {
    return `다음 내용으로 차량을 등록할까요?\n\n🚙 차량번호: ${data.plateNumber || "미정"}\n🏷️ 차종: ${data.vehicleType || "미정"}\n📋 모델: ${data.model || "미정"}\n🏢 팀: ${data.team || "미정"}\n👤 운전자: ${data.driver || "미정"}\n\n수정이 필요하면 말씀해주세요!`;
  }
  return "";
}

async function executeEducationCreate(data: any, user: any, today: string, uploadedImages: string[]) {
  const sessionData = {
    title: data.title || "교육",
    educationDate: data.educationDate || today,
    department: data.department || user.department || "미지정",
    educationType: data.educationType || "정기교육",
    instructor: data.instructor || user.name || user.username,
    totalParticipants: typeof data.totalParticipants === "number" ? data.totalParticipants : 1,
    description: data.description || "",
    images: uploadedImages,
    createdBy: user.username || user.name || "chatbot",
  };
  const created = await storage.createEducationSession(sessionData);
  return {
    actionResult: { success: true, type: "education_created", sessionId: created.id, data: sessionData },
    message: `교육일지가 등록되었습니다!\n\n📋 제목: ${sessionData.title}\n📅 날짜: ${sessionData.educationDate}\n🏢 부서: ${sessionData.department}\n👨‍🏫 교육자: ${sessionData.instructor}\n👥 인원: ${sessionData.totalParticipants}명${uploadedImages.length > 0 ? `\n📸 사진: ${uploadedImages.length}장` : ""}`,
  };
}

async function executeInspectionCreate(data: any, user: any, today: string, uploadedImages: string[]) {
  const inspectionData = {
    inspectionType: data.inspectionType || "안전점검",
    title: data.title || "안전점검",
    inspectionDate: data.inspectionDate || today,
    inspector: data.inspector || user.name || user.username,
    workerName: data.workerName || "",
    location: data.location || "",
    notes: data.notes || "",
    checklist: data.checklist || [],
    images: uploadedImages,
  };
  const created = await storage.createSafetyInspection(inspectionData);
  return {
    actionResult: { success: true, type: "inspection_created", inspectionId: created.id, data: inspectionData },
    message: `안전점검이 등록되었습니다!\n\n📋 유형: ${inspectionData.inspectionType}\n📅 날짜: ${inspectionData.inspectionDate}\n👷 점검자: ${inspectionData.inspector}${uploadedImages.length > 0 ? `\n📸 사진: ${uploadedImages.length}장` : ""}`,
  };
}

async function executeVehicleLogCreate(data: any, user: any, today: string) {
  let vehicleId = data.vehicleId;
  let plateNumber = data.plateNumber || "";
  let vehicleModel = data.vehicleModel || "";
  let team = data.team || user.department || "";

  if (plateNumber && !vehicleId) {
    const vehicles = await storage.getVehicles();
    const found = vehicles.find((v) => v.plateNumber.includes(plateNumber));
    if (found) { vehicleId = found.id; plateNumber = found.plateNumber; vehicleModel = found.model; team = found.team; }
  }

  if (!vehicleId) {
    const vehicles = await storage.getVehicles();
    const driverName = data.driver || user.name || user.username;
    const found = vehicles.find((v) => v.driver === driverName || v.secondDriver === driverName);
    if (found) { vehicleId = found.id; plateNumber = found.plateNumber; vehicleModel = found.model; team = found.team; }
  }

  if (!vehicleId) {
    throw new Error("차량을 찾을 수 없습니다. 차량번호를 알려주세요.");
  }

  const logData = {
    vehicleId, plateNumber, vehicleModel, team,
    driver: data.driver || user.name || user.username,
    logDate: data.logDate || today,
    departureTime: data.departureTime || "",
    arrivalTime: data.arrivalTime || "",
    departureLocation: data.departureLocation || "",
    arrivalLocation: data.arrivalLocation || "",
    purpose: data.purpose || "",
    beforeMileage: data.beforeMileage || 0,
    afterMileage: data.afterMileage || 0,
    notes: data.notes || "",
    createdBy: user.username || user.name || "chatbot",
  };

  const created = await storage.createVehicleLog(logData);
  return {
    actionResult: { success: true, type: "vehicle_log_created", logId: created.id, data: logData },
    message: `운행일지가 등록되었습니다!\n\n🚗 차량: ${plateNumber} (${vehicleModel})\n👤 운전자: ${logData.driver}\n📅 날짜: ${logData.logDate}\n🏢 팀: ${team}${logData.departureLocation ? `\n📍 출발: ${logData.departureLocation}` : ""}${logData.arrivalLocation ? `\n📍 도착: ${logData.arrivalLocation}` : ""}${logData.purpose ? `\n📝 목적: ${logData.purpose}` : ""}`,
  };
}

async function executeNoticeCreate(data: any, user: any) {
  const noticeData = {
    category: data.category || "notice",
    title: data.title || "공지사항",
    content: data.content || "",
    imageUrl: data.imageUrl || null,
  };
  const created = await storage.createNotice(noticeData);
  const catLabel = noticeData.category === "rule" ? "규정" : "공지사항";
  return {
    actionResult: { success: true, type: "notice_created", noticeId: created.id, data: noticeData },
    message: `${catLabel}이 등록되었습니다!\n\n📢 유형: ${catLabel}\n📋 제목: ${noticeData.title}\n📝 내용: ${noticeData.content.substring(0, 100)}${noticeData.content.length > 100 ? "..." : ""}`,
  };
}

async function executeVehicleCreate(data: any, user: any) {
  const vehicleData = {
    plateNumber: data.plateNumber || "",
    vehicleType: data.vehicleType || "승용",
    model: data.model || "",
    team: data.team || user.department || "",
    driver: data.driver || "",
    status: data.status || "운행중",
  };
  const created = await storage.createVehicle(vehicleData);
  return {
    actionResult: { success: true, type: "vehicle_created", vehicleId: created.id, data: vehicleData },
    message: `차량이 등록되었습니다!\n\n🚙 차량번호: ${vehicleData.plateNumber}\n🏷️ 차종: ${vehicleData.vehicleType}\n📋 모델: ${vehicleData.model}\n🏢 팀: ${vehicleData.team}\n👤 운전자: ${vehicleData.driver}`,
  };
}

export function registerChatbotRoutes(app: Express): void {
  app.post(
    "/api/chatbot/message",
    isAuthenticated,
    chatUpload.array("photos", 10),
    async (req: any, res) => {
      try {
        const { message, conversationHistory, pendingAction, pendingData } = req.body;
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

        let parsedPendingData: any = null;
        let parsedPendingAction: string | null = null;
        try {
          if (pendingData) parsedPendingData = JSON.parse(pendingData);
          if (pendingAction) parsedPendingAction = pendingAction;
        } catch {}

        if (parsedPendingAction && parsedPendingData) {
          const localMods = detectModifyIntent(message);
          if (localMods && Object.keys(localMods).length > 0) {
            const updatedData = { ...parsedPendingData, ...localMods };
            console.log("[Chatbot] Local modify detected:", localMods);
            return res.json({
              message: buildConfirmationMessage(parsedPendingAction, updatedData),
              action: parsedPendingAction,
              actionResult: null,
              needsConfirmation: true,
              confirmData: updatedData,
              uploadedImages: uploadedImages.length > 0 ? uploadedImages : (parsedPendingData._uploadedImages || []),
            });
          }
        }

        const userContext = `현재 사용자: ${user.name || user.username}, 부서: ${user.department || "미지정"}, 역할: ${user.role}, 오늘 날짜: ${today}`;
        const photoContext = uploadedImages.length > 0 ? `\n첨부된 사진 ${uploadedImages.length}장이 있습니다.` : "";
        const pendingContext = parsedPendingAction
          ? `\n현재 "${parsedPendingAction}" 등록 확인 대기 중입니다. 사용자가 세부 정보를 수정하려는 경우 MODIFY_PENDING으로 처리하세요. 대기중 데이터: ${JSON.stringify(parsedPendingData)}`
          : "";

        let history: { role: string; content: string }[] = [];
        try {
          if (conversationHistory) history = JSON.parse(conversationHistory);
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
              content: `${userContext}${photoContext}${pendingContext}\n\n사용자 요청: ${message}`,
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
            try { parsed = JSON.parse(aiContent); } catch {
              console.log("[Chatbot] JSON parse failed, using keyword fallback");
            }
          }
        } catch (err: any) {
          console.error("[Chatbot] AI API error:", err.message);
        }

        if (parsed?.action === "MODIFY_PENDING" && parsedPendingAction && parsedPendingData) {
          const updatedData = { ...parsedPendingData, ...(parsed.data || {}) };
          console.log("[Chatbot] AI modify detected:", parsed.data);
          return res.json({
            message: buildConfirmationMessage(parsedPendingAction, updatedData),
            action: parsedPendingAction,
            actionResult: null,
            needsConfirmation: true,
            confirmData: updatedData,
            uploadedImages: uploadedImages.length > 0 ? uploadedImages : (parsedPendingData._uploadedImages || []),
          });
        }

        if (!parsed || !parsed.action) {
          console.log("[Chatbot] Using keyword-based fallback for:", message);
          const detectedIntent = detectIntentFromKeywords(message);
          const title = extractTitleFromMessage(message);

          if (detectedIntent) {
            parsed = { action: detectedIntent, data: {} };
            if (detectedIntent === "CREATE_EDUCATION") {
              parsed.data = { title, educationDate: today, department: user.department || "미지정", educationType: "정기교육", totalParticipants: 1, instructor: user.name || user.username, description: `${title} 교육 실시` };
            } else if (detectedIntent === "CREATE_INSPECTION") {
              parsed.data = { inspectionType: "안전점검", title, inspectionDate: today, inspector: user.name || user.username };
            } else if (detectedIntent === "CREATE_VEHICLE_LOG") {
              parsed.data = { driver: user.name || user.username, logDate: today, team: user.department || "" };
            } else if (detectedIntent === "CREATE_NOTICE") {
              parsed.data = { category: "notice", title: "", content: "" };
            } else if (detectedIntent === "CREATE_VEHICLE") {
              parsed.data = { plateNumber: "", vehicleType: "승용", model: "", team: user.department || "", driver: "" };
            }
          } else {
            return res.json({
              message: "요청을 이해하지 못했습니다. 다음과 같은 요청을 해보세요:\n\n📚 \"교육 등록해줘\" / \"교육 현황 알려줘\"\n🔍 \"안전점검 등록\" / \"점검 현황 조회\"\n🚗 \"운행일지 작성\" / \"운행기록 조회\"\n📢 \"공지사항 등록\" / \"공지 조회\"\n🚙 \"차량 등록\" / \"차량 정보 조회\"\n🛡️ \"안전용품 현황 알려줘\"\n📊 \"팀 안전점수 조회\"",
              action: "GENERAL_QUERY", actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages,
            });
          }
        }

        const action = parsed.action;

        if (action === "CREATE_EDUCATION") {
          if (!hasPermission(user, "registerEducation")) {
            return res.json({ message: "교육일지 등록 권한이 없습니다.", action: "PERMISSION_DENIED", actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
          const data = parsed.data || {};
          data.title = data.title || "교육";
          data.educationDate = data.educationDate || today;
          data.department = data.department || user.department || "미지정";
          data.educationType = data.educationType || "정기교육";
          data.instructor = data.instructor || user.name || user.username;
          data.totalParticipants = typeof data.totalParticipants === "number" ? data.totalParticipants : 1;
          return res.json({ message: buildConfirmationMessage("CREATE_EDUCATION", data), action: "CREATE_EDUCATION", actionResult: null, needsConfirmation: true, confirmData: data, uploadedImages });
        }

        if (action === "CREATE_INSPECTION") {
          if (!hasPermission(user, "editInspections")) {
            return res.json({ message: "안전점검 등록 권한이 없습니다.", action: "PERMISSION_DENIED", actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
          const data = parsed.data || {};
          data.inspectionType = data.inspectionType || "안전점검";
          data.title = data.title || "안전점검";
          data.inspectionDate = data.inspectionDate || today;
          data.inspector = data.inspector || user.name || user.username;
          return res.json({ message: buildConfirmationMessage("CREATE_INSPECTION", data), action: "CREATE_INSPECTION", actionResult: null, needsConfirmation: true, confirmData: data, uploadedImages });
        }

        if (action === "CREATE_VEHICLE_LOG") {
          if (!hasPermission(user, "editVehicleLogs")) {
            return res.json({ message: "운행일지 등록 권한이 없습니다.", action: "PERMISSION_DENIED", actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
          const data = parsed.data || {};
          data.driver = data.driver || user.name || user.username;
          data.logDate = data.logDate || today;
          data.team = data.team || user.department || "";
          try {
            const vehicles = await storage.getVehicles();
            let foundVehicle = null;
            if (data.plateNumber) foundVehicle = vehicles.find((v) => v.plateNumber.includes(data.plateNumber));
            if (!foundVehicle) foundVehicle = vehicles.find((v) => v.driver === data.driver || v.secondDriver === data.driver);
            if (foundVehicle) {
              data.plateNumber = foundVehicle.plateNumber;
              data.vehicleModel = foundVehicle.model;
              data.team = foundVehicle.team;
              data.vehicleId = foundVehicle.id;
            }
          } catch {}
          return res.json({ message: buildConfirmationMessage("CREATE_VEHICLE_LOG", data), action: "CREATE_VEHICLE_LOG", actionResult: null, needsConfirmation: true, confirmData: data, uploadedImages });
        }

        if (action === "CREATE_NOTICE") {
          if (!hasPermission(user, "registerNotices")) {
            return res.json({ message: "공지사항 등록 권한이 없습니다.", action: "PERMISSION_DENIED", actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
          const data = parsed.data || {};
          data.category = data.category || "notice";
          data.title = data.title || "";
          data.content = data.content || "";
          if (!data.title) {
            return res.json({ message: "공지사항 제목과 내용을 알려주세요.\n\n예: \"공지사항 등록해줘, 제목: 안전교육 안내, 내용: 3월 15일 안전교육 실시 예정\"", action: "CREATE_NOTICE", actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
          return res.json({ message: buildConfirmationMessage("CREATE_NOTICE", data), action: "CREATE_NOTICE", actionResult: null, needsConfirmation: true, confirmData: data, uploadedImages });
        }

        if (action === "CREATE_VEHICLE") {
          if (!hasPermission(user, "editVehicles")) {
            return res.json({ message: "차량 등록 권한이 없습니다.", action: "PERMISSION_DENIED", actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
          const data = parsed.data || {};
          data.vehicleType = data.vehicleType || "승용";
          data.team = data.team || user.department || "";
          data.status = data.status || "운행중";
          if (!data.plateNumber) {
            return res.json({ message: "차량번호를 알려주세요.\n\n예: \"차량 등록해줘, 번호 12가3456, 모델 쏘나타, 팀 동대구운용팀\"", action: "CREATE_VEHICLE", actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
          return res.json({ message: buildConfirmationMessage("CREATE_VEHICLE", data), action: "CREATE_VEHICLE", actionResult: null, needsConfirmation: true, confirmData: data, uploadedImages });
        }

        if (action === "QUERY_EDUCATION") {
          try {
            const sessions = await storage.getEducationSessions(parsed.data?.department);
            const recent = sessions.slice(0, 10);
            const summary = recent.map((s) => `• ${s.title} (${s.educationDate}) - ${s.department} [${s.status}]`).join("\n");
            return res.json({ message: recent.length > 0 ? `📚 최근 교육 현황 (총 ${sessions.length}건):\n\n${summary}` : "등록된 교육이 없습니다.", action, actionResult: { success: true, type: "education_query", count: sessions.length }, needsConfirmation: false, confirmData: null, uploadedImages });
          } catch {
            return res.json({ message: "교육 현황 조회 중 오류가 발생했습니다.", action, actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
        }

        if (action === "QUERY_INSPECTION") {
          try {
            const inspections = await storage.getSafetyInspections();
            const recent = inspections.slice(0, 10);
            const summary = recent.map((i: any) => `• ${i.title} (${i.inspectionDate}) - ${i.inspectionType} [${i.inspector}]`).join("\n");
            return res.json({ message: recent.length > 0 ? `🔍 최근 안전점검 현황 (총 ${inspections.length}건):\n\n${summary}` : "등록된 점검이 없습니다.", action, actionResult: { success: true, type: "inspection_query", count: inspections.length }, needsConfirmation: false, confirmData: null, uploadedImages });
          } catch {
            return res.json({ message: "점검 현황 조회 중 오류가 발생했습니다.", action, actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
        }

        if (action === "QUERY_VEHICLE_LOG") {
          try {
            const logs = await storage.getVehicleLogs();
            const recent = logs.slice(0, 10);
            const summary = recent.map((l: any) => `• ${l.logDate} | ${l.plateNumber} (${l.vehicleModel}) | ${l.driver}${l.purpose ? ` | ${l.purpose}` : ""}`).join("\n");
            return res.json({ message: recent.length > 0 ? `🚗 최근 운행일지 (총 ${logs.length}건):\n\n${summary}` : "등록된 운행일지가 없습니다.", action, actionResult: { success: true, type: "vehicle_log_query", count: logs.length }, needsConfirmation: false, confirmData: null, uploadedImages });
          } catch {
            return res.json({ message: "운행일지 조회 중 오류가 발생했습니다.", action, actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
        }

        if (action === "QUERY_VEHICLE") {
          try {
            const vehicles = await storage.getVehicles();
            const searchTeam = parsed.data?.team || parsed.data?.department || user.department;
            let filtered = vehicles;
            if (searchTeam) {
              const tf = vehicles.filter((v) => v.team.includes(searchTeam));
              if (tf.length > 0) filtered = tf;
            }
            const recent = filtered.slice(0, 15);
            const summary = recent.map((v) => `• ${v.plateNumber} | ${v.model} | ${v.team} | ${v.driver || "-"}${v.secondDriver ? ` / ${v.secondDriver}` : ""} | ${v.status}`).join("\n");
            return res.json({ message: `🚙 차량 현황 (총 ${filtered.length}대):\n\n${summary}${filtered.length > 15 ? `\n\n... 외 ${filtered.length - 15}대` : ""}`, action, actionResult: { success: true, type: "vehicle_query", count: filtered.length }, needsConfirmation: false, confirmData: null, uploadedImages });
          } catch {
            return res.json({ message: "차량 정보 조회 중 오류가 발생했습니다.", action, actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
        }

        if (action === "QUERY_EQUIPMENT") {
          try {
            const equipmentList = await storage.getSafetyEquipment();
            const active = equipmentList.filter((e) => e.isActive);
            if (active.length > 0) {
              const summary = active.slice(0, 15).map((e) => `• ${e.name} [${e.category}]`).join("\n");
              return res.json({ message: `🛡️ 안전용품/보호구 목록 (총 ${active.length}개):\n\n${summary}${active.length > 15 ? `\n\n... 외 ${active.length - 15}개` : ""}`, action, actionResult: { success: true, type: "equipment_query", count: active.length }, needsConfirmation: false, confirmData: null, uploadedImages });
            }
            return res.json({ message: "등록된 안전용품이 없습니다.", action, actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          } catch {
            return res.json({ message: "안전용품 조회 중 오류가 발생했습니다.", action, actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
        }

        if (action === "QUERY_NOTICE") {
          try {
            let allNotices: any[] = [];
            for (const cat of ["notice", "rule"]) {
              const catNotices = await storage.getNotices(cat);
              allNotices = allNotices.concat(catNotices);
            }
            allNotices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const recent = allNotices.slice(0, 10);
            const summary = recent.map((n) => {
              const catLabel = n.category === "rule" ? "📜 규정" : "📢 공지";
              const date = new Date(n.createdAt).toLocaleDateString("ko-KR");
              return `${catLabel} ${n.title} (${date})`;
            }).join("\n");
            return res.json({ message: recent.length > 0 ? `📢 최근 공지/규정 (총 ${allNotices.length}건):\n\n${summary}` : "등록된 공지사항이 없습니다.", action, actionResult: { success: true, type: "notice_query", count: allNotices.length }, needsConfirmation: false, confirmData: null, uploadedImages });
          } catch {
            return res.json({ message: "공지사항 조회 중 오류가 발생했습니다.", action, actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
        }

        if (action === "QUERY_TEAM") {
          try {
            const teams = await storage.getTeams();
            teams.sort((a, b) => b.totalScore - a.totalScore);
            const summary = teams.slice(0, 15).map((t, idx) => `${idx + 1}. ${t.name}: ${t.totalScore}점`).join("\n");
            return res.json({ message: teams.length > 0 ? `📊 팀 안전점수 현황:\n\n${summary}` : "등록된 팀이 없습니다.", action, actionResult: { success: true, type: "team_query", count: teams.length }, needsConfirmation: false, confirmData: null, uploadedImages });
          } catch {
            return res.json({ message: "팀 점수 조회 중 오류가 발생했습니다.", action, actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages });
          }
        }

        return res.json({
          message: parsed.message || "요청을 처리했습니다.",
          action: parsed.action || "GENERAL_QUERY",
          actionResult: null, needsConfirmation: false, confirmData: null, uploadedImages,
        });
      } catch (error: any) {
        console.error("[Chatbot] Unhandled error:", error);
        res.status(500).json({ message: "죄송합니다, 요청 처리 중 오류가 발생했습니다. 다시 시도해주세요.", error: error.message });
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
        if (!hasPermission(user, "registerEducation")) return res.status(403).json({ error: "교육일지 등록 권한이 없습니다" });
        const result = await executeEducationCreate(data, user, today, uploadedImages || []);
        return res.json({ success: true, message: result.message, sessionId: result.actionResult.sessionId });
      }

      if (action === "CREATE_INSPECTION") {
        if (!hasPermission(user, "editInspections")) return res.status(403).json({ error: "안전점검 등록 권한이 없습니다" });
        const result = await executeInspectionCreate(data, user, today, uploadedImages || []);
        return res.json({ success: true, message: result.message, inspectionId: result.actionResult.inspectionId });
      }

      if (action === "CREATE_VEHICLE_LOG") {
        if (!hasPermission(user, "editVehicleLogs")) return res.status(403).json({ error: "운행일지 등록 권한이 없습니다" });
        const result = await executeVehicleLogCreate(data, user, today);
        return res.json({ success: true, message: result.message, logId: result.actionResult.logId });
      }

      if (action === "CREATE_NOTICE") {
        if (!hasPermission(user, "registerNotices")) return res.status(403).json({ error: "공지사항 등록 권한이 없습니다" });
        const result = await executeNoticeCreate(data, user);
        return res.json({ success: true, message: result.message, noticeId: result.actionResult.noticeId });
      }

      if (action === "CREATE_VEHICLE") {
        if (!hasPermission(user, "editVehicles")) return res.status(403).json({ error: "차량 등록 권한이 없습니다" });
        const result = await executeVehicleCreate(data, user);
        return res.json({ success: true, message: result.message, vehicleId: result.actionResult.vehicleId });
      }

      res.status(400).json({ error: "지원하지 않는 액션입니다" });
    } catch (error: any) {
      console.error("[Chatbot] Confirm error:", error);
      res.status(500).json({ error: error.message });
    }
  });
}
