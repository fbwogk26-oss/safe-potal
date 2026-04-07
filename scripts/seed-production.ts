/**
 * 배포 사이트 보호구 현황 데이터 등록 스크립트
 * Usage: PROD_URL=https://your-app.replit.app ADMIN_PASSWORD=xxx npx tsx scripts/seed-production.ts
 */
import fs from "fs";
import path from "path";

const PROD_URL = process.env.PROD_URL?.replace(/\/$/, "") || "";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

if (!PROD_URL) {
  console.error("PROD_URL 환경변수를 설정해주세요.");
  process.exit(1);
}

async function main() {
  console.log(`배포 사이트: ${PROD_URL}`);

  // 1. 로그인
  const loginRes = await fetch(`${PROD_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
  });

  if (!loginRes.ok) {
    const err = await loginRes.text();
    throw new Error(`로그인 실패: ${loginRes.status} ${err}`);
  }

  const setCookie = loginRes.headers.get("set-cookie") || "";
  const sessionCookie = setCookie.split(";")[0];
  console.log("로그인 성공");

  // 2. seed 데이터 로드
  const dataPath = path.resolve("scripts/equip-seed-data.json");
  const { records } = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  console.log(`${records.length}개 팀 데이터 준비 완료`);

  // 3. seed 엔드포인트 호출
  const seedRes = await fetch(`${PROD_URL}/api/admin/seed-equipment-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": sessionCookie,
    },
    body: JSON.stringify({ records }),
  });

  if (!seedRes.ok) {
    const err = await seedRes.text();
    throw new Error(`Seed 실패: ${seedRes.status} ${err}`);
  }

  const result = await seedRes.json();
  console.log(`완료: 신규 ${result.inserted}개, 업데이트 ${result.updated}개`);
}

main().catch(e => { console.error(e); process.exit(1); });
