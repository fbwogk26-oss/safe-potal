/**
 * DB 전체 Excel 내보내기 공통 유틸
 * - 주요 테이블을 시트별로 나눠 ExcelJS 워크북 생성
 * - 민감 컬럼(password, session 등) 자동 제외
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

const EXPORT_TABLES: { key: string; label: string; exclude?: string[] }[] = [
  { key: "teams",                      label: "팀별 안전점수" },
  { key: "education_sessions",         label: "교육일지" },
  { key: "risk_assessments",           label: "위험성평가" },
  { key: "accident_reports",           label: "사고보고서" },
  { key: "chemicals",                  label: "MSDS 화학물질" },
  { key: "musculoskeletal_assessments",label: "근골격계 유해요인조사" },
  { key: "traffic_fines",              label: "교통 과태료" },
  { key: "safety_cost_records",        label: "산업안전보건관리비" },
  { key: "notices",                    label: "안전게시판" },
  { key: "safety_inspections",         label: "안전점검" },
  { key: "new_equipment_requests",     label: "장비신청" },
  { key: "work_plans",                 label: "작업계획" },
  { key: "vehicles",                   label: "차량" },
  { key: "heatwave_checklists",        label: "폭염 체크리스트" },
  { key: "users",                      label: "사용자",
    exclude: ["password","password_hash","session_secret","two_factor_secret"] },
];

const SENSITIVE_KEYS = new Set([
  "password","password_hash","passwordHash",
  "session_secret","sessionSecret","two_factor_secret","twoFactorSecret",
  "token","accessToken","refreshToken","secret",
]);

function sanitizeRow(row: Record<string, any>, excludeExtra?: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SENSITIVE_KEYS.has(k)) continue;
    if (excludeExtra?.includes(k)) continue;
    if (Array.isArray(v)) out[k] = JSON.stringify(v);
    else if (v !== null && typeof v === "object") out[k] = JSON.stringify(v);
    else out[k] = v ?? "";
  }
  return out;
}

export async function buildDbExcelBuffer(): Promise<Buffer | null> {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "SafeBoard";
    wb.created = new Date();

    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 3600 * 1000);
    const dateStr = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,"0")}-${String(kst.getUTCDate()).padStart(2,"0")}`;

    // 표지 시트
    const coverWs = wb.addWorksheet("내보내기 정보");
    coverWs.getColumn(1).width = 28;
    coverWs.getColumn(2).width = 40;
    const addCover = (label: string, value: string) => {
      const row = coverWs.addRow([label, value]);
      row.getCell(1).font = { bold: true };
    };
    coverWs.addRow(["SafeBoard DB 전체 내보내기"]).font = { bold: true, size: 14 };
    coverWs.addRow([]);
    addCover("내보내기 일시", `${dateStr} (KST)`);
    addCover("포함 테이블 수", `${EXPORT_TABLES.length}개`);
    addCover("민감 컬럼", "비밀번호·토큰 자동 제외");
    coverWs.addRow([]);
    addCover("주의", "이 파일은 기밀 정보를 포함합니다. 외부 유출 금지.");

    let totalRows = 0;

    for (const { key, label, exclude } of EXPORT_TABLES) {
      let rows: Record<string, any>[] = [];
      try {
        const tableIdent = sql.identifier(key);
        const result = await db.execute(sql`SELECT * FROM ${tableIdent} ORDER BY id LIMIT 50000`);
        rows = (result.rows as Record<string, any>[]).map(r => sanitizeRow(r, exclude));
      } catch {
        // 테이블 없으면 스킵
        continue;
      }

      const ws = wb.addWorksheet(label);
      if (rows.length === 0) {
        ws.addRow(["데이터 없음"]);
        continue;
      }

      const keys = Object.keys(rows[0]);

      // 헤더
      const hdrRow = ws.addRow(keys);
      hdrRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      hdrRow.height = 20;

      // 컬럼 너비 자동
      ws.columns = keys.map(k => ({ key: k, width: Math.min(Math.max(k.length * 2 + 4, 12), 50) }));

      // 데이터
      rows.forEach((r, i) => {
        const dataRow = ws.addRow(keys.map(k => r[k] ?? ""));
        if (i % 2 === 1) {
          dataRow.eachCell(cell => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
          });
        }
      });

      totalRows += rows.length;

      // 표지에 테이블별 행 수 추가
      addCover(`  ${label}`, `${rows.length}행`);
    }

    // 표지 총계 업데이트
    addCover("총 행 수", `${totalRows}행`);

    return await wb.xlsx.writeBuffer() as Buffer;
  } catch (e) {
    console.error("[DbExcel] 생성 실패:", e);
    return null;
  }
}
