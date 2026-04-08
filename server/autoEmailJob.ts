/**
 * 스피드이엔지 작업일정 이메일 자동 감지 → 자동 발송
 * 평일(월~금) 17:00 KST에 Gmail INBOX를 확인하여
 * 오늘 수신된 스피드이엔지 메일이 있으면 AI 파싱 후 jaeha.ryu@ktmos.co.kr로 자동 발송
 */
import cron from "node-cron";

const GMAIL_USER = "fbwogk26@gmail.com";
const AUTO_SEND_TO = "jaeha.ryu@ktmos.co.kr";
const SPEED_ENG_KEYWORD = "스피드이엔지";

export interface AutoJobStatus {
  lastRun: string | null;
  lastResult: "sent" | "not_found" | "error" | null;
  lastMessage: string | null;
  lastSentTo: string | null;
  lastItemCount: number | null;
  nextRun: string;
  running: boolean;
  enabled: boolean;
}

const status: AutoJobStatus = {
  lastRun: null,
  lastResult: null,
  lastMessage: null,
  lastSentTo: null,
  lastItemCount: null,
  nextRun: "",
  running: false,
  enabled: true,
};

function computeNextRun(): string {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  const target = new Date(Date.UTC(
    kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(),
    8, 0, 0, 0 // 08:00 UTC = 17:00 KST
  ));
  if (now >= target) target.setUTCDate(target.getUTCDate() + 1);
  while (target.getUTCDay() === 0 || target.getUTCDay() === 6) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.toISOString();
}

export function getAutoJobStatus(): AutoJobStatus {
  return { ...status, nextRun: computeNextRun() };
}

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
            .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
            .replace(/\s{2,}/g, " ").trim();
        }
        if (decoded.length > 30) texts.push(decoded);
      } catch {}
    } else if (headerBlock.includes("text/plain") || headerBlock.includes("text/html")) {
      let text = body;
      if (headerBlock.includes("text/html")) {
        text = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
      if (text.length > 30) texts.push(text);
    }
  }
  if (texts.length === 0) {
    const fallback = raw.replace(/^[^\n]*\n/gm, l => l.includes(":") ? "" : l)
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (fallback.length > 30) texts.push(fallback);
  }
  return texts.join("\n\n");
}

function stripPhoneNumbers(text: string): string {
  return text.replace(/\d{2,4}-\d{3,4}-\d{4}/g, "")
    .replace(/\d{10,11}/g, "").replace(/\s{2,}/g, " ").trim();
}

function buildSubcontractHtml(displayDate: string, company: string, items: any[], guideB64: string): string {
  const thStyle = `border:1px solid #999;padding:7px 10px;background:#f0f0f0;white-space:nowrap;font-size:13px;text-align:center;font-weight:bold`;
  const tdStyle = `border:1px solid #999;padding:7px 10px;font-size:13px;white-space:nowrap`;
  const cols = ["부서", "작업자(협력사)", "공사내용", "작업시작", "작업종료", "국소명", "주소", "MOS감독자"];
  const theadHtml = `<tr>${cols.map(c => `<th style="${thStyle}">${c}</th>`).join("")}</tr>`;
  const tbodyHtml = items.map((item: any) => {
    const [startTime = "", endTime = ""] = (item.time || "~").split("~");
    const region = (item.region || "").trim();
    const regionLabel = region ? (region.endsWith("운용팀") ? region : `${region}운용팀`) : "";
    const workersClean = (item.workers || []).map((w: string) => stripPhoneNumbers(w)).filter(Boolean).join("<br>");
    const supervisorClean = stripPhoneNumbers(item.supervisor || "");
    const cells = [regionLabel, workersClean, item.workType || "", startTime.trim(), endTime.trim(), item.locationName || "", item.address || "", supervisorClean];
    return `<tr>${cells.map(c => `<td style="${tdStyle}">${c}</td>`).join("")}</tr>`;
  }).join("");
  const imgHtml = guideB64
    ? `<br><br><div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><img src="data:image/jpeg;base64,${guideB64}" style="min-width:700px;max-width:900px;width:100%;border:1px solid #ddd;display:block" alt="TBM 가이드" /></div>`
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
    `<table style="border-collapse:collapse;border-spacing:0;font-family:맑은고딕,sans-serif;font-size:13px;background:#fff">`,
    `<thead>${theadHtml}</thead><tbody>${tbodyHtml}</tbody>`,
    `</table></div>`,
    imgHtml,
    `</div>`,
  ].join("\n");
}

export async function runSpeedEngAutoJob(): Promise<void> {
  if (status.running) {
    console.log("[AutoEmail] 이미 실행 중 - 건너뜀");
    return;
  }
  status.running = true;
  status.lastRun = new Date().toISOString();
  console.log("[AutoEmail] 스피드이엔지 작업일정 메일 자동 확인 시작...");

  try {
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    let targetUid: number | null = null;
    let targetSubject = "";

    try {
      const total = (client.mailbox as any).exists as number;
      if (total > 0) {
        // 오늘 날짜 (KST 기준)
        const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
        const todayKST = kstNow.toISOString().slice(0, 10);

        const start = Math.max(1, total - 99);
        for await (const msg of client.fetch(`${start}:${total}`, { envelope: true, uid: true })) {
          const subject = msg.envelope?.subject || "";
          const fromAddr = msg.envelope?.from?.[0]?.address || "";
          const fromName = msg.envelope?.from?.[0]?.name || "";
          const msgDate = msg.envelope?.date;
          if (!msgDate) continue;

          // 수신일을 KST로 변환하여 오늘인지 확인
          const msgKST = new Date(new Date(msgDate).getTime() + 9 * 3600 * 1000);
          const msgDateKST = msgKST.toISOString().slice(0, 10);

          const isToday = msgDateKST === todayKST;
          const isSpeedEng =
            subject.includes(SPEED_ENG_KEYWORD) ||
            fromAddr.toLowerCase().includes("speed") ||
            fromName.includes(SPEED_ENG_KEYWORD) ||
            subject.includes("작업일정") ||
            subject.includes("작업 일정");

          if (isToday && isSpeedEng) {
            targetUid = msg.uid;
            targetSubject = subject;
            console.log(`[AutoEmail] 대상 메일 발견: "${subject}" (UID: ${msg.uid}, 날짜: ${msgDateKST})`);
            break;
          }
        }
      }
    } finally {
      lock.release();
    }

    if (!targetUid) {
      await client.logout();
      status.lastResult = "not_found";
      status.lastMessage = `오늘(${new Date().toLocaleDateString("ko-KR")}) 스피드이엔지 메일 없음 — 발송 생략`;
      console.log("[AutoEmail] 스피드이엔지 메일 없음. 발송 생략.");
      return;
    }

    // 메일 원본 내용 가져오기
    const lock2 = await client.getMailboxLock("INBOX");
    let rawBuffer: Buffer | null = null;
    try {
      const msg = await client.fetchOne(`${targetUid}`, { source: true }, { uid: true });
      rawBuffer = msg.source as Buffer;
    } finally {
      lock2.release();
    }
    await client.logout();

    if (!rawBuffer) {
      status.lastResult = "error";
      status.lastMessage = "메일 원본을 가져올 수 없습니다.";
      return;
    }

    const emailText = extractEmlText(rawBuffer);
    if (!emailText || emailText.trim().length < 20) {
      status.lastResult = "error";
      status.lastMessage = "이메일 내용 추출 실패";
      return;
    }

    // GPT-4o로 작업 정보 파싱
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

    const aiRes = await aiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `다음 하도급 업체 작업일정 이메일을 파싱해주세요:\n\n${emailText.slice(0, 8000)}` },
      ],
      temperature: 0,
      max_tokens: 3000,
    });

    const rawJson = aiRes.choices[0].message.content?.trim() || "{}";
    let parsed: any = {};
    try {
      const cleaned = rawJson.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      status.lastResult = "error";
      status.lastMessage = "AI 파싱 실패";
      return;
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

    const company = parsed.company || "스피드이엔지";
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

    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: '"현장경영팀" <fbwogk26@gmail.com>',
      to: AUTO_SEND_TO,
      subject,
      html: mobileReadyHtml,
    });

    status.lastResult = "sent";
    status.lastSentTo = AUTO_SEND_TO;
    status.lastItemCount = items.length;
    status.lastMessage = `[${targetSubject}] → ${items.length}건 파싱 → ${AUTO_SEND_TO} 발송 완료`;
    console.log(`[AutoEmail] 발송 완료: ${subject} → ${AUTO_SEND_TO} (${items.length}건)`);

  } catch (e: any) {
    status.lastResult = "error";
    status.lastMessage = `오류: ${e.message}`;
    console.error("[AutoEmail] 자동 발송 오류:", e.message);
  } finally {
    status.running = false;
  }
}

// 평일(월~금) 17:00 KST 자동 실행
cron.schedule(
  "0 17 * * 1-5",
  () => {
    runSpeedEngAutoJob().catch(console.error);
  },
  { timezone: "Asia/Seoul" }
);

console.log("[AutoEmail] 스피드이엔지 자동 발송 스케줄러 시작 (평일 17:00 KST)");
