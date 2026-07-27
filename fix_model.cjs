// node fix_model.cjs
const fs = require("fs");
const p = require("path").join(__dirname, "server", "routes.ts");
let c = fs.readFileSync(p, "utf8");
const count = (c.match(/claude-3-5-haiku-20241022/g) || []).length;
c = c.replace(/claude-3-5-haiku-20241022/g, "claude-3-haiku-20240307");
fs.writeFileSync(p, c);
console.log(`✅ 모델 교체 완료: ${count}곳 → claude-3-haiku-20240307`);
console.log("npm run build && pm2 restart safetyboard --update-env");
