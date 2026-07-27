// node patch_auth.cjs  — Windows HTTP 환경에서 세션 쿠키 문제 수정
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "server", "replit_integrations", "auth", "replitAuth.ts");

if (!fs.existsSync(p)) {
  console.error("❌ replitAuth.ts 파일을 찾을 수 없습니다.");
  process.exit(1);
}

let c = fs.readFileSync(p, "utf8");

// 이미 수정됐는지 확인
if (c.includes("HTTPS_ENABLED")) {
  console.log("✅ 이미 수정됨. .env에 HTTPS_ENABLED=false 확인 후 재시작만 하면 됩니다:");
  console.log("   pm2 restart safetyboard --update-env");
  process.exit(0);
}

// secure: isProduction → secure: isProduction && HTTPS_ENABLED === 'true'
const patterns = [
  // 패턴 1: secure: isProduction
  [/secure:\s*isProduction([^&]|$)/g, "secure: isProduction && process.env.HTTPS_ENABLED === 'true'$1"],
  // 패턴 2: secure: process.env.NODE_ENV === 'production'
  [/secure:\s*process\.env\.NODE_ENV\s*===\s*['"]production['"]/g, "secure: process.env.NODE_ENV === 'production' && process.env.HTTPS_ENABLED === 'true'"],
  // 패턴 3: secure: true (단독)
  [/(\s)secure:\s*true,/g, "$1secure: process.env.HTTPS_ENABLED === 'true',"],
];

let changed = false;
for (const [pattern, replacement] of patterns) {
  if (pattern.test(c)) {
    c = c.replace(pattern, replacement);
    changed = true;
    console.log(`✅ 패턴 교체 완료`);
    break;
  }
}

if (changed) {
  fs.writeFileSync(p, c);
  console.log("\n✅ replitAuth.ts 수정 완료!");
  console.log("\n다음 순서로 진행:");
  console.log("  npm run build");
  console.log("  pm2 restart safetyboard --update-env");
} else {
  console.log("⚠️  패턴 매칭 실패. .env에 아래 줄 추가 후 재시작:");
  console.log("   NODE_ENV=development");
  console.log("   pm2 restart safetyboard --update-env");
}
