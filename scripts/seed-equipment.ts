import ExcelJS from "exceljs";
import path from "path";
import { db } from "../server/db";
import { notices } from "../shared/schema";
import { eq, and } from "drizzle-orm";

const TEAMS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀", "공공망관제팀"];
const XLSX_PATH = path.resolve("attached_assets/보호구현황_20260407_1775525008630.xlsx");

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(XLSX_PATH);
  const ws = workbook.worksheets[0];

  // ── 헤더 파싱: 열번호 → 팀명 매핑 ──
  const colTeamMap: Record<number, string> = {};
  const skipCols = new Set(["구분", "품목명", "예비", "합계", ""]);
  ws.getRow(1).eachCell((cell, colNum) => {
    const val = String(cell.value ?? "").trim();
    if (!skipCols.has(val)) {
      const matched = TEAMS.find(t => val.includes(t) || t.includes(val));
      if (matched) colTeamMap[colNum] = matched;
    }
  });

  console.log("인식된 팀 열:", colTeamMap);

  // ── 데이터 파싱 ──
  const teamItemsMap: Record<string, { name: string; quantity: number; category: string; status: string }[]> = {};
  TEAMS.forEach(t => { teamItemsMap[t] = []; });

  let lastCategory = "기타품목";
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const catVal = String(row.getCell(1).value ?? "").trim();
    const itemName = String(row.getCell(2).value ?? "").trim();
    if (!itemName) return;
    if (catVal) lastCategory = catVal;

    Object.entries(colTeamMap).forEach(([colStr, teamName]) => {
      const colNum = Number(colStr);
      const qty = Number(row.getCell(colNum).value ?? 0) || 0;
      teamItemsMap[teamName].push({ name: itemName, quantity: qty, category: lastCategory, status: "등록" });
    });
  });

  // ── DB 저장 ──
  let inserted = 0;
  let updated = 0;

  for (const teamName of TEAMS) {
    const items = teamItemsMap[teamName];
    if (!items || items.length === 0) { console.log(`[SKIP] ${teamName} — 항목 없음`); continue; }

    const contentData = JSON.stringify({ team: teamName, items, lastUpdated: new Date().toISOString() });
    const title = `${teamName} 보호구 현황`;

    // 기존 레코드 확인
    const existing = await db.select().from(notices)
      .where(and(eq(notices.category, "equip_status"), eq(notices.title, title)));

    if (existing.length > 0) {
      await db.update(notices)
        .set({ content: contentData })
        .where(eq(notices.id, existing[0].id));
      console.log(`[UPDATE] ${teamName} (${items.length}개 항목)`);
      updated++;
    } else {
      await db.insert(notices).values({ title, content: contentData, category: "equip_status" });
      console.log(`[INSERT] ${teamName} (${items.length}개 항목)`);
      inserted++;
    }
  }

  console.log(`\n완료: 신규 ${inserted}개 팀, 업데이트 ${updated}개 팀`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
