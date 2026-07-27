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

// ── 패치 1: parse-subcontract-email 라우트 OpenAI → Claude ──
const p1_old = `      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const systemPrompt`;
const p1_new = `      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const systemPrompt`;

if (code.includes(p1_old)) {
  code = code.replace(p1_old, p1_new);
  changed++;
  console.log("✅ 패치 1 완료: parse-subcontract-email 클라이언트 교체");
} else {
  // 이미 패치됐거나 코드가 다를 경우 확인
  if (code.includes('new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })')) {
    console.log("ℹ️  패치 1 이미 적용됨");
  } else {
    console.warn("⚠️  패치 1 실패: 대상 코드를 찾지 못했습니다 (parse-subcontract-email 클라이언트)");
  }
}

// ── 패치 2: parse-subcontract-email API 호출 부분 ──
const p2_old = `      const response = await aiClient.chat.completions.create({
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
      }`;
const p2_new = `      const response = await aiClient.messages.create({
        model: "claude-3-5-haiku-20241022",
        system: systemPrompt,
        messages: [
          { role: "user", content: \`다음 하도급 업체 작업일정 이메일을 파싱해주세요:\\n\\n\${emailText.slice(0, 8000)}\` }
        ],
        temperature: 0,
        max_tokens: 3000,
      });

      const rawJson = (response.content[0] as any).text?.trim() || "{}";
      let parsed: any = {};
      try {
        const cleaned = rawJson.replace(/\`\`\`json\\n?/g, "").replace(/\`\`\`\\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(500).json({ message: "AI 파싱에 실패했습니다. .eml 파일 형식을 확인해주세요." });
      }`;

if (code.includes(p2_old)) {
  code = code.replace(p2_old, p2_new);
  changed++;
  console.log("✅ 패치 2 완료: parse-subcontract-email API 호출 교체");
} else {
  if (code.includes("claude-3-5-haiku-20241022")) {
    console.log("ℹ️  패치 2 이미 적용됨");
  } else {
    console.warn("⚠️  패치 2 실패: 대상 코드를 찾지 못했습니다 (parse-subcontract-email API)");
  }
}

// ── 패치 3: process-gmail 라우트 OpenAI → Claude 클라이언트 ──
// process-gmail 라우트는 IMAP 연결 코드 뒤에 OpenAI 초기화가 나옴
const p3_old = `      if (!rawBuffer) return res.status(404).json({ message: "이메일을 찾을 수 없습니다." });

      const emailText = extractEmlText(rawBuffer);
      if (!emailText || emailText.trim().length < 20) {
        return res.status(400).json({ message: "이메일 내용을 추출할 수 없습니다." });
      }

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });`;
const p3_new = `      if (!rawBuffer) return res.status(404).json({ message: "이메일을 찾을 수 없습니다." });

      const emailText = extractEmlText(rawBuffer);
      if (!emailText || emailText.trim().length < 20) {
        return res.status(400).json({ message: "이메일 내용을 추출할 수 없습니다." });
      }

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });`;

if (code.includes(p3_old)) {
  code = code.replace(p3_old, p3_new);
  changed++;
  console.log("✅ 패치 3 완료: process-gmail 클라이언트 교체");
} else {
  console.log("ℹ️  패치 3 이미 적용됐거나 코드 패턴이 다름 (process-gmail 클라이언트)");
}

// ── 패치 4: process-gmail API 호출 부분 ──
const p4_old = `      const response = await aiClient.chat.completions.create({
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
      }`;
const p4_new = `      const response = await aiClient.messages.create({
        model: "claude-3-5-haiku-20241022",
        system: systemPrompt,
        messages: [
          { role: "user", content: \`다음 하도급 업체 작업일정 이메일을 파싱해주세요:\\n\\n\${emailText.slice(0, 8000)}\` }
        ],
        temperature: 0,
        max_tokens: 3000,
      });

      const rawJson = (response.content[0] as any).text?.trim() || "{}";
      let parsed: any = {};
      try {
        const cleaned = rawJson.replace(/\`\`\`json\\n?/g, "").replace(/\`\`\`\\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return res.status(500).json({ message: "AI 파싱에 실패했습니다." });
      }`;

if (code.includes(p4_old)) {
  code = code.replace(p4_old, p4_new);
  changed++;
  console.log("✅ 패치 4 완료: process-gmail API 호출 교체");
} else {
  console.log("ℹ️  패치 4 이미 적용됐거나 코드 패턴이 다름 (process-gmail API)");
}

if (changed > 0) {
  fs.writeFileSync(filePath, code, "utf8");
  console.log(`\n🎉 총 ${changed}곳 패치 완료. 이제 빌드하세요:`);
  console.log("   npm run build");
  console.log("   pm2 restart safetyboard --update-env");
} else {
  console.log("\n⚠️  변경된 곳이 없습니다. 이미 모두 적용됐거나 코드 패턴이 달라요.");
  console.log("   routes.ts에서 'gpt-4o' 검색해서 수동으로 확인하세요.");
}
