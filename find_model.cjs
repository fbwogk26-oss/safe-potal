// node find_model.cjs
// Anthropic 계정에서 실제 사용 가능한 모델 목록 확인
const https = require("https");
const fs = require("fs");
const path = require("path");

// .env에서 ANTHROPIC_API_KEY 읽기
let apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  try {
    const env = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    const match = env.match(/ANTHROPIC_API_KEY=(.+)/);
    if (match) apiKey = match[1].trim();
  } catch {}
}
if (!apiKey) {
  console.error("❌ ANTHROPIC_API_KEY를 찾을 수 없습니다. .env 파일을 확인하세요.");
  process.exit(1);
}

console.log(`🔑 API 키: ${apiKey.slice(0,12)}...${apiKey.slice(-4)}\n`);

// 후보 모델 목록 (최신 순)
const MODELS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-opus-4-0",
  "claude-sonnet-4-0",
  "claude-haiku-4-0",
  "claude-3-7-sonnet-20250219",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307",
  "claude-3-opus-20240229",
];

async function testModel(model) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model,
      max_tokens: 10,
      messages: [{ role: "user", content: "hi" }],
    });
    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200) resolve({ model, ok: true });
          else resolve({ model, ok: false, code: res.statusCode, msg: json?.error?.message || data });
        } catch {
          resolve({ model, ok: false, code: res.statusCode, msg: data });
        }
      });
    });
    req.on("error", e => resolve({ model, ok: false, msg: e.message }));
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log("⏳ 사용 가능한 모델 탐색 중...\n");
  const working = [];
  for (const model of MODELS) {
    const result = await testModel(model);
    if (result.ok) {
      console.log(`✅ 사용 가능: ${model}`);
      working.push(model);
    } else {
      const hint = result.code === 404 ? "없음" : result.code === 401 ? "키오류" : result.msg?.slice(0,60);
      console.log(`❌ ${model} → ${hint}`);
    }
  }

  if (working.length === 0) {
    console.log("\n⚠️  사용 가능한 모델이 없습니다.");
    console.log("→ console.anthropic.com에서 API 활성화 상태 확인하세요.");
  } else {
    const best = working[0];
    console.log(`\n🎯 추천 모델: ${best}`);
    console.log(`\nroutes.ts 자동 교체 중...`);
    const p = path.join(__dirname, "server", "routes.ts");
    if (fs.existsSync(p)) {
      let c = fs.readFileSync(p, "utf8");
      const OLD_MODELS = MODELS.filter(m => m !== best);
      let changed = 0;
      for (const old of OLD_MODELS) {
        if (c.includes(old)) {
          c = c.replace(new RegExp(old, "g"), best);
          changed++;
        }
      }
      fs.writeFileSync(p, c);
      if (changed > 0) {
        console.log(`✅ ${changed}곳을 ${best}로 교체 완료!`);
        console.log("\n빌드 & 재시작:");
        console.log("  npm run build");
        console.log("  pm2 restart safetyboard --update-env");
      } else {
        console.log(`ℹ️  이미 ${best} 사용 중이거나 교체할 항목 없음`);
      }
    }
  }
})();
