// Windows 노트북에서 실행: node diagnose_routes.cjs
// 현재 routes.ts에서 AI 관련 코드 위치를 확인합니다
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "server", "routes.ts");
if (!fs.existsSync(filePath)) {
  console.error("❌ server/routes.ts 없음");
  process.exit(1);
}

const lines = fs.readFileSync(filePath, "utf8").split("\n");
console.log(`총 ${lines.length}줄\n`);

// OpenAI/Claude/gpt 관련 라인 찾기
const keywords = ["openai", "OpenAI", "gpt-4o", "claude", "Anthropic", "anthropic", "parse-subcontract", "process-gmail", "AI_INTEGRATIONS"];
lines.forEach((line, i) => {
  if (keywords.some(k => line.includes(k))) {
    console.log(`${i + 1}: ${line}`);
  }
});
