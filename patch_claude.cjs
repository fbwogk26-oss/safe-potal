// 노트북에서 실행: node patch_claude.cjs
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "server", "routes.ts");
let code = fs.readFileSync(filePath, "utf8");

const oldOpenAI = `      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });`;

const newClaude = `      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });`;

const oldCreate = `      const response = await aiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: \`다음 하도급 업체 작업일정 이메일을 파싱해주세요:\\n\\n\${emailText.slice(0, 8000)}\` }
        ],
        temperature: 0,
        max_tokens: 3000,
      });

      const rawJson = response.choices[0].message.content?.trim() || "{}";`;

const newCreate = `      const response = await aiClient.messages.create({
        model: "claude-3-5-haiku-20241022",
        system: systemPrompt,
        messages: [
          { role: "user", content: \`다음 하도급 업체 작업일정 이메일을 파싱해주세요:\\n\\n\${emailText.slice(0, 8000)}\` }
        ],
        temperature: 0,
        max_tokens: 3000,
      });

      const rawJson = (response.content[0]).text?.trim() || "{}";`;

const count1 = (code.match(new RegExp(oldOpenAI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const count2 = (code.match(new RegExp(oldCreate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

code = code.split(oldOpenAI).join(newClaude);
code = code.split(oldCreate).join(newCreate);

fs.writeFileSync(filePath, code, "utf8");
console.log(`✅ 패치 완료! OpenAI→Claude 교체: ${count1}곳, API 호출 교체: ${count2}곳`);
