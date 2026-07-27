// Windows 노트북에서 실행: node patch_claude.cjs
// C:\SafeBoard 폴더에 이 파일 복사 후 실행
// 정규식 기반 — 공백/들여쓰기 차이 무관하게 동작합니다
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "server", "routes.ts");
if (!fs.existsSync(filePath)) {
  console.error("❌ server/routes.ts 없음. C:\\SafeBoard 폴더에서 실행하세요.");
  process.exit(1);
}

let code = fs.readFileSync(filePath, "utf8");
const original = code;

// ── 이미 Claude로 되어있는지 확인 ──
const alreadyClaude = code.includes("claude-3-5-haiku-20241022");
if (alreadyClaude) {
  console.log("✅ 이미 Claude 코드가 적용되어 있습니다. 빌드만 하면 됩니다:");
  console.log("   npm run build");
  console.log("   pm2 restart safetyboard --update-env");
  process.exit(0);
}

console.log("🔍 OpenAI 코드를 Claude로 교체 시작...\n");

// ──────────────────────────────────────────────────────────────────────────
// 패치 1: parse-subcontract-email 라우트 OpenAI 초기화 → Claude
// ──────────────────────────────────────────────────────────────────────────
// parse-subcontract-email 라우트 안에서 OpenAI 초기화 블록을 찾아 교체
{
  // 라우트 위치 찾기
  const routeMarker = "parse-subcontract-email";
  const routeIdx = code.indexOf(routeMarker);
  if (routeIdx === -1) {
    console.warn("⚠️  parse-subcontract-email 라우트 자체를 찾지 못했습니다.");
  } else {
    // 해당 라우트 이후에서 첫 번째 OpenAI 초기화 블록 교체
    const before = code.slice(0, routeIdx);
    let after = code.slice(routeIdx);

    // OpenAI 초기화 패턴 (정규식, 공백 무관)
    const initPattern = /const OpenAI\s*=\s*\(await import\("openai"\)\)\.default;[\s\S]*?new OpenAI\(\{[\s\S]*?apiKey\s*:\s*process\.env\.AI_INTEGRATIONS_OPENAI_API_KEY[\s\S]*?\}\);/;
    const initMatch = after.match(initPattern);
    if (initMatch) {
      const indent = (initMatch[0].match(/^(\s*)const OpenAI/) || ["","      "])[1];
      const replacement = `${indent}const Anthropic = (await import("@anthropic-ai/sdk")).default;\n${indent}const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });\n${indent}console.log("[parse-subcontract-email] 🤖 Claude API 호출 시작 (claude-3-5-haiku-20241022)");`;
      after = after.replace(initPattern, replacement);
      code = before + after;
      console.log("✅ parse-subcontract-email: OpenAI 초기화 → Claude 교체 완료");
    } else {
      console.warn("⚠️  parse-subcontract-email: OpenAI 초기화 패턴을 찾지 못했습니다.");
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 패치 2: process-gmail 라우트 OpenAI 초기화 → Claude
// ──────────────────────────────────────────────────────────────────────────
{
  const routeMarker = "process-gmail";
  // parse-subcontract 이후에서 시작해야 두 번째 라우트를 정확히 찾음
  const firstRouteEnd = code.indexOf("parse-subcontract-email");
  const routeIdx = code.indexOf(routeMarker, firstRouteEnd + 1);
  if (routeIdx === -1) {
    console.warn("⚠️  process-gmail 라우트를 찾지 못했습니다.");
  } else {
    const before = code.slice(0, routeIdx);
    let after = code.slice(routeIdx);

    const initPattern = /const OpenAI\s*=\s*\(await import\("openai"\)\)\.default;[\s\S]*?new OpenAI\(\{[\s\S]*?apiKey\s*:\s*process\.env\.AI_INTEGRATIONS_OPENAI_API_KEY[\s\S]*?\}\);/;
    const initMatch = after.match(initPattern);
    if (initMatch) {
      const indent = "      ";
      const replacement = `${indent}const Anthropic = (await import("@anthropic-ai/sdk")).default;\n${indent}const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });\n${indent}console.log("[process-gmail] 🤖 Claude API 호출 시작 (claude-3-5-haiku-20241022)");`;
      after = after.replace(initPattern, replacement);
      code = before + after;
      console.log("✅ process-gmail: OpenAI 초기화 → Claude 교체 완료");
    } else {
      console.warn("⚠️  process-gmail: OpenAI 초기화 패턴을 찾지 못했습니다.");
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 패치 3+4: chat.completions.create → messages.create (두 라우트 모두)
// ──────────────────────────────────────────────────────────────────────────
// gpt-4o 호출 패턴을 순서대로 두 번 찾아서 교체
const gptCallPattern = /aiClient\.chat\.completions\.create\(\{[\s\S]*?model:\s*["']gpt-4o["'][\s\S]*?temperature:\s*0,\s*\n\s*max_tokens:\s*3000,\s*\n\s*\}\);[\s\S]*?response\.choices\[0\]\.message\.content\?\.trim\(\)\s*\|\|\s*"{}"/g;

let gptCount = 0;
code = code.replace(gptCallPattern, (match) => {
  gptCount++;
  const prefix = gptCount === 1 ? "parse-subcontract-email" : "process-gmail";
  // 들여쓰기 추출
  const indentMatch = match.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : "      ";
  return `aiClient.messages.create({
${indent}  model: "claude-3-5-haiku-20241022",
${indent}  system: systemPrompt,
${indent}  messages: [
${indent}    { role: "user", content: \`다음 하도급 업체 작업일정 이메일을 파싱해주세요:\\n\\n\${emailText.slice(0, 8000)}\` }
${indent}  ],
${indent}  temperature: 0,
${indent}  max_tokens: 3000,
${indent}});
${indent}console.log("[${prefix}] ✅ Claude 응답 완료, 파싱 중...");

${indent}const rawJson = (response.content[0] as any).text?.trim() || "{}"`;
});

if (gptCount > 0) {
  console.log(`✅ gpt-4o → claude-3-5-haiku 호출 교체: ${gptCount}곳`);
} else {
  // 좀더 간단한 패턴으로 재시도
  const simpleGptPattern = /model:\s*["']gpt-4o["']/g;
  const simpleCount = (code.match(simpleGptPattern) || []).length;
  if (simpleCount > 0) {
    // 개별 model 라인만 교체
    code = code.replace(/model:\s*["']gpt-4o["']/g, 'model: "claude-3-5-haiku-20241022"');
    // chat.completions.create → messages.create
    code = code.replace(/aiClient\.chat\.completions\.create/g, "aiClient.messages.create");
    // messages 배열에서 system role 제거하고 system 파라미터로 이동
    console.log(`✅ model: gpt-4o → claude-3-5-haiku 교체: ${simpleCount}곳 (간이 교체)`);
    console.log("⚠️  주의: messages 구조 변환은 수동으로 확인 필요할 수 있습니다.");
  } else {
    console.log("ℹ️  gpt-4o 패턴 없음 (이미 교체됐거나 다른 구조)");
  }
}

// ──────────────────────────────────────────────────────────────────────────
// system role → system 파라미터로 변환 (Claude API는 system 별도 파라미터)
// ──────────────────────────────────────────────────────────────────────────
const systemRolePattern = /messages:\s*\[\s*\{\s*role:\s*["']system["'],\s*content:\s*systemPrompt\s*\},\s*\{\s*role:\s*["']user["'],/g;
const systemCount = (code.match(systemRolePattern) || []).length;
if (systemCount > 0) {
  code = code.replace(systemRolePattern, `system: systemPrompt,
        messages: [
          { role: "user",`);
  console.log(`✅ system role → system 파라미터 변환: ${systemCount}곳`);
}

// response.choices[0].message.content → response.content[0].text
code = code.replace(/response\.choices\[0\]\.message\.content\?\.trim\(\)/g, "(response.content[0] as any).text?.trim()");

// ──────────────────────────────────────────────────────────────────────────
// 결과 저장
// ──────────────────────────────────────────────────────────────────────────
if (code !== original) {
  fs.writeFileSync(filePath, code, "utf8");
  console.log("\n🎉 패치 완료! 이제 빌드하세요:");
  console.log("   npm run build");
  console.log("   pm2 restart safetyboard --update-env");
  console.log("\n.env에 추가 필요:");
  console.log("   ANTHROPIC_API_KEY=sk-ant-...");
} else {
  console.log("\n⚠️  파일이 변경되지 않았습니다.");
  console.log("   현재 routes.ts에서 AI 코드를 수동으로 확인해주세요:");
  console.log("   - parse-subcontract-email 라우트 (~8200번째 줄)");
  console.log("   - process-gmail 라우트 (~8380번째 줄)");
  console.log("   gpt-4o → claude-3-5-haiku-20241022 으로 교체 필요");
}
