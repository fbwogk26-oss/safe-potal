/**
 * AIS 안전이행률 일일 보고 메일 자동 발송
 * 매일 09:30 KST에 실행되며, 대상월(전일이 속한 달) 1일부터 전일까지
 * 월 누적 데이터를 집계하여 지정된 수신자(GMAIL_RECIPIENTS)에게 자동 발송
 */
import cron from "node-cron";
import { storage } from "./storage";
import type { AisSafetyRecord, AisTbmBadNote } from "@shared/schema";

const AIS_DAILY_EMAIL_SETTING_KEY = "ais_daily_email_sent_date";
const AIS_DAILY_EMAIL_RECIPIENTS_KEY = "ais_daily_email_recipients";

export async function getAisDailyEmailRecipients(): Promise<string> {
  try {
    const setting = await storage.getSetting(AIS_DAILY_EMAIL_RECIPIENTS_KEY);
    if (setting?.value && setting.value.trim()) return setting.value.trim();
  } catch (e) {
    console.warn("[AisDailyEmail] 수신자 설정 조회 오류:", e);
  }
  return (process.env.GMAIL_RECIPIENTS || "").trim();
}

export async function setAisDailyEmailRecipients(value: string): Promise<string> {
  const cleaned = value
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .join(", ");
  await storage.setSetting(AIS_DAILY_EMAIL_RECIPIENTS_KEY, cleaned);
  return cleaned;
}

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

function getMonthStart(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  return `${y}-${m}-01`;
}

function getMonthRangeDates(targetDate: string): string[] {
  const monthStart = getMonthStart(targetDate);
  const dates: string[] = [];
  const cursor = new Date(`${monthStart}T00:00:00Z`);
  const end = new Date(`${targetDate}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function buildAisDailyReportHtml(targetDate: string, allRecords: AisSafetyRecord[], badNotes: AisTbmBadNote[]) {
  const displayDate = formatDisplayDate(targetDate);
  const monthStart = getMonthStart(targetDate);
  const monthDates = getMonthRangeDates(targetDate);
  const periodLabel = monthDates.length > 1 ? `${formatDisplayDate(monthStart)}~${displayDate} 누적` : `${displayDate}`;
  const dayRecords = allRecords.filter(r => r.startDate && r.startDate >= monthStart && r.startDate <= targetDate && !isCancelled(r));
  const noteMap = new Map(badNotes.map(n => [n.recordId, n]));

  // 소명완료된 레코드 ID (같은 workOrderNo 레코드도 포함) — 부적합(평가대상) 집계에서 제외
  const justifiedRecordIds = new Set<number>();
  for (const n of badNotes) {
    if (n.justificationStatus === "소명완료") {
      justifiedRecordIds.add(n.recordId);
      const rec = allRecords.find(r => r.id === n.recordId);
      if (rec?.workOrderNo) {
        allRecords.filter(r => r.workOrderNo === rec.workOrderNo).forEach(r => justifiedRecordIds.add(r.id));
      }
    }
  }

  const teams = Array.from(new Set(dayRecords.map(r => r.team).filter(Boolean))) as string[];

  type TeamStat = { team: string; direct: number; contract: number; bad: number; badEval: number; total: number; rate: number };
  const teamStats: TeamStat[] = teams.map(team => {
    const tr = dayRecords.filter(r => r.team === team);
    const direct = tr.filter(r => (r.workType || "").includes("직영")).length;
    const contract = tr.filter(r => (r.workType || "").includes("도급")).length;
    const bad = tr.filter(r => r.tbmAiResult === "부적합").length;
    const badEval = tr.filter(r => r.tbmAiResult === "부적합" && !justifiedRecordIds.has(r.id)).length;
    const total = tr.length;
    const rate = total > 0 ? Math.round((badEval / total) * 1000) / 10 : 0;
    return { team, direct, contract, bad, badEval, total, rate };
  });

  const totalDirect = teamStats.reduce((s, t) => s + t.direct, 0);
  const totalContract = teamStats.reduce((s, t) => s + t.contract, 0);
  const totalBad = teamStats.reduce((s, t) => s + t.bad, 0);
  const totalBadEval = teamStats.reduce((s, t) => s + t.badEval, 0);
  const totalAll = teamStats.reduce((s, t) => s + t.total, 0);
  const totalRate = totalAll > 0 ? Math.round((totalBadEval / totalAll) * 1000) / 10 : 0;

  const highRiskNoPermit = dayRecords.filter(r => isHighRiskWork(r.highRiskWork) && r.safetyPermit !== "Y");
  const tbmUnreg = dayRecords.filter(r => r.tbmResult === "미등록");
  const tbmBadRecords = dayRecords.filter(r => r.tbmAiResult === "부적합");
  const tbmBadEvalRecords = tbmBadRecords.filter(r => !justifiedRecordIds.has(r.id));
  const tbmBadJustifiedRecords = tbmBadRecords.filter(r => justifiedRecordIds.has(r.id));

  const totalActive = dayRecords.length;
  const issueCount = highRiskNoPermit.length + tbmUnreg.length + tbmBadEvalRecords.length;
  const passCount = totalActive * 3 - issueCount;
  const complianceRate = totalActive > 0 ? Math.round((passCount / (totalActive * 3)) * 100) : 100;

  // ── 안전허가서 매칭 (고위험작업 대상) ──
  const highRiskRecords = dayRecords.filter(r => isHighRiskWork(r.highRiskWork));
  const permitPass = highRiskRecords.filter(r => r.safetyPermit === "Y").length;
  const permitFail = highRiskRecords.length - permitPass;
  const permitRate = highRiskRecords.length > 0 ? Math.round((permitPass / highRiskRecords.length) * 100) : 100;

  // ── TBM 이행률 (등록 AND AI적합을 모두 충족해야 순수 이행, 소명완료는 대체 충족) ──
  const tbmBase = dayRecords;
  const tbmPurePass = tbmBase.filter(r => r.tbmResult === "등록" && r.tbmAiResult === "적합").length;
  const tbmJustified = tbmBase.filter(r =>
    !(r.tbmResult === "등록" && r.tbmAiResult === "적합") &&
    (r.tbmResult === "등록" || justifiedRecordIds.has(r.id)) &&
    (r.tbmAiResult === "적합" || justifiedRecordIds.has(r.id))
  ).length;
  const tbmPending = tbmBase.filter(r =>
    !(r.tbmResult === "등록" && r.tbmAiResult === "적합") &&
    !((r.tbmResult === "등록" || justifiedRecordIds.has(r.id)) && (r.tbmAiResult === "적합" || justifiedRecordIds.has(r.id))) &&
    r.tbmResult === "등록" &&
    (!r.tbmAiResult || r.tbmAiResult === "분석전" || r.tbmAiResult === "분석중")
  ).length;
  const tbmFail = Math.max(0, tbmBase.length - tbmPurePass - tbmJustified - tbmPending);
  const tbmImplRate = tbmBase.length > 0 ? Math.round(((tbmPurePass + tbmJustified) / tbmBase.length) * 100) : 100;

  // ── 시각적 가독성 개선 스타일 (한 단계 축소된 폰트 사이즈) ──
  const ACCENT = "#2563eb";
  const ACCENT_DARK = "#1e3a8a";
  const shortTeam = (t: string | null | undefined): string => (t || "").replace(/운용팀$/, "T");
  const thStyle = `border:1px solid #cbd5e1;padding:7px 10px;background:${ACCENT};color:#ffffff;white-space:nowrap;font-size:12px;text-align:center;font-weight:700;letter-spacing:0.2px`;
  const tdStyle = (bg: string) => `border:1px solid #dbe3ef;padding:7px 10px;font-size:12px;white-space:nowrap;text-align:center;background:${bg}`;

  const teamHeaderRow = `<tr><th style="${thStyle}">구분</th>${teamStats.map(t => `<th style="${thStyle}">${shortTeam(t.team)}</th>`).join("")}<th style="${thStyle};background:${ACCENT_DARK}">합계</th></tr>`;
  const rowHtml = (label: string, values: (string | number)[], total: string | number, opts?: { rowBg?: string; highlight?: boolean }) => {
    const rowBg = opts?.rowBg ?? "#ffffff";
    const cellStyle = tdStyle(rowBg);
    const valueCell = opts?.highlight
      ? `border:1px solid #fca5a5;padding:7px 10px;font-size:12px;white-space:nowrap;text-align:center;background:#fef2f2;color:#dc2626;font-weight:700`
      : cellStyle;
    const labelCellStyle = `border:1px solid #dbe3ef;padding:7px 10px;font-size:12px;white-space:nowrap;text-align:left;background:#eff4fc;font-weight:700;color:${ACCENT_DARK}`;
    return `<tr><td style="${labelCellStyle}">${label}</td>${values.map(v => `<td style="${valueCell}">${v}</td>`).join("")}<td style="border:1px solid #cbd5e1;padding:7px 10px;font-size:12px;white-space:nowrap;text-align:center;background:#e2e8f0;font-weight:800">${total}</td></tr>`;
  };

  const teamTableHtml = teamStats.length === 0 ? `<p style="font-size:12px;color:#888">${periodLabel} 등록된 AIS 데이터가 없습니다.</p>` : [
    `<table style="border-collapse:collapse;border-spacing:0;font-family:맑은고딕,sans-serif;font-size:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.08)">`,
    `<thead>${teamHeaderRow}</thead>`,
    `<tbody>`,
    rowHtml("직영공사", teamStats.map(t => t.direct), totalDirect),
    rowHtml("도급공사", teamStats.map(t => t.contract), totalContract, { rowBg: "#f8fafc" }),
    rowHtml("TBM AI 부적합", teamStats.map(t => t.bad), totalBad),
    rowHtml("부적합(평가대상)", teamStats.map(t => t.badEval), totalBadEval, { rowBg: "#fef2f2", highlight: true }),
    rowHtml("불량율", teamStats.map(t => `${t.rate}%`), `${totalRate}%`, { rowBg: "#f8fafc" }),
    `</tbody></table>`,
    `<p style="margin:6px 2px 0;font-size:10px;color:#64748b;font-family:맑은고딕,sans-serif">※ 부적합(평가대상)은 TBM AI 부적합 건 중 소명완료 처리된 건을 제외한 실제 평가 대상 건수입니다.</p>`,
  ].join("\n");

  // ── 특이사항: 팀별로 묶어서 팀명 중복 없이 표시 ──
  type TeamIssue = { icon: string; label: string; color: string; detail: string };
  type TeamGroup = { team: string; issues: TeamIssue[] };
  const buildTeamGroupsForDate = (dateStr: string): TeamGroup[] => {
    const order: string[] = [];
    const map = new Map<string, TeamIssue[]>();
    const push = (rawTeam: string | null | undefined, issue: TeamIssue) => {
      const team = shortTeam(rawTeam) || "미지정";
      if (!map.has(team)) { map.set(team, []); order.push(team); }
      map.get(team)!.push(issue);
    };
    for (const r of highRiskNoPermit.filter(r => r.startDate === dateStr)) {
      push(r.team, { icon: "⚠", label: "고위험작업 안전허가서 미등록", color: "#dc2626", detail: `${r.workName || r.workLocation || ""} (${r.highRiskWork})` });
    }
    for (const r of tbmUnreg.filter(r => r.startDate === dateStr)) {
      push(r.team, { icon: "⚠", label: "TBM 활동 미등록", color: "#d97706", detail: `${r.workName || r.workLocation || ""}` });
    }
    for (const r of tbmBadEvalRecords.filter(r => r.startDate === dateStr)) {
      const note = noteMap.get(r.id);
      const reason = note?.reason ? ` — ${note.reason}` : "";
      push(r.team, { icon: "⚠", label: "TBM AI 부적합 발생", color: "#ea580c", detail: `${r.workName || r.workLocation || ""}${reason}` });
    }
    for (const r of tbmBadJustifiedRecords.filter(r => r.startDate === dateStr)) {
      const note = noteMap.get(r.id);
      const reason = note?.reason ? ` — ${note.reason}` : "";
      const justReason = note?.justificationReason ? ` (소명사유: ${note.justificationReason})` : "";
      push(r.team, { icon: "✅", label: "TBM AI 부적합 (소명완료)", color: "#16a34a", detail: `${r.workName || r.workLocation || ""}${reason}${justReason}` });
    }
    return order.map(team => ({ team, issues: map.get(team)! }));
  };

  const issuesHtml = monthDates.map(dateStr => {
    const groups = buildTeamGroupsForDate(dateStr);
    const label = formatDisplayDate(dateStr);
    const bodyHtml = groups.length
      ? groups.map(g => `<div style="margin:0 0 6px;padding:6px 8px;background:#f1f5f9;border:1px solid #dbe3ef;border-radius:5px">` +
          `<p style="margin:0 0 3px;font-family:맑은고딕,sans-serif;font-size:11px;font-weight:800;color:${ACCENT_DARK}">${g.team} (${g.issues.length}건)</p>` +
          g.issues.map(i => `<p style="margin:1px 0;padding-left:10px;font-family:맑은고딕,sans-serif;font-size:11px;line-height:1.5;color:#334155"><span style="color:${i.color};font-weight:700">${i.icon} ${i.label}</span> — ${i.detail}</p>`).join("\n") +
          `</div>`).join("\n")
      : `<p style="margin:0;font-family:맑은고딕,sans-serif;font-size:11pt;line-height:1.6;color:#16a34a;font-weight:700">✅ 특이사항 없음</p>`;
    const border = groups.length ? "#e2e8f0" : "#bbf7d0";
    const bg = groups.length ? "#f8fafc" : "#f0fdf4";
    return `<div style="border:1px solid ${border};background:${bg};border-radius:6px;padding:9px 12px;margin-bottom:7px">` +
      `<p style="margin:0 0 6px;font-family:맑은고딕,sans-serif;font-size:11.5px;font-weight:800;color:${ACCENT_DARK}">${label}</p>` +
      bodyHtml +
      `</div>`;
  }).join("\n");

  const permitRateColor = permitRate >= 90 ? "#16a34a" : permitRate >= 70 ? "#d97706" : "#dc2626";
  const tbmRateColor = tbmImplRate >= 90 ? "#16a34a" : tbmImplRate >= 70 ? "#d97706" : "#dc2626";
  const rateColor = complianceRate >= 90 ? "#16a34a" : complianceRate >= 70 ? "#d97706" : "#dc2626";

  const p = (text: string, opts?: string) => `<p style="margin:3px 0;font-family:맑은고딕,sans-serif;font-size:11pt;line-height:1.6;${opts || ""}">${text}</p>`;

  const kpiBox = (title: string, rate: number, color: string, subtitle: string) => `
<div style="flex:1;min-width:0;background:${color};color:#fff;border-radius:6px;padding:9px 12px">
<p style="margin:0;font-family:맑은고딕,sans-serif;font-size:9.5pt;opacity:0.9;white-space:nowrap">${title}</p>
<p style="margin:1px 0 0;font-family:맑은고딕,sans-serif;font-size:17pt;font-weight:800">${rate}%</p>
<p style="margin:2px 0 0;font-family:맑은고딕,sans-serif;font-size:8.5pt;opacity:0.9;white-space:nowrap">${subtitle}</p>
</div>`;

  const kpiSectionHtml = `<div style="display:flex;gap:8px;flex-wrap:nowrap">` +
    kpiBox("전체 이행률", complianceRate, rateColor, `총 ${totalActive}건 중 이슈 ${issueCount}건`) +
    kpiBox("안전허가서 매칭", permitRate, permitRateColor, `총 ${highRiskRecords.length}건 중 매칭 ${permitPass}건`) +
    kpiBox("TBM 이행률", tbmImplRate, tbmRateColor, `총 ${tbmBase.length}건 중 이행 ${tbmPurePass + tbmJustified}건`) +
    `</div>`;

  const html = [
    `<div style="font-family:맑은고딕,sans-serif;font-size:11pt;line-height:1.6;color:#111;max-width:820px">`,
    p("안녕하십니까."),
    p("사업지원팀입니다."),
    `<p style="margin:8px 0"></p>`,
    p(`All-in Safety TBM 이행 실적 및 AI 활용 결과(${periodLabel})를 아래와 같이 공유드립니다.`),
    `<p style="margin:14px 0"></p>`,
    kpiSectionHtml,
    `<p style="margin:18px 0"></p>`,
    `<p style="margin:8px 0 8px;font-family:맑은고딕,sans-serif;font-size:12pt;font-weight:800;color:${ACCENT_DARK};border-left:4px solid ${ACCENT};padding-left:8px">1. 운용팀별 TBM 활동 내역</p>`,
    `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">`,
    teamTableHtml,
    `</div>`,
    `<p style="margin:20px 0"></p>`,
    `<p style="margin:8px 0 8px;font-family:맑은고딕,sans-serif;font-size:12pt;font-weight:800;color:${ACCENT_DARK};border-left:4px solid ${ACCENT};padding-left:8px">2. 특이사항 (일자별)</p>`,
    issuesHtml,
    `<p style="margin:20px 0"></p>`,
    `<p style="margin:8px 0 8px;font-family:맑은고딕,sans-serif;font-size:12pt;font-weight:800;color:${ACCENT_DARK};border-left:4px solid ${ACCENT};padding-left:8px">3. 협조 요청사항</p>`,
    `<div style="border:1px solid #dbeafe;background:#eff6ff;border-radius:6px;padding:10px 12px">`,
    p("- TBM 활동 시 필수 항목(활선경보기, 검전기, 안전보호구 착용)이 누락되지 않게 철저한 관리 요청"),
    p("- 고위험작업 시 안전허가서 사전 등록 부탁드립니다."),
    `</div>`,
    `<p style="margin:16px 0"></p>`,
    p("감사합니다."),
    `</div>`,
  ].join("\n");

  const subject = `[공유] All-in Safety TBM 이행 실적 및 AI 활용 결과(${periodLabel})`;
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
    const recipientsRaw = await getAisDailyEmailRecipients();

    if (!sender || !appPassword || !recipientsRaw) {
      status.lastResult = "error";
      status.lastMessage = "발신 계정(GMAIL_SENDER/GMAIL_APP_PASSWORD) 또는 수신자가 설정되지 않았습니다.";
      console.error("[AisDailyEmail]", status.lastMessage);
      return;
    }

    const recipients = recipientsRaw.split(",").map(s => s.trim()).filter(Boolean);
    if (recipients.length === 0) {
      status.lastResult = "error";
      status.lastMessage = "유효한 수신자가 없습니다. 수신 이메일을 설정해주세요.";
      return;
    }

    const [allRecords, badNotes] = await Promise.all([
      storage.getAllAisSafetyRecords(),
      storage.getAllAisTbmBadNotes(),
    ]);

    const monthStart = `${targetDate.slice(0, 7)}-01`;
    const dayRecordCount = allRecords.filter(r => r.startDate && r.startDate >= monthStart && r.startDate <= targetDate).length;
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
