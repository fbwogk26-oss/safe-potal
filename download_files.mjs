// Windows에서 실행: node download_files.mjs
// Object Storage 파일을 로컬 uploads 폴더에 내려받는 스크립트

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEV_SERVER = "https://235b0263-0b29-4162-bf1b-c8ec3151e476-00-w01xkt0hfop1.sisko.replit.dev";
const TOKEN = "161b67db2e0d26f98aa311561d73ab88153de0118217724d43851f94a9e10cce";
const UPLOADS_DIR = join(__dirname, "uploads");

const FILES = [
  "1775549995356-141585690.jpg",
  "1775550886380-536892625.jpeg",
  "1775551062558-613885449.jpg",
  "health-mgr-1775626581718.pdf",
  "health-mgr-1775627773018.pdf",
  "health-mgr-1775627791515.pdf",
  "health-mgr-1775629066275.pdf",
  "health-mgr-1775629418442.pdf",
  "safety-mgr-1775628765516.pdf",
  "safety-mgr-1775628797665.pdf",
  "safety-mgr-1775628815258.pdf",
  "safety-mgr-1775628832411.pdf",
  "safety-mgr-1775628849245.pdf",
  "safety-mgr-1775628867607.pdf",
  "safety-mgr-1775628909946.pdf",
  "safety-mgr-1775628928431.pdf",
  "safety-mgr-1775628967421.pdf",
];

if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log("uploads 폴더 생성:", UPLOADS_DIR);
}

let ok = 0, fail = 0;

for (const filename of FILES) {
  const dest = join(UPLOADS_DIR, filename);
  if (existsSync(dest)) {
    console.log(`⏭  이미 존재: ${filename}`);
    ok++;
    continue;
  }
  const url = `${DEV_SERVER}/api/file-proxy/${encodeURIComponent(filename)}?_fpt=${TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ ${filename} — HTTP ${res.status}`);
      fail++;
      continue;
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) {
      console.error(`❌ ${filename} — HTML 반환 (Replit 개발서버가 꺼져 있음)`);
      fail++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    console.log(`✅ ${filename} (${(buf.length / 1024).toFixed(1)} KB)`);
    ok++;
  } catch (e) {
    console.error(`❌ ${filename} — ${e.message}`);
    fail++;
  }
}

console.log(`\n완료: 성공 ${ok}개 / 실패 ${fail}개`);
if (fail > 0) {
  console.log("⚠️  실패한 파일은 Replit 개발서버가 켜져 있는지 확인 후 재시도하세요.");
}
