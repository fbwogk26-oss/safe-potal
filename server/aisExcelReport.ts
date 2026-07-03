/**
 * AIS 안전이행률 종합 Excel 리포트 생성
 * 4개 시트: 1.종합 2.moswork파일 누적 3.부적합 내용(소명포함) 4.작업번호별 사진내역
 */
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import type { AisSafetyRecord, AisSafetyUpload, AisTbmBadNote } from "@shared/schema";

const uploadDir = path.join(process.cwd(), "uploads");

function isCancelled(r: AisSafetyRecord): boolean {
  const s = (r.workStatus ?? "").trim();
  return s.includes("취소") || s === "중단" || s === "반납";
}

function isHighRiskWork(val: string | null | undefined): boolean {
  const v = (val ?? "").trim();
  return !!v && v !== "없음";
}

async function fetchBuf(url: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith("/objects/")) {
      const privateDir = process.env.PRIVATE_OBJECT_DIR;
      if (privateDir) {
        const parts = privateDir.replace(/^\//, "").split("/");
        const bucketName = parts[0];
        const prefix = parts.slice(1).join("/");
        const objectName = url.replace("/objects/", prefix ? `${prefix}/` : "");
        const [buf] = await objectStorageClient.bucket(bucketName).file(objectName.replace(/^\//, "")).download();
        return buf as Buffer;
      }
    } else if (url.startsWith("/uploads/")) {
      const localPath = path.join(uploadDir, url.replace("/uploads/", ""));
      if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
    } else if (url.startsWith("http")) {
      const r = await fetch(url);
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    }
  } catch { /* skip */ }
  return null;
}

function detectImgExt(buf: Buffer | null): 'jpeg' | 'png' | 'gif' | null {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  return null;
}

async function compressImg(buf: Buffer): Promise<Buffer> {
  try {
    const sharpLib = require('sharp') as typeof import('sharp');
    return await sharpLib(buf)
      .resize({ width: 900, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: false })
      .toBuffer();
  } catch {
    return buf;
  }
}

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = THIN_BORDER;
  });
  row.height = 22;
}

function styleDataRow(row: ExcelJS.Row, opts?: { center?: boolean }) {
  row.eachCell((cell) => {
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: 'middle', horizontal: opts?.center === false ? 'left' : 'center', wrapText: true };
    cell.font = { size: 10 };
  });
}

function shortTeam(t: string | null | undefined): string {
  return (t || "").replace(/운용팀$/, "T");
}

function numToColLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function addRateDataBar(ws: ExcelJS.Worksheet, ref: string, color = 'FF22C55E') {
  ws.addConditionalFormatting({
    ref,
    rules: [{
      type: 'dataBar',
      minLength: 0,
      maxLength: 100,
      gradient: false,
      color: { argb: color },
      cfvo: [{ type: 'num', val: 0 }, { type: 'num', val: 100 }],
    } as any],
  });
}

function renderPeriodTeamTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  periods: string[],
  periodMap: Map<string, AisSafetyRecord[]>,
  teams: string[],
  justifiedIds: Set<number>,
  barColor: string,
): number {
  ws.getCell(`A${startRow}`).value = title;
  ws.getCell(`A${startRow}`).font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };

  const headerRowIdx = startRow + 1;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.getCell(1).value = "부서";
  periods.forEach((p, i) => { headerRow.getCell(i + 2).value = p; });
  headerRow.getCell(periods.length + 2).value = "합계";
  styleHeaderRow(headerRow);

  teams.forEach((team, tIdx) => {
    const row = ws.getRow(headerRowIdx + 1 + tIdx);
    row.getCell(1).value = shortTeam(team);
    let rowTotal = 0;
    periods.forEach((p, i) => {
      const recs = periodMap.get(p) || [];
      const count = recs.filter(r => r.team === team).length;
      row.getCell(i + 2).value = count;
      rowTotal += count;
    });
    row.getCell(periods.length + 2).value = rowTotal;
    styleDataRow(row);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  });

  const totalRowIdx = headerRowIdx + 1 + teams.length;
  const totalRow = ws.getRow(totalRowIdx);
  totalRow.getCell(1).value = "합계";
  let grandTotal = 0;
  periods.forEach((p, i) => {
    const recs = periodMap.get(p) || [];
    totalRow.getCell(i + 2).value = recs.length;
    grandTotal += recs.length;
  });
  totalRow.getCell(periods.length + 2).value = grandTotal;
  styleDataRow(totalRow);
  totalRow.eachCell(c => { c.font = { bold: true, size: 10 }; });

  const rateRowIdx = totalRowIdx + 1;
  const rateRow = ws.getRow(rateRowIdx);
  rateRow.getCell(1).value = "이행률(%)";
  periods.forEach((p, i) => {
    const recs = periodMap.get(p) || [];
    const { rate } = calcGroupCompliance(recs, justifiedIds);
    rateRow.getCell(i + 2).value = rate;
  });
  rateRow.getCell(periods.length + 2).value = null;
  styleDataRow(rateRow);
  rateRow.getCell(1).font = { bold: true, size: 10 };
  rateRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  rateRow.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; c.font = { bold: true, size: 10 }; });

  if (periods.length > 0) {
    const startCol = numToColLetter(2);
    const endCol = numToColLetter(periods.length + 1);
    addRateDataBar(ws, `${startCol}${rateRowIdx}:${endCol}${rateRowIdx}`, barColor);
  }

  return rateRowIdx + 2;
}

function calcGroupCompliance(records: AisSafetyRecord[], justifiedIds: Set<number>): { rate: number; total: number; badCount: number } {
  const active = records.filter(r => !isCancelled(r));
  if (!active.length) return { rate: 0, total: 0, badCount: 0 };
  const highRiskNoPermit = active.filter(r => isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y' && !justifiedIds.has(r.id));
  const tbmUnreg = active.filter(r => r.tbmResult === '미등록' && !justifiedIds.has(r.id));
  const tbmBad = active.filter(r => r.tbmAiResult === '부적합' && !justifiedIds.has(r.id));
  const total = active.length * 3;
  const pass = total - (highRiskNoPermit.length + tbmUnreg.length + tbmBad.length);
  const rate = total > 0 ? Math.round((pass / total) * 100) : 100;
  return { rate, total: active.length, badCount: tbmBad.length };
}

interface BuildResult {
  buffer: Buffer;
  fileName: string;
  recordCount: number;
  badCount: number;
}

export async function buildAisExcelReportBuffer(): Promise<BuildResult> {
  const [uploads, allRecordsRaw, badNotesRaw] = await Promise.all([
    storage.getAisSafetyUploads(),
    storage.getAllAisSafetyRecords(),
    storage.getAllAisTbmBadNotes(),
  ]);

  const allRecords = allRecordsRaw.filter(r => !isCancelled(r));
  const noteByRecordId = new Map<number, AisTbmBadNote>(badNotesRaw.map(n => [n.recordId, n]));

  // 소명완료 레코드(동일 작업번호 포함)는 부적합(평가대상)에서 제외
  const justifiedRecordIds = new Set<number>();
  for (const n of badNotesRaw) {
    if (n.justificationStatus === "소명완료") {
      justifiedRecordIds.add(n.recordId);
      const rec = allRecordsRaw.find(r => r.id === n.recordId);
      if (rec?.workOrderNo) {
        allRecordsRaw.filter(r => r.workOrderNo === rec.workOrderNo).forEach(r => justifiedRecordIds.add(r.id));
      }
    }
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "안전포털시스템";
  wb.created = new Date();

  // ══════════════════════════════════════════════════════════
  // 시트 1: 현황
  // ══════════════════════════════════════════════════════════
  const wsSummary = wb.addWorksheet("현황", { views: [{ state: 'frozen', ySplit: 0 }] });
  wsSummary.columns = [
    { width: 20 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
  ];

  const teams = Array.from(new Set(allRecords.map(r => r.team).filter(Boolean))) as string[];
  type TeamStat = { team: string; direct: number; contract: number; bad: number; badEval: number; total: number; rate: number };
  const teamStats: TeamStat[] = teams.map(team => {
    const tr = allRecords.filter(r => r.team === team);
    const direct = tr.filter(r => (r.workType || "").includes("직영")).length;
    const contract = tr.filter(r => (r.workType || "").includes("도급")).length;
    const bad = tr.filter(r => r.tbmAiResult === "부적합").length;
    const badEval = tr.filter(r => r.tbmAiResult === "부적합" && !justifiedRecordIds.has(r.id)).length;
    const total = tr.length;
    const rate = total > 0 ? Math.round((badEval / total) * 1000) / 10 : 0;
    return { team, direct, contract, bad, badEval, total, rate };
  });

  const highRiskRecords = allRecords.filter(r => isHighRiskWork(r.highRiskWork));
  const permitPass = highRiskRecords.filter(r => r.safetyPermit === "Y").length;
  const permitRate = highRiskRecords.length > 0 ? Math.round((permitPass / highRiskRecords.length) * 100) : 100;

  const tbmPurePass = allRecords.filter(r => r.tbmResult === "등록" && r.tbmAiResult === "적합").length;
  const tbmJustified = allRecords.filter(r =>
    !(r.tbmResult === "등록" && r.tbmAiResult === "적합") &&
    (r.tbmResult === "등록" || justifiedRecordIds.has(r.id)) &&
    (r.tbmAiResult === "적합" || justifiedRecordIds.has(r.id))
  ).length;
  const tbmImplRate = allRecords.length > 0 ? Math.round(((tbmPurePass + tbmJustified) / allRecords.length) * 100) : 100;

  const tbmUnreg = allRecords.filter(r => r.tbmResult === "미등록" && !justifiedRecordIds.has(r.id));
  const highRiskNoPermit = highRiskRecords.filter(r => r.safetyPermit !== "Y" && !justifiedRecordIds.has(r.id));
  const tbmBadEvalRecords = allRecords.filter(r => r.tbmAiResult === "부적합" && !justifiedRecordIds.has(r.id));
  const issueCount = highRiskNoPermit.length + tbmUnreg.length + tbmBadEvalRecords.length;
  const totalActive = allRecords.length;
  const complianceRate = totalActive > 0 ? Math.round(((totalActive * 3 - issueCount) / (totalActive * 3)) * 100) : 100;

  const dateRange = allRecords.length > 0
    ? [...allRecords].map(r => r.startDate).filter(Boolean).sort()
    : [];
  const periodLabel = dateRange.length > 0 ? `${dateRange[0]} ~ ${dateRange[dateRange.length - 1]}` : "-";

  wsSummary.mergeCells('A1:I1');
  const titleCell = wsSummary.getCell('A1');
  titleCell.value = "AIS 안전이행률 종합 리포트";
  titleCell.font = { bold: true, size: 15 };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  wsSummary.getRow(1).height = 28;

  wsSummary.getCell('A2').value = `집계기간: ${periodLabel}`;
  wsSummary.getCell('A2').font = { size: 10, color: { argb: 'FF64748B' } };
  wsSummary.getCell('A3').value = `생성일시: ${new Date().toLocaleString('ko-KR')}`;
  wsSummary.getCell('A3').font = { size: 10, color: { argb: 'FF64748B' } };

  wsSummary.getCell('A5').value = "핵심 지표";
  wsSummary.getCell('A5').font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };

  const kpiHeaderRow = wsSummary.getRow(6);
  kpiHeaderRow.getCell(1).value = "전체 이행률";
  kpiHeaderRow.getCell(2).value = "안전허가서 매칭률";
  kpiHeaderRow.getCell(3).value = "TBM 이행률";
  kpiHeaderRow.getCell(4).value = "총 작업건수";
  kpiHeaderRow.getCell(5).value = "이슈건수";
  for (let c = 1; c <= 5; c++) wsSummary.getRow(6).getCell(c).width;
  styleHeaderRow(kpiHeaderRow);

  const kpiValueRow = wsSummary.getRow(7);
  kpiValueRow.getCell(1).value = `${complianceRate}%`;
  kpiValueRow.getCell(2).value = `${permitRate}%`;
  kpiValueRow.getCell(3).value = `${tbmImplRate}%`;
  kpiValueRow.getCell(4).value = totalActive;
  kpiValueRow.getCell(5).value = issueCount;
  styleDataRow(kpiValueRow);
  kpiValueRow.eachCell(c => { c.font = { bold: true, size: 12 }; });

  const issueDetailHeaderRow = wsSummary.getRow(8);
  issueDetailHeaderRow.getCell(1).value = "이슈 상세 (소명완료 건 제외)";
  issueDetailHeaderRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF64748B' } };
  issueDetailHeaderRow.getCell(2).value = "고위험작업 허가서 미등록";
  issueDetailHeaderRow.getCell(3).value = "TBM 미등록";
  issueDetailHeaderRow.getCell(4).value = "TBM AI 부적합";
  const issueDetailValueRow = wsSummary.getRow(9);
  issueDetailValueRow.getCell(2).value = `${highRiskNoPermit.length}건`;
  issueDetailValueRow.getCell(3).value = `${tbmUnreg.length}건`;
  issueDetailValueRow.getCell(4).value = `${tbmBadEvalRecords.length}건`;
  for (let c = 2; c <= 4; c++) {
    issueDetailHeaderRow.getCell(c).font = { bold: true, size: 10, color: { argb: 'FF64748B' } };
    issueDetailHeaderRow.getCell(c).alignment = { horizontal: 'center' };
    issueDetailValueRow.getCell(c).font = { bold: true, size: 11 };
    issueDetailValueRow.getCell(c).alignment = { horizontal: 'center' };
  }

  const teamTableStartRow = 12;
  wsSummary.getCell(`A${teamTableStartRow - 1}`).value = "운용팀별 TBM 활동 내역";
  wsSummary.getCell(`A${teamTableStartRow - 1}`).font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };

  const teamHeaderRow = wsSummary.getRow(teamTableStartRow);
  teamHeaderRow.getCell(1).value = "구분";
  teamStats.forEach((t, i) => { teamHeaderRow.getCell(i + 2).value = shortTeam(t.team); });
  teamHeaderRow.getCell(teamStats.length + 2).value = "합계";
  styleHeaderRow(teamHeaderRow);

  const teamRows: { label: string; values: number[]; total: number; highlight?: boolean }[] = [
    { label: "직영공사", values: teamStats.map(t => t.direct), total: teamStats.reduce((s, t) => s + t.direct, 0) },
    { label: "도급공사", values: teamStats.map(t => t.contract), total: teamStats.reduce((s, t) => s + t.contract, 0) },
    { label: "TBM AI 부적합", values: teamStats.map(t => t.bad), total: teamStats.reduce((s, t) => s + t.bad, 0) },
    { label: "부적합(평가대상)", values: teamStats.map(t => t.badEval), total: teamStats.reduce((s, t) => s + t.badEval, 0), highlight: true },
  ];
  teamRows.forEach((tr, idx) => {
    const row = wsSummary.getRow(teamTableStartRow + 1 + idx);
    row.getCell(1).value = tr.label;
    tr.values.forEach((v, i) => { row.getCell(i + 2).value = v; });
    row.getCell(teamStats.length + 2).value = tr.total;
    styleDataRow(row);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    if (tr.highlight) {
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }; });
    }
  });
  const rateRowIdx = teamTableStartRow + 1 + teamRows.length;
  const rateRow = wsSummary.getRow(rateRowIdx);
  rateRow.getCell(1).value = "불량율";
  teamStats.forEach((t, i) => { rateRow.getCell(i + 2).value = `${t.rate}%`; });
  const totalRate = totalActive > 0 ? Math.round((tbmBadEvalRecords.length / totalActive) * 1000) / 10 : 0;
  rateRow.getCell(teamStats.length + 2).value = `${totalRate}%`;
  styleDataRow(rateRow);
  rateRow.getCell(1).font = { bold: true, size: 10 };
  rateRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  // ── 일자별/월별 현황 (대시보드 그래프 데이터 반영) ──
  const dailyMap = new Map<string, AisSafetyRecord[]>();
  for (const r of allRecords) {
    if (!r.startDate) continue;
    if (!dailyMap.has(r.startDate)) dailyMap.set(r.startDate, []);
    dailyMap.get(r.startDate)!.push(r);
  }
  const monthlyMap = new Map<string, AisSafetyRecord[]>();
  for (const r of allRecords) {
    if (!r.startDate || r.startDate.length < 7) continue;
    const month = r.startDate.slice(0, 7);
    if (!monthlyMap.has(month)) monthlyMap.set(month, []);
    monthlyMap.get(month)!.push(r);
  }

  let curRow = rateRowIdx + 3;
  const monthPeriods = Array.from(monthlyMap.keys()).sort();
  curRow = renderPeriodTeamTable(wsSummary, curRow, "월별 이행률 현황 (부서별 건수)", monthPeriods, monthlyMap, teams, justifiedRecordIds, 'FF3B82F6');

  const dayPeriods = Array.from(dailyMap.keys()).sort();
  curRow = renderPeriodTeamTable(wsSummary, curRow, "일자별 이행률 현황 (부서별 건수)", dayPeriods, dailyMap, teams, justifiedRecordIds, 'FF22C55E');

  // ══════════════════════════════════════════════════════════
  // 시트 2: 세부내역
  // ══════════════════════════════════════════════════════════
  const wsRaw = wb.addWorksheet("세부내역", { views: [{ state: 'frozen', ySplit: 1 }] });
  const uploadById = new Map<number, AisSafetyUpload>(uploads.map(u => [u.id, u]));
  const rawColumns: { header: string; key: string; width: number }[] = [
    { header: "업로드파일", key: "uploadFile", width: 22 },
    { header: "작업번호", key: "workOrderNo", width: 24 },
    { header: "운용팀", key: "team", width: 10 },
    { header: "센터", key: "center", width: 12 },
    { header: "작업구분", key: "workType", width: 10 },
    { header: "작업명", key: "workName", width: 22 },
    { header: "작업내용", key: "workContent", width: 24 },
    { header: "작업위치", key: "workLocation", width: 16 },
    { header: "시작일", key: "startDate", width: 12 },
    { header: "종료일", key: "endDate", width: 12 },
    { header: "주야", key: "dayNight", width: 8 },
    { header: "고위험작업", key: "highRiskWork", width: 12 },
    { header: "안전허가서", key: "safetyPermit", width: 10 },
    { header: "위험도", key: "riskLevel", width: 8 },
    { header: "AI위험도", key: "aiRiskLevel", width: 10 },
    { header: "건강선언", key: "healthDeclaration", width: 10 },
    { header: "TBM등록", key: "tbmResult", width: 10 },
    { header: "TBM AI결과", key: "tbmAiResult", width: 12 },
    { header: "위험성평가", key: "riskAssessment", width: 12 },
    { header: "위험성AI결과", key: "riskAiResult", width: 12 },
    { header: "작업상태", key: "workStatus", width: 10 },
    { header: "협력업체", key: "vendorName", width: 16 },
    { header: "감독자", key: "supervisor", width: 12 },
    { header: "팀장승인", key: "teamLeaderApproval", width: 10 },
    { header: "센터장승인", key: "centerManagerApproval", width: 10 },
    { header: "검토의견", key: "reviewRisk", width: 20 },
  ];
  wsRaw.columns = rawColumns.map(c => ({ header: c.header, key: c.key, width: c.width }));
  styleHeaderRow(wsRaw.getRow(1));

  const sortedRaw = [...allRecordsRaw].sort((a, b) => {
    const da = a.startDate || "";
    const db_ = b.startDate || "";
    return db_.localeCompare(da);
  });
  sortedRaw.forEach((r) => {
    const upload = uploadById.get(r.uploadId);
    const row = wsRaw.addRow({
      uploadFile: upload?.fileName || "-",
      workOrderNo: r.workOrderNo || "",
      team: shortTeam(r.team),
      center: r.center || "",
      workType: r.workType || "",
      workName: r.workName || "",
      workContent: r.workContent || "",
      workLocation: r.workLocation || "",
      startDate: r.startDate || "",
      endDate: r.endDate || "",
      dayNight: r.dayNight || "",
      highRiskWork: r.highRiskWork || "",
      safetyPermit: r.safetyPermit || "",
      riskLevel: r.riskLevel || "",
      aiRiskLevel: r.aiRiskLevel || "",
      healthDeclaration: r.healthDeclaration || "",
      tbmResult: r.tbmResult || "",
      tbmAiResult: r.tbmAiResult || "",
      riskAssessment: r.riskAssessment || "",
      riskAiResult: r.riskAiResult || "",
      workStatus: r.workStatus || "",
      vendorName: r.vendorName || "",
      supervisor: r.supervisor || "",
      teamLeaderApproval: r.teamLeaderApproval || "",
      centerManagerApproval: r.centerManagerApproval || "",
      reviewRisk: r.reviewRisk || "",
    });
    styleDataRow(row, { center: false });
    if (r.tbmAiResult === "부적합") {
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }; });
    }
  });

  // ══════════════════════════════════════════════════════════
  // 시트 3: 부적합 내용(소명포함)
  // ══════════════════════════════════════════════════════════
  const wsBad = wb.addWorksheet("부적합 내용(소명포함)", { views: [{ state: 'frozen', ySplit: 1 }] });
  const badColumns: { header: string; key: string; width: number }[] = [
    { header: "구분", key: "issueType", width: 14 },
    { header: "작업번호", key: "workOrderNo", width: 24 },
    { header: "운용팀", key: "team", width: 10 },
    { header: "작업명", key: "workName", width: 22 },
    { header: "작업일", key: "startDate", width: 12 },
    { header: "부적합/미등록 사유", key: "reason", width: 30 },
    { header: "소명 상태", key: "justificationStatus", width: 12 },
    { header: "소명 사유", key: "justificationReason", width: 30 },
    { header: "소명 처리자", key: "justificationBy", width: 12 },
    { header: "사진수", key: "photoCount", width: 8 },
  ];
  wsBad.columns = badColumns.map(c => ({ header: c.header, key: c.key, width: c.width }));
  styleHeaderRow(wsBad.getRow(1));

  const badAiRecords = allRecords.filter(r => r.tbmAiResult === "부적합").map(r => ({ record: r, issueType: "TBM AI 부적합" as const }));
  const unregRecords = allRecords.filter(r => r.tbmResult === "미등록").map(r => ({ record: r, issueType: "TBM 미등록" as const }));
  const badRecords = [...badAiRecords, ...unregRecords].sort((a, b) => (b.record.startDate || "").localeCompare(a.record.startDate || ""));
  badRecords.forEach(({ record: r, issueType }) => {
    const note = noteByRecordId.get(r.id);
    const photoCount = note ? (note.photoUrls && note.photoUrls.length > 0 ? note.photoUrls.length : (note.photoUrl ? 1 : 0)) : 0;
    const row = wsBad.addRow({
      issueType,
      workOrderNo: r.workOrderNo || "",
      team: shortTeam(r.team),
      workName: r.workName || "",
      startDate: r.startDate || "",
      reason: note?.reason || "",
      justificationStatus: note?.justificationStatus || "미처리",
      justificationReason: note?.justificationReason || "",
      justificationBy: note?.justificationBy || "",
      photoCount,
    });
    styleDataRow(row, { center: false });
    if (note?.justificationStatus === "소명완료") {
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } }; });
    } else {
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }; });
    }
  });

  // ══════════════════════════════════════════════════════════
  // 시트 4: 각 작업번호별 사진내역
  // ══════════════════════════════════════════════════════════
  const wsPhoto = wb.addWorksheet("작업번호별 사진내역");
  wsPhoto.columns = [
    { header: "작업번호", key: "workOrderNo", width: 24 },
    { header: "운용팀", key: "team", width: 10 },
    { header: "작업명", key: "workName", width: 22 },
    { header: "부적합 사유", key: "reason", width: 26 },
    { header: "소명 상태", key: "justificationStatus", width: 12 },
    { header: "사진1", key: "photo1", width: 18 },
    { header: "사진2", key: "photo2", width: 18 },
    { header: "사진3", key: "photo3", width: 18 },
  ];
  styleHeaderRow(wsPhoto.getRow(1));

  const notesWithPhotos = badNotesRaw.filter(n => (n.photoUrls && n.photoUrls.length > 0) || n.photoUrl);
  const recordById = new Map<number, AisSafetyRecord>(allRecordsRaw.map(r => [r.id, r]));

  // 사진 URL 사전 로드 (병렬)
  const allPhotoUrls = new Set<string>();
  notesWithPhotos.forEach(n => {
    const urls = n.photoUrls && n.photoUrls.length > 0 ? n.photoUrls : (n.photoUrl ? [n.photoUrl] : []);
    urls.forEach(u => allPhotoUrls.add(u));
  });
  const imgCache = new Map<string, Buffer | null>();
  await Promise.all(Array.from(allPhotoUrls).map(async (url) => {
    const raw = await fetchBuf(url);
    if (raw && detectImgExt(raw)) {
      imgCache.set(url, await compressImg(raw));
    } else {
      imgCache.set(url, null);
    }
  }));

  const PHOTO_ROW_H = 110;
  let photoRowIdx = 2;
  for (const note of notesWithPhotos) {
    const rec = recordById.get(note.recordId);
    const urls = note.photoUrls && note.photoUrls.length > 0 ? note.photoUrls : (note.photoUrl ? [note.photoUrl] : []);
    const row = wsPhoto.getRow(photoRowIdx);
    row.getCell(1).value = rec?.workOrderNo || "";
    row.getCell(2).value = shortTeam(rec?.team);
    row.getCell(3).value = rec?.workName || "";
    row.getCell(4).value = note.reason || "";
    row.getCell(5).value = note.justificationStatus || "미처리";
    row.height = PHOTO_ROW_H;
    for (let c = 1; c <= 5; c++) {
      row.getCell(c).border = THIN_BORDER;
      row.getCell(c).alignment = { vertical: 'middle', horizontal: c <= 1 ? 'center' : 'left', wrapText: true };
      row.getCell(c).font = { size: 10 };
    }
    urls.slice(0, 3).forEach((url, i) => {
      const col0 = 5 + i; // 0-indexed col F=5, G=6, H=7
      const cell = row.getCell(6 + i);
      cell.border = THIN_BORDER;
      const buf = imgCache.get(url);
      if (buf) {
        const ext = detectImgExt(buf)!;
        const imgId = wb.addImage({ base64: buf.toString('base64'), extension: ext });
        wsPhoto.addImage(imgId, {
          tl: { col: col0, row: photoRowIdx - 1 } as any,
          br: { col: col0 + 1, row: photoRowIdx } as any,
          editAs: 'oneCell',
        });
      } else {
        cell.value = "이미지 로드 실패";
      }
    });
    photoRowIdx++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const now = new Date();
  const kstDate = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const fileName = `AIS_안전이행률_종합리포트_${kstDate}.xlsx`;

  return { buffer: buffer as Buffer, fileName, recordCount: allRecords.length, badCount: badRecords.length };
}
