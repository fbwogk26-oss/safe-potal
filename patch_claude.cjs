// Windows 노트북에서 실행: node patch_claude.cjs
// C:\SafeBoard 폴더에 이 파일 복사 후 실행
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "server", "routes.ts");
if (!fs.existsSync(filePath)) {
  console.error("❌ server/routes.ts 파일을 찾을 수 없습니다. C:\\SafeBoard 폴더에서 실행하세요.");
  process.exit(1);
}

let code = fs.readFileSync(filePath, "utf8");
let changed = 0;

// ── OpenAI 클라이언트 초기화 → Anthropic 교체 (두 라우트 공통) ──
// parse-subcontract-email 과 process-gmail 모두 같은 패턴 사용
const OLD_CLIENT = `const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });`;

// 두 라우트에 각각 다른 로그 prefix를 주기 위해 occurrence 순서로 교체
const ROUTES = [
  { prefix: "parse-subcontract-email", newClient: `const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      console.log("[parse-subcontract-email] 🤖 Claude API 호출 시작 (claude-3-5-haiku-20241022)");` },
  { prefix: "process-gmail", newClient: `const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      console.log("[process-gmail] 🤖 Claude API 호출 시작 (claude-3-5-haiku-20241022)");` },
];

for (const route of ROUTES) {
  if (code.includes(OLD_CLIENT)) {
    code = code.replace(OLD_CLIENT, route.newClient);
    changed++;
    console.log(`✅ [${route.prefix}] 클라이언트 교체 완료`);
  } else if (code.includes("new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })")) {
    console.log(`ℹ️  [${route.prefix}] 이미 Claude로 교체됨`);
  } else {
    console.warn(`⚠️  [${route.prefix}] 클라이언트 패턴을 찾지 못했습니다`);
  }
}

// ── gpt-4o chat.completions.create → claude messages.create 교체 ──
// catch 메시지가 두 라우트에서 다르므로 각각 교체
const COMPLETIONS = [
  {
    old: `const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: \`다음 하도급 업체 작업일정 이메일을 파싱해주세요:\\n\\n\${emailText.slice(0, 8000)}\` }
        ],
        temperature: 0,
        max_tokens: 3000,
      });

      const rawJson = response.choices[0].message.content?.trim() || "{}";
      let parsed: any = {};
      try {
        const cleaned = rawJson.replace(/\`\`\`json\\n?/g, "").replace(/\`\`\`\\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(500).json({ message: "AI 파싱에 실패했습니다. .eml 파일 형식을 확인해주세요." });
      }`,
    new: `const response = await aiClient.messages.create({
        model: "claude-3-5-haiku-20241022",
        system: systemPrompt,
        messages: [
          { role: "user", content: \`다음 하도급 업체 작업일정 이메일을 파싱해주세요:\\n\\n\${emailText.slice(0, 8000)}\` }
        ],
        temperature: 0,
        max_tokens: 3000,
      });
      console.log("[parse-subcontract-email] ✅ Claude 응답 완료, 파싱 중...");

      const rawJson = (response.content[0] as any).text?.trim() || "{}";
      let parsed: any = {};
      try {
        const cleaned = rawJson.replace(/\`\`\`json\\n?/g, "").replace(/\`\`\`\\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(500).json({ message: "AI 파싱에 실패했습니다. .eml 파일 형식을 확인해주세요." });
      }`,
    label: "parse-subcontract-email API 호출",
  },
  {
    old: `const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: \`다음 하도급 업체 작업일정 이메일을 파싱해주세요:\\n\\n\${emailText.slice(0, 8000)}\` }
        ],
        temperature: 0,
        max_tokens: 3000,
      });

      const rawJson = response.choices[0].message.content?.trim() || "{}";
      let parsed: any = {};
      try {
        const cleaned = rawJson.replace(/\`\`\`json\\n?/g, "").replace(/\`\`\`\\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(500).json({ message: "AI 파싱에 실패했습니다." });
      }`,
    new: `const response = await aiClient.messages.create({
        model: "claude-3-5-haiku-20241022",
        system: systemPrompt,
        messages: [
          { role: "user", content: \`다음 하도급 업체 작업일정 이메일을 파싱해주세요:\\n\\n\${emailText.slice(0, 8000)}\` }
        ],
        temperature: 0,
        max_tokens: 3000,
      });
      console.log("[process-gmail] ✅ Claude 응답 완료, 파싱 중...");

      const rawJson = (response.content[0] as any).text?.trim() || "{}";
      let parsed: any = {};
      try {
        const cleaned = rawJson.replace(/\`\`\`json\\n?/g, "").replace(/\`\`\`\\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(500).json({ message: "AI 파싱에 실패했습니다." });
      }`,
    label: "process-gmail API 호출",
  },
];

for (const item of COMPLETIONS) {
  if (code.includes(item.old)) {
    code = code.replace(item.old, item.new);
    changed++;
    console.log(`✅ [${item.label}] 교체 완료`);
  } else if (code.includes("claude-3-5-haiku-20241022")) {
    console.log(`ℹ️  [${item.label}] 이미 Claude로 교체됨`);
  } else {
    console.warn(`⚠️  [${item.label}] 패턴을 찾지 못했습니다`);
  }
}

if (changed > 0) {
  fs.writeFileSync(filePath, code, "utf8");
  console.log(`\n🎉 총 ${changed}곳 패치 완료!`);
  console.log("\n다음 명령어로 빌드 & 재시작:");
  console.log("  npm install @anthropic-ai/sdk --legacy-peer-deps");
  console.log("  npm run build");
  console.log("  pm2 restart safetyboard --update-env");
  console.log("\n.env 파일에 추가 필요:");
  console.log("  ANTHROPIC_API_KEY=sk-ant-...");
} else {
  console.log("\n✅ 이미 모두 적용됐습니다. 빌드만 하면 됩니다.");
  console.log("  npm run build && pm2 restart safetyboard --update-env");
}
