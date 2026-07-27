// node patch_autoemail.cjs  — autoEmailJob.ts OpenAI → Claude 교체
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "server", "autoEmailJob.ts");
if (!fs.existsSync(p)) { console.error("❌ server/autoEmailJob.ts 없음"); process.exit(1); }

let c = fs.readFileSync(p, "utf8");
if (c.includes("claude-haiku-4-5")) {
  console.log("✅ 이미 Claude 적용됨. 빌드만 하면 됩니다.");
  process.exit(0);
}

// 1) OpenAI 초기화 → Anthropic
c = c.replace(
  /\/\/ GPT-4o로 작업 정보 파싱\s*\nconst OpenAI[\s\S]*?apiKey\s*:\s*process\.env\.AI_INTEGRATIONS_OPENAI_API_KEY[\s\S]*?\}\);/,
  `// Claude로 작업 정보 파싱
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log("[AutoEmail] 🤖 Claude API 호출 시작 (claude-haiku-4-5)");`
);

// 2) chat.completions.create → messages.create
c = c.replace(/aiClient\.chat\.completions\.create\(\{/, "aiClient.messages.create({");
c = c.replace(/model:\s*["']gpt-4o["']/, 'model: "claude-haiku-4-5"');

// 3) system role → system 파라미터
c = c.replace(
  /messages:\s*\[\s*\{\s*role:\s*["']system["'],\s*content:\s*systemPrompt\s*\},\s*\{\s*role:\s*["']user["'],/,
  `system: systemPrompt,
      messages: [
        { role: "user",`
);

// 4) response 구조
c = c.replace(
  /aiRes\.choices\[0\]\.message\.content\?\.trim\(\)/,
  "(aiRes.content[0] as any).text?.trim()"
);

// console.log 추가 (aiRes 선언 다음 줄)
c = c.replace(
  /(const rawJson = \(aiRes\.content\[0\] as any\)\.text)/,
  `console.log("[AutoEmail] ✅ Claude 응답 완료");\n    $1`
);

fs.writeFileSync(p, c);
console.log("✅ autoEmailJob.ts Claude 교체 완료!");
console.log("\n빌드 & 재시작:");
console.log("  npm run build && pm2 restart safetyboard --update-env");
