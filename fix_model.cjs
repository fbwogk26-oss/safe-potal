// node fix_model.cjs  — claude-opus-4-5 → claude-haiku-4-5 교체 (비용 절감)
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "server", "routes.ts");
let c = fs.readFileSync(p, "utf8");
const before = (c.match(/claude-opus-4-5/g) || []).length;
const before2 = (c.match(/claude-sonnet-4-5/g) || []).length;
c = c.replace(/claude-opus-4-5/g, "claude-haiku-4-5");
c = c.replace(/claude-sonnet-4-5/g, "claude-haiku-4-5");
fs.writeFileSync(p, c);
console.log(`✅ claude-opus-4-5(${before}곳) + claude-sonnet-4-5(${before2}곳) → claude-haiku-4-5 교체 완료`);
console.log("\n빌드 & 재시작:");
console.log("  npm run build && pm2 restart safetyboard --update-env");
