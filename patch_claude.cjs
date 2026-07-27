// Windows 노트북에서 실행: node patch_claude.cjs
// 사전 준비: git checkout HEAD -- server/routes.ts  (복구 먼저!)
// 그 다음 이 스크립트 실행
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "server", "routes.ts");
if (!fs.existsSync(filePath)) {
  console.error("❌ server/routes.ts 없음. C:\\SafeBoard 폴더에서 실행하세요.");
  process.exit(1);
}

let code = fs.readFileSync(filePath, "utf8");

// ── 이미 Claude로 적용됐는지 확인 ──
if (code.includes("claude-3-5-haiku-20241022")) {
  console.log("✅ 이미 Claude가 적용됐습니다. 빌드하세요:");
  console.log("   npm run build && pm2 restart safetyboard --update-env");
  process.exit(0);
}

const lines = code.split("\n");
let changed = 0;

// ── parse-subcontract-email 라우트 위치 찾기 ──
const ps_idx = lines.findIndex(l => l.includes("parse-subcontract-email"));
// ── process-gmail 라우트 위치 찾기 ──
const pg_idx = lines.findIndex((l, i) => i > ps_idx && l.includes("process-gmail"));

console.log(`parse-subcontract-email 라우트: ${ps_idx + 1}번째 줄`);
console.log(`process-gmail 라우트: ${pg_idx + 1}번째 줄`);

if (ps_idx === -1 || pg_idx === -1) {
  console.error("❌ 라우트를 찾지 못했습니다. routes.ts 파일을 확인하세요.");
  process.exit(1);
}

// ── 두 라우트의 범위 설정 ──
// parse-subcontract: ps_idx ~ pg_idx
// process-gmail: pg_idx ~ pg_idx+300
const ranges = [
  { name: "parse-subcontract-email", start: ps_idx, end: pg_idx },
  { name: "process-gmail", start: pg_idx, end: Math.min(pg_idx + 400, lines.length) },
];

for (const range of ranges) {
  const section = lines.slice(range.start, range.end);
  let sectionChanged = false;

  // 1) OpenAI import 라인 찾아서 Anthropic으로 교체
  for (let i = 0; i < section.length; i++) {
    if (section[i].includes('import("openai")') && section[i].includes("OpenAI")) {
      // 이 줄부터 new OpenAI({ ... }); 블록 끝까지 찾기
      const startI = i;
      let endI = i;
      // new OpenAI({...}) 의 닫힘 }); 찾기
      for (let j = i; j < Math.min(i + 10, section.length); j++) {
        if (section[j].includes("});") || (section[j].includes("}") && section[j].includes(")"))) {
          endI = j;
          break;
        }
      }
      // 들여쓰기 추출
      const indent = section[startI].match(/^(\s*)/)[1];
      // 교체 블록 생성
      const replacementLines = [
        `${indent}const Anthropic = (await import("@anthropic-ai/sdk")).default;`,
        `${indent}const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });`,
        `${indent}console.log("[${range.name}] 🤖 Claude API 호출 시작 (claude-3-5-haiku-20241022)");`,
      ];
      section.splice(startI, endI - startI + 1, ...replacementLines);
      console.log(`✅ [${range.name}] OpenAI 초기화 → Claude 교체 (${startI + range.start + 1}번째 줄)`);
      changed++;
      sectionChanged = true;
      break;
    }
  }

  // 2) chat.completions.create → messages.create
  for (let i = 0; i < section.length; i++) {
    if (section[i].includes("chat.completions.create")) {
      section[i] = section[i].replace("chat.completions.create", "messages.create");
      console.log(`✅ [${range.name}] chat.completions.create → messages.create`);
      changed++;
      break;
    }
  }

  // 3) model: "gpt-4o" → claude
  for (let i = 0; i < section.length; i++) {
    if (section[i].includes('"gpt-4o"') || section[i].includes("'gpt-4o'")) {
      section[i] = section[i].replace(/"gpt-4o"/, '"claude-3-5-haiku-20241022"')
                              .replace(/'gpt-4o'/, '"claude-3-5-haiku-20241022"');
      console.log(`✅ [${range.name}] model gpt-4o → claude-3-5-haiku-20241022`);
      changed++;
      break;
    }
  }

  // 4) { role: "system", content: systemPrompt } → system 파라미터로
  for (let i = 0; i < section.length; i++) {
    if (section[i].includes('role: "system"') && section[i + 1] && section[i + 1].includes("systemPrompt")) {
      // system role 라인과 닫는 }, 제거하고 system: systemPrompt 추가
      const indent = section[i].match(/^(\s*)/)[1];
      // { role: "system", content: systemPrompt }, 라인 제거
      section.splice(i, 1);
      // messages: [ 바로 위에 system: systemPrompt, 추가
      const msgIdx = section.findIndex((l, j) => j >= i - 2 && l.includes("messages:"));
      if (msgIdx !== -1) {
        const msgIndent = section[msgIdx].match(/^(\s*)/)[1];
        section.splice(msgIdx, 0, `${msgIndent}system: systemPrompt,`);
        console.log(`✅ [${range.name}] system role → system 파라미터로 변환`);
        changed++;
      }
      break;
    }
    // 한 줄에 { role: "system", content: systemPrompt } 형태
    if (section[i].includes('{ role: "system", content: systemPrompt }')) {
      section.splice(i, 1);
      const msgIdx = section.findIndex((l, j) => j >= i - 2 && l.includes("messages:"));
      if (msgIdx !== -1) {
        const msgIndent = section[msgIdx].match(/^(\s*)/)[1];
        section.splice(msgIdx, 0, `${msgIndent}system: systemPrompt,`);
        console.log(`✅ [${range.name}] system role → system 파라미터로 변환`);
        changed++;
      }
      break;
    }
  }

  // 5) response.choices[0].message.content → response.content[0].text
  for (let i = 0; i < section.length; i++) {
    if (section[i].includes("response.choices[0].message.content")) {
      section[i] = section[i].replace(
        "response.choices[0].message.content?.trim()",
        "(response.content[0] as any).text?.trim()"
      );
      // console.log 추가
      const indent = section[i].match(/^(\s*)/)[1];
      section.splice(i, 0, `${indent}console.log("[${range.name}] ✅ Claude 응답 완료");`);
      console.log(`✅ [${range.name}] response 구조 변환`);
      changed++;
      break;
    }
  }

  // 변경된 section을 원본 배열에 반영
  lines.splice(range.start, range.end - range.start, ...section);
}

if (changed > 0) {
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  console.log(`\n🎉 총 ${changed}개 패치 완료!`);
  console.log("\n다음 순서로 진행:");
  console.log("  1. .env에 추가: ANTHROPIC_API_KEY=sk-ant-...");
  console.log("  2. npm run build");
  console.log("  3. pm2 restart safetyboard --update-env");
  console.log("  4. pm2 logs safetyboard --lines 20  ← Claude 로그 확인");
} else {
  console.log("\n⚠️  변경 없음. routes.ts를 수동으로 확인하세요.");
}
