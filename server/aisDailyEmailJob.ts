/**
 * AIS 안전이행률 일일 보고 메일 자동 발송
 * 매일 09:30 KST에 전일자(어제) AIS 데이터를 집계하여
 * 지정된 수신자(GMAIL_RECIPIENTS)에게 자동 발송
 */
import cron from "node-cron";
import { storage } from "./storage";
import type { AisSafetyRecord, AisTbmBadNote } from "@shared/schema";

const AIS_DAILY_EMAIL_SETTING_KEY = "ais_daily_email_sent_date";

export interface AisDailyEmailStatus {
  lastRun: string | null;
  lastResult: "sent" | "no_data" | "error" | null;
  lastMessage: string | null;
  lastSentTo: string | null;
  lastRecordCount: number | null;
  nextRun: string;
  running: boolean;
  enabled: boolean;
}

const status: AisDailyEmailStatus = {
  lastRun: null,
  lastResult: null,
  lastMessage: null,
  lastSentTo: null,
  lastRecordCount: null,
  nextRun: "",
  running: false,
  enabled: true,
};

function computeNextRun(): string {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  const target = new Date(Date.UTC(
    kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(),
    0, 30, 0, 0 // 00:30 UTC = 09:30 KST
  ));
  if (now >= target) target.setUTCDate(target.getUTCDate() + 1);
  return target.toISOString();
}

export function getAisDailyEmailStatus(): AisDailyEmailStatus {
  return { ...status, nextRun: computeNextRun() };
}

function isCancelled(r: AisSafetyRecord): boolean {
  const s = (r.workStatus ?? "").trim();
  return s.includes("취소") || s === "중단" || s === "반납";
}

function isHighRiskWork(val: string | null | undefined): boolean {
  const v = (val ?? "").trim();
  return !!v && v !== "없음";
}

function formatDisplayDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m, 10)}월${parseInt(d, 10)}일`;
}

export function buildAisDailyReportHtml(targetDate: string, allRecords: AisSafetyRecord[], badNotes: AisTbmBadNote[]) {
  const displayDate = formatDisplayDate(targetDate);
  const dayRecords = allRecords.filter(r => r.startDate === targetDate && !isCancelled(r));
  const noteMap = new Map(badNotes.map(n => [n.recordId, n]));

  const teams = Array.from(new Set(dayRecords.map(r => r.team).filter(Boolean))) as string[];

  type TeamStat = { team: string; direct: number; contract: number; bad: number; total: number; rate: number };
  const teamStats: TeamStat[] = teams.map(team => {
    const tr = dayRecords.filter(r => r.team === team);
    const direct = tr.filter(r => (r.workType || "").includes("직영")).length;
    const contract = tr.filter(r => (r.workType || "").includes("도급")).length;
    const bad = tr.filter(r => r.tbmAiResult === "부적합").length;
    const total = tr.length;
    const rate = total > 0 ? Math.round((bad / total) * 1000) / 10 : 0;
    return { team, direct, contract, bad, total, rate };
  });

  const totalDirect = teamStats.reduce((s, t) => s + t.direct, 0);
  const totalContract = teamStats.reduce((s, t) => s + t.contract, 0);
  const totalBad = teamStats.reduce((s, t) => s + t.bad, 0);
  const totalAll = teamStats.reduce((s, t) => s + t.total, 0);
  const totalRate = totalAll > 0 ? Math.round((totalBad / totalAll) * 1000) / 10 : 0;

  const highRiskNoPermit = dayRecords.filter(r => isHighRiskWork(r.highRiskWork) && r.safetyPermit !== "Y");
  const tbmUnreg = dayRecords.filter(r => r.tbmResult === "미등록");
  const tbmBadRecords = dayRecords.filter(r => r.tbmAiResult === "부적합");

  const totalActive = dayRecords.length;
  const issueCount = highRiskNoPermit.length + tbmUnreg.length + tbmBadRecords.length;
  const passCount = totalActive * 3 - issueCount;
  const complianceRate = totalActive > 0 ? Math.round((passCount / (totalActive * 3)) * 100) : 100;

  const thStyle = `border:1px solid #999;padding:7px 10px;background:#f0f0f0;white-space:nowrap;font-size:13px;text-align:center;font-weight:bold`;
  const tdStyle = `border:1px solid #999;padding:7px 10px;font-size:13px;white-space:nowrap;text-align:center`;

  const teamHeaderRow = `<tr><th style="${thStyle}">구분</th>${teamStats.map(t => `<th style="${thStyle}">${t.team}</th>`).join("")}<th style="${thStyle}">합계</th></tr>`;
  const rowHtml = (label: string, values: (string | number)[], total: string | number) =>
    `<tr><td style="${tdStyle};background:#f7f7f7;font-weight:bold">${label}</td>${values.map(v => `<td style="${tdStyle}">${v}</td>`).join("")}<td style="${tdStyle};font-weight:bold">${total}</td></tr>`;

  const teamTableHtml = teamStats.length === 0 ? `<p style="font-size:13px;color:#888">${displayDate} 등록된 AIS 데이터가 없습니다.</p>` : [
    `<table style="border-collapse:collapse;border-spacing:0;font-family:맑은고딕,sans-serif;font-size:13px;background:#fff">`,
    `<thead>${teamHeaderRow}</thead>`,
    `<tbody>`,
    rowHtml("직영공사", teamStats.map(t => t.direct), totalDirect),
    rowHtml("도급공사", teamStats.map(t => t.contract), totalContract),
    rowHtml("TBM AI 부적합", teamStats.map(t => t.bad), totalBad),
    rowHtml("불량율", teamStats.map(t => `${t.rate}%`), `${totalRate}%`),
    `</tbody></table>`,
  ].join("\n");

  const issueItems: string[] = [];
  for (const r of highRiskNoPermit) {
    issueItems.push(`&nbsp;- ${displayDate} ${r.team || ""} ${r.workName || r.workLocation || ""} 고위험작업(${r.highRiskWork}) 안전허가서 미등록`);
  }
  for (const r of tbmUnreg) {
    issueItems.push(`&nbsp;- ${displayDate} ${r.team || ""} ${r.workName || r.workLocation || ""} TBM 활동 미등록`);
  }
  for (const r of tbmBadRecords) {
    const note = noteMap.get(r.id);
    const reason = note?.reason ? ` — ${note.reason}` : "";
    issueItems.push(`&nbsp;- ${displayDate} ${r.team || ""} ${r.workName || r.workLocation || ""} TBM AI 부적합 발생${reason}`);
  }

  const issuesHtml = issueItems.length
    ? issueItems.map(t => `<p style="margin:4px 0;font-family:맑은고딕,sans-serif;font-size:12pt;line-height:1.6">${t}</p>`).join("\n")
    : `<p style="margin:4px 0;font-family:맑은고딕,sans-serif;font-size:12pt;line-height:1.6">&nbsp;- 특이사항 없음</p>`;

  const p = (text: string, opts?: string) => `<p style="margin:3px 0;font-family:맑은고딕,sans-serif;font-size:12pt;line-height:1.6;${opts || ""}">${text}</p>`;

  const html = [
    `<div style="font-family:맑은고딕,sans-serif;font-size:12pt;line-height:1.6;color:#111">`,
    p("안녕하십니까."),
    p("사업지원팀입니다."),
    `<p style="margin:8px 0"></p>`,
    p(`All-in Safety TBM 이행 실적 및 AI 활용 결과(${displayDate})를 아래와 같이 공유드립니다.`),
    `<p style="margin:16px 0"></p>`,
    p(`전체 이행률: <b>${complianceRate}%</b> (총 ${totalActive}건 중 이슈 ${issueCount}건)`, "font-weight:bold"),
    `<p style="margin:16px 0"></p>`,
    `<p style="margin:8px 0 6px;font-family:맑은고딕,sans-serif;font-size:12pt;font-weight:bold">1. 운용팀별 TBM 활동 내역</p>`,
    `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">`,
    teamTableHtml,
    `</div>`,
    `<p style="margin:20px 0"></p>`,
    `<p style="margin:8px 0 6px;font-family:맑은고딕,sans-serif;font-size:12pt;font-weight:bold">2. 특이사항</p>`,
    issuesHtml,
    `<p style="margin:20px 0"></p>`,
    `<p style="margin:8px 0 6px;font-family:맑은고딕,sans-serif;font-size:12pt;font-weight:bold">3. 협조 요청사항</p>`,
    p("- TBM 활동 시 필수 항목(활선경보기, 검전기, 안전보호구 착용)이 누락되지 않게 철저한 관리 요청"),
    p("- 고위험작업 시 안전허가서 사전 등록 부탁드립니다."),
    `<p style="margin:16px 0"></p>`,
    p("감사합니다."),
    `</div>`,
  ].join("\n");

  const subject = `[공유] All-in Safety TBM 이행 실적 및 AI 활용 결과(${displayDate})`;
  return { subject, html };
}

function getTargetDate(): string {
  // 전일(어제) 기준 — 당일 09:30에 전일 데이터를 집계하여 발송
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  kstNow.setUTCDate(kstNow.getUTCDate() - 1);
  return kstNow.toISOString().slice(0, 10);
}

export async function generateAisDailyPreview(targetDate?: string) {
  const date = targetDate || getTargetDate();
  const [allRecords, badNotes] = await Promise.all([
    storage.getAllAisSafetyRecords(),
    storage.getAllAisTbmBadNotes(),
  ]);
  return buildAisDailyReportHtml(date, allRecords, badNotes);
}

export async function runAisDailyEmailJob(opts?: { force?: boolean }): Promise<void> {
  if (status.running) {
    console.log("[AisDailyEmail] 이미 실행 중 - 건너뜀");
    return;
  }

  const targetDate = getTargetDate();

  if (!opts?.force) {
    try {
      const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
      const todayKST = kstNow.toISOString().slice(0, 10);
      const lastSent = await storage.getSetting(AIS_DAILY_EMAIL_SETTING_KEY);
      if (lastSent?.value === todayKST) {
        console.log(`[AisDailyEmail] 오늘(${todayKST}) 이미 발송 완료 - 중복 방지로 건너뜀`);
        status.lastResult = "sent";
        status.lastMessage = `오늘(${todayKST}) 이미 발송 완료 (중복 방지)`;
        return;
      }
    } catch (settingErr) {
      console.warn("[AisDailyEmail] 발송일 확인 오류 (계속 진행):", settingErr);
    }
  }

  status.running = true;
  status.lastRun = new Date().toISOString();
  console.log(`[AisDailyEmail] AIS 일일 보고 메일 생성 시작 (대상일: ${targetDate})...`);

  try {
    const sender = process.env.GMAIL_SENDER;
    const appPassword = process.env.GMAIL_APP_PASSWORD;
    const recipientsRaw = process.env.GMAIL_RECIPIENTS;

    if (!sender || !appPassword || !recipientsRaw) {
      status.lastResult = "error";
      status.lastMessage = "GMAIL_SENDER / GMAIL_APP_PASSWORD / GMAIL_RECIPIENTS 환경변수가 설정되지 않았습니다.";
      console.error("[AisDailyEmail]", status.lastMessage);
      return;
    }

    const recipients = recipientsRaw.split(",").map(s => s.trim()).filter(Boolean);
    if (recipients.length === 0) {
      status.lastResult = "error";
      status.lastMessage = "GMAIL_RECIPIENTS에 유효한 수신자가 없습니다.";
      return;
    }

    const [allRecords, badNotes] = await Promise.all([
      storage.getAllAisSafetyRecords(),
      storage.getAllAisTbmBadNotes(),
    ]);

    const dayRecordCount = allRecords.filter(r => r.startDate === targetDate).length;
    const { subject, html } = buildAisDailyReportHtml(targetDate, allRecords, badNotes);

    const mobileReadyHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin:16px 20px; padding:0; font-family:맑은고딕,Arial,sans-serif; }
</style>
</head>
<body>
${html}
</body>
</html>`;

    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: sender, pass: appPassword },
    });

    await transporter.sendMail({
      from: `"사업지원팀" <${sender}>`,
      to: recipients.join(", "),
      subject,
      html: mobileReadyHtml,
    });

    status.lastResult = "sent";
    status.lastSentTo = recipients.join(", ");
    status.lastRecordCount = dayRecordCount;
    status.lastMessage = `${subject} → ${recipients.join(", ")} 발송 완료 (${dayRecordCount}건)`;
    console.log(`[AisDailyEmail] 발송 완료: ${subject} → ${recipients.join(", ")}`);

    try {
      const kstNow2 = new Date(Date.now() + 9 * 3600 * 1000);
      await storage.setSetting(AIS_DAILY_EMAIL_SETTING_KEY, kstNow2.toISOString().slice(0, 10));
    } catch (setErr) {
      console.warn("[AisDailyEmail] 발송일 기록 오류:", setErr);
    }
  } catch (e: any) {
    status.lastResult = "error";
    status.lastMessage = `오류: ${e.message}`;
    console.error("[AisDailyEmail] 자동 발송 오류:", e.message);
  } finally {
    status.running = false;
  }
}

// 매일 09:30 KST 자동 실행
cron.schedule(
  "30 9 * * *",
  () => {
    runAisDailyEmailJob().catch(console.error);
  },
  { timezone: "Asia/Seoul" }
);

console.log("[AisDailyEmail] AIS 일일 보고 메일 자동 발송 스케줄러 시작 (매일 09:30 KST)");
